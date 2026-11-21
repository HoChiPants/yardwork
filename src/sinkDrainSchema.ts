import { z } from "zod";

const id = z.uuid();
const coordinate = z.number().finite().min(-12000).max(12000);
const point = z.tuple([coordinate, coordinate, coordinate]);
const positive = (max: number) => z.number().finite().positive().max(max);
const vent = z.strictObject({
  length: positive(480),
  fall: z.number().finite().min(-24).max(48),
  takeoff: z.number().finite().min(-24).max(24),
  uniform: z.boolean(),
});

export const sinkDrainInput = z.strictObject({
  name: z.string().trim().min(1).max(60),
  tail: point,
  wall: point,
  tailDiameter: z.union([z.literal(1.25), z.literal(1.5)]),
  tailSeat: positive(4),
  wallSeat: positive(4),
  bendReach: positive(10),
  outletDrop: z.number().finite().min(-2).max(6),
  bodyDrop: positive(12),
  bodyWidth: z.number().finite().min(1.5).max(6),
  blank: positive(12),
  kerf: z.number().finite().min(0).max(0.5),
  service: positive(20),
  vent: vent.optional(),
});

export type SinkDrainInput = z.infer<typeof sinkDrainInput>;
export const sinkDrainSchema = sinkDrainInput.extend({ id, bodyId: id, tubeId: id });
export type SinkDrain = z.infer<typeof sinkDrainSchema>;
export const sinkDrainsSchema = z.array(sinkDrainSchema).max(32).refine((plans) => {
  const parts = plans.flatMap(({ bodyId, tubeId }) => [bodyId, tubeId]);
  return new Set(parts).size === parts.length && new Set(plans.map(({ id }) => id)).size === plans.length;
}, "Keep a separate body and tube for each trap.");
