import { bom, projectPricingCoverage, validate } from "./engine";
import { material, type Project } from "./model";
import { planOffcutReuse } from "./offcutReusePlan";
import { ensurePartLabels } from "./partLabels";
import { stockCutSequences } from "./stockCutSequence";
import { isDrywall } from "./drywallReference";

export type ProposalCutScope = "proposal" | "shared";

export type ProposalStockRequest =
  | { kind: "cuts" | "save-cuts" }
  | { kind: "reuse"; labels: string[] };

const proposal = "(?:this|the|my) (?:proposal|layout|design)";
const stockRequest = new RegExp(
  `^(?:show|review|preview) (?:the )?(?:cuts|cut list|cut plan|stock layout)(?: for ${proposal})?$`, "i",
);
const saveCutsRequest = new RegExp(
  `^(?:(?:save|record) (?:the )?(?:wood )?(?:cut orders?|cut list|cut plan)(?: (?:with|for|in) ${proposal})?|keep (?:the )?(?:expected )?(?:leftovers|offcuts|scraps) from ${proposal})$`,
  "i",
);
const availableStock = "(?:(?:my|the|existing|available) )?(?:offcuts|scraps|leftovers)";
const partLabels = "o[0-9]{1,6}(?:(?: *, *| +and +| *, *and +)o[0-9]{1,6})*";
const reuseRequest = new RegExp(
  `^(?:use|reuse|try using|try reusing) (${availableStock}|${partLabels})(?: (?:in|for|on) ${proposal})?$`, "i",
);
export function proposalStockRequest(prompt: string): ProposalStockRequest | null {
  const text = prompt.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  if (stockRequest.test(text)) return { kind: "cuts" };
  if (saveCutsRequest.test(text)) return { kind: "save-cuts" };
  const reuse = reuseRequest.exec(text);
  if (!reuse) return null;
  const labels = [...reuse[1].matchAll(/o([0-9]{1,6})/gi)]
    .map(([, number]) => `O${String(Number(number)).padStart(3, "0")}`);
  return { kind: "reuse", labels: [...new Set(labels)] };
}

/** Reuse covers blanks introduced by the proposal and those released by its revision. */
export function previewProposalStock(
  current: Project,
  candidate: Project,
  offcutLabels: readonly string[] | null,
  replannedPartIds: readonly string[] = [],
) {
  const sourcePartIds = new Set(current.pieces.map(({ id }) => id));
  const replanned = new Set(replannedPartIds);
  const cutPartIds = new Set(candidate.pieces
    .filter((part) => !part.offcut && (!sourcePartIds.has(part.id) || replanned.has(part.id)) && material(part.material).cuttable)
    .map(({ id }) => id));
  const pendingSources = new Set(candidate.plannedCutSources?.map(({ sourceId }) => sourceId));
  const returned = new Set(current.plannedCutSources?.flatMap(({ sourceId }) =>
    !pendingSources.has(sourceId) && current.onHandCutSources?.includes(sourceId) ? [sourceId] : []));
  const scraps = new Set(candidate.pieces.filter(({ id, offcut, cutStock }) =>
    offcut && (sourcePartIds.has(id) || (cutStock && returned.has(cutStock.id))))
    .map(({ id }) => id));
  let plan: ReturnType<typeof planOffcutReuse> | undefined;
  let project = candidate;
  if (offcutLabels !== null) {
    let available = [...scraps];
    if (offcutLabels.length) {
      const labels = new Map(ensurePartLabels(candidate).partLabels.map(({ label, partId }) => [label, partId]));
      available = offcutLabels.map((label) => {
        const id = labels.get(label);
        if (!id || !scraps.has(id)) throw Error(`${label} is missing from the Cut pool. Check its label or use all current offcuts.`);
        return id;
      });
    }
    plan = planOffcutReuse(candidate, available, cutPartIds);
    if (plan.assignments.length) project = plan.project;
  }
  const rows = bom(project);
  const materials = new Set(project.pieces.filter(({ id }) => cutPartIds.has(id)).map(({ material }) => material));
  const stockRows = rows.filter(({ id }) => materials.has(id));
  const cutSequences = stockCutSequences(project, stockRows);
  const cutMaterials = stockRows.map((row) => ({
    row,
    oversized: row.oversizedParts.filter(({ id }) => cutPartIds.has(id)),
    sequences: (cutSequences.get(row.id) ?? []).filter((sequence) =>
      sequence.partIds.some((id) => cutPartIds.has(id))),
  }));
  const recordable = cutMaterials.flatMap(({ row, sequences }) => {
    if (!material(row.id).wood && !isDrywall(row.id)) return [];
    return sequences.flatMap(({ title, layout, review }) => review || !layout.kept.length ? [] : [{
      title,
      layout,
      existingPartIds: layout.kept.filter(({ id }) => !cutPartIds.has(id)).map(({ id }) => id),
    }]);
  });
  return {
    project,
    plan,
    partCount: cutPartIds.size,
    replannedPartCount: replanned.size,
    availableOffcuts: scraps.size,
    materials: cutMaterials,
    recordable,
    pricing: project === candidate ? undefined : projectPricingCoverage(project, rows),
    findings: project === candidate ? undefined : validate(project).filter(({ severity }) => severity !== "info"),
  };
}
