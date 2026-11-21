import { z } from "zod";
import { waterFittingIds, type WaterFittingId } from "./waterFittingReference";

const id = z.uuid();
const runEnd = z.strictObject({ runId: id, end: z.enum(["start", "end"]) });
const measuredReach = z.number().finite().positive().max(6);

export const waterFittingInput = z.strictObject({
  a: runEnd,
  b: runEnd,
  reach: z.tuple([measuredReach, measuredReach]),
});
export type WaterRunEnd = z.infer<typeof runEnd>;
export type WaterFittingInput = z.infer<typeof waterFittingInput>;
export const waterFittingSchema = waterFittingInput.extend({
  id,
  pieceId: id,
  materialId: z.enum(waterFittingIds as [WaterFittingId, ...WaterFittingId[]]),
}).refine(({ a, b }) => a.runId !== b.runId, "Choose two different straight runs.");
export type WaterFitting = z.infer<typeof waterFittingSchema>;
