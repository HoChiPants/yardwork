import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  blank,
  catalog,
  inventorySchema,
  material,
  moduleRecipeSchema,
  part,
  projectSchema,
  uid,
  type MaterialId,
  type Project,
} from "../src/model";
import { bom, cutPiece, inspectCutStock, usableInventory } from "../src/engine";
import {
  checkProductBinding,
  findRetailerProduct,
  referenceOffersForProduct,
  retailerCatalog,
  retailerProductSchema,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";
import { stockAxes } from "../src/stockAxes";
import { moduleSchema, type PlanModule } from "../src/planSchema";
import { recipeParts } from "../src/ideaGeometry";
import {
  buildCaseworkShelves,
  buildGreenhouse,
  buildSaunaCabin,
  structureMaterialChoices,
} from "../src/structures";
import {
  addFastenerLocation,
  changeFastenerProduct,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";

const sheets = [
  {
    id: "hd-purebond-birch-188",
    product: "hd-purebond-birch-188-165891",
    sku: "165891",
    offer: "100092485",
    thickness: 0.188,
  },
  {
    id: "hd-purebond-birch-453",
    product: "hd-purebond-birch-453-833185",
    sku: "833185",
    offer: "100020218",
    thickness: 0.453,
  },
] as const;
const bits = [
  {
    id: "grk-187443-t25-bits",
    mpn: "187443",
    drive: "T25",
    cap: "drive-t25",
    hd: "202349118",
    hdModel: "772691874436",
    lowes: "50303273",
    lowesModel: "187443.0",
    product: "grk-r4-103101",
  },
  {
    id: "grk-187427-t15-bits",
    mpn: "187427",
    drive: "T15",
    cap: "drive-t15",
    hd: "202349116",
    hdModel: "772691874276",
    lowes: "50303267",
    lowesModel: "187427.0",
    product: "grk-cabinet-113079",
  },
] as const;
const now = Date.parse("2026-11-18T12:00:00Z"),
  checkedAt = "2026-11-17T11:32:24Z";
function digest(value: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
            )
          : item,
      ),
    )
    .digest("hex");
}
function moduleFor(
  panelMaterial: MaterialId,
  kind: PlanModule["kind"] = "bench",
): PlanModule {
  return {
    kind,
    name: "Manual-only panel is not an automatic seat",
    width: 24,
    height: kind === "panel" ? material(panelMaterial).size[1] : 18,
    depth: 24,
    position: [0, 0, 0],
    yaw: 0,
    frameMaterial: "stud",
    panelMaterial,
    backHeight: 0,
    levels: 2,
    storage: false,
    openingLid: false,
    lidOpen: false,
  };
}
function screwFixture(productId: "grk-r4-103101" | "grk-cabinet-113079") {
  let p = blank("SYNTHETIC exact drive accessory review");
  p.pieces = [
    part(
      "Head",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, 0],
      p.steps[0].id,
      "",
    ),
    part(
      "Receiver",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, -0.953],
      p.steps[0].id,
      "",
    ),
  ];
  const plan = addFastenerLocation(
    makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id, { productId }),
  );
  plan.locations[0].entranceLocal = [0, 0, 0.3515];
  plan.locations[0].driveLocal = [0, 0, -1];
  // Product drive is known even while actual installation/pilot dimensions remain unknown.
  p = saveFastenerPlan(p, plan);
  assert.equal(fastenerReviews(p, now)[0].activePointCount, 1);
  return p;
}
function checklist(p: Project, selected: string[] = []) {
  const next = {
    ...p,
    toolSelections: selected.map((productId) => ({ productId, checkedAt })),
  };
  return toolChecklist(next, selectedToolsForProject(next, now).tools, now);
}

test("all original32 stock definitions and44 reviewed/candidate records remain deep-exact", () => {
  const baseline = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/common-interior-products-baseline.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { materials: Record<string, string>; products: Record<string, string> };
  assert.equal(Object.keys(baseline.materials).length, 32);
  assert.equal(Object.keys(baseline.products).length, 44);
  for (const [id, hash] of Object.entries(baseline.materials))
    assert.equal(digest(catalog.find((row) => row.id === id)), hash, id);
  for (const [id, hash] of Object.entries(baseline.products))
    assert.equal(digest(findRetailerProduct(id)), hash, id);
  assert.deepEqual(
    catalog.slice(0, 32).map((m) => m.id),
    Object.keys(baseline.materials),
  );
  assert.deepEqual(
    retailerCatalog.slice(0, 44).map((p) => p.id),
    Object.keys(baseline.products),
  );
  assert.equal(catalog.length, 77);
  assert.equal(retailerCatalog.length, 151);
  assert.equal(
    retailerCatalog.reduce((n, p) => n + p.offers.length, 0),
    169,
  );
  assert.equal(retailerCatalog.filter((p) => p.category === "tool").length, 25);
});

