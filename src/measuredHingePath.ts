import type { V3 } from "./model";
import type { HingePath } from "./motionPlanSchema";

const zero: V3 = [0, 0, 0];

export function hingeOffsetAt(path: HingePath, angle: number): V3 {
  if (angle <= 0) return zero;
  let start = 0;
  let offset = zero;
  for (const station of path) {
    if (angle <= station.angle) {
      const fraction = (angle - start) / (station.angle - start);
      return offset.map((value, i) => value + (station.offset[i] - value) * fraction) as V3;
    }
    start = station.angle;
    offset = station.offset;
  }
  return offset;
}

/** Speed bound in inches per degree of opening, including the sharpest change. */
export function hingeOffsetSpeed(path: HingePath, direction?: V3) {
  let speed = 0;
  let start = 0;
  let offset = zero;
  for (const station of path) {
    const velocity = station.offset.map((value, i) => (value - offset[i]) / (station.angle - start));
    const projected = direction
      ? Math.abs(velocity.reduce((sum, value, i) => sum + value * direction[i], 0))
      : Math.hypot(...velocity);
    speed = Math.max(speed, projected);
    start = station.angle;
    offset = station.offset;
  }
  return speed;
}

const radians = Math.PI / 180;

/** Extrema of a sinusoid plus the linear measured offset, one interval at a time. */
export function hingeOffsetSegments(path: HingePath, start: number, end: number) {
  const breaks = [start, ...path.flatMap(({ angle }) => angle > start && angle < end ? [angle] : []), end];
  return breaks.slice(1).map((last, i) => {
    const first = breaks[i];
    const openingOffset = hingeOffsetAt(path, first);
    const closingOffset = hingeOffsetAt(path, last);
    const from = first * radians;
    const to = last * radians;
    const rates = closingOffset.map((value, axis) =>
      to > from ? (value - openingOffset[axis]) / (to - from) : 0,
    );
    return { from, to, openingOffset, rates };
  });
}

export function hingeComponentExtrema(
  segments: ReturnType<typeof hingeOffsetSegments>,
  axis: number,
  center: number,
  cosine: number,
  sine: number,
  record: (value: number, angle: number) => void,
) {
  const amplitude = Math.hypot(cosine, sine);
  const phase = Math.atan2(sine, cosine);
  for (const { from, to, openingOffset, rates } of segments) {
    const rate = rates[axis];
    const candidates = [from, to];
    if (amplitude > 0 && Math.abs(rate) <= amplitude) {
      const root = Math.asin(rate / amplitude);
      for (const theta of [phase + root, phase + Math.PI - root])
        candidates.push(theta - 2 * Math.PI, theta, theta + 2 * Math.PI);
    }
    for (const theta of candidates) {
      if (theta < from || theta > to) continue;
      record(center + cosine * Math.cos(theta) + sine * Math.sin(theta) +
        openingOffset[axis] + rate * (theta - from), theta / radians);
    }
  }
}
