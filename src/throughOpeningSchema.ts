import { z } from "zod";

const offset = z.number().finite().min(-480).max(480);
const location = {
  axis: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  center: z.tuple([offset, offset]),
};
export const roundOpeningSchema = z.strictObject({
  ...location,
  diameter: z.number().finite().min(0.125).max(48),
  source: z
    .strictObject({
      roomId: z.uuid(),
      kind: z.enum(["intake", "exhaust", "drying"]),
    })
    .optional(),
});
export type RoundOpening = z.infer<typeof roundOpeningSchema>;

const span = z.number().finite().min(0.125).max(480);
export const rectangularOpeningSchema = z.strictObject({
  ...location,
  spans: z.tuple([span, span]),
});
export type RectangularOpening = z.infer<typeof rectangularOpeningSchema>;
export type ThroughOpening = RoundOpening | RectangularOpening;
