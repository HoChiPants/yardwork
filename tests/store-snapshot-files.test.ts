import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema, type Inventory } from "../src/model";
import { usableInventory } from "../src/engine";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { recordHomeDepotStoreSnapshots } from "../src/homeDepotStoreSnapshots";
import { homeDepotShoppingList } from "../src/handoff";
import {
  mergeStoreSnapshots,
  readStoreSnapshotFile,
  recordMaterialObservation,
  storeSnapshotFile,
} from "../src/storeSnapshotFiles";
import type { SupplyInventory } from "../src/supplySchema";

const now = Date.parse("2026-11-20T17:50:00Z");
const later = "2026-11-20T17:30:00.000Z";
const earlier = "2026-11-20T16:30:00.000Z";
const stock: Inventory = {
  material: "stud",
  internetNumber: "338861827",
  name: "Test 2 × 4 stock observation",
  price: 4.25,
  available: 12,
  store: "4409",
  zip: "84121",
  checkedAt: earlier,
  url: "https://www.homedepot.com/p/338861827",
};
const tool: SupplyInventory = {
  productId: "paslode-515500",
  retailer: "home-depot",
  retailerProductId: "303137850",
  store: stock.store,
  zip: stock.zip,
  price: 125,
  available: 1,
  checkedAt: stock.checkedAt,
  url: "https://www.homedepot.com/p/303137850",
};

test("portable files transfer only the selected Home Depot store and keep the original check dates", () => {
  const source = {
    ...blank("Source workshop"),
    store: stock.store,
    inventory: [stock, { ...stock, store: "4408" }, { ...stock, zip: "84047" }],
    supplyInventory: [tool, { ...tool, store: "4408" }],
  };
  const file = storeSnapshotFile(source, now)!;
  assert.equal(file.count, 2);
  const imported = readStoreSnapshotFile(file.text);
  assert.deepEqual(imported, { materials: [stock], supplies: [tool] });
  const target = { ...blank("Target workshop"), store: "4408", zip: "84047" };
  const result = mergeStoreSnapshots(target, imported, now);
  assert.equal(result.project.store, "4408");
  assert.equal(result.project.zip, "84047");
  assert.equal(result.changed, 2);
  assert.deepEqual(result.project.inventory, [stock]);
  assert.deepEqual(result.project.supplyInventory, [tool]);
  assert.deepEqual(result.project.pieces, target.pieces);
  assert.deepEqual(result.project.supplies, target.supplies);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(result.project))),
    result.project,
  );
  const repeated = mergeStoreSnapshots(result.project, imported, now);
  assert.equal(repeated.project, result.project);
  assert.deepEqual([repeated.changed, repeated.skipped], [0, 2]);
});

test("older files and duplicate rows keep newer material and supply observations, including legacy arrays", () => {
  const other = { ...stock, store: "4408" };
  const saved = {
    ...blank(),
    inventory: [{ ...stock, price: 8, checkedAt: later }, other],
    supplyInventory: [{ ...tool, price: 115, checkedAt: later }],
  };
  const legacy = readStoreSnapshotFile(
    JSON.stringify([
      { ...stock, retailer: "home-depot", price: 5 },
      { ...stock, store: "4410", price: 4 },
      { ...stock, store: "4410", price: 7, checkedAt: later },
    ]),
  );
  const result = mergeStoreSnapshots(
    saved,
    { ...legacy, supplies: [tool] },
    now,
  );
  assert.deepEqual([result.changed, result.skipped], [1, 3]);
  assert.deepEqual(
    result.project.inventory.map(({ store, price }) => [store, price]),
    [
      ["4409", 8],
      ["4408", 4.25],
      ["4410", 7],
    ],
  );
  assert.equal(result.project.supplyInventory, saved.supplyInventory);
  assert.equal(
    mergeStoreSnapshots(
      saved,
      {
        materials: [{ ...other, checkedAt: later, price: 0, available: 0 }],
      },
      now,
    ).project.inventory.at(-1)?.price,
    0,
  );
});

test("a newer obsolete listing or wrong listing URL cannot suppress a current exact stock check", () => {
  const verified: Inventory = {
    ...stock, material: "hd-spf-2x4-12", internetNumber: "312528815",
    url: "https://www.homedepot.com/p/312528815",
  };
  const legacy = [
    { ...verified, checkedAt: later, internetNumber: "999999999", url: "https://www.homedepot.com/p/999999999" },
    { ...verified, checkedAt: later, url: "https://www.homedepot.com/p/100077951" },
  ];
  const project = { ...blank(), store: stock.store, inventory: legacy };
  project.pieces = [part("Long rail", verified.material, [3.5, 1.5, 110], [0, 5, 0], project.steps[0].id, "Rails")];
  const file = readStoreSnapshotFile(JSON.stringify([verified]));
  const result = mergeStoreSnapshots(project, file, now);
  assert.deepEqual([result.changed, result.skipped], [1, 0]);
  assert.deepEqual(result.project.inventory, [...legacy, verified]);
  assert.equal(usableInventory(result.project, verified.material, now), result.project.inventory[2]);
  assert.deepEqual(recordMaterialObservation(project, verified, now), result.project);
  assert.deepEqual(projectSchema.parse(result.project).inventory, [...legacy, verified]);
  const refreshed = {
    ...verified, checkedAt: later, url: "https://www.homedepot.com/p/dimensional-lumber/312528815/", available: 2,
  };
  const next = mergeStoreSnapshots(result.project, { materials: [refreshed] }, now).project;
  assert.deepEqual(next.inventory, [...legacy, refreshed]);
  assert.equal(usableInventory(next, verified.material, now)?.available, 2);
  assert.equal(mergeStoreSnapshots(next, file, now).project, next);
  assert.throws(() => recordMaterialObservation(next, verified, now), /newer check already exists/i);
});

