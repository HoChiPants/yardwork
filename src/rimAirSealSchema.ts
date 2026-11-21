import { z } from "zod";
import { rimFoam } from "./rimAirSealReference";

export const rimSideSchema = z.enum(["back", "front"]);
export type RimSide = z.infer<typeof rimSideSchema>;
export const rimBayMeasurementSchema = z.strictObject({
  left: z.uuid(),
  right: z.uuid(),
  width: z.number().positive().max(600),
  height: z.number().positive().max(48),
});
export const rimAirSealInputSchema = z.strictObject({
  sectionId: z.uuid(),
  side: rimSideSchema,
  topInset: z.number().min(0).max(48),
  gap: z.number().positive().max(8),
  kerf: z.number().min(0).max(1),
  confirmedBacking: z.literal(true),
  bays: z.array(rimBayMeasurementSchema).min(1).max(200),
  offcut: z.strictObject({
    label: z.string().trim().min(1).max(60),
    width: z.number().positive().max(rimFoam.width),
    length: z.number().positive().max(rimFoam.length),
  }).optional(),
}).refine(({ bays }) => new Set(bays.map(({ left, right }) => `${left}/${right}`)).size === bays.length,
  "Each rim bay can appear once on this plan.");
export type RimAirSealInput = z.infer<typeof rimAirSealInputSchema>;

export const rimAirSealPlanSchema = z.strictObject({
  input: rimAirSealInputSchema,
  frame: z.string().min(1).max(80_000),
});
export type RimAirSealPlan = z.infer<typeof rimAirSealPlanSchema>;
export const rimAirSealPlansSchema = z.array(rimAirSealPlanSchema).max(200).refine((plans) =>
  new Set(plans.map(({ input }) => `${input.sectionId}/${input.side}`)).size === plans.length,
  "Save one rim air seal per floor base and side.");
