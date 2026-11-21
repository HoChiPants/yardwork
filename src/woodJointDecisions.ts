import { attachmentGeometryFingerprint } from "./attachments";
import { reviewConnectionContact } from "./connectionContacts";
import type { Piece, Project, V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { packRuns } from "./stockRunPacking";
import { trimBackerRodLength, trimBackerRods } from "./trimBackerRodReference";
import { estimateModeledTrimSeam, modeledTrimSeamEdges } from "./trimSeamGeometry";
import { trimSealant } from "./trimSealantReference";
import { maxSupplyQuantity } from "./supplySchema";
import {
  trimSeamInputSchema,
  woodJointDecisionSchema,
  woodJointDecisionsSchema,
  type TrimSeamInput,
  type WoodJointDecision,
  type WoodJointMethod,
} from "./woodJointDecisionSchema";

export const woodJointMethods: Record<WoodJointMethod, string> = {
  glue: "Glue joint",
  fitted: "Fitted joinery",
  sealant: "Seal exposed seam",
  "intentional-contact": "Intentional contact",
};

export const woodJointDecisionScope =
  "These are recorded joint details. Verify actual fit, materials, assembly and capacity before building.";

export function woodPairKey(firstId: string, secondId: string) {
  return firstId < secondId ? `${firstId}/${secondId}` : `${secondId}/${firstId}`;
}

function signature(first: Piece, second: Piece) {
  const inverse = inverseRotation(first.rotation);
  const relative = (vector: V3) => rotate(vector, inverse).map((n) => Number(n.toFixed(6)));
  const offset = second.position.map((n, i) => n - first.position[i]) as V3;
  const basis: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return JSON.stringify([
    attachmentGeometryFingerprint(first),
    attachmentGeometryFingerprint(second),
    relative(offset),
    basis.map((axis) => relative(rotate(axis, second.rotation))),
  ]);
}

function reviewable(first: Piece, second: Piece, method: WoodJointMethod) {
  const contact = reviewConnectionContact(first, second, method === "sealant" ? trimSealant.screenWidth : undefined);
  return contact.state === "face-contact" || (method === "sealant" && contact.state === "near-face");
}

export function woodJointDecisionStatus(
  decision: WoodJointDecision,
  first: Piece | undefined,
  second: Piece | undefined,
): "current" | "changed" | "unavailable" {
  if (!first || !second || first.offcut || second.offcut) return "unavailable";
  return decision.contactSignature === signature(first, second) &&
    reviewable(first, second, decision.method) ? "current" : "changed";
}

export function saveWoodJointDecision(
  project: Project, aId: string, bId: string, method: WoodJointMethod, note: string,
): Project {
  const [firstId, secondId] = [aId, bId].sort();
  const first = project.pieces.find(({ id }) => id === firstId);
  const second = project.pieces.find(({ id }) => id === secondId);
  if (!first || !second || first.id === second.id ||
      !reviewable(first, second, method))
    throw Error("Choose wood parts with touching faces, or nearby faces for an exposed seam.");
  const prior = project.woodJointDecisions?.find((row) =>
    row.firstId === firstId && row.secondId === secondId);
  const decision = woodJointDecisionSchema.parse({
    firstId, secondId, method, note, contactSignature: signature(first, second),
    ...(method === "sealant" && prior?.trimSeam && { trimSeam: prior.trimSeam }),
  });
  const rest = (project.woodJointDecisions ?? []).filter((row) =>
    row.firstId !== firstId || row.secondId !== secondId);
  return { ...project, woodJointDecisions: woodJointDecisionsSchema.parse([...rest, decision]) };
}

export function saveTrimSeam(project: Project, aId: string, bId: string, draft: TrimSeamInput | null) {
  const id = woodPairKey(aId, bId);
  const decisions = project.woodJointDecisions ?? [];
  const decision = decisions.find(({ firstId, secondId }) => woodPairKey(firstId, secondId) === id);
  if (!decision || decision.method !== "sealant")
    throw Error("Save a sealant joint detail first.");
  const { trimSeam: _previous, ...next } = decision;
  if (draft) {
    const first = project.pieces.find(({ id }) => id === decision.firstId);
    const second = project.pieces.find(({ id }) => id === decision.secondId);
    if (!first || !second || woodJointDecisionStatus(decision, first, second) !== "current")
      throw Error("Update the joint detail for the current fit before measuring its edges.");
    const shape = modeledTrimSeamEdges(first, second);
    if (!shape) throw Error("Measure this joint in the field to estimate its sealant.");
    const input = trimSeamInputSchema.parse(draft);
    estimateModeledTrimSeam(shape, input);
    return {
      ...project,
      woodJointDecisions: decisions.map((row) => row === decision
        ? woodJointDecisionSchema.parse({ ...next, trimSeam: { ...input, contactSignature: next.contactSignature } })
        : row),
    };
  }
  return { ...project, woodJointDecisions: decisions.map((row) => row === decision ? next : row) };
}

export function clearWoodJointDecision(project: Project, aId: string, bId: string): Project {
  const [firstId, secondId] = [aId, bId].sort();
  const rest = project.woodJointDecisions?.filter((row) =>
    row.firstId !== firstId || row.secondId !== secondId);
  if (!rest || rest.length === project.woodJointDecisions?.length) return project;
  if (rest.length) return { ...project, woodJointDecisions: rest };
  const { woodJointDecisions: _removed, ...next } = project;
  return next;
}

function reviewTrimSeam(
  decision: WoodJointDecision,
  status: ReturnType<typeof woodJointDecisionStatus>,
  first: Piece | undefined,
  second: Piece | undefined,
) {
  const plan = decision.trimSeam;
  if (!plan) return undefined;
  if (!first || !second || status !== "current" || plan.contactSignature !== decision.contactSignature)
    return { issue: "Seam fit changed or a member is unavailable. Review edges and measure again." } as const;
  const shape = modeledTrimSeamEdges(first, second);
  if (!shape) return { issue: "The current edge geometry needs measurement in the field." } as const;
  try {
    return { estimate: estimateModeledTrimSeam(shape, plan) } as const;
  } catch (issue) {
    return { issue: issue instanceof Error ? issue.message : "Review the saved seam measurements." } as const;
  }
}

export function woodJointDecisionEntries(project: Project) {
  if (!project.woodJointDecisions?.length) return [];
  const parts = new Map(project.pieces.map((part) => [part.id, part]));
  const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
  const stepNumbers = new Map(project.steps.map((step, i) => [step.id, i + 1]));
  const scrapsBySource = new Map<string, Piece>();
  if (project.woodJointDecisions.some(({ trimSeam }) => trimSeam)) {
    for (const scrap of project.pieces) {
      if (scrap.offcut && scrap.cutStock && !scrapsBySource.has(scrap.cutStock.id))
        scrapsBySource.set(scrap.cutStock.id, scrap);
    }
  }
  return project.woodJointDecisions.map((decision) => {
    const memberIds: [string, string] = [decision.firstId, decision.secondId];
    const first = parts.get(decision.firstId);
    const second = parts.get(decision.secondId);
    const status = woodJointDecisionStatus(decision, first, second);
    const stage = first && second && status !== "unavailable"
      ? Math.max(stepNumbers.get(first.stepId) ?? 0, stepNumbers.get(second.stepId) ?? 0)
      : 0;
    const title = memberIds.map((id) => {
      const label = labels.get(id) ?? "Removed member";
      const part = parts.get(id);
      return part && !part.offcut ? `${label} · ${part.name}` : `${label} (unavailable)`;
    }).join(" ↔ ");
    const trimSeam = reviewTrimSeam(decision, status, first, second);
    const trialScraps = new Set<string>();
    if (trimSeam?.estimate) {
      for (const member of [first, second]) {
        const scrap = member?.cutStock && scrapsBySource.get(member.cutStock.id);
        if (scrap && scrap.material === member.material) trialScraps.add(labels.get(scrap.id)!);
      }
    }
    return {
      id: woodPairKey(...memberIds), title, memberIds, decision, status, stage,
      trimSeam, trialScraps: [...trialScraps], firstLabel: labels.get(decision.firstId),
    };
  });
}

export type WoodJointDecisionEntry = ReturnType<typeof woodJointDecisionEntries>[number];

export function trimSeamLine(entry: WoodJointDecisionEntry) {
  const { trimSeam } = entry;
  if (!trimSeam) return "";
  if ("issue" in trimSeam) return trimSeam.issue;
  const { edges, note, backerRod } = trimSeam.estimate;
  const ranges = (spans: { start: number; end: number }[]) => spans
    .map(({ start, end }) => `${formatPreciseInches(start)} to ${formatPreciseInches(end)}`).join(", ");
  const spans = edges.map(({ label, length, openSpans, sealedSpans, localStart }) => {
    if (!openSpans.length) return `${label} (${formatPreciseInches(length)})`;
    const start = localStart.map((value, i) => `${"XYZ"[i]} ${formatPreciseInches(value)}`).join(", ");
    return [
      `${label} from ${entry.firstLabel}'s center (local ${start})`,
      sealedSpans.length ? `seal ${ranges(sealedSpans)}` : "",
      `keep open ${ranges(openSpans)}`,
    ].filter(Boolean).join(" · ");
  }).join(", ");
  const trial = entry.trialScraps.length
    ? ` Test the finish on ${entry.trialScraps.length === 1 ? "offcut" : "offcuts"} ${entry.trialScraps.join(", ")} from the same stock in Cut pool.`
    : "";
  const backing = backerRod
    ? ` Fit ${backerRod.name} along the seal runs before caulking.` : "";
  return `Trim sealant · ${spans} · ${note}${backing} Use a compatible cartridge gun.${trial}`;
}

export function trimBackerRodCutPlan(project: Project, entries = woodJointDecisionEntries(project)) {
  return trimBackerRods.flatMap((product) => {
    const runs = entries.flatMap(({ title, trimSeam }) => {
      const estimate = trimSeam?.estimate;
      if (estimate?.backerRod?.id !== product.id) return [];
      return estimate.edges.flatMap(({ label, sealedSpans }) =>
        sealedSpans.map((span) => ({ ...span, title: `${title} · ${label}` })),
      );
    });
    if (!runs.length) return [];
    const { bins } = packRuns(runs, trimBackerRodLength);
    return [{ product, rolls: bins }];
  });
}

export function trimBackerRodGuideLines(groups: ReturnType<typeof trimBackerRodCutPlan>) {
  return groups.flatMap(({ product, rolls }) => rolls.map(({ runs, left }, index) => {
    const cuts = runs.map(({ title, start, end, length }) =>
      `${formatPreciseInches(length)} for ${title} (${formatPreciseInches(start)} to ${formatPreciseInches(end)})`,
    );
    return `${product.name} · Roll ${index + 1} · Cut ${cuts.join(" / ")}. ${left > 0 ? `Keep ${formatPreciseInches(left)} for a future matching run.` : "Full roll used."}`;
  }));
}

export function trimSeamPurchaseSummary(
  project: Project,
  entries = woodJointDecisionEntries(project),
) {
  const sealed = entries.filter(({ trimSeam }) => !!trimSeam);
  if (!sealed.length) return null;
  const estimates = sealed.flatMap(({ trimSeam }) => trimSeam?.estimate ? [trimSeam.estimate] : []);
  const totalUse = estimates.reduce((sum, { cartridgeUse }) => sum + cartridgeUse, 0);
  const required = estimates.length ? Math.max(1, Math.ceil(totalUse - 1e-10)) : 0;
  const lengthInches = estimates.reduce((sum, { lengthInches }) => sum + lengthInches, 0);
  const selected = project.supplies.reduce((total, row) =>
    row.productId === trimSealant.id ? total + row.quantity : total, 0);
  return {
    required: required > 0 && required <= maxSupplyQuantity ? required : null,
    ready: estimates.length,
    review: sealed.length - estimates.length,
    length: formatStockLength(lengthInches),
    selected,
  };
}

export function woodJointDecisionLine(entry: WoodJointDecisionEntry) {
  const { title, decision, status, stage } = entry;
  return [
    title, woodJointMethods[decision.method],
    status === "changed" ? "Fit changed · review again" :
      status === "unavailable" ? "Member unavailable · review again" :
        stage ? `Step ${stage}` : "Current contact",
    decision.note,
    trimSeamLine(entry),
  ].filter(Boolean).join(" · ");
}
