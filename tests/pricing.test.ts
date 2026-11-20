import assert from "node:assert/strict";
import test from "node:test";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Inventory,
  type MaterialId,
} from "../src/model";
import {
  bom,
  guideMarkdown,
  projectPricingCoverage,
  usableInventory,
} from "../src/engine";
import {
  pricingCoverage,
  formatPricedSubtotal,
  pricingCoverageText,
  pricingCoverageMarkdown,
  type PricingLine,
} from "../src/pricing";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { nextStoreCheckChange } from "../src/storeSnapshotTime";
import {
  designFingerprint,
  generateBuildGuide,
  guideIsCurrent,
} from "../src/guide";

function stock(count = 1, id: MaterialId = "plytanium-703") {
  const p = blank("SYNTHETIC pricing coverage");
  p.store = "SYNTHETIC-PRICING";
  p.pieces = Array.from({ length: count }, (_, i) =>
    part(
      `Panel ${i + 1}`,
      id,
      [...material(id).size],
      [i * 60, 48, 0],
      p.steps[0].id,
      "Panels",
    ),
  );
  return p;
}
function observed(
  p: ReturnType<typeof blank>,
  id: MaterialId,
  price: number,
  overrides: Partial<Inventory> = {},
): Inventory {
  const exact = id === "plytanium-703";
  return {
    retailer: "home-depot",
    material: id,
    internetNumber: exact ? "100061386" : "123456789",
    name: "SYNTHETIC price observation",
    price,
    available: 100,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: exact
      ? "https://www.homedepot.com/p/100061386"
      : "https://www.homedepot.com/p/123456789",
    ...overrides,
  };
}
const line = (overrides: Partial<PricingLine> = {}): PricingLine => ({
  id: "panels",
  name: "Panels",
  quantity: 4,
  purchaseUnit: "sheet",
  priceSource: "unknown",
  total: null,
  ...overrides,
});

