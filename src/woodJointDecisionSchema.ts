import { z } from "zod";

export const woodJointMethod = z.enum(["glue", "fitted", "sealant", "intentional-contact"]);
export type WoodJointMethod = z.infer<typeof woodJointMethod>;

export const woodJointDecisionSchema = z.strictObject({
  firstId: z.uuid(),
  secondId: z.uuid(),
  method: woodJointMethod,
  note: z.string().trim().min(1, "Record the detail you want to carry into the guide.").max(400),
  contactSignature: z.string().min(1).max(600),
}).refine(({ firstId, secondId }) => firstId < secondId, "Choose two distinct members in canonical order.");

export type WoodJointDecision = z.infer<typeof woodJointDecisionSchema>;

export const woodJointDecisionsSchema = z.array(woodJointDecisionSchema).max(1000).refine(
  (rows) => new Set(rows.map(({ firstId, secondId }) => `${firstId}/${secondId}`)).size === rows.length,
  "Keep one joint detail for each wood pair.",
);
