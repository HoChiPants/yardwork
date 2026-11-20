import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { saunaRooms, saveSaunaHeater } from "../src/saunaHeaters";
import { harviaKit } from "../src/saunaHeaterReference";
import { cedarbrookLining } from "../src/saunaLiningReference";
import { cedarbrookFoil } from "../src/saunaFoilReference";
import {
  applySaunaVentOpenings,
  removeSaunaVentOpenings,
  removeSaunaVentilation,
  saunaVentOpeningsReview,
  saunaVentilationReview,
  saveSaunaVentilation,
} from "../src/saunaVentilation";
import type { SaunaVentilationInput } from "../src/saunaVentilationSchema";
import { owensCorningWallBatt } from "../src/saunaWallReference";
import { copyObjects, pasteObjects } from "../src/editorClipboard";

const intake = {
  wall: "right",
  offset: 16,
  height: 18,
  duct: 3,
  bore: 3.5,
  depth: 6,
} as const;
const exhaust = {
  wall: "left",
  offset: 16,
  height: 19,
  duct: 6,
  bore: 6.5,
  depth: 6,
} as const;
const mechanical = {
  mode: "mechanical",
  intake,
  exhaust,
  drying: "door",
} satisfies SaunaVentilationInput;
const study = (lined = false) =>
  createBuildStudy(
    "sauna",
    { ...defaultBuildStudyParameters("sauna"), height: 88 },
    blank(),
    lined
      ? {
          saunaInterior: {
            materialId: cedarbrookLining.materialId,
            productRegistryRef: cedarbrookLining.productId,
          },
          saunaVaporBarrier: {
            materialId: cedarbrookFoil.materialId,
            productRegistryRef: cedarbrookFoil.productId,
          },
          saunaInsulation: {
            materialId: owensCorningWallBatt.materialId,
            productRegistryRef: owensCorningWallBatt.productId,
          },
        }
      : {},
  ).project;

test("changing to a Harvia package suspends the STEEL-specific ventilation marks and new cuts", () => {
  const before = study(true);
  const id = saunaRooms(before)[0].entry.id;
  const vented = saveSaunaVentilation(before, id, mechanical);
  const updated = saveSaunaHeater(vented, id, {
    productId: harviaKit.productId,
    wall: "right",
    offset: 0,
    bottom: 12,
    supply: "240",
    uninsulatedWallArea: 0,
    notes: "",
  });
  const plan = updated.saunaVentilationPlans![0];
  const review = saunaVentilationReview(updated, plan);
  assert.deepEqual(review.openings, []);
  assert.equal(review.airflowCfm, null);
  assert.match(review.issues[0], /delivered Harvia and control manuals/);
  assert.equal(saunaVentOpeningsReview(updated, review).proposed.size, 0);
  assert.throws(() => applySaunaVentOpenings(updated, plan), /Resolve the layout findings/);
});

test("sauna vent marks follow actual cedar, foil and batt layers without altering cut stock or purchases", () => {
  const before = study(true);
  const id = saunaRooms(before)[0].entry.id;
  const heat = saveSaunaHeater(before, id, {
    x: 26,
    z: 24,
    supply: "240",
    uninsulatedWallArea: 0,
    notes: "",
  });
  const guided = generateBuildGuide(heat);
  const saved = saveSaunaVentilation(guided, id, mechanical);
  assert.equal(guideIsCurrent(saved), false);
  const output = generateBuildGuide(saved);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(output)));
  assert.deepEqual(reopened.pieces, output.pieces);
  assert.deepEqual(reopened.supplies, heat.supplies);
  assert.deepEqual(saved.pieces, guided.pieces);
  assert.deepEqual(
    reopened.saunaVentilationPlans,
    output.saunaVentilationPlans,
  );
  assert.equal(reopened.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(
    homeDepotShoppingList(reopened).items,
    homeDepotShoppingList(heat).items,
  );
  assert.ok(
    homeDepotShoppingList(reopened).reviews.some(
      ({ name }) => name === "Sauna ventilation",
    ),
  );
  assert.match(
    homeDepotHandoff(reopened),
    /Sauna ventilation\nConfirm compatible ducts/,
  );
  const review = saunaVentilationReview(
    reopened,
    reopened.saunaVentilationPlans![0],
  );
  assert.deepEqual(review.issues, []);
  assert.equal(review.airflowCfm, 26.4);
  assert.deepEqual(review.openings[0].centerLine, [
    [36, 18, 16],
    [42, 18, 16],
  ]);
  const crossed = review.openings[0].layers.map(
    (id) => reopened.pieces.find((piece) => piece.id === id)?.material,
  );
  for (const mat of [
    cedarbrookLining.materialId,
    cedarbrookFoil.materialId,
    owensCorningWallBatt.materialId,
  ])
    assert.ok(crossed.includes(mat), `Expected a mark on ${mat}`);
  assert.match(
    guideMarkdown(reopened),
    /Sauna ventilation layout[\s\S]*Supply air · Right wall · Z 16 in from center · 18 in above finished floor · 3.5 in rough diameter[\s\S]*26.4 CFM/,
  );
  assert.equal(
    removeSaunaVentilation(saved, id).saunaVentilationPlans,
    undefined,
  );
  const old = projectSchema.parse({ ...heat, schemaVersion: 40 });
  assert.deepEqual(old, heat);
});

