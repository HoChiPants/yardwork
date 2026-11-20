import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  catalog,
  inventorySchema,
  material,
  materialIds,
  part,
  projectSchema,
  uid,
  type MaterialId,
  type V3,
} from "../src/model";
import { bom, cutPiece, inspectCutStock, usableInventory } from "../src/engine";
import {
  checkProductBinding,
  findRetailerProduct,
  referenceOffersForProduct,
  retailerProductSchema,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";
import { stockAxes, orientedStockSize } from "../src/stockAxes";
import {
  ideaPlanSchema,
  moduleSchema,
  type PlanModule,
} from "../src/planSchema";
import { recipeParts } from "../src/ideaGeometry";
import {
  buildGreenhouse,
  buildSaunaCabin,
  structureMaterialChoices,
} from "../src/structures";

const boards = [
  {
    materialId: "lowes-whitewood-1x6",
    registryId: "lowes-reliabilt-one-six-8-951",
    productId: "1001067086",
    model: "L51344628",
    item: "951",
    size: [0.75, 96, 5.5],
  },
  {
    materialId: "lowes-syp-2x6",
    registryId: "lowes-syp-two-six-8-73600",
    productId: "1000028789",
    model: "37015",
    item: "73600",
    size: [1.5, 96, 5.5],
  },
] as const;

function framing(
  frameMaterial: MaterialId,
  kind: PlanModule["kind"] = "frame",
): PlanModule {
  return {
    kind,
    name: "Manual source stock is not automatically framing",
    width: 48,
    height: 36,
    depth: 24,
    position: [0, 0, 0],
    yaw: 0,
    frameMaterial,
    panelMaterial: "plywood",
    backHeight: 0,
    levels: 2,
    storage: false,
    openingLid: false,
    lidOpen: false,
  };
}

test("two new exact board profiles preserve retailer identity, one-board sell units and unknown OEMs", () => {
  for (const row of boards) {
    const stock = material(row.materialId),
      product = findRetailerProduct(row.registryId)!;
    assert.ok(materialIds.includes(row.materialId));
    assert.equal(catalog.filter((m) => m.id === row.materialId).length, 1);
    assert.equal(retailerProductSchema.safeParse(product).success, true);
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.identityBasis, "retailer-specification");
    assert.match(product.manufacturer, /identity not established/);
    assert.equal(product.manufacturerPartNumber, null);
    assert.equal(stock.productReference, product.id);
    assert.deepEqual(stock.size, row.size);
    assert.deepEqual(product.profile.stockSize, row.size);
    assert.equal(product.profile.dimensionMeaning, "actual-stock");
    assert.equal(product.profile.packCount, 1);
    assert.equal(stock.packCount, 1);
    assert.equal(stock.unit, "board");
    assert.equal(stock.wood, true);
    assert.equal(stock.cuttable, true);
    assert.equal(stock.priceKind, "unpriced");
    assert.equal(stock.price, 0);
    assert.deepEqual(product.roleQualifications, []);
    assert.deepEqual(product.capabilities, []);
    const offers = referenceOffersForProduct(product);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].retailer, "lowes");
    assert.equal(offers[0].productId, row.productId);
    assert.equal(offers[0].retailerModel, row.model);
    assert.equal(offers[0].retailerItemNumber, row.item);
    assert.ok(product.sources.some((source) => source.url === offers[0].url));
    assert.ok(
      product.sources.every(
        (source) => source.verifiedAt === product.verifiedAt,
      ),
    );
    assert.equal("price" in product, false);
    assert.equal("available" in product, false);
  }
});

