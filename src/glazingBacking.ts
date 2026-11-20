import { Vector3 } from "three";
import { retainedWoodFaces } from "./connectionContacts";
import { material, type Piece, type V3 } from "./model";

export const numericalTolerance = 1e-7;
// Model contact tolerance in inches. The profile still has to be field fitted.
const contactTolerance = 0.01;
export type GlazingBackingSegment = [V3, V3];
type Interval = [number, number];
const vector = (point: V3) => new Vector3(...point);

export function prepareGlazingBacking(pieces: readonly Piece[]) {
  return pieces.flatMap((piece) => {
    if (piece.offcut || !material(piece.material).wood) return [];
    try {
      return retainedWoodFaces(piece).map(({ normal, points }) => {
        const outward = vector(normal);
        const polygon = points.map(vector);
        return {
          outward,
          point: polygon[0],
          edges: polygon.map((origin, index) => {
            const next = polygon[(index + 1) % polygon.length];
            return {
              origin,
              inward: outward
                .clone()
                .cross(next.clone().sub(origin))
                .normalize(),
            };
          }),
        };
      });
    } catch {
      // Unusable retained geometry cannot supply evidence of contact.
      return [];
    }
  });
}
type Backing = ReturnType<typeof prepareGlazingBacking>;

/** Intersect a segment with the retained wood, requiring an actual supporting
 * face at the panel underside. Wood crossing the panel from another angle
 * must not be counted as coplanar backing. */
function contactInterval(
  evidence: Backing[number],
  start: Vector3,
  end: Vector3,
  normal: Vector3,
): Interval | null {
  const { outward, point, edges } = evidence;
  if (
    outward.dot(normal) < 1 - numericalTolerance ||
    Math.abs(outward.dot(start.clone().sub(point))) > contactTolerance ||
    Math.abs(outward.dot(end.clone().sub(point))) > contactTolerance
  )
    return null;

  const direction = end.clone().sub(start);
  let from = 0;
  let to = 1;
  for (const { origin, inward } of edges) {
    const distance = inward.dot(start.clone().sub(origin));
    const velocity = inward.dot(direction);
    if (Math.abs(velocity) <= numericalTolerance) {
      if (distance < -numericalTolerance) return null;
      continue;
    }
    const boundary = -distance / velocity;
    if (velocity > 0) from = Math.max(from, boundary);
    else to = Math.min(to, boundary);
    if (to <= from) return null;
  }
  return [from, to];
}

/** Search parallel retained faces behind a line on a board's back face. */
export function projectedBackingIntervals(
  backing: Backing,
  segment: GlazingBackingSegment,
  direction: V3,
  maxGap: number,
) {
  const [start, end] = segment.map(vector);
  const away = vector(direction);
  const normal = away.clone().negate();
  return backing.flatMap((face) => {
    if (face.outward.dot(normal) < 1 - numericalTolerance) return [];
    const gap = away.dot(face.point.clone().sub(start));
    if (gap < -contactTolerance || gap > maxGap + numericalTolerance) return [];
    const offset = away.clone().multiplyScalar(gap);
    const interval = contactInterval(
      face,
      start.clone().add(offset),
      end.clone().add(offset),
      normal,
    );
    return interval
      ? [{ from: interval[0], to: interval[1], gap: gap <= contactTolerance ? 0 : gap }]
      : [];
  });
}

function uncovered(intervals: Interval[], length: number) {
  const gaps: Interval[] = [];
  let covered = 0;
  for (const [from, to] of intervals.sort((a, b) => a[0] - b[0])) {
    if ((from - covered) * length > contactTolerance)
      gaps.push([covered, from]);
    covered = Math.max(covered, to);
  }
  if ((1 - covered) * length > contactTolerance) gaps.push([covered, 1]);
  return gaps;
}

export function glazingBackingGaps(
  backing: Backing,
  contact: GlazingBackingSegment,
  visible: GlazingBackingSegment,
  outward: V3,
) {
  const [start, end] = contact.map(vector);
  const normal = vector(outward);
  const length = start.distanceTo(end);
  const intervals = backing.flatMap((face) => {
    const interval = contactInterval(face, start, end, normal);
    return interval ? [interval] : [];
  });
  const [a, b] = visible.map(vector);
  return uncovered(intervals, length).map(([from, to]) => ({
    length: (to - from) * length,
    points: [
      a.clone().lerp(b, from).toArray(),
      a.clone().lerp(b, to).toArray(),
    ] as GlazingBackingSegment,
  }));
}
