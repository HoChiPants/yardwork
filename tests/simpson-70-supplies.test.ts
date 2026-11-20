import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { blank, catalog, projectSchema, uid, type Project } from "../src/model";
import { getWoodFastenerProduct } from "../src/fastenerProducts";
import {
  findRetailerProduct,
  purchaseSpecForProduct,
  referenceOffersForProduct,
  retailerProductSchema,
  retailerCatalog,
} from "../src/retailerCatalog";
import {
  addSupply,
  formatSupplyContent,
  parseSupplyInventory,
  recordSupplyInventory,
  suppliesMarkdown,
  supplyDefinitions,
  supplyProducts,
  supplyRows,
} from "../src/supplies";
import { shoppingCsv } from "../src/engine";
import type { Retailer } from "../src/retailers";

const ids = ["simpson-csvz3r70", "simpson-dsvt3r70"] as const;
const now = Date.now();
const current = (retailer: Retailer = "home-depot"): Project => ({
  ...blank("SYNTHETIC exact70-count pack observation"),
  retailer,
  store: "4401",
  zip: "84121",
});
function observation(
  id: (typeof ids)[number],
  retailer: Retailer = "home-depot",
  price = 7.25,
) {
  const offer = referenceOffersForProduct(findRetailerProduct(id)!).find(
    (offer) => offer.retailer === retailer,
  )!;
  return {
    productId: id,
    retailer,
    retailerProductId: offer.productId,
    price,
    available: 2,
    store: "4401",
    zip: "84121",
    checkedAt: new Date(now).toISOString(),
    url: offer.url,
  };
}

test("the captured original48 registry records remain an exact ordered prefix", () => {
  // Captured from the actual pre-admission module, before either new record was added.
  // The work proof also deep-compares the original objects/offers against that capture.
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(retailerCatalog.slice(0, 48)))
      .digest("hex"),
    "d258eb25845b998ba77a02693ac3b790b140db150abc8920cef758ae7f126a65",
  );
  assert.deepEqual(
    retailerCatalog.slice(48, 50).map((product) => product.id),
    ids,
  );
});

test("CSV and DSV admit distinct exact70-count boxes at both retailers without stock geometry or automatic roles", () => {
  for (const [id, model, offers] of [
    [
      ids[0],
      "CSVZ3R70",
      [
        ["321563361", "1008711183"],
        ["1002623380", "2132121"],
      ],
    ],
    [
      ids[1],
      "DSVT3R70",
      [
        ["321563400", "1008711179"],
        ["1002623434", "2132130"],
      ],
    ],
  ] as const) {
    const product = findRetailerProduct(id)!;
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.manufacturerPartNumber, model);
    assert.equal(product.verifiedAt, "2026-11-17T15:35:26.215Z");
    assert.equal(product.profile.packCount, 70);
    assert.equal(product.profile.fastenerLength, 3);
    assert.equal(product.profile.drive, "T25");
    assert.equal(product.profile.stockSize, null);
    assert.equal(product.profile.dimensionMeaning, "unverified");
    assert.equal(product.profile.shankDiameter, null);
    assert.deepEqual(product.roleQualifications, []);
    assert.deepEqual(product.capabilities, []);
    assert.deepEqual(product.toolCapabilityEvidence, []);
    assert.equal(
      catalog.some((material) => material.productReference === id),
      false,
    );
    assert.deepEqual(
      referenceOffersForProduct(product).map((offer) => [
        offer.productId,
        offer.retailerItemNumber,
      ]),
      offers,
    );
    assert.ok(
      referenceOffersForProduct(product).every(
        (offer) => offer.retailerModel === model,
      ),
    );
    for (const retailer of ["home-depot", "lowes"] as const)
      assert.ok(supplyProducts(retailer).some((product) => product.id === id));
    const purchase = purchaseSpecForProduct(product)!;
    assert.equal(purchase.kind, "counted");
    if (purchase.kind !== "counted")
      assert.fail("An exact70-count box is not a mass purchase");
    assert.equal(purchase.count, 70);
    assert.ok(
      purchase.sourceRefs.every((url) =>
        product.sources.some((source) => source.url === url),
      ),
    );
  }
  assert.equal(findRetailerProduct(ids[0])!.profile.headDiameter, null);
  assert.equal(
    findRetailerProduct(ids[1])!.profile.headDiameter,
    0.33,
    "Reported nominal head field never supplies a complete body",
  );
});

