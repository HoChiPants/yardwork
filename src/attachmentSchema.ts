import { z } from "zod";
import { shelfPinProducts, type ShelfPinProductId } from "./shelfPinReference";
const id = z.string().uuid();
const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
export const shelfPinProductId = "kreg-kma-5mpin" as const;
export const nominalShelfPinBore = 5 / 25.4;
export const kregShelfPinPitch = 32 / 25.4;
export const attachmentPartRefSchema = z.strictObject({
  pieceId: id,
  sectionId: id,
  role: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  geometryFingerprint: z.string().min(1).max(100),
  baselinePose: z.strictObject({ position: vec, rotation: vec }),
});
export const shelfPinLayoutSchema = z.strictObject({
  system: z.enum(["custom", "kreg-32mm"]),
  frontInset: z.number().finite().positive().max(120),
  rearInset: z.number().finite().positive().max(120),
  /** First hole-center height measured from each side panel's bottom edge. */
  datumHeight: z.number().finite().min(0).max(240).nullable(),
});
const depth = z.number().finite().positive().max(12).nullable();
export const shelfPinMeasurementsSchema = z
  .strictObject({
    pinInsertionDepth: depth,
    bearingReach: depth,
    /** Signed vertical distance from the pin axis to the shelf underside. */
    bearingOffset: z.number().finite().min(-2).max(2).nullable(),
    fullDiameterBoreDepth: depth,
    deepestDrillTipDepth: depth,
    fitTestConfirmed: z.literal(true).optional(),
    basis: z.string().max(1000),
    measuredAt: z.iso.datetime().nullable(),
  })
  .superRefine((m, ctx) => {
    const hasMeasuredValues = [
      m.pinInsertionDepth,
      m.bearingReach,
      m.bearingOffset,
      m.fullDiameterBoreDepth,
      m.deepestDrillTipDepth,
    ].some((v) => v !== null);
    if (
      (hasMeasuredValues || m.fitTestConfirmed) &&
      (!m.basis.trim() || !m.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Describe the user measurement basis and date before saving measured dimensions or test-bore confirmation.",
      });
  });
export const shelfPinPointSchema = z.strictObject({
  id,
  shelf: attachmentPartRefSchema,
  mount: attachmentPartRefSchema,
  side: z.enum(["left", "right"]),
  row: z.enum(["front", "rear"]),
  mountFace: z.strictObject({
    axis: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    sign: z.union([z.literal(-1), z.literal(1)]),
  }),
  /** Intent datum, not an invented pin solid or a drilled hole. */
  bearingTargetLocal: vec,
  shelfAnchorLocal: vec,
});
export const attachmentPlanSchema = z.strictObject({
  id,
  kind: z.literal("shelf-pins"),
  name: z.string().min(1).max(100),
  entryId: id,
  productId: z.enum(Object.keys(shelfPinProducts) as ShelfPinProductId[]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  shelfRoles: z
    .array(z.string().regex(/^(shelf-|tower-shelf-)[1-6]$/))
    .min(1)
    .max(6),
  layout: shelfPinLayoutSchema,
  measurements: shelfPinMeasurementsSchema,
  points: z.array(shelfPinPointSchema).min(1).max(24),
});
export type AttachmentPlan = z.infer<typeof attachmentPlanSchema>;
export type AttachmentPartRef = z.infer<typeof attachmentPartRefSchema>;
export type ShelfPinPoint = z.infer<typeof shelfPinPointSchema>;
export type ShelfPinLayout = z.infer<typeof shelfPinLayoutSchema>;
export type ShelfPinMeasurements = z.infer<typeof shelfPinMeasurementsSchema>;
export function emptyShelfPinMeasurements(): ShelfPinMeasurements {
  return {
    pinInsertionDepth: null,
    bearingReach: null,
    bearingOffset: null,
    fullDiameterBoreDepth: null,
    deepestDrillTipDepth: null,
    basis: "",
    measuredAt: null,
  };
}