test("thin sheets bind exact actual dimensions and per-sheet retailer units without invented manufacturer identities or roles", () => {
  for (const row of sheets) {
    const m = material(row.id),
      product = findRetailerProduct(row.product)!;
    assert.ok(product);
    assert.equal(retailerProductSchema.safeParse(product).success, true);
    assert.equal(product.identityBasis, "retailer-specification");
    assert.equal(product.manufacturerPartNumber, null);
    assert.deepEqual(m.size, [48, row.thickness, 96]);
    assert.deepEqual(product.profile.stockSize, m.size);
    assert.equal(m.placementOnly, true);
    assert.equal(m.wood, true);
    assert.equal(m.cuttable, true);
    assert.equal(m.packCount, 1);
    assert.equal(product.profile.packCount, 1);
    assert.equal(m.unit, "sheet");
    assert.equal(m.priceKind, "unpriced");
    assert.equal(m.price, 0);
    assert.deepEqual(product.roleQualifications, []);
    assert.equal(checkProductBinding(m, product).compatible, true);
    assert.equal(
      checkProductBinding({ ...m, size: [48, 0.25, 96] }, product).compatible,
      false,
    );
    assert.equal(
      reviewedOfferForMaterial(m, "home-depot")?.productId,
      row.offer,
    );
    assert.equal(reviewedOfferForMaterial(m, "lowes"), null);
    assert.deepEqual(
      referenceOffersForProduct(product).map((o) => [
        o.retailer,
        o.retailerModel,
        o.retailerItemNumber,
      ]),
      [["home-depot", row.sku, row.sku]],
    );
    assert.match(
      product.sources.map((s) => s.note).join(" "),
      /actual|retailer/i,
    );
    assert.match(product.sources.map((s) => s.note).join(" "), /11\/13|2013/);
    assert.match(
      product.sources.map((s) => s.note).join(" "),
      /package.quantity|package.count/i,
    );
  }
});

test("rotated thin sheets retain grain and both cut remnants count one physical source, while an independent sheet adds one", () => {
  for (const row of sheets) {
    const p = blank("SYNTHETIC panel cut source"),
      m = material(row.id),
      board = part(
        "Manual interior panel",
        row.id,
        [...m.size],
        [0, 20, 0],
        p.steps[0].id,
        "Manual",
        [0.2, 0.5, 0.3],
      );
    board.stockLengthAxis = 2;
    p.pieces = [board];
    assert.deepEqual(stockAxes(board), { length: 2, width: 0, thickness: 1 });
    const cut = cutPiece(cutPiece(p, board.id, 60, 2), board.id, 20, 0),
      restored = projectSchema.parse(JSON.parse(JSON.stringify(cut)));
    assert.equal(restored.pieces.length, 3);
    assert.deepEqual(restored.pieces[0].size, [20, row.thickness, 60]);
    assert.deepEqual(restored.pieces[0].rotation, board.rotation);
    assert.equal(inspectCutStock(restored).valid.size, 1);
    assert.equal(bom(restored)[0].physicalStockUnits, 1);
    assert.equal(bom(restored)[0].quantity, 1);
    assert.equal(bom(restored)[0].packCount, 1);
    assert.deepEqual(p.pieces[0].size, m.size);
    restored.pieces.push(
      part(
        "Independent sheet",
        row.id,
        [...m.size],
        [150, 20, 0],
        p.steps[0].id,
        "Manual",
      ),
    );
    assert.equal(bom(restored)[0].quantity, 2);
  }
});

test("exact synthetic per-sheet snapshots survive import, reject another SKU and stop pricing after retailer switch", () => {
  for (const row of sheets) {
    const p = blank("SYNTHETIC one-sheet snapshot"),
      m = material(row.id);
    p.store = "synthetic-sheet-store";
    p.pieces = [
      part(
        "Manual panel",
        row.id,
        [...m.size],
        [0, 20, 0],
        p.steps[0].id,
        "Manual",
      ),
    ];
    const observation = {
      material: row.id,
      retailer: "home-depot" as const,
      internetNumber: row.offer,
      name: "SYNTHETIC per-sheet observation",
      price: 17,
      available: 2,
      store: p.store,
      zip: p.zip,
      checkedAt: new Date().toISOString(),
      url: reviewedOfferForMaterial(m, "home-depot")!.url,
    };
    p.inventory = [inventorySchema.parse(observation)];
    assert.equal(
      inventorySchema.safeParse({
        ...observation,
        internetNumber: "100061386",
        url: "https://www.homedepot.com/p/100061386",
      }).success,
      false,
    );
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    assert.equal(usableInventory(restored, row.id)?.internetNumber, row.offer);
    assert.equal(bom(restored)[0].total, 17);
    assert.equal(bom(restored)[0].verified, true);
    restored.retailer = "lowes";
    assert.equal(usableInventory(restored, row.id), undefined);
    assert.equal(bom(restored)[0].unpriced, true);
    assert.equal(restored.inventory.length, 1);
  }
});

