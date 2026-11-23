import { z } from "zod";
import { materialIds } from "./materialIds";

const length = z.number().finite().positive().max(240);
const coordinate = z.number().finite().min(-0.000001).max(240);
const size = z.tuple([length, length, length]);
const offset = z.tuple([coordinate, coordinate, coordinate]);
const inset = z.number().finite().min(0).max(240);
const usableMeasurementSchema = z.strictObject({
  inputOffset: offset,
  fromEnd: inset,
  fromEdge: inset,
});

export const offcutCutSchema = z.strictObject({
  sourceId: z.uuid(),
  inputId: z.uuid(),
  targetId: z.uuid(),
  retainedTrim: z.strictObject({ inputRegionSize: size }).optional(),
  looseSplit: z.literal(true).optional(),
  usableMeasurement: usableMeasurementSchema.optional(),
  inputSize: size,
  result: z.strictObject({
    size,
    sourceSize: size,
    offset,
  }),
  inputName: z.string().min(1).max(120).optional(),
  previousMaterial: z.enum(materialIds).optional(),
  releasedAt: z.iso.datetime().optional(),
  inputUnavailable: z.literal(true).optional(),
  completedAt: z.iso.datetime().optional(),
  cuts: z
    .array(z.strictObject({ kind: z.enum(["crosscut", "rip"]), size: length }))
    .max(2),
  remnants: z.array(z.strictObject({ id: z.uuid(), size })).max(2),
}).refine(({ completedAt, cuts, releasedAt }) =>
  !completedAt || (cuts.length > 0 && !releasedAt),
  "A completed cut must have recorded cuts and still be active."
).refine(({ previousMaterial, retainedTrim, looseSplit, usableMeasurement, inputId, targetId }) =>
  !previousMaterial || (!retainedTrim && !looseSplit && !usableMeasurement && inputId !== targetId),
  "Only an offcut assignment can replace the target's stock."
).refine(({ inputUnavailable, releasedAt, retainedTrim, looseSplit, usableMeasurement, inputId, targetId }) =>
  !inputUnavailable || (!!releasedAt && !retainedTrim && !looseSplit && !usableMeasurement && inputId !== targetId),
  "Only a released offcut assignment can mark its starting offcut unavailable."
).refine(({ retainedTrim, inputId, targetId, cuts, releasedAt }) =>
  !retainedTrim || (inputId === targetId && cuts.length > 0 && !releasedAt),
  "A retained trim keeps the original part and records at least one cut.").refine(
  ({ looseSplit, retainedTrim, inputId, targetId, cuts, remnants }) =>
    !looseSplit || (!retainedTrim && inputId !== targetId && cuts.length === 1 && remnants.length === 2 &&
      remnants[0].id === targetId && remnants[0].id !== remnants[1].id && remnants.every(({ id }) => id !== inputId)),
  "A split cuts a single offcut into two distinct loose blanks.",
).refine(({ usableMeasurement, looseSplit, retainedTrim, releasedAt, inputId, targetId, inputSize, cuts, remnants }) => {
  if (!usableMeasurement) return true;
  const output = remnants[0];
  const tolerance = 1e-6;
  return !looseSplit && !retainedTrim && !releasedAt && inputId !== targetId && !cuts.length &&
    remnants.length === 1 && output.id === targetId && Math.abs(output.size[0] - inputSize[0]) <= tolerance &&
    output.size[1] + usableMeasurement.fromEdge <= inputSize[1] + tolerance &&
    output.size[2] + usableMeasurement.fromEnd <= inputSize[2] + tolerance &&
    (output.size[1] < inputSize[1] - tolerance || output.size[2] < inputSize[2] - tolerance);
}, "A measurement keeps one smaller rectangular blank within its source and records no saw cut.");
export type OffcutCutRecord = z.infer<typeof offcutCutSchema>;
