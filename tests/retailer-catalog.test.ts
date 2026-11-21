import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part, projectSchema, type MaterialId, type V3 } from "../src/model";
import { bom, cutPiece, guideMarkdown } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { groupedMaterials } from "../src/materialGroups";
import {
  retailerCatalog,
  retailerCatalogSchema,
  retailerOfferSchema,
  catalogSourceSchema,
  findRetailerProduct,
  checkProductBinding,
  generatedStockAllows,
  reviewedOfferForMaterial,
  shoppingOfferForMaterial,
} from "../src/retailerCatalog";

test("ground-contact boards bind real stock dimensions and selling units in two palette families", () => {
  const expected: [MaterialId, string, string, string, V3][] = [
    ["hd-treated-2x4-8", "206967725", "253906", "1001802203", [1.5, 3.5, 96]],
    ["hd-treated-2x4-10", "206967803", "253920", "1001753748", [1.5, 3.5, 120]],
    ["hd-treated-2x4-12", "206967813", "253920", "1001753827", [1.5, 3.5, 144]],
    ["hd-treated-2x6-8", "206952301", "17464-08", "1001765212", [1.5, 5.5, 96]],
    ["hd-treated-2x6-10", "206967800", "253921", "1001753906", [1.5, 5.5, 120]],
    ["hd-treated-2x6-12", "206949899", "17464-12", "1001765217", [1.5, 5.5, 144]],
  ];
  for (const [id, internetNumber, model, sku, actual] of expected) {
    const stock = material(id);
    const product = findRetailerProduct(stock.productReference!)!;
    assert.deepEqual(stock.size, actual, id);
    assert.equal(stock.placementOnly, true, id);
    assert.equal(stock.priceKind, "unpriced", id);
    assert.ok(checkProductBinding(stock, product).compatible, id);
    assert.equal(product.purchaseSpec?.kind, "counted");
    assert.equal(product.profile.packCount, 1, id);
    assert.equal(product.offers.length, 1, id);
    const offer = reviewedOfferForMaterial(stock, "home-depot");
    assert.deepEqual(
      [offer?.productId, offer?.retailerModel, offer?.retailerItemNumber],
      [internetNumber, model, sku],
      id,
    );
    assert.equal(generatedStockAllows(stock, "frameLumber"), false, id);
    assert.equal(generatedStockAllows(stock, "ridgeLumber"), false, id);
  }
  const groups = groupedMaterials("Lumber");
  for (const width of [4, 6]) {
    const group = groups.find(({ name }) => name === `Ground-contact 2 × ${width}`)!;
    assert.equal(group.preferred, `hd-treated-2x${width}-8`);
    assert.deepEqual(group.variants.filter(({ productReference }) => productReference).map(({ size }) => size[2]), [96, 120, 144]);
  }
});

test("cut ground-contact stock retains its exact length SKU and only uses a matching store observation", () => {
  const initial = blank("Entry rail stock");
  const stock = material("hd-treated-2x4-12");
  const board = part("Entry rail", stock.id, [...stock.size], [0, 2, 0], initial.steps[0].id, "Exterior");
  initial.pieces = [board];
  initial.store = "4409";
  const cut = cutPiece(initial, board.id, 108);
  assert.deepEqual(cut.pieces.map(({ material, size }) => [material, size]), [
    [stock.id, [1.5, 3.5, 108]],
    [stock.id, [1.5, 3.5, 35.875]],
  ]);
  const reply = homeDepotShoppingList(cut);
  assert.equal(bom(cut)[0].physicalStockUnits, 1);
  assert.equal(reply.items[0].quantity, 1);
  assert.equal(reply.items[0].productId, "206967813");
  assert.ok(!reply.items[0].snapshot);
  const observation = {
    material: stock.id,
    name: stock.name,
    price: 19,
    available: 2,
    store: cut.store!,
    zip: cut.zip,
    checkedAt: new Date().toISOString(),
  };
  const wrong = {
    ...cut, inventory: [{ ...observation, internetNumber: "206967803", url: "https://www.homedepot.com/p/206967803" }],
  };
  assert.ok(!homeDepotShoppingList(wrong).items[0].snapshot);
  const exact = {
    ...cut, inventory: [{ ...observation, internetNumber: "206967813", url: "https://www.homedepot.com/p/206967813" }],
  };
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(exact)));
  assert.equal(homeDepotShoppingList(reopened).items[0].snapshot?.available, 2);
  assert.match(guideMarkdown(reopened), /Internet #206967813/);
  assert.equal(projectSchema.parse({ ...initial, schemaVersion: 76, pieces: [] }).id, initial.id);
});

