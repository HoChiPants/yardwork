import { cutKerf, inspectCutStock } from "./cutStock";
import { faceContactPatch, retainedWoodFaces } from "./connectionContacts";
import { cutPiece } from "./engine";
import { greenhouseBaseRailRoles } from "./greenhouseBaseReference";
import {
  cedarDoorStop,
  greenhouseDoorStopRoles,
  isGreenhouseDoorStop,
} from "./greenhouseDoorReference";
import {
  greenhouseDoorGeometry,
  greenhouseDoorReview,
} from "./greenhouseDoors";
import { reviewMotion } from "./mechanismMotion";
import { formatPreciseInches as inches } from "./measurement";
import {
  material,
  part,
  projectSchema,
  type Piece,
  type Project,
  type V3,
} from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";

const tolerance = 1e-6;
const positions = ["left", "right", "head"] as const;
type StopPosition = (typeof positions)[number];
const stopName = {
  left: "Left jamb stop",
  right: "Right jamb stop",
  head: "Head stop",
};
const faceNormal: Record<StopPosition, V3> = {
  left: [-1, 0, 0],
  right: [1, 0, 0],
  head: [0, 1, 0],
};
type DoorShape = ReturnType<typeof greenhouseDoorGeometry>;
export const doorStopScope =
  "Dry-fit with the closed wood leaf. Verify fasteners, weatherstrip compression, drainage at the sill, latch and usable opening on site.";

function rearPlane(shape: DoorShape) {
  const depths = shape.leafMembers.map(
    (piece) => shape.localBounds(piece).min[2],
  );
  if (
    !depths.length ||
    shape.leafMembers.some((piece) => !material(piece.material).wood) ||
    Math.max(...depths) - Math.min(...depths) > tolerance
  )
    throw Error(
      "Bring the back faces of the wood leaf into one plane before fitting stops.",
    );
  return depths[0];
}

function doorSillTop(project: Project, shape: DoorShape) {
  const baseId = shape.entry.sections.find(
    ({ role }) => role === "base-framing",
  )?.sectionId;
  const base = project.sections.find(({ id }) => id === baseId);
  const sill = project.pieces.find(
    (piece) =>
      !piece.offcut &&
      piece.designRole === greenhouseBaseRailRoles.front &&
      base?.pieceIds.includes(piece.id),
  );
  return sill ? shape.localBounds(sill).max[1] : null;
}

function supportedStop(shape: DoorShape, position: StopPosition, piece: Piece) {
  const normal = rotate(faceNormal[position], shape.opening.rotation);
  const face = retainedWoodFaces(piece).find(
    ({ normal: actual }) =>
      Math.hypot(...actual.map((value, axis) => value - normal[axis])) <=
      tolerance,
  );
  const axis = position === "head" ? 0 : 1;
  const inverse = inverseRotation(shape.opening.rotation);
  const patches = face
    ? shape.fixed
        .filter((fixed) => material(fixed.material).wood)
        .flatMap((fixed) =>
          retainedWoodFaces(fixed).flatMap(
            (candidate) => faceContactPatch(face, candidate) ?? [],
          ),
        )
    : [];
  const spans = patches.flatMap(({ outline, area }) => {
    const points = outline.map((point) => rotate(point, inverse));
    const along = points.map((point) => point[axis]);
    const depths = points.map((point) => point[2]);
    const start = Math.min(...along),
      finish = Math.max(...along);
    const depth = Math.max(...depths) - Math.min(...depths);
    return Math.abs(area - depth * (finish - start)) <=
      tolerance * Math.max(1, area)
      ? [{ start, finish, depth }]
      : [];
  });
  const boundaries = [
    ...new Set(spans.flatMap(({ start, finish }) => [start, finish])),
  ].sort((a, b) => a - b);
  let covered = 0;
  let backingDepth = Infinity;
  for (const [index, start] of boundaries.slice(0, -1).entries()) {
    const finish = boundaries[index + 1];
    const middle = (start + finish) / 2;
    const width = Math.max(
      0,
      ...spans
        .filter((span) => span.start <= middle && span.finish >= middle)
        .map(({ depth }) => depth),
    );
    if (width > tolerance) {
      covered += finish - start;
      backingDepth = Math.min(backingDepth, width);
    }
  }
  const bounds = shape.localBounds(piece);
  const length = bounds.max[axis] - bounds.min[axis];
  return {
    length,
    covered,
    backingDepth: Number.isFinite(backingDepth) ? backingDepth : 0,
    gap: rearPlane(shape) - bounds.max[2],
  };
}

function solidFor(piece: Piece) {
  return (
    prepareCollisionSolid(piece) ??
    prepareCollisionSolid({ ...piece, material: "stud", cutPlanes: [] })!
  );
}

