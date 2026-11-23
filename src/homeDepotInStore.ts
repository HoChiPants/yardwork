import { homeDepotShoppingList, type HomeDepotPurchaseItem } from "./handoff";
import { homeDepotStockMatch } from "./handoffPurchases";
import {
  homeDepotPickupKey,
  homeDepotPickupRecordLimit,
  type HomeDepotPickupRecord,
} from "./homeDepotPickupSchema";
import { inventorySchema, type Project } from "./model";
import { purchaseUnitLabel } from "./purchaseUnits";
import { freshStoreCheck } from "./storeSnapshotTime";
import { supplyInventorySchema } from "./supplySchema";
import {
  storeAisleLabel,
  storeProductLocationText,
} from "./storeProductLocation";

export type PickupTarget = Omit<HomeDepotPickupRecord, "picked">;
type Snapshot = NonNullable<HomeDepotPurchaseItem["snapshot"]>;
type PickupProgress = {
  picked: number;
  pickedElsewhere: number;
  targetHere: number;
  editLimit: number;
  remaining: number;
};
type StoreRow = HomeDepotPurchaseItem & PickupProgress & {
  availability: ReturnType<typeof snapshotCoverage>;
};
type StoreGroup = { key: string; title: string; rows: StoreRow[] };
const sort = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
const aisleKey = (aisle: string) =>
  aisle.toLowerCase().replace(/^0+(?=\d)/, "");
const clean = (text: string) => text.replace(/[\r\n\t]+/g, " ").trim();

function snapshotCoverage(quantity: number, snapshot: HomeDepotPurchaseItem["snapshot"]) {
  if (!quantity) return { state: "picked" } as const;
  if (!snapshot) return { state: "unchecked" } as const;
  if (snapshot.available < quantity) return { state: "short", units: quantity - snapshot.available } as const;
  return { state: "covered" } as const;
}

function pickupProgress(project: Project, item: HomeDepotPurchaseItem): PickupProgress {
  let picked = 0;
  let pickedElsewhere = 0;
  for (const row of project.homeDepotPickup ?? []) {
    if (row.productId !== item.productId) continue;
    if (row.store === project.store && row.zip === project.zip) picked = row.picked;
    else pickedElsewhere += row.picked;
  }
  const targetHere = Math.max(0, item.quantity - pickedElsewhere);
  // Allow existing pickup records to be corrected after the cut list shrinks.
  const editLimit = Math.max(picked, targetHere);
  return { picked, pickedElsewhere, targetHere, editLimit, remaining: Math.max(0, targetHere - picked) };
}

/** Compare recent observations for the exact remaining products at each store. */
export function compareHomeDepotStores(project: Project, items: readonly HomeDepotPurchaseItem[], now = Date.now()) {
  const itemKey = (kind: string, id: string, productId: string) => JSON.stringify([kind, id, productId]);
  const quantities = new Map(items.map((item) => {
    const { remaining } = pickupProgress(project, item);
    return [itemKey(item.source.kind, item.source.id, item.productId), remaining] as const;
  }));
  const observations = new Map<string, Map<string, Snapshot>>();
  if (project.store) observations.set(project.store, new Map());
  function add(key: string, row: Snapshot & { store: string; zip: string }) {
    if (!quantities.has(key) || !row.store.trim() || row.zip !== project.zip || !freshStoreCheck(row.checkedAt, now)) return;
    const store = observations.get(row.store) ?? new Map<string, Snapshot>();
    const old = store.get(key);
    if (!old || Date.parse(row.checkedAt) > Date.parse(old.checkedAt)) store.set(key, row);
    observations.set(row.store, store);
  }
  for (const row of project.inventory) {
    if ((row.retailer ?? "home-depot") !== "home-depot" || !inventorySchema.safeParse(row).success) continue;
    const { snapshot } = homeDepotStockMatch({ id: row.material, inventory: row });
    if (snapshot) add(itemKey("stock", row.material, row.internetNumber), snapshot);
  }
  for (const row of project.supplyInventory) {
    if (row.retailer !== "home-depot" || !supplyInventorySchema.safeParse(row).success) continue;
    add(itemKey("supply", row.productId, row.retailerProductId), row);
  }
  return [...observations].map(([store, rows]) => {
    const coverage = { covered: 0, short: 0, unchecked: 0 };
    for (const [key, remaining] of quantities) {
      const { state } = snapshotCoverage(remaining, rows.get(key));
      if (state !== "picked") coverage[state]++;
    }
    return { store, ...coverage };
  }).sort((a, b) => Number(b.store === project.store) - Number(a.store === project.store) ||
    b.covered - a.covered || sort.compare(a.store, b.store));
}

