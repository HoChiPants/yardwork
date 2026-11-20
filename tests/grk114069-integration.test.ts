import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectSchema, type Project, type V3 } from "../src/model";
import type { FastenerPlan } from "../src/fasteningSchema";
import { getWoodFastenerProduct } from "../src/fastenerProducts";
import {
  addFastenerLocation,
  changeFastenerProduct,
  fastenerReviews,
  makeFastenerPlan,
  refreshFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { fastenerReferenceSnapshot } from "../src/fastenerReferences";
import {
  addMissingFastenerPacks,
  fastenerPurchaseSummary,
} from "../src/fastenerPurchases";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";
import { fastenerGuideText } from "../src/fastenerGuide";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import {
  bom,
  guideMarkdown,
  inspectCutStock,
  shoppingCsv,
} from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { rotate } from "../src/spatial";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";

const productId = "grk-cabinet-114069" as const;
const basis =
  "SYNTHETIC software-test proposed depth after seating; not manufacturer or real installation evidence";
const measuredAt = "2026-11-17T00:00:00.000Z";
const emptyMeasurements = {
  surfaceToTipDepth: null,
  pilotDiameter: null,
  pilotDepth: null,
  basis: "",
  measuredAt: null,
};

function publicFixture(): Project {
  return projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/builds/storage-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}
function archivedFixture(): Project {
  const stored = JSON.parse(
    readFileSync(
      new URL("./fixtures/format10-catalog-cuts.wrapper.json", import.meta.url),
      "utf8",
    ),
  );
  return projectSchema.parse(stored.project);
}
function actualPair(project: Project) {
  const byLabel = (label: string) =>
    project.pieces.find(
      (piece) =>
        piece.id ===
        project.partLabels.find((row) => row.label === label)?.partId,
    )!;
  const head = byLabel("P003"),
    receiver = byLabel("P011");
  assert.equal(head.designRole, "storage-front");
  assert.equal(receiver.designRole, "top-rail");
  assert.equal(head.material, "plytanium-703");
  assert.deepEqual(head.size, [24, 16.594, 0.703]);
  assert.deepEqual(receiver.size, [22.594, 3.5, 1.5]);
  return { head, receiver };
}
function emptyPlan(
  project: Project,
  chosenProduct: FastenerPlan["productId"] = productId,
) {
  const { head, receiver } = actualPair(project);
  return makeFastenerPlan(project, head.id, receiver.id, {
    productId: chosenProduct,
    name: "SYNTHETIC P003 front shell to P011 front rail",
  });
}
function enteredPlan(
  project: Project,
  depth: number | null = null,
  chosenProduct: FastenerPlan["productId"] = productId,
) {
  const plan = addFastenerLocation(emptyPlan(project, chosenProduct));
  plan.locations[0].entranceLocal = [0, 6.547, 0.3515];
  plan.locations[0].driveLocal = [0, 0, -1];
  if (depth !== null)
    plan.measurements = {
      ...emptyMeasurements,
      surfaceToTipDepth: depth,
      basis,
      measuredAt,
    };
  return plan;
}
function review(project: Project, planId: string) {
  return fastenerReviews(project).find((row) => row.plan.id === planId)!;
}
function demand(project: Project) {
  return fastenerPurchaseSummary(project).products.find(
    (row) => row.productId === productId,
  )!;
}
function close(actual: number | null, expected: number, message = "") {
  assert.notEqual(actual, null, message);
  assert.ok(
    Math.abs(actual! - expected) < 1e-10,
    `${message}: ${actual} != ${expected}`,
  );
}
function closeVector(actual: V3 | null, expected: V3) {
  assert.ok(actual);
  expected.forEach((value, axis) =>
    close(actual![axis], value, `axis ${axis}`),
  );
}
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  assert.equal(quoted, false);
  assert.ok(rows.length > 1);
  assert.ok(
    rows.every((item) => item.length === rows[0].length),
    "CSV must be rectangular",
  );
  return rows
    .slice(1)
    .map((item) =>
      Object.fromEntries(rows[0].map((key, index) => [key, item[index]])),
    );
}
function csvLocation(project: Project, planId: string) {
  return csvRows(fastenerScheduleCsv(project)).find(
    (row) => row["Plan ID"] === planId,
  )!;
}