test("current Home Depot hardware packs and tool kits refresh independently of older listing identities", () => {
  const hinge: SupplyInventory = {
    ...tool, productId: "everbilt-29256-continuous-hinge", retailerProductId: "314150989",
    url: "https://www.homedepot.com/p/314150989", available: 1, price: 18,
  };
  const legacy = [hinge, tool].map((entry, index) => ({
    ...entry, retailerProductId: `99999999${index}`, checkedAt: later, price: 500,
    url: `https://www.homedepot.com/p/99999999${index}`,
  }));
  const project = addSupply(
    addSupply({ ...blank(), store: stock.store, supplyInventory: legacy }, hinge.productId, 2),
    tool.productId, 1,
  );
  assert.ok(supplyRows(project, now).every(({ inventory }) => !inventory));
  const observed = [hinge, tool];
  const imported = mergeStoreSnapshots(project, { supplies: observed }, now);
  assert.equal(imported.changed, 2);
  const direct = observed.reduce((p, entry) => recordSupplyInventory(p, entry, now), project);
  const batch = recordHomeDepotStoreSnapshots(project, {
    store: stock.store, zip: stock.zip, checkedAt: earlier,
    observations: observed.map(({ retailerProductId: productId, price, available }) => ({ productId, price, available })),
  }, now);
  for (const current of [imported.project, direct, batch]) {
    assert.deepEqual(current.supplyInventory.slice(0, 2), legacy);
    assert.deepEqual(current.supplies, project.supplies);
    assert.deepEqual(current.pieces, project.pieces);
    assert.deepEqual(supplyRows(current, now).map(({ inventory, total }) =>
      [inventory?.retailerProductId, total]), [["314150989", 36], ["303137850", 125]]);
    assert.deepEqual(readStoreSnapshotFile(storeSnapshotFile(current, now)!.text).supplies.map(({ retailerProductId }) => retailerProductId),
      ["314150989", "303137850"]);
    assert.match(homeDepotShoppingList(current).text, /2 hinges[^\n]*#314150989/);
    assert.match(homeDepotShoppingList(current).text, /1 nailer[^\n]*#303137850/);
  }
  const newer = recordSupplyInventory(direct, { ...hinge, checkedAt: later, price: 24 }, now);
  assert.throws(() => recordSupplyInventory(newer, hinge, now), /newer check already exists/i);
  assert.equal(mergeStoreSnapshots(newer, { supplies: observed }, now).project, newer);
  assert.equal(newer.supplyInventory.length, 4);
  assert.deepEqual(projectSchema.parse(newer).supplyInventory, newer.supplyInventory);
});

test("invalid, future and over-capacity imports preserve the full project", () => {
  const initial = {
    ...blank(),
    inventory: [stock],
    supplyInventory: Array.from({ length: 100 }, (_, index) => ({
      ...tool,
      store: `old-${index}`,
    })),
  };
  const file = {
    kind: "yardwork-store-snapshots",
    version: 1,
    materials: [{ ...stock, checkedAt: later }],
    supplies: [
      {
        ...tool,
        retailerProductId: "999999999",
        url: "https://www.homedepot.com/p/999999999",
      },
    ],
  };
  assert.throws(
    () => readStoreSnapshotFile(JSON.stringify(file)),
    /exact supply/,
  );
  assert.throws(
    () =>
      mergeStoreSnapshots(
        initial,
        {
          materials: [{ ...stock, checkedAt: later }],
          supplies: [tool],
        },
        now,
      ),
    /100 supply snapshot limit/,
  );
  assert.throws(
    () =>
      mergeStoreSnapshots(
        initial,
        {
          materials: [{ ...stock, checkedAt: "2099-01-01T00:00:00.000Z" }],
        },
        now,
      ),
    /future check time/,
  );
  assert.deepEqual(initial.inventory, [stock]);
  assert.equal(initial.supplyInventory.length, 100);
  const excluded = storeSnapshotFile(
    {
      ...blank(),
      store: stock.store,
      inventory: [stock],
      supplyInventory: file.supplies as SupplyInventory[],
    },
    now,
  )!;
  assert.equal(excluded.excluded, 1);
  assert.deepEqual(readStoreSnapshotFile(excluded.text), {
    materials: [stock],
    supplies: [],
  });
});
