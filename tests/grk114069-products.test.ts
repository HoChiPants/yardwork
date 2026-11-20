import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { blank, catalog, material, projectSchema } from "../src/model";
import {
  getWoodFastenerProduct,
  woodFastenerProducts,
} from "../src/fastenerProducts";
import {
  checkProductBinding,
  findRetailerProduct,
  purchaseSpecForProduct,
  referenceOffersForProduct,
  retailerCatalog,
  retailerProductSchema,
} from "../src/retailerCatalog";
import {
  addSupply,
  formatSupplyContent,
  recordSupplyInventory,
  supplyDefinitions,
  supplyProducts,
  supplyRows,
} from "../src/supplies";

const id = "grk-cabinet-114069";
const checkedAt = "2026-11-19T03:45:28.802Z";
const now = Date.parse(checkedAt) + 60_000;
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const manufacturer =
  "https://www.grkfasteners.com/grk-products/finish/low-profile-cabinet-screw";
const drawing =
  "https://www.grkfasteners.com/getmedia/fb0fbb28-29c0-477c-8349-2c2364caa94d/GRK-Cabinet-Customer-Drawing_1.pdf?ext=.pdf";
const sellsSheet =
  "https://www.grkfasteners.com/getmedia/d4fe6346-bb1a-4160-9fbc-09cbfa6a65ea/GRK-Sellsheet2025-Cabinet.pdf?ext=.pdf";

function project(retailer: "home-depot" | "lowes" = "home-depot") {
  return {
    ...blank("SYNTHETIC short-screw supply test"),
    retailer,
    store: "SYNTHETIC-store",
    zip: "84121",
  };
}
function observation(
  retailer: "home-depot" | "lowes",
  productId = id,
  price = 7.25,
) {
  const product = findRetailerProduct(productId)!;
  const offer = referenceOffersForProduct(product).find(
    (row) => row.retailer === retailer,
  )!;
  return {
    productId,
    retailer,
    retailerProductId: offer.productId,
    price,
    available: 2,
    store: "SYNTHETIC-store",
    zip: "84121",
    checkedAt,
    url: offer.url,
  };
}

test("all prior product, registry and supply objects remain an exact ordered prefix", () => {
  // Captured from the actual modules before this admission; work baseline retains full objects/files.
  assert.equal(
    sha(woodFastenerProducts.slice(0, 4)),
    "2c068c1c28b33845da9a46f279724d112bc0c4e55d3c0d59e9b80ce4adc1ae9e",
  );
  assert.equal(
    sha(retailerCatalog.slice(0, 50)),
    "1afefcb83cbc423f4c9705515cf01fd43598a84c72f3d3ec528728685f877675",
  );
  assert.equal(
    sha(Object.fromEntries(Object.entries(supplyDefinitions).slice(0, 17))),
    "1b665ca2361fffd8d1223ab93930c3409379f0fc8c72e36571d692169f7fe093",
  );
  assert.deepEqual(
    woodFastenerProducts.slice(4, 5).map((row) => row.productId),
    [id],
  );
  assert.deepEqual(
    retailerCatalog.slice(50, 51).map((row) => row.id),
    [id],
  );
  assert.deepEqual(Object.keys(supplyDefinitions).slice(17, 18), [id]);
});

