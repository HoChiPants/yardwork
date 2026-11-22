import assert from "node:assert/strict";
import test from "node:test";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { blank, projectSchema } from "../src/model";
import { wireIntentToPlan } from "../server/intentPlanner";
import { closetSupportRoleOptions } from "../src/attachments";
import { pureBondCasework } from "../src/homeDepotCaseworkReference";
import { everbiltClosetRod } from "../src/closetRodReference";
import { closetRods, rodBay } from "../src/rodFits";
import { bounds } from "../src/engine";
import { createBuildStudy, defaultBuildStudyParameters } from "../src/buildFixtures";

const prompt = "Closet insert with overall width 72 inches, overall depth 24 inches and overall height 84 inches. Tower width 25 inches and 4 shelves. Left hanging bay width 16 inches. Rod height 60 inches.";
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `Expected ${expected}, got ${actual}`);
}

test("measured left and right bays reflow only the closet tower and retain actual panel and rod stock", () => {
  const original = localIdeaPlan({ prompt });
  const [initial] = original.structures;
  if (initial.kind !== "closet-insert") throw Error("Expected a closet insert");
  assert.equal(initial.parameters.leftBayWidth, 16);
  assert.equal(initial.parameters.rodHeight, 60);
  initial.selections.caseworkPanels = {
    materialId: pureBondCasework.materialId, productRegistryRef: pureBondCasework.registryId,
  };
  initial.selections.closetRod = {
    materialId: everbiltClosetRod.materialId, productRegistryRef: everbiltClosetRod.productId,
  };
  const request = {
    prompt: "Set the right hanging bay width to 28 inches and rod center height to 62 inches.",
    previousPlan: original,
  };
  for (const plan of [
    localIdeaPlan(request),
    wireIntentToPlan(request, { family: "closet-insert", operation: "revise", width: 28, height: 62, leftBayWidth: 10, towerWidth: 21 }),
  ]) {
    const [structure] = plan.structures;
    if (structure.kind !== "closet-insert") throw Error("Expected a closet insert");
    assert.equal(structure.parameters.width, 72);
    assert.equal(structure.parameters.depth, 24);
    assert.equal(structure.parameters.height, 84);
    assert.equal(structure.parameters.towerWidth, 25);
    assert.equal(structure.parameters.rightBayWidth, 28);
    assert.equal(structure.parameters.leftBayWidth, undefined);
    assert.equal(structure.parameters.rodHeight, 62);
    assert.deepEqual(structure.selections, initial.selections);
    const project = projectSchema.parse(JSON.parse(JSON.stringify(applyIdeaPlan(blank(), plan))));
    const rods = closetRods(project).sort((a, b) => a.position[0] - b.position[0]);
    assert.equal(rods.length, 2);
    near(rodBay(project, rods[0].id).span, 16.188);
    near(rodBay(project, rods[1].id).span, 28);
    rods.forEach(({ position }) => near(position[1], 62));
    const parts = project.pieces.map(bounds);
    near(Math.max(...parts.map(({ max }) => max[0])) - Math.min(...parts.map(({ min }) => min[0])), 72);
    const entry = project.ideaBindings[0].entries[0];
    const roles = closetSupportRoleOptions(project, entry.id);
    assert.equal(roles.length, 6);
    assert.ok(roles.every(({ assignedPieceId, suggestedPieceId }) => assignedPieceId && assignedPieceId === suggestedPieceId));
  }
  assert.equal(initial.parameters.leftBayWidth, 16);
});

test("endpoint measurements do not become outside dimensions even when the connected model proposes them", () => {
  const request = { prompt: "Closet insert with a 16 in wide left hanging bay and rod center height 60 inches." };
  const plan = wireIntentToPlan(request, { family: "closet-insert", operation: "create", width: 16, height: 60, rightBayWidth: 11 });
  const [structure] = plan.structures;
  if (structure.kind !== "closet-insert") throw Error("Expected a closet insert");
  assert.equal(structure.parameters.width, 72);
  assert.equal(structure.parameters.height, 84);
  assert.equal(structure.parameters.leftBayWidth, 16);
  assert.equal(structure.parameters.rightBayWidth, undefined);
  assert.equal(structure.parameters.rodHeight, 60);
});

test("relative bay edits use the current opening and inconsistent widths preserve the previous design", () => {
  const previousPlan = localIdeaPlan({ prompt });
  const next = localIdeaPlan({ prompt: "Make the left hanging bay 2 inches wider.", previousPlan });
  const [closet] = next.structures;
  if (closet.kind !== "closet-insert") throw Error("Expected a closet insert");
  assert.equal(closet.parameters.leftBayWidth, 18);
  assert.equal(closet.parameters.width, 72);
  const relativeRod = localIdeaPlan({ prompt: "Increase the rod height by 2 inches.", previousPlan: next });
  const [raised] = relativeRod.structures;
  if (raised.kind !== "closet-insert") throw Error("Expected a closet insert");
  assert.equal(raised.parameters.height, 84);
  assert.equal(raised.parameters.rodHeight, 62);
  for (const [prompt, note] of [
    ["Set the left hanging bay to 90 inches.", /no valid hanging bay/],
    ["Left hanging bay width 16 inches and right hanging bay width 24 inches.", /must fit inside/],
    ["Set rod center height to 84 inches.", /top panel/],
    ["Set the left hanging bay width to 22.", /inches or feet/],
  ] as const) {
    const result = localIdeaPlan({ prompt, previousPlan: next });
    assert.deepEqual(result.structures, next.structures);
    assert.match(result.questions[0], note);
  }
  const manual = createBuildStudy("closet-insert", { ...defaultBuildStudyParameters("closet-insert"), width: 72, leftBayWidth: 16 });
  assert.equal(manual.structure?.dimensions.leftClearBay, 16);
  assert.equal(manual.structure?.dimensions.rightClearBay, 28);
});
