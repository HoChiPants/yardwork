import {
  cutSourceFrame,
  cutSourceRegion,
  type CutSourceAxes,
} from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import type { TrimOrder } from "./cutPlan";
import { cutPiece } from "./engine";
import { formatStockLength } from "./measurement";
import {
  material,
  maxPartDimension,
  projectSchema,
  uid,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { isDrywall } from "./drywallReference";
import { cutConsumesTail, stockSplitState } from "./packing";
import { offcutAvailability } from "./offcutAvailability";

const epsilon = 1e-7;
type OffcutTarget = Pick<Piece, "material" | "size" | "stockLengthAxis"> &
  Partial<Pick<Piece, "offcut" | "cutStock">>;

export function boardBlankAtLength(id: MaterialId, length: number) {
  const stock = material(id);
  if (!stock.wood || !stock.cuttable || stock.stockKind !== "linear" ||
      !Number.isFinite(length) || length <= 0 || length > maxPartDimension)
    return null;
  const size = [...stock.size] as V3;
  const stockLengthAxis = stockAxes({ material: id, size, stockLengthAxis: null }).length;
  size[stockLengthAxis] = length;
  return { size, stockLengthAxis };
}

const sizeAlong = (piece: Pick<Piece, "size">, axes: CutSourceAxes): V3 =>
  axes.map((axis) => piece.size[axis]) as V3;
function axesOf({
  thickness,
  width,
  length,
}: ReturnType<typeof stockAxes>): CutSourceAxes {
  return [thickness, width, length];
}

export function isAssignableOffcut(
  piece: Piece,
  inspection: ReturnType<typeof inspectCutStock>,
): piece is Piece & { cutStock: NonNullable<Piece["cutStock"]> } {
  const stock = material(piece.material);
  return (stock.wood || isDrywall(stock.id)) && stock.cuttable &&
    piece.offcut && !!piece.cutStock && inspection.valid.has(piece.cutStock.id) &&
    !piece.cutPlanes.length && !piece.roundOpenings?.length && !piece.rectangularOpenings?.length;
}

export function onHandOffcuts(project: Project, inspection = inspectCutStock(project)) {
  const availability = offcutAvailability(project);
  return project.pieces.filter((piece) => isAssignableOffcut(piece, inspection) &&
    availability(piece) === "on-hand");
}

export function fittingOffcuts(
  project: Project,
  target: OffcutTarget,
  inspection = inspectCutStock(project),
  allowedOffcutIds?: ReadonlySet<string>,
  order: TrimOrder = "crosscut-first",
) {
  const stock = material(target.material);
  if (target.offcut || target.cutStock || (!stock.wood && !isDrywall(target.material)) || !stock.cuttable)
    return [];
  const targetAxes = axesOf(stockAxes(target));
  const desired = sizeAlong(target, targetAxes);
  const availability = offcutAvailability(project);
  return project.pieces
    .flatMap((piece) => {
      if (
        (allowedOffcutIds && !allowedOffcutIds.has(piece.id)) ||
        piece.material !== target.material ||
        !isAssignableOffcut(piece, inspection)
      )
        return [];
      const source = piece.cutStock;
      const axes = axesOf(stockAxes(piece, source.size));
      if (
        !source.sourceAxes &&
        (axes.some((axis, index) => axis !== targetAxes[index]) ||
          piece.stockLengthAxis !== target.stockLengthAxis)
      )
        return [];
      const available = sizeAlong(piece, axes);
      const excess = available.map((value, axis) => value - desired[axis]);
      const kerf = pieceCutKerf(piece);
      if (
        Math.abs(excess[0]) > epsilon ||
        ([1, 2] as const).some((axis) =>
          Math.abs(excess[axis]) > epsilon && stockSplitState(available[axis], desired[axis], kerf) !== "cut")
      )
        return [];
      const tailNote = (axis: 1 | 2) => cutConsumesTail(available[axis], desired[axis], kerf)
        ? ` · Blade uses the remaining ${formatStockLength(kerf)}` : "";
      const operations = [
        ...(excess[2] > epsilon
          ? [
              {
                axis: axes[2],
                kind: "crosscut" as const,
                size: desired[2],
                text: `${isDrywall(target.material) ? "Score and snap length to" : "Crosscut to"} ${formatStockLength(desired[2])}${tailNote(2)}`,
              },
            ]
          : []),
        ...(excess[1] > epsilon
          ? [
              {
                axis: axes[1],
                kind: "rip" as const,
                size: desired[1],
                text: `${isDrywall(target.material) ? "Score and snap width to" : "Rip to"} ${formatStockLength(desired[1])}${tailNote(1)}`,
              },
            ]
          : []),
      ];
      const status = availability(piece);
      return [
        {
          piece,
          axes: targetAxes,
          desired,
          available,
          operations: order === "rip-first" ? operations.reverse() : operations,
          onHand: status === "on-hand",
          sourceCutPending: status === "expected",
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.sourceCutPending) - Number(b.sourceCutPending) ||
        Number(b.onHand) - Number(a.onHand) ||
        a.available[1] * a.available[2] - b.available[1] * b.available[2] ||
        a.piece.name.localeCompare(b.piece.name),
    );
}

export function fittingBoardOffcuts(
  project: Project,
  family: readonly MaterialId[],
  length: number,
  inspection: ReturnType<typeof inspectCutStock>,
) {
  const available = new Set(project.pieces
    .filter((piece) => piece.offcut && family.includes(piece.material))
    .map((piece) => piece.material));
  const seen = new Set<string>();
  return [...available].flatMap((id) => {
    const blank = boardBlankAtLength(id, length);
    if (!blank) return [];
    const explicit = { material: id, ...blank };
    const inferred = { ...explicit, stockLengthAxis: null };
    // Older cuts share an untagged blank. Offer an inferred target only if
    // its finished dimensions still give the same grain axis.
    const targets = stockAxes(inferred).length === blank.stockLengthAxis ? [explicit, inferred] : [explicit];
    return targets.flatMap((target) => fittingOffcuts(project, target, inspection)
      .flatMap((match) => {
        if (seen.has(match.piece.id)) return [];
        seen.add(match.piece.id);
        return [{
          ...match,
          stockLengthAxis: target.stockLengthAxis,
        }];
      }));
  }).sort((a, b) => Number(a.sourceCutPending) - Number(b.sourceCutPending) ||
    Number(b.onHand) - Number(a.onHand) ||
    a.available[1] * a.available[2] - b.available[1] * b.available[2]);
}

export function assignOffcutToPart(
  input: Project,
  targetId: string,
  offcutId: string,
  order: TrimOrder = "crosscut-first",
) {
  const project = ensurePartLabels(input);
  const target = project.pieces.find(({ id }) => id === targetId);
  const candidate =
    target &&
    fittingOffcuts(project, target, inspectCutStock(project), new Set([offcutId]), order)[0];
  if (!target || !candidate)
    throw Error(
      "This offcut no longer fits the planned part. Choose matching stock and allow room for the saw cut.",
    );
  const prepared = candidate.operations.reduce(
    (next, cut) => cutPiece(next, offcutId, cut.size, cut.axis, { allowConsumedTail: true }),
    project,
  );
  const trimmed = prepared.pieces.find(({ id }) => id === offcutId)!;
  const lineage = trimmed.cutStock!;
  const region = cutSourceRegion(trimmed);
  const frame = cutSourceFrame(candidate.axes);
  const cutStock = lineage.sourceAxes
    ? {
        ...lineage,
        sourceAxes: candidate.axes,
        size: frame.toPartSize(region.sourceSize),
        offset: frame.toPartOffset(
          region.offset,
          region.sourceSize,
          candidate.desired,
        ),
      }
    : lineage;
  const retained = { ...target, cutStock };
  const { size, sourceSize, offset } = cutSourceRegion(retained);
  const existing = new Set(project.pieces.map(({ id }) => id));
  const remnants = prepared.pieces.filter(({ id, offcut }) => offcut && !existing.has(id));
  const entry = {
    id: uid(),
    at: new Date().toISOString(),
    stepId: target.stepId,
    message: `Assigned ${partLabel(project, offcutId)} · ${candidate.piece.name} to ${partLabel(project, targetId)} · ${target.name}.`,
    offcutCut: {
      sourceId: lineage.id,
      inputId: offcutId,
      targetId,
      inputSize: candidate.available,
      inputName: candidate.piece.name,
      result: { size, sourceSize, offset },
      cuts: candidate.operations.map(({ kind, size }) => ({ kind, size })),
      remnants: remnants.map((piece) => ({
        id: piece.id,
        size: sizeAlong(piece, axesOf(stockAxes(piece, lineage.size))),
      })),
    },
  };
  const next = projectSchema.parse(
    ensurePartLabels({
      ...prepared,
      pieces: prepared.pieces
        .filter(({ id }) => id !== offcutId)
        .map((piece) =>
          piece.id === targetId ? retained : piece,
        ),
      history: [...prepared.history, entry].slice(-5000),
    }),
  );
  const checked = inspectCutStock(next);
  if (!checked.valid.has(lineage.id))
    throw Error(
      checked.invalid.find(({ sourceId }) => sourceId === lineage.id)?.detail ??
        "The assigned cut source could not be verified.",
    );
  return next;
}