test("the new actual-pair factory starts empty and a nominal1.25in reference supplies no tip, pilot, purchase or tool", () => {
  const project = publicFixture(),
    before = structuredClone(project),
    plan = emptyPlan(project);
  const fact = getWoodFastenerProduct(productId)!;
  assert.equal(fact.nominalLength, 1.25);
  assert.equal(fact.packCount, 100);
  assert.equal(fact.drive, "T15");
  assert.equal(fact.surfaceToTipDepth, null);
  assert.equal(fact.tipLength, null);
  assert.equal(plan.productId, productId);
  assert.deepEqual(plan.locations, []);
  assert.deepEqual(plan.measurements, emptyMeasurements);
  const saved = saveFastenerPlan(project, plan);
  assert.equal(review(saved, plan.id).activePointCount, 0);
  assert.equal(demand(saved).plannedScrews, 0);
  assert.equal(demand(saved).requiredPacks, 0);
  assert.deepEqual(saved.pieces, before.pieces);
  assert.deepEqual(saved.sections, before.sections);
  assert.deepEqual(saved.supplies, before.supplies);
  assert.deepEqual(saved.toolSelections, before.toolSelections);
  assert.deepEqual(project, before);
});

test("literal current P003→P011 path has .703..2.203in intervals and no nominally invented tip", () => {
  const project = publicFixture(),
    plan = enteredPlan(project),
    saved = saveFastenerPlan(project, plan);
  const point = review(saved, plan.id).locations[0],
    { head } = actualPair(saved);
  assert.equal(point.state, "needs-measurements");
  assert.equal(point.includedInDemand, true);
  close(point.headExitDepth, 0.703);
  close(point.receiverEnterDepth, 0.703);
  close(point.receiverExitDepth, 2.203);
  close(point.gap, 0);
  close(point.availableReceiverDepth, 1.5);
  const rotated = rotate(plan.locations[0].entranceLocal!, head.rotation);
  closeVector(
    point.entranceWorld,
    rotated.map((value, axis) => value + head.position[axis]) as V3,
  );
  closeVector(point.entranceWorld, [-24, 15.547, 12]);
  assert.equal(point.tipWorld, null);
  assert.equal(point.penetration, null);
  assert.ok(point.issues.some((issue) => issue.code === "depth-pending"));
  assert.ok(
    review(saved, plan.id).issues.some(
      (issue) => issue.code === "pilot-pending",
    ),
  );
  const csv = csvLocation(saved, plan.id);
  assert.equal(csv["Product"], productId);
  assert.equal(csv["Proposed surface-to-tip depth (in)"], "");
  assert.equal(csv["Entered pilot diameter (in)"], "");
  assert.equal(csv["Deepest pilot-drill-tip depth (in)"], "");
  assert.equal(csv["Head exit depth (in)"], "0.703");
  assert.equal(csv["Receiver exit depth (in)"], "2.203");
  assert.match(fastenerGuideText(saved), /nominal 1\.25 in/);
  assert.match(fastenerGuideText(saved), /proposed surface-to-tip PENDING/);
});

