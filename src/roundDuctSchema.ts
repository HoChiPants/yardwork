import { z } from "zod";
import { ductLengthTolerance, fitRoundDuctOffcut } from "./roundDuctEndFit";
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
const usableLength = z.number().finite().positive().max(roundDuctStock.length);
const reservation = { ...roundDuctSlot, signature, ends: roundDuctEndsSchema };
export const roundDuctOffcutsSchema = z.array(z.strictObject({
  id: z.uuid(),
  label: z.string().trim().min(1).max(100),
  length: usableLength,
  ends: roundDuctEndsSchema,
  retired: z.literal(true).optional(),
  source: z.strictObject({ ...roundDuctSlot, signature,
    cutLength: usableLength,
    stockLength: usableLength,
    name: z.string().min(1).max(100),
  }).optional(),
  assignment: z.strictObject(reservation).optional(),
  used: z.strictObject({ ...reservation, name: z.string().min(1).max(100),
    cutLength: usableLength, cutLoss: engagement,
  }).optional(),
  trimmedFrom: z.uuid().optional(),
})).max(128).superRefine((records, context) => {
  const byId = new Map(records.map((record) => [record.id, record]));
  const identity = new Set<string>();
  const completions = new Set<string>();
  const assignments = new Set<string>();
  const trimmed = new Set<string>();
  records.forEach((record, index) => {
    const assigned = record.assignment && roundDuctSlotKey(record.assignment.runId, record.assignment.index);
    if (identity.has(record.id) || (assigned && assignments.has(assigned)))
      context.addIssue({ code: "custom", path: [index], message: "Use each duct offcut, recovered tail and receiving section once." });
    if (record.retired && record.assignment)
      context.addIssue({ code: "custom", path: [index, "assignment"], message: "Retired duct offcuts cannot be reserved." });
    if (record.source && record.source.cutLength + record.length > record.source.stockLength + ductLengthTolerance)
      context.addIssue({ code: "custom", path: [index, "length"], message: "The measured tail and completed section exceed their source pipe." });
    if (record.used && (!record.retired || !fitRoundDuctOffcut(record, record.used.cutLength, record.used.ends, record.used.cutLoss)))
      context.addIssue({ code: "custom", path: [index, "used"], message: "A completed duct cut must fit the recorded offcut and its end forms." });
    for (const completion of [record.source, record.used]) {
      if (!completion) continue;
      const key = roundDuctRecoveryKey(completion.runId, completion.index, completion.signature);
      if (completions.has(key))
        context.addIssue({ code: "custom", path: [index], message: "Record each completed duct cut once." });
      completions.add(key);
    }
    if (record.trimmedFrom) {
      const parent = byId.get(record.trimmedFrom);
      const used = parent?.used;
      const remnant = parent && used && fitRoundDuctOffcut(parent, used.cutLength, used.ends, used.cutLoss)?.remnant;
      if (!identity.has(record.trimmedFrom) || !remnant || record.length > remnant.length + ductLengthTolerance ||
          record.ends[0] !== remnant.ends[0] || record.ends[1] !== remnant.ends[1] ||
          record.source || trimmed.has(record.trimmedFrom))
        context.addIssue({ code: "custom", path: [index, "trimmedFrom"], message: "Record one measured duct remnant within its completed source trim." });
      trimmed.add(record.trimmedFrom);
    }
    identity.add(record.id);
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
