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
