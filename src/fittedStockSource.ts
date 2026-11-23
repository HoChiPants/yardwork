import { Euler, Matrix4, Vector3 } from "three";
import { cutSourceFrame } from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import type { FittedStockPreview } from "./fittedStock";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { assignOffcutToPart, fittingOffcuts, onHandOffcuts } from "./offcutAssignment";
import { offcutAvailability } from "./offcutAvailability";
import { recordStraightTrim } from "./recordedStraightTrim";
import { rotate } from "./spatial";
import { orientedStockSize, stockAxes } from "./stockAxes";

function sourceFrame(piece: Piece) {
  const { thickness, width, length } = stockAxes(piece, piece.cutStock?.size ?? piece.size);
  return cutSourceFrame([thickness, width, length]);
}

function matchOffcutAxes(block: Piece, offcut: Piece) {
  const original = sourceFrame(block);
  const target = sourceFrame(offcut);
  const basis = ([0, 1, 2] as const).map((axis) => {
    const direction: V3 = [0, 0, 0];
    direction[axis] = 1;
    return new Vector3(...rotate(original.toPartDirection(target.toSourceDirection(direction)), block.rotation));
  });
  const { x, y, z } = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(basis[0], basis[1], basis[2]));
  return {
    ...block, cutStock: null,
    size: target.toPartSize(original.toSourceSize(block.size)),
    rotation: [x, y, z] as V3,
    stockLengthAxis: offcut.cutStock?.sourceAxes ? stockAxes(offcut, offcut.cutStock.size).length : offcut.stockLengthAxis,
  };
}

export function planFittedStockSource(
  project: Project,
  fit: FittedStockPreview,
  source: "prefer-offcut" | "on-hand" | "new-board",
  planOffcuts?: ReadonlySet<string>,
) {
  const block = fit.project.pieces.find(({ id }) => id === fit.blockId)!;
  let planned = fit.project;
  let chosen: ReturnType<typeof fittingOffcuts>[number] | undefined;
  if (source !== "new-board" || planOffcuts?.size) {
    const excluded = new Set([block.id, ...fit.offcutIds]);
    const available = { ...fit.project, pieces: fit.project.pieces.filter(({ id }) => !excluded.has(id)) };
    const inspection = inspectCutStock(project);
    const availability = offcutAvailability(project);
    const onHand = (piece: Piece) => availability(piece) === "on-hand";
    const existing = source === "on-hand" ? new Set(onHandOffcuts(project, inspection).map(({ id }) => id)) : undefined;
    const scraps = project.pieces
      .filter(({ id, offcut, material }) => offcut && material === block.material &&
        (source === "prefer-offcut" || existing?.has(id) || planOffcuts?.has(id)))
      .sort((a, b) => Number(onHand(b)) - Number(onHand(a)) ||
        orientedStockSize(a)[2] - orientedStockSize(b)[2] || a.id.localeCompare(b.id));
    for (const scrap of scraps) {
      const target = matchOffcutAxes(block, scrap);
      const [match] = fittingOffcuts(available, target, inspection, new Set([scrap.id]));
      if (!match || match.operations.some(({ kind }) => kind === "rip")) continue;
      chosen = match;
      planned = assignOffcutToPart({ ...available, pieces: [...available.pieces, target] }, target.id, scrap.id);
      break;
    }
  }
  if (!chosen && fit.kerfLoss > 0) {
    const size = [...block.size] as V3;
    size[fit.stockLengthAxis] = fit.sourceLength;
    planned = recordStraightTrim(project, fit.project, { ...block, size, cutStock: null }, "crosscut-first").project;
  }
  const previousIds = new Set(project.pieces.map(({ id }) => id));
  return {
    project: planned,
    block: planned.pieces.find(({ id }) => id === block.id)!,
    source: chosen?.piece ?? null,
    sourceOnHand: chosen?.onHand ?? false,
    sourceLength: chosen?.available[2] ?? fit.sourceLength,
    cutLength: fit.cutLength,
    kerfLoss: chosen ? (chosen.operations.length ? pieceCutKerf(chosen.piece) : 0) : fit.kerfLoss,
    operations: chosen ? chosen.operations.map(({ text }) => text) : fit.kerfLoss > 0 ? [`Crosscut to ${formatPreciseInches(fit.cutLength)}`] : [],
    offcuts: planned.pieces.filter(({ id, offcut }) => offcut && !previousIds.has(id)),
  };
}
