import { z } from "zod";
import { retailerFromUrl, retailerSchema } from "./retailers";

export const maxSupplyQuantity = 100000;

export const supplySelectionSchema = z.strictObject({
  id: z.string().uuid(),
  productId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,100}$/),
  quantity: z.number().int().min(1).max(maxSupplyQuantity),
  purpose: z.string().max(80).default(""),
  note: z.string().max(1000).default(""),
});

/** An observation concerns a sell pack, never a claimed installation approval. */
export const supplyInventorySchema = z
  .strictObject({
    productId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,100}$/),
    retailer: retailerSchema,
    retailerProductId: z.string().regex(/^\d{6,14}$/),
    price: z.number().nonnegative().max(100000),
    available: z.number().int().nonnegative().max(1000000),
    store: z.string().trim().min(1).max(80),
    zip: z.string().regex(/^\d{5}$/),
    checkedAt: z.iso.datetime(),
    url: z.url(),
  })
  .superRefine((observation, ctx) => {
    if (retailerFromUrl(observation.url) !== observation.retailer) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Use the selected retailer's official HTTPS product URL.",
      });
      return;
    }
    const path = new URL(observation.url).pathname.replace(/\/$/, "");
    if (
      !path.startsWith(observation.retailer === "lowes" ? "/pd/" : "/p/") ||
      path.split("/").at(-1) !== observation.retailerProductId
    )
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "The product URL must identify this exact retailer product number.",
      });
  });
export type SupplySelection = z.infer<typeof supplySelectionSchema>;
export type SupplyInventory = z.infer<typeof supplyInventorySchema>;

export function supplyObservationKey(observation: SupplyInventory) {
  return JSON.stringify([
    observation.productId,
    observation.retailer === "home-depot" ? observation.retailerProductId : null,
    observation.retailer,
    observation.store,
    observation.zip,
  ]);
}
