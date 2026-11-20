import type { V3 } from "./model";

export const WORKSHOP_MAX_POLAR_ANGLE = Math.PI / 2 - 0.01;
/** Preset offsets use the same polar boundary as the interactive controls. */
export function workshopViewOffset(preset: string, radius: number): V3 {
  return preset === "top"
    ? [0, radius * 1.8, 0.01]
    : preset === "front"
      ? [0, radius * 1.8 * Math.cos(WORKSHOP_MAX_POLAR_ANGLE), radius * 1.8 * Math.sin(WORKSHOP_MAX_POLAR_ANGLE)]
      : [radius * 1.2, radius * 0.85, radius * 1.35];
}

export type PerspectiveBounds = { min: V3; max: V3 };
export type PerspectiveFitOptions = {
  /** Vertical field of view, in degrees. */
  verticalFovDegrees: number;
  aspect: number;
  /** Direction from the bounds center toward the camera. Magnitude is ignored. */
  direction: V3;
  /** A value of 1.1 keeps geometry inside 1/1.1 of each frustum half-extent. */
  padding?: number;
  minDistance?: number;
  nearClip?: number;
  up?: V3;
  /** Fractions of the viewport reserved for overlays, each less than one half. */
  viewportInsets?: { left: number; right: number; top: number; bottom: number };
};
export type PerspectiveFit = {
  target: V3;
  position: V3;
  distance: number;
  nearDistance: number;
  farDistance: number;
};
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(v: V3): V3 {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-10)
    throw Error("Camera fit needs a finite nonzero direction.");
  return v.map((n) => n / length) as V3;
}
export function boundsCorners({ min, max }: PerspectiveBounds): V3[] {
  if (
    min.some(
      (n, i) => !Number.isFinite(n) || !Number.isFinite(max[i]) || max[i] < n,
    )
  )
    throw Error("Camera fit bounds must be finite and ordered.");
  return [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): V3 => [x, y, z])),
  );
}
/** Fits every bounding-box corner, including depth perspective, without changing the requested view direction. */
export function fitPerspectiveBounds(
  bounds: PerspectiveBounds,
  {
    verticalFovDegrees,
    aspect,
    direction,
    padding = 1.1,
    minDistance = 2,
    nearClip = 0.05,
    up = [0, 1, 0],
    viewportInsets = { left: 0, right: 0, top: 0, bottom: 0 },
  }: PerspectiveFitOptions,
): PerspectiveFit {
  const corners = boundsCorners(bounds);
  if (
    !Number.isFinite(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 179 ||
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    !Number.isFinite(padding) ||
    padding < 1 ||
    !Number.isFinite(minDistance) ||
    minDistance < 0 ||
    !Number.isFinite(nearClip) ||
    nearClip <= 0 ||
    [viewportInsets.left, viewportInsets.right, viewportInsets.top, viewportInsets.bottom].some((n) => !Number.isFinite(n) || n < 0 || n >= 0.5)
  )
    throw Error(
      "Camera fit needs a valid field of view, aspect, padding and clip distance.",
    );
  const target = bounds.min.map((n, i) => (n + bounds.max[i]) / 2) as V3,
    back = normalize(direction);
  let cameraUp = normalize(up);
  // Looking exactly along world up still has a stable front/right orientation.
  if (Math.hypot(...cross(cameraUp, back)) < 1e-10)
    cameraUp = Math.abs(back[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const right = normalize(cross(cameraUp, back)),
    projectedUp = normalize(cross(back, right)),
    tanVertical = Math.tan((verticalFovDegrees * Math.PI) / 360),
    tanHorizontal = tanVertical * aspect,
    // Preserve the target/view direction. Reserve the larger margin on each
    // side rather than changing projection or making orbit targets drift.
    usableX = 1 - 2 * Math.max(viewportInsets.left, viewportInsets.right),
    usableY = 1 - 2 * Math.max(viewportInsets.top, viewportInsets.bottom),
    projected = corners.map((corner) => {
      const relative = corner.map((n, i) => n - target[i]) as V3;
      return {
        x: dot(relative, right),
        y: dot(relative, projectedUp),
        along: dot(relative, back),
      };
    });
  const distance = Math.max(
    minDistance,
    ...projected.flatMap(({ x, y, along }) => [
      along + (Math.abs(x) * padding) / (tanHorizontal * usableX),
      along + (Math.abs(y) * padding) / (tanVertical * usableY),
      along + nearClip * 2,
    ]),
  );
  return {
    target,
    position: target.map((n, i) => n + back[i] * distance) as V3,
    distance,
    nearDistance: Math.min(...projected.map(({ along }) => distance - along)),
    farDistance: Math.max(...projected.map(({ along }) => distance - along)),
  };
}
