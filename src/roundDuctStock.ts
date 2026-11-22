import { roundDuctSlotKey, type RoundDuctEnds, type RoundDuctInput, type RoundDuctOffcut } from "./roundDuctSchema";

export type RoundDuctStockRun = {
  id: string;
  input: RoundDuctInput;
  issues: string[];
  cuts?: { length: number; whole: boolean; tail: number }[];
};

export const ductLengthTolerance = 1e-7;

export function ductRunSignature(input: RoundDuctInput) {
  const { start, end, envelopeWidth, stockLength, startEngagement, endEngagement, jointOverlap, cutLoss } = input;
  return JSON.stringify([start, end, envelopeWidth, stockLength, startEngagement, endEngagement, jointOverlap, cutLoss]);
}

export function fitRoundDuctOffcut(offcut: RoundDuctOffcut, length: number, ends: RoundDuctEnds) {
  const excess = offcut.length - length;
  if (excess < -ductLengthTolerance) return null;
  const trims = excess > ductLengthTolerance ? ["start", "end"] as const : [null];
  for (const reversed of [false, true]) {
    const [start, end] = reversed ? [offcut.ends[1], offcut.ends[0]] : offcut.ends;
    for (const trim of trims) {
      const actualStart = trim === "start" ? "plain" : start;
      const actualEnd = trim === "end" ? "plain" : end;
      if (actualStart === ends[0] && actualEnd === ends[1]) return { reversed, trim };
    }
  }
  return null;
}

type DuctFit = NonNullable<ReturnType<typeof fitRoundDuctOffcut>>;

export function reviewRoundDuctStock(reviews: readonly RoundDuctStockRun[], records: readonly RoundDuctOffcut[]) {
  const runs = new Map(reviews.map((review) => [review.id, review]));
  const credits = new Set<string>();
  for (const { source } of records) {
    if (!source) continue;
    const run = runs.get(source.runId);
    const cut = run?.cuts?.[source.index];
    if (run && !run.issues.length && ductRunSignature(run.input) === source.signature &&
        cut && Math.abs(cut.length - source.cutLength) <= ductLengthTolerance)
      credits.add(roundDuctSlotKey(source.runId, source.index));
  }
  const assigned = new Map<string, { offcut: RoundDuctOffcut; fit: DuctFit }>();
  const stale = new Map<string, string>();
  for (const offcut of records) {
    const assignment = offcut.assignment;
    if (!assignment) continue;
    const run = runs.get(assignment.runId);
    const slot = roundDuctSlotKey(assignment.runId, assignment.index);
    const cut = run?.cuts?.[assignment.index];
    const fit = cut && fitRoundDuctOffcut(offcut, cut.length, assignment.ends);
    if (!run || run.issues.length || assignment.signature !== ductRunSignature(run.input) || !fit) {
      stale.set(offcut.id, "Recheck the receiving run, cut length and mating ends before reserving this offcut again.");
    } else if (credits.has(slot) || assigned.has(slot)) {
      stale.set(offcut.id, "This duct section already has recorded stock.");
    } else assigned.set(slot, { offcut, fit });
  }
  return { credits, assigned, stale };
}
