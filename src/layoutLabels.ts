export type LabelPoint = readonly [number, number];

/** A conservative text box inside a convex footprint, in the SVG's own units. */
export function fitLayoutLabel(
  points: readonly LabelPoint[],
  label: string,
  fontSize: number,
): { x: number; y: number; fontSize: number } | null {
  if (
    points.length < 3 ||
    !label ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0 ||
    !points.every((point) => point.every(Number.isFinite))
  )
    return null;
  const x = points.reduce((sum, point) => sum + point[0], 0) / points.length,
    y = points.reduce((sum, point) => sum + point[1], 0) / points.length,
    halfWidth = (label.length * 0.7 * fontSize) / 2 + fontSize * 0.25,
    halfHeight = fontSize * 0.8;
  const corners: LabelPoint[] = [
    [x - halfWidth, y - halfHeight],
    [x + halfWidth, y - halfHeight],
    [x + halfWidth, y + halfHeight],
    [x - halfWidth, y + halfHeight],
  ];
  const inside = (point: LabelPoint) => {
    let positive = false,
      negative = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        cross =
          (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      positive ||= cross > 1e-8;
      negative ||= cross < -1e-8;
      if (positive && negative) return false;
    }
    return positive || negative;
  };
  return corners.every(inside) ? { x, y, fontSize } : null;
}
