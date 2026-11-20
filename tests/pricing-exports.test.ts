import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part } from "../src/model";
import { bom, guideMarkdown, projectPricingCoverage, shoppingCsv } from "../src/engine";
import { addSupply, recordSupplyInventory } from "../src/supplies";
import { retailerHandoff } from "../src/handoff";

function mixed() {
  let p = blank("SYNTHETIC mixed priced subtotal");
  p.store = "SYNTHETIC PRICING";
  const stock = material("plytanium-703");
  for (let index = 0; index < 4; index++)
    p.pieces.push(part(`SYNTHETIC full sheet ${index + 1}`, stock.id, [...(stock.stockSize ?? stock.size)], [index * 100, 50, 0], p.steps[0].id, "Separate unpriced sheets"));
  p.pieces.push(part("SYNTHETIC example board", "stud", [1.5, 96, 3.5], [0, 48, 100], p.steps[0].id, "Example stock"));
  p = addSupply(p, "simpson-sd9112r100", 1);
  p = addSupply(p, "grip-rite-16c5", 2);
  for (const [productId, retailerProductId, price] of [["simpson-sd9112r100", "202071152", 0], ["grip-rite-16c5", "202308546", 15]] as const)
    p = recordSupplyInventory(p, { productId, retailer: "home-depot", retailerProductId, price, available: 10, store: p.store, zip: p.zip, checkedAt: new Date().toISOString(), url: `https://www.homedepot.com/p/${retailerProductId}` });
  return p;
}

test("Markdown and retailer handoff describe a partial priced subtotal with four sheets in one unknown line", () => {
  const p = mixed(), before = JSON.stringify(p), coverage = projectPricingCoverage(p);
  assert.equal(coverage.observedSubtotal, 30);
  assert.equal(coverage.materials.unpricedLineCount, 1);
  assert.equal(coverage.materials.unpricedPurchaseUnitQuantity, 4);
  assert.equal(bom(p).find((row) => row.id === "plytanium-703")!.quantity, 4);
  for (const text of [guideMarkdown(p), retailerHandoff(p)]) {
    assert.match(text, /priced subtotal/);
    assert.match(text, /1 unpriced line/);
    assert.match(text, /4 × sheet/);
    assert.match(text, /not a complete-project quote/);
    assert.match(text, /5 lb advertised/);
    assert.match(text, /exact piece count unknown/);
    assert.doesNotMatch(text, /235 supplied|220 supplied|nails? spare|Shopping list.*estimate/);
  }
  assert.equal(JSON.stringify(p), before);
});

test("shopping CSV retains rectangular columns, price provenance and mass wording without count conversion", () => {
  const csv = shoppingCsv(mixed()),
    rows = csv.trim().split(/\r?\n/).map((line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) => match[1].replaceAll('""', '"'))),
    header = rows[0], basis = header.indexOf("Price basis"), contents = header.indexOf("Supply pack contents and usage");
  assert.ok(basis >= 0);
  assert.ok(rows.every((row) => row.length === header.length));
  assert.equal(rows.find((row) => row[1] === "202071152")![basis], "snapshot");
  assert.ok(rows.some((row) => row[basis] === "example"));
  assert.ok(rows.some((row) => row[basis] === "unknown"));
  const mass = rows.find((row) => row[1] === "202308546")!;
  assert.equal(mass[2], "2");
  assert.match(mass[contents], /5 lb advertised/);
  assert.match(mass[contents], /exact piece count unknown/);
  assert.equal(mass[13], "");
  assert.equal(mass[15], "");
});
