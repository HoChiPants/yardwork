import type { FastenerReferenceHistory } from "./fasteningSchema";

export function canonicalFastenerValue(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
type HistoryCarrier = {
  id: string;
  referenceHistory?: readonly FastenerReferenceHistory[];
};
/** Shared by local edits and whole-project persistence; geometry Undo remains allowed. */
export function assertFastenerHistoryPrefix(
  previousPlans: readonly HistoryCarrier[],
  nextPlans: readonly HistoryCarrier[],
): void {
  const next = new Map(nextPlans.map((plan) => [plan.id, plan]));
  for (const previous of previousPlans) {
    const current = next.get(previous.id);
    if (!current) continue; // Explicit plan removal is supported.
    const before = previous.referenceHistory ?? [],
      after = current.referenceHistory ?? [];
    if (
      after.length < before.length ||
      before.some(
        (row, i) =>
          canonicalFastenerValue(row) !== canonicalFastenerValue(after[i]),
      )
    )
      throw Error(
        "Reference history is append-only. Reload the current plan instead of removing or rewriting earlier records.",
      );
  }
}
