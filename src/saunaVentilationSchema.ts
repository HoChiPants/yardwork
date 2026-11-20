import { z } from "zod";

export const saunaVentWalls = ["front", "right", "back", "left"] as const;
const diameter = z.number().finite().min(0.125).max(48);
export const saunaVentOpeningSchema = z.strictObject({
  wall: z.enum(saunaVentWalls),
  offset: z.number().finite().min(-240).max(240),
  height: z.number().finite().min(0).max(240),
  bore: diameter,
  depth: z.number().finite().min(0.125).max(48),
});
const airOpening = saunaVentOpeningSchema.extend({ duct: diameter });
export const saunaVentilationInputSchema = z.strictObject({
  mode: z.enum(["mechanical", "gravity"]),
  intake: airOpening,
  exhaust: airOpening,
  drying: z.union([z.literal("door"), saunaVentOpeningSchema, z.null()]),
});
export const saunaVentilationPlanSchema = saunaVentilationInputSchema.extend({
  roomId: z.string().uuid(),
  reference: z.string().min(1).max(70),
});
export type SaunaVentOpening = z.infer<typeof saunaVentOpeningSchema>;
export type SaunaVentilationInput = z.infer<typeof saunaVentilationInputSchema>;
export type SaunaVentilationPlan = z.infer<typeof saunaVentilationPlanSchema>;
