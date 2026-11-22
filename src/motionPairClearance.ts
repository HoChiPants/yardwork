import type { V3 } from "./model";
import { intervalSeparated, solidGap, type CollisionSolid, type GapEndpoints } from "./solidCollision";

export type PairClearanceResult =
  | { status: "met" }
  | { status: "short"; gap: number; at: number }
  | { status: "needs-review"; reason: string };

const gapRoundoff = 1e-7;
const gapSearchResolution = 1 / 256;
const gapSearchBudget = 512;

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

export type ClosestPairGap = { at: number; gap: number; lowerBound: number; endpoints?: GapEndpoints };

/** The best checked pose bounds the minimum from above. Keep an interval
 * lower bound even if the search reaches its evaluation budget. */
export async function findClosestPairGap(
  travel: number,
  posePair: (at: number) => [CollisionSolid, CollisionSolid],
  speedBound: (axis?: V3) => number,
  signal?: AbortSignal,
): Promise<ClosestPairGap> {
  signal?.throwIfAborted();
  let bestPair = posePair(0);
  let best = { at: 0, gap: solidGap(...bestPair) };
  function result(lowerBound: number): ClosestPairGap {
    let endpoints: GapEndpoints | undefined;
    if (best.gap > 0) solidGap(...bestPair, (points) => { endpoints = points; });
    return { ...best, lowerBound, endpoints };
  }
  const speed = speedBound();
  if (travel === 0 || speed === 0 || best.gap === 0)
    return result(Math.max(0, best.gap - gapRoundoff));
  function check(at: number, pair: [CollisionSolid, CollisionSolid]) {
    const gap = solidGap(...pair);
    if (gap < best.gap) {
      best = { at, gap };
      bestPair = pair;
    }
    return gap;
  }
  check(travel, posePair(travel));
  function interval(start: number, end: number, previousLowerBound: number) {
    const half = (end - start) / 2;
    const at = start + half;
    const pair = posePair(at);
    const gap = check(at, pair);
    let lowerBound = Math.max(previousLowerBound, gap - speed * half - gapRoundoff);
    const target = best.gap - gapSearchResolution;
    // Projection speed can be zero on a useful separating axis even
    // when the parts move quickly along the drawer's travel direction.
    if (target > lowerBound && intervalSeparated(...pair, (axis) => target + speedBound(axis) * half, 0))
      lowerBound = target;
    return { start, end, at, lowerBound };
  }
  const remaining = [interval(0, travel, 0)];
  let nextYield = performance.now() + 16;
  for (let checked = 3; checked + 2 <= gapSearchBudget; checked += 2) {
    signal?.throwIfAborted();
    let first = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (remaining[i].lowerBound < remaining[first].lowerBound) first = i;
    }
    const candidate = remaining[first];
    const { start, end, at, lowerBound } = candidate;
    if (lowerBound >= best.gap - gapSearchResolution || at === start || at === end) break;
    remaining.splice(first, 1, interval(start, at, lowerBound), interval(at, end, lowerBound));
    if (performance.now() >= nextYield) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      nextYield = performance.now() + 16;
    }
  }
  signal?.throwIfAborted();
  return result(Math.min(best.gap, ...remaining.map((row) => row.lowerBound)));
}
