import { bounds } from "./engine";
import { isHardware, type Piece, type Project, type V3 } from "./model";
import { clipBox } from "./cutProfiles";
import { pieceThroughOpenings, throughOpeningPrisms } from "./throughOpenings";
import { inverseRotation, rotate } from "./spatial";
import { placeWood } from "./placement";
import { pieceOverlap } from "./solidCollision";

/** Hardware intentionally penetrates stock, so it is not a solid placement obstacle. */
function solid(piece: Piece) {
  return !isHardware(piece.material);
}

/** Try nearby touching faces without changing the requested placement into an overlap. */
export function alignNearbyFaces(
  project: Project,
  piece: Piece,
  position: V3,
  rotation: V3,
  tolerance = 0.8,
): V3 {
  let next = [...position] as V3;
  if (!solid(piece) || !Number.isFinite(tolerance) || tolerance <= 0)
    return next;
  const others = project.pieces.filter(
    (p) => p.id !== piece.id && !p.offcut && solid(p),
  );
  const obstacles = others.map((p) => ({
    id: p.id,
    bounds: bounds(p),
  }));
  const fits = (candidate: V3) => {
    const moved = { ...piece, position: candidate, rotation };
    return others.every((other) => pieceOverlap(moved, other, 1e-6) !== true);
  };
  for (let axis = 0; axis < 3; axis++) {
    const current = bounds({ ...piece, position: next, rotation });
    const offsets: number[] = [];
    if (axis === 1 && Math.abs(current.min[1]) <= tolerance)
      offsets.push(-current.min[1]);
    for (const { bounds: other } of obstacles) {
      if (
        ![0, 1, 2]
          .filter((i) => i !== axis)
          .every(
            (i) =>
              Math.min(current.max[i], other.max[i]) -
                Math.max(current.min[i], other.min[i]) >
              0.001,
          )
      )
        continue;
      offsets.push(
        other.max[axis] - current.min[axis],
        other.min[axis] - current.max[axis],
      );
    }
    for (const offset of offsets
      .filter((v) => Math.abs(v) <= tolerance)
      .sort((a, b) => Math.abs(a) - Math.abs(b))) {
      const candidate = [...next] as V3;
      candidate[axis] += offset;
      if (fits(candidate)) {
        next = candidate;
        break;
      }
    }
  }
  return next;
}

/** Align a dropped part and separate any remaining wood intersection. */
export function snapPlacement(
  project: Project,
  piece: Piece,
  position: V3,
  rotation: V3,
  tolerance = 0.8,
): { position: V3; snapped: boolean } {
  if (!solid(piece) || !Number.isFinite(tolerance) || tolerance <= 0)
    return { position: [...position] as V3, snapped: false };
  const next = alignNearbyFaces(project, piece, position, rotation, tolerance);
  const clear = placeWood(project, piece, next, rotation);
  return {
    position: clear.blocked ? piece.position : clear.position,
    snapped: clear.position.some((v, i) => Math.abs(v - position[i]) > 1e-7),
  };
}

/** Nearest stock top under a downward ray; coordinates are inches. */
export function surfacePlacement(
  project: Project,
  origin: V3,
  direction: V3,
  excludeId?: string,
): V3 | null {
  if (
    ![...origin, ...direction].every(Number.isFinite) ||
    direction[1] >= -1e-8
  )
    return null;
  let nearest = Infinity;
  let result: V3 | null = null;
  const inspect = (height: number, footprint?: ReturnType<typeof bounds>) => {
    const t = (height - origin[1]) / direction[1];
    if (t < 0 || t >= nearest) return;
    const point: V3 = [origin[0] + direction[0] * t, height, origin[2] + direction[2] * t];
    if (
      footprint &&
      ![0, 2].every(
        (i) =>
          point[i] >= footprint.min[i] - 1e-7 &&
          point[i] <= footprint.max[i] + 1e-7,
      )
    )
      return;
    nearest = t;
    result = point;
  };
  inspect(0);
  for (const piece of project.pieces) {
    if (piece.id === excludeId || piece.offcut || !solid(piece)) continue;
    const openings = pieceThroughOpenings(piece);
    if (
      !piece.cutPlanes?.length &&
      !openings.length &&
      piece.rotation.every(
        (r) =>
          Math.abs(r / (Math.PI / 2) - Math.round(r / (Math.PI / 2))) < 1e-6,
      )
    ) {
      const box = bounds(piece);
      inspect(box.max[1], box);
      continue;
    }
    // Rotated boards and cut stock use their actual convex faces, including
    // sloping tops and missing corners, never an empty bounding-box envelope.
    const inverse = inverseRotation(piece.rotation);
    const localOrigin = rotate(
      origin.map((v, i) => v - piece.position[i]) as V3,
      inverse,
    );
    const localDirection = rotate(direction, inverse);
    const dot = (a: V3, b: V3) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    const shapes = openings.length
      ? throughOpeningPrisms(piece.size, openings).cells
      : [clipBox(piece.size, piece.cutPlanes)];
    for (const shape of shapes) {
      const faces = shape.faces.map((face) => ({
        normal: face.normal,
        constant: dot(face.normal, shape.vertices[face.indices[0]]),
      }));
      for (const face of faces) {
        if (rotate(face.normal, piece.rotation)[1] <= 1e-8) continue;
        const denominator = dot(face.normal, localDirection);
        if (denominator >= -1e-8) continue;
        const t = (face.constant - dot(face.normal, localOrigin)) / denominator;
        if (t < 0 || t >= nearest) continue;
        const point = localOrigin.map(
          (v, i) => v + t * localDirection[i],
        ) as V3;
        if (
          !faces.every(
            (other) => dot(other.normal, point) <= other.constant + 1e-7,
          )
        )
          continue;
        nearest = t;
        result = origin.map((v, i) => v + t * direction[i]) as V3;
      }
    }
  }
  return result;
}

/** Round a picked point only while it remains on the floor or a nearby elevated face. */
export function snapSurfacePoint(project: Project, point: V3, rayHeight: number): V3 {
  const [x, y, z] = point;
  const snapped = surfacePlacement(project, [Math.round(x), Math.max(rayHeight, y + 1), Math.round(z)], [0, -1, 0]);
  const aboveFloor = (height: number) => height > 1e-8;
  if (!snapped || aboveFloor(y) !== aboveFloor(snapped[1]) || Math.abs(snapped[1] - y) > 0.8) return point;
  return snapped;
}
