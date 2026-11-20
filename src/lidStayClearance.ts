import { Euler, Matrix4, Vector3 } from "three";
import type { LidStayFit } from "./lidStayFitSchema";
import type { Piece, Project, V3 } from "./model";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
  transformCollisionSolid,
  type CollisionSolid,
} from "./solidCollision";

const radians = Math.PI / 180;
export const stayClearanceStep = 0.5;
const tolerance = 1e-5;
const arms = [0, 1] as const;

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
  kind: "arm-contact";
  hitIds: string[];
};

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
    return prepareCollisionSolid(piece);
  } catch {
    return null;
  }
}

/** The measured pin-to-pin rectangles are sampled against retained solids. */
export function reviewStayClearance(
  project: Project,
  fit: LidStayFit,
  closed: { piece: Piece; pivot: V3; axis: V3 },
  fixedPin: Vector3,
  linkagePoints: (angle: number) => V3[],
) {
  const dimensions = fit.armEnvelopes;
  if (!dimensions) return null;
  const axis = new Vector3(...closed.axis).normalize();
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
    const solid = reviewableSolid(piece);
    if (
      !solid ||
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
  function movingLid(angle: number): CollisionSolid | null {
    if (!lid || !angle) return lid;
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

  function preview(angle: number): StayArmPreview[] {
    const points = linkagePoints(angle);
    if (points.length !== 3) return [];
    const lidSolid = movingLid(angle);
    const obstacles = lidSolid
      ? [...fixed, { id: closed.piece.id, solid: lidSolid }]
      : fixed;
    return arms.map((index) => {
      const { width, thickness } = dimensions![index];
      const pose = armPose(
        points[index],
        points[index + 1],
        axis,
        width,
        thickness,
      );
      const box = prepareCollisionBox(pose.size, pose.position, pose.rotation);
      return {
        ...pose,
        hitIds: obstacles
          .filter(({ solid }) => solidOverlap(box, solid, tolerance))
          .map(({ id }) => id),
      };
    });
  }

  function playbackLimit(from: number, to: number): StayArmContact | null {
    const direction = Math.sign(to - from);
    const step = direction * stayClearanceStep;
    const hitIdsAt = (angle: number) => [
      ...new Set(preview(angle).flatMap(({ hitIds }) => hitIds)),
    ];
    let clear = from;
    let angle = from;
    while (true) {
      let hitIds = hitIdsAt(angle);
      if (hitIds.length) {
        let blocked = angle;
        while (Math.abs(blocked - clear) > 0.001) {
          const mid = (clear + blocked) / 2;
          const ids = hitIdsAt(mid);
          if (ids.length) {
            blocked = mid;
            hitIds = ids;
          } else clear = mid;
        }
        return {
          travel: clear,
          inspectAt: blocked,
          id: fit.id,
          kind: "arm-contact" as const,
          hitIds,
        };
      }
      if (angle === to) return null;
      clear = angle;
      angle = direction * (angle + step - to) >= 0 ? to : angle + step;
    }
  }

  return { preview, playbackLimit };
}
