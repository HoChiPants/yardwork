import { Euler, Matrix4, Vector3 } from "three";
import type { LidStayFit } from "./lidStayFitSchema";
import type { Piece, Project, V3 } from "./model";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
  swingSeparated,
  transformCollisionSolid,
  type CollisionSolid,
} from "./solidCollision";

const radians = Math.PI / 180;
const tolerance = 1e-5;
const angularResolution = 0.0001;
const witnessWindow = 0.0008;
const intervalBudget = 8192;
const arms = [0, 1] as const;
const chord = (radius: number, angle: number) => 2 * radius * Math.sin(Math.min(Math.PI, Math.abs(angle)) / 2);

export type StayArmPreview = {
  position: V3;
  rotation: V3;
  size: V3;
  hitIds: string[];
};
export type StayArmContact = {
  travel: number;
  inspectAt: number;
  id: string;
  kind: "arm-contact" | "arm-unresolved";
  hitIds: string[];
};

type SweepBound = { pinTravel: number; angles: [number, number] };
type Obstacle = { id: string; solid: CollisionSolid; moving?: boolean };

function armPose(
  start: V3,
  end: V3,
  axis: Vector3,
  width: number,
  thickness: number,
): Omit<StayArmPreview, "hitIds"> {
  const origin = new Vector3(...start),
    tip = new Vector3(...end);
  const delta = tip.clone().sub(origin);
  const along = delta.clone().normalize();
  const cross = axis.clone().cross(along).normalize();
  const normal = along.clone().cross(cross);
  const orientation = new Euler().setFromRotationMatrix(
    new Matrix4().makeBasis(along, cross, normal),
  );
  return {
    position: origin.lerp(tip, 0.5).toArray(),
    rotation: [orientation.x, orientation.y, orientation.z],
    size: [delta.length(), width, thickness],
  };
}

function reviewableSolid(piece: Piece) {
  try {
    return prepareCollisionSolid(piece) ?? prepareCollisionBox(piece.size, piece.position, piece.rotation);
  } catch {
    return prepareCollisionBox(piece.size, piece.position, piece.rotation);
  }
}

