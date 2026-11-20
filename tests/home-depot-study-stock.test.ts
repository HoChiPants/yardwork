import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  listBuildFixtures,
} from "../src/buildFixtures";
import { bom, guideMarkdown, usableInventory } from "../src/engine";
import { greenhouseBaseTimber12 } from "../src/greenhouseBaseReference";
import { pureBondCasework } from "../src/homeDepotCaseworkReference";
import { homeDepotFraming } from "../src/homeDepotFramingReference";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { homeDepotAssemblyPurchaseReview } from "../src/handoffPurchases";
import { blank, inventorySchema, material, projectSchema } from "../src/model";
import {
  checkProductBinding,
  findRetailerProduct,
  purchaseSpecForProduct,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { homeDepotStudyStock } from "../src/studyStock";
import { structureMaterialChoices } from "../src/structures";

test("the five study presets produce exact Home Depot stock, full purchase units and editable geometry", () => {
  for (const { id } of listBuildFixtures()) {
    const dims = defaultBuildStudyParameters(id);
    const study = createBuildStudy(id, dims);
    const choices = homeDepotStudyStock(study, {});
    const baseline = study.project;
    const { project } = createBuildStudy(id, dims, blank(), choices);
    const stocks = bom(project);
    assert.equal(project.zip, "84121");
    assert.ok(Object.keys(choices).length > 0);
    assert.ok(stocks.length > 0);
    assert.ok(
      stocks.every(
        (row) => row.quantity > 0 && row.oversize === 0 && row.unpriced,
      ),
    );
    assert.ok(
      stocks.every((row) =>
        reviewedOfferForMaterial(material(row.id), "home-depot"),
      ),
    );
    assert.ok(
      !stocks.some((row) => ["stud", "plywood", "two-six"].includes(row.id)),
    );
    assert.deepEqual(
      projectSchema
        .parse(JSON.parse(JSON.stringify(project)))
        .pieces.map((piece) => piece.material),
      project.pieces.map((piece) => piece.material),
    );
    assert.ok(
      bom(baseline).some(({ id }) =>
        ["stud", "plywood", "two-six"].includes(id),
      ),
    );
    assert.ok(
      bom(project).some(({ id }) =>
        homeDepotShoppingList(project).text.includes(
          reviewedOfferForMaterial(material(id), "home-depot")!.productId,
        ),
      ),
    );
  }
  for (const record of Object.values(homeDepotFraming)) {
    const stock = material(record.materialId);
    currentOffer(record);
    assert.ok(
      structureMaterialChoices(record.role).some(
        (choice) => choice.materialId === stock.id,
      ),
    );
    assert.ok(
      !structureMaterialChoices("saunaBenchFrame").some(
        (choice) => choice.materialId === stock.id,
      ),
    );
  }
});

test("the Home Depot handoff carries unresolved assembly and cutting decisions for all five studies", () => {
  for (const { id } of listBuildFixtures()) {
    const study = createBuildStudy(id);
    const { project } = createBuildStudy(id, undefined, blank(), homeDepotStudyStock(study, {}));
    const connectionReview = homeDepotAssemblyPurchaseReview(project);
    assert.equal(connectionReview.incomplete, true, id);
    assert.ok(connectionReview.connections.some((row) => /without connection plans/.test(row.detail)), id);
    const handoff = homeDepotShoppingList(project);
    assert.ok(handoff.items.length > 0, id);
    assert.match(handoff.text, /Internet #\d+/);
    assert.doesNotMatch(handoff.text, /assembly connections|Cut stock to length/i);
    assert.ok(handoff.toolReview.conditional.some(({ capability }) => capability === "wood-crosscut"), id);
    const checklist = homeDepotHandoff(project);
    assert.match(checklist, /INCOMPLETE MATERIAL LIST/);
    assert.match(checklist, /ASSEMBLY CONNECTIONS TO REVIEW[\s\S]+without connection plans/);
    assert.match(checklist, /TOOLS TO CHECK FOR THE CHOSEN METHOD[\s\S]+Cut stock to length/);
    if (id === "sauna") {
      assert.match(checklist, /BUILD SYSTEMS TO REVIEW[\s\S]+heater\/electrical and ventilation/);
      assert.equal(handoff.items.length, 1);
      assert.doesNotMatch(handoff.text, /heater|ventilation/);
    }
  }
});

function currentOffer(
  record: (typeof homeDepotFraming)[keyof typeof homeDepotFraming],
) {
  const stock = material(record.materialId);
  const product = findRetailerProduct(record.registryId)!;
  assert.equal(checkProductBinding(stock, product).compatible, true);
  assert.deepEqual(stock.size, record.stockSize);
  assert.equal(stock.packCount, 1);
  assert.deepEqual(purchaseSpecForProduct(product), {
    kind: "counted",
    count: 1,
    sourceRefs: [...new Set([record.listing, record.unitSource])],
  });
  const offer = reviewedOfferForMaterial(stock, "home-depot")!;
  assert.equal(offer.productId, record.internetNumber);
  return offer;
}

test("long greenhouse cuts select distinct frame, base and ridge lengths and keep a manual override", () => {
  const p = { ...defaultBuildStudyParameters("greenhouse"), depth: 108 };
  const baseline = createBuildStudy("greenhouse", p);
  const long = homeDepotStudyStock(baseline, {});
  assert.equal(
    long.ridgeLumber?.materialId,
    homeDepotFraming.ridge12.materialId,
  );
  assert.equal(
    long.frameLumber?.materialId,
    homeDepotFraming.stud10.materialId,
  );
  assert.equal(
    long.greenhouseBase?.materialId,
    greenhouseBaseTimber12.materialId,
  );
  const { project } = createBuildStudy("greenhouse", p, blank(), long);
  const ridge = project.pieces.find(
    (piece) => piece.designRole === "greenhouse-ridge",
  )!;
  assert.equal(ridge.size[2], 108);
  const list = bom(project);
  const ridgeRow = list.find(
    ({ id }) => id === homeDepotFraming.ridge12.materialId,
  )!;
  assert.equal(ridgeRow.quantity, 1);
  assert.equal(ridgeRow.oversize, 0);
  assert.equal(
    list.find(({ id }) => id === greenhouseBaseTimber12.materialId)?.quantity,
    4,
  );
  assert.ok(list.every(({ oversize }) => oversize === 0));
  const guide = guideMarkdown(project);
  for (const record of [
    homeDepotFraming.stud10,
    homeDepotFraming.ridge12,
    greenhouseBaseTimber12,
  ])
    assert.ok(guide.includes(record.listing));
  const shorter = homeDepotFraming.ridge8;
  const manual = {
    ridgeLumber: {
      materialId: shorter.materialId,
      productRegistryRef: shorter.registryId,
    },
  };
  const manualStudy = createBuildStudy("greenhouse", p, undefined, manual);
  const suggested = homeDepotStudyStock(manualStudy, manual);
  assert.equal(suggested.ridgeLumber, undefined);
  const conflict = createBuildStudy("greenhouse", p, undefined, {
    ...manual,
    ...suggested,
  });
  assert.equal(
    bom(conflict.project).find(({ id }) => id === shorter.materialId)?.oversize,
    1,
  );
});

test("framing fit uses cut geometry, including clear sauna dimensions and lengths beyond listed stock", () => {
  for (const [width, expected, oversized] of [
    [108, homeDepotFraming.stud10, false],
    [128, homeDepotFraming.stud12, false],
    [156, homeDepotFraming.stud12, true],
  ] as const) {
    const p = { ...defaultBuildStudyParameters("sauna"), width };
    const study = createBuildStudy("sauna", p);
    const picks = homeDepotStudyStock(study, {});
    assert.equal(picks.frameLumber?.materialId, expected.materialId);
    const { project } = createBuildStudy("sauna", p, undefined, picks);
    const row = bom(project).find(({ id }) => id === expected.materialId)!;
    assert.equal(row.oversize > 0, oversized);
  }
  const close = { ...defaultBuildStudyParameters("sauna"), width: 109.96 };
  const study = createBuildStudy("sauna", close);
  assert.equal(
    homeDepotStudyStock(study, {}).frameLumber?.materialId,
    homeDepotFraming.stud12.materialId,
    "A trim smaller than the modeled kerf requires the longer board",
  );
});

test("a four-foot bookcase gets a full-width birch sheet with exact thickness and stock identity", () => {
  const p = { ...defaultBuildStudyParameters("shelves"), width: 48 };
  const baseline = createBuildStudy("shelves", p);
  const picks = homeDepotStudyStock(baseline, {});
  assert.equal(picks.caseworkPanels?.materialId, pureBondCasework.materialId);
  const { project } = createBuildStudy("shelves", p, undefined, picks);
  const { size, productReference } = material(pureBondCasework.materialId);
  assert.deepEqual(size, [48, 0.703, 96]);
  assert.equal(productReference, pureBondCasework.registryId);
  assert.ok(
    project.pieces.every(
      ({ material, size }) =>
        material === pureBondCasework.materialId && size.includes(0.703),
    ),
  );
  assert.equal(bom(project)[0].oversize, 0);
  assert.equal(bom(project)[0].quantity, 3);
  assert.match(guideMarkdown(project), /100077837/);
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(parsed.ideaBindings, project.ideaBindings);
  assert.deepEqual(parsed.pieces, project.pieces);
  assert.ok(
    !structureMaterialChoices("greenhouseGlazing").some(
      ({ materialId }) => materialId === pureBondCasework.materialId,
    ),
  );
});

test("the selected exact 2 × 4 uses only an observation for the same product, store and ZIP", () => {
  const { stud } = homeDepotFraming;
  const context = { ...blank(), zip: "84121", store: "4409" };
  const p = defaultBuildStudyParameters("storage-banquette");
  const choice = homeDepotStudyStock(
    createBuildStudy("storage-banquette", p, context),
    {},
  );
  const { project } = createBuildStudy("storage-banquette", p, context, choice);
  const observation = {
    material: stud.materialId,
    retailer: "home-depot" as const,
    name: stud.name,
    store: context.store,
    zip: context.zip,
    price: 4,
    available: 10,
    checkedAt: new Date().toISOString(),
  };
  const right = inventorySchema.parse({
    ...observation,
    internetNumber: stud.internetNumber,
    url: stud.listing,
  });
  assert.equal(
    inventorySchema.safeParse({
      ...observation,
      internetNumber: "338861827",
      url: "https://www.homedepot.com/p/338861827",
    }).success,
    false,
    "A different Internet number with the same store SKU is not the selected product",
  );
  const stocked = { ...project, inventory: [right] };
  assert.equal(usableInventory(stocked, stud.materialId)?.available, 10);
  assert.equal(
    usableInventory({ ...stocked, store: "4403" }, stud.materialId),
    undefined,
  );
  assert.equal(
    usableInventory({ ...stocked, zip: "84070" }, stud.materialId),
    undefined,
  );
  const row = bom(stocked).find((row) => row.id === stud.materialId)!;
  assert.equal(row.quantity, 5);
  assert.equal(row.total, 20);
  assert.equal(row.verified, true);
  assert.match(
    homeDepotShoppingList(stocked).text,
    /5 boards.*Internet #312528776/,
  );
  assert.equal(
    projectSchema.parse({ ...blank(), schemaVersion: 63 }).schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
});
