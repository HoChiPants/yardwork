import { z } from "zod";
import { sdwsFramingPacks } from "./sdwsFramingReference";
import { cutSourceAxesSchema } from "./cutSourceAxes";
import { materialIds } from "./materialIds";
import { cutPlanesSchema } from "./cutProfiles";
import { rectangularOpeningSchema, roundOpeningSchema } from "./throughOpeningSchema";
const id = z.string().uuid();
const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
export const fastenerProductIds = [
  "grk-r4-103101",
  "grk-cabinet-113079",
  "simpson-csvz3r70",
  "simpson-dsvt3r70",
  "grk-cabinet-114069",
  ...sdwsFramingPacks.map(({ productId }) => productId),
] as const;
const size = z.tuple([
  z.number().finite().positive().max(12000),
  z.number().finite().positive().max(12000),
  z.number().finite().positive().max(12000),
]);
export const fastenerBaselineSchema = z.strictObject({
  capturedAt: z.iso.datetime(),
  partLabel: z.string().regex(/^[PO][0-9]{3,6}$/),
  material: z.enum(materialIds),
  materialName: z.string().min(1).max(240),
  size,
  stockSize: size,
  productRegistryRef: z.string().min(1).max(120).nullable(),
  stockKind: z.enum(["linear", "sheet", "roll", "fastener", "connector"]),
  wood: z.boolean(),
  position: vec,
  rotation: vec,
  cutPlanes: cutPlanesSchema,
  roundOpenings: z.array(roundOpeningSchema).min(1).max(6).optional(),
  rectangularOpenings: z.array(rectangularOpeningSchema).min(1).max(6).optional(),
  cutStock: z
    .strictObject({
      id,
      sourceAxes: cutSourceAxesSchema.optional(),
      size,
      offset: z.tuple([
        z.number().finite().min(0).max(12000),
        z.number().finite().min(0).max(12000),
        z.number().finite().min(0).max(12000),
      ]),
    })
    .nullable(),
  stockLengthAxis: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .nullable(),
});
export const fastenerPartRefSchema = z.strictObject({
  pieceId: id,
  name: z.string().min(1).max(120),
  geometryFingerprint: z.string().min(1).max(100),
  baselinePose: z.strictObject({ position: vec, rotation: vec }),
  /** Missing historical geometry stays unknown, never reconstructed from a fingerprint. */
  baseline: fastenerBaselineSchema.nullable().default(null),
});
export const fastenerLocationSchema = z.strictObject({
  id,
  label: z
    .string()
    .regex(/^F[0-9]{3,6}$/)
    .refine((v) => Number(v.slice(1)) >= 1),
  name: z.string().min(1).max(100),
  entranceLocal: vec.nullable(),
  driveLocal: vec
    .refine(
      (v) => Math.abs(Math.hypot(...v) - 1) <= 1e-6,
      "Use a normalized nonzero drive direction.",
    )
    .nullable(),
});
const measurement = z.number().finite().positive().max(12).nullable();
export const fastenerMeasurementsSchema = z
  .strictObject({
    /** Actual proposed surface-to-tip depth after seating; never nominal product length. */
    surfaceToTipDepth: measurement,
    pilotDiameter: measurement,
    /** Deepest pilot-drill tip depth from the same wood entrance; not full bore depth. */
    pilotDepth: measurement,
    basis: z.string().max(1000),
    measuredAt: z.iso.datetime().nullable(),
  })
  .superRefine((m, ctx) => {
    if (
      [m.surfaceToTipDepth, m.pilotDiameter, m.pilotDepth].some(
        (v) => v !== null,
      ) &&
      (!m.basis.trim() || !m.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record the user measurement basis and date with measured fastening dimensions.",
      });
  });
const toolDimension = z.number().finite().positive().max(48);
export const driverAccessSchema = z.strictObject({
  bitReach: toolDimension,
  shaftWidth: toolDimension,
  bodyLength: toolDimension,
  bodyWidth: toolDimension,
  approachTravel: z.number().finite().min(0).max(48),
});
export type DriverAccess = z.infer<typeof driverAccessSchema>;
export const FASTENER_REFERENCE_HISTORY_LIMIT = 50;
export const fastenerReferenceHistorySchema = z.strictObject({
  id,
  kind: z.enum(["remap", "refresh"]),
  at: z.iso.datetime(),
  basis: z.string().trim().min(1).max(1000),
  locationMode: z.enum(["clear", "retain-local"]),
  previous: z.strictObject({
    head: fastenerPartRefSchema,
    receiver: fastenerPartRefSchema,
    locations: z.array(fastenerLocationSchema).max(100),
    measurements: fastenerMeasurementsSchema,
    productId: z.enum(fastenerProductIds),
    productEvidenceRevision: z.string().min(1).max(120),
    nextLocationNumber: z.number().int().min(1).max(1000000),
  }),
  next: z.strictObject({
    head: fastenerPartRefSchema,
    receiver: fastenerPartRefSchema,
    productId: z.enum(fastenerProductIds),
    productEvidenceRevision: z.string().min(1).max(120),
  }),
});
export const fastenerPlanSchema = z
  .strictObject({
    id,
    label: z
      .string()
      .regex(/^W[0-9]{3,6}$/)
      .refine((v) => Number(v.slice(1)) >= 1),
    kind: z.literal("wood-screw"),
    productId: z.enum(fastenerProductIds),
    productEvidenceRevision: z.string().min(1).max(120),
    name: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    head: fastenerPartRefSchema,
    receiver: fastenerPartRefSchema,
    nextLocationNumber: z.number().int().min(1).max(1000000),
    locations: z.array(fastenerLocationSchema).max(100),
    measurements: fastenerMeasurementsSchema,
    driverAccess: driverAccessSchema.optional(),
    referenceHistory: z
      .array(fastenerReferenceHistorySchema)
      .max(FASTENER_REFERENCE_HISTORY_LIMIT)
      .default([]),
    notes: z.string().max(3000),
  })
  .superRefine((plan, ctx) => {
    if (plan.head.pieceId === plan.receiver.pieceId)
      ctx.addIssue({
        code: "custom",
        message: "Select two distinct actual parts.",
      });
    if (
      new Set(plan.referenceHistory.map((row) => row.id)).size !==
      plan.referenceHistory.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Reference history IDs must be unique.",
      });
    if (new Set(plan.locations.map((p) => p.id)).size !== plan.locations.length)
      ctx.addIssue({
        code: "custom",
        message: "Fastener location IDs must be unique.",
      });
    if (
      new Set(plan.locations.map((p) => p.label)).size !==
        plan.locations.length ||
      plan.locations.some(
        (p) => Number(p.label.slice(1)) >= plan.nextLocationNumber,
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Fastener labels must be unique and reserved by the next location number.",
      });
  });
export type FastenerPartRef = z.infer<typeof fastenerPartRefSchema>;
export type FastenerBaseline = z.infer<typeof fastenerBaselineSchema>;
export type FastenerReferenceHistory = z.infer<
  typeof fastenerReferenceHistorySchema
>;
export type FastenerLocation = z.infer<typeof fastenerLocationSchema>;
export type FastenerMeasurements = z.infer<typeof fastenerMeasurementsSchema>;
export type FastenerPlan = z.infer<typeof fastenerPlanSchema>;
export function emptyFastenerMeasurements(): FastenerMeasurements {
  return {
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  };
}
