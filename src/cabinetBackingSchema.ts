import { z } from "zod";

const inches = z.number().finite().positive().max(10000);
export const cabinetBackingInputSchema = z.strictObject({
  wallId: z.uuid(),
  face: z.enum(["front", "back"]),
  height: inches,
  offsets: z.array(inches).min(1).max(16).refine((values) =>
    new Set(values).size === values.length, "Use a different offset for each mounting point."),
  stock: z.enum(["stud", "two-six"]),
});
export type CabinetBackingInput = z.infer<typeof cabinetBackingInputSchema>;

export const cabinetScrewMeasurements = z.strictObject({
  seatedLength: z.number().finite().positive().max(12),
  stack: z.number().finite().min(0).max(12),
  diameter: z.number().finite().positive().max(2),
  minimumDepth: z.number().finite().positive().max(12),
  excludedTip: z.number().finite().min(0).max(12),
}).refine(({ seatedLength, excludedTip }) => excludedTip < seatedLength,
  { path: ["excludedTip"], message: "The excluded tip must be shorter than the seated screw length." });
export type CabinetScrewMeasurements = z.infer<typeof cabinetScrewMeasurements>;

const finishInterval = z.strictObject({ id: z.uuid(), from: z.number().min(0), to: z.number().min(0) })
  .refine(({ from, to }) => to > from, "A modeled finish layer needs a nonzero path interval.");
const fastening = z.strictObject({
  measurements: cabinetScrewMeasurements,
  finishAtMarks: z.array(z.array(finishInterval).max(32)).min(1).max(16),
});
const plan = z.strictObject({
  id: z.uuid(),
  input: cabinetBackingInputSchema,
  receivers: z.array(z.uuid()).min(1).max(16),
  blocks: z.array(z.strictObject({ id: z.uuid(), first: z.uuid(), second: z.uuid() })).max(16),
  fastening: fastening.optional(),
}).refine((row) => row.receivers.length === row.input.offsets.length &&
  (!row.fastening || row.fastening.finishAtMarks.length === row.receivers.length) &&
  new Set(row.blocks.map(({ id }) => id)).size === row.blocks.length,
"Store one receiver for every mark and one entry per backing block.");
export type CabinetBackingPlan = z.infer<typeof plan>;
export const cabinetBackingSchema = z.array(plan).max(100).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.flatMap(({ blocks }) => blocks.map(({ id }) => id))).size === rows.reduce((sum, row) => sum + row.blocks.length, 0),
"Each cabinet backing plan and block needs a distinct ID.");
