import assert from "node:assert/strict";
import test from "node:test";
import { blank, projectSchema, type Piece } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import {
  addPendingStorageHinges,
  createBuildStudy,
  defaultBuildStudyParameters,
  evaluateBuildFixture,
  getBuildFixture,
} from "../src/buildFixtures";
import { hingePurchaseAllocations, lidHingeReviews } from "../src/hinges";
import { reviewHingeStock } from "../src/hingeStock";
import { hingePurchaseSummary } from "../src/hingePurchases";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { emptyHingeAxis } from "../src/hingeSchema";

const physical = ({ id: _id, stepId: _stepId, ...piece }: Piece) => piece;

test("storage study adds pending actual lid/rear connections while retaining the original42-piece recipe geometry", () => {
  const study = createBuildStudy("storage-banquette"),
    project = study.project,
    p = defaultBuildStudyParameters("storage-banquette");
  const original = applyIdeaPlan(
    blank(getBuildFixture("storage-banquette").title),
    localIdeaPlan({
      prompt: `A storage banquette ${p.width} inches wide, ${p.depth} inches deep, ${p.height} inches seat height, three sections, no back and opening lids`,
    }),
  );
  assert.equal(project.pieces.length, 42);
  assert.deepEqual(project.pieces.map(physical), original.pieces.map(physical));
  assert.deepEqual(project.joints, original.joints);
  assert.equal(project.sections.length, 3);
  assert.deepEqual(
    project.lidHingePlans.map((plan) => plan.label),
    ["H001", "H002", "H003"],
  );
  assert.deepEqual(
    new Set(project.lidHingePlans.map((plan) => plan.sectionId)),
    new Set(project.sections.map((section) => section.id)),
  );
  for (const plan of project.lidHingePlans) {
    const section = project.sections.find(
      (section) => section.id === plan.sectionId,
    )!;
    const lid = project.pieces.find(
        (piece) => piece.id === plan.moving.pieceId,
      )!,
      rear = project.pieces.find((piece) => piece.id === plan.fixed.pieceId)!;
    assert.ok(
      section.pieceIds.includes(lid.id) && section.pieceIds.includes(rear.id),
    );
    assert.equal(lid.designRole, "seat-lid");
    assert.equal(rear.designRole, "storage-rear");
    assert.deepEqual(plan.moving.baseline?.size, lid.size);
    assert.deepEqual(plan.fixed.baseline?.size, rear.size);
    assert.deepEqual(plan.axis, emptyHingeAxis());
    assert.equal(plan.stockAllocation, null);
    assert.equal(plan.selectedForMotion, false);
    assert.deepEqual(plan.locations, []);
    assert.deepEqual(plan.referenceHistory, []);
    assert.deepEqual(plan.hardware, {
      description: "",
      drive: "",
      suppliedCount: null,
      included: null,
      leafThickness: null,
      basis: "",
      measuredAt: null,
    });
    assert.equal(section.recipe?.lidOpen, false);
    assert.equal(section.recordedLidMotion, undefined);
  }
  assert.match(study.baselineScope, /pending.*hinge plans/);
  const acceptance = evaluateBuildFixture(study);
  assert.equal(acceptance.buildReady, false);
  assert.equal(acceptance.digitalReady, false);
  assert.ok(
    acceptance.missingOperations.some(
      (requirement) => requirement.id === "operation.lid-installation",
    ),
  );
  assert.ok(
    acceptance.missingProducts.some(
      (requirement) => requirement.id === "hardware.lid-support",
    ),
  );
});

test("the study's single unmeasured planning source creates no physical allocations, cuts or purchases", () => {
  const project = createBuildStudy("storage-banquette").project;
  assert.equal(project.hingeStockSources.length, 1);
  const source = project.hingeStockSources[0];
  assert.equal(source.purchaseSelectionId, null);
  assert.equal(source.usableLength, null);
  assert.equal(source.measuredAt, null);
  assert.equal(source.basis, "");
  assert.deepEqual(source.cuts, []);
  assert.deepEqual(source.referenceHistory, []);
  assert.match(source.notes, /not evidence that all three lids/);
  assert.equal(reviewHingeStock(source).state, "needs-measurements");
  assert.deepEqual(reviewHingeStock(source).segments, []);
  const reviews = lidHingeReviews(project);
  assert.equal(reviews.length, 3);
  for (const review of reviews) {
    assert.equal(review.state, "needs-measurements");
    assert.equal(review.resolvedAxis, null);
    assert.equal(review.activeHoleCount, 0);
    assert.ok(review.issues.some((issue) => issue.code === "axis-pending"));
    assert.ok(review.issues.some((issue) => issue.code === "stock-pending"));
  }
  const purchasing = hingePurchaseSummary(
    project,
    hingePurchaseAllocations(project),
  );
  assert.equal(purchasing.requiredPacks, 0);
  assert.equal(purchasing.selectedPacks, 0);
  assert.equal(purchasing.canAddMissing, false);
  assert.deepEqual(project.supplies, []);
  assert.deepEqual(project.supplyInventory, []);
  assert.deepEqual(project.inventory, []);
});

