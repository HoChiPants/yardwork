import test from "node:test";
import assert from "node:assert/strict";
import { blank, projectSchema } from "../src/model";
import {
  connectorProductId,
  connectorProducts,
  getConnectorProduct,
  getConnectorSchedule,
} from "../src/connectorProducts";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import {
  addSupply,
  recordSupplyInventory,
  suppliesMarkdown,
  supplyDefinitions,
  supplyProducts,
  supplyRows,
} from "../src/supplies";

const now = Date.parse("2026-11-17T14:00:00Z");

test("A21Z exposes named US flange references and retains missing manufactured geometry", () => {
  const product = getConnectorProduct(connectorProductId)!;
  assert.equal(connectorProducts.length, 1);
  assert.equal(product.evidenceRevision, "simpson-a21z-2026-11-17-v1");
  assert.deepEqual(product.namedDimensions, {
    W1: 2,
    W2: 1.5,
    L: 1.375,
    unit: "in",
  });
  assert.equal(product.gauge, 18);
  assert.equal(product.finish, "ZMAX");
  assert.equal(product.packCount, 1);
  assert.equal(product.leafThickness, null);
  assert.equal(product.holeCenters, null);
  assert.equal(product.bendRadius, null);
  assert.ok(Object.isFrozen(product));
  assert.ok(Object.isFrozen(product.namedDimensions));
  assert.match(
    product.conflicts.join(" "),
    /different convention.*exact solid/,
  );
  assert.match(product.conflicts.join(" "), /UK A21.*not verified US/);
  assert.match(
    product.unknowns.join(" "),
    /Four slots.*never a manufactured pattern/,
  );
  assert.match(product.unknowns.join(" "), /not a GRK wood-to-wood/);
  assert.ok(
    product.sources.every((source) => Date.parse(source.reviewedAt) <= now),
  );
  assert.equal(getConnectorProduct("generic-bracket"), undefined);
});

test("the two complete A21 schedules retain exact fastener identity, counts and separate drive functions", () => {
  const screw = getConnectorSchedule("sd9112")!,
    nail = getConnectorSchedule("n10dhdg")!;
  for (const schedule of [screw, nail]) {
    assert.equal(schedule.baseCount, 2);
    assert.equal(schedule.postCount, 2);
    assert.equal(schedule.totalPerConnector, 4);
    assert.equal(schedule.nominalLength, 1.5);
    assert.ok(Object.isFrozen(schedule));
    assert.ok(
      schedule.sources.some(
        (source) =>
          source.url.includes("strongtie.com") ||
          source.url.includes("ssttoolbox.widen.net"),
      ),
    );
  }
  assert.equal(screw.fastenerProductId, "simpson-sd9112r100");
  assert.equal(screw.packCount, 100);
  assert.equal(screw.drive, "quarter-hex");
  assert.ok(
    screw.sources.some((source) =>
      source.url.endsWith("sd-connector-screw-approved-connectors"),
    ),
  );
  assert.equal(nail.fastenerProductId, "simpson-n10dhdg-r");
  assert.equal(nail.packCount, 120);
  assert.equal(nail.drive, "hammer");
  assert.ok(
    nail.sources.some((source) => source.revision.includes("C-C-2026 p314")),
  );
  assert.equal(getConnectorSchedule("grk-r4-103101"), undefined);
  assert.equal(getConnectorSchedule("mixed"), undefined);
});

test("existing exact A21/SD/nail retailer references and purchase units remain distinct", () => {
  const expected = [
    [connectorProductId, 1, ["100375047", "1114951"]],
    ["simpson-sd9112r100", 100, ["202071152", "3242494"]],
    ["simpson-n10dhdg-r", 120, ["206101770", "1002681308"]],
  ] as const;
  for (const [id, count, offers] of expected) {
    const product = findRetailerProduct(id)!;
    assert.equal(product.profile.packCount, count);
    assert.deepEqual(
      referenceOffersForProduct(product).map((offer) => offer.productId),
      offers,
    );
    assert.ok(supplyProducts("home-depot").some((entry) => entry.id === id));
    assert.ok(supplyProducts("lowes").some((entry) => entry.id === id));
  }
  assert.deepEqual(supplyDefinitions["simpson-n10dhdg-r"].contents, [
    { name: "Simpson N10DHDG-R .148 × 1½ in connector nail", quantity: 120 },
  ]);
});

test("two manual nail boxes use exact per-box snapshots and create no pieces, joints or installations", () => {
  const before = {
      ...blank("SYNTHETIC connector supply observation"),
      store: "4401",
    },
    productId = "simpson-n10dhdg-r",
    product = findRetailerProduct(productId)!,
    offer = referenceOffersForProduct(product).find(
      (entry) => entry.retailer === "home-depot",
    )!,
    selected = addSupply(before, productId, 2, "SYNTHETIC reference boxes"),
    withObservation = recordSupplyInventory(selected, {
      productId,
      retailer: "home-depot",
      retailerProductId: offer.productId,
      price: 8.75,
      available: 2,
      store: "4401",
      zip: "84121",
      checkedAt: new Date(now).toISOString(),
      url: offer.url,
    }),
    restored = projectSchema.parse(JSON.parse(JSON.stringify(withObservation))),
    row = supplyRows(restored, now)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.purchaseUnit, "120-nail box");
  assert.equal(row.total, 17.5);
  assert.equal(row.inventory?.retailerProductId, "206101770");
  assert.equal(row.contents[0].quantity, 120);
  assert.deepEqual(restored.pieces, before.pieces);
  assert.deepEqual(restored.joints, before.joints);
  assert.equal(restored.supplies.length, 1);
  assert.match(suppliesMarkdown(restored), /120-nail box/);
  assert.match(
    suppliesMarkdown(restored),
    /Purchasing alone creates no installed nails/,
  );
  const lowes = { ...restored, retailer: "lowes" as const };
  assert.equal(supplyRows(lowes, now)[0].inventory, null);
  assert.equal(supplyRows(lowes, now)[0].total, null);
  assert.deepEqual(lowes.supplyInventory, restored.supplyInventory);
  assert.throws(() =>
    recordSupplyInventory(selected, {
      productId,
      retailer: "home-depot",
      retailerProductId: "202308546",
      price: 8.75,
      available: 2,
      store: "4401",
      zip: "84121",
      checkedAt: new Date(now).toISOString(),
      url: "https://www.homedepot.com/p/202308546",
    }),
  );
});
