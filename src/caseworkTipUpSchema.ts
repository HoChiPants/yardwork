import { z } from "zod";

export const caseworkTipUpInputSchema = z.strictObject({
  ceilingHeight: z.number().finite().positive().max(480),
  stagingOffset: z.number().finite().min(0).max(240),
  restingFace: z.enum(["front", "back"]),
});
export const caseworkTipUpSchema = caseworkTipUpInputSchema.extend({
  entryId: z.uuid(),
});
export type CaseworkTipUpPlan = z.infer<typeof caseworkTipUpSchema>;
