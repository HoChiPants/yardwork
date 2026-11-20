import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  bom,
  bounds,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
  validate,
} from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { retailerHandoff } from "../src/handoff";
import { blank, inventorySchema, material, part, projectSchema, type V3 } from "../src/model";
import {
  findRetailerProduct,
  retailerProductSchema,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";
import { cedarbrookLining as cedar } from "../src/saunaLiningReference";
import { saunaLiningBacking } from "../src/saunaLiningBacking";
import { addSaunaNailBoxes, saunaNailBoxPlan } from "../src/saunaLiningPurchases";
import { paslodeFinishNailer as nailer, paslodeFinishNails as nails } from "../src/paslodeFinishReference";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { selectedToolsForProject } from "../src/toolGuide";
import { buildSaunaCabin, structureMaterialChoices } from "../src/structures";
import { toolChecklist } from "../src/tools";

const selection = {
  materialId: cedar.materialId,
  productRegistryRef: cedar.productId,
};
const selections = { saunaInterior: selection };
const defaults = defaultBuildStudyParameters("sauna");
const epsilon = 0.000001;

test("a lined sauna preserves the clear volume, door opening and framing space", () => {
  const { project, structure } = createBuildStudy(
    "sauna",
    { ...defaults, doorHeight: 71.5 },
    blank(),
    {
      ...selections,
      saunaInsulation: {
        materialId: "jm-u1330-batt",
        productRegistryRef: "johns-manville-u1330",
      },
    },
  );
  const linings = project.pieces.filter((p) => p.material === cedar.materialId);
  assert.equal(linings.length, 161);
  assert.equal(structure?.dimensions.liningThickness, cedar.thickness);
  assert.equal(
    structure?.dimensions.remainingInteriorLayer,
    1.5 - cedar.thickness,
  );
  assert.equal(structure?.geometryRoles["ceiling-lining"].length, 24);
  const surfaceArea = (role: string) => {
    const ids = new Set(structure?.geometryRoles[role]);
    return linings
      .filter((piece) => ids.has(piece.id))
      .reduce((total, piece) => total + piece.size[0] * piece.size[1], 0);
  };
  assert.equal(surfaceArea("ceiling-lining"), 72 * 72);
  assert.equal(surfaceArea("wall-lining"), 4 * 72 * 84 - 28 * 71.5);
  assert.equal(
    structure?.cutRequirements.filter(
      (cut) => cut.materialId === cedar.materialId,
    ).length,
    linings.length,
  );
  const clearRoom: ReturnType<typeof bounds> = {
    min: [-36, 0, -36],
    max: [36, 84, 36],
  };
  const separation = (a: ReturnType<typeof bounds>, b: typeof a) =>
    [0, 1, 2].some(
      (i) =>
        Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) <= epsilon,
    );
  for (const lining of linings) {
    const box = bounds(lining);
    assert.equal(lining.stockLengthAxis, 0);
    assert.ok(lining.size[1] <= cedar.reveal);
    assert.ok(separation(box, clearRoom), lining.name);
    for (const other of project.pieces) {
      if (lining.id !== other.id)
        assert.ok(
          separation(box, bounds(other)),
          `${lining.name} overlaps ${other.name}`,
        );
    }
    if (lining.name.includes("front"))
      assert.ok(
        box.min[0] >= 14 - epsilon ||
          box.max[0] <= -14 + epsilon ||
          box.min[1] >= 71.5 - epsilon,
      );
  }
  const header = linings.find((p) => p.name.includes("header strip"))!;
  assert.deepEqual(header.size, [28, 0.5, cedar.thickness]);
  assert.ok(project.pieces.some((p) => p.material === "jm-u1330-batt"));
  assert.match(
    structure!.unresolved.find((issue) => issue.id === "sauna-envelope")!
      .reason,
    /Wall batts.*ceiling insulation/,
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.ideaBindings, project.ideaBindings);
  assert.deepEqual(reopened.pieces, project.pieces);
});

