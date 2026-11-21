import {
  motionReviewTravel, resolveMotionTestSetup, reviewMotion, runMotionTest,
  type MotionReview,
} from "./mechanismMotion";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

type SearchSetup = Pick<MotionTestSetup, "held" | "clearance">;

export function doorAndDrawer(first: MotionPlan, second: MotionPlan) {
  if (first.mechanism.kind === second.mechanism.kind) return undefined;
  const [door, drawer] = first.mechanism.kind === "hinge" ? [first, second] : [second, first];
  return { door, drawer };
}

type SearchProgress = { tried: number; total: number };
type Recommendation = SearchProgress & {
  status: "clear" | "unavailable";
  angle: number;
  maximum: number;
  setup: MotionTestSetup;
};

function reviewPasses(review: MotionReview, end = motionReviewTravel(review)) {
  if (review.hits.length || review.zone.length || review.siteFindings.length ||
      review.unresolvedIds.length || (review.clearance && review.clearance.result.status !== "met")) return false;
  const opening = review.playbackLimit(0, end);
  const closing = review.playbackLimit(end, 0);
  return opening.inspectAt === undefined && opening.travel === end &&
    closing.inspectAt === undefined && closing.travel === 0;
}

const yieldToPage = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Try the whole-degree openings and the reachable endpoint. Clearance can
 * change in either direction with angle, so a failed angle never skips a band. */
export async function findDrawerOpening(
  project: Project,
  selected: MotionPlan,
  companion: MotionPlan,
  drawerTravel: number,
  test: SearchSetup,
  options: { signal?: AbortSignal; onProgress?: (progress: SearchProgress) => void } = {},
): Promise<Recommendation> {
  const pair = doorAndDrawer(selected, companion);
  if (!pair) throw Error("Choose one hinged motion and one sliding motion.");
  const { door, drawer } = pair;
  if (!Number.isFinite(drawerTravel) || drawerTravel <= 0 || drawerTravel > drawer.mechanism.travel)
    throw Error("Enter an extension within the drawer's saved travel.");
  const makeSetup = (doorAngle: number): MotionTestSetup => {
    const doorTarget = { kind: "hinge", travel: doorAngle } as const;
    const drawerTarget = { kind: "slide", travel: drawerTravel } as const;
    const doorFirst = selected.id === door.id;
    return {
      ...test,
      linkedId: companion.id,
      openingOrder: doorFirst ? "selected-first" : "companion-first",
      sequenceTargets: doorFirst
        ? { selected: doorTarget, companion: drawerTarget }
        : { selected: drawerTarget, companion: doorTarget },
    };
  };
  await yieldToPage();
  options.signal?.throwIfAborted();
  const { held } = resolveMotionTestSetup(project, makeSetup(door.mechanism.travel));
  const doorTravel = reviewMotion(project, door, [...held, { plan: drawer, travel: 0 }]);
  const reachable = doorTravel.playbackLimit(0, door.mechanism.travel).travel;
  // Keep any fractional stop on the checked side of the boundary at display precision.
  const maximum = Math.floor(reachable * 100 + 1e-9) / 100;
  const angles = Array.from({ length: Math.floor(maximum) }, (_, index) => index + 1);
  if (maximum > 0 && !Number.isInteger(maximum)) angles.push(maximum);
  options.onProgress?.({ tried: 0, total: angles.length });
  let nextYield = performance.now() + 16;
  for (const [index, angle] of angles.entries()) {
    options.signal?.throwIfAborted();
    const drawerPath = reviewMotion(project, drawer, [...held, { plan: door, travel: angle }], undefined, drawerTravel);
    if (reviewPasses(drawerPath, drawerTravel)) {
      const setup = makeSetup(angle);
      const result = runMotionTest(project, selected, setup);
      if (result.review && reviewPasses(result.review))
        return { status: "clear", angle, maximum, setup, tried: index + 1, total: angles.length };
    }
    if (performance.now() >= nextYield) {
      options.onProgress?.({ tried: index + 1, total: angles.length });
      await yieldToPage();
      nextYield = performance.now() + 16;
    }
  }
  return {
    status: "unavailable", angle: maximum, maximum, setup: makeSetup(maximum || door.mechanism.travel),
    tried: angles.length, total: angles.length,
  };
}
