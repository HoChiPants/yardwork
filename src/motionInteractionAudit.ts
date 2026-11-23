import { measuredBandingByPanel } from "./edgeBanding";
import { independentlyMovingContact, motionBoundsOverlap, motionSweepBounds, runMotionTest, trialMotionOpeningOrder, type IndependentMotionReview, type MotionPlaybackLimit, type MotionTestSelection } from "./mechanismMotion";
import type { Project } from "./model";
import { motionOpeningOrders, motionStopText } from "./motionOrderLabels";
import type { MotionOpeningOrder, MotionPlan, MotionTestSetup } from "./motionPlanSchema";
import { partLabel } from "./partLabels";

type PathResult = { order?: MotionOpeningOrder; clear: boolean; issue?: string };
type AuditPair = { selected: MotionPlan; companion: MotionPlan; paths: PathResult[] };

export function firstOrderStop(trial: ReturnType<typeof trialMotionOpeningOrder>) {
  if (trial.opening?.inspectAt !== undefined) return { direction: "Opening", stop: trial.opening } as const;
  if (trial.closing?.inspectAt !== undefined) return { direction: "Closing", stop: trial.closing } as const;
}

export function interactionSetup(companion: MotionPlan): MotionTestSetup {
  return { linkedId: companion.id, held: [] };
}

export function heldInteractionTest(project: Project, selected: MotionPlan, companion: MotionPlan, contact: IndependentMotionReview) {
  if (!("movingId" in contact)) return null;
  const setup: MotionTestSetup = {
    held: [{ motionId: companion.id, percent: 100 * contact.companionTravel / companion.mechanism.travel }],
  };
  const witness: MotionPlaybackLimit = {
    travel: contact.selectedTravel,
    inspectAt: contact.selectedTravel,
  };
  if ("minimum" in contact) {
    const requirement = { movingId: contact.movingId, otherId: contact.obstacleId, minimum: contact.minimum };
    setup.clearance = requirement;
    witness.clearanceStop = contact.status === "short" ? { requirement, gap: contact.gap }
      : { requirement, reason: "Exterior envelope only. Measure the actual gap." };
    if (contact.status === "short") witness.gapEndpoints = contact.endpoints;
  } else {
    witness.contact = { movingId: contact.movingId, obstacleId: contact.obstacleId, kind: contact.status };
  }
  const inspection: NonNullable<MotionTestSelection["inspection"]> = {
    name: `${setup.clearance ? "Gap at different openings" : "Different openings"} · ${selected.label} + ${companion.label}`,
    stop: witness,
  };
  return { plan: selected, setup, result: runMotionTest(project, selected, setup), inspection };
}

export async function auditMotionInteractions(
  project: Project,
  { signal, onProgress, minimum = 0, describe = (id) => partLabel(project, id) }: {
    signal?: AbortSignal;
    onProgress?: (checked: number, total: number) => void;
    minimum?: number;
    describe?: (id: string) => string;
  } = {},
) {
  signal?.throwIfAborted();
  const banding = measuredBandingByPanel(project);
  const unavailable: { plan: MotionPlan; reason: string }[] = [];
  const sweeps = (project.motionPlans ?? []).flatMap((plan) => {
    try {
      return [{ plan, bounds: motionSweepBounds(project, plan, banding) }];
    } catch (cause) {
      unavailable.push({ plan, reason: cause instanceof Error ? cause.message : "Check this motion's parts." });
      return [];
    }
  });
  let separated = 0, shared = 0;
  const pairs: AuditPair[] = [];
  for (const [index, first] of sweeps.entries()) {
    const members = new Set(first.plan.memberIds);
    for (const second of sweeps.slice(index + 1)) {
      if (second.plan.memberIds.some((id) => members.has(id))) {
        shared++;
      } else if (!motionBoundsOverlap(first.bounds, second.bounds, minimum)) {
        separated++;
      } else {
        pairs.push({ selected: first.plan, companion: second.plan, paths: [] });
      }
    }
  }
  const total = pairs.length * (motionOpeningOrders.length + 1);
  let checked = 0;
  const results: (AuditPair & { independent: IndependentMotionReview })[] = [];
  onProgress?.(checked, total);
  for (const pair of pairs) {
    const setup = interactionSetup(pair.companion);
    for (const order of motionOpeningOrders) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const trial = trialMotionOpeningOrder(project, pair.selected, setup, order);
      const finding = firstOrderStop(trial);
      const issue = finding && trial.result.review
        ? `${finding.direction} stop · ${motionStopText(trial.result.review, finding.stop, describe)}`
        : trial.result.error ?? (trial.clear ? undefined : "The geometry or clearance needs review.");
      pair.paths.push({ order, clear: trial.clear === true, issue });
      onProgress?.(++checked, total);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    results.push({ ...pair, independent: independentlyMovingContact(project, pair.selected, pair.companion, banding, minimum) });
    onProgress?.(++checked, total);
  }
  signal?.throwIfAborted();
  return {
    pairs: results.sort((a, b) =>
      Number(a.independent.status === "clear" && a.paths.every(({ clear }) => clear)) -
      Number(b.independent.status === "clear" && b.paths.every(({ clear }) => clear))),
    separated, shared, unavailable,
  };
}
