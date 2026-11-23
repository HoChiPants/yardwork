import { bounds } from "./engine";
import { material, vec, type Piece, type Project, type V3 } from "./model";
import {
  prepareCollisionSolid,
  slideOverlapInterval,
  solidOverlap,
  translateCollisionSolid,
  type CollisionSolid,
} from "./solidCollision";

const EPS = 1e-6;
const wood = (piece: Piece) => material(piece.material).wood && !piece.offcut;
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const plus = (a: V3, b: V3): V3 => a.map((n, i) => n + b[i]) as V3;
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function separations(a: CollisionSolid, b: CollisionSolid): V3[] {
  const axes: V3[] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    ...a.faceNormals,
    ...b.faceNormals,
  ];
  for (const ea of a.edgeDirections)
    for (const eb of b.edgeDirections) axes.push(cross(ea, eb));
  const unique: V3[] = [];
  for (const raw of axes) {
    const length = Math.hypot(...raw);
    if (length < 1e-10) continue;
    const axis = raw.map((n) => n / length) as V3;
    if (!unique.some((other) => Math.abs(dot(other, axis)) > 1 - 1e-10))
      unique.push(axis);
  }
  return unique.flatMap((axis) => {
    const aa = a.vertices.map((p) => dot(p, axis)),
      bb = b.vertices.map((p) => dot(p, axis));
    return [
      Math.max(...bb) - Math.min(...aa),
      Math.min(...bb) - Math.max(...aa),
    ].map((distance) => axis.map((n) => n * distance) as V3);
  });
}
export type PlacementResult = {
  offset: V3;
  adjusted: boolean;
  blocked: boolean;
  overlapIds: string[];
};

/** Rigid translation of actual retained wood solids; hardware and virtual scrap do not block wood. */
export function separateWood(
  project: Project,
  pieces: readonly Piece[],
  axis?: 0 | 1 | 2,
): PlacementResult {
  const movingIds = new Set(pieces.map((p) => p.id));
  const moving = pieces
    .filter(wood)
    .map((piece) => ({ piece, solid: prepareCollisionSolid(piece) }));
  if (moving.some((row) => !row.solid))
    throw Error("This retained wood shape cannot be positioned automatically.");
  const obstacles = project.pieces
    .filter((p) => wood(p) && !movingIds.has(p.id))
    .map((piece) => {
      try {
        return { piece, solid: prepareCollisionSolid(piece) };
      } catch {
        return { piece, solid: null };
      }
    });
  const floor = moving.length
    ? Math.min(...moving.map((row) => row.solid!.bounds.min[1]))
    : 0;
  let offset: V3 = [0, Math.max(0, -floor), 0];
  const seen = new Set<string>();
  const collisions = (candidate: V3) => {
    const rows: { a: CollisionSolid; b: CollisionSolid; id: string }[] = [];
    for (const item of moving) {
      const a = translateCollisionSolid(item.solid!, candidate);
      for (const other of obstacles) {
        if (!other.solid) {
          const box = bounds(other.piece);
          if (
            [0, 1, 2].every(
              (i) =>
                a.bounds.max[i] > box.min[i] + EPS &&
                box.max[i] > a.bounds.min[i] + EPS,
            )
          )
            throw Error(
              "An overlapping wood part has an unavailable retained shape. Review it before moving into this space.",
            );
        } else if (solidOverlap(a, other.solid, EPS))
          rows.push({ a, b: other.solid, id: other.piece.id });
      }
    }
    return rows;
  };
  // Each step resolves a real separating-axis interval, including full containment.
  for (let attempt = 0; attempt < 48; attempt++) {
    const overlaps = collisions(offset);
    if (!overlaps.length)
      return {
        offset,
        adjusted: Math.hypot(...offset) > EPS,
        blocked: false,
        overlapIds: [],
      };
    const candidates = overlaps
      .flatMap(({ a, b }) =>
        separations(a, b).map((delta) => plus(offset, delta)),
      )
      .filter(
        (next) =>
          (axis === undefined ||
            [0, 1, 2].every(
              (i) => i === axis || Math.abs(next[i] - offset[i]) < EPS,
            )) &&
          floor + next[1] >= -EPS &&
          !seen.has(next.map((n) => n.toFixed(6)).join("/")),
      );
    const ranked = candidates
      .map((next) => ({
        next,
        count: collisions(next).length,
        distance: Math.hypot(...next.map((n, i) => n - offset[i])),
      }))
      .sort(
        (a, b) =>
          a.count - b.count || a.distance - b.distance || b.next[1] - a.next[1],
      );
    if (!ranked.length)
      return {
        offset: [0, 0, 0],
        adjusted: false,
        blocked: true,
        overlapIds: [...new Set(overlaps.map((row) => row.id))],
      };
    offset = ranked[0].next;
    seen.add(offset.map((n) => n.toFixed(6)).join("/"));
  }
  return {
    offset: [0, 0, 0],
    adjusted: false,
    blocked: true,
    overlapIds: [...new Set(collisions(offset).map((row) => row.id))],
  };
}
export function placeWood(
  project: Project,
  piece: Piece,
  position: V3,
  rotation: V3 = piece.rotation,
  axis?: 0 | 1 | 2,
) {
  const result = separateWood(
    project,
    [{ ...piece, position, rotation }],
    axis,
  );
  return { ...result, position: plus(position, result.offset) };
}