test("W source references are a subset of the reviewed registry evidence; currentness, conflicts and unknown installation facts stay visible", () => {
  for (const id of ids) {
    const product = findRetailerProduct(id)!,
      wood = getWoodFastenerProduct(id)!;
    assert.equal(wood.packCount, 70);
    assert.equal(wood.nominalLength, 3);
    assert.equal(wood.surfaceToTipDepth, null);
    assert.equal(wood.tipLength, null);
    assert.ok(
      wood.sources.every((source) =>
        product.sources.some((reference) => reference.url === source.url),
      ),
    );
    assert.ok(
      product.sources.every(
        (source) => source.verifiedAt === product.verifiedAt,
      ),
    );
    assert.match(
      product.sources.map((source) => source.note).join(" "),
      /expires December 31, 2026/,
    );
    assert.match(product.discrepancies.join(" "), /surface-to-tip/);
    assert.match(product.discrepancies.join(" "), /heated-sauna/);
    assert.match(
      supplyDefinitions[id].requirements!.join(" "),
      /no .*driver|no .*function/i,
    );
  }
  const dsv = findRetailerProduct(ids[1])!;
  assert.match(dsv.discrepancies.join(" "), /Quik Guard.*electrogalvanized/);
  assert.match(dsv.discrepancies.join(" "), /October2026.*SDWS/);
  assert.match(
    dsv.sources.map((source) => source.note).join(" "),
    /expired December 31, 2022/,
  );
  assert.ok(
    dsv.purchaseSpec!.sourceRefs.every((url) => !url.includes("e94e6a40")),
    "Expired flier is conflict evidence only",
  );
  assert.match(
    findRetailerProduct(ids[0])!.discrepancies.join(" "),
    /BIT25T-2.*BIT25T-2-R2/,
  );
});

test("manual two-box selections use per-box exact snapshots and survive JSON without adding parts, fixings or owned tools", () => {
  for (const id of ids)
    for (const retailer of ["home-depot", "lowes"] as const) {
      const before = current(retailer),
        selected = addSupply(before, id, 2, "SYNTHETIC planned extra boxes"),
        observed = recordSupplyInventory(selected, observation(id, retailer)),
        reopened = projectSchema.parse(JSON.parse(JSON.stringify(observed))),
        row = supplyRows(reopened, now)[0];
      assert.deepEqual(before.supplies, []);
      assert.equal(row.quantity, 2);
      assert.equal(row.purchaseUnit, "70-screw box");
      assert.equal(row.contents.length, 1);
      assert.equal(row.contents[0].quantity, 70);
      assert.equal(row.quantity * row.contents[0].quantity, 140);
      assert.equal(row.total, 14.5);
      assert.equal(
        row.inventory?.retailerProductId,
        observation(id, retailer).retailerProductId,
      );
      assert.equal(row.inventory?.available, 2);
      assert.equal(row.unresolved, false);
      for (const key of [
        "pieces",
        "joints",
        "fastenerPlans",
        "connectorPlans",
        "lidHingePlans",
        "hingeStockSources",
        "toolSelections",
      ] as const)
        assert.deepEqual(reopened[key], before[key]);
      assert.match(formatSupplyContent(row.contents[0]), /^70 × Simpson/);
      assert.match(suppliesMarkdown(reopened), /2 × 70-screw box/);
      assert.match(shoppingCsv(reopened), /70-screw box/);
    }
});