test("source evidence keeps untreated whitewood, framing exclusion and undeclared SYP chemistry distinct", () => {
  const whitewood = findRetailerProduct(boards[0].registryId)!;
  const syp = findRetailerProduct(boards[1].registryId)!;
  const whitewoodEvidence = whitewood.sources
    .map((source) => source.note)
    .join(" ");
  const sypEvidence = syp.sources.map((source) => source.note).join(" ");
  assert.match(whitewood.profile.finish!, /untreated/);
  assert.match(whitewoodEvidence, /Pressure Treated is No/);
  assert.match(whitewoodEvidence, /spruce\/pine\/fir/);
  assert.match(
    whitewoodEvidence,
    /framing and exterior trim are explicitly No/,
  );
  assert.match(syp.profile.finish!, /#2 Prime SYP/);
  assert.match(syp.profile.finish!, /treatment not declared/);
  assert.match(sypEvidence, /Above-ground/);
  assert.match(sypEvidence, /No preservative-treatment declaration/);
  assert.match(sypEvidence, /AWPA No is not proof of untreated/);
  assert.match(sypEvidence, /decking, fencing and landscaping are No/);
  for (const product of [whitewood, syp]) {
    assert.match(
      product.sources.map((source) => source.note).join(" "),
      /No .*sauna\/heat/,
    );
    assert.equal(
      product.roleQualifications.some((q) => q.role.startsWith("sauna")),
      false,
    );
  }
});

test("reviewed exact references bind dimensions and packs without inventing a Home Depot counterpart", () => {
  for (const row of boards) {
    const stock = material(row.materialId),
      product = findRetailerProduct(row.registryId)!;
    assert.equal(checkProductBinding(stock, product).compatible, true);
    assert.equal(
      reviewedOfferForMaterial(stock, "lowes")?.productId,
      row.productId,
    );
    assert.equal(reviewedOfferForMaterial(stock, "home-depot"), null);
    assert.equal(
      checkProductBinding({ ...stock, packCount: 104 }, product).compatible,
      false,
    );
    assert.equal(
      checkProductBinding(
        { ...stock, stockSize: [stock.size[0], 96, 6] },
        product,
      ).compatible,
      false,
    );
  }
});

test("manual boards rotate, retain specified grain direction through crosscuts and rips, and purchase their source once", () => {
  for (const row of boards) {
    const project = blank("Source board cut sequence");
    const stock = material(row.materialId);
    const board = part(
      "Manual furniture board",
      row.materialId,
      [...stock.size],
      [10, 48, -12],
      project.steps[0].id,
      "Furniture",
      [0, Math.PI / 3, Math.PI / 2],
    );
    board.stockLengthAxis = 1;
    project.pieces.push(board);
    assert.deepEqual(stockAxes(board), { length: 1, width: 2, thickness: 0 });
    const shortened = cutPiece(project, board.id, 3, 1);
    const ripped = cutPiece(shortened, board.id, 2.5, 2);
    const kept = ripped.pieces.find((piece) => piece.id === board.id)!;
    assert.deepEqual(kept.size, [row.size[0], 3, 2.5]);
    assert.deepEqual(kept.rotation, board.rotation);
    assert.deepEqual(orientedStockSize(kept), [row.size[0], 2.5, 3]);
    assert.equal(ripped.pieces.length, 3);
    assert.equal(
      new Set(ripped.pieces.map((piece) => piece.cutStock!.id)).size,
      1,
    );
    assert.equal(inspectCutStock(ripped).valid.size, 1);
    assert.deepEqual(inspectCutStock(ripped).invalid, []);
    const purchase = bom(ripped)[0];
    assert.equal(purchase.quantity, 1);
    assert.equal(purchase.physicalStockUnits, 1);
    assert.equal(purchase.packCount, 1);
    assert.equal(purchase.unpriced, true);
    assert.equal(purchase.verified, false);
    assert.deepEqual(
      project.pieces[0].size,
      row.size,
      "Cuts do not mutate the source project",
    );
    ripped.pieces.push(
      part(
        "Second independently added board",
        row.materialId,
        [...stock.size],
        [30, 48, 0],
        project.steps[0].id,
        "Furniture",
      ),
    );
    assert.equal(
      bom(ripped)[0].quantity,
      2,
      "A separate board is not incorrectly grouped into cut lineage",
    );
    assert.equal(bom(ripped)[0].physicalStockUnits, 2);
  }
});

test("exact synthetic store snapshots price one physical board once and survive JSON reopening", () => {
  for (const row of boards) {
    const project = blank("Synthetic source observation");
    project.retailer = "lowes";
    project.store = "synthetic-exact-board-test";
    const stock = material(row.materialId);
    const board = part(
      "Manual board",
      row.materialId,
      [...stock.size],
      [0, 48, 0],
      project.steps[0].id,
      "Furniture",
    );
    project.pieces.push(board);
    const cut = cutPiece(project, board.id, 36, 1);
    const offer = reviewedOfferForMaterial(stock, "lowes")!;
    const observation = {
      material: row.materialId,
      retailer: "lowes" as const,
      internetNumber: row.productId,
      name: "Synthetic per-board observation; not real stock",
      price: 14.25,
      available: 3,
      store: project.store,
      zip: project.zip,
      checkedAt: new Date(Date.now() - 1000).toISOString(),
      url: offer.url,
    };
    cut.inventory.push(inventorySchema.parse(observation));
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(cut)));
    assert.equal(
      usableInventory(reopened, row.materialId)?.internetNumber,
      row.productId,
    );
    assert.equal(bom(reopened)[0].quantity, 1);
    assert.equal(bom(reopened)[0].total, 14.25);
    assert.equal(bom(reopened)[0].verified, true);
    assert.equal(bom(reopened)[0].unpriced, false);
    assert.equal(
      inventorySchema.safeParse({
        ...observation,
        internetNumber: "5014110787",
        url: "https://www.lowes.com/pd/Top-Choice/5014110787",
      }).success,
      false,
    );
    assert.equal(
      inventorySchema.safeParse({
        ...observation,
        retailer: "home-depot",
        url: "https://www.homedepot.com/p/1001067086",
      }).success,
      false,
    );
    reopened.retailer = "home-depot";
    assert.equal(
      usableInventory(reopened, row.materialId),
      undefined,
      "A Lowe’s snapshot is not Home Depot stock",
    );
  }
});

