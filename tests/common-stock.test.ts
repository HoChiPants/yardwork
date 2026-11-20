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
} from "../src/model";
import { bom, cutPiece, usableInventory } from "../src/engine";
import {
  buildGreenhouse,
  buildSaunaCabin,
  structureMaterialChoices,
} from "../src/structures";
import {
  checkProductBinding,
  findRetailerProduct,
  referenceOffersForProduct,
  retailerProductSchema,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";

const stockCases = [
  {
    id: "lowes-syp-2x4x96-5140",
    productId: "5014110787",
    model: "020408#2 SYP",
    item: "5140",
    size: [1.5, 96, 3.5] as [number, number, number],
    generic: "stud" as const,
  },
  {
    id: "lowes-syp-treated-post-4x4x96-552328",
    productId: "50121083",
    model: "Y2L40408-GC",
    item: "552328",
    size: [3.5, 96, 3.5] as [number, number, number],
    generic: "post" as const,
  },
];

test("reviewed SYP stocks preserve exact retailer identities, actual dimensions and single-piece purchase packs", () => {
  for (const row of stockCases) {
    const product = findRetailerProduct(row.id)!;
    assert.ok(product, row.id);
    assert.equal(retailerProductSchema.safeParse(product).success, true);
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.identityBasis, "retailer-specification");
    assert.equal(product.manufacturerPartNumber, null);
    assert.equal(product.profile.wood, true);
    assert.equal(product.profile.stockKind, "linear");
    assert.equal(product.profile.dimensionMeaning, "actual-stock");
    assert.deepEqual(product.profile.stockSize, row.size);
    assert.equal(product.profile.packCount, 1);
    assert.equal(product.offers.length, 1);
    assert.equal(product.offers[0].retailer, "lowes");
    assert.equal(product.offers[0].productId, row.productId);
    assert.equal(product.offers[0].retailerModel, row.model);
    assert.equal(product.offers[0].retailerItemNumber, row.item);
    assert.equal(product.offers[0].listingStatus, "reference");
    assert.ok(product.sources.some((s) => s.url === product.offers[0].url));
    assert.equal("price" in product, false);
    assert.equal("available" in product, false);
    assert.equal("storeId" in product, false);
  }
});