test("manual thin stock cannot become automatic seats, casework or specialist structure stock; standalone panel and raw historical recipes remain readable", () => {
  for (const row of sheets) {
    for (const kind of [
      "bench",
      "workbench",
      "cabinet",
      "shelf",
      "frame",
    ] as const) {
      const module = moduleFor(row.id, kind);
      assert.equal(moduleSchema.safeParse(module).success, false, kind);
      assert.throws(
        () => recipeParts(module, uid(), "No automatic thin seat"),
        /manual placement/,
      );
      assert.equal(
        moduleRecipeSchema.safeParse(module).success,
        true,
        "Stored recipe schema remains readable without rebuilding",
      );
    }
    const p = blank("Historical manual geometry"),
      module = moduleFor(row.id, "panel");
    assert.equal(moduleSchema.safeParse(module).success, true);
    p.pieces = recipeParts(module, p.steps[0].id, "Standalone panel");
    // Reading a saved recipe is separate from asking the generator to rebuild it.
    p.sections.push({
      id: uid(),
      name: "Imported manual section",
      pieceIds: [p.pieces[0].id],
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      generator: null,
      recipe: moduleFor(row.id, "bench"),
    });
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(reopened.sections, p.sections);
    assert.deepEqual(reopened.pieces, p.pieces);
    assert.equal(p.pieces.length, 1);
    assert.equal(
      projectSchema.parse(JSON.parse(JSON.stringify(p))).pieces[0].material,
      row.id,
    );
    for (const role of [
      "caseworkPanels",
      "frameLumber",
      "saunaInterior",
      "saunaBenchFrame",
    ] as const)
      assert.equal(
        structureMaterialChoices(role).some((c) => c.materialId === row.id),
        false,
      );
    for (const productRegistryRef of [row.product, "unknown-reference"]) {
      const selection = {
        caseworkPanels: { materialId: row.id, productRegistryRef },
      };
      assert.throws(
        () =>
          buildCaseworkShelves(
            blank(),
            { width: 36, depth: 16, height: 72 },
            selection,
          ),
        /individual placement/,
      );
      assert.throws(
        () =>
          buildGreenhouse(
            blank(),
            { width: 72, depth: 96, eaveHeight: 84, roofRise: 24 },
            { greenhouseGlazing: selection.caseworkPanels },
          ),
        /individual placement/,
      );
      assert.throws(
        () =>
          buildSaunaCabin(
            blank(),
            { clearWidth: 72, clearDepth: 72, clearHeight: 84 },
            { saunaInterior: selection.caseworkPanels },
          ),
        /individual placement/,
      );
    }
  }
});

test("exact two-bit cards preserve manufacturer/retailer identities, narrow source-backed capability and unknown body/access fit", () => {
  for (const row of bits) {
    const p = findRetailerProduct(row.id)!;
    assert.ok(p);
    assert.equal(p.manufacturerPartNumber, row.mpn);
    assert.equal(p.profile.packCount, 2);
    assert.equal(p.profile.stockSize, null);
    assert.equal(p.profile.dimensionMeaning, "unverified");
    assert.deepEqual(p.capabilities, [row.cap]);
    assert.deepEqual(
      p.offers.map((o) => [o.productId, o.retailerModel]),
      [
        [row.hd, row.hdModel],
        [row.lowes, row.lowesModel],
      ],
    );
    assert.ok(
      p.toolCapabilityEvidence.every((e) =>
        e.sourceRefs.every((url) => p.sources.some((s) => s.url === url)),
      ),
    );
    assert.match(p.discrepancies.join(" "), /T15|T25/);
    assert.match(p.discrepancies.join(" "), /shank|diameter/i);
    assert.equal("price" in p, false);
    assert.equal("available" in p, false);
  }
});

