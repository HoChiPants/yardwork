import type { V3 } from "./model";
import { intervalSeparated, solidGap, type CollisionSolid } from "./solidCollision";

export type PairClearanceResult =
  | { status: "met" }
  | { status: "short"; gap: number; at: number }
  | { status: "needs-review"; reason: string };

const gapRoundoff = 1e-7;

/** A sampled shortfall proves that the margin fails. A pass requires a
 * separation bound for every interval, including poses between samples. */
export function sweepPairClearance(
  minimum: number,
  travel: number,
  posePair: (at: number) => [CollisionSolid, CollisionSolid],
  speedBound: (axis?: V3) => number,
): PairClearanceResult {
  const unknown: PairClearanceResult = {
    status: "needs-review",
    reason: "The sweep could not resolve a close gap at the requested margin.",
  };
  let visited = 0;
  const search = (start: number, end: number, depth: number): PairClearanceResult => {
    if (++visited > 512) return unknown;
    const half = (end - start) / 2;
    const at = start + half;
    const [a, b] = posePair(at);
    const limit = minimum - gapRoundoff;
    if (intervalSeparated(a, b, (axis) => limit + speedBound(axis) * half, 0))
      return { status: "met" };
    const gap = solidGap(a, b);
    if (gap < limit) return { status: "short", gap, at };
    if (gap - speedBound() * half >= limit) return { status: "met" };
    if (depth >= 15) return unknown;
    const earlier = search(start, at, depth + 1);
    if (earlier.status === "short") return earlier;
    const later = search(at, end, depth + 1);
    return later.status === "short" || earlier.status === "met" ? later : earlier;
  };
  return search(0, travel, 0);
}
