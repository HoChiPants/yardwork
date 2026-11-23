import { z } from "zod";
import { georgianPassage } from "./doorHardwareReference";

const grip = z.strictObject({
  width: z.number().positive().max(12),
  height: z.number().positive().max(12),
  projection: z.number().positive().max(8),
  towardHinge: z.number().min(-6).max(6),
});

export const doorHardwareSchema = z.strictObject({
  grip: z.enum(["knob", "lever"]),
  purchase: z.enum(["measured", georgianPassage.id]),
  backset: z.number().min(0.5).max(8),
  centerHeight: z.number().positive().max(115),
  front: grip,
  back: grip,
});
export type DoorHardware = z.infer<typeof doorHardwareSchema>;
