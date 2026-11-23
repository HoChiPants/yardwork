import { openingAirSealRodRuns, reviewOpeningFlashings } from "./openingFlashing";
import { attachmentGeometryFingerprint } from "./attachments";
import { reviewConnectionContact } from "./connectionContacts";
import type { Piece, Project, V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { backerRodAllocationKey, backerRodCutRecordsSchema, packBackerRodRuns, removeBackerRodOffcut,
  saveBackerRodOffcut, type BackerRodRun } from "./trimBackerRodOffcuts";
import { trimBackerRods } from "./trimBackerRodReference";
import { estimateModeledTrimSeam, modeledTrimSeamEdges, trimSeamCoverLine, trimSeamCovers, trimSeamRunCovers } from "./trimSeamGeometry";
import { defaultTrimSealantSession, trimSealant } from "./trimSealantReference";
import { casingSealReviews } from "./casingSeal";
import { pipeAirSealRodRuns } from "./pipeAirSeal";
import { countertopBackerRuns } from "./countertopSeal";
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
    ...(method === "glue" && prior?.glueFaces && { glueFaces: prior.glueFaces }),
  });
  const rest = (project.woodJointDecisions ?? []).filter((row) =>
    row.firstId !== firstId || row.secondId !== secondId);
  return { ...project, woodJointDecisions: woodJointDecisionsSchema.parse([...rest, decision]) };
}

