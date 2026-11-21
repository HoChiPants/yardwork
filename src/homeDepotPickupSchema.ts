import { z } from "zod";

export const homeDepotPickupRecordLimit = 1000;

export const homeDepotPickupRecordSchema = z.strictObject({
  store: z.string().min(1).max(80),
  zip: z.string().regex(/^\d{5}$/),
  productId: z.string().regex(/^\d{6,12}$/),
  picked: z.number().int().positive(),
});

export type HomeDepotPickupRecord = z.infer<typeof homeDepotPickupRecordSchema>;

export function homeDepotPickupKey({
  store,
  zip,
  productId,
}: Omit<HomeDepotPickupRecord, "picked">) {
  return JSON.stringify([store, zip, productId]);
}

export const homeDepotPickupSchema = homeDepotPickupRecordSchema
  .array()
  .max(homeDepotPickupRecordLimit)
  .refine(
    (rows) => new Set(rows.map(homeDepotPickupKey)).size === rows.length,
    "Keep one pickup record per store and product.",
  );