test("curated products retain exact retailer IDs, reviewed sources and separate pack identity", () => {
  const checked = retailerCatalogSchema.parse(retailerCatalog);
  assert.ok(checked.length >= 8);
  const screws = findRetailerProduct("simpson-sd9112r100")!;
  assert.equal(screws.manufacturerPartNumber, "SD9112R100");
  assert.equal(screws.profile.packCount, 100);
  assert.equal(screws.profile.shankDiameter, 0.13);
  assert.equal(screws.profile.headDiameter, 0.37);
  assert.deepEqual(
    screws.offers.map((o) => [o.retailer, o.productId, o.retailerItemNumber]),
    [
      ["home-depot", "202071152", "477314"],
      ["lowes", "3242494", "130014"],
    ],
  );
  assert.ok(
    screws.sources.some((s) => new URL(s.url).hostname === "www.strongtie.com"),
  );
  for (const product of checked) {
    assert.ok(Date.parse(product.verifiedAt) <= Date.now());
    assert.ok(
      product.sources.every((s) => Date.parse(s.verifiedAt) <= Date.now()),
    );
    assert.equal("available" in product, false);
    assert.equal("price" in product, false);
    assert.equal("store" in product, false);
  }
});
test("retailer URLs cannot cross identities, use lookalike domains or embed credentials", () => {
  const offer = findRetailerProduct("simpson-a21z")!.offers[0];
  for (const url of [
    "not a URL",
    "https://%",
    "https://www.homedepot.com.evil.example/p/100375047",
    "https://www.lowes.com/pd/item/100375047",
    "https://www.homedepot.com/p/100374951",
    "http://www.homedepot.com/p/100375047",
    "https://token@www.homedepot.com/p/100375047",
    "https://www.homedepot.com:444/p/100375047",
    "https://www.homedepot.com/b/100375047",
  ])
    assert.equal(
      retailerOfferSchema.safeParse({ ...offer, url }).success,
      false,
      url,
    );
  assert.equal(
    retailerOfferSchema.safeParse({ ...offer, available: 100 }).success,
    false,
  );
  assert.equal(
    catalogSourceSchema.safeParse({
      ...findRetailerProduct("simpson-a21z")!.sources[0],
      url: "https://unreviewed.example/spec",
    }).success,
    false,
  );
});
test("similar generic hardware is not silently bound to different real geometry", () => {
  const screws = findRetailerProduct("simpson-sd9112r100")!;
  const result = checkProductBinding(material("connector-screw"), screws);
  assert.equal(result.compatible, false);
  assert.match(result.issues.join(" "), /dimensions differ/);
  assert.equal(result.requiresConfirmation, true);
  const matching = checkProductBinding(
    { ...material("connector-screw"), size: [0.37, 1.5, 0.37] },
    screws,
  );
  assert.equal(matching.compatible, true);
  assert.equal(matching.requiresConfirmation, true);
  assert.match(
    matching.note,
    /does not assert availability or structural capacity/,
  );
  assert.equal(
    checkProductBinding(
      {
        ...material("connector-screw"),
        size: [0.37, 1.5, 0.37],
        packCount: 500,
      },
      screws,
    ).compatible,
    false,
  );
  assert.equal(
    checkProductBinding(
      material("bracket"),
      findRetailerProduct("simpson-a21z")!,
    ).compatible,
    false,
  );
});
test("regional lumber and retired counterpart offers remain explicit candidates", () => {
  const stud = findRetailerProduct("regional-stud-2x4x96")!;
  assert.equal(stud.status, "candidate");
  assert.equal(stud.manufacturerPartNumber, null);
  assert.equal(stud.profile.packCount, null);
  assert.equal(checkProductBinding(material("stud"), stud).compatible, false);
  const panel = findRetailerProduct("plytanium-bc-201428")!;
  assert.deepEqual(panel.profile.stockSize, [47.938, 0.703, 95.938]);
  assert.equal(
    panel.offers.find((o) => o.retailer === "lowes")!.listingStatus,
    "retired",
  );
  assert.equal(
    checkProductBinding(material("plywood"), panel).compatible,
    false,
  );
});
test("Home Depot regional framing listings match full-length board stock and stay separate from pinned products", () => {
  for (const [id, productId] of [
    ["stud", "338861827"],
    ["stud-10", "100077951"],
    ["stud-12", "312528815"],
    ["two-six", "100083274"],
    ["two-eight", "100049292"],
  ] as const) {
    const stock = material(id);
    const reference = shoppingOfferForMaterial(stock, "home-depot");
    assert.equal(reference?.offer.productId, productId);
    assert.equal(reference?.suggested, true);
    assert.equal(reviewedOfferForMaterial(stock, "home-depot"), null);
    assert.equal(
      shoppingOfferForMaterial(
        { ...stock, size: [1.5, 92.625, stock.size[2]] },
        "home-depot",
      ),
      null,
    );
  }
  assert.equal(
    shoppingOfferForMaterial(material("treated"), "home-depot"),
    null,
  );
});
test("verified tool references provide documented capabilities without consumable/body claims", () => {
  const saw = findRetailerProduct("dewalt-dwe575sb")!;
  const drill = findRetailerProduct("dewalt-dcd771c2")!;
  assert.deepEqual(saw.capabilities, ["wood-crosscut", "wood-rip"]);
  assert.deepEqual(drill.capabilities, ["drill-pilot", "drive-screw"]);
  for (const tool of [saw, drill]) {
    assert.equal(tool.profile.stockKind, "tool");
    assert.equal(tool.profile.stockSize, null);
    assert.ok(tool.sources.some((s) => s.url.includes("/Instruction_Manual/")));
    assert.equal(new Set(tool.offers.map((o) => o.retailer)).size, 2);
    assert.equal(checkProductBinding(material("stud"), tool).compatible, false);
  }
});
test("registry rejects duplicate physical IDs and duplicate retailer offers", () => {
  assert.equal(
    retailerCatalogSchema.safeParse([...retailerCatalog, retailerCatalog[0]])
      .success,
    false,
  );
  const [first, ...rest] = retailerCatalog;
  assert.equal(
    retailerCatalogSchema.safeParse([
      { ...first, offers: [...first.offers, first.offers[0]] },
      ...rest,
    ]).success,
    false,
  );
});
