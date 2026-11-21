import { homeDepotShoppingList, type HomeDepotPurchaseItem } from "./handoff";
import {
  homeDepotPickupKey,
  homeDepotPickupRecordLimit,
  type HomeDepotPickupRecord,
} from "./homeDepotPickupSchema";
import type { Project } from "./model";
import { purchaseUnitLabel } from "./purchaseUnits";
import {
  storeAisleLabel,
  storeProductLocationText,
} from "./storeProductLocation";

export type PickupTarget = Omit<HomeDepotPickupRecord, "picked">;
type StoreRow = HomeDepotPurchaseItem & { picked: number; remaining: number };
type StoreGroup = { key: string; title: string; rows: StoreRow[] };
const sort = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
const aisleKey = (aisle: string) =>
  aisle.toLowerCase().replace(/^0+(?=\d)/, "");
const clean = (text: string) => text.replace(/[\r\n\t]+/g, " ").trim();

export function homeDepotStoreList(
  project: Project,
  items: readonly HomeDepotPurchaseItem[],
) {
  const { store, zip } = project;
  const picked = new Map(
    (project.homeDepotPickup ?? []).map((row) => [
      homeDepotPickupKey(row),
      row.picked,
    ]),
  );
  const rows = items
    .map((item): StoreRow => {
      const count = Math.min(
        item.quantity,
        picked.get(
          homeDepotPickupKey({ store, zip, productId: item.productId }),
        ) ?? 0,
      );
      return { ...item, picked: count, remaining: item.quantity - count };
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
  if (!Number.isSafeInteger(picked) || picked < 0 || picked > item.quantity)
    throw Error(`Enter a whole quantity from 0 to ${item.quantity}.`);
  const existing = project.homeDepotPickup ?? [];
  const key = homeDepotPickupKey(target);
  if (
    (existing.find((row) => homeDepotPickupKey(row) === key)?.picked ?? 0) ===
    picked
  )
    return project;
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
            remaining,
          }) => [
            `[${remaining ? " " : "x"}] ${quantity} ${unit} · ${clean(name)} · Internet #${productId}`,
            `    ${picked} picked · ${remaining} remaining${snapshot?.location ? ` · ${storeProductLocationText(snapshot.location)}` : ""}`,
            ...(snapshot
              ? [
                  `    ${snapshot.available} ${purchaseUnitLabel("unit", snapshot.available)} in snapshot · checked ${snapshot.checkedAt}`,
                ]
              : []),
            `    ${url}`,
          ],
        ),
      ]),
    ].join("\n") + "\n"
  );
}
