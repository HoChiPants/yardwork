import assert from "node:assert/strict";
import test from "node:test";
import { createMeasuredHingeExample } from "../src/hingeExample";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { projectSchema, type Piece } from "../src/model";
import { lidHingeReviews, hingePurchaseAllocations } from "../src/hinges";
import { reviewHingeStock } from "../src/hingeStock";
import { hingePurchaseSummary } from "../src/hingePurchases";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { lidPreview } from "../src/lidMotion";
import { setSectionLidOpen } from "../src/sections";
import { fastenerReviews } from "../src/fastenings";

const physical = ({ id: _id, stepId: _stepId, ...piece }: Piece) => piece;

test("the opt-in synthetic hinge example preserves the exact42-panel/frame geometry and actual.703 sources", () => {
  const project = createMeasuredHingeExample(),
    base = createBuildStudy(
      "storage-banquette",
      defaultBuildStudyParameters("storage-banquette"),
      undefined,
      {
        caseworkPanels: {
          materialId: "plytanium-703",
          productRegistryRef: "plytanium-bc-201428",
        },
      },
    ).project;
  assert.equal(project.pieces.length, 42);
  assert.deepEqual(project.pieces.map(physical), base.pieces.map(physical));
  assert.deepEqual(project.joints, base.joints);
  assert.match(project.name, /^SYNTHETIC/);
  assert.match(project.notes, /invented fit-test data/);
  assert.equal(
    project.sections.every((section) => section.recipe?.lidOpen === false),
    true,
  );
  assert.equal(
    project.sections.every(
      (section) => section.recordedLidMotion === undefined,
    ),
    true,
  );
  assert.deepEqual(project.inventory, []);
  assert.deepEqual(project.supplyInventory, []);
  assert.deepEqual(project.toolSelections, []);
  const panels = project.pieces.filter(
    (piece) => piece.material === "plytanium-703",
  );
  assert.equal(panels.length, 18);
  assert.ok(panels.every((piece) => Math.min(...piece.size) === 0.703));
});

test("SYNTHETIC H001 has paired entered axis/hole datums while both other plans remain unknown and unselected", () => {
  const project = createMeasuredHingeExample(),
    reviews = lidHingeReviews(project),
    first = reviews[0];
  assert.equal(first.plan.label, "H001");
  assert.equal(first.state, "geometry-reviewed");
  assert.equal(first.plan.selectedForMotion, true);
  assert.equal(first.resolvedAxis?.length, 22.75);
  assert.deepEqual(first.resolvedAxis?.axis, [1, 0, 0]);
  assert.equal(first.locations.length, 2);
  assert.ok(
    first.locations.every(
      (item) =>
        item.state === "geometry-reviewed" &&
        item.tipWorld &&
        item.pilotTipWorld,
    ),
  );
  for (const item of first.locations) {
    assert.match(item.location.measurements.basis, /^SYNTHETIC/);
    assert.equal(item.location.measurements.surfaceToTipDepth, 0.4);
    assert.equal(item.location.measurements.pilotDepth, 0.45);
    assert.ok(item.availableDepth! >= 0.703);
  }
  assert.match(first.plan.axis.basis, /^SYNTHETIC/);
  assert.match(first.plan.hardware.basis, /^SYNTHETIC/);
  assert.match(first.plan.hardware.description, /not actual supplied/);
  assert.equal(first.plan.hardware.leafThickness, null);
  const selected = lidPreview(project, first.plan.sectionId, 30);
  const provisional = structuredClone(project);
  provisional.lidHingePlans[0].selectedForMotion = false;
  const prior = lidPreview(provisional, first.plan.sectionId, 30);
  assert.equal(selected.mechanism?.kind, "measured-axis");
  assert.notDeepEqual(selected.pivot, prior.pivot);
  assert.equal(selected.width, 22.75);
  for (const item of reviews.slice(1)) {
    assert.equal(item.state, "needs-measurements");
    assert.equal(item.plan.selectedForMotion, false);
    assert.equal(item.resolvedAxis, null);
    assert.equal(item.plan.stockAllocation, null);
    assert.equal(item.plan.axis.movingA, null);
    assert.deepEqual(item.plan.locations, []);
  }
});

