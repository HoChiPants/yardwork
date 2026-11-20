import { material, uid, type Piece, type Project } from "./model";
import { partLabel } from "./partLabels";
import { attachmentGeometryFingerprint } from "./attachments";
import {
  FASTENER_REFERENCE_HISTORY_LIMIT,
  type FastenerPartRef,
  type FastenerPlan,
  type FastenerReferenceHistory,
} from "./fasteningSchema";
import { canonicalFastenerValue } from "./fastenerHistory";
export {
  canonicalFastenerValue,
  assertFastenerHistoryPrefix,
} from "./fastenerHistory";

export function captureFastenerReference(
  project: Project,
  piece: Piece,
  at = new Date().toISOString(),
): FastenerPartRef {
  const stock = material(piece.material);
  if (stock.stockKind === "equipment")
    throw Error("Choose a mounting member with a known physical stock profile for the fastener reference.");
  return {
    pieceId: piece.id,
    name: piece.name,
    geometryFingerprint: attachmentGeometryFingerprint(piece),
    baselinePose: {
      position: [...piece.position],
      rotation: [...piece.rotation],
    },
    baseline: {
      capturedAt: at,
      partLabel: partLabel(project, piece.id),
      material: piece.material,
      materialName: stock.name,
      size: [...piece.size],
      stockSize: [...(stock.stockSize ?? stock.size)],
      productRegistryRef: stock.productReference ?? null,
      stockKind: stock.stockKind,
      wood: stock.wood,
      position: [...piece.position],
      rotation: [...piece.rotation],
      cutPlanes: structuredClone(piece.cutPlanes),
      ...(piece.roundOpenings?.length ? { roundOpenings: structuredClone(piece.roundOpenings) } : {}),
      ...(piece.rectangularOpenings?.length ? { rectangularOpenings: structuredClone(piece.rectangularOpenings) } : {}),
      cutStock: piece.cutStock ? structuredClone(piece.cutStock) : null,
      stockLengthAxis: piece.stockLengthAxis ?? null,
    },
  };
}
/** Null legacy baselines contain no historical source facts to infer or compare. */
export function fastenerSourceCurrent(
  piece: Piece,
  ref: FastenerPartRef,
): boolean {
  if (!ref.baseline) return true;
  const stock = material(piece.material);
  return (
    canonicalFastenerValue({
      stockSize: stock.stockSize ?? stock.size,
      productRegistryRef: stock.productReference ?? null,
      wood: stock.wood,
      stockKind: stock.stockKind,
    }) ===
    canonicalFastenerValue({
      stockSize: ref.baseline.stockSize,
      productRegistryRef: ref.baseline.productRegistryRef,
      wood: ref.baseline.wood,
      stockKind: ref.baseline.stockKind,
    })
  );
}
export function fastenerReferenceSnapshot(
  plan: FastenerPlan,
): FastenerReferenceHistory["previous"] {
  return structuredClone({
    head: plan.head,
    receiver: plan.receiver,
    locations: plan.locations,
    measurements: plan.measurements,
    productId: plan.productId,
    productEvidenceRevision: plan.productEvidenceRevision,
    nextLocationNumber: plan.nextLocationNumber,
  });
}
export function appendFastenerReferenceHistory(
  plan: FastenerPlan,
  previous: FastenerPlan,
  kind: FastenerReferenceHistory["kind"],
  basis: string,
  locationMode: FastenerReferenceHistory["locationMode"],
  at = new Date().toISOString(),
): FastenerPlan {
  if (plan.referenceHistory.length >= FASTENER_REFERENCE_HISTORY_LIMIT)
    throw Error(
      "The reference history is full. Export this plan's history before starting another fastening plan; no earlier records were removed.",
    );
  return {
    ...plan,
    referenceHistory: [
      ...plan.referenceHistory,
      {
        id: uid(),
        kind,
        at,
        basis: basis.trim(),
        locationMode,
        previous: fastenerReferenceSnapshot(previous),
        next: structuredClone({
          head: plan.head,
          receiver: plan.receiver,
          productId: plan.productId,
          productEvidenceRevision: plan.productEvidenceRevision,
        }),
      },
    ],
  };
}
