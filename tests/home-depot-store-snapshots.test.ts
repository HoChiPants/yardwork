import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFixtureIds,
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { bom, shoppingCsv } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { recordHomeDepotStoreSnapshots } from "../src/homeDepotStoreSnapshots";
import { blank, projectSchema } from "../src/model";
import { homeDepotStudyStock } from "../src/studyStock";
import { addSupply, supplyRows } from "../src/supplies";

test("all five studies can snapshot the exact matched Home Depot stock and purchase units", () => {
  const store = "synthetic-store";
  const checkedAt = new Date().toISOString();
  for (const id of buildFixtureIds) {
    const draft = createBuildStudy(id);
    const stock = homeDepotStudyStock(draft, {});
    const { project } = createBuildStudy(
      id,
      defaultBuildStudyParameters(id),
      blank(),
      stock,
    );
    const items = homeDepotShoppingList(project).items;
    assert.ok(
      items.some(({ source }) => source.kind === "stock"),
      id,
    );
    const next = recordHomeDepotStoreSnapshots(project, {
      store,
      zip: project.zip,
      checkedAt,
      observations: items.map(({ productId, quantity }) => ({
        productId,
        price: 10,
        available: quantity,
      })),
    });
    assert.equal(next.zip, "84121");
    assert.equal(next.store, store);
    assert.equal(next.inventory.length, items.length);
    const checked = homeDepotShoppingList(next);
    assert.equal(checked.text, homeDepotShoppingList(project).text);
    assert.ok(
      checked.items.every(({ snapshot }) => snapshot?.price === 10),
      id,
    );
    assert.deepEqual(next.pieces, project.pieces);
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(next))),
      next,
    );
  }
});

test("a combined snapshot updates stock, hardware and tools atomically and preserves other stores", () => {
  const built = createBuildStudy("sauna").project;
  const hinge = "everbilt-29256-continuous-hinge";
  const nailer = "paslode-515500";
  const project = addSupply(addSupply(built, hinge, 2), nailer, 1);
  const before = JSON.stringify(project);
  const stock = homeDepotShoppingList(project).items.find(
    ({ source }) => source.kind === "stock",
  )!;
  const input = {
    store: "4409",
    zip: "84121",
    checkedAt: new Date().toISOString(),
    observations: [
      { productId: stock.productId, price: 4, available: 100 },
      { productId: "314150989", price: 0, available: 0 },
      { productId: "303137850", price: 125, available: 1 },
    ],
  };
  assert.throws(
    () =>
      recordHomeDepotStoreSnapshots(project, {
        ...input,
        observations: [
          ...input.observations,
          { productId: "000000000", price: 8, available: 1 },
        ],
      }),
    /no longer on the current purchase list/,
  );
  assert.throws(
    () =>
      recordHomeDepotStoreSnapshots(project, {
        ...input,
        observations: [input.observations[0], input.observations[0]],
      }),
    /one observation per/,
  );
  assert.equal(JSON.stringify(project), before);
  assert.throws(
    () =>
      recordHomeDepotStoreSnapshots(
        project,
        input,
        Date.parse(input.checkedAt) - 1,
      ),
    /future/,
  );
  const saved = recordHomeDepotStoreSnapshots(project, input);
  assert.equal(bom(saved).find(({ inventory }) => inventory)?.price, 4);
  const [hardwareRow, toolRow] = supplyRows(saved);
  assert.deepEqual(
    [hardwareRow.total, hardwareRow.inventory?.available, toolRow.total],
    [0, 0, 125],
  );
  assert.match(
    shoppingCsv(saved),
    /"303137850","1","nailer","125.00","125.00"/,
  );
  const next = recordHomeDepotStoreSnapshots(saved, {
    ...input,
    store: "4408",
    zip: "84047",
  });
  assert.deepEqual(
    next.supplyInventory.map(({ store }) => store),
    ["4409", "4409", "4408", "4408"],
  );
  assert.deepEqual(
    next.inventory.map(({ store }) => store),
    ["4409", "4408"],
  );
  assert.deepEqual(next.supplies, project.supplies);
  assert.throws(
    () =>
      recordHomeDepotStoreSnapshots(next, {
        ...input,
        checkedAt: new Date(Date.parse(input.checkedAt) - 60_000).toISOString(),
      }),
    /newer check already exists/,
  );
});