test("apply bores to actual wall parts, retain stock quantities, and move the cuts on explicit reapply", () => {
  const base = study(true);
  const id = saunaRooms(base)[0].entry.id;
  const heat = saveSaunaHeater(base, id, {
    x: 26,
    z: 24,
    supply: "240",
    uninsulatedWallArea: 0,
    notes: "",
  });
  const saved = saveSaunaVentilation(heat, id, mechanical);
  const plan = saved.saunaVentilationPlans![0];
  const applied = applySaunaVentOpenings(saved, plan);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(applied)));
  const reviewed = saunaVentOpeningsReview(
    reopened,
    saunaVentilationReview(reopened, plan),
  );
  assert.equal(reviewed.current, true);
  assert.ok(reviewed.applied > 6);
  assert.equal(applySaunaVentOpenings(reopened, plan), reopened);
  assert.deepEqual(removeSaunaVentOpenings(reopened, id).pieces, saved.pieces);
  assert.deepEqual(
    homeDepotShoppingList(reopened).items,
    homeDepotShoppingList(saved).items,
  );
  assert.match(
    guideMarkdown(reopened),
    /Round edge cut · 3.5 in diameter through local Z/,
  );
  assert.match(
    guideMarkdown(reopened),
    /Modeled round openings · \d+ affected parts/,
  );
  const moved = saveSaunaVentilation(reopened, id, {
    ...mechanical,
    intake: { ...intake, offset: 12 },
  });
  const movedPlan = moved.saunaVentilationPlans![0];
  assert.deepEqual(moved.pieces, reopened.pieces);
  assert.match(
    guideMarkdown(moved),
    /Applied openings differ from this layout/,
  );
  const updated = applySaunaVentOpenings(moved, movedPlan);
  assert.equal(
    saunaVentOpeningsReview(updated, saunaVentilationReview(updated, movedPlan))
      .current,
    true,
  );
  assert.notDeepEqual(updated.pieces, moved.pieces);
  const lined = updated.pieces.find(
    (piece) =>
      piece.material === cedarbrookLining.materialId &&
      piece.roundOpenings?.length,
  )!;
  const copy = pasteObjects(
    updated,
    copyObjects(updated, lined.id, null)!,
    updated.steps[0].id,
  ).project.pieces.at(-1)!;
  assert.ok(copy.roundOpenings?.length);
  assert.equal(copy.roundOpenings[0].source, undefined);
  assert.deepEqual(removeSaunaVentilation(updated, id).pieces, saved.pieces);
});

test("gravity thresholds, opposite walls, depth, overlap and moved framing are reported against saved measurements", () => {
  const before = study();
  const id = saunaRooms(before)[0].entry.id;
  const heater = saveSaunaHeater(before, id, {
    x: 26,
    z: 24,
    supply: "unknown",
    uninsulatedWallArea: null,
    notes: "",
  });
  const blocked = saveSaunaVentilation(heater, id, {
    ...mechanical,
    mode: "gravity",
    intake: { ...intake, offset: 24, depth: 4 },
    exhaust: { ...exhaust, wall: "right", offset: 24, duct: 5 },
    drying: { wall: "right", offset: 24, height: 20, bore: 4, depth: 6 },
  });
  const review = saunaVentilationReview(
    blocked,
    blocked.saunaVentilationPlans![0],
  );
  for (const pattern of [
    /exhaust wall/i,
    /400 mm/i,
    /200 mm of rise/i,
    /twice the intake/i,
    /depth stops/i,
    /bore envelope crosses/i,
    /opposite wall below the ceiling/i,
    /overlap/i,
  ])
    assert.ok(
      review.issues.some((issue) => pattern.test(issue)),
      String(pattern),
    );
  assert.ok(
    validate(blocked).some(({ id: key }) => key === `sauna-ventilation-${id}`),
  );
  const compatible = saveSaunaVentilation(heater, id, {
    ...mechanical,
    mode: "gravity",
    intake: { ...intake, height: 10 },
  });
  const plan = compatible.saunaVentilationPlans![0];
  assert.deepEqual(saunaVentilationReview(compatible, plan).issues, []);
  const obstruction = part(
    "Added block",
    "stud",
    [1.5, 4, 4],
    [39, 10, 16],
    compatible.steps[0].id,
    "Added",
  );
  const changed = {
    ...compatible,
    pieces: [...compatible.pieces, obstruction],
  };
  assert.deepEqual(
    saunaVentilationReview(changed, plan).openings[0].obstructions,
    [obstruction.id],
  );
  assert.match(guideMarkdown(changed), /Supply air bore envelope crosses/);
  assert.match(
    saunaVentilationReview({ ...changed, ideaBindings: [] }, plan).issues[0],
    /sauna room is missing/,
  );
});
