import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildQuestion } from "../src/buildQuestions";
import { inspectCutStock } from "../src/cutStock";
import { bom, guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { part, projectSchema } from "../src/model";
import { blankProjectCode } from "../src/projectCodeSchema";
import { removeSinkDrain, reviewSinkDrain, sinkDrainCodeRows } from "../src/sinkDrain";
import { previewSinkDrain } from "../src/sinkDrainApply";
import { sinkTrap, sinkDrainReferences } from "../src/sinkDrainReference";
import type { SinkDrainInput } from "../src/sinkDrainSchema";

function fixture(slug: string) {
  return projectSchema.parse(JSON.parse(readFileSync(new URL(
    `../public/examples/plumbing/${slug}.yardwork.json`, import.meta.url,
  ), "utf8")));
}
const input: SinkDrainInput = {
  name: "Island sink drain", tail: [4, 22, 55], wall: [4, 22.15625, 64],
  tailDiameter: 1.5, tailSeat: 1, wallSeat: 1.25, bendReach: 4.5, outletDrop: 0.75,
  bodyDrop: 4.95, bodyWidth: 2.25, blank: 7.25, kerf: 0.125, service: 3,
  vent: { length: 24, fall: 0.5, takeoff: 0.25, uniform: true },
};

test("dry-fit a sink trap, report drawer interference, and export one matching kit with its included cut", () => {
  const { project, record, layout, scrap, movement } = previewSinkDrain(fixture("kitchen-shutoff"), input);
  assert.equal(layout.slope, 0.25);
  assert.equal(layout.keep, Math.hypot(4.5, 0.09375) + input.wallSeat);
  assert.ok(scrap?.offcut);
  assert.equal(scrap.size[1], input.blank - layout.keep - input.kerf);
  assert.ok(inspectCutStock(project).valid.has(scrap.cutStock!.id));
  assert.match(movement.join("\n"), /Island pullout · Possible contact with the sink drain near 9\.91 in/);
  const kit = homeDepotShoppingList(project).items.find(({ productId }) => productId === sinkTrap.internet);
  assert.equal(kit?.quantity, 1);
  assert.equal(kit?.url, sinkTrap.listing);
  assert.equal(kit?.snapshot, undefined);
  assert.ok(!bom(project).some(({ id }) => id === sinkTrap.tube));
  const ready = generateBuildGuide(project);
  assert.ok(guideIsCurrent(ready));
  const fitStep = ready.steps.findIndex(({ title }) => title === "Fit Island sink drain");
  assert.ok(fitStep >= 0);
  const guide = guideMarkdown(ready);
  assert.match(guide, /Sink drains and wall-tube cuts[\s\S]*5\.75098 in[\s\S]*1\.25 in[\s\S]*Cut pool · 1\.37402 in/);
  assert.match(guide, /Square-cut the sink wall tube/);
  assert.match(guide, /316622155/);
  assert.match(guide, /Island pullout[\s\S]*9\.91 in/);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(ready)));
  assert.ok(reviewSinkDrain(reopened, reopened.sinkDrains![0]).layout);
  assert.deepEqual(reopened.sinkDrains![0], record);
  assert.deepEqual(buildQuestion("Fit a sink drain"), { kind: "sink-drain" });
});

test("revisions only remove stock, and keep named remnants and the original source", () => {
  const original = previewSinkDrain(fixture("kitchen-shutoff"), input);
  const { project, record, scrap } = original;
  const shorter = { ...input, wall: [4, 22.1666666667, 63.5] as SinkDrainInput["wall"] };
  assert.throws(() => previewSinkDrain(project, input), /already belong/);
  const revised = previewSinkDrain(project, shorter, record.id);
  const tube = revised.project.pieces.find(({ id }) => id === record.tubeId)!;
  assert.equal(revised.record.tubeId, record.tubeId);
  assert.equal(revised.record.bodyId, record.bodyId);
  assert.equal(revised.scrap?.cutStock?.id, tube.cutStock!.id);
  assert.equal(revised.scrap!.cutStock!.offset[1], revised.layout.keep + input.kerf);
  assert.ok(revised.project.pieces.some(({ id, offcut }) => id === scrap!.id && offcut));
  assert.ok(inspectCutStock(revised.project).valid.has(tube.cutStock!.id));
  assert.throws(() => previewSinkDrain(revised.project, input, record.id), /Select a new measured kit blank/);
  const replaced = previewSinkDrain(revised.project, input, record.id, true);
  assert.notEqual(replaced.record.tubeId, record.tubeId);
  assert.ok(replaced.project.pieces.find(({ id }) => id === record.tubeId)?.offcut);
  assert.ok(!inspectCutStock(replaced.project).invalid.length);
  const removed = removeSinkDrain(replaced.project, replaced.record);
  assert.ok(removed.pieces.find(({ id }) => id === replaced.record.tubeId)?.offcut);
  assert.ok(!removed.pieces.some(({ id }) => id === record.bodyId));
  assert.ok(!removed.sinkDrains?.length);
});

