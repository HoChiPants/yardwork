import { z } from "zod";
import { trimBackerRods } from "./trimBackerRodReference";
import { trimSealant } from "./trimSealantReference";

const trimSeamEdgeId = z.string().min(1).max(160);
const trimSeamOpenSpan = z.strictObject({
  edgeId: trimSeamEdgeId,
  start: z.number().nonnegative(),
  end: z.number().positive(),
}).refine(({ start, end }) => start < end, "The keep-open end must be after its start.");
export const trimSeamOpenSpanLimit = 64;

export const trimSeamInputSchema = z.strictObject({
  edgeIds: z.array(trimSeamEdgeId).min(1).max(64).refine(
    (ids) => new Set(ids).size === ids.length,
    "Choose each seam edge once.",
  ),
  gapWidth: z.number().positive().max(trimSealant.screenWidth),
  gapDepth: z.number().positive().max(trimSealant.screenDepth),
  fieldCoverageFeet: z.number().positive().optional(),
  openSpans: z.array(trimSeamOpenSpan).min(1).max(trimSeamOpenSpanLimit).optional(),
  backerRodId: z.enum(trimBackerRods.map(({ id }) => id)).optional(),
});
export type TrimSeamInput = z.infer<typeof trimSeamInputSchema>;
export type TrimSeamOpenSpan = z.infer<typeof trimSeamOpenSpan>;
const trimSeamSchema = trimSeamInputSchema.extend({
  contactSignature: z.string().min(1).max(600),
});

export const woodJointMethod = z.enum(["glue", "fitted", "sealant", "intentional-contact"]);
export type WoodJointMethod = z.infer<typeof woodJointMethod>;

export const woodJointDecisionSchema = z.strictObject({
  firstId: z.uuid(),
  secondId: z.uuid(),
  method: woodJointMethod,
  note: z.string().trim().min(1, "Record the detail you want to carry into the guide.").max(400),
  contactSignature: z.string().min(1).max(600),
  trimSeam: trimSeamSchema.optional(),
}).refine(({ firstId, secondId }) => firstId < secondId, "Choose two distinct members in canonical order.").refine(({ trimSeam, method }) => !trimSeam || method === "sealant",
  "Only a sealant joint can carry a trim seam plan.");

export type WoodJointDecision = z.infer<typeof woodJointDecisionSchema>;

export const woodJointDecisionsSchema = z.array(woodJointDecisionSchema).max(1000).refine(
  (rows) => new Set(rows.map(({ firstId, secondId }) => `${firstId}/${secondId}`)).size === rows.length,
  "Keep one joint detail for each wood pair.",
);
