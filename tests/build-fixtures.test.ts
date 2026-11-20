import test from "node:test";
import assert from "node:assert/strict";
import { bom, bounds } from "../src/engine";
import { material, projectSchema } from "../src/model";
import {
  buildFixtureIds,
  createBuildFixture,
  createBuildStudy,
  defaultBuildStudyParameters,
  evaluateBuildFixture,
  exportBuildFixture,
  fixtureCutTable,
  fixtureSources,
  getBuildFixture,
  importBuildFixture,
  listBuildFixtures,
  shelfBackStockFit,
  type FixtureEvidence,
} from "../src/buildFixtures";
import { stockCutSequences } from "../src/stockCutSequence";
import { recordStockCutLayout } from "../src/recordStockCutLayout";
import { inspectCutStock } from "../src/cutStock";
import { previewStudyShelfSupports } from "../src/studyShelfSupports";
import { everbiltShelfPin } from "../src/shelfPinReference";
import { addSupply, supplyRows } from "../src/supplies";

const now = Date.parse("2026-11-16T18:00:00.000Z");
test("all five versioned digital baselines retain explicit missing requirements rather than claiming completion", () => {
  assert.equal(listBuildFixtures().length, 5);
  assert.equal(new Set(listBuildFixtures().map((f) => f.id)).size, 5);
  for (const id of buildFixtureIds) {
    const definition = getBuildFixture(id),
      baseline = createBuildFixture(id),
      assessment = evaluateBuildFixture(baseline, {}, now);
    projectSchema.parse(baseline.project);
    assert.equal(assessment.buildReady, false);
    assert.equal(assessment.digitalReady, false);
    assert.ok(assessment.missingProducts.length);
    assert.ok(assessment.missingTools.length);
    assert.ok(assessment.missingDecisions.length);
    for (const list of [
      definition.geometry,
      definition.operations,
      definition.products,
      definition.tools,
      definition.decisions,
    ])
      for (const req of list) {
        assert.ok(req.id);
        for (const ref of req.sourceRefs)
          assert.ok(fixtureSources[ref], `Unknown source ${ref}`);
      }
  }
  const copies = listBuildFixtures();
  copies[0].title = "Changed";
  assert.notEqual(getBuildFixture(copies[0].id).title, "Changed");
});

test("the storage acceptance fixture has the real 42-part cut table and independently testable lids", () => {
  const baseline = createBuildFixture("storage-banquette"),
    p = baseline.project,
    assessment = evaluateBuildFixture(baseline, {}, now),
    cuts = fixtureCutTable(p);
  assert.equal(p.pieces.length, 42);
  assert.equal(p.sections.length, 3);
  assert.equal(assessment.missingGeometry.length, 0);
  assert.equal(
    cuts.reduce((n, r) => n + r.quantity, 0),
    42,
  );
  assert.ok(cuts.every((r) => r.stockFits));
  const exact = (size: number[]) =>
    cuts.find((r) => r.dimensions.every((v, i) => v === size[i]))?.quantity;
  assert.equal(exact([24, 0.75, 24]), 6);
  assert.equal(exact([24, 16.5, 0.75]), 6);
  assert.equal(exact([0.75, 16.5, 22.5]), 6);
  assert.equal(exact([1.5, 13, 3.5]), 12);
  assert.equal(exact([22.5, 3.5, 1.5]), 6);
  assert.equal(exact([1.5, 3.5, 19.5]), 6);
  assert.ok(
    !bom(p).some((r) => r.id === "screw" || r.id === "bracket"),
    "Unspecified hardware must not become installed quantities.",
  );
  assert.ok(
    assessment.missingProducts.some((r) => r.id === "hardware.seat-hinges"),
  );
  p.pieces[0].size[0] += 0.5;
  assert.ok(
    evaluateBuildFixture(baseline, {}, now).missingGeometry.some(
      (r) => r.id === "geometry.storage-shell",
    ),
    "Actual geometry changes must invalidate acceptance even if recipe flags/names remain.",
  );
});

