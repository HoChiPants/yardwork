import { z } from "zod";
import { homeDepotShoppingList } from "./handoff";
import { inventorySchema, type Project } from "./model";
import { recordMaterialObservation } from "./storeSnapshotFiles";
import { recordSupplyInventory } from "./supplies";

const observationSchema = z.strictObject({
  productId: z.string(),
  price: z
    .number()
    .finite()
    .nonnegative()
    .max(100000, "Enter a price of at most $100,000."),
  available: z
    .number()
    .int("Enter whole purchase units.")
    .nonnegative()
    .max(1000000),
});
const snapshotBatchSchema = z.strictObject({
  store: z.string().trim().min(1, "Enter the Home Depot store.").max(80),
  zip: z.string().regex(/^\d{5}$/, "Enter a five-digit ZIP code."),
  checkedAt: z.iso.datetime(),
  observations: observationSchema
    .array()
    .min(1, "Enter at least one price and quantity.")
    .max(200),
});
export type HomeDepotSnapshotBatch = z.infer<typeof snapshotBatchSchema>;

/** Apply a single set of observations to the products on the current handoff. */
export function recordHomeDepotStoreSnapshots(
  project: Project,
  input: unknown,
  now = Date.now(),
): Project {
  const { store, zip, checkedAt, observations } =
    snapshotBatchSchema.parse(input);
  if (Date.parse(checkedAt) > now)
    throw Error("The check time cannot be in the future.");
  if (
    new Set(observations.map(({ productId }) => productId)).size !==
    observations.length
  )
    throw Error("Enter one observation per Home Depot product.");

  const items = new Map(
    homeDepotShoppingList(project).items.map((item) => [item.productId, item]),
  );
  let next = { ...project, store, zip };
  for (const { productId, price, available } of observations) {
    const item = items.get(productId);
    if (!item)
      throw Error(
        `Home Depot product ${productId} is no longer on the current purchase list. Reopen the store check.`,
      );
    const common = {
      retailer: "home-depot",
      store,
      zip,
      checkedAt,
      price,
      available,
      url: item.url,
    };
    const { source } = item;
    if (source.kind === "supply") {
      next = recordSupplyInventory(next, {
        ...common,
        productId: source.id,
        retailerProductId: productId,
      }, now);
    } else {
      const observation = inventorySchema.parse({
        ...common,
        material: source.id,
        internetNumber: productId,
        name: item.description,
      });
      next = recordMaterialObservation(next, observation, now);
    }
  }
  return next;
}