test("the takeoff sizes Cedarbrook bundles from actual boards and keeps its supplier separate from store inventory", () => {
  const { project } = createBuildStudy("sauna", defaults, blank(), selections);
  const row = bom(project).find((r) => r.id === cedar.materialId)!;
  assert.equal(row.pieces, 160);
  assert.equal(row.physicalStockUnits, 128);
  assert.equal(row.quantity, 22);
  assert.equal(row.surplusStockUnits, 4);
  assert.equal(row.oversize, 0);
  assert.equal(row.unpriced, true);
  assert.equal(row.verified, false);
  assert.equal(row.supplier?.url, cedar.url);
  const stock = material(cedar.materialId);
  assert.deepEqual(stock.size, [72, 3, 0.6875]);
  assert.deepEqual(stock.stockSize, [72, 3.375, 0.6875]);
  const guide = guideMarkdown(generateBuildGuide(project));
  assert.match(guide, /Dry-fit the cedar lining courses/);
  assert.match(guide, /3⅜ in tongue-and-groove board/);
  assert.match(guide, /22 × bundle.*128 individual stock items.*6-1X4-TNG/);
  for (const retailer of ["home-depot", "lowes"] as const) {
    const atStore = { ...project, retailer, store: "9999" };
    assert.equal(reviewedOfferForMaterial(stock, retailer), null);
    const csv = shoppingCsv(atStore)
      .split("\n")
      .find((line) => line.includes(cedar.url))!;
    assert.match(
      csv,
      /^"Cedarbrook [^"]+","","22","bundle","UNPRICED","UNPRICED","","","SUPPLIER QUOTE"/,
    );
    const handoff = retailerHandoff(atStore);
    assert.match(
      handoff,
      /DIRECT SUPPLIER PURCHASES[\s\S]+22 bundles — Cedarbrook 6-1X4-TNG/,
    );
    assert.equal(
      inventorySchema.safeParse({
        material: cedar.materialId,
        retailer,
        zip: "84121",
        store: "9999",
        internetNumber: "123456789",
        name: stock.name,
        price: 25,
        available: 3,
        checkedAt: cedar.reviewedAt,
        url:
          retailer === "lowes"
            ? "https://www.lowes.com/pd/123456789"
            : "https://www.homedepot.com/p/123456789",
      }).success,
      false,
    );
  }
  const product = findRetailerProduct(cedar.productId)!;
  assert.equal(
    retailerProductSchema.safeParse({ ...product, supplier: undefined })
      .success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...product,
      supplier: { ...product.supplier, productCode: "OTHER" },
    }).success,
    false,
  );
});

test("long courses fit real stock and a cut remains editable without treating the reveal as a rip", () => {
  const study = createBuildStudy(
    "sauna",
    {
      ...defaults,
      width: 90,
      depth: 80,
      height: 85,
      interiorLayerAllowance: 1,
    },
    blank(),
    selections,
  );
  const planks = study.project.pieces.filter(
    (p) => p.material === cedar.materialId,
  );
  assert.ok(planks.every((p) => p.size[0] <= cedar.length));
  assert.ok(planks.some((p) => p.size[1] < cedar.reveal));
  const plank = planks.find(
    (p) => p.size[0] === 45 && p.size[1] === cedar.reveal,
  )!;
  const cut = cutPiece(study.project, plank.id, 40, 0);
  assert.equal(
    projectSchema.parse(cut).pieces.find((piece) => piece.id === plank.id)
      ?.size[0],
    40,
  );
  assert.ok(
    cut.pieces.some(
      (piece) =>
        piece.offcut &&
        piece.cutStock?.id ===
          cut.pieces.find((p) => p.id === plank.id)?.cutStock?.id,
    ),
  );
  assert.equal(bom(cut).find((r) => r.id === cedar.materialId)?.oversize, 0);
  const isolate = { ...blank(), pieces: [plank] };
  const tools = toolChecklist(isolate).requirements.map((r) => r.capability);
  assert.ok(tools.includes("wood-crosscut"));
  assert.ok(!tools.includes("wood-rip"));
  const edge = planks.find((p) => p.size[1] === 1)!;
  assert.ok(
    toolChecklist({ ...isolate, pieces: [edge] }).requirements.some(
      (r) => r.capability === "wood-rip",
    ),
  );
});

test("scope, minimum wall allowance, and old project migration stay explicit", () => {
  assert.deepEqual(
    structureMaterialChoices("saunaInterior").map((s) => s.materialId),
    [cedar.materialId],
  );
  assert.equal(
    structureMaterialChoices("frameLumber").some(
      (s) => s.materialId === cedar.materialId,
    ),
    false,
  );
  const sauna = { clearWidth: 72, clearDepth: 72, clearHeight: 84 };
  assert.throws(
    () =>
      buildSaunaCabin(blank(), sauna, {
        frameLumber: { ...selection, productRegistryRef: "other" },
      }),
    /reviewed scope/,
  );
  assert.throws(
    () =>
      buildSaunaCabin(
        blank(),
        { ...sauna, interiorLayerAllowance: 0.5 },
        selections,
      ),
    /11\/16 in cedar lining/,
  );
  const original = createBuildStudy("sauna").project;
  assert.deepEqual(
    projectSchema.parse({ ...original, schemaVersion: 22 }),
    original,
  );
  assert.equal(
    original.pieces.some((p) => p.material === cedar.materialId),
    false,
  );
});

