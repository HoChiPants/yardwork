import { z } from "zod";

const locationLabel = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);

export const storeProductLocationSchema = z.strictObject({
  aisle: locationLabel,
  bay: locationLabel.optional(),
});

export type StoreProductLocation = z.infer<typeof storeProductLocationSchema>;

export function storeAisleLabel(aisle: string) {
  return /^\d+[a-z]?$/i.test(aisle) ? `Aisle ${aisle}` : aisle;
}

export function storeProductLocationText({ aisle, bay }: StoreProductLocation) {
  return [storeAisleLabel(aisle), ...(bay ? [`Bay ${bay}`] : [])].join(" · ");
}
