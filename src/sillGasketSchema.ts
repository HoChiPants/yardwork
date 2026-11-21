import { z } from "zod";

export const sillGasketMeasurementsSchema = z.strictObject({
  substrate: z.enum(["concrete", "masonry"]),
  top: z.number().finite().min(-12000).max(12000),
  supportWidth: z.number().finite().positive().max(240),
  supportLength: z.number().finite().positive().max(2400),
  centerOffset: z.number().finite().min(-240).max(240),
  allowance: z.number().finite().min(0).max(600),
});
export type SillGasketMeasurements = z.infer<typeof sillGasketMeasurementsSchema>;

const sillGasketPlanSchema = z.strictObject({
  partId: z.uuid(),
  signature: z.string().min(1).max(2000),
  measured: sillGasketMeasurementsSchema,
});
export type SillGasketPlan = z.infer<typeof sillGasketPlanSchema>;
export const sillGasketPlansSchema = z.array(sillGasketPlanSchema).max(200).refine(
  (plans) => new Set(plans.map(({ partId }) => partId)).size === plans.length,
  "Keep one measured gasket run per sill plate.",
);