test("explicit1.25in proposed seating yields .547in geometric penetration and .953in remaining receiver, with pilot still unknown", () => {
  const project = publicFixture(),
    plan = enteredPlan(project, 1.25),
    saved = saveFastenerPlan(project, plan);
  const point = review(saved, plan.id).locations[0];
  assert.equal(point.state, "path-reviewed");
  assert.equal(point.includedInDemand, true);
  close(point.penetration, 0.547);
  close(point.receiverExitDepth! - 1.25, 0.953);
  closeVector(point.tipWorld, [-24, 15.547, 10.75]);
  assert.equal(saved.fastenerPlans[0].measurements.pilotDiameter, null);
  assert.equal(saved.fastenerPlans[0].measurements.pilotDepth, null);
  const csv = csvLocation(saved, plan.id);
  assert.equal(csv["Proposed surface-to-tip depth (in)"], "1.25");
  assert.equal(csv["Receiver tip-path penetration (in)"], "0.547");
  assert.equal(csv["Entrance world Y (in)"], "15.547");
  assert.equal(csv["Entered pilot diameter (in)"], "");
  assert.equal(csv["Deepest pilot-drill-tip depth (in)"], "");
  assert.match(
    csv["Scope"],
    /not.*thread engagement|No released.*thread engagement/i,
  );
  assert.match(fastenerGuideText(saved), /This is not thread engagement/);
  assert.deepEqual(saved.pieces, project.pieces);
  assert.deepEqual(bom(saved), bom(project));
});

for (const [depth, issueCode] of [
  [0.6, "no-penetration"],
  [0.703, "no-penetration"],
  [2.203, "tip-breakthrough"],
  [2.5, "tip-breakthrough"],
] as const)
  test(`${depth}in proposed depth is excluded by actual retained receiver boundaries, independently of the product name`, () => {
    const project = publicFixture(),
      plan = enteredPlan(project, depth),
      saved = saveFastenerPlan(project, plan),
      point = review(saved, plan.id).locations[0];
    assert.equal(point.state, "conflict");
    assert.equal(point.includedInDemand, false);
    assert.ok(point.issues.some((issue) => issue.code === issueCode));
    assert.equal(demand(saved).plannedScrews, 0);
    assert.equal(demand(saved).excludedLocations, 1);
    assert.equal(saved.fastenerPlans[0].measurements.surfaceToTipDepth, depth);
    const csv = csvLocation(saved, plan.id);
    for (const field of [
      "Entrance local X (in)",
      "Entrance world Z (in)",
      "Head exit depth (in)",
      "Receiver entry depth (in)",
      "Receiver exit depth (in)",
      "Proposed surface-to-tip depth (in)",
      "Receiver tip-path penetration (in)",
    ])
      assert.equal(csv[field], "", field);
    assert.match(fastenerGuideText(saved), /Coordinates and depths withheld/);
  });

test("relative movement stales exact references and a cut-away receiver stays missed after explicit same-ID refresh", () => {
  const project = publicFixture(),
    plan = enteredPlan(project, 1.25),
    saved = saveFastenerPlan(project, plan),
    { receiver } = actualPair(saved);
  const moved = structuredClone(saved);
  moved.pieces.find((piece) => piece.id === receiver.id)!.position[2] -= 0.125;
  assert.equal(review(moved, plan.id).state, "stale");
  assert.equal(demand(moved).plannedScrews, 0);
  assert.deepEqual(moved.fastenerPlans, saved.fastenerPlans);
  const cut = structuredClone(saved);
  cut.pieces.find((piece) => piece.id === receiver.id)!.cutPlanes = [
    { normal: [1, 0, 0], constant: -1 },
  ];
  assert.equal(review(cut, plan.id).state, "stale");
  const refreshed = refreshFastenerPlan(cut, cut.fastenerPlans[0]);
  assert.deepEqual(refreshed.locations, plan.locations);
  assert.deepEqual(refreshed.measurements, emptyMeasurements);
  assert.deepEqual(
    refreshed.referenceHistory.at(-1)!.previous.measurements,
    plan.measurements,
  );
  const current = saveFastenerPlan(cut, refreshed),
    point = review(current, plan.id).locations[0];
  assert.equal(point.state, "conflict");
  assert.ok(point.issues.some((issue) => issue.code === "missed-receiver"));
  assert.equal(point.receiverEnterDepth, null);
  assert.equal(point.receiverExitDepth, null);
  assert.equal(demand(current).plannedScrews, 0);
  assert.equal(csvLocation(current, plan.id)["Receiver exit depth (in)"], "");
});

