import type { ConnectorPlan } from "./connectorSchema";

/** Active physical intent only. Names, checklist prose and retained history are metadata. */
export function connectorPhysicalIntent(plan: ConnectorPlan) {
  const member = (ref: ConnectorPlan["base"]) => ({
    pieceId: ref.pieceId,
    geometryFingerprint: ref.geometryFingerprint,
    baselinePose: ref.baselinePose,
    source: ref.baseline ? {
      stockSize: ref.baseline.stockSize,
      productRegistryRef: ref.baseline.productRegistryRef,
      stockKind: ref.baseline.stockKind,
      wood: ref.baseline.wood,
    } : null,
  });
  return {
    id: plan.id, productId: plan.productId, evidenceRevision: plan.evidenceRevision,
    scheduleId: plan.scheduleId, base: member(plan.base), post: member(plan.post),
    entries: plan.entries.map((entry) => ({
      id: entry.id, role: entry.role,
      entranceLocal: entry.entranceLocal, driveLocal: entry.driveLocal,
      measurements: {
        woodEntryToTipDepth: entry.measurements.woodEntryToTipDepth,
        pilotDiameter: entry.measurements.pilotDiameter,
        pilotDepth: entry.measurements.pilotDepth,
      },
    })),
  };
}
