import { z } from "zod";
import { sunliteFastener } from "./sunliteFastenerReference";

const coord = z.number().finite().min(-480).max(480);
const point = z.tuple([coord, coord]);
const measurement = z.number().finite().min(0.001).max(2);

export const sunliteMountDetailSchema = z.strictObject({
  face: z.union([z.literal(1), z.literal(-1)]),
  neutral: point,
  shank: measurement,
  washer: measurement,
  minimumCoverage: measurement,
  basis: z.string().trim().min(1).max(200),
});
export const sunliteMountHoleSchema = z.strictObject({
  id: z.uuid(),
  backingId: z.uuid(),
  center: point,
  diameter: measurement,
});
export type SunliteMountDetail = z.infer<typeof sunliteMountDetailSchema>;
export type SunliteMountHole = z.infer<typeof sunliteMountHoleSchema>;

export const sunliteMountSchema = z.strictObject({
  panelId: z.uuid(),
  productId: z.literal(sunliteFastener.productId),
  fingerprint: z.string().min(1).max(100),
  detail: sunliteMountDetailSchema,
  holes: z
    .array(sunliteMountHoleSchema)
    .max(96)
    .refine(
      (holes) => new Set(holes.map(({ id }) => id)).size === holes.length,
      "Each hole must have a unique identifier.",
    ),
});
export type SunliteMount = z.infer<typeof sunliteMountSchema>;
export const sunliteMountsSchema = z
  .array(sunliteMountSchema)
  .max(256)
  .refine(
    (plans) =>
      new Set(plans.map(({ panelId }) => panelId)).size === plans.length,
    "Save one fastener plan per panel.",
  );
