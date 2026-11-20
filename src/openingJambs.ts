import type { V3 } from "./model";

type FramingBounds = { min: V3; max: V3 };

/** Find continuous jamb sides. A jack stud and the plate below it can share the same jamb face. */
export function openingJambs(
  members: readonly FramingBounds[],
  low: number,
  high: number,
  epsilon: number,
) {
  const near = (a: number, b: number) => Math.abs(a - b) <= epsilon;
  function closest(side: "left" | "right") {
    const edge = (member: FramingBounds) =>
      side === "left" ? member.max[0] : member.min[0];
    const candidates = members.filter((member) =>
      side === "left" ? edge(member) < 0 : edge(member) > 0,
    );
    return candidates
      .sort((a, b) => Math.abs(edge(a)) - Math.abs(edge(b)))
      .find((candidate) => {
        const aligned = candidates
          .filter(
            (other) =>
              near(edge(other), edge(candidate)) &&
              near(other.min[2], candidate.min[2]) &&
              near(other.max[2], candidate.max[2]),
          )
          .sort((a, b) => a.min[1] - b.min[1]);
        let end = low;
        for (const { min, max } of aligned) {
          if (min[1] > end + epsilon) break;
          end = Math.max(end, max[1]);
          if (end >= high - epsilon) return true;
        }
        return false;
      });
  }
  return { left: closest("left"), right: closest("right") };
}
