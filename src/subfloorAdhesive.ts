import { formatPreciseInches } from "./measurement";
import type { Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { subfloorReviews, type SubfloorReview } from "./subfloor";
import { subfloorAdhesive, subfloorAdhesiveInstallation, subfloorAdhesiveScope } from "./subfloorReference";
import { subfloorAdhesivePlansSchema } from "./subfloorSchema";

const epsilon = 0.00001;
const overlap = ([a, b]: [number, number], [c, d]: [number, number]) => Math.min(b, d) - Math.max(a, c);

function adhesiveRuns(layout: NonNullable<SubfloorReview["layout"]>) {
  return layout.bearingStrips.map(({ support, length, width, across, path }) => {
    const [start, end] = across ? width : length;
    const [low, high] = across ? length : width;
    const segments = Math.ceil((end - start) / 8);
    const mid = (low + high) / 2;
    // An illustrative zigzag stays a bead radius inside the measured strip.
    const excursion = Math.min(0.25, Math.max(0, (high - low - subfloorAdhesive.bead) / 2));
    const points = Array.from({ length: segments + 1 }, (_, i) =>
      path(start + (end - start) * i / segments, mid + (i % 2 ? excursion : -excursion)));
    const inches = points.slice(1).reduce((total, point, i) => total + Math.hypot(
      point[0] - points[i][0], point[2] - points[i][2],
    ), 0);
    return { supportId: support.id, points, inches };
  });
}

function contactSignature(layout: NonNullable<SubfloorReview["layout"]>) {
  // Include product, member geometry and both measured contact corners. Uniform
  // translations also require re-review because the overlay locations move.
  const key = JSON.stringify([subfloorAdhesive.id, ...layout.bearingStrips.map(({ support, corners, across }) =>
    [support.id, support.material, across, ...corners.flat().map((value) => Math.round(value * 100_000))])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++)
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `contact-${(hash >>> 0).toString(16)}`;
}

export type SubfloorAdhesiveReview = {
  panelId: string;
  saved: boolean;
  planCurrent: boolean;
  problem?: string;
  layout?: {
    center: V3;
    signature: string;
    runs: ReturnType<typeof adhesiveRuns>;
    inches: number;
  };
};

export function reviewSubfloorAdhesive(project: Project, review: SubfloorReview): SubfloorAdhesiveReview {
  const { panelId, layout } = review;
  const record = project.subfloorAdhesivePlans?.find((plan) => plan.panelId === panelId);
  const pending = { panelId, saved: !!record, planCurrent: false };
  if (!layout || layout.issues.length || !layout.bearingStrips.length)
    return { ...pending, problem: "Resolve the sheet’s support and spacing findings before laying out adhesive." };
  const strips = layout.bearingStrips;
  if (strips.some(({ length, width, across }) => {
    const [a, b] = across ? length : width;
    return b - a < subfloorAdhesive.bead - epsilon;
  })) return { ...pending, problem: "A bearing strip is too narrow for the ¼ in bead. Review the framing contact." };
  if (strips.some(({ length, width }, i) => strips.slice(i + 1).some((other) =>
    overlap(length, other.length) > epsilon && overlap(width, other.width) > epsilon)))
    return { ...pending, problem: "Some framing contacts cover the same space. Clear the overlapping supports first." };
  const fixed = new Set([panelId, ...layout.supportIds]);
  if (project.motionPlans?.some(({ memberIds }) => memberIds.some((id) => fixed.has(id))))
    return { ...pending, problem: "The sheet or its framing moves in a saved motion. Confirm a fixed support assembly before adding adhesive." };

  const signature = contactSignature(layout);
  const planCurrent = record?.contactSignature === signature;
  const runs = adhesiveRuns(layout);
  return {
    ...pending, planCurrent,
    ...(record && !planCurrent && { problem: "The bearing strips changed. Review and save the updated adhesive routes." }),
    layout: {
      center: layout.center, signature, runs,
      inches: runs.reduce((total, run) => total + run.inches, 0),
    },
  };
}

export function subfloorAdhesiveReviews(project: Project) {
  const ids = project.subfloorAdhesivePlans?.map(({ panelId }) => panelId) ?? [];
  return subfloorReviews(project, ids).map((review) => reviewSubfloorAdhesive(project, review));
}

export function saveSubfloorAdhesive(project: Project, panelId: string, signature: string | null): Project {
  const plans = (project.subfloorAdhesivePlans ?? []).filter((plan) => plan.panelId !== panelId);
  if (signature) {
    const review = reviewSubfloorAdhesive(project, subfloorReviews(project, [panelId])[0]);
    if (signature !== review.layout?.signature)
      throw Error("The bearing strips changed. Preview the adhesive again before saving.");
    plans.push({ panelId, contactSignature: signature });
  }
  return { ...project, subfloorAdhesivePlans: subfloorAdhesivePlansSchema.parse(plans), guideFingerprint: null };
}

export function subfloorAdhesiveTakeoff(project: Project, reviews = subfloorAdhesiveReviews(project)) {
  const inches = reviews.reduce((total, review) => total + (review.planCurrent ? review.layout!.inches : 0), 0);
  return {
    inches,
    required: reviews.some(({ planCurrent }) => !planCurrent)
      ? null : Math.ceil(inches / (12 * subfloorAdhesive.coverageFeet)),
  };
}

export function subfloorAdhesiveReport(project: Project) {
  const reviews = subfloorAdhesiveReviews(project);
  if (!reviews.length) return [];
  const { inches, required } = subfloorAdhesiveTakeoff(project, reviews);
  return [
    subfloorAdhesiveScope,
    subfloorAdhesiveInstallation,
    ...reviews.flatMap(({ panelId, layout, problem }) => [
      `${partLabel(project, panelId)} · ${problem ?? `${layout!.runs.length} framing bead runs · about ${(layout!.inches / 12).toFixed(1)} linear ft`}`,
      ...(!problem && layout ? layout.runs.map(({ supportId, inches }) =>
        `${partLabel(project, supportId)} · ${formatPreciseInches(inches)} of estimated bead`) : []),
    ]),
    required === null ? "Review changed or incomplete sheets to finish the cartridge estimate."
      : `About ${(inches / 12).toFixed(1)} linear ft total · ${required} × 28 fl oz ${subfloorAdhesive.model} cartridge(s), based on ${subfloorAdhesive.coverageFeet} linear ft per cartridge.`,
  ];
}