test("shelf and closet baselines have actual nonintersecting casework but retain missing supports and rods", () => {
  for (const [id, count] of [
    ["shelves", 8],
    ["closet-insert", 10],
  ] as const) {
    const baseline = createBuildFixture(id),
      p = baseline.project;
    assert.equal(p.pieces.length, count);
    for (let i = 0; i < p.pieces.length; i++)
      for (let j = i + 1; j < p.pieces.length; j++) {
        const a = bounds(p.pieces[i]),
          b = bounds(p.pieces[j]);
        const volume = [0, 1, 2].reduce(
          (n, k) =>
            n *
            Math.max(
              0,
              Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]),
            ),
          1,
        );
        assert.ok(
          volume < 0.001,
          `${id}: ${p.pieces[i].name} intersects ${p.pieces[j].name}`,
        );
      }
    const report = evaluateBuildFixture(baseline, {}, now);
    assert.ok(
      !report.missingGeometry.some((r) => r.id === "geometry.fixture-envelope"),
    );
    if (id === "shelves")
      assert.ok(
        report.missingGeometry.some((r) => r.id === "geometry.shelf-supports"),
      );
    else {
      assert.ok(
        report.missingGeometry.some((r) => r.id === "geometry.closet-rods"),
      );
      assert.ok(
        report.missingGeometry.some(
          (r) => r.id === "geometry.closet-clearance",
        ),
      );
    }
  }
});

test("greenhouse and sauna remain incomplete families; generic boxes cannot satisfy their feature gates", () => {
  const greenhouse = createBuildFixture("greenhouse"),
    g = evaluateBuildFixture(greenhouse, {}, now);
  assert.ok(greenhouse.project.sections.length >= 6);
  assert.equal(greenhouse.project.planLines.length, 4);
  assert.ok(
    !g.missingGeometry.some((r) => r.id === "geometry.greenhouse-wall-frames"),
  );
  for (const id of [
    "geometry.greenhouse-openings",
    "geometry.greenhouse-glazing",
  ])
    assert.ok(g.missingGeometry.some((r) => r.id === id));
  assert.ok(
    !g.missingGeometry.some((r) => r.id === "geometry.greenhouse-roof"),
  );
  const cut = greenhouse.project.pieces.find((p) => p.cutPlanes.length === 2)!;
  cut.cutPlanes = [];
  assert.ok(
    evaluateBuildFixture(greenhouse, {}, now).missingGeometry.some(
      (r) => r.id === "geometry.greenhouse-roof",
    ),
  );
  const sauna = createBuildFixture("sauna"),
    s = evaluateBuildFixture(sauna, {}, now);
  assert.equal(sauna.project.planLines.length, 4);
  assert.ok(s.missingGeometry.some((r) => r.id === "geometry.sauna-equipment"));
  assert.ok(s.missingGeometry.some((r) => r.id === "geometry.sauna-envelope"));
  assert.ok(
    s.missingProducts.some((r) => r.id.startsWith("material.unmatched.")),
  );
  assert.equal(s.traceableProducts.length, 0);
  assert.match(sauna.baselineScope, /incomplete/);
});

function plywoodEvidence(): FixtureEvidence {
  const baseline = createBuildFixture("shelves"),
    row = bom(baseline.project).find((r) => r.id === "plywood")!;
  return {
    products: [
      {
        requirementId: "material.panel.plywood.0.75",
        productId: "TEST-FIXTURE-ONLY",
        registryRef: "test-registry:sheet",
        sourceUrl: "https://example.com/test-fixture-sheet",
        qualification: "verified",
        matchedMaterialIds: ["plywood"],
        stockDimensions:
          material("plywood").stockSize ?? material("plywood").size,
        requiredUnits: row.quantity,
        unitsPerPackage: 1,
        packages: row.quantity,
        availability: {
          storeId: "test-store",
          zip: baseline.project.zip,
          observedAt: new Date(now).toISOString(),
          availablePackages: row.quantity,
        },
      },
    ],
    storeTargets: [{ storeId: "test-store", zip: baseline.project.zip }],
  };
}

