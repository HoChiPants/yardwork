import { z } from "zod";
import {
  fastenerPartRefSchema,
  fastenerMeasurementsSchema,
} from "./fasteningSchema";
const id = z.string().uuid();
const vec = z.tuple(
  [0, 1, 2].map(() => z.number().finite().min(-12000).max(12000)) as [
    z.ZodNumber,
    z.ZodNumber,
    z.ZodNumber,
  ],
);
const unit = vec.refine(
  (v) => Math.abs(Math.hypot(...v) - 1) <= 1e-6,
  "Use a normalized nonzero direction.",
);
const provenance = {
  basis: z.string().max(1000),
  measuredAt: z.iso.datetime().nullable(),
};
export const hingeAxisSchema = z
  .strictObject({
    movingA: vec.nullable(),
    movingB: vec.nullable(),
    fixedA: vec.nullable(),
    fixedB: vec.nullable(),
    ...provenance,
  })
  .superRefine((axis, ctx) => {
    if (
      [axis.movingA, axis.movingB, axis.fixedA, axis.fixedB].some(
        (v) => v !== null,
      ) &&
      (!axis.basis.trim() || !axis.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Record the axis datum basis and date with entered points.",
      });
  });
export const hingeHardwareSchema = z
  .strictObject({
    description: z.string().max(300),
    drive: z.string().max(120),
    suppliedCount: z.number().int().min(0).max(10000).nullable(),
    included: z.boolean().nullable(),
    leafThickness: z.number().finite().positive().max(2).nullable(),
    ...provenance,
  })
  .superRefine((hardware, ctx) => {
    if (
      (hardware.suppliedCount !== null ||
        hardware.included !== null ||
        hardware.leafThickness !== null) &&
      (!hardware.basis.trim() || !hardware.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record the delivered hardware basis and date with observations.",
      });
  });
export const hingeLocationSchema = z.strictObject({
  id,
  label: z
    .string()
    .regex(/^L[0-9]{3,6}$/)
    .refine((v) => Number(v.slice(1)) >= 1),
  name: z.string().min(1).max(100),
  leaf: z.enum(["moving", "fixed"]),
  entranceLocal: vec.nullable(),
  driveLocal: unit.nullable(),
  measurements: fastenerMeasurementsSchema,
});
const hingeIntentSchema = z.strictObject({
  sectionId: id,
  productId: z.literal("everbilt-29256-continuous-hinge"),
  evidenceRevision: z.string().min(1).max(120),
  moving: fastenerPartRefSchema,
  fixed: fastenerPartRefSchema,
  /** The closed moving pose in the fixed member's local coordinate frame. */
  closedPose: z.strictObject({ position: vec, rotation: vec }),
  axis: hingeAxisSchema,
  stockAllocation: z
    .strictObject({
      sourceId: id,
      segmentId: z.string().min(1).max(160),
      sourceFingerprint: z.string().min(1).max(120),
    })
    .nullable(),
  hardware: hingeHardwareSchema,
  locations: z.array(hingeLocationSchema).max(100),
  nextLocationNumber: z.number().int().min(1).max(1000000),
  selectedForMotion: z.boolean(),
  notes: z.string().max(3000),
});
export const HINGE_REFERENCE_HISTORY_LIMIT = 50;
export const hingeReferenceHistorySchema = z.strictObject({
  id,
  kind: z.enum(["refresh", "remap", "axis", "allocation"]),
  at: z.iso.datetime(),
  basis: z.string().trim().min(1).max(1000),
  locationMode: z.enum(["clear", "retain-local"]),
  previous: hingeIntentSchema,
  next: hingeIntentSchema,
});
export const lidHingePlanSchema = z
  .strictObject({
    id,
    label: z
      .string()
      .regex(/^H[0-9]{3,6}$/)
      .refine((v) => Number(v.slice(1)) >= 1),
    kind: z.literal("continuous-hinge"),
    name: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    ...hingeIntentSchema.shape,
    referenceHistory: z
      .array(hingeReferenceHistorySchema)
      .max(HINGE_REFERENCE_HISTORY_LIMIT)
      .default([]),
  })
  .superRefine((plan, ctx) => {
    if (plan.moving.pieceId === plan.fixed.pieceId)
      ctx.addIssue({
        code: "custom",
        message: "Select two distinct actual members.",
      });
    if (
      new Set(plan.locations.map((p) => p.id)).size !== plan.locations.length ||
      new Set(plan.locations.map((p) => p.label)).size !==
        plan.locations.length ||
      plan.locations.some(
        (p) => Number(p.label.slice(1)) >= plan.nextLocationNumber,
      ) ||
      new Set(plan.referenceHistory.map((p) => p.id)).size !==
        plan.referenceHistory.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Hinge location/history IDs and reserved labels must be unique.",
      });
  });
/** Exact world axis used for a persisted open pose; closing never guesses a new axis. */
export const recordedLidMotionSchema = z.strictObject({
  planId: id,
  movingPieceId: id,
  pivot: vec,
  axis: unit,
  closedPose: z.strictObject({ position: vec, rotation: vec }),
  openedPose: z.strictObject({ position: vec, rotation: vec }),
});
export type LidHingePlan = z.infer<typeof lidHingePlanSchema>;
export type HingeAxis = z.infer<typeof hingeAxisSchema>;
export type HingeLocation = z.infer<typeof hingeLocationSchema>;
export type HingeReferenceHistory = z.infer<typeof hingeReferenceHistorySchema>;
export type HingeIntent = z.infer<typeof hingeIntentSchema>;
export type RecordedLidMotion = z.infer<typeof recordedLidMotionSchema>;
export const hingeIntentSnapshot = (plan: LidHingePlan): HingeIntent =>
  hingeIntentSchema.parse(
    Object.fromEntries(
      Object.keys(hingeIntentSchema.shape).map((key) => [
        key,
        structuredClone(plan[key as keyof LidHingePlan]),
      ]),
    ),
  );
export function emptyHingeAxis(): HingeAxis {
  return {
    movingA: null,
    movingB: null,
    fixedA: null,
    fixedB: null,
    basis: "",
    measuredAt: null,
  };
}
