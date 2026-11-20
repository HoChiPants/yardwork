import { z } from "zod";

const length = z.number().finite().positive().max(24);
const offset = z.number().finite().min(-24).max(24);
const center = z.tuple([offset, offset]);
const mount = z.strictObject({
  inset: length,
  width: length,
  height: length,
  clearanceDepth: length,
  reach: offset,
  rise: offset,
  standout: z.number().finite().min(0).max(24),
  centers: z.array(center).min(1).max(8),
  pilotDepth: length,
  screwDiameter: length,
  screwDepth: length,
});

export const greenhouseLatchInputSchema = z.strictObject({
  height: z.number().finite().positive().max(240),
  keeperHeightOffset: offset,
  tolerance: z.number().finite().positive().max(1),
  latch: mount,
  keeper: mount,
});
export const greenhouseLatchSchema = greenhouseLatchInputSchema.extend({
  motionId: z.uuid(),
  side: z.enum(["left", "right"]),
  latchId: z.uuid(),
  keeperId: z.uuid(),
});
export type GreenhouseLatchPlan = z.infer<typeof greenhouseLatchSchema>;
export type GreenhouseLatchInput = z.infer<typeof greenhouseLatchInputSchema>;
export type GreenhouseLatchMount = z.infer<typeof mount>;
