import { z } from "zod";

const length = z.number().finite().positive().max(240);
const coordinate = z.number().finite().min(-0.000001).max(240);
const size = z.tuple([length, length, length]);

export const offcutCutSchema = z.strictObject({
  sourceId: z.uuid(),
  inputId: z.uuid(),
  targetId: z.uuid(),
  inputSize: size,
  result: z.strictObject({
    size,
    sourceSize: size,
    offset: z.tuple([coordinate, coordinate, coordinate]),
  }),
  inputName: z.string().min(1).max(120).optional(),
  releasedAt: z.iso.datetime().optional(),
  cuts: z
    .array(z.strictObject({ kind: z.enum(["crosscut", "rip"]), size: length }))
    .max(2),
  remnants: z.array(z.strictObject({ id: z.uuid(), size })).max(2),
});
