import assert from "node:assert/strict";
import { test } from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { applyCommand, blank, part, projectSchema } from "../src/model";
import { addMissingSillGasketRolls, removeSillGasket, reviewSillGaskets, saveSillGasket, sillPlateFootprint } from "../src/sillGaskets";
import { sillGaskets } from "../src/sillGasketReference";
import type { SillGasketMeasurements } from "../src/sillGasketSchema";
import { supplyRows } from "../src/supplies";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";

const measurements: SillGasketMeasurements = {
  substrate: "concrete", top: 0, supportLength: 96,
  supportWidth: 6, centerOffset: 0, allowance: 2,
};

function wall() {
  const project = applyCommand(blank(), { type: "wall", width: 96, height: 72, depth: 48, spacing: 16 });
  const plate = project.pieces.find(({ name }) => name.endsWith("bottom plate"))!;
  return { project, plate };
}

test("the actual bottom plate establishes width, seated elevation, and strip length", () => {
  const { project, plate } = wall();
  const plan = saveSillGasket(project, plate.id, measurements);
  const result = reviewSillGaskets(plan);
  assert.equal(result.rows[0].step, 2);
  assert.deepEqual(result.rows[0].issues, []);
  assert.equal(result.rows[0].length, 98);
  assert.equal(result.rows[0].product?.model, "1FS");
  assert.equal(result.groups[0].rolls[0].left, 502);
  assert.equal(result.rows[0].outline?.[0][1], 0);
  const guide = guideMarkdown(plan);
  assert.match(guide, /## Sill gasket cut plan/);
  assert.match(guide, /Before step 2 · concrete · top 0 in/);
  assert.match(guide, /Cut 98 in including 2 in for overlaps and trimming/);
});

test("a measured short, narrow or offset foundation remains a review item", () => {
  const { project, plate } = wall();
  const plan = saveSillGasket(project, plate.id, {
    ...measurements, top: 1, supportLength: 80, supportWidth: 5, centerOffset: 1,
  });
  const result = reviewSillGaskets(plan);
  assert.equal(result.groups.length, 0);
  assert.equal(result.rows[0].issues.length, 3);
  assert.match(result.rows[0].issues.join(" "), /elevation.+shorter.+full plate width/);
  assert.ok(validate(plan).some((row) => row.id === `sill-gasket-${plate.id}`));
  assert.deepEqual(addMissingSillGasketRolls(plan).supplies, []);
  const stud = project.pieces.find((piece) => /stud/.test(piece.name))!;
  assert.equal(sillPlateFootprint(stud), null);
  assert.throws(() => saveSillGasket(project, stud.id, measurements), /horizontal rectangular/);
});

test("rolls use the correct width, reuse length across runs, and add only missing packs", () => {
  let project = blank("Mixed sill runs");
  const step = project.steps[0].id;
  const plates = [
    ...Array.from({ length: 7 }, (_, i) => part(`Sill ${i + 1}`, "stud", [96, 1.5, 3.5], [i * 105, 0.75, 0], step, "Walls")),
    part("Wide sill", "two-six", [96, 1.5, 5.5], [0, 0.75, 20], step, "Walls"),
  ];
  plates[7].rotation = [0, Math.PI / 2, 0];
  project.pieces = plates;
  for (const plate of plates) project = saveSillGasket(project, plate.id, measurements);
  const result = reviewSillGaskets(project);
  assert.deepEqual(result.groups.map(({ product, rolls }) => [product.model, rolls.map(({ left }) => left)]), [
    ["1FS", [12, 502]], ["2FS", [502]],
  ]);
  const ordered = addMissingSillGasketRolls(project);
  assert.equal(addMissingSillGasketRolls(ordered), ordered);
  assert.deepEqual(supplyRows(ordered).map(({ offer, purchaseUnit, quantity }) => [offer?.productId, purchaseUnit, quantity]), [
    [sillGaskets[0].internetNumber, "roll", 2], [sillGaskets[1].internetNumber, "roll", 1],
  ]);
  assert.ok(homeDepotShoppingList(ordered).items.some((item) => item.productId === "202080947"));
});

test("a reloaded gasket plan detects a moved sill and preserves older projects", () => {
  const { project, plate } = wall();
  const legacy = projectSchema.parse({ ...project, schemaVersion: 84 });
  assert.equal(legacy.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(legacy.sillGaskets, undefined);
  const saved = saveSillGasket(legacy, plate.id, measurements);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const moved = reopened.pieces.find(({ id }) => id === plate.id)!;
  moved.position[0] += 2;
  const current = reviewSillGaskets(reopened);
  assert.match(current.rows[0].issues[0], /changed. Remeasure/);
  assert.equal(current.groups.length, 0);
  assert.match(guideMarkdown(reopened), /Needs review. The sill changed/);
  assert.equal(removeSillGasket(reopened, plate.id).sillGaskets, undefined);
});
