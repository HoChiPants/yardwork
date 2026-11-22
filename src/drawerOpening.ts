import {
  motionReviewTravel, motionTestFindings, resolveMotionTestSetup, reviewMotion, runMotionTest,
  type MotionReview,
} from "./mechanismMotion";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";
import { partLabel } from "./partLabels";

type SearchSetup = Pick<MotionTestSetup, "held" | "clearance">;
export type DrawerStopRequest = { extension?: number } &
  ({ angle: number; angles?: never } | { angles: number[]; angle?: never });

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
type StopCheck = {
  status: "clear" | "review";
  angle: number;
  setup: MotionTestSetup;
  findings: string[];
  canTryShorter: boolean;
};
type VerifiedDrawerTravel = { extension: number; setup: MotionTestSetup };
type DrawerStopComparison = StopCheck & { verified?: VerifiedDrawerTravel };
const drawerTravelIncrement = 0.125;

export function parseDrawerStopAngles(text: string): number[] | undefined {
  const entries = text.trim().split(/\s*(?:,\s*(?:and\s+)?|\band\b|\n)\s*/i);
  const angles = entries.map((entry) => Number(/^(\d+(?:\.\d+)?)\s*(?:°|deg(?:rees?)?)?$/i.exec(entry)?.[1]));
  return angles.every(Number.isFinite) ? [...new Set(angles)] : undefined;
}

function openingPair(selected: MotionPlan, companion: MotionPlan, drawerTravel: number) {
  const pair = doorAndDrawer(selected, companion);
  if (!pair) throw Error("Choose one hinged motion and one sliding motion.");
  if (!Number.isFinite(drawerTravel) || drawerTravel <= 0 || drawerTravel > pair.drawer.mechanism.travel)
    throw Error("Enter an extension within the drawer's saved travel.");
  return pair;
}

function doorFirstSetup(
  selected: MotionPlan,
  companion: MotionPlan,
  door: MotionPlan,
  angle: number,
  drawerTravel: number,
  test: SearchSetup,
): MotionTestSetup {
  const hinge = { kind: "hinge", travel: angle } as const;
  const slide = { kind: "slide", travel: drawerTravel } as const;
  const selectedDoor = selected.id === door.id;
  return {
    ...test,
    linkedId: companion.id,
    openingOrder: selectedDoor ? "selected-first" : "companion-first",
    sequenceTargets: selectedDoor ? { selected: hinge, companion: slide } : { selected: slide, companion: hinge },
  };
}

function reviewPasses(review: MotionReview, end = motionReviewTravel(review)) {
  if (review.hits.length || review.zone.length || review.siteFindings.length ||
      review.unresolvedIds.length || (review.clearance && review.clearance.result.status !== "met")) return false;
  const opening = review.playbackLimit(0, end);
  const closing = review.playbackLimit(end, 0);
  return opening.inspectAt === undefined && opening.travel === end &&
    closing.inspectAt === undefined && closing.travel === 0;
}

const yieldToPage = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function stopSetup(selected: MotionPlan, companion: MotionPlan, drawerTravel: number, angle: number, test: SearchSetup) {
  const { door } = openingPair(selected, companion, drawerTravel);
  if (!Number.isFinite(angle) || angle < 0.01 || angle > door.mechanism.travel)
    throw Error("Enter a stop angle within the door's saved travel.");
  return doorFirstSetup(selected, companion, door, angle, drawerTravel, test);
}

function canShortenDrawerTravel(review: MotionReview, extension: number) {
  const clearance = review.clearance;
  // The door leg and all closed positions stay the same when the drawer target changes.
  return extension > drawerTravelIncrement && !review.unresolvedIds.length &&
    ![...review.hits, ...review.zone, ...review.siteFindings].some(({ phase }) => phase === 0) &&
    (clearance?.result.status !== "short" || clearance.phase !== 0) &&
    review.playbackLimit(0, motionReviewTravel(review)).phase !== 0;
}

