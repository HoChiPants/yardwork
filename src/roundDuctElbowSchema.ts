import { z } from "zod";
import { roundDuctStock } from "./roundDuctReference";
import type { RoundDuctEnd } from "./roundDuctSchema";

const end = z.strictObject({ runId: z.uuid(), tip: z.enum(["start", "end"]) });
const setback = z.number().finite().positive().max(48);
export const roundDuctElbowInputSchema = z.strictObject({
  first: end,
  second: end,
  firstSetback: setback,
  secondSetback: setback,
  envelopeWidth: z.number().finite().min(roundDuctStock.diameter).max(48),
  crimpedTip: z.enum(["first", "second"]),
});
export type RoundDuctElbowInput = z.infer<typeof roundDuctElbowInputSchema>;
export type RoundDuctTip = RoundDuctElbowInput["first"];
export const ductTipKey = ({ runId, tip }: RoundDuctTip) => `${runId}/${tip}`;
export const requiredElbowPipeEnd = (input: RoundDuctElbowInput, side: "first" | "second"): RoundDuctEnd =>
  input.crimpedTip === side ? "plain" : "crimped";

export const roundDuctElbowsSchema = z.array(z.strictObject({
  id: z.uuid(),
  input: roundDuctElbowInputSchema,
})).max(24).superRefine((elbows, ctx) => {
  const ids = new Set<string>();
  const tips = new Set<string>();
  elbows.forEach(({ id, input }, index) => {
    const ends = [ductTipKey(input.first), ductTipKey(input.second)];
    if (ids.has(id) || input.first.runId === input.second.runId || ends.some((key) => tips.has(key)))
      ctx.addIssue({ code: "custom", path: [index], message: "Use two distinct pipes and reserve each elbow endpoint once." });
    ids.add(id);
    ends.forEach((key) => tips.add(key));
  });
});
