import { convexHull, type Point2 } from "./convexHull";
import type { ConvexSolid } from "./cutProfiles";
import type { Piece, V3 } from "./model";
import { composeRotation, rotate } from "./spatial";

export type CoveragePolygon = Point2[];
type Line = { x: number; y: number; limit: number };
type Axis = 0 | 1 | 2;
export type DepthSlab = {
  axes: readonly [Axis, Axis, Axis];
  low: number;
  high: number;
};
export const coverageEpsilon = 0.00001;
export const coverageAreaEpsilon = 0.0001;
const localAxes = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;

export function coverageArea(poly: CoveragePolygon) {
  return (
    Math.abs(
      poly.reduce((sum, [x, y], i) => {
        const next = poly[(i + 1) % poly.length];
        return sum + x * next[1] - y * next[0];
      }, 0),
    ) / 2
  );
}

function clip(poly: CoveragePolygon, line: Line, keepInside = true) {
  const result: CoveragePolygon = [];
  const distance = ([x, y]: Point2) => {
    const value = x * line.x + y * line.y - line.limit;
    return Math.abs(value) < coverageEpsilon ? 0 : keepInside ? value : -value;
  };
  for (const [index, start] of poly.entries()) {
    const end = poly[(index + 1) % poly.length];
    const a = distance(start),
      b = distance(end);
    if (a <= 0) result.push(start);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = a / (a - b);
      result.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ]);
    }
  }
  return result;
}

export function coveredArea(region: CoveragePolygon, cover: Line[]) {
  return coverageArea(
    cover.reduce((inside, line) => clip(inside, line), region),
  );
}

export function subtractCover(region: CoveragePolygon, cover: Line[]) {
  // Faces of an unrelated cover must not fragment the region.
  if (coveredArea(region, cover) <= coverageAreaEpsilon) return [region];
  const remainder: CoveragePolygon[] = [];
  let inside = region;
  for (const line of cover) {
    const outside = clip(inside, line, false);
    if (coverageArea(outside) > coverageAreaEpsilon) remainder.push(outside);
    inside = clip(inside, line);
  }
  return remainder;
}

/** Each face's most restrictive point is at one end of the depth segment. */
export function fullDepthCover(
  piece: Piece,
  origin: V3,
  inverse: V3,
  { axes: [u, v, depth], low, high }: DepthSlab,
) {
  const center = rotate(
    piece.position.map((value, i) => value - origin[i]) as V3,
    inverse,
  );
  const rotation = composeRotation(inverse, piece.rotation);
  const planes = [
    ...localAxes.flatMap((axis, i) =>
      [-1, 1].map((sign) => ({
        normal: axis.map((value) => value * sign) as V3,
        constant: piece.size[i] / 2,
      })),
    ),
    ...(piece.cutPlanes ?? []),
  ];
  const lines: Line[] = [];
  for (const plane of planes) {
    const normal = rotate(plane.normal, rotation);
    const x = normal[u],
      y = normal[v],
      d = normal[depth];
    const limit =
      plane.constant +
      x * center[u] +
      y * center[v] +
      d * center[depth] -
      Math.max(d * low, d * high);
    const length = Math.hypot(x, y);
    if (length > 1e-10)
      lines.push({ x: x / length, y: y / length, limit: limit / length });
    else if (limit < -coverageEpsilon) return null;
  }
  return lines;
}

/** Convex outlines must be counterclockwise. */
export function polygonCover(polygon: CoveragePolygon): Line[] {
  return polygon.map(([u, v], index) => {
    const next = polygon[(index + 1) % polygon.length];
    const x = next[1] - v,
      y = u - next[0];
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length, limit: (x * u + y * v) / length };
  });
}

/** Project only the framing that actually enters the cavity slab. */
export function slabFootprint(
  solid: ConvexSolid,
  { axes: [u, v, depth], low, high }: DepthSlab,
) {
  const depths = solid.vertices.map((point) => point[depth]);
  if (
    Math.max(...depths) <= low + coverageEpsilon ||
    Math.min(...depths) >= high - coverageEpsilon
  )
    return [];
  const points: CoveragePolygon = solid.vertices
    .filter((point) => point[depth] >= low && point[depth] <= high)
    .map((point) => [point[u], point[v]]);
  for (const face of solid.faces)
    for (const [index, start] of face.indices.entries()) {
      const a = solid.vertices[start];
      const b = solid.vertices[face.indices[(index + 1) % face.indices.length]];
      for (const boundary of [low, high]) {
        if (a[depth] < boundary === b[depth] < boundary) continue;
        const fraction = (boundary - a[depth]) / (b[depth] - a[depth]);
        points.push([
          a[u] + (b[u] - a[u]) * fraction,
          a[v] + (b[v] - a[v]) * fraction,
        ]);
      }
    }
  return convexHull(points);
}

export function formatCoverageArea(squareInches: number) {
  return squareInches >= 144
    ? `${Number((squareInches / 144).toFixed(2))} sq ft`
    : `${Number(squareInches.toFixed(2)) || "<0.01"} sq in`;
}
