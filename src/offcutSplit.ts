import { cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { blank, material, maxProjectPieces, projectSchema, uid, type Piece, type Project } from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";
import { offcutStockSize, stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";

export type OffcutSplitKind = "crosscut" | "rip";
export type OffcutSplitPreset = "equal" | "sample" | "four" | { count: number; kind?: OffcutSplitKind };
export const stainSampleInstructions = "https://www.minwax.com/en/how-to-finish-wood/wood-preparation/frequently-asked-questions";

export function offcutSplitEligible(piece: Piece) {
  const stock = material(piece.material);
  return piece.offcut && !!piece.cutStock && stock.wood && stock.cuttable &&
    (stock.stockKind === "linear" || stock.stockKind === "sheet") &&
    !piece.cutPlanes.length && !pieceThroughOpenings(piece).length;
}

export function offcutSplitOptions(piece: Piece) {
  if (!offcutSplitEligible(piece)) return [];
  const { length, width } = stockAxes(piece, piece.cutStock!.size);
  return ([{ kind: "crosscut", axis: length }, { kind: "rip", axis: width }] as const)
    .filter(({ axis }) => piece.size[axis] - pieceCutKerf(piece) > 0.002);
}

export function offcutSplitSuggestions(piece: Piece) {
  const [option] = offcutSplitOptions(piece);
  if (option?.kind !== "crosscut") return [];
  const usable = piece.size[option.axis] - pieceCutKerf(piece);
  const fourPieceSize = (piece.size[option.axis] - 3 * pieceCutKerf(piece)) / 4;
  return [
    { id: "equal" as const, name: "Two equal blanks", size: usable / 2, count: null,
      label: "", detail: "Start a matched pair of layout spacers or setup blocks. Set the final size for your job." },
    ...(fourPieceSize >= 0.001 ? [{ id: "four" as const, name: "Four equal blanks", size: fourPieceSize, count: 4,
      label: "Setup block", detail: "Make four matching setup blocks in one cut plan." }] : []),
    ...(usable > 6.001 ? [{ id: "sample" as const, name: "Finish sample", size: 6, count: null,
      label: "Finish sample", detail: "Set aside matching wood to compare stain or finish." }] : []),
  ];
}

function planLooseSplits(project: Project, offcutId: string, kind: OffcutSplitKind, count: number, label: string, firstSize?: number) {
  const source = project.pieces.find(({ id }) => id === offcutId);
  const option = source && offcutSplitOptions(source).find((row) => row.kind === kind);
  if (!source?.cutStock || !option) throw Error("Choose a rectangular wood offcut and an available cut direction.");
  const sourceId = source.cutStock.id;
  if (!inspectCutStock(project).valid.has(sourceId)) throw Error("Review this cut source before splitting the offcut.");
  if (project.sections.some(({ pieceIds }) => pieceIds.includes(offcutId)))
    throw Error("Remove the offcut from its section before dividing the stock.");
  const kerf = pieceCutKerf(source);
  const available = source.size[option.axis];
  if (!Number.isSafeInteger(count) || count < 2)
    throw Error("Enter a whole number of blanks, at least two.");
  if (project.pieces.length + count - 1 > maxProjectPieces)
    throw Error("This split would exceed the project’s part limit.");
  const size = firstSize ?? (available - kerf * (count - 1)) / count;
  if (!Number.isFinite(size) || size < 0.001 || available - size - kerf < 0.001)
    throw Error(firstSize === undefined ? "Choose fewer blanks so there is enough stock for every saw cut."
      : "Enter a cut that leaves two pieces after the saw allowance.");

  const named = label.trim() ? `Offcut · ${label.trim()}`.slice(0, 120) : undefined;
  const geometry = blank();
  const outputs: Piece[] = [];
  const generated: Piece[] = [];
  const records = [];
  let remainder = source;
  for (let index = 1; index < count; index++) {
    const input = remainder;
    const { pieces: [kept, tail] } = cutPiece({ ...geometry, pieces: [input] }, input.id, size, option.axis);
    const primary = { ...kept, id: uid(), name: named ?? input.name };
    const finalTail = index === count - 1 && firstSize === undefined && named
      ? { ...tail, name: named } : tail;
    const { size: retained, sourceSize, offset } = cutSourceRegion(primary);
    records.push({
      sourceId, inputId: input.id, targetId: primary.id, looseSplit: true as const,
      inputSize: offcutStockSize(input), inputName: input.name,
      result: { size: retained, sourceSize, offset },
      cuts: [{ kind, size }],
      remnants: [primary, finalTail].map((part) => ({ id: part.id, size: offcutStockSize(part) })),
    });
    generated.push(primary, finalTail);
    outputs.push(primary);
    remainder = finalTail;
  }
  outputs.push(remainder);
  const labeled = ensurePartLabels({ ...project, pieces: [...project.pieces, ...generated] });
  const at = new Date().toISOString();
  const next = projectSchema.parse({
    ...labeled,
    pieces: [...project.pieces.map((piece) => piece.id === offcutId ? outputs[0] : piece), ...outputs.slice(1)],
    guideFingerprint: null,
    history: [...project.history, ...records.map((offcutCut) => ({
      id: uid(), at, stepId: source.stepId,
      message: `Split ${partLabel(labeled, offcutCut.inputId)} · ${offcutCut.inputName} into two loose blanks.`,
      offcutCut,
    }))].slice(-5000),
  });
  if (!inspectCutStock(next).valid.has(sourceId))
    throw Error("The split does not fit the saved cut source. Recheck the original stock dimensions.");
  return { next, outputs, kerf, pending: project.plannedCutSources?.some((plan) => plan.sourceId === sourceId) };
}

export function previewOffcutSplit(project: Project, offcutId: string, kind: OffcutSplitKind, firstSize: number, label: string) {
  return planLooseSplits(project, offcutId, kind, 2, label, firstSize);
}

export function previewEqualOffcutSplit(project: Project, offcutId: string, kind: OffcutSplitKind, count: number, label: string) {
  return planLooseSplits(project, offcutId, kind, count, label);
}
