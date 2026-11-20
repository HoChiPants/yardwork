import type { V3 } from "./model";
import { clearanceAxis, siteClearanceTolerance } from "./siteClearance";
import type { SiteClearance } from "./siteClearanceSchema";

export function sweepSlideSiteFace(
  vertices: readonly V3[],
  axis: V3,
  travel: number,
  plane: SiteClearance,
) {
  const sideAxis = clearanceAxis(plane.side);
  const sign = plane.side.startsWith("+") ? 1 : -1;
  const top = plane.top;
  const endpoints = vertices.flatMap((point) => [
    { side: point[sideAxis], height: point[1], at: 0 },
    {
      side: point[sideAxis] + axis[sideAxis] * travel,
      height: point[1] + axis[1] * travel,
      at: travel,
    },
  ]);
  let closest = Infinity;
  let at: number | null = null;
  function check(side: number, distance: number) {
    const gap = sign * (plane.coordinate - side);
    if (gap < closest) {
      closest = gap;
      at = distance;
    }
  }
  for (const point of endpoints) {
    if (top === null || (point.height >= 0 && point.height <= top))
      check(point.side, point.at);
  }
  if (top !== null) {
    // A convex part sliding in a straight line sweeps the convex hull of the
    // two end poses. Check every possible hull edge sliced at each band
    // boundary. Extra chords are inside the hull and give valid poses too.
    for (const [index, point] of endpoints.entries()) {
      for (let j = index + 1; j < endpoints.length; j++) {
        const other = endpoints[j];
        const low = Math.min(point.height, other.height);
        const high = Math.max(point.height, other.height);
        for (const height of [0, top]) {
          if (height <= low || height >= high) continue;
          const t = (height - point.height) / (other.height - point.height);
          check(
            point.side + (other.side - point.side) * t,
            point.at + (other.at - point.at) * t,
          );
        }
      }
    }
  }
  const status =
    at === null
      ? "outside-height"
      : closest < plane.minimum - siteClearanceTolerance
        ? "short"
        : "met";
  return { status, at } as const;
}
