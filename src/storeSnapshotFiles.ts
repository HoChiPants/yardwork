import { z } from "zod";
import { inventorySchema, material, type Inventory, type Project } from "./model";
import type { Retailer } from "./retailers";
import { reviewSupplyObservation } from "./supplies";
import { supplyInventorySchema, supplyObservationKey, type SupplyInventory } from "./supplySchema";

const maxRows = 100;
const bundleKind = "yardwork-store-snapshots";
const materialRows = inventorySchema.array().max(maxRows);
const bundleSchema = z.strictObject({
  kind: z.literal(bundleKind),
  version: z.literal([1, 2]),
  materials: materialRows,
  supplies: supplyInventorySchema.array().max(maxRows),
});

type Location = {
  retailer?: Retailer;
  store: string;
  zip: string;
  checkedAt: string;
};
const retailer = (row: Location) => row.retailer ?? "home-depot";
const key = (item: string | readonly (string | null)[], row: Location) =>
  JSON.stringify([item, retailer(row), row.store, row.zip]);
function materialKey(row: Inventory) {
  if (retailer(row) !== "home-depot" || !material(row.material).productReference)
    return key(row.material, row);
  const path = new URL(row.url).pathname.replace(/\/$/, "");
  const listing = path.startsWith("/p/") ? path.split("/").at(-1) ?? null : null;
  return key([row.material, row.internetNumber, listing], row);
}

/** Keep older product identities when a reviewed material gets a new listing. */
export function recordMaterialObservation(project: Project, entry: Inventory, now = Date.now()) {
  const checked = Date.parse(entry.checkedAt);
  if (checked > now) throw Error("The check time cannot be in the future.");
  const identity = materialKey(entry);
  const retained = project.inventory.filter((row) => {
    if (materialKey(row) !== identity) return true;
    const previous = Date.parse(row.checkedAt);
    if (previous <= now && previous > checked)
      throw Error(`A newer check already exists for product ${entry.internetNumber} at this store.`);
    return false;
  });
  if (retained.length >= maxRows)
    throw Error(`The project has reached its ${maxRows} material snapshot limit.`);
  return { ...project, inventory: [...retained, entry] };
}

export function readStoreSnapshotFile(text: string) {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(
      "Use a Yardwork store snapshot JSON file or a material snapshot array.",
    );
  }
  if (Array.isArray(data))
    return { materials: materialRows.parse(data), supplies: [] };
  const bundle = bundleSchema.parse(data);
  return {
    materials: bundle.materials,
    supplies: bundle.supplies.map(reviewSupplyObservation),
  };
}

function mergeRows<T extends Location>(
  existing: T[],
  incoming: readonly T[],
  identity: (row: T) => string,
  kind: string,
  now: number,
) {
  if (!incoming.length) return { rows: existing, processed: 0 };
  const latest = new Map<string, number>();
  for (const row of existing) {
    const timestamp = Date.parse(row.checkedAt);
    const id = identity(row);
    if (timestamp <= now && timestamp > (latest.get(id) ?? -Infinity))
      latest.set(id, timestamp);
  }
  const changed = new Map<string, T>();
  for (const row of incoming) {
    const timestamp = Date.parse(row.checkedAt);
    if (timestamp > now)
      throw Error(
        `A ${kind} snapshot has a future check time. Correct the file and import it again.`,
      );
    const id = identity(row);
    if (timestamp <= (latest.get(id) ?? -Infinity)) continue;
    latest.set(id, timestamp);
    changed.set(id, row);
  }
  if (!changed.size) return { rows: existing, processed: 0 };
  const rows = [
    ...existing.filter((row) => !changed.has(identity(row))),
    ...changed.values(),
  ];
  if (rows.length > maxRows)
    throw Error(
      `The import would exceed the project's ${maxRows} ${kind} snapshot limit.`,
    );
  return { rows, processed: changed.size };
}

/** The file refreshes matching observations and preserves the selected location. */
export function mergeStoreSnapshots(
  project: Project,
  file: {
    materials?: readonly Inventory[];
    supplies?: readonly SupplyInventory[];
  },
  now = Date.now(),
) {
  const materials = file.materials ?? [];
  const supplies = file.supplies ?? [];
  const stock = mergeRows(
    project.inventory,
    materials,
    materialKey,
    "material",
    now,
  );
  const hardware = mergeRows(
    project.supplyInventory,
    supplies,
    supplyObservationKey,
    "supply",
    now,
  );
  const changed = stock.processed + hardware.processed;
  return {
    project: changed
      ? { ...project, inventory: stock.rows, supplyInventory: hardware.rows }
      : project,
    changed,
    skipped: materials.length + supplies.length - changed,
  };
}

export function storeSnapshotFile(project: Project, now = Date.now()) {
  if (project.retailer !== "home-depot" || !project.store) return null;
  const atSelectedStore = (row: Location) =>
    retailer(row) === "home-depot" &&
    row.store === project.store &&
    row.zip === project.zip;
  const stock = project.inventory.filter(atSelectedStore);
  const hardware = project.supplyInventory.filter(atSelectedStore);
  const materials = stock.filter(
    (row) =>
      Date.parse(row.checkedAt) <= now &&
      inventorySchema.safeParse(row).success,
  );
  const supplies = hardware.filter((row) => {
    if (Date.parse(row.checkedAt) > now) return false;
    try {
      reviewSupplyObservation(row);
      return true;
    } catch {
      return false;
    }
  });
  const count = materials.length + supplies.length;
  const version = [...materials, ...supplies].some(({ location }) => location) ? 2 : 1;
  return count
    ? {
        count,
        excluded: stock.length + hardware.length - count,
        text: JSON.stringify(
          { kind: bundleKind, version, materials, supplies },
          null,
          2,
        ),
      }
    : null;
}
