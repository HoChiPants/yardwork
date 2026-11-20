import test from "node:test";
import assert from "node:assert/strict";
import { blank, inventorySchema, part, projectSchema } from "../src/model";
import { usableInventory, shoppingCsv } from "../src/engine";
import { homeDepotHandoff, retailerHandoff } from "../src/handoff";
import { retailerFromUrl, retailerSearch } from "../src/retailers";
const observed = {
  material: "stud" as const,
  internetNumber: "123456789",
  name: "Observed stock example",
  price: 4,
  available: 25,
  store: "101",
  zip: "84121",
  checkedAt: new Date().toISOString(),
  url: "https://www.homedepot.com/p/example/123456789",
};
test("legacy projects and snapshots remain Home Depot while Lowe's is explicit and host bound", () => {
  const p = blank();
  const raw = { ...p } as any;
  delete raw.retailer;
  assert.equal(projectSchema.parse(raw).retailer, "home-depot");
  assert.ok(inventorySchema.parse(observed));
  assert.throws(() =>
    inventorySchema.parse({
      ...observed,
      url: "https://www.lowes.com/pd/example/1114951",
    }),
  );
  assert.ok(
    inventorySchema.parse({
      ...observed,
      retailer: "lowes",
      internetNumber: "1114951",
      url: "https://www.lowes.com/pd/example/1114951",
    }),
  );
  for (const url of [
    "http://www.lowes.com/pd/x/1114951",
    "https://user:secret@www.lowes.com/pd/x/1114951",
    "https://www.lowes.com:8443/pd/x/1114951",
    "https://lowes.com.evil.test/pd/x/1114951",
    "https://www.homedepot.com.evil.test/p/x/123456789",
  ])
    assert.equal(retailerFromUrl(url), null);
});
test("availability never crosses retailer identity even when store and ZIP coincide", () => {
  const p = blank();
  p.store = "101";
  const hd = inventorySchema.parse(observed),
    lowes = inventorySchema.parse({
      ...observed,
      retailer: "lowes",
      internetNumber: "1114951",
      available: 7,
      url: "https://www.lowes.com/pd/example/1114951",
    });
  p.inventory = [hd, lowes];
  assert.equal(usableInventory(p, "stud")?.available, 25);
  p.retailer = "lowes";
  assert.equal(usableInventory(p, "stud")?.available, 7);
  p.store = "102";
  assert.equal(usableInventory(p, "stud"), undefined);
});
test("Lowe's handoffs and unverified searches remain retailer specific without claiming native list import", () => {
  const p = blank();
  p.retailer = "lowes";
  p.pieces = [
    part("Board", "stud", [1.5, 48, 3.5], [0, 24, 0], p.steps[0].id, "Frame"),
  ];
  const handoff = retailerHandoff(p);
  assert.match(handoff, /Retailer: Lowe's/);
  assert.match(handoff, /does not synchronize a Lowe's account/);
  assert.throws(() => homeDepotHandoff(p), /targets Lowe's/);
  assert.match(shoppingCsv(p), /www.lowes.com\/search/);
  assert.match(retailerSearch("home-depot", "2x4"), /homedepot.com/);
});
