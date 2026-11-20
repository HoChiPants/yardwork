import { z } from "zod";
import { everbiltClosetRod, everbiltRodBracket } from "./closetRodReference";

const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const face = z.strictObject({
  pieceId: z.string().uuid(),
  pointLocal: vector,
  normalLocal: vector,
  geometryFingerprint: z.string().min(1).max(100),
});
const setback = z.number().finite().min(0).max(12);
export const rodMeasurementTolerance = 1 / 32;
const reach = z.number().finite().positive().max(120);
export const rodSupportIntentSchema = z.strictObject({
  fromStart: z.number().finite().positive().max(240),
  wallToRod: reach.nullable(),
  bracketReach: reach.nullable(),
  backing: z.string().trim().min(1).max(300),
  bracketProductId: z.literal(everbiltRodBracket.productId).optional(),
});
export const rodFitMeasurementsSchema = z.strictObject({
  measuredSpan: z.number().positive().max(240),
  startSetback: setback,
  endSetback: setback,
  clearance: setback,
  closedEnd: z.enum(["start", "end"]),
  basis: z.string().trim().min(1).max(500),
  measuredAt: z.iso.datetime(),
});
const plateOffset = z.number().finite().min(0).max(24);
const socketPlateExtents = z
  .tuple([plateOffset, plateOffset, plateOffset, plateOffset])
  .refine(
    ([a, b, c, d]) => a + b > 0 && c + d > 0,
    "The recorded backplate needs width and height.",
  );
export const socketPlateInputSchema = z.strictObject({
  extents: socketPlateExtents,
  basis: z.string().trim().min(1).max(300),
});
const holeOffset = z.number().finite().min(-24).max(24);
const holeDiameter = z.number().finite().min(0.001).max(2);
const pathDepth = z.number().finite().min(0.001).max(12);
export const socketHoleLayoutInputSchema = z.strictObject({
  centers: z
    .array(z.tuple([holeOffset, holeOffset]))
    .min(1)
    .max(8),
  pilotDiameter: holeDiameter,
  pilotDepth: pathDepth,
  screwDiameter: holeDiameter,
  screwDepth: pathDepth,
  basis: z.string().trim().min(1).max(300),
});
export const rodBracketMountInputSchema = socketHoleLayoutInputSchema.extend({
  pieceId: z.uuid(),
  width: z.number().finite().positive().max(24),
  height: z.number().finite().positive().max(24),
  alongOffset: holeOffset,
  heightOffset: holeOffset,
});
const rodBracketMountSchema = rodBracketMountInputSchema.extend({
  face,
  supportKey: z.string().min(1).max(100),
});
export const rodSupportSchema = rodSupportIntentSchema.extend({
  id: z.string().uuid(),
  centerWorld: vector,
  axisWorld: vector,
  fitKey: z.string().min(1).max(100),
  mounting: rodBracketMountSchema.optional(),
});
const socketHoleLayoutSchema = socketHoleLayoutInputSchema.extend({
  face,
  socket: z.enum(["open", "closed"]),
});
const socketPlateSchema = socketPlateInputSchema.extend({
  face,
  socket: z.enum(["open", "closed"]),
  holeLayout: socketHoleLayoutSchema.optional(),
});
export const rodFitSchema = z.strictObject({
  rodId: z.string().uuid(),
  rodMaterial: z.literal(everbiltClosetRod.materialId).optional(),
  modeledSpan: z.number().positive().max(240),
  start: face,
  end: face,
  measurements: rodFitMeasurementsSchema,
  socketPlates: z
    .strictObject({
      start: socketPlateSchema.optional(),
      end: socketPlateSchema.optional(),
    })
    .optional(),
  intermediateSupports: z
    .array(rodSupportSchema)
    .max(12)
    .refine(
      (supports) =>
        new Set(supports.map((support) => support.id)).size === supports.length,
      "Retain unique intermediate support records.",
    )
    .refine((supports) => {
      const offsets = supports
        .map((support) => support.fromStart)
        .sort((a, b) => a - b);
      return offsets
        .slice(1)
        .every(
          (offset, index) => offset - offsets[index] > rodMeasurementTolerance,
        );
    }, "Record distinct intermediate support positions.")
    .optional(),
});
export type RodFitPlan = z.infer<typeof rodFitSchema>;
export type RodFitMeasurements = z.infer<typeof rodFitMeasurementsSchema>;
export type RodSupport = z.infer<typeof rodSupportSchema>;

export type RodSocketPlate = z.infer<typeof socketPlateSchema>;
export type RodSocketHoleLayout = z.infer<typeof socketHoleLayoutSchema>;
export type RodMountHoleInput = z.infer<typeof socketHoleLayoutInputSchema>;
export type RodBracketMount = z.infer<typeof rodBracketMountSchema>;
