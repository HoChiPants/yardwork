import { z } from "zod";
import { oateyRoofVentBoot } from "./roofVentFlashingReference";

const offset = z.number().min(-1200).max(1200);
const flangeEdge = z.number().positive().lt(oateyRoofVentBoot.base);

export const roofVentMeasurementSchema = z.strictObject({
  panelId: z.uuid(),
  across: offset,
  downhill: offset,
  outsideDiameter: z.number().positive().max(6),
  radialClearance: z.number().min(0).max(1),
  flangeLeft: flangeEdge,
  flangeUphill: flangeEdge,
});
export type RoofVentMeasurements = z.infer<typeof roofVentMeasurementSchema>;

export const roofVentFlashingInputSchema = roofVentMeasurementSchema.extend({
  label: z.string().trim().min(1).max(80).regex(/^[^\r\n]+$/),
  fieldConfirmed: z.literal(true),
});
export type RoofVentFlashingInput = z.infer<typeof roofVentFlashingInputSchema>;

export const roofVentFlashingsSchema = z.array(z.strictObject({
  id: z.uuid(),
  input: roofVentFlashingInputSchema,
  signature: z.string().min(1).max(5000),
})).max(48).refine((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, "Use distinct roof vent plan identifiers.");
