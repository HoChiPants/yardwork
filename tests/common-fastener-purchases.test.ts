import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import assert from "node:assert/strict";
import test from "node:test";
import {
  blank,
  catalog,
  inventorySchema,
  part,
  projectSchema,
  uid,
  type Project,
} from "../src/model";
import {
  findRetailerProduct,
  purchaseSpecForProduct,
  referenceOffersForProduct,
  retailerProductSchema,
  checkProductBinding,
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
import { bom, usableInventory } from "../src/engine";
import { fastenerProductIds } from "../src/fasteningSchema";

const sd = "simpson-sd9112r100",
  nails = "grip-rite-16c5",
  at = Date.now();
const project = (): Project => ({
  ...blank("SYNTHETIC purchase test"),
  store: "4401",
});
function observation(productId = nails, price = 12.5) {
  const product = findRetailerProduct(productId)!;
  const offer = referenceOffersForProduct(product).find(
    (o) => o.retailer === "home-depot",
  )!;
  return {
    productId,
    retailer: "home-depot" as const,
    retailerProductId: offer.productId,
    price,
    available: 3,
    store: "4401",
    zip: "84121",
    checkedAt: new Date(at).toISOString(),
    url: offer.url,
  };
}

test("SD100 reuses the existing exact identity and geometry while correcting its current HD reference", () => {
  const product = findRetailerProduct(sd)!;
  assert.equal(product.manufacturerPartNumber, "SD9112R100");
  assert.equal(product.purchaseSpec?.kind, "counted");
  assert.equal(product.profile.packCount, 100);
  assert.deepEqual(product.profile.stockSize, [0.37, 1.5, 0.37]);
  assert.deepEqual(
    referenceOffersForProduct(product).map((o) => [
      o.retailer,
      o.productId,
      o.retailerItemNumber,
    ]),
    [
      ["home-depot", "202071152", "477314"],
      ["lowes", "3242494", "130014"],
    ],
  );
  const stock = catalog.find((m) => m.productReference === sd)!;
  assert.ok(stock);
  assert.equal(checkProductBinding(stock, product).compatible, true);
  assert.ok(product.sources.some((s) => /306373352/.test(s.note)));
  assert.ok(product.sources.some((s) => /uncoated.*Class55/.test(s.note)));
  assert.equal((fastenerProductIds as readonly string[]).includes(sd), false);
});

test("mass purchase evidence never supplies an exact nail count, installed body or automatic application role", () => {
  const product = findRetailerProduct(nails)!;
  assert.deepEqual(product.purchaseSpec, {
    kind: "mass",
    amount: 5,
    unit: "lb",
    qualifier: "advertised",
    exactCount: null,
    sourceRefs: product.purchaseSpec!.sourceRefs,
  });
  assert.equal(product.profile.packCount, null);
  assert.equal(product.profile.stockSize, null);
  assert.equal(product.profile.shankDiameter, null);
  assert.equal(product.profile.headDiameter, null);
  assert.equal(product.profile.fastenerLength, 3.5);
  assert.deepEqual(product.roleQualifications, []);
  assert.equal(
    catalog.some((m) => m.productReference === nails),
    false,
  );
  assert.equal(
    (fastenerProductIds as readonly string[]).includes(nails),
    false,
  );
  assert.match(product.discrepancies.join(" "), /approximate235.*around220/);
  assert.deepEqual(
    referenceOffersForProduct(product).map((o) => o.productId),
    ["202308546"],
  );
  assert.equal(
    product.offers.find((o) => o.retailer === "lowes")!.listingStatus,
    "retired",
  );
});

test("trusted purchase schema rejects false mass counts, mismatched counted packs and unsupported evidence", () => {
  const mass = findRetailerProduct(nails)!,
    counted = findRetailerProduct(sd)!;
  for (const input of [
    { ...mass, profile: { ...mass.profile, packCount: 235 } },
    { ...mass, purchaseSpec: { ...mass.purchaseSpec, exactCount: 235 } },
    { ...mass, purchaseSpec: { ...mass.purchaseSpec, unit: "kg" } },
    { ...mass, purchaseSpec: { ...mass.purchaseSpec, amount: -1 } },
    { ...mass, purchaseSpec: { ...mass.purchaseSpec, sourceRefs: [] } },
    {
      ...mass,
      purchaseSpec: {
        ...mass.purchaseSpec,
        sourceRefs: ["https://www.homedepot.com/p/999999999"],
      },
    },
    { ...mass, status: "candidate" },
    { ...counted, purchaseSpec: { ...counted.purchaseSpec, count: 500 } },
  ])
    assert.equal(retailerProductSchema.safeParse(input).success, false);
  assert.equal(purchaseSpecForProduct({ ...mass, purchaseSpec: null }), null);
  assert.equal(purchaseSpecForProduct({ ...mass, status: "candidate" }), null);
  const legacy = findRetailerProduct("sunlite-92763")!;
  assert.equal(legacy.purchaseSpec, null);
  assert.equal(purchaseSpecForProduct(legacy)?.kind, "counted");
  assert.equal(supplyDefinitions["sunlite-92763"].contents.length, 2);
  assert.equal(
    projectSchema.safeParse({
      ...project(),
      supplies: [
        {
          id: uid(),
          productId: nails,
          quantity: 2,
          purchaseSpec: mass.purchaseSpec,
        },
      ],
    }).success,
    false,
  );
});

test("two mass boxes retain unit-aware contents and exact per-box snapshots without placing nails or changing physical connection intent", () => {
  const before = project();
  const selected = addSupply(before, nails, 2, "SYNTHETIC interior materials");
  const saved = recordSupplyInventory(selected, observation());
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const row = supplyRows(reopened, at)[0];
  assert.equal(reopened.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(reopened.pieces, before.pieces);
  assert.deepEqual(reopened.joints, before.joints);
  assert.deepEqual(reopened.fastenerPlans, before.fastenerPlans);
  assert.equal(row.quantity, 2);
  assert.equal(row.purchaseUnit, "5-lb box");
  assert.equal(row.purchaseSpec?.kind, "mass");
  assert.equal(row.unresolved, false);
  assert.equal(row.inventory?.retailerProductId, "202308546");
  assert.equal(row.inventory?.available, 3);
  assert.equal(row.total, 25);
  assert.deepEqual(row.contents, [
    {
      name: "Grip-Rite 16C5 bright common nails",
      quantity: 5,
      unit: "lb",
      qualifier: "advertised",
    },
  ]);
  assert.equal(
    formatSupplyContent(row.contents[0]),
    "5 lb advertised · Grip-Rite 16C5 bright common nails (exact piece count unknown)",
  );
  assert.equal(
    formatSupplyContent({ name: "legacy screws", quantity: 100 }),
    "100 × legacy screws",
  );
  const md = suppliesMarkdown(reopened);
  assert.match(md, /2 × 5-lb box/);
  assert.match(md, /5 lb advertised.*exact piece count unknown/);
  assert.doesNotMatch(md, /(?:235|220) × .*nails/);
});

test("fresh observed zero is priced while stale, future, wrong store/ZIP and retired retailer remain unknown", () => {
  const p = recordSupplyInventory(
    addSupply(project(), nails, 2),
    observation(nails, 0),
  );
  assert.equal(supplyRows(p, at)[0].total, 0);
  assert.ok(supplyRows(p, at)[0].inventory);
  for (const changed of [
    { ...p, store: "other" },
    { ...p, zip: "84000" },
    { ...p, retailer: "lowes" as const },
  ]) {
    assert.equal(supplyRows(changed, at)[0].total, null);
    assert.deepEqual(changed.supplies, p.supplies);
    assert.deepEqual(changed.supplyInventory, p.supplyInventory);
  }
  assert.equal(supplyRows(p, at + 86400001)[0].total, null);
  assert.equal(supplyRows(p, at - 1)[0].total, null);
  assert.equal(
    supplyProducts("lowes").some((p) => p.id === nails),
    false,
  );
  assert.throws(
    () => addSupply({ ...project(), retailer: "lowes" }, nails, 1),
    /active reference/,
  );
  const old = {
    ...observation(),
    retailer: "lowes",
    retailerProductId: "3334512",
    url: "https://www.lowes.com/pd/Grip-Rite-3-1-2-in-8-Gauge-Bright-Steel-Common-Nails-5-lbs/3334512",
  };
  assert.throws(
    () => parseSupplyInventory(JSON.stringify([old])),
    /current reviewed/,
  );
});

test("old SD observations survive imports but no longer match the reviewed current variant", () => {
  const old = {
    ...observation(sd),
    retailerProductId: "306373352",
    url: "https://www.homedepot.com/p/306373352",
  };
  const p = projectSchema.parse({
    ...addSupply(project(), sd, 2),
    supplyInventory: [old],
  });
  assert.equal(supplyRows(p, at)[0].total, null);
  assert.deepEqual(p.supplyInventory, [old]);
  assert.throws(() => recordSupplyInventory(p, old), /current reviewed/);
  const current = recordSupplyInventory(p, observation(sd));
  assert.equal(supplyRows(current, at)[0].total, 25);
  assert.equal(supplyRows(current, at)[0].contents[0].quantity, 100);
  const stock = catalog.find((m) => m.productReference === sd)!;
  const stockObservation = {
    retailer: "home-depot" as const,
    material: stock.id,
    internetNumber: "306373352",
    name: "SYNTHETIC prior reference",
    price: 10,
    available: 1,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date(at).toISOString(),
    url: old.url,
  };
  assert.equal(inventorySchema.safeParse(stockObservation).success, false);
  const oldStock = projectSchema.parse({
    ...project(),
    inventory: [stockObservation],
  });
  assert.deepEqual(oldStock.inventory, [stockObservation]);
  assert.equal(usableInventory(oldStock, stock.id, at), undefined);
  assert.equal(
    usableInventory(
      {
        ...oldStock,
        inventory: [
          {
            ...stockObservation,
            internetNumber: "202071152",
            url: "https://www.homedepot.com/p/202071152",
          },
        ],
      },
      stock.id,
      at,
    )?.internetNumber,
    "202071152",
  );
});

test("SD manual boxes retain separate existing part procurement with duplicate review rather than an automatic offset", () => {
  let p = addSupply(project(), sd, 1);
  const stock = catalog.find((m) => m.productReference === sd)!;
  p = {
    ...p,
    pieces: [
      part(
        "SYNTHETIC existing SD placement",
        stock.id,
        [...stock.size],
        [0, 0, 0],
        p.steps[0].id,
        "SYNTHETIC existing fastener",
      ),
    ],
  };
  const row = supplyRows(p)[0];
  assert.equal(row.quantity, 1);
  assert.match(row.issues.join(" "), /Possible duplicate/);
  assert.equal(bom(p).find((row) => row.id === stock.id)?.quantity, 1);
});