test("the short screw does not solve the actual3.5in top-rail-to-leg reach limitation", () => {
  const project = publicFixture(),
    { receiver: rail } = actualPair(project),
    legId = project.partLabels.find((row) => row.label === "P007")!.partId,
    leg = project.pieces.find((piece) => piece.id === legId)!;
  assert.equal(leg.designRole, "leg");
  let plan = addFastenerLocation(
    makeFastenerPlan(project, rail.id, leg.id, { productId }),
  );
  plan.locations[0].entranceLocal = [
    leg.position[0] - rail.position[0],
    1.75,
    0,
  ];
  plan.locations[0].driveLocal = [0, -1, 0];
  plan.measurements = {
    ...emptyMeasurements,
    surfaceToTipDepth: 1.25,
    basis,
    measuredAt,
  };
  const saved = saveFastenerPlan(project, plan),
    point = review(saved, plan.id).locations[0];
  close(point.headExitDepth, 3.5);
  close(point.receiverEnterDepth, 3.5);
  assert.equal(point.state, "conflict");
  assert.equal(point.includedInDemand, false);
  assert.ok(point.issues.some((issue) => issue.code === "no-penetration"));
  assert.equal(demand(saved).plannedScrews, 0);
  assert.deepEqual(saved.pieces, project.pieces);
});

test("explicit old2.5in cabinet→new1.25in switch appends exact history, retains W/F identities and clears every current measurement", () => {
  const project = publicFixture(),
    oldPlan = enteredPlan(project, 2, "grk-cabinet-113079");
  oldPlan.measurements.pilotDiameter = 0.125;
  oldPlan.measurements.pilotDepth = 1.75;
  const saved = saveFastenerPlan(project, oldPlan),
    old = structuredClone(saved.fastenerPlans[0]),
    input = structuredClone(saved);
  const changed = changeFastenerProduct(
    saved,
    saved.fastenerPlans[0],
    productId,
  );
  assert.equal(changed.id, old.id);
  assert.equal(changed.label, old.label);
  assert.deepEqual(changed.locations, old.locations);
  assert.deepEqual(changed.head, old.head);
  assert.deepEqual(changed.receiver, old.receiver);
  assert.equal(changed.nextLocationNumber, old.nextLocationNumber);
  assert.deepEqual(changed.measurements, emptyMeasurements);
  assert.equal(
    changed.referenceHistory.length,
    old.referenceHistory.length + 1,
  );
  assert.deepEqual(
    changed.referenceHistory.at(-1)!.previous,
    fastenerReferenceSnapshot(old),
  );
  assert.equal(changed.referenceHistory.at(-1)!.next.productId, productId);
  assert.deepEqual(saved, input);
  const current = saveFastenerPlan(saved, changed),
    csv = csvLocation(current, changed.id);
  assert.equal(csv["Proposed surface-to-tip depth (in)"], "");
  assert.equal(csv["Entered pilot diameter (in)"], "");
  assert.equal(csv["Recorded reference reviews"], "1");
  assert.equal(
    changeFastenerProduct(current, current.fastenerPlans[0], productId),
    current.fastenerPlans[0],
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(current))),
    current,
  );
  const forged = structuredClone(current.fastenerPlans[0]);
  forged.referenceHistory[0].previous.measurements.surfaceToTipDepth = 1.25;
  assert.throws(() => saveFastenerPlan(current, forged), /history/i);
});

