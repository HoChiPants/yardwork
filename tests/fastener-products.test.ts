import test from "node:test";
import assert from "node:assert/strict";
import { blank, catalog, material, projectSchema } from "../src/model";
import {
  getWoodFastenerProduct,
  woodFastenerProducts,
} from "../src/fastenerProducts";
import {
  checkProductBinding,
  findRetailerProduct,
  referenceOffersForProduct,
  retailerProductSchema,
} from "../src/retailerCatalog";
import {
  addSupply,
  parseSupplyInventory,
  recordSupplyInventory,
  supplyDefinitions,
  supplyProducts,
  supplyRows,
} from "../src/supplies";

const cases = [
  {
    id: "grk-r4-103101",
    mpn: "103101",
    drive: "T25",
    hd: "203525228",
    hdItem: "723205",
    lowes: "50303209",
    lowesItem: "580238",
  },
  {
    id: "grk-cabinet-113079",
    mpn: "113079",
    drive: "T15",
    hd: "203525221",
    hdItem: "726538",
    lowes: "50303173",
    lowesItem: "580211",
  },
] as const;
const now = Date.now();
function project(retailer: "home-depot" | "lowes" = "home-depot") {
  return {
    ...blank("Synthetic screw-pack test"),
    retailer,
    store: "test-store",
  };
}

test("trusted wood-fastener references preserve both original100-count identities alongside explicit new choices", () => {
  assert.deepEqual(
    woodFastenerProducts.map((product) => product.productId),
    [
      "grk-r4-103101",
      "grk-cabinet-113079",
      "simpson-csvz3r70",
      "simpson-dsvt3r70",
      "grk-cabinet-114069",
      "simpson-sdws16212qr50",
      "simpson-sdws16300qr150",
    ],
  );
  assert.equal(new Set(woodFastenerProducts.map((p) => p.productId)).size, 7);
  for (const row of cases) {
    const fact = getWoodFastenerProduct(row.id)!;
    const product = findRetailerProduct(row.id)!;
    assert.ok(fact, row.id);
    assert.equal(retailerProductSchema.safeParse(product).success, true);
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.manufacturerPartNumber, row.mpn);
    assert.equal(product.category, "fastener");
    assert.equal(product.profile.packCount, fact.packCount);
    assert.equal(fact.packCount, 100);
    assert.equal(fact.drive, row.drive);
    assert.equal(product.profile.drive, row.drive);
    assert.equal(fact.nominalLength, 2.5);
    const offers = referenceOffersForProduct(product);
    assert.deepEqual(
      offers.map((offer) => [
        offer.retailer,
        offer.productId,
        offer.retailerModel,
        offer.retailerItemNumber,
      ]),
      [
        ["home-depot", row.hd, row.mpn, row.hdItem],
        ["lowes", row.lowes, `${row.mpn}.0`, row.lowesItem],
      ],
    );
    assert.ok(
      fact.sources.every((source) =>
        product.sources.some((entry) => entry.url === source.url),
      ),
    );
    assert.ok(
      fact.sources.every(
        (source) =>
          source.revision &&
          source.scope &&
          source.note &&
          Date.parse(source.reviewedAt) <= now,
      ),
    );
    assert.match(fact.evidenceRevision, /2026-11-17-v1$/);
    assert.deepEqual(product.roleQualifications, []);
    assert.equal("available" in fact, false);
    assert.equal("price" in fact, false);
  }
});

test("nominal labels never supply actual depth, pilots, solid envelopes or load approval", () => {
  for (const row of cases) {
    const fact = getWoodFastenerProduct(row.id)!;
    const product = findRetailerProduct(row.id)!;
    assert.equal(fact.surfaceToTipDepth, null);
    assert.equal(fact.tipLength, null);
    assert.equal("pilotDiameter" in fact, false);
    assert.equal("pilotDepth" in fact, false);
    assert.equal("capacity" in fact, false);
    assert.equal("approved" in fact, false);
    assert.equal(product.profile.stockSize, null);
    assert.equal(product.profile.dimensionMeaning, "unverified");
    assert.equal(product.profile.headDiameter, null);
    assert.equal(product.profile.shankDiameter, null);
    assert.equal(
      catalog.some((stock) => stock.productReference === product.id),
      false,
      "Purchase reference does not create a MaterialId or mesh",
    );
    assert.equal(
      checkProductBinding(material("screw"), product).compatible,
      false,
    );
    assert.ok(fact.conflicts.length > 0);
    assert.ok(fact.unknowns.some((note) => /pilot/i.test(note)));
    assert.ok(fact.unknowns.some((note) => /plywood.edge/i.test(note)));
    assert.ok(fact.unknowns.some((note) => /capacity|approval/i.test(note)));
  }
});