test("current explicit W product requires the matching drive accessory, separately from driver and drilling function, without material or supply purchases", () => {
  for (const row of bits) {
    const p = screwFixture(row.product),
      before = JSON.stringify(p),
      oldBom = bom(p),
      oldSupplies = structuredClone(p.supplies);
    const bare = checklist(p).requirements.find(
      (r) => r.capability === row.cap,
    )!;
    assert.ok(bare);
    assert.equal(bare.status, "unknown");
    assert.equal(bare.necessity, "conditional");
    assert.equal(bare.sources[0].id, p.fastenerPlans[0].id);
    const withBit = checklist(p, [row.id]);
    assert.equal(
      withBit.requirements.find((r) => r.capability === row.cap)?.status,
      "supported",
    );
    assert.equal(
      withBit.requirements.find((r) => r.capability === "drive-screw")?.status,
      "unknown",
    );
    assert.equal(
      withBit.requirements.find((r) => r.capability === "drill-pilot")?.status,
      "unknown",
    );
    assert.equal(
      checklist(p, ["dewalt-dcd771c2"]).requirements.find(
        (r) => r.capability === row.cap,
      )?.status,
      "unknown",
    );
    assert.equal(
      checklist(p, [row.id, "dewalt-dcd771c2"]).requirements.find(
        (r) => r.capability === "drive-screw",
      )?.status,
      "supported",
    );
    assert.equal(
      checklist(p, [bits.find((b) => b.id !== row.id)!.id]).requirements.find(
        (r) => r.capability === row.cap,
      )?.status,
      "unknown",
    );
    assert.equal(JSON.stringify(p), before);
    assert.deepEqual(bom(p), oldBom);
    assert.deepEqual(p.supplies, oldSupplies);
    const selected = {
        ...p,
        toolSelections: [{ productId: row.id, checkedAt }],
      },
      restored = projectSchema.parse(JSON.parse(JSON.stringify(selected)));
    assert.deepEqual(bom(restored), oldBom);
    assert.match(toolGuideMarkdown(restored, now), new RegExp(row.mpn));
    assert.match(bare.review, /access|reach|fit/);
  }
});

test("stale, missing, empty, conflicted, unknown products and old source/history never become current drive-bit requirements", () => {
  const p = screwFixture("grk-r4-103101");
  for (const variant of [
    "stale",
    "missing",
    "empty",
    "conflict",
    "unknown",
    "revision",
  ] as const) {
    const q = structuredClone(p),
      plan = q.fastenerPlans[0];
    if (variant === "stale") q.pieces[0].size[0] -= 0.1;
    if (variant === "missing") q.pieces.pop();
    if (variant === "empty") plan.locations = [];
    if (variant === "conflict") plan.locations[0].driveLocal = [0, 0, 1];
    if (variant === "unknown")
      plan.productId = "unknown" as typeof plan.productId;
    if (variant === "revision")
      plan.productEvidenceRevision = "old-unreviewed-revision";
    assert.equal(
      checklist(q).requirements.some(
        (r) => r.capability === "drive-t25" || r.capability === "drive-t15",
      ),
      false,
      variant,
    );
  }
  const mixed = structuredClone(p);
  let plan = addFastenerLocation(mixed.fastenerPlans[0]);
  plan.locations[1].entranceLocal = [7, 0, 0.3515];
  plan.locations[1].driveLocal = [0, 0, -1];
  const saved = saveFastenerPlan(mixed, plan);
  assert.equal(fastenerReviews(saved, now)[0].state, "conflict");
  assert.equal(fastenerReviews(saved, now)[0].activePointCount, 1);
  assert.ok(
    checklist(saved).requirements.some((r) => r.capability === "drive-t25"),
  );
  assert.equal(
    selectedToolsForProject(
      {
        ...p,
        toolSelections: [
          { productId: bits[0].id, checkedAt: "2099-01-01T00:00:00Z" },
        ],
      },
      now,
    ).tools[0].checked,
    false,
  );
});

test("explicit product replacement follows the current drive and retains historical products without activating them", () => {
  let p = screwFixture("grk-r4-103101");
  p = saveFastenerPlan(
    p,
    changeFastenerProduct(p, p.fastenerPlans[0], "grk-cabinet-113079"),
  );
  assert.ok(
    p.fastenerPlans[0].referenceHistory.some(
      (r) => r.previous.productId === "grk-r4-103101",
    ),
  );
  assert.equal(
    checklist(p).requirements.some((r) => r.capability === "drive-t25"),
    false,
  );
  assert.equal(
    checklist(p).requirements.some((r) => r.capability === "drive-t15"),
    true,
  );
  const beforeHistory = structuredClone(p.fastenerPlans[0].referenceHistory);
  p.fastenerPlans[0].locations = [];
  assert.equal(
    checklist(p).requirements.some(
      (r) => r.capability === "drive-t25" || r.capability === "drive-t15",
    ),
    false,
  );
  assert.deepEqual(p.fastenerPlans[0].referenceHistory, beforeHistory);
});
