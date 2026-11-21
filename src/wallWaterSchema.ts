import { z } from "zod";
import { pexPipes, type PexPipeId } from "./wallWaterReference";

const id = z.uuid();
export const waterRunInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  sectionId: id,
  materialId: z.enum(Object.keys(pexPipes) as [PexPipeId, ...PexPipeId[]]),
  start: z.number().min(0).max(192),
  end: z.number().positive().max(192),
  height: z.number().positive().max(120),
  depth: z.number().min(-9).max(9),
  bore: z.number().min(0.125).max(6),
  reuse: z.boolean().optional(),
});
export type WaterRunInput = z.infer<typeof waterRunInput>;
export const waterRunSchema = waterRunInput.extend({
  id,
  pipeId: id,
  stepId: id,
  studs: z.array(id).min(1).max(100),
  shields: z.array(z.strictObject({ id, studId: id, face: z.enum(["front", "back"]) })).max(200),
});
export type WaterRun = z.infer<typeof waterRunSchema>;
