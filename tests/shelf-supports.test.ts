import assert from "node:assert/strict";
import test from "node:test";
import {
  blank,
  catalog,
  material,
  projectSchema,
  type Project,
} from "../src/model";
import { bom } from "../src/engine";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  findRetailerProduct,
  checkProductBinding,
  retailerProductSchema,
} from "../src/retailerCatalog";
import {
  addSupply,
  recordSupplyInventory,
  supplyDefinitions,
  supplyProducts,
  supplyRows,
  suppliesMarkdown,
} from "../src/supplies";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";
import {
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
} from "../src/attachments";

const pins = "kreg-kma-5mpin",
  jig = "kreg-kma3232",
  bit = "kreg-kma3215";
const now = Date.parse("2026-11-17T12:00:00Z"),
  checkedAt = "2026-11-17T10:00:00Z";
const shelf = () =>
  createBuildStudy("shelves", defaultBuildStudyParameters("shelves")).project;

test("reviewed Kreg identities preserve exact offers, pack contents and unknown installed geometry", () => {
  const products = [
    findRetailerProduct(pins)!,
    findRetailerProduct(jig)!,
    findRetailerProduct(bit)!,
  ];
  for (const p of products) {
    assert.ok(p);
    assert.equal(retailerProductSchema.safeParse(p).success, true);
    assert.equal(p.status, "reviewed-specs");
    assert.equal(p.profile.stockSize, null);
    assert.equal(checkProductBinding(material("bracket"), p).compatible, false);
    assert.equal("price" in p, false);
    assert.equal("available" in p, false);
  }
  assert.deepEqual(
    products.map((p) => p.manufacturerPartNumber),
    ["KMA-5MPIN", "KMA3232", "KMA3215"],
  );
  assert.deepEqual(
    products[0].offers.map((o) => o.productId),
    ["5006037921"],
  );
  assert.equal(products[0].profile.packCount, 20);
  assert.deepEqual(
    products[1].offers.map((o) => o.productId),
    ["319450681", "5006041513"],
  );
  assert.deepEqual(
    products[2].offers.map((o) => o.productId),
    ["50022250"],
  );
  assert.ok(
    !catalog.some((m) => [pins, jig, bit].includes(m.productReference ?? "")),
  );
  assert.deepEqual(products[1].capabilities, [
    "shelf-pin-layout",
    "shelf-pin-bit",
  ]);
  assert.deepEqual(products[2].capabilities, ["shelf-pin-bit"]);
  for (const p of products.slice(1))
    assert.ok(
      p.capabilities.every(
        (c) => !["measure", "drill-pilot", "clamp", "drive-screw"].includes(c),
      ),
    );
});

test("pin packs are explicit manual purchases and tool review cannot credit kit pins or create geometry", () => {
  let p: Project = { ...blank(), retailer: "lowes" };
  const before = JSON.stringify(p);
  p = addSupply(p, pins, 2, "Optional adjustable shelves");
  p.toolSelections = [{ productId: jig, checkedAt }];
  const row = supplyRows(p, now)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.purchaseUnit, "20-pin pack");
  assert.deepEqual(row.contents, [
    { name: "Kreg 5 mm shelf pin", quantity: 20 },
  ]);
  assert.equal(row.total, null);
  assert.equal(row.unresolved, false);
  assert.match(row.requirements.join(" "), /insertion.*bearing/i);
  assert.match(row.requirements.join(" "), /kit.*four|four.*kit/i);
  assert.equal(p.pieces.length, 0);
  assert.equal(p.joints.length, 0);
  assert.deepEqual(bom(p), []);
  assert.equal(JSON.parse(before).supplies.length, 0);
  assert.equal(supplyDefinitions[jig], undefined);
  assert.equal(supplyDefinitions[bit], undefined);
  assert.throws(() => addSupply(blank(), pins, 1), /reviewed supply/);
  assert.ok(supplyProducts("lowes").some((p) => p.id === pins));
});