test("product gates require exact physical stock, package conversion and fresh matching availability", () => {
  const baseline = createBuildFixture("shelves"),
    e = plywoodEvidence();
  let report = evaluateBuildFixture(baseline, e, now);
  assert.ok(
    !report.missingProducts.some((r) => r.id === "material.panel.plywood.0.75"),
  );
  assert.equal(report.traceableProducts.length, 1);
  assert.ok(
    !report.missingAvailability.some(
      (r) => r.id === "material.panel.plywood.0.75",
    ),
  );
  assert.equal(
    report.buildReady,
    false,
    "A real sheet mapping cannot erase missing supports/operations/design.",
  );
  e.products![0].stockDimensions = [48, 1, 96];
  report = evaluateBuildFixture(baseline, e, now);
  assert.ok(
    report.missingProducts.some((r) =>
      /Physical stock dimensions/.test(r.reason),
    ),
  );
  const wrongPack = plywoodEvidence();
  wrongPack.products![0].packages++;
  assert.ok(
    evaluateBuildFixture(baseline, wrongPack, now).missingProducts.some((r) =>
      /package conversion/.test(r.reason),
    ),
  );
  const stale = plywoodEvidence();
  stale.products![0].availability!.observedAt = "2026-11-14T18:00:00.000Z";
  assert.ok(
    evaluateBuildFixture(baseline, stale, now).missingAvailability.length,
  );
  const wrongStore = plywoodEvidence();
  wrongStore.products![0].availability!.storeId = "other-store";
  assert.ok(
    evaluateBuildFixture(baseline, wrongStore, now).missingAvailability.length,
  );
  const candidate = plywoodEvidence();
  candidate.products![0].qualification = "candidate";
  assert.equal(
    evaluateBuildFixture(baseline, candidate, now).traceableProducts.length,
    0,
  );
});

test("package quantities cannot invent unresolved hardware schedules and operation records need real parts", () => {
  const baseline = createBuildFixture("storage-banquette"),
    e: FixtureEvidence = {
      products: [
        {
          requirementId: "hardware.seat-hinges",
          productId: "TEST-HINGE-ONLY",
          registryRef: "test-registry:hinge",
          sourceUrl: "https://example.com/test-fixture-hinge",
          qualification: "verified",
          requiredUnits: 6,
          unitsPerPackage: 2,
          packages: 3,
        },
      ],
      operations: [
        {
          requirementId: "operation.cut-schedule",
          recordRefs: ["test-operation"],
          partIds: ["missing-part"],
          sourceRefs: ["test-review"],
        },
      ],
    };
  const report = evaluateBuildFixture(baseline, e, now);
  assert.ok(
    report.missingProducts.some(
      (r) =>
        r.id === "hardware.seat-hinges" &&
        /quantity remains unresolved/.test(r.reason),
    ),
  );
  assert.ok(
    report.missingOperations.some((r) => r.id === "operation.cut-schedule"),
  );
  assert.equal(report.traceableProducts.length, 0);
  const shelves = createBuildFixture("shelves"),
    pins: FixtureEvidence = {
      products: [
        {
          requirementId: "hardware.shelf-pins",
          productId: "TEST-PIN-ONLY",
          registryRef: "test-registry:pins",
          sourceUrl: "https://example.com/test-fixture-pins",
          qualification: "verified",
          requiredUnits: 12,
          unitsPerPackage: 50,
          packages: 1,
        },
      ],
    };
  assert.ok(
    evaluateBuildFixture(shelves, pins, now).traceableProducts.some(
      (r) => r.requirementId === "hardware.shelf-pins" && r.packages === 1,
    ),
  );
});

test("fixture export round-trips geometry; imported documentary assertions require registry re-resolution", () => {
  const baseline = createBuildFixture("storage-banquette"),
    raw = JSON.parse(exportBuildFixture(baseline));
  raw.assessment.buildReady = true;
  raw.baseline.baselineScope = "Completed and approved";
  raw.evidence = { products: [{ qualification: "verified" }] };
  const restored = importBuildFixture(JSON.stringify(raw));
  assert.deepEqual(restored.baseline.project, baseline.project);
  assert.deepEqual(restored.evidence, {});
  assert.equal(
    restored.baseline.baselineScope,
    getBuildFixture("storage-banquette").baselineScope,
  );
  assert.equal(
    evaluateBuildFixture(restored.baseline, restored.evidence, now).buildReady,
    false,
  );
  raw.baseline.version = 999;
  assert.throws(() => importBuildFixture(JSON.stringify(raw)));
});

