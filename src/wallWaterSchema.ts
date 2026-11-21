import { z } from "zod";
import { pexPipes, type PexPipeId } from "./wallWaterReference";

const id = z.uuid();
export const waterRunInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  sectionId: id,
  materialId: z.enum(Object.keys(pexPipes) as [PexPipeId, ...PexPipeId[]]),
  start: z.number().min(-120).max(312),
  end: z.number().min(-120).max(312),
  height: z.number().positive().max(120),
  depth: z.number().min(-9).max(9),
  bore: z.number().min(0.125).max(6),
  reuse: z.boolean().optional(),
  isolator: z.strictObject({
    face: z.enum(["start", "end"]),
    flange: z.number().finite().positive().lt(1),
  }).optional(),
});
export type WaterRunInput = z.infer<typeof waterRunInput>;
export const waterRunSchema = waterRunInput.extend({
  id,
  pipeId: id,
  stepId: id,
  studs: z.array(id).min(1).max(100),
  shields: z.array(z.strictObject({ id, studId: id, face: z.enum(["front", "back"]) })).max(200),
  isolators: z.array(z.strictObject({ id, studId: id })).max(100).optional(),
});
export type WaterRun = z.infer<typeof waterRunSchema>;

export function waterRunDraft(run: WaterRun): WaterRunInput {
  const { id, pipeId, stepId, studs, shields, isolators, ...draft } = run;
  return draft;
}