test("four unpriced sheets are one line, four purchase units, and never a zero-dollar quote", () => {
  const p = stock(4),
    rows = bom(p),
    coverage = projectPricingCoverage(p, rows, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 4);
  assert.equal(rows[0].priceSource, "unknown");
  assert.equal(coverage.pricedSubtotal, null);
  assert.equal(coverage.unpricedLineCount, 1);
  assert.equal(coverage.unpricedPurchaseUnitQuantity, 4);
  assert.deepEqual(coverage.unpricedPurchaseUnits, [
    { unit: "sheet", quantity: 4 },
  ]);
  assert.equal(coverage.status, "partial");
  assert.equal(formatPricedSubtotal(coverage), "No priced subtotal");
  assert.match(pricingCoverageText(coverage), /1 unpriced line \(4 × sheet/);
  assert.match(pricingCoverageText(coverage), /excluded, not free/);
  assert.doesNotMatch(formatPricedSubtotal(coverage), /\$0/);
});

test("observed, example and unknown amounts remain separate and sum once across materials and supplies", () => {
  const coverage = pricingCoverage({
    materials: [
      line({ id: "observed", priceSource: "snapshot", total: 40 }),
      line({
        id: "example",
        quantity: 1,
        purchaseUnit: "board",
        priceSource: "example",
        total: 8,
      }),
      line(),
    ],
    supplies: [
      line({
        id: "hinges",
        quantity: 2,
        purchaseUnit: "hinge",
        priceSource: "snapshot",
        total: 12,
      }),
    ],
  });
  assert.equal(coverage.pricedSubtotal, 60);
  assert.equal(coverage.observedSubtotal, 52);
  assert.equal(coverage.exampleSubtotal, 8);
  assert.equal(coverage.materials.pricedSubtotal, 48);
  assert.equal(coverage.supplies.pricedSubtotal, 12);
  assert.equal(coverage.observedLineCount, 2);
  assert.equal(coverage.exampleLineCount, 1);
  assert.equal(coverage.unpricedLineCount, 1);
  assert.equal(coverage.status, "partial");
  assert.equal(
    pricingCoverage({
      materials: [line({ priceSource: "example", total: 8 })],
      supplies: [],
    }).status,
    "example",
  );
});

test("genuine observed zero is priced while unknown zero remains unpriced; empty has no priced subtotal", () => {
  const known = pricingCoverage({
    materials: [line({ priceSource: "snapshot", total: 0 })],
    supplies: [],
  });
  assert.equal(known.pricedSubtotal, 0);
  assert.equal(known.observedLineCount, 1);
  assert.equal(known.unpricedLineCount, 0);
  assert.equal(known.status, "observed");
  assert.match(formatPricedSubtotal(known), /^\$0\.00 priced subtotal$/);
  const unknown = pricingCoverage({
    materials: [line({ total: 0 })],
    supplies: [],
  });
  assert.equal(unknown.pricedSubtotal, null);
  assert.equal(unknown.unpricedLineCount, 1);
  const empty = pricingCoverage({
    materials: [line({ quantity: 0 })],
    supplies: [],
  });
  assert.equal(empty.status, "empty");
  assert.equal(empty.pricedSubtotal, null);
  assert.equal(empty.lineCount, 0);
});

test("BOM source provenance accepts exact observed zero and excludes stale, future and wrong-target snapshots", () => {
  const p = stock(1, "stud");
  p.inventory = [observed(p, "stud", 0)];
  assert.equal(bom(p)[0].priceSource, "snapshot");
  assert.equal(projectPricingCoverage(p).pricedSubtotal, 0);
  for (const overrides of [
    { checkedAt: new Date(Date.now() - 86400001).toISOString() },
    { checkedAt: new Date(Date.now() + 60000).toISOString() },
    { store: "OTHER-STORE" },
    { zip: "10001" },
    {
      retailer: "lowes" as const,
      url: "https://www.lowes.com/pd/example/123456789",
    },
  ]) {
    p.inventory = [observed(p, "stud", 0, overrides)];
    assert.equal(usableInventory(p, "stud"), undefined);
    const row = bom(p)[0];
    assert.equal(row.priceSource, "example");
    assert.equal(
      projectPricingCoverage(p).exampleSubtotal,
      material("stud").price,
    );
  }
});

test("store material and supply observations expire at the same boundary", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const p = addSupply(stock(1, "stud"), "everbilt-29256-continuous-hinge", 2);
  p.inventory = [observed(p, "stud", 7, { checkedAt: new Date(now - day).toISOString() })];
  p.supplyInventory = [{
    productId: "everbilt-29256-continuous-hinge", retailer: "home-depot", retailerProductId: "314150989",
    store: p.store, zip: p.zip, price: 18, available: 1, checkedAt: p.inventory[0].checkedAt,
    url: "https://www.homedepot.com/p/314150989",
  }];
  assert.equal(bom(p, now - 1)[0].priceSource, "snapshot");
  assert.equal(supplyRows(p, now - 1)[0].total, 36);
  assert.equal(bom(p, now)[0].priceSource, "example");
  assert.equal(supplyRows(p, now)[0].total, null);
  const checks = [...p.inventory, ...p.supplyInventory, { checkedAt: new Date(now + 250).toISOString() }];
  assert.equal(nextStoreCheckChange(checks, now - 1), now);
  assert.equal(nextStoreCheckChange(checks, now), now + 250);
  assert.equal(nextStoreCheckChange(checks, now + 250), now + 250 + day);
  assert.equal(nextStoreCheckChange(checks, now + 250 + day), null);
});

test("exact product observations use the existing validator rather than trusting a mismatched retailer product", () => {
  const p = stock();
  p.inventory = [observed(p, "plytanium-703", 0)];
  assert.equal(bom(p)[0].priceSource, "snapshot");
  assert.equal(projectPricingCoverage(p).pricedSubtotal, 0);
  p.inventory = [
    observed(p, "plytanium-703", 25, {
      internetNumber: "999999999",
      url: "https://www.homedepot.com/p/999999999",
    }),
  ];
  assert.equal(usableInventory(p, "plytanium-703"), undefined);
  assert.equal(bom(p)[0].priceSource, "unknown");
  assert.equal(projectPricingCoverage(p).pricedSubtotal, null);
});

