import { z } from "zod";
import { everbiltFloorStop } from "./doorFloorStopReference";

export const floorStopMeasurementsSchema = z.strictObject({
  target: z.number().min(5).max(179),
  latchInset: z.number().min(0.25).max(24),
  width: z.number().min(0.25).max(6),
  depth: z.number().min(0.25).max(6),
  height: z.number().min(0.25).max(8),
  purchase: z.enum(["measured", everbiltFloorStop.id]),
});
export type FloorStopMeasurements = z.infer<typeof floorStopMeasurementsSchema>;

export const doorFloorStopSchema = floorStopMeasurementsSchema.extend({
  wallId: z.string().min(1).max(100),
});
