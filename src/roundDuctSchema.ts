import { z } from "zod";
import { roundDuctStock } from "./roundDuctReference";

const coordinate = z.number().finite().min(-12000).max(12000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const engagement = z.number().finite().min(0).max(roundDuctStock.length);

export const roundDuctInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  start: point,
  end: point,
  envelopeWidth: z.number().finite().min(roundDuctStock.diameter).max(48),
  stockLength: z.number().finite().min(1).max(roundDuctStock.length),
  startEngagement: engagement,
  endEngagement: engagement,
  jointOverlap: engagement,
  cutLoss: engagement,
});

export type RoundDuctInput = z.infer<typeof roundDuctInputSchema>;

const roundDuctEndSchema = z.enum(["plain", "crimped"]);
const roundDuctEndsSchema = z.tuple([roundDuctEndSchema, roundDuctEndSchema]);
export type RoundDuctEnd = z.infer<typeof roundDuctEndSchema>;
export type RoundDuctEnds = z.infer<typeof roundDuctEndsSchema>;

const roundDuctSlot = { runId: z.uuid(), index: z.number().int().min(0).max(127) };
const signature = z.string().min(1).max(512);
export const roundDuctOffcutsSchema = z.array(z.strictObject({
  id: z.uuid(),
  label: z.string().trim().min(1).max(100),
  length: z.number().finite().positive().max(roundDuctStock.length),
  ends: roundDuctEndsSchema,
  retired: z.literal(true).optional(),
  source: z.strictObject({ ...roundDuctSlot, signature,
    cutLength: z.number().finite().positive().max(roundDuctStock.length),
    stockLength: z.number().finite().positive().max(roundDuctStock.length),
    name: z.string().min(1).max(100),
  }).optional(),
  assignment: z.strictObject({ ...roundDuctSlot, signature, ends: roundDuctEndsSchema }).optional(),
})).max(128).superRefine((records, context) => {
  const identity = new Set<string>();
  const sources = new Set<string>();
  const assignments = new Set<string>();
  records.forEach((record, index) => {
    const source = record.source && roundDuctRecoveryKey(record.source.runId, record.source.index, record.source.signature);
    const assigned = record.assignment && roundDuctSlotKey(record.assignment.runId, record.assignment.index);
    if (identity.has(record.id) || (source && sources.has(source)) || (assigned && assignments.has(assigned)))
      context.addIssue({ code: "custom", path: [index], message: "Use each duct offcut, recovered tail and receiving section once." });
    if (record.retired && record.assignment)
      context.addIssue({ code: "custom", path: [index, "assignment"], message: "Retired duct offcuts cannot be reserved." });
    if (record.source && record.source.cutLength + record.length > record.source.stockLength + 1e-7)
      context.addIssue({ code: "custom", path: [index, "length"], message: "The measured tail and completed section exceed their source pipe." });
    identity.add(record.id);
    if (source) sources.add(source);
    if (assigned) assignments.add(assigned);
  });
});
export type RoundDuctOffcut = z.infer<typeof roundDuctOffcutsSchema>[number];

export const roundDuctSlotKey = (runId: string, index: number) => `${runId}/${index}`;
export const roundDuctRecoveryKey = (runId: string, index: number, signature: string) => `${roundDuctSlotKey(runId, index)}/${signature}`;

export const roundDuctRunsSchema = z.array(z.strictObject({
  id: z.uuid(),
  input: roundDuctInputSchema,
})).max(24).refine((records) => new Set(records.map(({ id }) => id)).size === records.length,
  "Use distinct round duct run identifiers.");