test("R4 and cabinet references keep length datums and conflicting source dimensions visible", () => {
  const r4 = getWoodFastenerProduct("grk-r4-103101")!;
  const cabinet = getWoodFastenerProduct("grk-cabinet-113079")!;
  assert.deepEqual(
    r4.datums.map((datum) => datum.id),
    ["head-top", "head-bearing"],
  );
  assert.match(r4.conflicts.join(" "), /2\.50.*1\.57.*2⅜.*1⅝/);
  assert.ok(
    r4.sources.some(
      (s) =>
        s.url.startsWith("https://icc-es.org/") && /July 2026/.test(s.revision),
    ),
  );
  assert.deepEqual(
    cabinet.datums.map((datum) => datum.id),
    ["head-bearing"],
  );
  assert.match(cabinet.datums[0].note, /excludes the head height/);
  assert.match(cabinet.conflicts.join(" "), /\.423\/\.114.*\.393\/\.110/);
  assert.ok(
    cabinet.sources.some((s) => /malformed numeric drive column/.test(s.note)),
  );
  assert.ok(cabinet.sources.some((s) => /T15/.test(s.note)));
  assert.ok(cabinet.sources.some((s) => /11\/25/.test(s.revision)));
});

test("caller identities cannot substitute variants or mutate trusted product evidence", () => {
  for (const id of [
    "grk-cabinet-120660",
    "113079",
    "113079.0",
    "unknown",
    "__proto__",
  ])
    assert.equal(getWoodFastenerProduct(id), undefined);
  const cabinet = getWoodFastenerProduct("grk-cabinet-113079")!;
  assert.ok(Object.isFrozen(woodFastenerProducts));
  assert.ok(Object.isFrozen(cabinet));
  assert.ok(Object.isFrozen(cabinet.sources));
  assert.ok(Object.isFrozen(cabinet.sources[0]));
  assert.ok(Object.isFrozen(cabinet.datums[0]));
  assert.throws(() => {
    (cabinet as unknown as { nominalLength: number }).nominalLength = 3;
  }, TypeError);
  assert.equal(getWoodFastenerProduct(cabinet.productId)!.nominalLength, 2.5);
});

test("screw-pack selections create purchase quantities only and preserve stable R4 contents", () => {
  for (const retailer of ["home-depot", "lowes"] as const) {
    let p = project(retailer);
    for (const row of cases) {
      assert.ok(
        supplyProducts(retailer).some((product) => product.id === row.id),
      );
      p = addSupply(
        p,
        row.id,
        2,
        "Explicit test purchase",
        "No installed geometry",
      );
    }
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    assert.equal(reopened.pieces.length, 0);
    assert.equal(reopened.joints.length, 0);
    assert.equal(reopened.supplies.length, 2);
    for (const row of supplyRows(reopened, now)) {
      assert.equal(row.quantity, 2);
      assert.equal(row.contents.length, 1);
      assert.equal(
        row.contents[0].quantity,
        100,
        "Pack content is100 screws, not100 purchase units",
      );
      assert.equal(row.purchaseUnit, "100-screw box");
      assert.equal(row.total, null);
      assert.ok(row.requirements.some((note) => /nominal/i.test(note)));
    }
  }
  assert.match(
    supplyDefinitions["grk-r4-103101"].contents[0].name,
    /#9.*2½.*T25/,
  );
  assert.match(
    supplyDefinitions["grk-cabinet-113079"].contents[0].name,
    /#8.*2½.*T15/,
  );
  assert.throws(
    () => addSupply(project("lowes"), "grk-cabinet-120660", 1),
    /reviewed supply/,
  );
});

test("cabinet snapshots match the exact retailer100-pack and reject the white80-count variant", () => {
  for (const retailer of ["home-depot", "lowes"] as const) {
    const product = findRetailerProduct("grk-cabinet-113079")!;
    const offer = referenceOffersForProduct(product).find(
      (o) => o.retailer === retailer,
    )!;
    const p = addSupply(project(retailer), product.id, 2);
    const observation = {
      productId: product.id,
      retailer,
      retailerProductId: offer.productId,
      price: 11.75,
      available: 3,
      store: p.store,
      zip: p.zip,
      checkedAt: new Date(now).toISOString(),
      url: offer.url,
    };
    const observed = recordSupplyInventory(p, observation);
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(observed)));
    const row = supplyRows(reopened, now)[0];
    assert.equal(row.quantity, 2);
    assert.equal(row.total, 23.5);
    assert.equal(row.inventory?.retailerProductId, offer.productId);
    assert.equal(row.inventory?.available, 3);
    assert.equal(
      parseSupplyInventory(JSON.stringify([observation]))[0].productId,
      product.id,
    );
    for (const bad of [
      {
        ...observation,
        retailer: "lowes",
        retailerProductId: "1000075987",
        url: "https://www.lowes.com/pd/GRK-White/1000075987",
      },
      { ...observation, productId: "grk-r4-103101" },
      { ...observation, packCount: 80 },
      { ...observation, verified: true },
    ])
      assert.throws(() => recordSupplyInventory(p, bad));
    assert.equal(
      supplyRows({ ...reopened, store: "other" }, now)[0].total,
      null,
    );
    assert.equal(supplyRows(reopened, now + 86400001)[0].total, null);
    assert.equal(supplyRows(reopened, now - 1)[0].total, null);
  }
});