/** Test the exact installed stop, including the swing with the drawer shut and the reverse sequence. */
export function checkDrawerStop(
  project: Project,
  selected: MotionPlan,
  companion: MotionPlan,
  drawerTravel: number,
  angle: number,
  test: SearchSetup,
): StopCheck {
  const setup = stopSetup(selected, companion, drawerTravel, angle, test);
  const result = runMotionTest(project, selected, setup);
  if (result.review && reviewPasses(result.review))
    return { status: "clear", angle, setup, findings: [], canTryShorter: false };
  const describePart = (project: Project, id: string) => {
    const label = partLabel(project, id);
    const piece = project.pieces.find((row) => row.id === id);
    return piece ? `${label} · ${piece.name}` : label;
  };
  const findings = motionTestFindings(project, result, false, describePart)
    .filter(({ id }) => id !== "pair-clearance" || result.review?.clearance?.result.status !== "met")
    .map(({ detail }) => detail);
  if (!findings.length) findings.push("Playback could not verify the whole opening and closing sequence at this stop.");
  return { status: "review", angle, setup, findings, canTryShorter: !!result.review && canShortenDrawerTravel(result.review, drawerTravel) };
}

/** Look for a shorter prefix of the same drawer path and verify the reverse sequence too. */
export async function findShorterDrawerTravel(
  project: Project,
  selected: MotionPlan,
  companion: MotionPlan,
  drawerTravel: number,
  angle: number,
  test: SearchSetup,
  signal?: AbortSignal,
): Promise<VerifiedDrawerTravel | undefined> {
  await yieldToPage();
  signal?.throwIfAborted();
  const { review } = runMotionTest(project, selected, stopSetup(selected, companion, drawerTravel, angle, test));
  if (!review || reviewPasses(review) || !canShortenDrawerTravel(review, drawerTravel)) return;
  return searchShorterDrawerTravel(project, selected, companion, drawerTravel, angle, test, signal);
}

async function searchShorterDrawerTravel(
  project: Project,
  selected: MotionPlan,
  companion: MotionPlan,
  drawerTravel: number,
  angle: number,
  test: SearchSetup,
  signal?: AbortSignal,
) {
  let first = 1;
  let last = Math.ceil(drawerTravel / drawerTravelIncrement) - 1;
  let verified: VerifiedDrawerTravel | undefined;
  let nextYield = performance.now() + 16;
  while (first <= last) {
    signal?.throwIfAborted();
    const index = Math.floor((first + last) / 2);
    const extension = index * drawerTravelIncrement;
    const setup = stopSetup(selected, companion, extension, angle, test);
    const { review: candidate } = runMotionTest(project, selected, setup);
    if (candidate && reviewPasses(candidate)) {
      verified = { extension, setup };
      first = index + 1;
    } else {
      last = index - 1;
    }
    if (performance.now() >= nextYield) {
      await yieldToPage();
      nextYield = performance.now() + 16;
    }
  }
  signal?.throwIfAborted();
  return verified;
}

export async function compareDrawerStops(
  project: Project,
  selected: MotionPlan,
  companion: MotionPlan,
  drawerTravel: number,
  angles: readonly number[],
  test: SearchSetup,
  options: { signal?: AbortSignal; onProgress?: (progress: SearchProgress) => void } = {},
): Promise<DrawerStopComparison[]> {
  const { door } = openingPair(selected, companion, drawerTravel);
  const stops = [...new Set(angles)];
  if (stops.length < 2) throw Error("Enter at least two different stop angles.");
  if (stops.some((angle) => !Number.isFinite(angle) || angle < 0.01 || angle > door.mechanism.travel))
    throw Error("Enter stop angles within the door's saved travel.");
  const rows: DrawerStopComparison[] = [];
  for (const angle of stops) {
    await yieldToPage();
    options.signal?.throwIfAborted();
    const checked = checkDrawerStop(project, selected, companion, drawerTravel, angle, test);
    const verified = checked.status === "clear"
      ? { extension: drawerTravel, setup: checked.setup }
      : checked.canTryShorter
        ? await searchShorterDrawerTravel(project, selected, companion, drawerTravel, angle, test, options.signal)
        : undefined;
    rows.push({ ...checked, verified });
    options.onProgress?.({ tried: rows.length, total: stops.length });
  }
  options.signal?.throwIfAborted();
  return rows;
}

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
  const { door, drawer } = openingPair(selected, companion, drawerTravel);
  const makeSetup = (angle: number) => doorFirstSetup(selected, companion, door, angle, drawerTravel, test);
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