test("114069 is an exact T15 100-count reference with unknown installed geometry and no material variant", () => {
  const fact = getWoodFastenerProduct(id)!,
    product = findRetailerProduct(id)!;
  assert.ok(fact);
  assert.ok(product);
  assert.equal(retailerProductSchema.safeParse(product).success, true);
  assert.equal(product.manufacturerPartNumber, "114069");
  assert.equal(product.category, "fastener");
  assert.equal(product.status, "reviewed-specs");
  assert.equal(product.profile.stockKind, "fastener");
  assert.equal(product.profile.stockSize, null);
  assert.equal(product.profile.dimensionMeaning, "unverified");
  assert.equal(product.profile.headDiameter, null);
  assert.equal(product.profile.shankDiameter, null);
  assert.equal(product.profile.fastenerLength, 1.25);
  assert.equal(product.profile.packCount, 100);
  assert.equal(product.profile.drive, "T15");
  assert.equal(fact.nominalLength, 1.25);
  assert.equal(fact.packCount, 100);
  assert.equal(fact.drive, "T15");
  assert.equal(fact.surfaceToTipDepth, null);
  assert.equal(fact.tipLength, null);
  assert.equal("pilotDiameter" in fact, false);
  assert.equal("pilotDepth" in fact, false);
  assert.equal("capacity" in fact, false);
  assert.deepEqual(product.roleQualifications, []);
  assert.deepEqual(product.capabilities, []);
  assert.equal(
    catalog.some((stock) => stock.productReference === id),
    false,
  );
  assert.equal(
    checkProductBinding(material("screw"), product).compatible,
    false,
  );
  const spec = purchaseSpecForProduct(product)!;
  assert.equal(spec.kind, "counted");
  if (spec.kind === "counted") assert.equal(spec.count, 100);
  assert.ok(spec.sourceRefs.includes(manufacturer));
});

test("both exact retailer identities are matched without normalizing other packs or coating claims", () => {
  const product = findRetailerProduct(id)!;
  assert.ok(product);
  assert.deepEqual(
    referenceOffersForProduct(product).map((offer) => [
      offer.retailer,
      offer.productId,
      offer.retailerModel,
      offer.retailerItemNumber,
      offer.listingStatus,
    ]),
    [
      ["home-depot", "203556408", "114069", "205890", "reference"],
      ["lowes", "50303177", "114069.0", "580213", "reference"],
    ],
  );
  for (const alias of [
    "114069",
    "114069.0",
    "grk-cabinet-120680",
    "grk-cabinet-100069",
    "unknown",
  ])
    assert.equal(getWoodFastenerProduct(alias), undefined);
  assert.ok(supplyProducts("home-depot").some((row) => row.id === id));
  assert.ok(supplyProducts("lowes").some((row) => row.id === id));
  assert.match(product.discrepancies.join(" "), /finish|exposure/i);
  assert.ok(
    product.sources.some((source) => source.url.includes("114069/203556408")),
    "The successful full Home Depot identity path is retained as evidence",
  );
});

test("under-washer length reference and conflicting drawings stay visible rather than becoming defaults", () => {
  const fact = getWoodFastenerProduct(id)!,
    product = findRetailerProduct(id)!;
  assert.ok(fact);
  assert.deepEqual(
    fact.datums.map((datum) => datum.id),
    ["head-bearing"],
  );
  assert.match(fact.datums[0].note, /excludes the head height/);
  assert.ok(
    fact.sources.some(
      (source) => source.url === drawing && /1\.25.*1\.00/.test(source.note),
    ),
  );
  assert.ok(
    fact.sources.some(
      (source) => source.url === sellsSheet && /11\/25/.test(source.revision),
    ),
  );
  assert.match(fact.conflicts.join(" "), /\.423\/\.114.*\.393\/\.110/);
  assert.match(fact.unknowns.join(" "), /pilot/i);
  assert.match(fact.unknowns.join(" "), /seating|surface-to-tip/i);
  assert.match(fact.unknowns.join(" "), /plywood.edge/i);
  assert.match(fact.unknowns.join(" "), /\.547.*\.75/);
  assert.match(fact.unknowns.join(" "), /capacity|approval/i);
  assert.equal(fact.evidenceRevision, "grk-cabinet-114069-2026-11-19-v1");
  for (const source of fact.sources) {
    assert.ok(product.sources.some((row) => row.url === source.url));
    assert.ok(source.revision && source.scope && source.note);
    assert.ok(Date.parse(source.reviewedAt) <= now);
    assert.equal(source.reviewedAt, checkedAt);
  }
  assert.ok(Object.isFrozen(fact));
  assert.ok(Object.isFrozen(fact.sources));
  assert.ok(Object.isFrozen(fact.datums[0]));
  assert.throws(() => {
    (fact as unknown as { nominalLength: number }).nominalLength = 2.5;
  }, TypeError);
});

