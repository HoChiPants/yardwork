import { z } from "zod";

export const sunliteProfileId = z.enum(["sunlite-96714", "sunlite-96715"]);
export const sunliteProfileStockLimit = 96;
const notes = z.string().trim().min(1).max(400);

export const sunliteProfileSetupSchema = z.strictObject({
  usableLength: z.number().positive().max(sunliteProfileStockLimit),
  kerf: z.number().positive().max(1),
  basis: notes,
  measuredAt: z.iso.datetime(),
});

export const sunliteCutInputSchema = z.strictObject({
  length: z.number().positive().max(240),
  basis: notes,
  measuredAt: z.iso.datetime(),
});

export const sunliteProfileCutSchema = sunliteCutInputSchema.extend({
  runId: z.string().min(1).max(160),
  fingerprint: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  productId: sunliteProfileId,
});

export const sunliteProfilePlanSchema = z.strictObject({
  setups: z.partialRecord(sunliteProfileId, sunliteProfileSetupSchema),
  cuts: z
    .array(sunliteProfileCutSchema)
    .max(1500)
    .refine(
      (cuts) => new Set(cuts.map((cut) => cut.runId)).size === cuts.length,
      "Record one measured length per profile run.",
    ),
});

export type SunliteProfileId = z.infer<typeof sunliteProfileId>;
export type SunliteProfileCut = z.infer<typeof sunliteProfileCutSchema>;
export type SunliteProfileSetup = z.infer<typeof sunliteProfileSetupSchema>;