test("101 explicit points across actual shell/rail plans round once to two100-boxes; manual selection, add-missing and exact per-box snapshots never double-charge", () => {
  let project = publicFixture();
  project.store = "SYNTHETIC-GRK114069-store";
  project.zip = "84121";
  for (const [count, offset] of [
    [60, 0],
    [41, 60],
  ]) {
    let plan = emptyPlan(project);
    for (let index = 0; index < count; index++) {
      plan = addFastenerLocation(plan);
      plan.locations[index].entranceLocal = [
        -10 + (offset + index) * 0.2,
        6.547,
        0.3515,
      ];
      plan.locations[index].driveLocal = [0, 0, -1];
    }
    project = saveFastenerPlan(project, plan);
  }
  const physical = structuredClone(project),
    initial = demand(project);
  assert.equal(initial.plannedScrews, 101);
  assert.equal(initial.packCount, 100);
  assert.equal(initial.requiredPacks, 2);
  assert.equal(initial.selectedPacks, 0);
  assert.equal(initial.provisional, true);
  assert.equal(homeDepotPurchaseNeeds(project).find(({ id }) => id === productId)?.quantityText,
    "2 100-screw boxes");
  project = addSupply(
    project,
    productId,
    1,
    "SYNTHETIC explicit manual100-pack",
  );
  assert.equal(demand(project).shortfallPacks, 1);
  const fromHandoff = addHomeDepotPurchaseNeed(project, productId);
  assert.equal(demand(fromHandoff).selectedPacks, 2);
  assert.equal(fromHandoff.supplies.at(-1)?.quantity, 1);
  assert.equal(addHomeDepotPurchaseNeed(fromHandoff, productId), fromHandoff);
  project = addMissingFastenerPacks(project, productId);
  assert.equal(demand(project).selectedPacks, 2);
  assert.equal(demand(project).selectedScrews, 200);
  assert.equal(demand(project).spareScrews, 99);
  assert.deepEqual(addMissingFastenerPacks(project, productId), project);
  const now = Date.now(),
    product = findRetailerProduct(productId)!,
    offer = referenceOffersForProduct(product).find(
      (row) => row.retailer === project.retailer,
    )!;
  const observation = {
    productId,
    retailer: project.retailer,
    retailerProductId: offer.productId,
    price: 12.75,
    available: 3,
    store: project.store,
    zip: project.zip,
    checkedAt: new Date(now).toISOString(),
    url: offer.url,
  };
  project = recordSupplyInventory(project, observation);
  const rows = supplyRows(project, now).filter(
    (row) => row.productId === productId,
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.quantity, 0),
    2,
  );
  assert.ok(rows.every((row) => row.contents[0].quantity === 100));
  assert.equal(
    rows.reduce((sum, row) => sum + (row.total ?? 0), 0),
    25.5,
  );
  assert.ok(
    supplyRows({ ...project, store: "SYNTHETIC-other-store" }, now)
      .filter((row) => row.productId === productId)
      .every((row) => row.total === null),
  );
  assert.ok(
    supplyRows(project, now + 86400001)
      .filter((row) => row.productId === productId)
      .every((row) => row.total === null),
  );
  assert.throws(() =>
    recordSupplyInventory(project, {
      ...observation,
      retailerProductId: "203525221",
    }),
  );
  const shopping = shoppingCsv(project);
  assert.ok(shopping.includes(offer.productId));
  assert.ok(shopping.includes(offer.url));
  assert.match(shopping, /snapshot/i);
  assert.deepEqual(project.pieces, physical.pieces);
  assert.deepEqual(project.joints, physical.joints);
  assert.deepEqual(bom(project), bom(physical));
  assert.deepEqual(project.toolSelections, physical.toolSelections);
});