export function homeDepotStoreList(
  project: Project,
  items: readonly HomeDepotPurchaseItem[],
) {
  const rows = items
    .map((item): StoreRow => {
      const progress = pickupProgress(project, item);
      return { ...item, ...progress, availability: snapshotCoverage(progress.remaining, item.snapshot) };
    })
    .sort((a, b) => {
      const first = a.snapshot?.location,
        second = b.snapshot?.location;
      if (!first || !second) {
        if (first || second) return first ? -1 : 1;
        return sort.compare(a.name, b.name);
      }
      const numberFirst =
        Number(!/^\d/.test(first.aisle)) - Number(!/^\d/.test(second.aisle));
      return (
        numberFirst ||
        sort.compare(first.aisle, second.aisle) ||
        sort.compare(first.bay ?? "", second.bay ?? "") ||
        sort.compare(a.name, b.name)
      );
    });
  const groups = new Map<string, StoreGroup>();
  for (const row of rows) {
    const aisle = row.snapshot?.location?.aisle;
    const key = aisle ? `aisle/${aisleKey(aisle)}` : "unknown";
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else
      groups.set(key, {
        key,
        title: aisle ? storeAisleLabel(aisle) : "Find in store",
        rows: [row],
      });
  }
  return {
    groups: [...groups.values()],
    pickedLines: rows.filter(({ remaining }) => remaining === 0).length,
    totalLines: rows.length,
    stockChecks: rows.filter(({ availability }) => availability.state === "short" || availability.state === "unchecked").length,
  };
}

export function recordHomeDepotPickup(
  project: Project,
  target: PickupTarget,
  picked: number,
): Project {
  if (
    project.retailer !== "home-depot" ||
    !project.store.trim() ||
    target.store !== project.store ||
    target.zip !== project.zip
  )
    throw Error("The selected store changed. Reopen its shopping checklist.");
  const item = homeDepotShoppingList(project).items.find(
    ({ productId }) => productId === target.productId,
  );
  if (!item)
    throw Error("This product changed. Reopen the shopping checklist.");
  const progress = pickupProgress(project, item);
  if (!Number.isSafeInteger(picked) || picked < 0 || picked > progress.editLimit)
    throw Error(`Enter a whole quantity from 0 to ${progress.editLimit}.`);
  const existing = project.homeDepotPickup ?? [];
  const key = homeDepotPickupKey(target);
  if (progress.picked === picked) return project;
  const next = existing.filter((row) => homeDepotPickupKey(row) !== key);
  if (picked > 0) {
    if (next.length >= homeDepotPickupRecordLimit)
      throw Error("Clear an old pickup record before adding a new one.");
    next.push({ ...target, picked });
  }
  return { ...project, homeDepotPickup: next };
}

export function homeDepotStoreChecklist(
  project: Project,
  list: ReturnType<typeof homeDepotStoreList>,
) {
  return (
    [
      `${clean(project.name)} · Home Depot store checklist`,
      `${project.store ? `Store ${clean(project.store)} · ` : ""}ZIP ${project.zip}`,
      `${list.pickedLines} of ${list.totalLines} product lines picked.`,
      "Locations come from recent store snapshots. Confirm the current aisle, bay and stock in the Home Depot app.",
      ...list.groups.flatMap(({ title, rows }) => [
        "",
        title,
        ...rows.flatMap(
          ({
            name,
            quantity,
            unit,
            productId,
            url,
            snapshot,
            picked,
            pickedElsewhere,
            remaining,
            availability,
          }) => [
            `[${remaining ? " " : "x"}] ${quantity} ${unit} · ${clean(name)} · Internet #${productId}`,
            `    ${picked + pickedElsewhere} picked · ${remaining} remaining${snapshot?.location ? ` · ${storeProductLocationText(snapshot.location)}` : ""}`,
            ...(pickedElsewhere ? [`    ${picked} picked here · ${pickedElsewhere} picked elsewhere`] : []),
            ...(snapshot
              ? [
                  `    ${snapshot.available} ${purchaseUnitLabel("unit", snapshot.available)} in snapshot · checked ${snapshot.checkedAt}`,
                ]
              : []),
            ...(availability.state === "short"
              ? [`    Short by ${availability.units} in snapshot`]
              : availability.state === "unchecked" ? ["    No recent store snapshot"] : []),
            `    ${url}`,
          ],
        ),
      ]),
    ].join("\n") + "\n"
  );
}
