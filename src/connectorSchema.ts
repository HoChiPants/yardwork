import { z } from "zod";
import { fastenerPartRefSchema } from "./fasteningSchema";
import { canonicalFastenerValue } from "./fastenerHistory";
const id = z.string().uuid();
const vec = z.tuple([
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
  z.number().finite().min(-12000).max(12000),
]);
export const connectorMeasurementsSchema = z
  .strictObject({
    /** Proposed tip depth from the actual wood entry, never nominal fastener length. */
    woodEntryToTipDepth: z.number().finite().positive().max(12).nullable(),
    pilotDiameter: z.number().finite().positive().max(12).nullable(),
    /** Deepest pilot-drill tip from the same wood entry, not full bore or a machine setting. */
    pilotDepth: z.number().finite().positive().max(12).nullable(),
    basis: z.string().max(1000),
    measuredAt: z.iso.datetime().nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      [value.woodEntryToTipDepth, value.pilotDiameter, value.pilotDepth].some(
        (n) => n !== null,
      ) &&
      (!value.basis.trim() || !value.measuredAt)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record the user measurement basis/date with connector fastener depths or diameters.",
      });
  });
export const connectorEntrySchema = z.strictObject({
  id,
  label: z.string().regex(/^E[0-9]{3,6}$/),
  name: z.string().min(1).max(100),
  role: z.enum(["base", "post"]),
  entranceLocal: vec.nullable(),
  driveLocal: vec
    .refine(
      (value) => Math.abs(Math.hypot(...value) - 1) <= 1e-6,
      "Use a normalized nonzero inward direction.",
    )
    .nullable(),
  measurements: connectorMeasurementsSchema,
});
export const connectorIntentSchema = z.strictObject({
  productId: z.literal("simpson-a21z"),
  evidenceRevision: z.string().min(1).max(120),
  scheduleId: z.enum(["sd9112", "n10dhdg"]),
  base: fastenerPartRefSchema,
  post: fastenerPartRefSchema,
  // Structurally readable imports with wrong counts are excluded by derived review.
  entries: z.array(connectorEntrySchema).max(100),
  notes: z.string().max(3000),
});
export const CONNECTOR_REFERENCE_HISTORY_LIMIT = 50;
export const connectorReferenceHistorySchema = z.strictObject({
  id,
  kind: z.enum(["refresh", "schedule"]),
  at: z.iso.datetime(),
  basis: z.string().trim().min(1).max(1000),
  previous: connectorIntentSchema,
  next: connectorIntentSchema,
});
export const connectorPlanSchema = z
  .strictObject({
    id,
    label: z
      .string()
      .regex(/^C[0-9]{3,6}$/)
      .refine((value) => Number(value.slice(1)) >= 1),
    kind: z.literal("wood-angle"),
    name: z.string().min(1).max(100),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    ...connectorIntentSchema.shape,
    referenceHistory: z
      .array(connectorReferenceHistorySchema)
      .max(CONNECTOR_REFERENCE_HISTORY_LIMIT)
      .default([]),
  })
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.entries.map((entry) => entry.id)).size !==
        plan.entries.length ||
      new Set(plan.entries.map((entry) => entry.label)).size !==
        plan.entries.length ||
      new Set(plan.referenceHistory.map((row) => row.id)).size !==
        plan.referenceHistory.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Connector entry/history IDs and entry labels must be unique.",
      });
  });
export type ConnectorPlan = z.infer<typeof connectorPlanSchema>;
export type ConnectorEntry = z.infer<typeof connectorEntrySchema>;
export type ConnectorMeasurements = z.infer<typeof connectorMeasurementsSchema>;
export type ConnectorIntent = z.infer<typeof connectorIntentSchema>;
export type ConnectorReferenceHistory = z.infer<
  typeof connectorReferenceHistorySchema
>;
export const emptyConnectorMeasurements = (): ConnectorMeasurements => ({
  woodEntryToTipDepth: null,
  pilotDiameter: null,
  pilotDepth: null,
  basis: "",
  measuredAt: null,
});
export const connectorIntentSnapshot = (plan: ConnectorPlan): ConnectorIntent =>
  connectorIntentSchema.parse(
    Object.fromEntries(
      Object.keys(connectorIntentSchema.shape).map((key) => [
        key,
        structuredClone(plan[key as keyof ConnectorPlan]),
      ]),
    ),
  );
/** Neutral whole-project persistence guard; explicit plan removal remains possible. */
export function assertConnectorHistoryPrefix(
  previous: readonly ConnectorPlan[],
  next: readonly ConnectorPlan[],
): void {
  const byId = new Map(next.map((plan) => [plan.id, plan]));
  for (const old of previous) {
    const current = byId.get(old.id);
    if (
      current &&
      (current.referenceHistory.length < old.referenceHistory.length ||
        old.referenceHistory.some(
          (row, i) =>
            canonicalFastenerValue(row) !==
            canonicalFastenerValue(current.referenceHistory[i]),
        ))
    )
      throw Error(
        "Connector reference history is append-only. Reload instead of removing or rewriting an earlier record.",
      );
  }
}