test("snapshot zero stays zero; stale/future/wrong store/ZIP/retailer remain unpriced while retaining user records", () => {
  const p = recordSupplyInventory(
    addSupply(current(), ids[0], 2),
    observation(ids[0], "home-depot", 0),
  );
  assert.equal(supplyRows(p, now)[0].total, 0);
  assert.ok(supplyRows(p, now)[0].inventory);
  for (const changed of [
    { ...p, store: "different" },
    { ...p, zip: "84000" },
    { ...p, retailer: "lowes" as const },
  ]) {
    assert.equal(supplyRows(changed, now)[0].total, null);
    assert.deepEqual(changed.supplies, p.supplies);
    assert.deepEqual(changed.supplyInventory, p.supplyInventory);
  }
  assert.equal(supplyRows(p, now + 86400001)[0].total, null);
  assert.equal(supplyRows(p, now - 1)[0].total, null);
  const switched = recordSupplyInventory(
    { ...p, retailer: "lowes" },
    observation(ids[0], "lowes", 4),
  );
  assert.equal(switched.supplyInventory.length, 2);
  assert.equal(supplyRows(switched, now)[0].total, 8);
  assert.equal(
    supplyRows(switched, now)[0].inventory?.retailerProductId,
    "1002623380",
  );
});

test("another counted variant and cross-product references cannot price these boxes; archived observations remain readable", () => {
  const wrongPack = {
    ...observation(ids[0]),
    retailerProductId: "321563337",
    url: "https://www.homedepot.com/p/321563337",
  };
  assert.throws(
    () => parseSupplyInventory(JSON.stringify([wrongPack])),
    /current reviewed/,
  );
  const retained = projectSchema.parse({
    ...addSupply(current(), ids[0], 1),
    supplyInventory: [wrongPack],
  });
  assert.deepEqual(retained.supplyInventory, [wrongPack]);
  assert.equal(supplyRows(retained, now)[0].total, null);
  assert.throws(
    () => recordSupplyInventory(retained, wrongPack),
    /current reviewed/,
  );
  const wrongProduct = { ...observation(ids[0]), productId: ids[1] };
  assert.throws(
    () => recordSupplyInventory(current(), wrongProduct),
    /current reviewed/,
  );
  assert.throws(
    () =>
      recordSupplyInventory(current(), {
        ...observation(ids[0]),
        url: "https://www.lowes.com/pd/CSVZ3R70/321563361",
      }),
    /retailer|URL|HTTPS/i,
  );
  const corrected = recordSupplyInventory(retained, observation(ids[0]));
  assert.equal(supplyRows(corrected, now)[0].total, 7.25);
});

test("trusted counted evidence and current offers cannot be supplied or overridden by project flags", () => {
  const product = findRetailerProduct(ids[1])!;
  for (const value of [
    { ...product, purchaseSpec: { ...product.purchaseSpec, count: 100 } },
    { ...product, profile: { ...product.profile, packCount: 76 } },
    { ...product, purchaseSpec: { ...product.purchaseSpec, sourceRefs: [] } },
    { ...product, status: "candidate" },
  ])
    assert.equal(retailerProductSchema.safeParse(value).success, false);
  assert.equal(
    projectSchema.safeParse({
      ...current(),
      supplies: [{ id: uid(), productId: ids[1], quantity: 1, packCount: 100 }],
    }).success,
    false,
  );
  assert.deepEqual(
    referenceOffersForProduct({
      ...product,
      offers: product.offers.map((offer) => ({
        ...offer,
        listingStatus: "retired" as const,
      })),
    }),
    [],
  );
  assert.deepEqual(
    referenceOffersForProduct({
      ...product,
      offers: product.offers.map((offer) => ({
        ...offer,
        listingStatus: "marketplace-retired" as const,
      })),
    }),
    [],
  );
});
