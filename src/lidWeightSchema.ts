import { z } from "zod";

const offset = z.number().finite().min(-12000).max(12000);
export const lidWeightInputsSchema = z.strictObject({
  weightLb: z.number().finite().positive().max(1000),
  centerLocal: z.tuple([offset, offset, offset]),
});
export const lidWeightPlanSchema = lidWeightInputsSchema.extend({
  sectionId: z.string().uuid(),
  pieceId: z.string().uuid(),
  geometryKey: z.string().min(1).max(100),
});
export type LidWeightPlan = z.infer<typeof lidWeightPlanSchema>;
