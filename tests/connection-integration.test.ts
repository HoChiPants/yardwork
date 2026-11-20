import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { blank, part, projectSchema, type Project } from "../src/model";
import { bom, connect, guideMarkdown, validate } from "../src/engine";
import { connectionCoverage } from "../src/connectionCoverage";
import { addFastenerLocation, makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { generateBuildGuide } from "../src/guide";
import { addSupply } from "../src/supplies";

function fixture() {
  const p = blank("Connection integration");
  p.pieces = [
    part("Head", "plywood", [8, 8, 0.75], [0, 4, 0], p.steps[0].id, "Casework"),
    part("Receiver", "plywood", [8, 8, 0.75], [0, 4, -0.75], p.steps[0].id, "Casework"),
    part("Separate panel", "plywood", [8, 8, 0.75], [30, 4, 0], p.steps[0].id, "Casework"),
  ];
  return p;
}
function finding(p: Project) {
  return validate(p).find((row) => row.connectionScope?.stageKey === "all-connections");
}

test("a geometric support warning opens the actual members' support review without prescribing more lumber", () => {
  const p = fixture();
  p.pieces[2].position[1] = 14;
  const before = JSON.stringify(p), support = validate(p).find((row) => row.id === "floating")!;
  assert.deepEqual(support.connectionScope!.memberIds, [p.pieces[2].id]);
  assert.match(support.detail, /saved shelf supports or fasteners/);
  assert.doesNotMatch(support.detail, /add.*members beneath/);
  assert.equal(JSON.stringify(p), before);
});

test("checks distinguish a started screw plan from current location intent and keep unrelated members visible", () => {
  let p = fixture();
  const plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id);
  p = saveFastenerPlan(p, plan);
  assert.match(finding(p)!.title, /^3 parts need connection details$/);
  assert.match(finding(p)!.detail, /started/);
  const located = addFastenerLocation(p.fastenerPlans[0]);
  located.locations[0].entranceLocal = [0, 0, 0.375];
  located.locations[0].driveLocal = [0, 0, -1];
  located.measurements = { surfaceToTipDepth: 1.1, pilotDiameter: 0.1, pilotDepth: 1.2, basis: "SYNTHETIC entered datum", measuredAt: "2026-11-16T18:00:00Z" };
  p = saveFastenerPlan(p, located);
  assert.equal(connectionCoverage(p).summary.noCurrentIntentParts, 1);
  assert.match(finding(p)!.title, /^1 part needs connection details$/);
  assert.deepEqual(finding(p)!.connectionScope!.memberIds, p.pieces.map((piece) => piece.id));
  const changed = structuredClone(p);
  changed.pieces[0].position[0] += 1;
  assert.match(finding(changed)!.title, /^3 parts need connection details$/);
  assert.deepEqual(changed.fastenerPlans, p.fastenerPlans);
});

test("face contact, purchased screws and checked guide steps do not hide missing connection decisions", () => {
  const p = addSupply(fixture(), "grk-r4-103101", 2, "Purchased stock");
  p.steps.forEach((step) => { step.complete = true; });
  const before = JSON.stringify(p);
  assert.match(finding(p)!.title, /^3 parts need connection details$/);
  assert.equal(JSON.stringify(p), before);
});

test("legacy pair quantities address only their endpoints and remain visibly unlocated", () => {
  let p = fixture();
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 2, 3);
  assert.match(finding(p)!.title, /^1 part needs connection details$/);
  p.pieces.pop();
  assert.match(finding(p)!.title, /Saved connection details still need review/);
  assert.match(finding(p)!.detail, /1 unlocated quantity records/);
});

test("actual measured banquette keeps hinge and screw plans visible without clearing carcass joinery gaps", async () => {
  const p = projectSchema.parse(JSON.parse(await readFile(new URL("../public/examples/hinges/synthetic-measured-banquette.yardwork.json", import.meta.url), "utf8")));
  const before = JSON.stringify(p), result = finding(p)!;
  assert.match(result.title, /^39 parts need connection details$/);
  assert.equal(result.connectionScope!.stageKey, "all-connections");
  assert.equal(result.connectionScope!.ownerId, p.id);
  assert.ok(!validate(p).some((row) => /Connections have not been specified/.test(row.title)));
  const md = guideMarkdown(p);
  assert.match(md, /Connection intent review/);
  assert.match(md, /H001/);
  assert.match(md, /W001/);
  assert.match(md, /not carcass joinery/);
  assert.equal(JSON.stringify(p), before);
});

test("generated assembly Markdown includes current typed intent and legacy records with unchanged purchasing", () => {
  let p = fixture();
  p = saveFastenerPlan(p, addFastenerLocation(makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id)));
  p = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 4, 3);
  p = generateBuildGuide(p);
  const before = JSON.stringify(p), purchasing = bom(p), md = guideMarkdown(p);
  assert.match(md, /Connections and supports/);
  assert.match(md, /W001/);
  assert.match(md, /legacy quantity 4 screw/);
  assert.match(md, /pending details/);
  assert.deepEqual(bom(p), purchasing);
  assert.equal(JSON.stringify(p), before);
});