export function previewGreenhouseDoorStops(
  project: Project,
  plan: MotionPlan,
  settings: { sealGap: number; sillGap: number; reuse: boolean },
) {
  const setup =
    plan.mechanism.kind === "hinge" ? plan.mechanism.greenhouseDoor : null;
  if (!setup) throw Error("Choose a saved greenhouse door swing.");
  const review = greenhouseDoorReview(project, plan);
  if (review?.warning) throw Error(review.warning);
  const { sealGap, sillGap, reuse } = settings;
  if (
    !Number.isFinite(sealGap) ||
    sealGap < 0 ||
    sealGap > 0.5 ||
    !Number.isFinite(sillGap) ||
    sillGap < 0 ||
    sillGap > 3
  )
    throw Error(
      "Enter a seal gap from 0 to ½ in and a sill setback from 0 to 3 in.",
    );
  const shape = greenhouseDoorGeometry(project, setup.entryId);
  if (
    project.pieces.some(
      ({ id, designRole, offcut }) =>
        !offcut &&
        isGreenhouseDoorStop(designRole) &&
        shape.opening.pieceIds.includes(id),
    )
  )
    throw Error(
      "This opening already has fitted stops. Edit the existing parts in the workspace.",
    );
  const left = shape.jambs.left?.max[0];
  const right = shape.jambs.right?.min[0];
  if (left === undefined || right === undefined)
    throw Error("Restore continuous fixed jambs around the closed door.");
  const header = shape.openingMembers
    .filter(
      ({ min, max }) =>
        min[0] <= left + tolerance &&
        max[0] >= right - tolerance &&
        min[1] >= shape.top - tolerance,
    )
    .sort((a, b) => a.min[1] - b.min[1])[0];
  const sillTop = doorSillTop(project, shape);
  if (!header || sillTop === null)
    throw Error("Restore the modeled header and front sill rail.");
  const [thickness, stockLength, depth] = cedarDoorStop.size;
  const headY = header.min[1] - thickness / 2;
  const sideTop = header.min[1] - thickness;
  const sideBottom = sillTop + sillGap;
  const z = rearPlane(shape) - sealGap - depth / 2;
  const sideLength = sideTop - sideBottom;
  const width = right - left;
  if (
    Math.min(sideLength, width) <= tolerance ||
    Math.max(sideLength, width) > stockLength + tolerance
  )
    throw Error(
      "Each stop must fit one 8 ft board. Review the opening and sill gap.",
    );
  // Require the head strip to project into the wood leaf perimeter at closure.
  if (
    sideTop >= shape.top - tolerance ||
    (shape.gaps &&
      Math.max(shape.gaps.left, shape.gaps.right) >= thickness - tolerance)
  )
    throw Error(
      "The stop strips do not reach the closed wood leaf. Review the opening and leaf gaps.",
    );
  const first = shape.fixed[0];
  const { rotation, origin } = shape.opening;
  const toWorld = (point: V3) =>
    rotate(point, rotation).map((value, axis) => value + origin[axis]) as V3;
  const solids = project.pieces.filter((piece) => !piece.offcut).map(solidFor);
  const lineage = reuse ? inspectCutStock(project).valid : new Set<string>();
  const stopIds: string[] = [];
  let next = project;
  const rows = positions.map((position) => {
    const head = position === "head";
    const length = head ? width : sideLength;
    const jointRotation = head
      ? composeRotation(rotation, [0, 0, -Math.PI / 2])
      : rotation;
    const x =
      position === "left"
        ? left + thickness / 2
        : position === "right"
          ? right - thickness / 2
          : (left + right) / 2;
    const center = toWorld([x, head ? headY : (sideTop + sideBottom) / 2, z]);
    const stop = {
      ...part(
        stopName[position],
        cedarDoorStop.materialId,
        [thickness, length, depth],
        center,
        first.stepId,
        shape.opening.name,
        jointRotation,
      ),
      stockLengthAxis: 1 as const,
      designRole: greenhouseDoorStopRoles[position],
    };
    const solid = solidFor(stop);
    if (solids.some((other) => solidOverlap(solid, other, tolerance)))
      throw Error(
        `${stop.name} overlaps a modeled part. Check the leaf, backing and nearby trim.`,
      );
    if (
      project.workZone &&
      solid.vertices.some(
        ([x, y, z]) =>
          Math.abs(x) > project.workZone!.width / 2 + tolerance ||
          Math.abs(z) > project.workZone!.depth / 2 + tolerance ||
          y < -tolerance ||
          y > project.workZone!.height + tolerance,
      )
    )
      throw Error(`${stop.name} extends outside the work zone.`);
    solids.push(solid);
    const fit = supportedStop(shape, position, stop);
    if (fit.covered + tolerance < fit.length)
      throw Error(
        `${stop.name} has backing along only ${inches(fit.covered)} of ${inches(fit.length)}. Restore continuous wood along its mounting edge.`,
      );
    const kerf = cutKerf(cedarDoorStop.materialId);
    const offcut = next.pieces
      .filter(
        (piece) =>
          piece.offcut &&
          piece.material === cedarDoorStop.materialId &&
          piece.stockLengthAxis === 1 &&
          piece.cutStock &&
          lineage.has(piece.cutStock.id) &&
          !piece.cutPlanes.length &&
          !pieceThroughOpenings(piece).length &&
          Math.abs(piece.size[0] - thickness) <= tolerance &&
          Math.abs(piece.size[2] - depth) <= tolerance &&
          (piece.size[1] === length || piece.size[1] > length + kerf),
      )
      .sort((a, b) => a.size[1] - b.size[1])[0];
    if (offcut) {
      const trim = offcut.size[1] > length;
      const shift = rotate(
        [0, (offcut.size[1] - length) / 2, 0],
        jointRotation,
      );
      const retained = {
        ...stop,
        id: offcut.id,
        cutStock: offcut.cutStock,
        size: [...offcut.size] as V3,
        position: center.map((value, axis) => value + shift[axis]) as V3,
      };
      next = {
        ...next,
        pieces: next.pieces.map((piece) =>
          piece.id === offcut.id ? retained : piece,
        ),
      };
      if (trim) next = cutPiece(next, retained.id, length, 1);
      stopIds.push(retained.id);
    } else {
      next = { ...next, pieces: [...next.pieces, stop] };
      stopIds.push(stop.id);
    }
    return { name: stop.name, ...fit, reused: offcut?.id ?? null };
  });
  next = projectSchema.parse({
    ...next,
    sections: next.sections.map((section) =>
      section.id === shape.opening.id
        ? { ...section, pieceIds: [...section.pieceIds, ...stopIds] }
        : section,
    ),
    guideFingerprint: null,
  });
  const hit = reviewMotion(next, plan).hits.find(({ obstacleId }) =>
    stopIds.includes(obstacleId),
  );
  if (hit)
    throw Error(
      `A stop interferes with the door swing near ${Number(hit.first.toFixed(2))}°. Review the pivot and stop gap.`,
    );
  return { project: next, rows, stopIds };
}