test("source-exact .703 panels remain actual hinge references through JSON and guide generation", () => {
  const study = createBuildStudy(
    "storage-banquette",
    defaultBuildStudyParameters("storage-banquette"),
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  );
  const project = study.project,
    saved = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(saved, project);
  for (const plan of saved.lidHingePlans) {
    const lid = saved.pieces.find((piece) => piece.id === plan.moving.pieceId)!,
      rear = saved.pieces.find((piece) => piece.id === plan.fixed.pieceId)!;
    assert.equal(lid.material, "plytanium-703");
    assert.equal(rear.material, "plytanium-703");
    assert.equal(lid.size[1], 0.703);
    assert.equal(rear.size[2], 0.703);
    assert.equal(
      plan.moving.baseline?.productRegistryRef,
      "plytanium-bc-201428",
    );
    assert.equal(
      plan.fixed.baseline?.productRegistryRef,
      "plytanium-bc-201428",
    );
  }
  const guided = generateBuildGuide(saved);
  assert.equal(guideIsCurrent(guided), true);
  assert.deepEqual(guided.pieces.map(physical), saved.pieces.map(physical));
  assert.deepEqual(guided.lidHingePlans, saved.lidHingePlans);
  assert.deepEqual(guided.hingeStockSources, saved.hingeStockSources);
  assert.equal(
    guided.steps.filter(
      (step) => step.generated?.kind === "lid-hinge-preparation",
    ).length,
    3,
  );
  assert.ok(
    lidHingeReviews(guided).every(
      (review) => review.state === "needs-measurements",
    ),
  );
});

test("other build-study families do not receive unrelated lid plans or physical hinge sources", () => {
  for (const kind of [
    "shelves",
    "closet-insert",
    "greenhouse",
    "sauna",
  ] as const) {
    const project = createBuildStudy(kind).project;
    assert.deepEqual(project.lidHingePlans, []);
    assert.deepEqual(project.hingeStockSources, []);
    assert.deepEqual(project.hingePlanLabels, []);
  }
});

test("explicit pending-plan addition is idempotent and preserves existing part IDs, plans and source observations", () => {
  const generated = createBuildStudy("storage-banquette").project;
  const old = {
    ...generated,
    lidHingePlans: [],
    hingePlanLabels: [],
    hingeStockSources: [],
  };
  const before = JSON.stringify(old);
  const upgraded = addPendingStorageHinges(old);
  assert.equal(JSON.stringify(old), before);
  assert.deepEqual(upgraded.pieces, old.pieces);
  assert.deepEqual(upgraded.sections, old.sections);
  assert.deepEqual(upgraded.joints, old.joints);
  assert.equal(upgraded.lidHingePlans.length, 3);
  assert.equal(upgraded.hingeStockSources.length, 1);
  assert.equal(addPendingStorageHinges(upgraded), upgraded);
  const customized = structuredClone(upgraded);
  customized.hingeStockSources[0].notes =
    "Existing user planning note must remain exact.";
  customized.lidHingePlans[0].notes =
    "Existing measured-plan review must remain exact.";
  assert.equal(addPendingStorageHinges(customized), customized);
  assert.deepEqual(addPendingStorageHinges(customized), customized);
  const missingRole = structuredClone(old);
  delete missingRole.pieces.find((piece) => piece.designRole === "seat-lid")!
    .designRole;
  assert.throws(
    () => addPendingStorageHinges(missingRole),
    /not guessed by name or order/,
  );
  assert.deepEqual(missingRole.lidHingePlans, []);
});