export function saveTrimSeam(project: Project, aId: string, bId: string, draft: TrimSeamInput | null): Project {
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
    checkedTrimSeam(project, first, second, shape, input);
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

function checkedTrimSeam(
  project: Project, first: Piece, second: Piece,
  shape: NonNullable<ReturnType<typeof modeledTrimSeamEdges>>, plan: TrimSeamInput,
) {
  const estimate = estimateModeledTrimSeam(shape, plan);
  const covers = trimSeamCovers(project, first, second, estimate.edges);
  const coverNotes = [];
  for (const edge of estimate.edges) {
    for (const cover of trimSeamRunCovers(edge.id, edge.sealedSpans, covers)) {
      const detail = `${edge.label} · ${trimSeamCoverLine(cover)}`;
      if (!cover.later)
        throw Error(`${detail} Review access or place the cover in a later build step.`);
      coverNotes.push({ edgeId: edge.id, detail });
    }
  }
  return { ...estimate, coverNotes };
}

function reviewTrimSeam(
  project: Project,
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
    return { estimate: checkedTrimSeam(project, first, second, shape, plan) } as const;
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
  if (project.woodJointDecisions.some(({ trimSeam, method }) => trimSeam || method === "glue")) {
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
    const trimSeam = reviewTrimSeam(project, decision, status, first, second);
    const trialScraps = new Set<string>();
    if (trimSeam?.estimate || (decision.method === "glue" && status === "current")) {
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
  const { edges, note, backerRod, coverNotes } = trimSeam.estimate;
  const ranges = (spans: { start: number; end: number }[]) => spans
    .map(({ start, end }) => `${formatPreciseInches(start)} to ${formatPreciseInches(end)}`).join(", ");
  const spans = edges.map(({ id, label, length, openSpans, sealedSpans, localStart }) => {
    if (!openSpans.length && !coverNotes.some(({ edgeId }) => edgeId === id))
      return `${label} (${formatPreciseInches(length)})`;
    const start = localStart.map((value, i) => `${"XYZ"[i]} ${formatPreciseInches(value)}`).join(", ");
    return [
      `${label} from ${entry.firstLabel}'s center (local ${start})`,
      sealedSpans.length ? `seal ${ranges(sealedSpans)}` : "",
      openSpans.length ? `keep open ${ranges(openSpans)}` : "",
    ].filter(Boolean).join(" · ");
  }).join(", ");
  const trial = entry.trialScraps.length
    ? ` Test the finish on ${entry.trialScraps.length === 1 ? "offcut" : "offcuts"} ${entry.trialScraps.join(", ")} from the same stock in Cut pool.`
    : "";
  const backing = backerRod
    ? ` Fit ${backerRod.name} along the seal runs before caulking.` : "";
  const session = entry.decision.trimSeam?.session;
  const order = coverNotes.length ? ` ${coverNotes.map(({ detail }) => detail).join(" ")}` : "";
  return `Trim sealant · ${spans}${session ? ` · ${session}` : ""} · ${note}${backing} Use a compatible cartridge gun.${order}${trial}`;
}

export function trimBackerRodCutPlan(project: Project, entries = woodJointDecisionEntries(project)) {
  const openingRuns = project.openingFlashings?.some(({ measurements }) => measurements.airSeal?.method === "silicone")
    ? openingAirSealRodRuns(reviewOpeningFlashings(project)) : [];
  const countertopRuns = countertopBackerRuns(project);
  const pipeRuns = pipeAirSealRodRuns(project);
  const records = project.backerRodCutRecords ?? [];
  const completedKeys = new Set(records.flatMap(({ cuts }) => cuts.map(({ key }) => key)));
  return trimBackerRods.flatMap((product) => {
    const runs: BackerRodRun[] = entries.flatMap(({ id, decision, title, trimSeam }) => {
      const estimate = trimSeam?.estimate;
      const measured = decision.trimSeam;
      if (!measured || estimate?.backerRod?.id !== product.id) return [];
      return estimate.edges.flatMap(({ id: edge, label, sealedSpans }) =>
        sealedSpans.map((span) => ({
          ...span, kind: "trim" as const, title: `${title} · ${label}`,
          key: JSON.stringify(["trim", id, measured.contactSignature, product.id, measured.gapWidth,
            measured.gapDepth, edge, span.start, span.end]),
        })),
      );
    });
    const airSealRuns = openingRuns.filter(({ productId }) => productId === product.id)
      .map(({ productId: _productId, ...run }) => run);
    const counterRuns = countertopRuns.filter(({ productId }) => productId === product.id)
      .map(({ productId: _productId, ...run }) => run);
    const pipeSealRuns = pipeRuns.filter(({ productId }) => productId === product.id)
      .map(({ productId: _productId, ...run }) => run);
    const allRuns = [...runs, ...airSealRuns, ...counterRuns, ...pipeSealRuns];
    const currentKeys = new Set(allRuns.map(({ key }) => key));
    const completed = records.filter(({ source }) => source.productId === product.id)
      .map((record) => ({ record, changed: record.cuts.filter(({ key }) => !currentKeys.has(key)).length }));
    if (!allRuns.length && !completed.length) return [];
    const stock = (project.backerRodOffcuts ?? []).filter(({ productId }) => productId === product.id);
    return [{
      product, completed, ...packBackerRodRuns(allRuns.filter(({ key }) => !completedKeys.has(key)), stock),
      hasAirSeal: airSealRuns.length > 0 || completed.some(({ record }) => record.cuts.some(({ kind }) => kind === "opening")),
      hasPipeSeal: pipeSealRuns.length > 0 || completed.some(({ record }) => record.cuts.some(({ kind }) => kind === "pipe-seal")),
      hasCountertop: counterRuns.length > 0 || completed.some(({ record }) => record.cuts.some(({ kind }) => kind === "countertop")),
    }];
  });
}

export function recordBackerRodCuts(
  project: Project, sourceId: string, expected: string, remnant?: { length: number; label: string },
) {
  const allocation = trimBackerRodCutPlan(project).flatMap(({ offcuts }) => offcuts)
    .find(({ source }) => source.id === sourceId);
  if (!allocation || backerRodAllocationKey(allocation.source, allocation.runs) !== expected)
    throw Error("The planned cuts changed. Open the current cut list again.");
  const { source, runs, left } = allocation;
  if (remnant && (!Number.isFinite(remnant.length) || remnant.length <= 0 || remnant.length > left + 1e-7))
    throw Error("Enter a measured remainder within the unused length of this piece.");
  let next = removeBackerRodOffcut(project, sourceId);
  if (remnant) next = saveBackerRodOffcut(next, {
    label: remnant.label.trim() || `${source.label.slice(0, 50)} tail`,
    productId: source.productId, length: Math.min(remnant.length, left),
  });
  const retained = remnant ? next.backerRodOffcuts?.at(-1) : undefined;
  return { ...next, backerRodCutRecords: backerRodCutRecordsSchema.parse([
    ...(project.backerRodCutRecords ?? []), { source, cuts: runs, ...(retained && { remnant: retained }) },
  ]) };
}

export function trimBackerRodGuideLines(groups: ReturnType<typeof trimBackerRodCutPlan>) {
  return groups.flatMap(({ product, offcuts, rolls, completed }) => {
    const cutLine = (runs: BackerRodRun[]) => runs.map(({ title, start, end, length }) =>
      `${formatPreciseInches(length)} for ${title} (${formatPreciseInches(start)} to ${formatPreciseInches(end)})`,
    ).join(" / ");
    const tail = (left: number, exhausted: string) =>
      left > 0 ? `Keep ${formatPreciseInches(left)} for a future matching run.` : exhausted;
    return [
      ...completed.map(({ record, changed }) => [
        `${product.name} · Recorded cuts from ${record.source.label} · ${cutLine(record.cuts)}.`,
        record.remnant ? `Measured remainder ${record.remnant.label} · ${formatPreciseInches(record.remnant.length)}.` : "No remainder saved.",
        changed ? `${changed} ${changed === 1 ? "run has" : "runs have"} changed or been removed since this cut was recorded.` : "",
      ].filter(Boolean).join(" ")),
      ...offcuts.map((bin) =>
        `${product.name} · Offcut ${bin.source.label} · ${formatPreciseInches(bin.source.length)} on hand · Cut ${cutLine(bin.runs)}. ${tail(bin.left, "Full offcut used.")}`),
      ...rolls.map((bin, index) =>
        `${product.name} · Roll ${index + 1} · Cut ${cutLine(bin.runs)}. ${tail(bin.left, "Full roll used.")}`),
    ];
  });
}

export function trimSeamPurchaseSummary(
  project: Project,
  entries = woodJointDecisionEntries(project),
) {
  const sealed = [
    ...entries.flatMap(({ decision, title, trimSeam }) => trimSeam ? [{
      title, session: decision.trimSeam?.session ?? defaultTrimSealantSession, estimate: trimSeam.estimate,
    }] : []),
    ...casingSealReviews(project).map(({ section, session, estimate }) => ({ title: section.name, session, estimate })),
  ];
  if (!sealed.length) return null;
  const sessions = new Map<string, { name: string; use: number; lengthInches: number; joints: string[] }>();
  for (const { title, session: name, estimate } of sealed) {
    if (!estimate) continue;
    const key = name.toLowerCase();
    const row = sessions.get(key) ?? { name, use: 0, lengthInches: 0, joints: [] };
    row.use += estimate.cartridgeUse;
    row.lengthInches += estimate.lengthInches;
    row.joints.push(title);
    sessions.set(key, row);
  }
  const batches = [...sessions.values()].map((row) => ({
    ...row,
    cartridges: Math.max(1, Math.ceil(row.use - 1e-10)),
  }));
  const required = batches.reduce((sum, { cartridges }) => sum + cartridges, 0);
  const lengthInches = batches.reduce((sum, row) => sum + row.lengthInches, 0);
  const ready = batches.reduce((sum, { joints }) => sum + joints.length, 0);
  const selected = project.supplies.reduce((total, row) =>
    row.productId === trimSealant.id ? total + row.quantity : total, 0);
  return {
    required: required > 0 && required <= maxSupplyQuantity ? required : null,
    ready,
    review: sealed.length - ready,
    length: formatStockLength(lengthInches),
    selected,
    batches,
  };
}

type TrimSealantBatch = NonNullable<ReturnType<typeof trimSeamPurchaseSummary>>["batches"][number];

export function trimSealantSessionDetail({ lengthInches, cartridges, use }: TrimSealantBatch) {
  const leftover = Math.max(0, 100 * (cartridges - use)).toFixed(1);
  return `${formatStockLength(lengthInches)} of seam · ${cartridges} ${cartridges === 1 ? "cartridge" : "cartridges"} · about ${leftover}% of the last cartridge left.`;
}

export function trimSealantSessionLine(batch: TrimSealantBatch) {
  return `${batch.name} · ${trimSealantSessionDetail(batch)}`;
}

export function trimSealantGuideLines(summary: ReturnType<typeof trimSeamPurchaseSummary>) {
  if (!summary) return [];
  const ready = summary.batches.flatMap((batch) => [
    trimSealantSessionLine(batch),
    `Joints · ${batch.joints.join(" / ")}.`,
  ]);
  const pending = summary.review > 0
    ? [`${summary.review} ${summary.review === 1 ? "seam needs" : "seams need"} a fresh fit review before counting toward the estimate.`]
    : [];
  return [
    ...(ready.length ? [trimSealant.finishSteps, ...ready] : []),
    ...(summary.required === null && summary.ready ? ["Review the measured coverage. The combined estimate exceeds the supported purchase quantity."] : []),
    ...pending,
  ];
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
