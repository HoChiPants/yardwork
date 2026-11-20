import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema } from "../src/model";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { getWoodFastenerProduct } from "../src/fastenerProducts";
import { fastenerPurchaseSummary } from "../src/fastenerPurchases";
import { guideMarkdown } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { sdwsFramingPacks } from "../src/sdwsFramingReference";
import {
  findRetailerProduct,
  purchaseSpecForProduct,
} from "../src/retailerCatalog";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";

test("SDWS framing plans count exact sell packs independently of depth and store observations", () => {
  for (const [index, pack] of sdwsFramingPacks.entries()) {
    const facts = getWoodFastenerProduct(pack.productId)!;
    const record = findRetailerProduct(pack.productId)!;
    assert.equal(record.manufacturerPartNumber, pack.model);
    assert.equal(facts.drive, "T25");
    assert.equal(facts.packCount, pack.packCount);
    assert.equal(record.profile.stockSize, null);
    assert.equal(facts.surfaceToTipDepth, null);
    assert.equal(facts.tipLength, null);
    assert.equal(record.offers.length, 1);
    const [offer] = record.offers;
    assert.equal(offer.productId, pack.internetNumber);
    assert.equal(offer.retailerItemNumber, pack.storeSku);
    assert.deepEqual(purchaseSpecForProduct(record), {
      kind: "counted",
      count: pack.packCount,
      sourceRefs: [pack.listing],
    });

    const base = { ...blank(), store: "SYNTHETIC" };
    const { id: step } = base.steps[0];
    const head = part(
      "Entry wood",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      step,
      "Test",
    );
    const receiver = part(
      "Receiving wood",
      "stud",
      [1.5, 96, 3.5],
      [1.5, 48, 0],
      step,
      "Test",
    );
    const project = { ...base, pieces: [head, receiver] };
    let plan = makeFastenerPlan(project, head.id, receiver.id, {
      productId: pack.productId,
    });
    for (let n = 0; n < 51; n++) {
      const next = addFastenerLocation(plan);
      next.locations[n].entranceLocal = [-0.75, (n - 25) * 1.5, 0];
      next.locations[n].driveLocal = [1, 0, 0];
      plan = next;
    }
    const saved = saveFastenerPlan(project, plan);
    const [review] = fastenerReviews(saved);
    assert.equal(review.activePointCount, 51);
    assert.ok(
      review.locations.every(
        ({ tipWorld, state }) =>
          tipWorld === null && state === "needs-measurements",
      ),
    );
    const demand = fastenerPurchaseSummary(saved).products.find(
      ({ productId }) => productId === pack.productId,
    )!;
    assert.equal(demand.plannedScrews, 51);
    const packs = Math.ceil(51 / pack.packCount);
    assert.equal(demand.requiredPacks, packs);
    const selected = addSupply(saved, pack.productId, packs);
    const observation = {
      productId: pack.productId,
      retailer: "home-depot",
      retailerProductId: pack.internetNumber,
      price: 10,
      available: 4,
      store: selected.store,
      zip: "84121",
      checkedAt: new Date().toISOString(),
      url: pack.listing,
    };
    const other = sdwsFramingPacks[1 - index];
    assert.throws(() =>
      recordSupplyInventory(selected, {
        ...observation,
        retailerProductId: other.internetNumber,
        url: other.listing,
      }),
    );
    const reopened = projectSchema.parse(
      JSON.parse(JSON.stringify(recordSupplyInventory(selected, observation))),
    );
    assert.deepEqual(reopened.pieces, saved.pieces);
    assert.deepEqual(reopened.fastenerPlans, saved.fastenerPlans);
    const [row] = supplyRows(reopened);
    assert.equal(row.quantity, packs);
    assert.equal(row.total, 10 * packs);
    assert.equal(supplyRows({ ...reopened, zip: "84070" })[0].total, null);
    assert.match(
      homeDepotShoppingList(reopened).text,
      new RegExp(`Internet #${pack.internetNumber}`),
    );
    assert.match(
      guideMarkdown(reopened),
      new RegExp(`51 provisional screws; ${pack.packCount}/pack`),
    );
  }
});
