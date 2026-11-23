import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { blank, projectSchema, uid } from "../src/model";
import {
  addSupply,
  parseSupplyInventory,
  recordSupplyInventory,
  suppliesMarkdown,
  supplyProducts,
  supplyRows,
} from "../src/supplies";
import {
  supplyInventorySchema,
  supplySelectionSchema,
} from "../src/supplySchema";
import {
  shoppingCsv,
  guideMarkdown,
  projectPricingCoverage,
} from "../src/engine";
import { homeDepotShoppingList, retailerHandoff } from "../src/handoff";
import { toolChecklist } from "../src/tools";
import { selectedToolsForProject } from "../src/toolGuide";
import { trimSealant } from "../src/trimSealantReference";
import { estimateTrimSealant } from "../src/trimSealantTakeoff";

const hinge = "everbilt-29256-continuous-hinge";
const drill = "dewalt-dcd771c2";
const at = Date.now();
function project() {
  return { ...blank(), store: "4401" };
}
function observation() {
  return {
    productId: hinge,
    retailer: "home-depot" as const,
    retailerProductId: "314150989",
    price: 19.95,
    available: 3,
    store: "4401",
    zip: "84121",
    checkedAt: new Date(at).toISOString(),
    url: "https://www.homedepot.com/p/314150989",
  };
}

test("measured trim sealant estimate respects the coverage basis and keeps the exact cartridge in project exports", () => {
  const dimensions = { lengthInches: 660, gapWidth: 0.125, gapDepth: 0.125 };
  assert.equal(estimateTrimSealant(dimensions).cartridges, 1);
  assert.equal(estimateTrimSealant({ ...dimensions, lengthInches: 660.25 }).cartridges, 2);
  assert.throws(() => estimateTrimSealant({ ...dimensions, gapWidth: 0.25 }), /coverage from a trial/);
  assert.throws(() => estimateTrimSealant({ ...dimensions, gapDepth: 0.6, fieldCoverageFeet: 25 }), /1\/2 in deep/);
  assert.throws(() => estimateTrimSealant({ ...dimensions, gapWidth: 1.25, fieldCoverageFeet: 25 }), /1 in wide/);
  assert.throws(() => estimateTrimSealant({ ...dimensions, fieldCoverageFeet: 0 }), /positive coverage/);

  const proposal = estimateTrimSealant({ ...dimensions, gapWidth: 0.25, fieldCoverageFeet: 30 });
  const revised = addSupply(project(), trimSealant.id, proposal.cartridges, "Interior trim", proposal.note);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(revised)));
  const row = supplyRows(saved).find((entry) => entry.productId === trimSealant.id)!;
  assert.equal(row.quantity, 2);
  assert.equal(row.purchaseUnit, "cartridge");
  assert.equal(row.total, null);
  assert.equal(row.offer?.productId, "100035980");
  assert.equal(row.storeSnapshotEligible, true);
  assert.match(guideMarkdown(saved), /55 ft of dry interior trim seams.+30 ft per cartridge from a field trial/);
  assert.match(homeDepotShoppingList(saved).text, /^2 cartridges .+#100035980$/m);
  assert.deepEqual(saved.pieces, []);
});

test("explicit tool packages use their own snapshot and export lines without changing stock pricing or tool reviews", () => {
  const p = addSupply(project(), hinge, 1);
  const pricing = projectPricingCoverage(p);
  const selected = addSupply(p, drill, 1);
  assert.deepEqual(selected.toolSelections, p.toolSelections);
  assert.deepEqual(selected.pieces, p.pieces);
  assert.deepEqual(projectPricingCoverage(selected), pricing);
  const drillRow = supplyRows(selected).find((row) => row.productId === drill)!;
  assert.equal(drillRow.isTool, true);
  assert.equal(drillRow.purchaseUnit, "drill kit");
  assert.deepEqual(
    drillRow.contents.map(({ quantity }) => quantity),
    [1, 2, 1, 1],
  );
  assert.equal(drillRow.total, null);

  const snapshot = {
    ...observation(),
    productId: drill,
    retailerProductId: "204279858",
    url: "https://www.homedepot.com/p/204279858",
    price: 123.45,
    available: 0,
  };
  const observed = recordSupplyInventory(selected, snapshot);
  assert.deepEqual(projectPricingCoverage(observed), pricing);
  const tool = homeDepotShoppingList(observed).items.find(
    (row) => row.productId === "204279858",
  )!;
  assert.equal(tool.isTool, true);
  assert.equal(tool.snapshot?.available, 0);
  assert.match(
    homeDepotShoppingList(observed).text,
    /^1 drill kit .*#204279858$/m,
  );
  assert.equal(
    homeDepotShoppingList({ ...observed, store: "4409" }).items.find(
      (row) => row.productId === "204279858",
    )?.snapshot,
    null,
  );
  assert.match(
    shoppingCsv(observed),
    /"204279858","1","drill kit","123.45","123.45"/,
  );
  assert.match(
    guideMarkdown(observed),
    /## Tools to buy[\s\S]*\$123.45 observed estimate/,
  );
  assert.match(retailerHandoff(observed), /## Tools to buy/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(observed))).supplies,
    observed.supplies,
  );
  assert.throws(
    () =>
      recordSupplyInventory(observed, {
        ...snapshot,
        retailerProductId: "203740647",
        url: "https://www.homedepot.com/p/203740647",
      }),
    /exact supply/,
  );
});