test("block a shelf within the service envelope and flag a moved tube in Checks", () => {
  const project = fixture("kitchen-shutoff");
  const shelf = part("Island service shelf", "plywood", [2, 0.5, 4], [4, 16.5, 56.5], project.steps[0].id, "Island");
  assert.throws(() => previewSinkDrain({ ...project, pieces: [...project.pieces, shelf] }, input),
    /Trap removal space hits Island service shelf/);
  assert.throws(() => previewSinkDrain(project, { ...input, blank: 5.5 }), /including the wall engagement/);
  const placed = previewSinkDrain(project, input);
  const moved = { ...placed.project, pieces: placed.project.pieces.map((piece) =>
    piece.id === placed.record.tubeId ? { ...piece, position: [5, ...piece.position.slice(1)] as typeof piece.position } : piece) };
  assert.match(reviewSinkDrain(moved, placed.record).problem!, /trap or tube changed/);
  assert.ok(validate(moved).some(({ id }) => id === `sink-drain-${placed.record.id}`));
});

test("compare field slope and vent limits, and select the adopted code reference only with scope", () => {
  const project = fixture("kitchen-shutoff");
  const flat = { ...input, wall: [4, 22.25, 64] as SinkDrainInput["wall"],
    vent: { length: 80, fall: 2, takeoff: -0.5, uniform: true } };
  const { layout } = previewSinkDrain(project, flat);
  const rows = sinkDrainCodeRows(project, flat, layout);
  assert.deepEqual(rows.map(({ state }) => state), ["discrepancy", "discrepancy", "authority-review"]);
  assert.match(rows[0].detail, /0\.09375 in more fall/);
  assert.match(rows[1].detail, /exceeds the 6 ft reference[\s\S]*exceeds one nominal pipe diameter[\s\S]*below the trap weir/);
  const removed = { ...input, vent: undefined };
  assert.equal(sinkDrainCodeRows(project, removed, layout)[1].state, "needs-input");
  assert.equal(sinkDrainCodeRows(project, { ...input, vent: { ...input.vent!, uniform: false } }, layout)[1].state, "needs-input");
  const scope = { ...blankProjectCode(), region: "utah" as const, codePath: "ibc" as const,
    projectDate: "2026-11-21", trades: ["plumbing" as const], work: "existing" as const,
    buildingAuthority: "Field verification required", authorityBasis: "Example recorded local authority" };
  const selected = sinkDrainCodeRows({ ...project, projectCode: scope }, input, previewSinkDrain(project, input).layout);
  assert.deepEqual(selected.map(({ state }) => state), ["measured-match", "measured-match"]);
  const sources = selected[0].sources;
  assert.ok(sources);
  assert.ok(sources.some(({ url }) => url === sinkDrainReferences.ipcVent.url));
  assert.ok(!sources.some(({ url }) => url === sinkDrainReferences.ircVent.url));
});

test("the packaged sink-drain study imports with a current guide and the exported cut schedule", () => {
  const project = fixture("kitchen-drain");
  assert.ok(guideIsCurrent(project));
  assert.ok(reviewSinkDrain(project, project.sinkDrains![0]).layout);
  assert.equal(guideMarkdown(project), readFileSync(new URL(
    "../public/examples/plumbing/kitchen-drain-guide.md", import.meta.url,
  ), "utf8"));
});
