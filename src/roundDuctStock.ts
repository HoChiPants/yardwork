import { ductLengthTolerance, fitRoundDuctOffcut } from "./roundDuctEndFit";
import { roundDuctSlotKey, type RoundDuctInput, type RoundDuctOffcut } from "./roundDuctSchema";

export type RoundDuctStockRun = {
  id: string;
  input: RoundDuctInput;
  issues: string[];
  cuts?: { length: number; whole: boolean; tail: number }[];
};

export function ductRunSignature(input: RoundDuctInput) {
  const { start, end, envelopeWidth, stockLength, startEngagement, endEngagement, jointOverlap, cutLoss } = input;
  return JSON.stringify([start, end, envelopeWidth, stockLength, startEngagement, endEngagement, jointOverlap, cutLoss]);
}

type DuctFit = NonNullable<ReturnType<typeof fitRoundDuctOffcut>>;
type FittedDuctStock = { offcut: RoundDuctOffcut; fit: DuctFit };

export function reviewRoundDuctStock(reviews: readonly RoundDuctStockRun[], records: readonly RoundDuctOffcut[]) {
  const runs = new Map(reviews.map((review) => [review.id, review]));
  const credits = new Set<string>();
  const completedUses = new Map<string, FittedDuctStock>();
  for (const offcut of records) {
    const { source, used } = offcut;
    if (source) {
      const run = runs.get(source.runId);
      const cut = run?.cuts?.[source.index];
      if (run && !run.issues.length && ductRunSignature(run.input) === source.signature &&
          cut && Math.abs(cut.length - source.cutLength) <= ductLengthTolerance &&
          Math.abs(run.input.stockLength - source.stockLength) <= ductLengthTolerance)
        credits.add(roundDuctSlotKey(source.runId, source.index));
    }
    if (used) {
      const run = runs.get(used.runId);
      const cut = run?.cuts?.[used.index];
      const fit = cut && fitRoundDuctOffcut(offcut, cut.length, used.ends, used.cutLoss);
      if (run && !run.issues.length && ductRunSignature(run.input) === used.signature &&
          cut && Math.abs(cut.length - used.cutLength) <= ductLengthTolerance &&
          Math.abs(run.input.cutLoss - used.cutLoss) <= ductLengthTolerance && fit) {
        const slot = roundDuctSlotKey(used.runId, used.index);
        credits.add(slot);
        completedUses.set(slot, { offcut, fit });
      }
    }
  }
  const assigned = new Map<string, FittedDuctStock>();
  const stale = new Map<string, string>();
  for (const offcut of records) {
    const assignment = offcut.assignment;
    if (!assignment) continue;
    const run = runs.get(assignment.runId);
    const slot = roundDuctSlotKey(assignment.runId, assignment.index);
    const cut = run?.cuts?.[assignment.index];
    const fit = run && cut && fitRoundDuctOffcut(offcut, cut.length, assignment.ends, run.input.cutLoss);
    if (!run || run.issues.length || assignment.signature !== ductRunSignature(run.input) || !fit) {
      stale.set(offcut.id, "Recheck the receiving run, cut length and mating ends before reserving this offcut again.");
    } else if (credits.has(slot) || assigned.has(slot)) {
      stale.set(offcut.id, "This duct section already has recorded stock.");
    } else assigned.set(slot, { offcut, fit });
  }
  return { credits, completedUses, assigned, stale };
}
