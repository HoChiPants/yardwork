export type Point2 = [number, number];

/** Deterministic convex footprint; this is a projection, not a saw/jig setup. */
export function convexHull(input: Point2[]): Point2[] {
  if (!input.every((point) => point.every(Number.isFinite)))
    throw new Error("Diagram points must be finite.");
  if (!input.length) return [];
  const scale = Math.max(1, ...input.flat().map(Math.abs));
  const epsilon = scale * 1e-9;
  // Inverse world transforms leave coincident projected edges a few ulps apart.
  // Coalesce each coordinate before lexicographic sorting: otherwise the noisy
  // x order can put the top of an edge before its bottom and lose a true corner.
  const coalesce = (axis: 0 | 1) => {
    const values = [...new Set(input.map((point) => point[axis]))].sort(
      (a, b) => a - b,
    );
    const coordinates = new Map<number, number>();
    let anchor = values[0];
    for (const value of values) {
      if (value - anchor > epsilon) anchor = value;
      coordinates.set(value, anchor);
    }
    return coordinates;
  };
  const xs = coalesce(0),
    ys = coalesce(1);
  const sorted = input
    .map(([x, y]) => [xs.get(x)!, ys.get(y)!] as Point2)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const points = sorted.filter(
    (p, i) =>
      !i ||
      Math.hypot(p[0] - sorted[i - 1][0], p[1] - sorted[i - 1][1]) > epsilon,
  );
  if (points.length < 3) return points;
  const cross = (a: Point2, b: Point2, c: Point2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (sequence: Point2[]) => {
    const hull: Point2[] = [];
    for (const point of sequence) {
      while (
        hull.length >= 2 &&
        cross(hull.at(-2)!, hull.at(-1)!, point) <= epsilon * scale
      )
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}