export function greenhouseDoorStopReview(project: Project, plan: MotionPlan) {
  const setup =
    plan.mechanism.kind === "hinge" ? plan.mechanism.greenhouseDoor : null;
  if (!setup) return [];
  const entry = project.ideaBindings
    .flatMap(({ entries }) => entries)
    .find(({ id }) => id === setup.entryId);
  const openingId = entry?.sections.find(
    ({ role }) => role === "door-opening-framing",
  )?.sectionId;
  const ids =
    project.sections.find(({ id }) => id === openingId)?.pieceIds ?? [];
  const stops = project.pieces.filter(
    (piece) =>
      !piece.offcut &&
      ids.includes(piece.id) &&
      isGreenhouseDoorStop(piece.designRole),
  );
  if (!stops.length) return [];
  try {
    const shape = greenhouseDoorGeometry(project, setup.entryId);
    const sillTop = doorSillTop(project, shape);
    return positions.flatMap((position) => {
      const members = stops.filter(
        (piece) => piece.designRole === greenhouseDoorStopRoles[position],
      );
      if (members.length !== 1)
        return [
          {
            line: `${stopName[position]} · ${members.length ? "Multiple pieces share this position." : "Piece missing."}`,
            warning: true,
          },
        ];
      const [piece] = members;
      const { gap, length, covered, backingDepth } = supportedStop(
        shape,
        position,
        piece,
      );
      const clearance =
        position === "head" || sillTop === null
          ? null
          : shape.localBounds(piece).min[1] - sillTop;
      const sillNote =
        position === "head"
          ? ""
          : clearance === null
            ? " Locate the current sill to check the lower end."
            : ` Lower end ${inches(clearance)} above sill.`;
      return [
        {
          line: `${stopName[position]} · ${partLabel(project, piece.id)} · ${inches(length)} long · ${inches(covered)} with wood backing · Narrowest backing ${inches(backingDepth)} · ${inches(gap)} modeled gap behind closed leaf.${sillNote}`,
          warning:
            gap < -tolerance ||
            covered + tolerance < length ||
            (position !== "head" &&
              (clearance === null || clearance < -tolerance)),
        },
      ];
    });
  } catch (cause) {
    return [
      {
        line:
          cause instanceof Error
            ? cause.message
            : "Review the fitted door stops.",
        warning: true,
      },
    ];
  }
}

export function greenhouseDoorStopGuideLines(project: Project) {
  return (project.motionPlans ?? []).flatMap((plan) => {
    const rows = greenhouseDoorStopReview(project, plan);
    return rows.length
      ? [
          plan.label,
          ...rows.map(({ line, warning }) =>
            warning ? `Review · ${line}` : line,
          ),
          doorStopScope,
        ]
      : [];
  });
}
