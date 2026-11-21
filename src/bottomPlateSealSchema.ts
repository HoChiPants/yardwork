import { z } from "zod";
import { bottomPlateSealant } from "./bottomPlateSealReference";

export const bottomPlateInputSchema = z.strictObject({
  plateId: z.uuid(),
  side: z.enum(["a", "b"]),
  gap: z.number().finite().min(0).max(bottomPlateSealant.maxWidth),
  depth: z.number().finite().min(0).max(bottomPlateSealant.maxDepth),
  bead: z.enum(["1/4", "3/8"]),
  session: z.string().trim().min(1).max(60),
  dryExposedWood: z.literal(true),
});

export const bottomPlateSealSchema = bottomPlateInputSchema.extend({
  id: z.uuid(),
  signature: z.string().min(1).max(32000),
});

export const bottomPlateSealsSchema = z.array(bottomPlateSealSchema).max(64).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ plateId, side }) => `${plateId}/${side}`)).size === rows.length,
  "Save one plan per plate side.",
);

export type BottomPlateInput = z.infer<typeof bottomPlateInputSchema>;
export type BottomPlateSeal = z.infer<typeof bottomPlateSealSchema>;