test("saving a short screw or its box never owns T15; a checked exact bit supports only its documented drive accessory", () => {
  const original = publicFixture(),
    plan = enteredPlan(original, 1.25);
  let project = addMissingFastenerPacks(
    saveFastenerPlan(original, plan),
    productId,
  );
  assert.deepEqual(project.toolSelections, original.toolSelections);
  const requirements = toolChecklist(project).requirements;
  const bit = requirements.find((row) => row.capability === "drive-t15")!,
    driver = requirements.find((row) => row.capability === "drive-screw")!;
  assert.equal(bit.status, "unknown");
  assert.equal(driver.status, "unknown");
  assert.deepEqual(bit.supportedBy, []);
  assert.ok(
    bit.sources.some(
      (source) => source.kind === "fastener-plan" && source.id === plan.id,
    ),
  );
  const now = Date.now();
  project = {
    ...project,
    toolSelections: [
      {
        productId: "grk-187427-t15-bits",
        checkedAt: new Date(now).toISOString(),
      },
    ],
  };
  const selected = selectedToolsForProject(project, now),
    checklist = toolChecklist(project, selected.tools, now);
  assert.equal(
    checklist.requirements.find((row) => row.capability === "drive-t15")!
      .status,
    "supported",
  );
  assert.equal(
    checklist.requirements.find((row) => row.capability === "drive-screw")!
      .status,
    "unknown",
  );
  assert.deepEqual(
    checklist.requirements.find((row) => row.capability === "drive-screw")!
      .supportedBy,
    [],
  );
  assert.match(toolGuideMarkdown(project, now), /T15/);
  assert.equal(project.fastenerPlans[0].measurements.pilotDiameter, null);
  assert.equal(project.fastenerPlans[0].measurements.pilotDepth, null);
});

test("authentic format10 context keeps all46 actual pieces/original42, W/H/C histories, source-once BOM, source choices and checked custom H/C phases through short-plan guide/JSON export", () => {
  const baseline = archivedFixture(),
    before = structuredClone(baseline),
    plan = enteredPlan(baseline, 1.25);
  assert.equal(baseline.pieces.length, 46);
  assert.equal(baseline.fastenerPlans.length, 3);
  assert.equal(baseline.lidHingePlans.length, 3);
  assert.equal(baseline.connectorPlans.length, 1);
  const checked = baseline.steps.filter((step) => step.complete);
  assert.equal(checked.length, 2);
  assert.ok(
    checked.some((step) => step.generated?.kind === "connector-preparation"),
  );
  assert.ok(
    checked.some((step) => step.generated?.kind === "lid-hinge-preparation"),
  );
  let project = saveFastenerPlan(baseline, plan);
  for (const field of [
    "pieces",
    "sections",
    "joints",
    "ideaBindings",
    "lidHingePlans",
    "hingeStockSources",
    "connectorPlans",
    "partLabels",
    "inventory",
    "supplies",
    "supplyInventory",
    "toolSelections",
    "history",
    "notes",
  ] as const)
    assert.deepEqual(project[field], before[field], field);
  assert.deepEqual(project.fastenerPlans.slice(0, 3), before.fastenerPlans);
  assert.deepEqual(project.steps, before.steps);
  assert.deepEqual(inspectCutStock(project), inspectCutStock(before));
  assert.deepEqual(bom(project), bom(before));
  project = generateBuildGuide(project);
  assert.equal(guideIsCurrent(project), true);
  for (const step of checked)
    assert.deepEqual(
      project.steps.find((item) => item.id === step.id),
      step,
    );
  const oldIds = new Set(before.steps.map((step) => step.id));
  assert.deepEqual(
    project.steps.filter((step) => oldIds.has(step.id)).map((step) => step.id),
    before.steps.map((step) => step.id),
  );
  assert.deepEqual(generateBuildGuide(project).steps, project.steps);
  assert.deepEqual(project.pieces, before.pieces);
  assert.deepEqual(project.fastenerPlans.slice(0, 3), before.fastenerPlans);
  const csv = csvLocation(project, plan.id),
    md = guideMarkdown(project);
  assert.equal(csv["Head part label"], "P003");
  assert.equal(csv["Receiver part label"], "P011");
  assert.equal(csv["Head part ID"], plan.head.pieceId);
  assert.equal(csv["Receiver part ID"], plan.receiver.pieceId);
  assert.equal(csv["Product"], productId);
  assert.equal(csv["Receiver tip-path penetration (in)"], "0.547");
  assert.ok(md.includes(plan.label));
  assert.match(md, /nominal 1\.25 in/);
  assert.match(md, /not thread engagement/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(project))),
    project,
  );
  assert.deepEqual(baseline, before);
});