test("two explicit boxes preserve old selections and buy 200 screws without geometry or owned tools", () => {
  for (const retailer of ["home-depot", "lowes"] as const) {
    const old = recordSupplyInventory(
      addSupply(
        project(retailer),
        "grk-cabinet-113079",
        1,
        "SYNTHETIC existing longer pack",
        "Keep old pack exactly",
      ),
      observation(retailer, "grk-cabinet-113079", 4),
    );
    const before = JSON.stringify(old);
    const selected = addSupply(
      old,
      id,
      2,
      "SYNTHETIC explicit shell fasteners",
      "No installation or real-stock claim",
    );
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(selected)));
    const row = supplyRows(reopened, now).find(
      (item) => item.productId === id,
    )!;
    assert.equal(JSON.stringify(old), before);
    assert.deepEqual(reopened.supplies[0], old.supplies[0]);
    assert.deepEqual(reopened.supplyInventory, old.supplyInventory);
    assert.equal(row.quantity, 2);
    assert.equal(row.purchaseUnit, "100-screw box");
    assert.equal(row.contents.length, 1);
    assert.equal(row.contents[0].quantity, 100);
    assert.equal(row.contents[0].quantity * row.quantity, 200);
    assert.match(formatSupplyContent(row.contents[0]), /^100 × GRK.*1¼.*T15/);
    assert.equal(row.total, null);
    for (const field of [
      "pieces",
      "joints",
      "fastenerPlans",
      "connectorPlans",
      "lidHingePlans",
      "hingeStockSources",
      "toolSelections",
    ] as const)
      assert.deepEqual(reopened[field], old[field]);
    assert.equal(reopened.zip, "84121");
  }
});

test("only the exact current-store pack snapshot prices boxes; zero stays zero and old observations remain raw", () => {
  const selected = addSupply(project(), id, 2);
  const priced = recordSupplyInventory(selected, observation("home-depot"));
  assert.equal(supplyRows(priced, now)[0].total, 14.5);
  const zero = recordSupplyInventory(
    selected,
    observation("home-depot", id, 0),
  );
  assert.equal(supplyRows(zero, now)[0].total, 0);
  assert.ok(supplyRows(zero, now)[0].inventory);
  for (const changed of [
    { ...priced, store: "another-store" },
    { ...priced, zip: "84000" },
    { ...priced, retailer: "lowes" as const },
  ]) {
    assert.equal(supplyRows(changed, now)[0].total, null);
    assert.deepEqual(changed.supplyInventory, priced.supplyInventory);
    assert.deepEqual(changed.supplies, priced.supplies);
  }
  const stale = {
    ...priced,
    supplyInventory: [
      {
        ...priced.supplyInventory[0],
        checkedAt: new Date(now - 86_400_001).toISOString(),
      },
    ],
  };
  const future = {
    ...priced,
    supplyInventory: [
      {
        ...priced.supplyInventory[0],
        checkedAt: new Date(now + 1).toISOString(),
      },
    ],
  };
  assert.equal(supplyRows(stale, now)[0].total, null);
  assert.equal(supplyRows(future, now)[0].total, null);
  assert.throws(
    () =>
      recordSupplyInventory(selected, {
        ...observation("home-depot"),
        retailerProductId: "203525221",
        url: "https://www.homedepot.com/p/203525221",
      }),
    /exact supply|reviewed offer/i,
  );
  assert.match(supplyDefinitions[id].requirements!.join(" "), /nominal/i);
  assert.match(
    supplyDefinitions[id].requirements!.join(" "),
    /no .*ownership|no .*owned/i,
  );
});
