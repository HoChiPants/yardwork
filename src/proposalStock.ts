import { bom, projectPricingCoverage, validate } from "./engine";
import { material, type Project } from "./model";
import { planOffcutReuse } from "./offcutReusePlan";
import { ensurePartLabels } from "./partLabels";
import { stockCutSequences } from "./stockCutSequence";

export type ProposalStockRequest =
  | { kind: "cuts" }
  | { kind: "reuse"; labels: string[] };

const proposal = "(?:this|the|my) (?:proposal|layout|design)";
const stockRequest = new RegExp(
  `^(?:show|review|preview) (?:the )?(?:cuts|cut list|cut plan|stock layout)(?: for ${proposal})?$`, "i",
);
const availableStock = "(?:(?:my|the|existing|available) )?(?:offcuts|scraps|leftovers)";
const partLabels = "o[0-9]{1,6}(?:(?: *, *| +and +| *, *and +)o[0-9]{1,6})*";
const reuseRequest = new RegExp(
  `^(?:use|reuse|try using|try reusing) (${availableStock}|${partLabels})(?: (?:in|for|on) ${proposal})?$`, "i",
);
export function proposalStockRequest(prompt: string): ProposalStockRequest | null {
  const text = prompt.trim().replace(/[.!?]+$/, "").replace(/^please\s+/i, "");
  if (stockRequest.test(text)) return { kind: "cuts" };
  const reuse = reuseRequest.exec(text);
  if (!reuse) return null;
  const labels = [...reuse[1].matchAll(/o([0-9]{1,6})/gi)]
    .map(([, number]) => `O${String(Number(number)).padStart(3, "0")}`);
  return { kind: "reuse", labels: [...new Set(labels)] };
}

/** Reuse is scoped to fresh blanks in the proposed change and stock the user already has in the pool. */
export function previewProposalStock(
  current: Project,
  candidate: Project,
  offcutLabels: readonly string[] | null,
) {
  const sourcePartIds = new Set(current.pieces.map(({ id }) => id));
  const newPartIds = new Set(candidate.pieces
    .filter((part) => !part.offcut && !sourcePartIds.has(part.id) && material(part.material).cuttable)
    .map(({ id }) => id));
  const scraps = new Set(current.pieces.filter(({ offcut }) => offcut).map(({ id }) => id));
  let plan: ReturnType<typeof planOffcutReuse> | undefined;
  let project = candidate;
  if (offcutLabels !== null) {
    let available = [...scraps];
    if (offcutLabels.length) {
      const labels = new Map(ensurePartLabels(current).partLabels.map(({ label, partId }) => [label, partId]));
      available = offcutLabels.map((label) => {
        const id = labels.get(label);
        if (!id || !scraps.has(id)) throw Error(`${label} is missing from the Cut pool. Check its label or use all current offcuts.`);
        return id;
      });
    }
    plan = planOffcutReuse(candidate, available, newPartIds);
    if (plan.assignments.length) project = plan.project;
  }
  const rows = bom(project);
  const materials = new Set(project.pieces.filter(({ id }) => newPartIds.has(id)).map(({ material }) => material));
  const stockRows = rows.filter(({ id }) => materials.has(id));
  const cutSequences = stockCutSequences(project, stockRows);
  return {
    project,
    plan,
    newPartCount: newPartIds.size,
    materials: stockRows.map((row) => ({
      row,
      oversized: row.oversizedParts.filter(({ id }) => newPartIds.has(id)),
      sequences: (cutSequences.get(row.id) ?? []).filter((sequence) =>
        sequence.partIds.some((id) => newPartIds.has(id))),
    })),
    pricing: project === candidate ? undefined : projectPricingCoverage(project, rows),
    findings: project === candidate ? undefined : validate(project).filter(({ severity }) => severity !== "info"),
  };
}
