import { Vector3 } from "three";
import { bindingHash } from "./ideaBindingState";
import type { Project } from "./model";
import {
  rodMeasurementTolerance,
  rodSupportIntentSchema,
  rodSupportSchema,
  type RodFitPlan,
  type RodSupport,
} from "./rodFitSchema";
import type { reviewRodFit, rodBay } from "./rodFits";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";

export const rodBracketProductId = "project-source-27587phllg";
export const rodIntermediateReference =
  "https://www.lowes.com/pd/Project-Source-12-84-in-L-x-1-06-in-W-x-12-84-in-D-Heavy-Duty-White-Shelf-Bracket/50376150";
export const rodReferenceSpacing = 32;

const epsilon = 0.0001;
type Fit = ReturnType<typeof reviewRodFit>;
type Bay = ReturnType<typeof rodBay>;

function fitKey(plan: RodFitPlan) {
  const { measuredSpan, startSetback, endSetback, clearance, closedEnd } =
    plan.measurements;
  return bindingHash([
    plan.start,
    plan.end,
    plan.modeledSpan,
    measuredSpan,
    startSetback,
    endSetback,
    clearance,
    closedEnd,
    ...(plan.rodMaterial ? [plan.rodMaterial] : []),
  ]);
}

function supportCenter(bay: Bay, fromStart: number) {
  return new Vector3(...bay.rod.position).addScaledVector(
    bay.axis,
    bay.start.t + fromStart,
  );
}

function isInsideTube(plan: RodFitPlan, bay: Bay, fromStart: number) {
  const m = plan.measurements;
  const t = bay.start.t + fromStart;
  return (
    fromStart > m.startSetback + m.clearance / 2 + epsilon &&
    fromStart < m.measuredSpan - m.endSetback - m.clearance / 2 - epsilon &&
    Math.abs(t) < bay.rod.size[1] / 2 - epsilon
  );
}

function activeFit(fit: Fit) {
  return fit.state === "measured" &&
    fit.plan &&
    fit.bay &&
    fit.delta !== null &&
    Math.abs(fit.delta) <= rodMeasurementTolerance
    ? { plan: fit.plan, bay: fit.bay }
    : null;
}

export function reviewRodSupports(fit: Fit) {
  const active = activeFit(fit);
  const rows = (fit.plan?.intermediateSupports ?? []).map((support) => {
    if (
      !active ||
      (support.bracketProductId === everbiltRodBracket.productId &&
        !fit.matchesModel) ||
      support.fitKey !== fitKey(active.plan) ||
      supportCenter(active.bay, support.fromStart).distanceTo(
        new Vector3(...support.centerWorld),
      ) > epsilon ||
      active.bay.axis.distanceTo(new Vector3(...support.axisWorld)) > epsilon ||
      !isInsideTube(active.plan, active.bay, support.fromStart)
    )
      return { support, state: "stale" as const };
    if (support.bracketReach === null || support.wallToRod === null)
      return { support, state: "pending" as const };
    return {
      support,
      state:
        Math.abs(support.bracketReach - support.wallToRod) <=
        rodMeasurementTolerance
          ? ("reach-reviewed" as const)
          : ("conflict" as const),
    };
  });
  const offsets = rows
    .filter(({ state }) => state === "pending" || state === "reach-reviewed")
    .map(({ support }) => support.fromStart)
    .sort((a, b) => a - b);
  const span = fit.bay
    ? Math.max(fit.bay.span, fit.plan?.measurements.measuredSpan ?? 0)
    : null;
  const endpoints = span === null ? [] : [0, ...offsets, span];
  const intervals = endpoints.slice(1).map((end, index) => ({
    start: endpoints[index],
    end,
    length: end - endpoints[index],
  }));
  const widest = intervals.reduce<(typeof intervals)[number] | null>(
    (largest, gap) => (largest && largest.length >= gap.length ? largest : gap),
    null,
  );
  const spacingReference =
    (fit.bay?.rod.material ?? fit.plan?.rodMaterial) ===
    everbiltClosetRod.materialId
      ? null
      : rodReferenceSpacing;
  const suggestion =
    widest &&
    spacingReference !== null &&
    widest.length > spacingReference + epsilon
      ? (widest.start + widest.end) / 2
      : null;
  return {
    rows,
    intervals,
    longest: widest?.length ?? null,
    spacingReference,
    exceedsReference: suggestion !== null,
    readyToLayOut: !!active,
    suggestion:
      suggestion !== null &&
      active &&
      isInsideTube(active.plan, active.bay, suggestion)
        ? suggestion
        : null,
  };
}

export const rodSupportStateLabel = {
  stale: "Recheck location and site measurements",
  pending: "Reach measurements pending",
  conflict: "Bracket reach differs from the measured wall-to-rod distance",
  "reach-reviewed": "Recorded reach matches within 1/32 in",
};

function replaceRodFit(project: Project, plan: RodFitPlan) {
  return {
    ...project,
    rodFitPlans: (project.rodFitPlans ?? []).map((row) =>
      row.rodId === plan.rodId ? plan : row,
    ),
  };
}

export function saveRodSupport(
  project: Project,
  fit: Fit,
  input: unknown,
  id?: string,
) {
  const active = activeFit(fit);
  if (!active)
    throw Error(
      "Save current field measurements that match the modeled opening before laying out a support.",
    );
  const { plan, bay } = active;
  const intent = rodSupportIntentSchema.parse(input);
  if (
    intent.bracketProductId &&
    bay.rod.material !== everbiltClosetRod.materialId
  )
    throw Error(
      "The Everbilt 14317 option is reviewed here for the Everbilt 320V rod.",
    );
  if (!isInsideTube(plan, bay, intent.fromStart))
    throw Error(
      "Place the support inside both the measured cut and the modeled rod.",
    );
  const supports = plan.intermediateSupports ?? [];
  if (id && !supports.some((support) => support.id === id))
    throw Error("This support record is missing.");
  if (!id && supports.length >= 12)
    throw Error("This rod has reached its 12-support record limit.");
  if (
    supports.some(
      (support) =>
        support.id !== id &&
        Math.abs(support.fromStart - intent.fromStart) <=
          rodMeasurementTolerance,
    )
  )
    throw Error(
      "A support is already recorded at this position. Edit that support.",
    );
  const oldMount = supports.find((support) => support.id === id)?.mounting;
  const record: RodSupport = rodSupportSchema.parse({
    ...intent,
    id: id ?? crypto.randomUUID(),
    centerWorld: supportCenter(bay, intent.fromStart).toArray(),
    axisWorld: bay.axis.toArray(),
    fitKey: fitKey(plan),
    ...(oldMount ? { mounting: oldMount } : {}),
  });
  return replaceRodFit(project, {
    ...plan,
    intermediateSupports: id
      ? supports.map((support) => (support.id === id ? record : support))
      : [...supports, record],
  });
}

export function removeRodSupport(
  project: Project,
  plan: RodFitPlan,
  id: string,
) {
  return replaceRodFit(project, {
    ...plan,
    intermediateSupports: (plan.intermediateSupports ?? []).filter(
      (support) => support.id !== id,
    ),
  });
}
