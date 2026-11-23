import { z } from "zod";
import { trimBackerRods } from "./trimBackerRodReference";

export const countertopEdges = ["-Z", "+Z", "-X", "+X"] as const;
const position = z.number().finite().min(0).max(480);
const base = z.strictObject({ start: position, end: position });
const coverage = z.number().finite().positive().max(500);
const span = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("leave-open") }),
  base.extend({
    kind: z.literal("corner"), width: z.number().finite().min(0).max(1),
    coverage: coverage.optional(),
  }),
  base.extend({
    kind: z.literal("backed"), width: z.number().finite().positive().max(1),
    cavityDepth: z.number().finite().positive().max(3),
    rodId: z.enum(trimBackerRods.map(({ id }) => id)),
    dryFit: z.boolean(),
    coverage,
  }),
]).refine(({ start, end }) => end > start, "A run needs increasing start and end marks.");
export type CountertopSealSpan = z.infer<typeof span>;

const measurements = z.strictObject({
  id: z.uuid(),
  topId: z.uuid(),
  wallId: z.uuid(),
  edge: z.enum(countertopEdges),
  session: z.string().trim().min(1).max(60),
  spans: z.array(span).min(1).max(24),
});
const differentParts = ({ topId, wallId }: { topId: string; wallId: string }) => topId !== wallId;
export const countertopSealInput = measurements.refine(differentParts, "Choose a different part for the wall finish.");
export type CountertopSealInput = z.infer<typeof countertopSealInput>;

const saved = measurements.extend({ signature: z.string().min(1).max(80) }).refine(differentParts, "Choose a different part for the wall finish.");
export const countertopSealsSchema = z.array(saved).max(50).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ topId, edge }) => `${topId}/${edge}`)).size === rows.length,
"Save one plan for each worktop edge.");
