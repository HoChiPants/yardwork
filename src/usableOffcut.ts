import { cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock } from "./cutStock";
import { isDrywall } from "./drywallReference";
import { material, projectSchema, uid, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { offcutStockSize, stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";

export type UsableOffcutMarks = { length: number; width: number; fromEnd: number; fromEdge: number };

export function usableOffcutEligible(piece: Piece, pending: ReadonlySet<string>) {
  const stock = material(piece.material);
  return piece.offcut && !!piece.cutStock && !pending.has(piece.cutStock.id) &&
    stock.cuttable && (stock.wood || isDrywall(piece.material)) &&
    !piece.cutPlanes.length && !pieceThroughOpenings(piece).length;
}

export function previewUsableOffcut(project: Project, id: string, marks: UsableOffcutMarks) {
  const piece = project.pieces.find((row) => row.id === id);
  const pending = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  if (!piece?.cutStock || !usableOffcutEligible(piece, pending))
    throw Error("Choose a rectangular wood or drywall offcut from stock that has already been cut.");
  if (project.sections.some(({ pieceIds }) => pieceIds.includes(id)))
    throw Error("Remove this offcut from its section before marking a smaller blank.");
  if (!inspectCutStock(project).valid.has(piece.cutStock.id))
    throw Error("Review this cut source before recording a measurement.");
  const labeled = ensurePartLabels(project);
  const { length, width, fromEnd, fromEdge } = marks;
  const inputSize = offcutStockSize(piece);
  const [, originalWidth, originalLength] = inputSize;
  const tolerance = 1e-6;
  if (![length, width, fromEnd, fromEdge].every(Number.isFinite) || length < 0.001 || width < 0.001 || fromEnd < 0 || fromEdge < 0)
    throw Error("Enter positive usable dimensions and nonnegative marks from the original edges.");
  if (length + fromEnd > originalLength + tolerance || width + fromEdge > originalWidth + tolerance)
    throw Error("The marked blank extends beyond the recorded offcut.");
  if (length >= originalLength - tolerance && width >= originalWidth - tolerance)
    throw Error("Enter a smaller usable width or length.");

  const axes = stockAxes(piece, piece.cutStock.size);
  const inset: V3 = [0, 0, 0];
  inset[axes.width] = fromEdge;
  inset[axes.length] = fromEnd;
  const size = [...piece.size] as V3;
  size[axes.width] = Math.min(width, originalWidth - fromEdge);
  size[axes.length] = Math.min(length, originalLength - fromEnd);
  const shift = rotate(inset.map((value, index) => value + (size[index] - piece.size[index]) / 2) as V3, piece.rotation);
  const output: Piece = {
    ...piece,
    id: uid(),
    size,
    position: piece.position.map((value, index) => value + shift[index]) as V3,
    cutStock: {
      ...piece.cutStock,
      offset: piece.cutStock.offset.map((value, index) => value + inset[index]) as V3,
    },
  };
  const previous = cutSourceRegion(piece);
  const result = cutSourceRegion(output);
  const next = projectSchema.parse(ensurePartLabels({
    ...labeled, guideFingerprint: null,
    pieces: labeled.pieces.map((row) => row.id === id ? output : row),
    history: [...labeled.history, {
      id: uid(), at: new Date().toISOString(), stepId: piece.stepId,
      message: `Measured the usable rectangle in ${partLabel(labeled, id)} · ${piece.name}.`,
      offcutCut: {
        sourceId: piece.cutStock.id, inputId: id, targetId: output.id, inputSize, inputName: piece.name,
        result: { size: result.size, sourceSize: result.sourceSize, offset: result.offset },
        usableMeasurement: { inputOffset: previous.offset, fromEnd: inset[axes.length], fromEdge: inset[axes.width] },
        cuts: [], remnants: [{ id: output.id, size: offcutStockSize(output) }],
      },
    }].slice(-5000),
  }));
  if (!inspectCutStock(next).valid.has(piece.cutStock.id))
    throw Error("The marked blank overlaps another part of this source.");
  return { next, output };
}
