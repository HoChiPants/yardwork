import { z } from "zod";
import { waterRunEnd } from "./waterFittingSchema";

const clearance = z.number().finite().positive().max(36);
export const waterStopInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  port: waterRunEnd,
  face: z.number().finite().min(-180).max(372),
  outlet: z.enum(["up", "down", "left", "right"]),
  access: clearance,
  hose: clearance,
});
export const waterStopSchema = waterStopInput.extend({ id: z.uuid(), pieceId: z.uuid() });
export type WaterStop = z.infer<typeof waterStopSchema>;
export type WaterStopInput = z.infer<typeof waterStopInput>;
export const waterStopsSchema = z.array(waterStopSchema).max(64).refine((rows) =>
  new Set(rows.map(({ id }) => id)).size === rows.length &&
  new Set(rows.map(({ pieceId }) => pieceId)).size === rows.length &&
  new Set(rows.map(({ port }) => `${port.runId}/${port.end}`)).size === rows.length,
"Choose one valve for each pipe end.");

export const waterStopPreviewInput = waterStopInput.extend({
  exposed: z.number().finite().positive().max(60),
  trim: z.number().finite().min(0).max(60),
}).omit({ face: true });
