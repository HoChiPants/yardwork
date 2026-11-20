import { bom, type BomRow } from "./engine";
import { materialFamilyVariants } from "./materialGroups";
import { material, type Material, type MaterialId, type Piece, type Project } from "./model";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { orientedStockSize } from "./stockAxes";
import { stockCutSequences } from "./stockCutSequence";

const dryCasework = ["plytanium-703", "hd-purebond-birch-703"] as const;
const sizeOf = (stock: Material) => [...(stock.stockSize ?? stock.size)].sort((a, b) => a - b);

/** Listed blank fit only. The finished part keeps its size, orientation and woodwork. */
export function partStockOptions(project: Project, piece: Piece) {
  if (project.retailer !== "home-depot") return [];
  const original = material(piece.material);
  if (piece.offcut || piece.cutStock || !original.wood || !original.cuttable ||
    original.shape || original.orderRollWidth ||
    (original.stockKind !== "linear" && original.stockKind !== "sheet")) return [];
  const family = dryCasework.some((id) => id === piece.material) ? dryCasework : materialFamilyVariants(piece.material);
  const [thickness, width] = sizeOf(original);
  const [partThickness, partWidth, partLength] = orientedStockSize(piece);
  return family.flatMap((id) => {
    if (id === piece.material) return [];
    const stock = material(id);
    if (!stock.wood || !stock.cuttable || stock.shape || stock.orderRollWidth || stock.stockKind !== original.stockKind)
      return [];
    if (stock.productReference && !reviewedOfferForMaterial(stock, project.retailer)) return [];
    const [t, w, l] = sizeOf(stock);
    if (Math.abs(t - thickness) > 0.001 ||
        (original.stockKind === "linear" && Math.abs(w - width) > 0.001) ||
        partThickness > t + 0.001 || partWidth > w + 0.001 || partLength > l + 0.001)
      return [];
    return [stock];
  });
}

export function previewPartStockReplacement(project: Project, pieceId: string, replacement: MaterialId) {
  const piece = project.pieces.find(({ id }) => id === pieceId);
  if (!piece || !partStockOptions(project, piece).some(({ id }) => id === replacement))
    throw Error("Choose a matching stock blank that fits this part. Recorded cut sources stay linked to their original stock.");
  return previewReplacement(project, piece.material, [piece], replacement);
}

export function stockReplacementGroup(project: Project, source: MaterialId) {
  const active = project.pieces.filter((piece) => piece.material === source && !piece.offcut);
  const parts = active.filter((piece) => !piece.cutStock);
  const eligible = parts.length >= 2 ? parts.map((piece) => partStockOptions(project, piece)) : [];
  const [first, ...rest] = eligible;
  const options = (first ?? []).filter((stock) =>
    reviewedOfferForMaterial(stock, project.retailer)?.seller === "The Home Depot" &&
    rest.every((choices) => choices.some((choice) => choice.id === stock.id)),
  );
  return { parts, options, recordedCount: active.length - parts.length };
}

export function previewGroupStockReplacement(project: Project, source: MaterialId, replacement: MaterialId, now = Date.now()) {
  const group = stockReplacementGroup(project, source);
  if (!group.options.some(({ id }) => id === replacement))
    throw Error("Choose a stock blank that fits every part without a recorded source on this line.");
  return previewReplacement(project, source, group.parts, replacement, now);
}

function previewReplacement(project: Project, source: MaterialId, parts: Piece[], replacement: MaterialId, now = Date.now()) {
  const changed = new Set(parts.map(({ id }) => id));
  const next = {
    ...project,
    pieces: project.pieces.map((part) => changed.has(part.id) ? { ...part, material: replacement } : part),
  };
  const after = bom(next, now);
  const replacementRow = after.find(({ id }) => id === replacement);
  const sequences = replacementRow ? stockCutSequences(next, [replacementRow]).get(replacement) ?? [] : [];
  const fitted = new Set(sequences.flatMap((sequence) => sequence.review ? [] : sequence.layout.kept.map(({ id }) => id)));
  const unsupported = parts.find(({ id }) => !fitted.has(id));
  if (unsupported) {
    const sequence = sequences.find(({ partIds }) => partIds.includes(unsupported.id));
    throw Error(sequence?.review ?? `No modeled cut order fits ${unsupported.name} from the selected blank.`);
  }
  const before = bom(project, now);
  const sourceRows = [source, replacement].map((id) => ({
    id,
    before: before.find((row) => row.id === id),
    after: after.find((row) => row.id === id),
  }));
  const purchase = sourceRows.map(({ id, before, after }) => ({
    id, before: before?.quantity ?? 0, after: after?.quantity ?? 0,
  }));
  const purchasedLength = material(source).stockKind === "linear" ? {
    before: sourceRows.reduce((total, row) => total + (row.before?.purchasedStockUnits ?? 0) * sizeOf(material(row.id))[2], 0),
    after: sourceRows.reduce((total, row) => total + (row.after?.purchasedStockUnits ?? 0) * sizeOf(material(row.id))[2], 0),
  } : undefined;
  const offer = reviewedOfferForMaterial(material(replacement), project.retailer);
  const observation = replacementRow?.inventory;
  const snapshot = observation && observation.internetNumber === offer?.productId ? observation : undefined;
  const observedCost = {
    before: observedSubtotal(sourceRows.map((row) => row.before)),
    after: observedSubtotal(sourceRows.map((row) => row.after)),
  };
  return { project: next, purchase, purchasedLength, snapshot, observedCost };
}

function observedSubtotal(rows: (BomRow | undefined)[]) {
  if (rows.some((row) => row && (row.oversize || (row.quantity > 0 && !row.inventory))))
    return null;
  return rows.reduce((sum, row) => sum + (row?.total ?? 0), 0);
}
