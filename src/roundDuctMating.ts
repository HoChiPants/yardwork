import { ductLengthTolerance, fitRoundDuctOffcut } from "./roundDuctEndFit";
import { ductTipKey, requiredElbowPipeEnd, type RoundDuctElbowInput } from "./roundDuctElbowSchema";
import { roundDuctSlotKey, type RoundDuctEnd, type RoundDuctEnds } from "./roundDuctSchema";
import type { reviewRoundDuctStock, RoundDuctStockRun } from "./roundDuctStock";

type StockReview = ReturnType<typeof reviewRoundDuctStock>;
type RequiredEnds = readonly [RoundDuctEnd | undefined, RoundDuctEnd | undefined];
type CutEnds = {
  ends: RoundDuctEnds;
  status: "factory" | "verify-existing" | "recorded";
  trim?: "start" | "end";
  removesCrimp?: true;
};
type EndSchedule = { cuts: CutEnds[]; issue?: string };

export function roundDuctRequiredTips(elbows: readonly { input: RoundDuctElbowInput }[]) {
  const tips = new Map<string, RoundDuctEnd>();
  for (const { input } of elbows) {
    tips.set(ductTipKey(input.first), requiredElbowPipeEnd(input, "first"));
    tips.set(ductTipKey(input.second), requiredElbowPipeEnd(input, "second"));
  }
  return tips;
}

export function requiredRoundDuctEnds(tips: ReadonlyMap<string, RoundDuctEnd>, runId: string): RequiredEnds {
  return [tips.get(ductTipKey({ runId, tip: "start" })), tips.get(ductTipKey({ runId, tip: "end" }))];
}

const factoryEnds: RoundDuctEnds[] = [["plain", "crimped"], ["crimped", "plain"]];
const plainEnds: RoundDuctEnds = ["plain", "plain"];

export function roundDuctMatingSchedule(
  run: RoundDuctStockRun,
  stock: StockReview,
  required: RequiredEnds,
): EndSchedule {
  const candidates = (run.cuts ?? []).map(({ length }, index): CutEnds[] => {
    const key = roundDuctSlotKey(run.id, index);
    const measured = stock.completedUses.get(key)?.offcut.used?.ends ?? stock.assigned.get(key)?.offcut.assignment?.ends;
    if (measured) return [{ ends: measured, status: "recorded" }];
    if (stock.credits.has(key)) return [...factoryEnds, plainEnds].map((ends) => ({ ends, status: "verify-existing" }));
    const { stockLength, cutLoss, factoryCrimpLength } = run.input;
    const mayRemoveCrimp = factoryCrimpLength !== undefined && stockLength - length - cutLoss >= factoryCrimpLength - ductLengthTolerance;
    return (mayRemoveCrimp ? [...factoryEnds, plainEnds] : factoryEnds).flatMap((ends): CutEnds[] => {
      const fit = fitRoundDuctOffcut({ length: stockLength, ends: factoryEnds[0] }, length, ends, cutLoss);
      return fit ? [{
        ends, status: "factory", ...(fit.trim && { trim: fit.trim }),
        ...(ends === plainEnds && { removesCrimp: true }),
      }] : [];
    });
  });
  if (!candidates.length) return { cuts: [], issue: "Check the pipe lengths before planning mating ends." };

  // Work back from the finish. Each state records the cut to use for a given
  // starting form and a known match on the next pipe.
  const viable: Map<RoundDuctEnd, CutEnds>[] = candidates.map(() => new Map());
  for (let index = candidates.length - 1; index >= 0; index--) {
    for (const option of candidates[index]) {
      const [start, end] = option.ends;
      const neededNext = end === "plain" ? "crimped" : "plain";
      const matches = index === candidates.length - 1 ? !required[1] || end === required[1] : viable[index + 1].has(neededNext);
      if (matches && !viable[index].has(start)) viable[index].set(start, option);
    }
  }
  const start = required[0] ?? viable[0].keys().next().value;
  if (!start || !viable[0].has(start)) return {
    cuts: [],
    issue: "The available pipe ends cannot mate across this run. Review the connected fittings and reserved stock. Enter the measured factory crimp length if a trim can remove it, or choose a compatible measured offcut.",
  };
  const cuts: CutEnds[] = [];
  let nextStart: RoundDuctEnd = start;
  for (const options of viable) {
    const next: CutEnds = options.get(nextStart)!;
    cuts.push(next);
    nextStart = next.ends[1] === "plain" ? "crimped" : "plain";
  }
  return { cuts };
}

export function roundDuctMatingInstruction(cut: CutEnds) {
  const forms = `Start ${cut.ends[0]} · finish ${cut.ends[1]}.`;
  if (cut.status === "verify-existing") return `Verify the previously cut pipe has these ends. ${forms}`;
  if (cut.status === "recorded" || !cut.trim) return forms;
  if (cut.removesCrimp) return `${forms} Trim off the measured factory crimp at the ${cut.trim}.`;
  return `${forms} Trim the plain ${cut.trim} and keep the factory crimp.`;
}