test("oversized-only work and unknown legacy hardware retain excluded quantity context without false prices", () => {
  const p = stock(2, "stud");
  p.pieces[0].size[1] = 200;
  p.pieces[1].size[1] = 200;
  p.joints = [
    {
      id: uid(),
      a: p.pieces[0].id,
      b: p.pieces[1].id,
      kind: "screw",
      length: 11.5,
      quantity: 7,
      stepId: p.steps[0].id,
    },
  ];
  const coverage = projectPricingCoverage(p);
  assert.equal(coverage.lineCount, 0);
  assert.equal(coverage.excludedPartCount, 2);
  assert.equal(coverage.pricedSubtotal, null);
  assert.equal(coverage.status, "partial");
  assert.ok(
    coverage.unresolvedQuantities.some(
      (item) =>
        item.count === 7 && /connection hardware/.test(item.description),
    ),
  );
  assert.match(pricingCoverageText(coverage), /2 oversized parts/);
});

test("supplies use exact per-pack observations including zero; unresolved saved identities remain visible", () => {
  let p = addSupply(stock(1, "stud"), "everbilt-29256-continuous-hinge", 2);
  p = recordSupplyInventory(p, {
    productId: "everbilt-29256-continuous-hinge",
    retailer: "home-depot",
    retailerProductId: "314150989",
    price: 0,
    available: 10,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/314150989",
  });
  p.supplies.push({
    id: uid(),
    productId: "future-unmatched-pack",
    quantity: 3,
    purpose: "Keep saved selection",
    note: "Unresolved identity",
  });
  const coverage = projectPricingCoverage(p, bom(p), supplyRows(p));
  assert.equal(coverage.supplies.pricedSubtotal, 0);
  assert.equal(coverage.supplies.observedLineCount, 1);
  assert.equal(coverage.supplies.unpricedLineCount, 1);
  assert.equal(coverage.supplies.unpricedPurchaseUnitQuantity, 3);
  assert.ok(
    coverage.unresolvedQuantities.some(
      (item) =>
        item.count === 3 && /future-unmatched-pack/.test(item.description),
    ),
  );
  const differentStore = projectPricingCoverage({ ...p, store: "OTHER-STORE" });
  assert.equal(differentStore.supplies.pricedSubtotal, null);
  assert.equal(differentStore.supplies.unpricedLineCount, 2);
});

test("unknown purchase units stay grouped rather than calling rolls, boxes and sheets physical pieces", () => {
  const coverage = pricingCoverage({
    materials: [line()],
    supplies: [
      line({ id: "box", purchaseUnit: "5 lb box", quantity: 2 }),
      line({ id: "set", purchaseUnit: "connector assembly", quantity: 3 }),
    ],
  });
  assert.deepEqual(coverage.unpricedPurchaseUnits, [
    { unit: "sheet", quantity: 4 },
    { unit: "5 lb box", quantity: 2 },
    { unit: "connector assembly", quantity: 3 },
  ]);
  assert.equal(coverage.unpricedLineCount, 3);
  assert.equal(coverage.unpricedPurchaseUnitQuantity, 9);
});

test("actual mixed material and supply rows retain coverage through save/reopen without counting packs twice", () => {
  let p = stock(4);
  p.pieces.push(
    part(
      "Example board",
      "stud",
      [...material("stud").size],
      [0, 48, 200],
      p.steps[0].id,
      "Frame",
    ),
  );
  p = addSupply(p, "everbilt-29256-continuous-hinge", 2);
  p = recordSupplyInventory(p, {
    productId: "everbilt-29256-continuous-hinge",
    retailer: "home-depot",
    retailerProductId: "314150989",
    price: 10,
    available: 10,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/314150989",
  });
  const coverage = projectPricingCoverage(
    projectSchema.parse(JSON.parse(JSON.stringify(p))),
  );
  assert.equal(coverage.observedSubtotal, 20);
  assert.equal(coverage.exampleSubtotal, material("stud").price);
  assert.equal(coverage.pricedSubtotal, 20 + material("stud").price);
  assert.equal(coverage.unpricedLineCount, 1);
  assert.equal(coverage.unpricedPurchaseUnitQuantity, 4);
  assert.equal(coverage.materials.lineCount, 2);
  assert.equal(coverage.supplies.lineCount, 1);
  assert.equal(coverage.status, "partial");
});

