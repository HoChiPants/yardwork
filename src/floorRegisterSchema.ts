import { z } from "zod";

const span = z.number().finite().min(0.125).max(48);
const edge = z.number().finite().min(0).max(240);
const offset = z.number().finite().min(-24).max(24);
const recoveredSpan = z.number().finite().positive().max(48);

export const floorRegisterMeasurementsSchema = z.strictObject({
  panelId: z.uuid(),
  fromLeft: edge,
  fromFront: edge,
  openingLength: span,
  openingWidth: span,
  throatLength: span,
  throatWidth: span,
  bodyLength: span,
  bodyWidth: span,
  depth: span,
  bodyOffsetX: offset,
  bodyOffsetZ: offset,
});

export type FloorRegisterMeasurements = z.infer<typeof floorRegisterMeasurementsSchema>;

export const floorRegisterPlansSchema = z.array(z.strictObject({
  id: z.uuid(),
  input: floorRegisterMeasurementsSchema,
  recoveredCutout: z.strictObject({
    sourceId: z.uuid(),
    dimensions: z.tuple([recoveredSpan, recoveredSpan, z.number().finite().positive()]),
  }).optional(),
})).max(24).refine((plans) =>
  new Set(plans.map(({ id }) => id)).size === plans.length, "Use distinct floor register plan identifiers.")
  .refine((plans) => {
    const sources = plans.flatMap(({ recoveredCutout }) => recoveredCutout ? [recoveredCutout.sourceId] : []);
    return new Set(sources).size === sources.length;
  }, "Each floor register cutout must come from a distinct source.");
