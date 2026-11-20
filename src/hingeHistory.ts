import type { Project } from "./model";
import type { LidHingePlan } from "./hingeSchema";
import { lidHingePlanSchema } from "./hingeSchema";
import { canonicalFastenerValue as canonical } from "./fastenerHistory";
import { retainHingeStockHistory } from "./hingeStock";
export function assertHingeHistoryPrefix(
  previous: readonly LidHingePlan[],
  next: readonly LidHingePlan[],
) {
  const byId = new Map(next.map((plan) => [plan.id, plan]));
  for (const old of previous) {
    const current = byId.get(old.id);
    if (
      current &&
      (current.referenceHistory.length < old.referenceHistory.length ||
        old.referenceHistory.some(
          (row, i) => canonical(row) !== canonical(current.referenceHistory[i]),
        ))
    )
      throw Error(
        "Hinge reference history is append-only. Reload instead of removing or rewriting earlier records.",
      );
  }
}
/** Undo changes active design, while H/L reservations and exact receipts stay history. */
export function retainHingeLabelHistory(
  target: Project,
  current: Project,
): Project {
  if (target.id !== current.id) return target;
  const ledger = [...current.hingePlanLabels];
  for (const row of target.hingePlanLabels) {
    const old = ledger.find((item) => item.planId === row.planId);
    if (
      (old && old.label !== row.label) ||
      ledger.some(
        (item) => item.label === row.label && item.planId !== row.planId,
      )
    )
      throw Error("Conflicting hinge label reservations cannot be reassigned.");
    if (!old) ledger.push(row);
  }
  return {
    ...target,
    hingePlanLabels: ledger,
    hingeStockSources: retainHingeStockHistory(
      target.hingeStockSources,
      current.hingeStockSources,
    ),
    lidHingePlans: target.lidHingePlans.map((plan) => {
      const saved = current.lidHingePlans.find((p) => p.id === plan.id);
      const rows = [...(saved?.referenceHistory ?? [])];
      for (const row of plan.referenceHistory) {
        const old = rows.find((item) => item.id === row.id);
        if (old && canonical(old) !== canonical(row))
          throw Error("Hinge reference history cannot be rewritten by Undo.");
        if (!old) rows.push(row);
      }
      return lidHingePlanSchema.parse({
        ...plan,
        referenceHistory: rows,
        nextLocationNumber: Math.max(
          plan.nextLocationNumber,
          saved?.nextLocationNumber ?? 1,
        ),
      });
    }),
  };
}
