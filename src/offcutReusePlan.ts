import { inspectCutStock } from "./cutStock";
import type { TrimOrder } from "./cutPlan";
import { bom } from "./engine";
import { material, type MaterialId, type Piece, type Project } from "./model";
import { assignOffcutToPart, fittingOffcuts, onHandOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";
import { orientedStockSize } from "./stockAxes";

type ReuseCandidate = {
  target: Piece;
  choices: number;
  area: number;
  length: number;
  canTrimBothAxes: boolean;
};
const maxMixedSheetTrials = 6;

function applyReuseOrder(
  source: Project,
  sourceInspection: ReturnType<typeof inspectCutStock>,
  candidates: ReuseCandidate[],
  offcutIds?: readonly string[],
  ripFirstMaterials?: ReadonlySet<MaterialId>,
  trimOrders?: ReadonlyMap<string, TrimOrder>,
) {
  let project = source;
  let inspection = sourceInspection;
  const allowed = offcutIds ? new Set(offcutIds) : undefined;
  const originalIds = new Set(source.pieces.map(({ id }) => id));
  const assignments = [];
  for (const { target } of candidates) {
    const order = trimOrders?.get(target.id) ??
      (ripFirstMaterials?.has(target.material) ? "rip-first" : "crosscut-first");
    const [match] = fittingOffcuts(project, target, inspection, allowed, order);
    if (!match) continue;
    assignments.push({
      partId: target.id,
      target: `${partLabel(project, target.id)} · ${target.name}`,
      from: `${partLabel(project, match.piece.id)} · ${match.piece.name}`,
      fromEarlierCut: !originalIds.has(match.piece.id),
      sourceCutPending: match.sourceCutPending,
      order,
      operations: match.operations.map(({ text }) => text),
    });
    const next = assignOffcutToPart(project, target.id, match.piece.id, order);
    if (allowed) {
      const assignment = next.history.at(-1)?.offcutCut;
      for (const { id } of assignment?.remnants ?? []) allowed.add(id);
    }
    project = next;
    inspection = inspectCutStock(project);
  }
  return { project, assignments };
}

function applyShorterOrder(candidates: ReuseCandidate[], groups: ReadonlyMap<MaterialId, ReuseCandidate[]>) {
  const offsets = new Map<MaterialId, number>();
  return candidates.map((candidate) => {
    const id = candidate.target.material;
    const group = candidate.choices ? groups.get(id) : undefined;
    if (!group) return candidate;
    const index = offsets.get(id) ?? 0;
    offsets.set(id, index + 1);
    return group[index];
  });
}

export function planOffcutReuse(
  input: Project,
  offcutIds?: readonly string[],
  targetIds?: ReadonlySet<string>,
) {
  const source = ensurePartLabels(input);
  const inspection = inspectCutStock(source);
  const allowed = offcutIds ? new Set(offcutIds) : undefined;
  const candidates = source.pieces
    .filter((piece) => !piece.offcut && !piece.cutStock && (!targetIds || targetIds.has(piece.id)))
    .map((target) => {
      const fits = fittingOffcuts(source, target, inspection, allowed);
      return {
        target,
        choices: fits.length,
        area: fits[0] ? fits[0].desired[1] * fits[0].desired[2] : 0,
        length: fits[0]?.desired[2] ?? 0,
        canTrimBothAxes: fits.some(({ operations }) => operations.length === 2),
      };
    })
    .sort((a, b) => Number(!a.choices) - Number(!b.choices) || a.choices - b.choices || b.area - a.area);
  let result = applyReuseOrder(source, inspection, candidates, offcutIds);
  let after = result.assignments.length ? bom(result.project) : [];
  let ordered = candidates;
  let shorterFirst = false;

  const linearGroups = new Map<MaterialId, ReuseCandidate[]>();
  for (const row of candidates) {
    const id = row.target.material;
    if (!row.choices || material(id).stockKind !== "linear") continue;
    const group = linearGroups.get(id) ?? [];
    group.push(row);
    linearGroups.set(id, group);
  }
  const shorterGroups = new Map<MaterialId, ReuseCandidate[]>();
  for (const [id, group] of linearGroups) {
    const sorted = [...group].sort((a, b) => a.length - b.length);
    if (sorted.some((row, index) => row !== group[index])) shorterGroups.set(id, sorted);
  }
  if (shorterGroups.size) {
    // Reuse can leave the same number of boards to buy even when the biggest
    // part fits a scrap. Compare the complete stock list for each cut order.
    const alternate = applyReuseOrder(source, inspection, applyShorterOrder(candidates, shorterGroups), offcutIds);
    const alternateStock = bom(alternate.project);
    const baselineQuantities = new Map(after.map(({ id, quantity }) => [id, quantity]));
    const winningGroups = new Map(
      alternateStock.flatMap(({ id, quantity }) => {
        const group = shorterGroups.get(id);
        const before = baselineQuantities.get(id);
        return group && before !== undefined && quantity < before ? [[id, group] as const] : [];
      }),
    );
    shorterFirst = winningGroups.size > 0;
    if (shorterFirst) ordered = applyShorterOrder(candidates, winningGroups);
    if (winningGroups.size === shorterGroups.size) {
      result = alternate;
      after = alternateStock;
    } else if (winningGroups.size) {
      result = applyReuseOrder(source, inspection, ordered, offcutIds);
      after = bom(result.project);
    }
  }

  const fittedSheets = new Map<MaterialId, number>();
  const twoAxisSheets = new Set<MaterialId>();
  for (const { target, choices, canTrimBothAxes } of candidates) {
    if (!choices) continue;
    const stock = material(target.material);
    if (!stock.wood || stock.stockKind !== "sheet") continue;
    fittedSheets.set(stock.id, (fittedSheets.get(stock.id) ?? 0) + 1);
    if (canTrimBothAxes) twoAxisSheets.add(stock.id);
  }
  const targetMaterials = new Map(candidates.map(({ target }) => [target.id, target.material]));
  const countByStock = (rows: typeof result.assignments) => {
    const counts = new Map<MaterialId, number>();
    for (const { partId } of rows) {
      const id = targetMaterials.get(partId)!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  };
  const beforeReuse = countByStock(result.assignments);
  const sheetAlternatives = new Set([...twoAxisSheets].filter((id) =>
    (fittedSheets.get(id) ?? 0) > (beforeReuse.get(id) ?? 0),
  ));
  const ripFirstMaterials = new Set<MaterialId>();
  if (sheetAlternatives.size) {
    const alternate = applyReuseOrder(source, inspection, ordered, offcutIds, sheetAlternatives);
    const alternateStock = bom(alternate.project);
    const beforeSheets = new Map(after.map(({ id, quantity }) => [id, quantity]));
    const afterReuse = countByStock(alternate.assignments);
    for (const { id, quantity } of alternateStock) {
      if (!sheetAlternatives.has(id)) continue;
      const before = beforeSheets.get(id);
      if (before === undefined) continue;
      if (quantity < before || (quantity === before && (afterReuse.get(id) ?? 0) > (beforeReuse.get(id) ?? 0)))
        ripFirstMaterials.add(id);
    }
    if (ripFirstMaterials.size === sheetAlternatives.size) {
      result = alternate;
      after = alternateStock;
    } else if (ripFirstMaterials.size) {
      result = applyReuseOrder(source, inspection, ordered, offcutIds, ripFirstMaterials);
      after = bom(result.project);
    }

    // Compare targeted flips only where a grain-compatible part is still
    // missing. Each trial uses the same assignment and lineage checks.
    const trimOrders = new Map<string, TrimOrder>();
    let remainingTrials = maxMixedSheetTrials;
    let reuse = countByStock(result.assignments);
    let quantities = new Map(after.map(({ id, quantity }) => [id, quantity]));
    for (const { partId } of result.assignments) {
      if (remainingTrials === 0) break;
      const id = targetMaterials.get(partId)!;
      if (!sheetAlternatives.has(id) || (reuse.get(id) ?? 0) >= fittedSheets.get(id)!) continue;
      const current = result.assignments.find((row) => row.partId === partId);
      if (current?.operations.length !== 2) continue;
      remainingTrials--;
      const alternateOrders = new Map(trimOrders).set(partId,
        current.order === "rip-first" ? "crosscut-first" : "rip-first",
      );
      const trial = applyReuseOrder(source, inspection, ordered, offcutIds, ripFirstMaterials, alternateOrders);
      const trialReuse = countByStock(trial.assignments);
      const trialStock = bom(trial.project);
      const trialQuantities = new Map(trialStock.map(({ id, quantity }) => [id, quantity]));
      const before = quantities.get(id) ?? 0;
      const next = trialQuantities.get(id) ?? 0;
      if (next > before || (next === before && (trialReuse.get(id) ?? 0) <= (reuse.get(id) ?? 0))) continue;
      trimOrders.set(partId, alternateOrders.get(partId)!);
      result = trial;
      after = trialStock;
      reuse = trialReuse;
      quantities = trialQuantities;
    }
  }

  const { project, assignments } = result;
  const purchases = [];
  if (assignments.length) {
    const before = new Map(
      bom(input).map(({ id, quantity }) => [id, quantity]),
    );
    for (const { id, quantity } of after) {
      const previous = before.get(id) ?? 0;
      if (previous !== quantity) {
        const stock = material(id);
        purchases.push({
          id,
          name: stock.name,
          unit: stock.unit,
          before: previous,
          after: quantity,
        });
      }
    }
  }
  const originalIds = new Set(source.pieces.map(({ id }) => id));
  const remnants = project.pieces.flatMap((piece) => piece.offcut && !originalIds.has(piece.id)
    ? [{ id: piece.id, label: partLabel(project, piece.id), size: orientedStockSize(piece) }]
    : []);
  const fittingPartIds = candidates.filter(({ choices }) => choices > 0).map(({ target }) => target.id);
  const usedRipFirst = new Set(assignments.flatMap(({ partId, order, operations }) =>
    order === "rip-first" && operations.length === 2 ? [targetMaterials.get(partId)!] : []));
  return { source: input, project, assignments, purchases, remnants, fittingPartIds, shorterFirst, ripFirstMaterials: [...usedRipFirst] };
}

export type OffcutReusePlan = ReturnType<typeof planOffcutReuse>;

export function planOnHandOffcutReuse(project: Project) {
  return planOffcutReuse(project, onHandOffcuts(project).map(({ id }) => id));
}

export const ripFirstReuseNote = "Rip first where the cut order calls for a longer strip to supply another part.";
