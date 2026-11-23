import { z } from "zod";
import {
  edgeBandingMaxLength,
  edgeBandingProductIds,
} from "./edgeBandingReference";

export const edgeBandingFaces = z.enum(["-X", "+X", "-Y", "+Y", "-Z", "+Z"]);
export type EdgeBandingFace = z.infer<typeof edgeBandingFaces>;
export const edgeBandingTrim = z
  .number()
  .finite()
  .min(0)
  .max(edgeBandingMaxLength);
export const measuredBandingThickness = z.number().finite().min(0.001).max(0.125);
export const edgeBandingProduct = z.enum(edgeBandingProductIds);

const edgeBandingEntry = z.strictObject({
  pieceId: z.uuid(),
  face: edgeBandingFaces,
  productId: edgeBandingProduct,
  fingerprint: z.string().min(1).max(100),
  label: z.string().min(1).max(160),
  trim: edgeBandingTrim,
  installedThickness: measuredBandingThickness.optional(),
});
export type EdgeBandingEntry = z.infer<typeof edgeBandingEntry>;
export const edgeBandingSchema = z
  .array(edgeBandingEntry)
  .min(1)
  .max(2400)
  .refine(
    (rows) =>
      new Set(rows.map(({ pieceId, face }) => `${pieceId}/${face}`)).size ===
      rows.length,
    "Each panel edge can have one banding plan.",
  );
