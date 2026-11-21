import {
  cutSourceFrame,
  cutSourceRegion,
  type CutSourceAxes,
} from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { formatStockLength } from "./measurement";
import {
  material,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";

const epsilon = 1e-7;
const sizeAlong = (piece: Piece, axes: CutSourceAxes): V3 =>
  axes.map((axis) => piece.size[axis]) as V3;
function axesOf({
  thickness,
  width,
  length,
}: ReturnType<typeof stockAxes>): CutSourceAxes {
  return [thickness, width, length];
}

export function fittingOffcuts(
  project: Project,
  target: Piece,
  inspection = inspectCutStock(project),
  allowedOffcutIds?: ReadonlySet<string>,
) {
  const stock = material(target.material);
  if (target.offcut || target.cutStock || !stock.wood || !stock.cuttable)
    return [];
  const targetAxes = axesOf(stockAxes(target));
  const desired = sizeAlong(target, targetAxes);
  return project.pieces
    .flatMap((piece) => {
      const source = piece.cutStock;
      if (
        !piece.offcut ||
        (allowedOffcutIds && !allowedOffcutIds.has(piece.id)) ||
        piece.material !== target.material ||
        !source ||
        !inspection.valid.has(source.id) ||
        piece.cutPlanes.length ||
        piece.roundOpenings?.length ||
        piece.rectangularOpenings?.length
      )
        return [];
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
        excess
          .slice(1)
          .some((value) => Math.abs(value) > epsilon && value <= kerf + epsilon)
      )
        return [];
      const operations = [
        ...(excess[2] > epsilon
          ? [
              {
                axis: axes[2],
                kind: "crosscut" as const,
                size: desired[2],
                text: `Crosscut to ${formatStockLength(desired[2])}`,
              },
            ]
          : []),
        ...(excess[1] > epsilon
          ? [
              {
                axis: axes[1],
                kind: "rip" as const,
                size: desired[1],
                text: `Rip to ${formatStockLength(desired[1])}`,
              },
            ]
          : []),
      ];
      return [
        {
          piece,
          axes: targetAxes,
          desired,
          available,
          operations,
          onHand: project.onHandCutSources?.includes(source.id) ?? false,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.onHand) - Number(a.onHand) ||
        a.available[1] * a.available[2] - b.available[1] * b.available[2] ||
        a.piece.name.localeCompare(b.piece.name),
    );
}

export function assignOffcutToPart(
  input: Project,
  targetId: string,
  offcutId: string,
) {
  const project = ensurePartLabels(input);
  const target = project.pieces.find(({ id }) => id === targetId);
  const candidate =
    target &&
    fittingOffcuts(project, target).find(({ piece }) => piece.id === offcutId);
  if (!target || !candidate)
    throw Error(
      "This offcut no longer fits the planned part. Choose matching stock and allow room for the saw cut.",
    );
  const prepared = candidate.operations.reduce(
    (next, cut) => cutPiece(next, offcutId, cut.size, cut.axis),
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