test("liner backing tracks the measured layer gap and uses retained wood after edits", () => {
  const { project } = createBuildStudy("sauna", defaults, blank(), selections);
  const [walls, ceiling] = saunaLiningBacking(project);
  assert.equal(walls.separated.length, 136);
  assert.equal(ceiling.separated.length, 24);
  assert.ok(Math.abs(walls.minGap - 13 / 16) < epsilon);
  assert.ok(Math.abs(ceiling.minGap - 13 / 16) < epsilon);
  const course = project.pieces.find((p) => p.name.endsWith("rear course 6"))!;
  const z = course.position[2] - cedar.thickness / 2 - 0.25;
  const filler = part("Added wood backing", "stud", [72, 1.5, 0.5], [0, course.position[1], z], course.stepId, "Sauna");
  const withBacking = { ...project, pieces: [...project.pieces, filler] };
  const [revisedWalls] = saunaLiningBacking(withBacking);
  assert.ok(!revisedWalls.separated.includes(course.id));
  assert.ok(!revisedWalls.ends.includes(course.id));
  assert.equal(revisedWalls.separated.length, walls.separated.length - 1);
  const openedBacking = {
    ...withBacking,
    pieces: withBacking.pieces.map((p) => p.id === filler.id ? {
      ...p,
      rectangularOpenings: [{ axis: 2 as const, center: [0, 0] as [number, number], spans: [72, 0.5] as [number, number] }],
    } : p),
  };
  assert.ok(saunaLiningBacking(openedBacking)[0].separated.includes(course.id));
  const moved = {
    ...withBacking,
    pieces: withBacking.pieces.map((p) => p.id === course.id ? { ...p, position: [0, p.position[1], p.position[2] + 10] as V3 } : p),
  };
  assert.ok(saunaLiningBacking(moved)[0].missing.includes(course.id));
  const warning = validate(moved).find((f) => f.title === "Review sauna lining backing · Walls");
  assert.equal(warning?.pieceId, course.id);
  assert.match(warning!.detail, /1 with no nearby wood/);
  const markdown = guideMarkdown(generateBuildGuide(project));
  assert.match(markdown, /## Sauna lining backing[\s\S]+closest gap 0\.8125 in/);
  assert.match(markdown, /Paslode 650282 galvanized finish nails at Home Depot/);
  assert.match(markdown, /Paslode 515500 pneumatic finish nailer at Home Depot/);
  assert.deepEqual(saunaLiningBacking(createBuildStudy("sauna").project), []);
});

test("exact finish nails round to Home Depot boxes and the nailer remains a separate tool purchase", () => {
  const { project } = createBuildStudy("sauna", defaults, blank(), selections);
  const original = { ...project, store: "4401" };
  const capability = "drive-16ga-straight-finish-nail";
  const operation = (p: typeof original) => toolChecklist(p, selectedToolsForProject(p).tools)
    .requirements.find((req) => req.capability === capability);
  assert.equal(operation(original)?.necessity, "conditional");
  assert.equal(operation(original)?.status, "unknown");
  assert.equal(original.zip, "84121");
  assert.equal(supplyRows(original).length, 0);
  assert.deepEqual(saunaNailBoxPlan(original, 2000), { boxes: 1, selected: 0, missing: 1 });
  assert.throws(() => addSaunaNailBoxes(original, 2.5), /whole number/);
  const withNails = addSaunaNailBoxes(addSupply(original, nails.id, 1), 2001);
  assert.deepEqual(saunaNailBoxPlan(withNails, 2001), { boxes: 2, selected: 2, missing: 0 });
  assert.equal(addSaunaNailBoxes(withNails, 2001), withNails);
  const unpriced = addSupply(withNails, nailer.id, 1, "Sauna cedar lining");
  assert.deepEqual(unpriced.pieces, original.pieces);
  assert.deepEqual(unpriced.joints, original.joints);
  assert.equal(operation(unpriced)?.status, "unknown");
  const observation = {
    productId: nails.id,
    retailer: "home-depot",
    retailerProductId: nails.internetNumber,
    price: 20,
    available: 3,
    store: original.store,
    zip: original.zip,
    checkedAt: new Date().toISOString(),
    url: nails.listing,
  };
  const observed = recordSupplyInventory(unpriced, observation);
  const [fasteners, tool] = supplyRows(observed);
  assert.deepEqual([fasteners.quantity, fasteners.total, fasteners.isTool], [2, 40, false]);
  assert.deepEqual([tool.quantity, tool.total, tool.isTool], [1, null, true]);
  assert.equal(fasteners.purchaseSpec?.kind, "counted");
  const csv = shoppingCsv(observed);
  assert.match(csv, /"100122414","2","2,000-nail box","20.00","40.00"/);
  assert.match(csv, /"303137850","1","nailer","UNPRICED"/);
  assert.equal(supplyRows({ ...observed, store: "4402" })[0].total, null);
  assert.match(guideMarkdown(observed), /User-entered requirement for new boxes: 2001 nails/);
  assert.match(guideMarkdown(observed), /## Tools to buy[\s\S]+compatible compressor/);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(observed))).supplies, observed.supplies);
  assert.equal(operation({ ...observed, toolSelections: [{ productId: nailer.id, checkedAt: observation.checkedAt }] })?.status, "supported");
});