test("manual-only board and treated-post references are excluded from generated structure roles, including unknown registry bypasses", () => {
  for (const materialId of [
    ...boards.map((row) => row.materialId),
    "lowes-treated-post-4x4-8",
  ] as const) {
    const stock = material(materialId);
    assert.equal(stock.placementOnly, true);
    for (const role of [
      "frameLumber",
      "ridgeLumber",
      "saunaInterior",
      "saunaBenchFrame",
    ] as const)
      assert.equal(
        structureMaterialChoices(role).some(
          (choice) => choice.materialId === materialId,
        ),
        false,
      );
    for (const productRegistryRef of [
      stock.productReference!,
      "unknown-registry-reference",
    ]) {
      const selections = { frameLumber: { materialId, productRegistryRef } };
      assert.throws(
        () =>
          buildGreenhouse(
            blank(),
            { width: 72, depth: 96, eaveHeight: 84, roofRise: 24 },
            selections,
          ),
        /individual placement/,
      );
      assert.throws(
        () =>
          buildSaunaCabin(
            blank(),
            { clearWidth: 72, clearDepth: 72, clearHeight: 84 },
            selections,
          ),
        /individual placement/,
      );
    }
  }
});

test("plan parsing and direct furniture recipe execution both reject automatic framing with manual-only stock", () => {
  for (const materialId of [
    ...boards.map((row) => row.materialId),
    "lowes-treated-post-4x4-8",
  ] as const) {
    for (const kind of [
      "bench",
      "workbench",
      "cabinet",
      "shelf",
      "frame",
    ] as const) {
      const module = framing(materialId, kind);
      assert.equal(moduleSchema.safeParse(module).success, false);
      assert.equal(
        ideaPlanSchema.safeParse({
          title: "Frame review",
          summary: "No unreviewed framing",
          assumptions: [],
          questions: [],
          suggestions: [],
          modules: [module],
        }).success,
        false,
      );
      assert.throws(
        () => recipeParts(module, uid(), "Frame review"),
        /manual placement and cuts/,
      );
    }
    const panel = framing(materialId, "panel");
    assert.equal(
      moduleSchema.safeParse(panel).success,
      true,
      "An unused frame selection does not block an ordinary sheet panel",
    );
    assert.equal(recipeParts(panel, uid(), "Sheet panel").length, 1);
  }
  assert.equal(moduleSchema.safeParse(framing("stud")).success, true);
  assert.ok(
    recipeParts(framing("stud"), uid(), "Legacy generic frame").length > 0,
  );
});

test("legacy generic geometry and raw manually placed exact boards still import without generation approval", () => {
  const expected: [MaterialId, V3][] = [
    ["one-six", [0.75, 96, 5.5]],
    ["two-six", [1.5, 96, 5.5]],
    ["two-eight", [1.5, 96, 7.25]],
    ["treated", [1.5, 5.5, 96]],
  ];
  for (const [id, size] of expected) {
    assert.deepEqual(material(id).size, size);
    assert.equal(material(id).productReference, undefined);
  }
  const project = blank("Raw geometry import");
  for (const [index, id] of [
    ...boards.map((row) => row.materialId),
    "lowes-treated-post-4x4-8",
    "one-six",
    "two-six",
    "treated",
  ].entries()) {
    const stock = material(id as MaterialId);
    project.pieces.push(
      part(
        "Individually placed stock",
        stock.id,
        [...stock.size],
        [index * 12, 48, 0],
        project.steps[0].id,
        "Manual work",
        [Math.PI / 2, 0.25, 0],
      ),
    );
  }
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.pieces, project.pieces);
  assert.equal(reopened.pieces.length, 6);
});