test("whole-build studies use independent dimensions and copy only matching retailer/store observations and tools", () => {
  const context = createBuildFixture("storage-banquette").project;
  context.retailer = "lowes";
  context.zip = "84121";
  context.store = "fixture-store";
  context.workZone = { width: 36, depth: 16, height: 72 };
  context.toolSelections = [
    { productId: "dewalt-dcd771c2", checkedAt: new Date(now).toISOString() },
  ];
  const common = {
    material: "stud" as const,
    internetNumber: "1234567",
    name: "Observed stock",
    price: 5,
    available: 20,
    store: "fixture-store",
    zip: "84121",
    checkedAt: new Date(now).toISOString(),
  };
  context.inventory = [
    {
      ...common,
      retailer: "lowes",
      url: "https://www.lowes.com/pd/fixture/1234567",
    },
    {
      ...common,
      retailer: "home-depot",
      url: "https://www.homedepot.com/p/1234567",
    },
    {
      ...common,
      store: "other-store",
      retailer: "lowes",
      url: "https://www.lowes.com/pd/fixture/1234567",
    },
  ];
  const before = structuredClone(context),
    params = {
      ...defaultBuildStudyParameters("shelves"),
      width: 48,
      depth: 20,
      height: 60,
      shelfCount: 4,
    };
  const study = createBuildStudy("shelves", params, context);
  assert.deepEqual(context, before);
  assert.notEqual(study.project.id, context.id);
  assert.equal(study.project.retailer, "lowes");
  assert.equal(study.project.zip, "84121");
  assert.equal(study.project.store, "fixture-store");
  assert.deepEqual(study.project.toolSelections, context.toolSelections);
  assert.deepEqual(study.project.workZone, context.workZone);
  assert.ok(study.unresolved.some((r) => r.id === "work-zone-fit"));
  assert.ok(study.project.notes.includes("work-zone-fit"));
  assert.equal(study.project.inventory.length, 1);
  assert.equal(study.project.inventory[0].retailer, "lowes");
  assert.equal(study.project.pieces.length, 9);
  const boxes = study.project.pieces.map(bounds);
  assert.equal(
    Math.max(...boxes.map((b) => b.max[0])) -
      Math.min(...boxes.map((b) => b.min[0])),
    48,
  );
  assert.equal(Math.max(...boxes.map((b) => b.max[1])), 60);
  const greenhouse = createBuildStudy("greenhouse", {
    ...defaultBuildStudyParameters("greenhouse"),
    height: 90,
    roofRise: 30,
  });
  assert.equal(greenhouse.structure?.dimensions.ridgeHeight, 120);
  assert.throws(
    () =>
      createBuildStudy("greenhouse", {
        ...defaultBuildStudyParameters("greenhouse"),
        height: NaN,
      }),
    /positive study dimensions/,
  );
});

test("a separate study retains only matching Home Depot supply snapshots", () => {
  const context = createBuildFixture("storage-banquette").project;
  context.store = "fixture-store";
  const snapshot = {
    productId: "kreg-kma3232",
    retailer: "home-depot" as const,
    retailerProductId: "319450681",
    price: 38,
    available: 4,
    store: context.store,
    zip: context.zip,
    checkedAt: new Date(now).toISOString(),
    url: "https://www.homedepot.com/p/319450681",
  };
  const original = addSupply(context, snapshot.productId, 2);
  original.supplyInventory = [
    snapshot,
    { ...snapshot, store: "other-store" },
    { ...snapshot, zip: "84047" },
  ];

  const { project } = createBuildStudy("shelves", undefined, original);
  assert.deepEqual(project.supplyInventory, [snapshot]);
  assert.deepEqual(project.supplies, []);
  assert.equal(original.supplies[0].quantity, 2);
  assert.equal(original.supplyInventory.length, 3);
  const withJig = addSupply(project, snapshot.productId, 1);
  assert.deepEqual(supplyRows(withJig, now)[0].inventory, snapshot);
});

test("the shelf back warning uses actual sheet width and kerf and its suggested width produces a cut order", () => {
  const params = defaultBuildStudyParameters("shelves");
  const selections = {
    caseworkPanels: {
      materialId: "plytanium-703",
      productRegistryRef: "plytanium-bc-201428",
    },
  } as const;
  const at = (width: number) =>
    createBuildStudy("shelves", { ...params, width }, undefined, selections);
  assert.equal(shelfBackStockFit(at(48))?.state, "too-long");
  const thinTrim = shelfBackStockFit(at(47.875));
  assert.deepEqual(thinTrim, {
    state: "thin-trim",
    backWidth: 47.875,
    sheetWidth: 47.938,
    kerf: 0.125,
    suggestedWidth: 47.75,
  });
  assert.equal(shelfBackStockFit(at(47.938)), null);
  const adjusted = at(thinTrim!.suggestedWidth);
  const rows = bom(adjusted.project);
  assert.equal(shelfBackStockFit(adjusted), null);
  assert.ok(rows.every((row) => !row.oversizedParts.length));
  const sheets = stockCutSequences(adjusted.project, rows).get("plytanium-703")!;
  assert.equal(sheets.length, 3);
  assert.ok(sheets.every((sheet) => !sheet.review));
  assert.ok(sheets[0].steps.some((step) => /Rip 47.75 in .*Back/.test(step)));

  let recorded = adjusted.project;
  for (let i = 0; i < sheets.length; i++) {
    const [nextSheet] = stockCutSequences(recorded, bom(recorded)).get("plytanium-703")!;
    recorded = recordStockCutLayout(recorded, nextSheet.layout).project;
  }
  assert.equal(stockCutSequences(recorded, bom(recorded)).size, 0);
  assert.equal(bom(recorded)[0].physicalStockUnits, 3);
  assert.equal(inspectCutStock(recorded).valid.size, 3);
  assert.equal(inspectCutStock(recorded).invalid.length, 0);
});

