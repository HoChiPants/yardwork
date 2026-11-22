import type { RoundDuctEnds } from "./roundDuctSchema";

export const ductLengthTolerance = 1e-7;

export function fitRoundDuctOffcut(
  offcut: { length: number; ends: RoundDuctEnds },
  length: number,
  ends: RoundDuctEnds,
  cutLoss: number,
) {
  const excess = offcut.length - length;
  if (excess < -ductLengthTolerance) return null;
  const exact = excess <= ductLengthTolerance;
  if (!exact && excess + ductLengthTolerance < cutLoss) return null;
  const trims = exact ? [null] : ["start", "end"] as const;
  for (const reversed of [false, true]) {
    const [start, end] = reversed ? [offcut.ends[1], offcut.ends[0]] : offcut.ends;
    for (const trim of trims) {
      const actualStart = trim === "start" ? "plain" : start;
      const actualEnd = trim === "end" ? "plain" : end;
      if (actualStart !== ends[0] || actualEnd !== ends[1]) continue;
      const remnantLength = excess - cutLoss;
      const remnant = trim && remnantLength > ductLengthTolerance ? {
        length: remnantLength,
        ends: (trim === "start" ? [start, "plain"] : ["plain", end]) as RoundDuctEnds,
      } : undefined;
      return { reversed, trim, ...(remnant && { remnant }) };
    }
  }
  return null;
}
