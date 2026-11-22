import { z } from "zod";
import { weatherWatch } from "./roofValleyReference";

export const valleyKey = (panels: readonly string[]) => [...panels].sort().join("/");

export const roofValleyInputSchema = z.strictObject({
  panels: z.array(z.uuid()).min(2).max(24)
    .refine((panels) => new Set(panels).size === panels.length, "Choose distinct retained roof panels."),
  label: z.string().trim().min(1).max(80).regex(/^[^\r\n]+$/),
  length: z.number().positive().max(12000),
  peakExtra: z.number().positive().max(weatherWatch.maxCut),
  lap: z.number().min(weatherWatch.minLap).max(24),
  fieldConfirmed: z.literal(true),
  offcut: z.strictObject({
    label: z.string().trim().min(1).max(60).regex(/^[^\r\n]+$/),
    width: z.literal(weatherWatch.width),
    length: z.number().positive().max(weatherWatch.length),
  }).optional(),
});
export type RoofValleyInput = z.infer<typeof roofValleyInputSchema>;

export const roofValleySchema = z.strictObject({
  input: roofValleyInputSchema,
  signature: z.string().min(1).max(80000),
});
export type RoofValley = z.infer<typeof roofValleySchema>;

export const roofValleysSchema = z.array(roofValleySchema).max(48).refine((plans) =>
  new Set(plans.map(({ input }) => valleyKey(input.panels))).size === plans.length,
  "Save each modeled valley once.");