test("invalid cut lineage discloses conservative uncertain quantities even when example prices exist", () => {
  const p = stock(2, "stud"),
    source = uid();
  for (const piece of p.pieces)
    piece.cutStock = {
      id: source,
      size: [...material("stud").size],
      offset: [0, 0, 0],
    };
  const coverage = projectPricingCoverage(p);
  assert.equal(coverage.pricedSubtotal, material("stud").price * 2);
  assert.equal(coverage.unpricedLineCount, 0);
  assert.equal(coverage.status, "partial");
  assert.ok(
    coverage.unresolvedQuantities.some(
      (item) =>
        item.count === 1 && /Cut-source provenance/.test(item.description),
    ),
  );
});

test("a duplicate supply representation is priced once per actual representation with a review warning", () => {
  let p = stock(1, "sd9112r100");
  p = addSupply(p, "simpson-sd9112r100", 1);
  p.inventory = [
    observed(p, "sd9112r100", 12, {
      internetNumber: "202071152",
      url: "https://www.homedepot.com/p/202071152",
    }),
  ];
  p = recordSupplyInventory(p, {
    productId: "simpson-sd9112r100",
    retailer: "home-depot",
    retailerProductId: "202071152",
    price: 12,
    available: 10,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/202071152",
  });
  const coverage = projectPricingCoverage(p);
  assert.equal(coverage.materials.pricedSubtotal, 12);
  assert.equal(coverage.supplies.pricedSubtotal, 12);
  assert.equal(coverage.pricedSubtotal, 24);
  assert.ok(
    coverage.warnings.some((warning) => /Possible duplicate/.test(warning)),
  );
  assert.equal(coverage.supplies.lineCount, 1);
});

test("mass-based selected boxes price by box while exact physical nail count remains unknown", () => {
  let p = addSupply(blank("SYNTHETIC mass purchase"), "grip-rite-16c5", 2);
  p.store = "SYNTHETIC-PRICING";
  p = recordSupplyInventory(p, {
    productId: "grip-rite-16c5",
    retailer: "home-depot",
    retailerProductId: "202308546",
    price: 9,
    available: 5,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/202308546",
  });
  const coverage = projectPricingCoverage(p);
  assert.equal(coverage.pricedSubtotal, 18);
  assert.equal(coverage.supplies.observedLineCount, 1);
  assert.equal(supplyRows(p)[0].quantity, 2);
  assert.equal(supplyRows(p)[0].purchaseSpec?.kind, "mass");
  const markdown = guideMarkdown(p);
  assert.match(markdown, /5 lb advertised/);
  assert.match(markdown, /exact piece count unknown/);
  assert.doesNotMatch(markdown, /470 nails|440 nails/);
});

test("derived coverage and Markdown leave saved geometry, guide phases and current fingerprints unchanged", () => {
  const p = generateBuildGuide(stock(4)),
    before = JSON.stringify(p),
    fp = designFingerprint(p);
  const coverage = projectPricingCoverage(p),
    markdown = guideMarkdown(p);
  assert.match(markdown, /## Pricing coverage/);
  assert.match(markdown, /4 × sheet/);
  assert.match(markdown, /not a complete-project quote/);
  assert.match(pricingCoverageMarkdown(coverage), /Tax, delivery, tools/);
  assert.equal(JSON.stringify(p), before);
  assert.equal(designFingerprint(p), fp);
  assert.ok(guideIsCurrent(p));
  assert.deepEqual(projectSchema.parse(JSON.parse(before)), p);
});
