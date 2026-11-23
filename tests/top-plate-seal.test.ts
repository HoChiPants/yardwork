import assert from "node:assert/strict";
import test from "node:test";
import { previewBottomPlateSeal } from "../src/bottomPlateSeal";
import { bottomPlateSealant } from "../src/bottomPlateSealReference";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { part, projectSchema, type V3 } from "../src/model";
import { previewTopPlateSeal, reviewTopPlateSeal, topPlateSealGuide } from "../src/topPlateSeal";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { topPlateStudy } from "./helpers/topPlateStudy";
import { composeRotation, rotate } from "../src/spatial";

test("two drywall faces support a continuous top plate seal and the guide orders it before hanging", () => {
  const { project, plate, panels, stage, input } = topPlateStudy();
  const withScrap = addMeasuredOffcut(project, stage, "hd-usg-drywall-half-8", [12, 8, 0.5], "Drywall sample");
  const draft = previewTopPlateSeal(withScrap, input);
  assert.equal(draft.layout.clearLength, 96);
  assert.deepEqual(draft.layout.runs.map(({ panelId, gap }) => [panelId, gap]), panels.map(({ id }) => [id, 0.0625]));
  assert.equal(withScrap.topPlateSeals, undefined);
  assert.match(topPlateSealGuide(draft.project).join("\n"), /matching drywall scrap O001/);
  assert.throws(() => previewTopPlateSeal(draft.project, input), /already has an air-seal plan/);
  assert.throws(() => previewTopPlateSeal(project, { ...input, side: "a" }), /Align the modeled drywall/);
  assert.throws(() => previewTopPlateSeal(project, { ...input, depth: 0.3 }), /measured gap and fill depth/);

  const design = projectSchema.parse(JSON.parse(JSON.stringify(generateBuildGuide(draft.project))));
  const plateStage = design.steps.findIndex((step) => step.id === design.pieces.find(({ id }) => id === plate.id)!.stepId);
  const sealStage = design.steps.findIndex(({ generated }) => generated?.kind === "top-plate-air-seal");
  const drywallStage = design.steps.findIndex(({ generated }) => generated?.kind === "assembly-stage" && generated.stageKey === "drywall-after-top-plate-sealing");
  assert.ok(plateStage >= 0 && plateStage < sealStage && sealStage < drywallStage);
  assert.match(guideMarkdown(design), /## Top plate air seals[\s\S]*4 ft of modeled bead path/);
});

test("interrupted or changed top plate backing remains visible and withholds the purchase quantity", () => {
  const { project, input, panels, stage } = topPlateStudy();
  const blocked = structuredClone(project);
  const bracket = part("Bead obstruction", "one-four", [12, 0.25, 0.25], [0, 95.25, 1.95], stage, "Wall");
  blocked.pieces.push(bracket);
  const uncertain = previewTopPlateSeal(blocked, input);
  assert.equal(uncertain.layout.clearLength, 84);
  assert.match(reviewTopPlateSeal(uncertain.project, uncertain.record).problem, /Resolve every interruption/);
  assert.equal(homeDepotPurchaseNeeds(uncertain.project).find(({ id }) => id === bottomPlateSealant.id)?.required, null);

  const draft = previewTopPlateSeal(project, input);
  const moved = structuredClone(draft.project);
  moved.pieces.find(({ id }) => id === panels[1].id)!.position[0] += 3;
  assert.equal(reviewTopPlateSeal(moved, draft.record).outdated, true);
  assert.ok(validate(moved).some(({ id }) => id === `top-plate-${draft.record.id}`));
  assert.equal(homeDepotPurchaseNeeds(moved).find(({ id }) => id === bottomPlateSealant.id)?.required, null);
});

test("the selected drywall bead detects the chord of a plate bore that reaches that face", () => {
  const { project, plate, input } = topPlateStudy();
  const original = previewTopPlateSeal(project, input);
  const withBore = (center: [number, number]) => projectSchema.parse({
    ...original.project,
    pieces: original.project.pieces.map((piece) => piece.id === plate.id
      ? { ...piece, roundOpenings: [{ axis: 0, center, diameter: 2 }] }
      : piece),
  });
  assert.equal(reviewTopPlateSeal(withBore([-24, 0]), original.record).outdated, false);
  const interrupted = withBore([-24, 1.15]);
  const stale = reviewTopPlateSeal(interrupted, original.record);
  assert.equal(stale.outdated, true);
  const updated = previewTopPlateSeal(interrupted, input, original.record.id);
  assert.deepEqual(updated.layout.runs.filter(({ woodMissing }) => woodMissing).map(({ start, end }) => [start, end]),
    [[23.2, 24.8]]);
  assert.ok(Math.abs(updated.layout.clearLength - 94.4) < 1e-6);
  assert.match(topPlateSealGuide(updated.project).join("\n"), /plate cutout interrupts the bead/);
  assert.equal(homeDepotPurchaseNeeds(updated.project).find(({ id }) => id === bottomPlateSealant.id)?.required, null);
});

test("moving the whole wall keeps the relative seal review and moves the 3D bead start", () => {
  const { project, input } = topPlateStudy();
  const draft = previewTopPlateSeal(project, input);
  const yaw: V3 = [0, Math.PI / 3, 0];
  const offset: V3 = [12, 24, -30];
  const moved = structuredClone(draft.project);
  for (const member of moved.pieces) {
    member.rotation = composeRotation(yaw, member.rotation);
    member.position = rotate(member.position, yaw).map((value, axis) => value + offset[axis]) as V3;
  }
  const updated = reviewTopPlateSeal(moved, draft.record);
  assert.equal(updated.outdated, false);
  assert.equal(updated.layout?.clearLength, draft.layout.clearLength);
  const expected = rotate(draft.layout.ends[0], yaw).map((value, axis) => value + offset[axis]);
  assert.ok(updated.layout?.ends[0].every((value, axis) => Math.abs(value - expected[axis]) < 1e-6));
});

test("a dry top and bottom plate share cartridge coverage only in the same work session", () => {
  const { project, input, stage } = topPlateStudy();
  const bottom = part("Bottom plate", "stud", [1.5, 96, 3.5], [220, 30, 0], stage, "Other wall", [0, 0, -Math.PI / 2]);
  const deck = part("Wood subfloor", "plywood", [48, 0.75, 96], [220, 28.875, 0], stage, "Other wall", [0, Math.PI / 2, 0]);
  project.pieces.push(bottom, deck);
  const sealed = previewBottomPlateSeal(project, {
    plateId: bottom.id, side: "b", bead: "1/4", session: input.session, gap: 0.125, depth: 0.125, dryExposedWood: true,
  }).project;
  const cartridges = (session: string) => homeDepotPurchaseNeeds(
    previewTopPlateSeal(sealed, { ...input, session }).project,
  ).find(({ id }) => id === bottomPlateSealant.id)?.required;
  assert.equal(cartridges("wall air sealing"), 1);
  assert.equal(cartridges("Next day"), 2);
});
