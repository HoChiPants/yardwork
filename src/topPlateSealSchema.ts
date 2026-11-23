import { z } from "zod";
import { bottomPlateInputSchema } from "./bottomPlateSealSchema";

export type DrywallPlateFace = "top" | "bottom";

export const topPlateInputSchema = bottomPlateInputSchema.omit({ dryExposedWood: true }).extend({
  dryInteriorBeforeDrywall: z.literal(true),
});

export const topPlateSealSchema = topPlateInputSchema.extend({
  id: z.uuid(),
  signature: z.string().min(1).max(32000),
});

export const topPlateSealsSchema = z.array(topPlateSealSchema).max(64).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ plateId, side }) => `${plateId}/${side}`)).size === rows.length,
  "Save one drywall seal plan per plate side.",
);

export type TopPlateInput = z.infer<typeof topPlateInputSchema>;
export type TopPlateSeal = z.infer<typeof topPlateSealSchema>;