test("study support layouts bind actual shelves before purchase or measurement", () => {
  for (const [family, count] of [["shelves", 3], ["closet-insert", 4]] as const) {
    const { project } = createBuildStudy(family);
    const candidate = previewStudyShelfSupports(project, { frontInset: 2, rearInset: 2 });
    const { review, purchases } = candidate;
    assert.equal(review.plan.productId, everbiltShelfPin.productId);
    assert.equal(review.activePinCount, count * 4);
    assert.equal(new Set(review.plan.points.map(({ shelf }) => shelf.pieceId)).size, count);
    assert.equal(new Set(review.plan.points.map(({ mount }) => mount.pieceId)).size, 2);
    assert.equal(review.state, "needs-measurements");
    assert.ok(review.points.every(({ holeCenterLocal }) => holeCenterLocal === null));
    assert.equal(purchases.pinsPerPack, 48);
    assert.equal(purchases.requiredPacks, 1);
    assert.deepEqual(candidate.project.supplies, []);
    assert.deepEqual(candidate.project.pieces, project.pieces);
    assert.deepEqual(project.attachmentPlans, []);

    const conflict = previewStudyShelfSupports(project, { frontInset: 12, rearInset: 12 });
    assert.equal(conflict.review.activePinCount, 0);
    assert.equal(conflict.review.state, "conflict");
    assert.ok(conflict.review.issues.some(({ code }) => code === "row-order"));
    assert.equal(conflict.purchases.requiredPacks, 0);
  }
});

test("study material selections generate source-exact thickness before casework geometry and keep unresolved hardware", () => {
  for (const id of ["storage-banquette", "shelves"] as const) {
    const study = createBuildStudy(
      id,
      defaultBuildStudyParameters(id),
      undefined,
      {
        caseworkPanels: {
          materialId: "plytanium-703",
          productRegistryRef: "plytanium-bc-201428",
        },
      },
    );
    const panels = study.project.pieces.filter(
      (p) => p.material === "plytanium-703",
    );
    assert.ok(panels.length);
    assert.ok(
      panels.every((p) => Math.abs(Math.min(...p.size) - 0.703) < 0.0001),
    );
    assert.ok(!study.project.pieces.some((p) => p.material === "plywood"));
    const bs = study.project.pieces.map(bounds),
      expected = defaultBuildStudyParameters(id);
    assert.ok(
      Math.abs(Math.max(...bs.map((b) => b.max[1])) - expected.height) < 0.001,
    );
    assert.ok(
      Math.abs(
        Math.max(...bs.map((b) => b.max[0])) -
          Math.min(...bs.map((b) => b.min[0])) -
          expected.width,
      ) < 0.001,
    );
    assert.ok(study.missingMaterials.some((i) => i.id.startsWith("hardware.")));
    assert.match(study.project.notes, /Dry interior/);
    if (id === "storage-banquette")
      assert.ok(
        study.project.sections.every(
          (s) => s.recipe?.panelMaterial === "plytanium-703",
        ),
      );
  }
  const greenhouse = createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    undefined,
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  );
  assert.equal(greenhouse.project.pieces.length, 101);
  assert.match(greenhouse.baselineScope, /glazing envelopes/);
  assert.match(greenhouse.project.notes, /allowance deductions/);
  const closet = createBuildStudy(
    "closet-insert",
    defaultBuildStudyParameters("closet-insert"),
    undefined,
    {
      closetRod: {
        materialId: "closet-rod-72",
        productRegistryRef: "project-source-27773pholg",
      },
    },
  );
  assert.equal(closet.project.pieces.length, 12);
  assert.match(closet.baselineScope, /two source-sized/);
});