test("a synthetic measured physical source, distinct retained end identities and one explicit purchase preserve unknown prior stock", () => {
  const project = createMeasuredHingeExample(),
    source = project.hingeStockSources[0],
    stock = reviewHingeStock(source);
  assert.equal(project.hingeStockSources.length, 1);
  assert.equal(stock.state, "geometry-reviewed");
  assert.deepEqual(
    stock.segments.map((segment) => segment.length),
    [22.75, 25.1875],
  );
  assert.equal(stock.segments[0].startEnd.kind, "source-start");
  assert.equal(stock.segments[0].endEnd.kind, "cut-before");
  assert.equal(stock.segments[1].startEnd.kind, "cut-after");
  assert.equal(stock.segments[1].endEnd.kind, "source-end");
  assert.match(source.basis, /^SYNTHETIC/);
  assert.match(source.cuts[0].basis, /^SYNTHETIC/);
  assert.equal(source.referenceHistory.length, 1);
  assert.equal(source.referenceHistory[0].previous.usableLength, null);
  assert.deepEqual(source.referenceHistory[0].previous.cuts, []);
  assert.match(source.referenceHistory[0].basis, /^SYNTHETIC/);
  assert.ok(project.lidHingePlans[0].referenceHistory.length >= 1);
  assert.equal(
    project.lidHingePlans[0].referenceHistory[0].previous.axis.movingA,
    null,
  );
  const purchasing = hingePurchaseSummary(
    project,
    hingePurchaseAllocations(project),
  );
  assert.equal(purchasing.requiredHinges, 1);
  assert.equal(purchasing.selectedHinges, 1);
  assert.equal(purchasing.shortfallPacks, 0);
  assert.equal(purchasing.sourceRows[0].linkedPurchaseValid, true);
  assert.equal(
    purchasing.sourceRows[0].segments.filter((segment) => segment.allocated)
      .length,
    1,
  );
  assert.equal(project.supplies.length, 1);
  assert.equal(project.supplies[0].quantity, 1);
  assert.match(project.supplies[0].note, /^SYNTHETIC/);
});

test("the actual carcass wood-screw path is explicit and remains pending without invented nominal seating/pilot values", () => {
  const project = createMeasuredHingeExample(),
    review = fastenerReviews(project)[0];
  assert.equal(project.fastenerPlans.length, 1);
  assert.equal(review.state, "needs-measurements");
  assert.equal(review.locations[0].state, "needs-measurements");
  assert.equal(review.activePointCount, 1);
  assert.equal(review.locations[0].gap, 0);
  assert.equal(review.locations[0].tipWorld, null);
  assert.equal(review.plan.measurements.surfaceToTipDepth, null);
  assert.equal(review.plan.measurements.pilotDiameter, null);
  assert.equal(review.plan.measurements.pilotDepth, null);
  assert.equal(review.plan.measurements.measuredAt, null);
  assert.match(review.plan.name, /^SYNTHETIC/);
  const head = project.pieces.find(
      (piece) => piece.id === review.plan.head.pieceId,
    )!,
    receiver = project.pieces.find(
      (piece) => piece.id === review.plan.receiver.pieceId,
    )!;
  assert.equal(head.designRole, "storage-rear");
  assert.equal(receiver.designRole, "leg");
});

test("the current guide preserves synthetic custom notes/checks and exact histories across JSON, generation and75-degree open/close", () => {
  const project = createMeasuredHingeExample(),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened, project);
  assert.equal(guideIsCurrent(project), true);
  const phase = project.steps.find(
    (step) =>
      step.generated?.kind === "lid-hinge-preparation" &&
      step.generated.planId === project.lidHingePlans[0].id,
  )!;
  assert.equal(phase.complete, true);
  assert.match(phase.title, /^SYNTHETIC/);
  assert.match(phase.notes, /SYNTHETIC custom note/);
  const regenerated = generateBuildGuide(reopened);
  assert.deepEqual(regenerated.steps, project.steps);
  assert.deepEqual(regenerated.hingeStockSources, project.hingeStockSources);
  assert.deepEqual(regenerated.lidHingePlans, project.lidHingePlans);
  const opened = setSectionLidOpen(
    regenerated,
    project.lidHingePlans[0].sectionId,
    true,
  );
  assert.ok(
    opened.sections.find(
      (section) => section.id === project.lidHingePlans[0].sectionId,
    )?.recordedLidMotion,
  );
  const closed = setSectionLidOpen(
    projectSchema.parse(JSON.parse(JSON.stringify(opened))),
    project.lidHingePlans[0].sectionId,
    false,
  );
  assert.deepEqual(closed.lidHingePlans, project.lidHingePlans);
  assert.deepEqual(closed.hingeStockSources, project.hingeStockSources);
  assert.deepEqual(closed.fastenerPlans, project.fastenerPlans);
  assert.deepEqual(closed.supplies, project.supplies);
  project.pieces.forEach((piece) => {
    const after = closed.pieces.find((candidate) => candidate.id === piece.id)!;
    assert.deepEqual(after.size, piece.size);
    after.position.forEach((value, axis) =>
      assert.ok(Math.abs(value - piece.position[axis]) < 1e-8),
    );
    after.rotation.forEach((value, axis) =>
      assert.ok(Math.abs(value - piece.rotation[axis]) < 1e-8),
    );
  });
  // A completed, unchanged checklist must survive the exact serialized roundtrip.
  assert.deepEqual(closed.pieces, project.pieces);
  const guidedClosed = generateBuildGuide(closed);
  assert.deepEqual(guidedClosed.steps, project.steps);
  assert.equal(guideIsCurrent(guidedClosed), true);
});
