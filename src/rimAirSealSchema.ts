import { z } from "zod";
import { rimEdgeSealant, rimFoam } from "./rimAirSealReference";

export const rimSideSchema = z.enum(["back", "front"]);
export type RimSide = z.infer<typeof rimSideSchema>;
export const rimBayMeasurementSchema = z.strictObject({
  left: z.uuid(),
  right: z.uuid(),
  width: z.number().positive().max(600),
  height: z.number().positive().max(48),
});
export const rimFoamDimensionsSchema = z.strictObject({
  label: z.string().trim().min(1).max(60),
  width: z.number().positive().max(rimFoam.width),
  length: z.number().positive().max(rimFoam.length),
});
export type RimFoamDimensions = z.infer<typeof rimFoamDimensionsSchema>;
export const rimFoamOffcutSchema = rimFoamDimensionsSchema.extend({ id: z.uuid() });
export type RimFoamOffcut = z.infer<typeof rimFoamOffcutSchema>;
export const rimFoamLabelKey = (label: string) => label.trim().toLowerCase();
export const rimFoamOffcutPoolSchema = z.array(rimFoamOffcutSchema).max(200).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ label }) => rimFoamLabelKey(label))).size === rows.length,
  "Use a unique label for each physical foam offcut.");

export const rimAirSealInputSchema = z.strictObject({
  sectionId: z.uuid(),
  side: rimSideSchema,
  topInset: z.number().min(0).max(48),
  gap: z.number().positive().max(8),
  kerf: z.number().min(0).max(1),
  confirmedBacking: z.literal(true),
  bays: z.array(rimBayMeasurementSchema).min(1).max(200),
  offcut: rimFoamDimensionsSchema.optional(),
  poolOffcutIds: z.array(z.uuid()).max(200).refine((ids) => new Set(ids).size === ids.length,
    "Select each physical foam offcut once.").optional(),
  edgeSeal: z.strictObject({
    depth: z.number().positive().max(rimFoam.thickness),
    trialLengthPerCan: z.number().min(0.125),
    session: z.string().trim().min(1).max(60),
  }).optional(),
}).refine(({ edgeSeal, gap }) => !edgeSeal || gap <= rimEdgeSealant.maxGap, {
  path: ["edgeSeal"],
  message: "Great Stuff Gaps & Cracks is for gaps up to 1 in. Recheck the clearance or plan a different sealant.",
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