test("pin snapshots identify the exact 20-count product and price purchase packs once", () => {
  const p = addSupply(
    { ...blank(), retailer: "lowes", store: "synthetic-test-store" },
    pins,
    2,
  );
  const observed = {
    productId: pins,
    retailer: "lowes",
    retailerProductId: "5006037921",
    price: 4.75,
    available: 3,
    store: p.store,
    zip: p.zip,
    checkedAt,
    url: "https://www.lowes.com/pd/Kreg-0-75-in-L-x-0-332-in-W-x-0-19-in-D-Shelf-pins-20-Pack/5006037921",
  };
  const priced = recordSupplyInventory(p, observed),
    row = supplyRows(priced, now)[0];
  assert.equal(row.total, 9.5);
  assert.equal(row.quantity, 2);
  assert.equal(row.inventory?.available, 3);
  assert.match(suppliesMarkdown(priced), /20-pin pack/);
  for (const changed of [
    { ...observed, retailerProductId: "5006041513" },
    { ...observed, url: "https://www.lowes.com/pd/Kreg/5006041513" },
    { ...observed, retailer: "home-depot" },
    { ...observed, verified: true },
  ])
    assert.throws(() => recordSupplyInventory(p, changed));
  assert.equal(supplyRows({ ...priced, store: "other" }, now)[0].total, null);
  assert.equal(supplyRows(priced, now + 86400001)[0].total, null);
  assert.equal(supplyRows(priced, Date.parse(checkedAt) - 1)[0].total, null);
});

test("casework alone creates no pin-layout or pin-bit operations before an explicit attachment plan", () => {
  const p = shelf(),
    saved = JSON.stringify(p);
  assert.ok(
    !toolChecklist(p).requirements.some((row) =>
      row.capability.startsWith("shelf-pin-"),
    ),
  );
  assert.equal(JSON.stringify(p), saved);
  assert.equal(p.joints.length, 0);
  assert.equal(p.supplies.length, 0);
  assert.match(p.notes, /shelf.supports/i);
  assert.ok(
    !toolChecklist(blank()).requirements.some((row) =>
      row.capability.startsWith("shelf-pin-"),
    ),
  );
});

test("jig covers only its included fixture/bit while replacement is optional and powered drilling stays separate", () => {
  const initial = shelf(),
    entry = shelfSupportEntries(initial)[0],
    p = saveShelfPinPlan(
      initial,
      makeShelfPinPlan(initial, entry.entryId, {
        shelfRoles: [entry.shelves[0].role],
        layout: {
          system: "custom",
          frontInset: 2,
          rearInset: 2,
          datumHeight: null,
        },
      }),
    ),
    shopping = bom(p),
    saved = JSON.stringify(p);
  p.toolSelections = [{ productId: jig, checkedAt }];
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  const selected = selectedToolsForProject(reopened, now),
    rows = toolChecklist(reopened, selected.tools, now).requirements;
  assert.equal(selected.selections[0].status, "reviewed-capabilities");
  for (const capability of ["shelf-pin-layout", "shelf-pin-bit"] as const)
    assert.equal(
      rows.find((r) => r.capability === capability)?.status,
      "supported",
    );
  assert.equal(
    rows.find((r) => r.capability === "drill-pilot")?.status,
    "unknown",
  );
  assert.equal(rows.find((r) => r.capability === "measure")?.status, "unknown");
  assert.equal(rows.find((r) => r.capability === "clamp")?.status, "unknown");
  assert.deepEqual(reopened.supplies, []);
  assert.deepEqual(bom(reopened), shopping);
  assert.deepEqual(reopened.pieces, JSON.parse(saved).pieces);
  const guide = toolGuideMarkdown(reopened, now);
  assert.match(guide, /included.*5 mm.*bit|5 mm.*bit.*included/i);
  assert.match(guide, /replacement.*optional|optional.*replacement/i);
  assert.match(guide, /not.*ownership|does not.*ownership/i);
  reopened.toolSelections = [{ productId: bit, checkedAt }];
  const bitRows = toolChecklist(
    reopened,
    selectedToolsForProject(reopened, now).tools,
    now,
  ).requirements;
  assert.equal(
    bitRows.find((r) => r.capability === "shelf-pin-bit")?.status,
    "supported",
  );
  assert.equal(
    bitRows.find((r) => r.capability === "shelf-pin-layout")?.status,
    "unknown",
  );
  assert.equal(
    bitRows.find((r) => r.capability === "drill-pilot")?.status,
    "unknown",
  );
});

test("Kreg tool support still requires valid user reviews and explicit source-scoped evidence", () => {
  const p = shelf();
  p.toolSelections = [{ productId: jig, checkedAt: "2026-11-18T00:00:00Z" }];
  assert.equal(selectedToolsForProject(p, now).selections[0].status, "unknown");
  const product = findRetailerProduct(jig)!,
    original = structuredClone(product);
  p.toolSelections = [{ productId: jig, checkedAt }];
  try {
    product.toolCapabilityEvidence = [];
    assert.equal(
      selectedToolsForProject(p, now).selections[0].status,
      "unknown",
    );
    Object.assign(product, structuredClone(original));
    product.capabilities.push("measure");
    assert.equal(
      selectedToolsForProject(p, now).tools[0].capabilities.includes("measure"),
      false,
    );
  } finally {
    Object.assign(product, original);
  }
});
