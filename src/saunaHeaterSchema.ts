import { z } from "zod";
import { harviaKit, steel6 } from "./saunaHeaterReference";

const offset = z.number().finite().min(-240).max(240);
const reviewInputs = {
  supply: z.enum(["unknown", "208", "240"]),
  uninsulatedWallArea: z.number().finite().min(0).max(9999).nullable(),
  notes: z.string().trim().max(400),
};
export const saunaHeaterInputSchema = z.strictObject({
  x: offset,
  z: offset,
  ...reviewInputs,
});
export const harviaKitInputSchema = z.strictObject({
  productId: z.literal(harviaKit.productId),
  wall: z.enum(["left", "right", "back", "front"]),
  offset,
  bottom: z.number().finite().min(0).max(240),
  ...reviewInputs,
});
const savedFields = {
  roomId: z.string().uuid(),
  reference: z.string().min(1).max(70),
};
export const saunaHeaterPlanSchema = z.discriminatedUnion("productId", [
  saunaHeaterInputSchema.extend({
    productId: z.literal(steel6.productId),
    ...savedFields,
  }),
  harviaKitInputSchema.extend(savedFields),
]);
export type SaunaHeaterPlan = z.infer<typeof saunaHeaterPlanSchema>;