test("every sample offers exact shopping options for measurement, square, workholding and eye protection without inferring purchases", () => {
  const available = supplyProducts("home-depot", "tools");
  assert.equal(available.length, 15);
  for (const name of [
    "greenhouse",
    "sauna",
    "storage-banquette",
    "shelves",
    "closet-insert",
  ]) {
    const example = projectSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            `../public/examples/builds/${name}.yardwork.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    const reviewed = {
      ...example,
      toolSelections: [
        {
          productId: "dewalt-dwht38125s",
          checkedAt: new Date(at).toISOString(),
        },
      ],
    };
    const requirements = toolChecklist(
      reviewed,
      selectedToolsForProject(reviewed).tools,
    ).requirements;
    for (const capability of [
      "measure",
      "square",
      "clamp",
      "ppe-eye",
    ] as const) {
      assert.ok(
        requirements.some((row) => row.capability === capability),
        `${name} ${capability}`,
      );
      assert.ok(
        available.some((product) => product.capabilities.includes(capability)),
        `${capability} purchase reference`,
      );
    }
    assert.equal(
      supplyRows(reviewed).some((row) => row.isTool),
      false,
    );
    assert.equal(
      homeDepotShoppingList(reviewed).items.some((row) => row.isTool),
      false,
    );
  }
});

test("eye and hearing protection keep their exact purchase units and separate evidence scopes", () => {
  const base = projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/builds/shelves.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const goggles = "dewalt-dpg82-11c",
    earmuff = "3m-90565-4dc-ps";
  const chosen = addSupply(addSupply(base, goggles, 1), earmuff, 1);
  const initial = toolChecklist(
    chosen,
    selectedToolsForProject(chosen).tools,
  ).requirements;
  assert.equal(
    initial.find((row) => row.capability === "ppe-eye")?.status,
    "unknown",
  );
  assert.equal(
    initial.find((row) => row.capability === "ppe-hearing")?.status,
    "unknown",
  );

  const reviewed = {
    ...chosen,
    toolSelections: [goggles, earmuff].map((productId) => ({
      productId,
      checkedAt: new Date(at).toISOString(),
    })),
  };
  const tools = selectedToolsForProject(reviewed).tools;
  assert.deepEqual(
    tools.map((tool) => tool.capabilities),
    [["ppe-eye"], ["ppe-hearing"]],
  );
  const requirements = toolChecklist(reviewed, tools).requirements;
  assert.equal(
    requirements.find((row) => row.capability === "ppe-eye")?.status,
    "supported",
  );
  assert.equal(
    requirements.find((row) => row.capability === "ppe-hearing")?.status,
    "supported",
  );
  assert.equal(
    requirements.find((row) => row.capability === "ppe-dust")?.status,
    "unknown",
  );
  const list = homeDepotShoppingList(reviewed);
  assert.match(list.text, /^1 pair .*#202220499$/m);
  assert.match(list.text, /^1 earmuff .*#301277013$/m);
  assert.ok(
    list.items
      .filter((item) => item.isTool)
      .every((item) => item.snapshot === null),
  );
});
test("older projects default supply records and observations without changing geometry", () => {
  const raw = { ...project(), supplies: undefined, supplyInventory: undefined };
  const p = projectSchema.parse(raw);
  assert.deepEqual(p.supplies, []);
  assert.deepEqual(p.supplyInventory, []);
  assert.deepEqual(p.pieces, raw.pieces);
});
test("saved supply quantities and IDs are strict while unknown reference identities remain reviewable", () => {
  for (const quantity of [0, -1, 1.5, 100001, Infinity])
    assert.equal(
      supplySelectionSchema.safeParse({ id: uid(), productId: hinge, quantity })
        .success,
      false,
    );
  const unknown = {
    id: uid(),
    productId: "future-hinge",
    quantity: 2,
    purpose: "Seat 3",
    note: "Keep for review",
  };
  const p = projectSchema.parse({ ...project(), supplies: [unknown] });
  assert.equal(supplyRows(p)[0].unresolved, true);
  assert.equal(supplyRows(p)[0].total, null);
  assert.equal(supplyRows(p)[0].selections[0].note, "Keep for review");
  assert.equal(
    projectSchema.safeParse({ ...p, supplies: [unknown, unknown] }).success,
    false,
  );
});
test("adding supplies only changes purchase records and aggregates purchase packs once", () => {
  const old = project(),
    first = addSupply(old, hinge, 2, "Front seats"),
    next = addSupply(
      first,
      hinge,
      1,
      "Return seat",
      "Check mounting clearance",
    );
  assert.equal(old.supplies.length, 0);
  assert.deepEqual(next.pieces, old.pieces);
  assert.deepEqual(next.joints, old.joints);
  assert.equal(supplyRows(next)[0].quantity, 3);
  assert.equal(supplyRows(next)[0].selections.length, 2);
  assert.throws(
    () => addSupply(old, "missing-reference", 1),
    /reviewed supply/,
  );
  assert.throws(
    () => addSupply({ ...old, retailer: "lowes" }, hinge, 1),
    /reviewed supply/,
  );
});
test("the Home Depot clipboard keeps exact hardware quantities while store snapshots follow the active store", () => {
  const p = recordSupplyInventory(
    addSupply(project(), hinge, 4),
    observation(),
  );
  const result = homeDepotShoppingList(p);
  assert.equal(result.items[0].quantity, 4);
  assert.equal(result.items[0].productId, "314150989");
  assert.equal(result.items[0].snapshot?.available, 3);
  assert.match(result.text, /^4 .* — Internet #314150989$/);
  const changed = homeDepotShoppingList({ ...p, store: "different" });
  assert.equal(changed.text, result.text);
  assert.equal(changed.items[0].snapshot, null);
});
test("heterogeneous tape kits and sockets retain distinct contents instead of dividing quantities", () => {
  let p = addSupply(project(), "sunlite-92763", 3);
  p = addSupply(p, "everbilt-eh-wsthdus-311v", 2);
  const rows = supplyRows(p);
  assert.equal(rows[0].quantity, 3);
  assert.equal(rows[0].purchaseUnit, "top/bottom tape kit");
  assert.equal(rows[0].contents.length, 2);
  assert.match(rows[0].contents[0].name, /nonvented top/);
  assert.match(rows[0].contents[1].name, /vented bottom/);
  assert.equal(rows[1].quantity, 2);
  assert.deepEqual(
    rows[1].contents.map((c) => c.name),
    ["open-lip socket", "closed-lip socket"],
  );
});
test("known screw boxes can be purchased without inventing fastener placement geometry", () => {
  const p = addSupply(project(), "grk-r4-103101", 2),
    row = supplyRows(p)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.contents[0].quantity, 100);
  assert.match(row.contents[0].name, /T25/);
  assert.equal(p.pieces.length, 0);
  assert.equal(p.joints.length, 0);
});
test("fresh exact store snapshots price purchase packs and show quantity shortfalls", () => {
  const p = recordSupplyInventory(
    addSupply(project(), hinge, 4),
    observation(),
  );
  const row = supplyRows(p, at)[0];
  assert.equal(row.quantity, 4);
  assert.equal(row.total, 79.8);
  assert.equal(row.inventory?.available, 3);
  assert.ok(row.issues.some((i) => /Snapshot quantity short/.test(i)));
  assert.equal(
    row.requirements.some((r) => /lid support/.test(r)),
    true,
  );
});
test("supply snapshots reject wrong retailer, product number, URL identity and caller approval flags", () => {
  const p = project(),
    good = observation();
  for (const input of [
    { ...good, retailerProductId: "314150990" },
    { ...good, url: "https://www.homedepot.com/p/314150990" },
    { ...good, url: "https://evil.example/p/314150989" },
    { ...good, retailer: "lowes" },
    { ...good, url: "https://www.homedepot.com/s/314150989" },
    { ...good, verified: true },
    { ...good, productId: "future-reference" },
  ])
    assert.throws(() => recordSupplyInventory(p, input));
  assert.equal(
    supplyInventorySchema.safeParse({ ...good, price: -1 }).success,
    false,
  );
  assert.equal(
    supplyInventorySchema.safeParse({ ...good, available: 1.5 }).success,
    false,
  );
});
test("stale, future, cross-store and cross-retailer observations never enter estimates", () => {
  const p = recordSupplyInventory(
    addSupply(project(), hinge, 1),
    observation(),
  );
  for (const changed of [
    { ...p, store: "other" },
    { ...p, zip: "84000" },
    { ...p, retailer: "lowes" as const },
  ]) {
    assert.equal(supplyRows(changed, at)[0].total, null);
    assert.equal(changed.supplyInventory.length, 1);
  }
  assert.equal(supplyRows(p, at + 86400001)[0].total, null);
  assert.equal(supplyRows(p, at - 1)[0].total, null);
});
test("observation replacement retains other stores and snapshot imports validate every exact offer", () => {
  let p = recordSupplyInventory(project(), observation());
  p = recordSupplyInventory(p, { ...observation(), store: "second" });
  p = recordSupplyInventory(p, { ...observation(), price: 17 });
  assert.equal(p.supplyInventory.length, 2);
  assert.equal(p.supplyInventory.find((x) => x.store === "4401")?.price, 17);
  assert.equal(parseSupplyInventory(JSON.stringify([observation()])).length, 1);
  assert.throws(() =>
    parseSupplyInventory(
      JSON.stringify([
        observation(),
        { ...observation(), retailerProductId: "000000" },
      ]),
    ),
  );
});
test("newest observations compare actual times across different ISO fractional precision", () => {
  const base = Math.floor(at / 1000) * 1000;
  const old = {
    ...observation(),
    checkedAt: new Date(base).toISOString().replace(".000Z", "Z"),
    price: 10,
  };
  const newer = {
    ...observation(),
    checkedAt: new Date(base + 500).toISOString(),
    price: 20,
  };
  const p = {
    ...addSupply(project(), hinge, 1),
    supplyInventory: [old, newer],
  };
  assert.equal(supplyRows(p, base + 900)[0].inventory?.price, 20);
});
test("supply Markdown preserves observed-price provenance and keeps user notes on labelled lines", () => {
  const p = recordSupplyInventory(
    addSupply(project(), hinge, 1, "Seat\n## Claim", "[review](example)"),
    observation(),
  );
  const md = suppliesMarkdown(p);
  assert.match(
    md,
    /User-recorded snapshot: \$19.95 per purchase pack; 3 available at store 4401, ZIP 84121/,
  );
  assert.ok(md.includes(observation().checkedAt));
  assert.equal(md.includes("\n## Claim"), false);
  assert.ok(md.includes("\\[review\\]"));
});
test("retailer changes preserve selections and disclose seller, missing offers and source requirements", () => {
  const p = addSupply(
    { ...project(), retailer: "lowes" },
    "national-n208-637-lid-support",
    2,
  );
  assert.match(supplyRows(p)[0].offer?.seller ?? "", /Max Warehouse/);
  assert.equal(supplyRows(p)[0].storeSnapshotEligible, false);
  assert.throws(
    () =>
      recordSupplyInventory(p, {
        ...observation(),
        productId: "national-n208-637-lid-support",
        retailer: "lowes",
        retailerProductId: "105225082",
        url: "https://www.lowes.com/pd/National-Hardware-Brass-Plated-Steel-Friction-Lid-Support-6-in-1-pk/105225082",
      }),
    /marketplace reference/,
  );
  const changed = { ...p, retailer: "home-depot" as const };
  assert.equal(supplyRows(changed)[0].unresolved, true);
  assert.match(
    suppliesMarkdown(changed),
    /No current reviewed Home Depot offer/,
  );
  assert.ok(
    supplyProducts("home-depot").every((x) =>
      x.offers.some(
        (o) => o.retailer === "home-depot" && o.listingStatus === "reference",
      ),
    ),
  );
});
test("supply notes, exact packs and requirements survive JSON and all purchasing/guide handoffs", () => {
  const p = projectSchema.parse(
    JSON.parse(
      JSON.stringify(
        addSupply(project(), hinge, 3, "Three seats", "Check rear access"),
      ),
    ),
  );
  const text = retailerHandoff(p),
    csv = shoppingCsv(p),
    md = guideMarkdown(p);
  for (const output of [text, csv, md]) {
    assert.match(output, /314150989/);
    assert.match(output, /Check rear access/);
  }
  assert.match(text, /3.*hinge/);
  assert.match(csv, /UNPRICED/);
  assert.match(md, /Hardware and supplies to purchase/);
  assert.equal(p.pieces.length, 0);
  assert.equal(p.joints.length, 0);
});
