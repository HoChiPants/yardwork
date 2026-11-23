import { z } from "zod";
import { flatCasing } from "./doorCasingReference";

export const scribeStocks = [flatCasing.id, "hd-pine-1x4"] as const;
const measure = z.number().finite().min(0).max(240);
const gap = z.number().finite().positive().max(24);
export const scribeFillerInputSchema = z.strictObject({
  panelId: z.uuid(),
  side: z.enum(["left", "right"]),
  front: z.enum(["front", "back"]),
  stock: z.enum(scribeStocks),
  start: measure,
  height: measure.refine((value) => value > 0),
  bottom: gap,
  middle: gap,
  top: gap,
  wallGap: measure,
  setback: measure,
});
export type ScribeFillerInput = z.infer<typeof scribeFillerInputSchema>;

const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const scribeFillersSchema = z.array(z.strictObject({
  partId: z.uuid(),
  input: scribeFillerInputSchema,
  measuredPanel: z.strictObject({ size: vec, position: vec, rotation: vec }),
})).max(1000).refine((rows) => new Set(rows.map(({ partId }) => partId)).size === rows.length,
  "Each scribe filler needs a distinct part.");

export type ScribeFillerRecord = z.infer<typeof scribeFillersSchema>[number];
