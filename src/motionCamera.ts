import type { PerspectiveBounds } from "./cameraFit";

export type MotionCollisionFocus = readonly [movingId: string, obstacleId: string];

/** CSS-pixel space reserved for the remaining view controls and scene caption. */
export function motionViewport(width: number, height: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const pixels = {
    left: Math.min(16, w * 0.4),
    right: Math.min(60, w * 0.4),
    top: Math.min(54, h * 0.4),
    bottom: Math.min(58, h * 0.4),
  };
  return {
    insets: { left: pixels.left / w, right: pixels.right / w, top: pixels.top / h, bottom: pixels.bottom / h },
    safeRect: { left: pixels.left, top: pixels.top, right: w - pixels.right, bottom: h - pixels.bottom },
  };
}

export function unionBounds(boxes: readonly PerspectiveBounds[]): PerspectiveBounds {
  if (!boxes.length) throw Error("Camera framing needs at least one bound.");
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as PerspectiveBounds["min"],
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as PerspectiveBounds["max"],
  };
}
