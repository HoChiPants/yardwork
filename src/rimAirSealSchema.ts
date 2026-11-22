import { z } from "zod";
import { rimEdgeSealant, rimFoam } from "./rimAirSealReference";

export const rimSideSchema = z.enum(["back", "front"]);
export type RimSide = z.infer<typeof rimSideSchema>;
export const rimBayMeasurementSchema = z.strictObject({
  left: z.uuid(),
  right: z.uuid(),
  width: z.number().positive().max(600),
  height: z.number().positive().max(48),
});
export const rimFoamDimensionsSchema = z.strictObject({
  label: z.string().trim().min(1).max(60),
  width: z.number().positive().max(rimFoam.width),
  length: z.number().positive().max(rimFoam.length),
});
export type RimFoamDimensions = z.infer<typeof rimFoamDimensionsSchema>;
export const rimFoamOffcutSchema = rimFoamDimensionsSchema.extend({ id: z.uuid() });
export type RimFoamOffcut = z.infer<typeof rimFoamOffcutSchema>;
export const rimFoamLabelKey = (label: string) => label.trim().toLowerCase();
export const rimFoamOffcutPoolSchema = z.array(rimFoamOffcutSchema).max(200).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ label }) => rimFoamLabelKey(label))).size === rows.length,
  "Use a unique label for each physical foam offcut.");

const rimFoamPlacementSchema = z.strictObject({
  id: z.string().min(1).max(180),
  name: z.string().min(1).max(220),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  length: z.number().positive(),
  rotated: z.boolean(),
});
const rimFoamStockSchema = z.strictObject({
  width: z.number().positive().max(rimFoam.width),
  length: z.number().positive().max(rimFoam.length),
  usedLength: z.number().min(0).max(rimFoam.length),
  placements: z.array(rimFoamPlacementSchema).min(1).max(2000),
}).refine(({ width, length, placements }) =>
  new Set(placements.map(({ id }) => id)).size === placements.length &&
  placements.every((cut) => cut.x + cut.width <= width + 1e-6 && cut.y + cut.length <= length + 1e-6),
  "Recorded blanks must fit inside the source.");
export const rimFoamCutRecordSchema = z.strictObject({
  id: z.uuid(),
  label: rimFoamDimensionsSchema.shape.label,
  source: z.enum(["sheet", "pool", "inline"]),
  poolOffcutId: z.uuid().optional(),
  stock: rimFoamStockSchema,
  kerf: z.number().min(0).max(1),
  remnants: z.array(rimFoamOffcutSchema.extend({ slot: z.number().int().min(0) })).max(200),
}).refine((row) => (row.source === "pool") === !!row.poolOffcutId &&
  (row.source !== "sheet" || (row.stock.width === rimFoam.width && row.stock.length === rimFoam.length)) &&
  new Set(row.remnants.map(({ slot }) => slot)).size === row.remnants.length,
  "Recorded foam cuts need a matching physical source and unique remnant marks.");
export type RimFoamCutRecord = z.infer<typeof rimFoamCutRecordSchema>;
export const rimFoamCutRecordsSchema = z.array(rimFoamCutRecordSchema).max(400).refine((records) => {
  const consumed = records.flatMap(({ poolOffcutId }) => poolOffcutId ? [poolOffcutId] : []);
  const remnants = records.flatMap(({ remnants }) => remnants);
  return new Set(records.map(({ id }) => id)).size === records.length &&
    new Set(records.map(({ label }) => rimFoamLabelKey(label))).size === records.length &&
    new Set(consumed).size === consumed.length &&
    new Set(remnants.map(({ id }) => id)).size === remnants.length &&
    new Set(remnants.map(({ label }) => rimFoamLabelKey(label))).size === remnants.length;
}, "Each physical foam source and remnant needs one cut record.");

export const rimAirSealInputSchema = z.strictObject({
  sectionId: z.uuid(),
  side: rimSideSchema,
  topInset: z.number().min(0).max(48),
  gap: z.number().positive().max(8),
  kerf: z.number().min(0).max(1),
  confirmedBacking: z.literal(true),
  bays: z.array(rimBayMeasurementSchema).min(1).max(200),
  offcut: rimFoamDimensionsSchema.optional(),
  poolOffcutIds: z.array(z.uuid()).max(200).refine((ids) => new Set(ids).size === ids.length,
    "Select each physical foam offcut once.").optional(),
  edgeSeal: z.strictObject({
    depth: z.number().positive().max(rimFoam.thickness),
    trialLengthPerCan: z.number().min(0.125),
    session: z.string().trim().min(1).max(60),
  }).optional(),
}).refine(({ edgeSeal, gap }) => !edgeSeal || gap <= rimEdgeSealant.maxGap, {
  path: ["edgeSeal"],
  message: "Great Stuff Gaps & Cracks is for gaps up to 1 in. Recheck the clearance or plan a different sealant.",
}).refine(({ bays }) => new Set(bays.map(({ left, right }) => `${left}/${right}`)).size === bays.length,
  "Each rim bay can appear once on this plan.");
export type RimAirSealInput = z.infer<typeof rimAirSealInputSchema>;

export const rimAirSealPlanSchema = z.strictObject({
  input: rimAirSealInputSchema,
  frame: z.string().min(1).max(80_000),
});
export type RimAirSealPlan = z.infer<typeof rimAirSealPlanSchema>;
export const rimAirSealPlansSchema = z.array(rimAirSealPlanSchema).max(200).refine((plans) =>
  new Set(plans.map(({ input }) => `${input.sectionId}/${input.side}`)).size === plans.length,
  "Save one rim air seal per floor base and side.");
