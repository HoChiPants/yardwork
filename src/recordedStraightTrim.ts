import { straightTrimTargets, type TrimOrder } from "./cutPlan";
import { cutSourceRegion } from "./cutSourceAxes";
import { material, uid, type Piece, type Project, type V3 } from "./model";
import { offcutCutSchema } from "./offcutCutSchema";
import { partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";
import { isDrywall } from "./drywallReference";

export function isRecordableStraightTrim(piece: Piece) {
  const stock = material(piece.material);
  return !piece.offcut && (stock.wood || isDrywall(piece.material)) && stock.cuttable &&
    !piece.cutPlanes.length && !pieceThroughOpenings(piece).length &&
    (piece.cutStock?.size ?? piece.size).every((span) => span <= 240);
}

/** Record the first cuts and the dimensions of the scraps they supply. */
export function recordStraightTrim(before: Project, trimmed: Project, from: Piece, order: TrimOrder) {
  if (!isRecordableStraightTrim(from)) return { project: trimmed, offcutIds: [] };
  const retained = trimmed.pieces.find(({ id }) => id === from.id);
  if (!retained?.cutStock) return { project: trimmed, offcutIds: [] };
  const { thickness, width, length } = stockAxes(from, from.cutStock?.size ?? from.size);
  const cuts = straightTrimTargets(from, retained.size[length], retained.size[width], order)
    .filter(({ axis }) => from.size[axis] !== retained.size[axis])
    .map(({ kind, size }) => ({ kind, size }));
  if (!cuts.length) return { project: trimmed, offcutIds: [] };
  const sourceId = retained.cutStock.id;
  const existingIds = new Set(before.pieces.map(({ id }) => id));
  const remnants = trimmed.pieces.flatMap((piece) =>
    piece.offcut && !existingIds.has(piece.id) && piece.cutStock?.id === sourceId
      ? [{ id: piece.id, size: [piece.size[thickness], piece.size[width], piece.size[length]] as V3 }]
      : []);
  const { size, sourceSize, offset, toSourceSize } = cutSourceRegion(retained);
  const offcutCut = offcutCutSchema.parse({
    sourceId,
    inputId: from.id,
    targetId: from.id,
    inputSize: [from.size[thickness], from.size[width], from.size[length]],
    retainedTrim: { inputRegionSize: toSourceSize(from.size) },
    result: { size, sourceSize, offset },
    cuts,
    remnants,
  });
  return {
    project: {
      ...trimmed,
      history: [...trimmed.history, {
        id: uid(),
        at: new Date().toISOString(),
        stepId: from.stepId,
        message: `Planned straight cuts for ${partLabel(trimmed, from.id)} · ${from.name}.`,
        offcutCut,
      }].slice(-5000),
    },
    offcutIds: remnants.map(({ id }) => id),
  };
}
