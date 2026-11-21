import assert from "node:assert/strict";
import test from "node:test";
import { bom } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import {
  homeDepotStoreChecklist,
  homeDepotStoreList,
  recordHomeDepotPickup,
} from "../src/homeDepotInStore";
import { recordHomeDepotStoreSnapshots } from "../src/homeDepotStoreSnapshots";
import { blank, part, projectSchema } from "../src/model";
import {
  mergeStoreSnapshots,
  readStoreSnapshotFile,
  storeSnapshotFile,
} from "../src/storeSnapshotFiles";
import { addSupply, supplyRows } from "../src/supplies";

function fixture() {
  const project = blank("In-store study");
  project.pieces.push(
    part(
      "Bench rail",
      "stud",
      [3.5, 1.5, 32],
      [0, 0.75, 0],
      project.steps[0].id,
      "Bench",
    ),
  );
  const stocked = addSupply(
    addSupply(project, "everbilt-29256-continuous-hinge", 3),
    "paslode-515500",
    1,
  );
  const stock = homeDepotShoppingList(stocked).items.find(
    (row) => row.source.kind === "stock",
  )!;
  const target = { store: "4409", zip: project.zip, productId: "314150989" };
  const now = Date.now();
  const snapshot = {
    store: target.store,
    zip: target.zip,
    checkedAt: new Date(now - 60000).toISOString(),
    observations: [
      {
        productId: stock.productId,
        price: 4,
        available: 15,
        location: { aisle: "10", bay: "3" },
      },
      {
        productId: target.productId,
        price: 17,
        available: 2,
        location: { aisle: "02", bay: "8" },
      },
    ],
  };
  return { project: stocked, stock, target, snapshot, now };
}

test("locations round-trip in a store snapshot file and expire with the observation", () => {
  const { project, stock, target, snapshot, now } = fixture();
  const saved = recordHomeDepotStoreSnapshots(project, snapshot, now);
  const file = storeSnapshotFile(saved, now)!;
  assert.equal(JSON.parse(file.text).version, 2);
  const imported = readStoreSnapshotFile(file.text);
  assert.deepEqual(imported.materials[0].location, { aisle: "10", bay: "3" });
  assert.deepEqual(imported.supplies[0].location, { aisle: "02", bay: "8" });
  const merged = mergeStoreSnapshots(
    { ...project, store: target.store },
    imported,
    now,
  ).project;
  const review = homeDepotStoreList(
    merged,
    homeDepotShoppingList(merged).items,
  );
  assert.deepEqual(
    review.groups.map(({ title }) => title),
    ["Aisle 02", "Aisle 10", "Find in store"],
  );
  assert.equal(review.groups[0].rows[0].productId, target.productId);
  assert.equal(review.groups[1].rows[0].productId, stock.productId);

  const later = now + 24 * 60 * 60 * 1000;
  const expired = homeDepotShoppingList(
    merged,
    bom(merged, later),
    supplyRows(merged, later),
  ).items;
  assert.deepEqual(
    homeDepotStoreList(merged, expired).groups.map(({ title }) => title),
    ["Find in store"],
  );
  assert.equal(merged.supplyInventory[0].location?.bay, "8");

  const legacy = recordHomeDepotStoreSnapshots(
    project,
    {
      ...snapshot,
      observations: snapshot.observations.map(
        ({ location: _location, ...row }) => row,
      ),
    },
    now,
  );
  assert.equal(JSON.parse(storeSnapshotFile(legacy, now)!.text).version, 1);
  assert.equal(
    readStoreSnapshotFile(storeSnapshotFile(legacy, now)!.text).materials[0]
      .location,
    undefined,
  );
});

test("pickup follows exact product, store and ZIP and keeps ordered pack counts independent", () => {
  const { project, target, snapshot, now } = fixture();
  const saved = recordHomeDepotStoreSnapshots(project, snapshot, now);
  const paste = homeDepotShoppingList(saved).text;
  const picked = recordHomeDepotPickup(saved, target, 2);
  assert.equal(homeDepotShoppingList(picked).text, paste);
  assert.deepEqual(picked.supplies, saved.supplies);
  assert.deepEqual(picked.onHandCutSources, saved.onHandCutSources);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(picked)));
  const review = (p: typeof reopened) =>
    homeDepotStoreList(p, homeDepotShoppingList(p).items);
  assert.deepEqual(
    review(reopened).groups[0].rows.map(({ picked, remaining }) => [
      picked,
      remaining,
    ]),
    [[2, 1]],
  );
  assert.match(
    homeDepotStoreChecklist(reopened, review(reopened)),
    /\[ \] 3 hinges.*#314150989[\s\S]*2 picked · 1 remaining · Aisle 02 · Bay 8/,
  );

  const moved = recordHomeDepotStoreSnapshots(
    picked,
    {
      ...snapshot,
      store: "4408",
      observations: [{ ...snapshot.observations[1], location: { aisle: "7" } }],
    },
    now,
  );
  const alternate = review(moved);
  assert.equal(alternate.groups[0].title, "Aisle 7");
  assert.equal(alternate.groups[0].rows[0].picked, 0);
  assert.throws(
    () => recordHomeDepotPickup(moved, target, 2),
    /selected store changed/,
  );
  assert.equal(
    review({ ...moved, store: target.store, zip: "84047" }).pickedLines,
    0,
  );
  assert.ok(
    review({ ...moved, store: target.store }).groups[0].rows.some(
      ({ picked }) => picked === 2,
    ),
  );
  assert.throws(
    () => recordHomeDepotPickup(saved, target, 3.5),
    /whole quantity/,
  );
  assert.throws(
    () =>
      recordHomeDepotPickup(saved, { ...target, productId: "999999999" }, 1),
    /product changed/,
  );
  assert.deepEqual(
    recordHomeDepotPickup(picked, target, 0).homeDepotPickup,
    [],
  );
});
