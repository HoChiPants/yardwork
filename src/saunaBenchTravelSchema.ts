import { z } from "zod";

export const saunaBenchTravelInputSchema = z.strictObject({
  openingOffset: z.number().finite().min(-60).max(60),
  openingWidth: z.number().finite().positive().max(120),
  openingHeight: z.number().finite().positive().max(120),
  sillRise: z.number().finite().min(0).max(24),
  passageDepth: z.number().finite().positive().max(36),
  lift: z.number().finite().min(0).max(48),
  turnOffset: z.number().finite().min(-120).max(120),
  heaterPlaced: z.boolean(),
});

export const saunaBenchTravelSchema = saunaBenchTravelInputSchema.extend({
  roomId: z.uuid(),
  benchId: z.uuid(),
  roughWidth: z.number().finite().positive(),
  roughHeight: z.number().finite().positive(),
});
export type SaunaBenchTravelPlan = z.infer<typeof saunaBenchTravelSchema>;