type SlideStop = { kind: "floor" } | { kind: "wood"; pieceId: string };

export function woodSlideStopLabel(project: Project, stop: SlideStop | null) {
  if (!stop) return "";
  if (stop.kind === "floor") return "Stopped at the ground";
  const fixed = project.pieces.find((piece) => piece.id === stop.pieceId);
  return `Stopped at ${fixed?.name ?? "solid wood"}`;
}

export function createWoodSlide(project: Project, piece: Piece) {
  return createWoodGroupSlide(project, [piece], piece.position);
}

export function previewPartElevation(source: Project, piece: Piece, requested: number) {
  if (!Number.isFinite(requested) || requested < 0 || requested > 12000)
    throw Error("Enter a height above the floor between 0 and 12,000 inches.");
  const start = bounds(piece);
  if (!Number.isFinite(start.min[1]) || !Number.isFinite(start.max[1]))
    throw Error("Check the part’s retained shape before setting its height.");
  const target: V3 = [piece.position[0], piece.position[1] + requested - start.min[1], piece.position[2]];
  const moving = Math.abs(target[1] - piece.position[1]) > EPS;
  const slide = moving ? createWoodSlide(source, piece) : null;
  if (moving && wood(piece) && !slide)
    throw Error("Check this part’s starting position and wood overlaps before setting its height.");
  const placed = slide?.(target);
  const position = placed?.position ?? (moving ? target : piece.position);
  if (!vec.safeParse(position).success) throw Error("The part’s position would be outside the editor’s range.");
  const travel = position[1] - piece.position[1];
  return {
    source, part: { ...piece, position }, requested,
    startBottom: start.min[1], bottom: start.min[1] + travel, top: start.max[1] + travel,
    stop: placed?.stop ? woodSlideStopLabel(source, placed.stop) : "",
    changed: Math.abs(travel) > EPS,
  };
}

export type PartElevationPreview = ReturnType<typeof previewPartElevation>;

/** Prepare a rigid translation that stops at the first external wood face. */
export function createWoodGroupSlide(
  project: Project,
  pieces: readonly Piece[],
  origin: V3,
) {
  const movingIds = new Set(pieces.map((piece) => piece.id));
  const moving: CollisionSolid[] = [];
  const obstacles: { id: string; solid: CollisionSolid }[] = [];
  try {
    for (const piece of pieces) {
      if (!wood(piece)) continue;
      const solid = prepareCollisionSolid(piece);
      if (!solid || solid.bounds.min[1] < -EPS) return null;
      moving.push(solid);
    }
    if (!moving.length) return null;
    for (const other of project.pieces) {
      if (movingIds.has(other.id) || !wood(other)) continue;
      const solid = prepareCollisionSolid(other);
      if (
        !solid ||
        moving.some(
          (member) =>
            member.bounds.max.every(
              (value, axis) =>
                value > solid.bounds.min[axis] + EPS &&
                member.bounds.min[axis] < solid.bounds.max[axis] - EPS,
            ) && solidOverlap(member, solid, EPS),
        )
      )
        return null;
      obstacles.push({ id: other.id, solid });
    }
  } catch {
    // The ordinary placement path can still repair an imported overlap or report an invalid shape.
    return null;
  }
  const floor = Math.min(...moving.map((solid) => solid.bounds.min[1]));
  return (
    target: V3,
    from = origin,
  ): { position: V3; stop: SlideStop | null } => {
    const delta = target.map((value, axis) => value - from[axis]) as V3;
    const travel = Math.hypot(...delta);
    if (travel === 0) return { position: target, stop: null };
    const direction = delta.map((value) => value / travel) as V3;
    const offset = from.map((value, axis) => value - origin[axis]) as V3;
    const starts =
      from === origin
        ? moving
        : moving.map((solid) => translateCollisionSolid(solid, offset));
    let distance = travel;
    let stop: SlideStop | null = null;
    if (floor + offset[1] + delta[1] < 0 && direction[1] < 0) {
      distance = Math.max(0, (floor + offset[1]) / -direction[1]);
      stop = { kind: "floor" };
    }
    for (const start of starts) {
      for (const { id, solid } of obstacles) {
        const crossesBounds = direction.every(
          (value, axis) =>
            start.bounds.max[axis] + Math.max(0, value * distance) >
              solid.bounds.min[axis] + EPS &&
            start.bounds.min[axis] + Math.min(0, value * distance) <
              solid.bounds.max[axis] - EPS,
        );
        if (!crossesBounds) continue;
        const hit = slideOverlapInterval(
          start,
          solid,
          direction,
          distance,
          EPS,
        );
        if (!hit) continue;
        // Use the tolerance to exclude tangency. Stop at the exact face once the path is known to enter it.
        distance =
          slideOverlapInterval(start, solid, direction, distance, 0)?.enter ??
          hit.enter;
        stop = { kind: "wood", pieceId: id };
      }
    }
    return {
      position: stop
        ? plus(from, direction.map((value) => value * distance) as V3)
        : target,
      stop,
    };
  };
}
