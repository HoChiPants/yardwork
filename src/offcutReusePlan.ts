import { inspectCutStock } from "./cutStock";
import { bom } from "./engine";
import { material, type MaterialId, type Piece, type Project } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";
import { orientedStockSize } from "./stockAxes";

type ReuseCandidate = {
  target: Piece;
  choices: number;
  area: number;
  length: number;
};

function applyReuseOrder(
  source: Project,
  sourceInspection: ReturnType<typeof inspectCutStock>,
  candidates: ReuseCandidate[],
  offcutIds?: readonly string[],
) {
  let project = source;
  let inspection = sourceInspection;
  const allowed = offcutIds ? new Set(offcutIds) : undefined;
  const originalIds = new Set(source.pieces.map(({ id }) => id));
  const assignments = [];
  for (const { target } of candidates) {
    const [match] = fittingOffcuts(project, target, inspection, allowed);
    if (!match) continue;
    assignments.push({
      partId: target.id,
      target: `${partLabel(project, target.id)} · ${target.name}`,
      from: `${partLabel(project, match.piece.id)} · ${match.piece.name}`,
      fromEarlierCut: !originalIds.has(match.piece.id),
      operations: match.operations.map(({ text }) => text),
    });
    const next = assignOffcutToPart(project, target.id, match.piece.id);
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
      };
    })
    .sort((a, b) => Number(!a.choices) - Number(!b.choices) || a.choices - b.choices || b.area - a.area);
  let result = applyReuseOrder(source, inspection, candidates, offcutIds);
  let after = result.assignments.length ? bom(result.project) : [];
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
    if (winningGroups.size === shorterGroups.size) {
      result = alternate;
      after = alternateStock;
    } else if (winningGroups.size) {
      result = applyReuseOrder(source, inspection, applyShorterOrder(candidates, winningGroups), offcutIds);
      after = bom(result.project);
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
  return { source: input, project, assignments, purchases, remnants, shorterFirst };
}

export type OffcutReusePlan = ReturnType<typeof planOffcutReuse>;
