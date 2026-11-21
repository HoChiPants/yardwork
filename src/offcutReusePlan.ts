import { inspectCutStock } from "./cutStock";
import { bom } from "./engine";
import { material, type Project } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";

export function planOffcutReuse(input: Project, offcutIds?: readonly string[]) {
  let project = ensurePartLabels(input);
  let inspection = inspectCutStock(project);
  const allowed = offcutIds ? new Set(offcutIds) : undefined;
  const originalIds = new Set(project.pieces.map(({ id }) => id));
  const candidates = project.pieces
    .filter((piece) => !piece.offcut && !piece.cutStock)
    .map((target) => {
      const fits = fittingOffcuts(project, target, inspection, allowed);
      return {
        target,
        choices: fits.length || Number.MAX_SAFE_INTEGER,
        area: fits[0] ? fits[0].desired[1] * fits[0].desired[2] : 0,
      };
    })
    .sort((a, b) => a.choices - b.choices || b.area - a.area);
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
  const purchases = [];
  if (assignments.length) {
    const before = new Map(
      bom(input).map(({ id, quantity }) => [id, quantity]),
    );
    for (const { id, quantity } of bom(project)) {
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
  return { source: input, project, assignments, purchases };
}

export type OffcutReusePlan = ReturnType<typeof planOffcutReuse>;
