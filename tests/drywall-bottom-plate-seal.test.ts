import assert from "node:assert/strict";
import test from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { bottomPlateSealant } from "../src/bottomPlateSealReference";
import { previewBottomPlateSeal, reviewBottomPlateSeal } from "../src/bottomPlateSeal";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { part, projectSchema } from "../src/model";
import { previewTopPlateSeal, reviewTopPlateSeal, wallPlateSealTakeoff } from "../src/topPlateSeal";
import { drywallBottomPlateStudy } from "./helpers/drywallBottomPlateStudy";

test("the two floor junction seams and top plate share a cartridge, and the beads precede drywall", () => {
  const { underneath, input, topInput, panels } = drywallBottomPlateStudy();
  const lower = previewTopPlateSeal(underneath.project, input, undefined, "bottom");
  assert.equal(lower.layout.clearLength, 96);
  assert.deepEqual(lower.layout.runs.map(({ panelId }) => panelId), panels.map(({ id }) => id));
  assert.throws(() => previewTopPlateSeal(lower.project, input), /already has an air-seal plan/);
  const both = previewTopPlateSeal(lower.project, topInput);
  const project = projectSchema.parse(JSON.parse(JSON.stringify(generateBuildGuide(both.project))));
  const takeoff = wallPlateSealTakeoff(project);
  assert.equal(takeoff.batches.length, 1);
  assert.ok(Math.abs(takeoff.batches[0].use - 24 / 86) < 1e-10);
  assert.equal(takeoff.required, 1);
  assert.equal(homeDepotPurchaseNeeds(project).find(({ id }) => id === bottomPlateSealant.id)?.required, 1);
  const underneathIndex = project.steps.findIndex(({ generated }) => generated?.kind === "bottom-plate-air-seal");
  const lowerIndex = project.steps.findIndex(({ generated }) => generated?.kind === "drywall-bottom-plate-air-seal");
  const drywallIndex = project.steps.findIndex(({ id }) => id === project.pieces.find(({ id }) => id === panels[0].id)?.stepId);
  assert.ok(underneathIndex >= 0 && underneathIndex < lowerIndex && lowerIndex < drywallIndex);
  assert.deepEqual(reviewAssemblyOrder(project), []);
  const reversed = { ...project, steps: project.steps.map((row, index, all) =>
    index === underneathIndex ? all[lowerIndex] : index === lowerIndex ? all[underneathIndex] : row) };
  assert.ok(reviewAssemblyOrder(reversed).some(({ current }) => current.step.id === project.steps[lowerIndex].id));
  assert.match(guideMarkdown(project), /## Drywall-to-bottom-plate seals[\s\S]*4 ft of modeled bead path/);
  assert.deepEqual(answerBuildQuestion(project, buildQuestion("How do I seal drywall to the bottom plate?")!, []).link?.action,
    { kind: "drywall-bottom-plate-seal" });
});

test("the lower drywall edge has to meet the bead, and fit changes remove its quantity until review", () => {
  const { project, input, topInput, panels, stage } = drywallBottomPlateStudy();
  assert.throws(() => previewTopPlateSeal(project, topInput, undefined, "bottom"), /lower edge within the plate face/);
  const lower = previewTopPlateSeal(project, input, undefined, "bottom");
  const moved = structuredClone(lower.project);
  moved.pieces.find(({ id }) => id === panels[0].id)!.position[1] += 1;
  assert.equal(reviewTopPlateSeal(moved, lower.record, "bottom").outdated, true);
  assert.ok(validate(moved).some(({ id }) => id === `drywall-bottom-plate-${lower.record.id}`));
  assert.equal(homeDepotPurchaseNeeds(moved).find(({ id }) => id === bottomPlateSealant.id)?.required, null);
  const blocked = { ...project, pieces: [...project.pieces,
    part("Bead obstruction", "one-four", [12, 0.25, 0.25], [0, 0.75, 1.96], stage, "Wall")] };
  const partial = previewTopPlateSeal(blocked, input, undefined, "bottom");
  assert.equal(partial.layout.clearLength, 84);
  assert.equal(homeDepotPurchaseNeeds(partial.project).find(({ id }) => id === bottomPlateSealant.id)?.canAdd, false);
});

test("a low rectangular cut interrupts the subfloor bead while the higher drywall bead stays supported", () => {
  const { underneath, input, bottom } = drywallBottomPlateStudy();
  const cut = projectSchema.parse({
    ...underneath.project,
    pieces: underneath.project.pieces.map((piece) => piece.id === bottom.id
      ? { ...piece, rectangularOpenings: [{ axis: 2, center: [0.5, 12], spans: [0.5, 4] }] }
      : piece),
  });
  assert.equal(reviewBottomPlateSeal(cut, underneath.record).outdated, true);
  const { id, signature: _signature, ...fields } = underneath.record;
  const resealed = previewBottomPlateSeal(cut, fields, id);
  assert.deepEqual(resealed.layout.runs.filter(({ woodMissing }) => woodMissing).map(({ start, end }) => [start, end]),
    [[58, 62]]);
  assert.equal(resealed.layout.clearLength, 92);
  assert.match(guideMarkdown(resealed.project), /58 in to 62 in from the marked start · A plate cutout/);
  assert.equal(wallPlateSealTakeoff(resealed.project).required, 0);
  const drywall = previewTopPlateSeal(resealed.project, input, undefined, "bottom");
  assert.equal(drywall.layout.clearLength, 96);
  const takeoff = wallPlateSealTakeoff(drywall.project);
  assert.equal(takeoff.needsReview, true);
  assert.ok(Math.abs(takeoff.batches[0].use - 8 / 86) < 1e-10);
});
