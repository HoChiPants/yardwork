import { z } from "zod";

export const subfloorChecksSchema = z.array(z.uuid()).max(32).refine(
  (ids) => new Set(ids).size === ids.length,
  "Keep one subfloor check per panel.",
);

export const subfloorAdhesivePlansSchema = z.array(z.strictObject({
  panelId: z.uuid(),
  contactSignature: z.string().min(1).max(32_000),
})).max(32).refine(
  (rows) => new Set(rows.map(({ panelId }) => panelId)).size === rows.length,
  "Keep one adhesive plan per subfloor sheet.",
);

export const subfloorNailPlanSchema = z.strictObject({
  panelId: z.uuid(),
  schedule: z.enum(["deformed-6d", "common-8d"]),
  signature: z.string().min(1).max(64),
});

export const subfloorNailPlansSchema = z.array(subfloorNailPlanSchema).max(32).refine(
  (rows) => new Set(rows.map(({ panelId }) => panelId)).size === rows.length,
  "Keep one fastening plan per subfloor sheet.",
);

export type SubfloorNailPlan = z.infer<typeof subfloorNailPlanSchema>;

export const subfloorJoistSpanInputSchema = z.strictObject({
  species: z.enum(["spf", "dfir", "hemfir", "syp"]),
  spacing: z.literal([12, 16, 19.2, 24]),
});
export const subfloorJoistPlansSchema = z.array(z.strictObject({
  panelId: z.uuid(),
  reference: subfloorJoistSpanInputSchema.extend({ members: z.string().min(1).max(4000) }).nullable(),
})).max(32).refine((rows) => new Set(rows.map(({ panelId }) => panelId)).size === rows.length,
  "Keep one joist bearing check per subfloor sheet.");
export type SubfloorJoistSpanInput = z.infer<typeof subfloorJoistSpanInputSchema>;
