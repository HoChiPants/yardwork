import { z } from "zod";

const id = z.string().uuid();
const positiveLength = z.number().finite().positive().max(12000).nullable();
export const HINGE_STOCK_HISTORY_LIMIT = 50;
export const hingeStockCutSchema = z.strictObject({
  id,
  /** Source-local start of removed kerf, in inches. */
  position: z.number().finite().min(0).max(12000).nullable(),
  kerf: positiveLength,
  basis: z.string().max(1000),
  measuredAt: z.iso.datetime().nullable(),
});
export const hingeStockSnapshotSchema = z.strictObject({
  productId: z.literal("everbilt-29256-continuous-hinge"),
  evidenceRevision: z.string().min(1).max(120),
  purchaseSelectionId: id.nullable(),
  usableLength: positiveLength,
  basis: z.string().max(1000),
  measuredAt: z.iso.datetime().nullable(),
  cuts: z
    .array(hingeStockCutSchema)
    .max(100)
    .refine(
      (cuts) => new Set(cuts.map((cut) => cut.id)).size === cuts.length,
      "Hinge cut IDs must be unique.",
    ),
  notes: z.string().max(3000),
});
export const hingeStockHistorySchema = z.strictObject({
  id,
  kind: z.literal("edit"),
  at: z.iso.datetime(),
  basis: z.string().trim().min(1).max(1000),
  previous: hingeStockSnapshotSchema,
  next: hingeStockSnapshotSchema,
});
export const hingeStockSourceSchema = hingeStockSnapshotSchema
  .extend({
    id,
    referenceHistory: z
      .array(hingeStockHistorySchema)
      .max(HINGE_STOCK_HISTORY_LIMIT)
      .default([]),
  })
  .superRefine((source, ctx) => {
    if (
      new Set(source.referenceHistory.map((row) => row.id)).size !==
      source.referenceHistory.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["referenceHistory"],
        message: "Hinge stock history IDs must be unique.",
      });
  });

export type HingeStockCut = z.infer<typeof hingeStockCutSchema>;
export type HingeStockSnapshot = z.infer<typeof hingeStockSnapshotSchema>;
export type HingeStockHistory = z.infer<typeof hingeStockHistorySchema>;
export type HingeStockSource = z.infer<typeof hingeStockSourceSchema>;