/** Compare the arm bodies over the full interval of their planar linkage. */
export function reviewStayClearance(
  project: Project,
  fit: LidStayFit,
  closed: { piece: Piece; pivot: V3; axis: V3 },
  fixedPin: Vector3,
  linkagePoints: (angle: number) => V3[],
  bound: (from: number, to: number, middleDistance: number) => SweepBound,
) {
  if (!fit.armEnvelopes) return null;
  const dimensions = fit.armEnvelopes;
  const axis = new Vector3(...closed.axis).normalize();
  const axisVector = axis.toArray();
  const pivot = new Vector3(...closed.pivot);
  const reach =
    fit.fixedArm +
    fit.lidArm +
    Math.max(
      ...dimensions.map(
        ({ width, thickness }) => Math.hypot(width, thickness) / 2,
      ),
    );
  const slice =
    Math.max(...dimensions.map(({ thickness }) => thickness / 2)) + tolerance;
  const fixed = project.pieces.flatMap((piece) => {
    if (piece.offcut || piece.id === closed.piece.id) return [];
    const blankRadius = Math.hypot(...piece.size) / 2;
    if (new Vector3(...piece.position).distanceTo(fixedPin) > reach + blankRadius + tolerance)
      return [];
    const solid = reviewableSolid(piece);
    if (
      solid.bounds.min.some(
        (value, i) => value > fixedPin.getComponent(i) + reach,
      ) ||
      solid.bounds.max.some(
        (value, i) => value < fixedPin.getComponent(i) - reach,
      )
    )
      return [];
    const axial = solid.vertices.map((point) =>
      new Vector3(...point).sub(fixedPin).dot(axis),
    );
    return Math.min(...axial) > slice || Math.max(...axial) < -slice
      ? []
      : [{ id: piece.id, solid }];
  });
  const lid = reviewableSolid(closed.piece);
  const lidRadius = Math.max(...lid.vertices.map((point) =>
    new Vector3(...point).sub(pivot).cross(axis).length()));
  const armRadii = [fit.fixedArm, fit.lidArm].map((length, i) => Math.hypot(length, dimensions[i].width / 2));
  const obstacles: Obstacle[] = [...fixed, { id: closed.piece.id, solid: lid, moving: true }];

  function movingLid(angle: number): CollisionSolid {
    if (!angle) return lid;
    const rotate = (point: V3) =>
      new Vector3(...point).applyAxisAngle(axis, -angle * radians);
    return transformCollisionSolid(
      lid,
      (point) =>
        new Vector3(...point)
          .sub(pivot)
          .applyAxisAngle(axis, -angle * radians)
          .add(pivot)
          .toArray(),
      (direction) => rotate(direction).toArray(),
    );
  }

  function at(angle: number) {
    const points = linkagePoints(angle);
    if (points.length !== 3) return null;
    const lidSolid = movingLid(angle);
    const bodies = arms.map((index) => {
      const { width, thickness } = dimensions[index];
      const pose = armPose(
        points[index],
        points[index + 1],
        axis,
        width,
        thickness,
      );
      const box = prepareCollisionBox(pose.size, pose.position, pose.rotation);
      return { pose, box };
    });
    return { lidSolid, bodies, distance: new Vector3(...points[0]).distanceTo(new Vector3(...points[2])) };
  }

  function preview(angle: number): StayArmPreview[] {
    const state = at(angle);
    return state?.bodies.map(({ pose, box }) => ({
      ...pose,
      hitIds: obstacles.filter((obstacle) =>
        obstacle.solid.kind === "solid" && solidOverlap(box, obstacle.moving ? state.lidSolid : obstacle.solid, tolerance))
        .map(({ id }) => id),
    })) ?? [];
  }

  function playbackLimit(from: number, to: number): StayArmContact | null {
    const pairs = arms.flatMap((index) => obstacles.map((obstacle) => ({ index, obstacle })));
    const poses = new Map<number, ReturnType<typeof at>>();
    let work = 0;
    let unresolved: StayArmContact | null = null;
    const sample = (angle: number) => {
      if (!poses.has(angle)) poses.set(angle, at(angle));
      return poses.get(angle) ?? null;
    };
    function search(start: number, end: number, candidates: typeof pairs): StayArmContact | null {
      if (++work > intervalBudget || (unresolved && Math.abs(start - unresolved.travel) > witnessWindow))
        return unresolved ?? { travel: start, inspectAt: (start + end) / 2, id: fit.id,
          kind: "arm-unresolved", hitIds: [...new Set(candidates.map(({ obstacle }) => obstacle.id))] };
      const middle = (start + end) / 2;
      const state = sample(middle);
      const halfAngle = Math.abs(end - start) * radians / 2;
      const lidTravel = chord(lidRadius, halfAngle);
      const pending = state ? (() => {
        const { pinTravel, angles } = bound(start, end, state.distance);
        const travel = [chord(armRadii[0], angles[0]), pinTravel + chord(armRadii[1], angles[1])];
        return candidates.filter(({ index, obstacle }) => !swingSeparated(state.bodies[index].box,
          obstacle.moving ? state.lidSolid : obstacle.solid, axisVector,
          travel[index] + (obstacle.moving ? lidTravel : 0), tolerance));
      })() : candidates;
      if (!pending.length) return null;
      if (Math.abs(end - start) > angularResolution)
        return search(start, middle, pending) ?? search(middle, end, pending);
      for (const angle of [start, middle, end]) {
        const pose = sample(angle);
        if (!pose) continue;
        const hitIds = [...new Set(pending.filter(({ index, obstacle }) =>
          obstacle.solid.kind === "solid" && solidOverlap(pose.bodies[index].box,
            obstacle.moving ? pose.lidSolid : obstacle.solid, tolerance))
          .map(({ obstacle }) => obstacle.id))];
        if (hitIds.length) {
          if (unresolved?.hitIds.some((id) => !hitIds.includes(id))) return unresolved;
          return { travel: unresolved?.travel ?? start, inspectAt: angle, id: fit.id, kind: "arm-contact", hitIds };
        }
      }
      unresolved ??= { travel: start, inspectAt: middle, id: fit.id, kind: "arm-unresolved",
        hitIds: [...new Set(pending.map(({ obstacle }) => obstacle.id))] };
      return null;
    }
    return search(from, to, pairs) ?? unresolved;
  }
  return { preview, playbackLimit };
}
