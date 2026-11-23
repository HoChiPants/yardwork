import { inspectCutStock, pieceCutKerf } from "./cutStock";
import type { TrimOrder } from "./cutPlan";
import { material, part, type Piece, type Project, type V3 } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { placeWood } from "./placement";
import { stockAxes } from "./stockAxes";

export function panelOffcutEligible(piece: Piece) {
  const stock = material(piece.material);
  return piece.offcut && !!piece.cutStock && stock.stockKind === "sheet" && stock.wood && stock.cuttable &&
    !piece.cutPlanes.length && !piece.roundOpenings?.length && !piece.rectangularOpenings?.length;
}

export function fitPanelOffcut(
  project: Project, offcut: Piece, width: number, length: number, inspection = inspectCutStock(project),
  order: TrimOrder = "crosscut-first",
) {
  if (!panelOffcutEligible(offcut) || !Number.isFinite(width) || !Number.isFinite(length) || width <= 0 || length <= 0)
    return;
  const source = offcut.cutStock!;
  const axes = stockAxes(offcut, source.size);
  const size: V3 = [...offcut.size];
  size[axes.width] = width;
  size[axes.length] = length;
  const stockLengthAxis = source.sourceAxes ? axes.length : offcut.stockLengthAxis;
  const [fit] = fittingOffcuts(project, { material: offcut.material, size, stockLengthAxis }, inspection, new Set([offcut.id]), order);
  if (fit) return { size, axes, stockLengthAxis, fit, kerf: pieceCutKerf(offcut) };
}

export function previewPanelOffcut(
  project: Project, offcut: Piece, width: number, length: number, name: string, stepId: string, center: V3,
  order: TrimOrder = "crosscut-first",
) {
  const planned = fitPanelOffcut(project, offcut, width, length, undefined, order);
  if (!planned) throw Error("This panel does not fit the recorded scrap and saw allowance.");
  const { size, axes, stockLengthAxis, fit, kerf } = planned;
  const rotation: V3 = axes.thickness === 1 ? [0, 0, 0] :
    axes.thickness === 0 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  const panel = part(name.trim() || "Panel from offcut", offcut.material, size,
    [center[0], size[axes.thickness] / 2, center[2]], stepId, "Loose parts", rotation);
  panel.stockLengthAxis = stockLengthAxis;
  const clear = placeWood(project, panel, panel.position, panel.rotation);
  if (clear.blocked) throw Error("No clear position was found for the panel.");
  panel.position = clear.position;
  const next = assignOffcutToPart({ ...project, pieces: [...project.pieces, panel] }, panel.id, offcut.id, order);
  return {
    next, panel,
    cuts: fit.operations,
    kerf,
    remnants: next.history.at(-1)!.offcutCut!.remnants,
    pending: project.plannedCutSources?.some(({ sourceId }) => sourceId === offcut.cutStock!.id) ?? false,
  };
}