test("SYP source restrictions preserve conservative grade and treatment interpretation", () => {
  const stud = findRetailerProduct(stockCases[0].id)!;
  const post = findRetailerProduct(stockCases[1].id)!;
  const studEvidence = stud.sources.map((s) => s.note).join(" ");
  const postEvidence = post.sources.map((s) => s.note).join(" ");
  assert.match(studEvidence, /Southern yellow pine/);
  assert.match(studEvidence, /#2 Prime/);
  assert.match(studEvidence, /title.*specifications.*#2/);
  assert.match(studEvidence, /grade stamp/i);
  assert.match(stud.profile.finish!, /Kiln-dried.*S4S/);
  assert.match(postEvidence, /MCA/);
  assert.match(postEvidence, /ground.contact/i);
  assert.match(postEvidence, /retention.*not verified/i);
  assert.equal(post.roleQualifications.length, 0);
  for (const product of [stud, post])
    assert.equal(
      product.roleQualifications.some((q) =>
        ["saunaInterior", "saunaBenchFrame"].includes(q.role),
      ),
      false,
    );
});

test("new reference geometry binds without reviving the retired SYP offer or inventing a Home Depot match", () => {
  for (const row of stockCases) {
    const product = findRetailerProduct(row.id)!;
    const stock = {
      ...material(row.generic),
      productReference: row.id,
      size: row.size,
      stockSize: row.size,
      packCount: 1,
    };
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
      checkProductBinding({ ...stock, stockSize: [2, 96, 4] }, product)
        .compatible,
      false,
    );
  }
  const historical = findRetailerProduct("lowes-syp-2x4x96-1365777-retired")!;
  assert.deepEqual(referenceOffersForProduct(historical), []);
  assert.notEqual(historical.id, stockCases[0].id);
});

test("editable SYP variants survive project JSON and remain unpriced until an exact store snapshot", () => {
  const project = blank("Reviewed stock test");
  project.retailer = "lowes";
  const choices = ["lowes-syp-2x4-8", "lowes-treated-post-4x4-8"] as const;
  for (const [index, id] of choices.entries()) {
    assert.ok(materialIds.includes(id));
    assert.equal(catalog.filter((m) => m.id === id).length, 1);
    const stock = material(id);
    const product = findRetailerProduct(stock.productReference!)!;
    assert.equal(checkProductBinding(stock, product).compatible, true);
    assert.equal(stock.priceKind, "unpriced");
    assert.equal(stock.packCount, 1);
    assert.equal(stock.wood, true);
    assert.equal(stock.cuttable, true);
    project.pieces.push(
      part(
        stock.name,
        id,
        [...stock.size],
        [index * 12, 48, 0],
        project.steps[0].id,
        "Stock",
      ),
    );
  }
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(
    reopened.pieces.map((p) => p.material),
    choices,
  );
  for (const row of bom(reopened)) {
    assert.equal(row.quantity, 1);
    assert.equal(row.physicalStockUnits, 1);
    assert.equal(row.packCount, 1);
    assert.equal(row.unpriced, true);
    assert.equal(row.verified, false);
    assert.equal(row.inventory, undefined);
  }
  assert.deepEqual(material("stud").size, [1.5, 96, 3.5]);
  assert.deepEqual(material("post").size, [3.5, 96, 3.5]);
});

test("treated post stays outside automatic structure choices and cannot bypass selection checks with an unknown product", () => {
  const post = material("lowes-treated-post-4x4-8");
  assert.equal(post.placementOnly, true);
  for (const role of [
    "frameLumber",
    "ridgeLumber",
    "saunaInterior",
    "saunaBenchFrame",
  ] as const)
    assert.equal(
      structureMaterialChoices(role).some(
        (choice) => choice.materialId === post.id,
      ),
      false,
    );
  assert.ok(
    structureMaterialChoices("frameLumber").some(
      (choice) => choice.materialId === "lowes-syp-2x4-8",
    ),
  );
  for (const productRegistryRef of [
    post.productReference!,
    "unknown-registry-product",
  ]) {
    const selections = {
      frameLumber: { materialId: post.id, productRegistryRef },
    };
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
});

test("manual treated-post cuts retain one stock purchase and accept an exact synthetic store observation", () => {
  const stock = material("lowes-treated-post-4x4-8");
  const project = blank("Manual post test");
  project.retailer = "lowes";
  project.store = "synthetic-test-store";
  const post = part(
    "Manually placed post",
    stock.id,
    [...stock.size],
    [0, 48, 0],
    project.steps[0].id,
    "Manual stock",
  );
  project.pieces.push(post);
  const cut = cutPiece(project, post.id, 36, 1);
  assert.deepEqual(
    cut.pieces.map((p) => p.size[1]),
    [36, 59.875],
  );
  assert.equal(cut.pieces[0].cutStock!.id, cut.pieces[1].cutStock!.id);
  assert.equal(bom(cut)[0].quantity, 1);
  const offer = reviewedOfferForMaterial(stock, "lowes")!;
  const observation = {
    material: stock.id,
    retailer: "lowes" as const,
    internetNumber: offer.productId,
    name: "Synthetic one-post purchase unit; not real inventory",
    price: 18.5,
    available: 4,
    store: project.store,
    zip: project.zip,
    checkedAt: new Date(Date.now() - 1000).toISOString(),
    url: offer.url,
  };
  cut.inventory.push(inventorySchema.parse(observation));
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(cut)));
  assert.equal(usableInventory(reopened, stock.id)?.internetNumber, "50121083");
  const row = bom(reopened)[0];
  assert.equal(row.physicalStockUnits, 1);
  assert.equal(row.quantity, 1);
  assert.equal(row.unpriced, false);
  assert.equal(row.total, 18.5);
  assert.equal(
    inventorySchema.safeParse({ ...observation, internetNumber: "5014110787" })
      .success,
    false,
  );
});
