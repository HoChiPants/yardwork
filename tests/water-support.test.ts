import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bom, guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema, type Project } from "../src/model";
import { transformSection } from "../src/sections";
import { removeWaterRun, reviewWaterRun, waterRunMembers } from "../src/wallWater";
import { previewWaterRun } from "../src/wallWaterApply";
import { waterRunDraft, type WaterRunInput } from "../src/wallWaterSchema";
import { previewSplitWaterMain } from "../src/waterFittingApply";
import { reviewWaterFitting } from "../src/waterFittings";
import { blankWaterPressure } from "../src/waterPressureSchema";
import { reviewWaterPressure, saveWaterPressureTest } from "../src/waterPressure";
import { longSupportSpan, waterSupportNetwork } from "../src/waterSupportNetwork";
import { emptyWallTrace, reviewWallTrace } from "../src/wallTrace";

const isolator = { face: "start" as const, flange: 0.0625 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function wallRun(materialId: WaterRunInput["materialId"] = "hd-pex-u860w10") {
  const { candidate: project } = reviewWallTrace(blank("Support test wall"), {
    ...emptyWallTrace(), a: [-48, 0], b: [48, 0], stock: "hd-kdht-2x4-8",
  });
  const input: WaterRunInput = {
    sectionId: project.sections[0].id, name: "PEX supply", materialId, start: 3, end: 93,
    height: 24, depth: 0, bore: materialId === "hd-pex-u860w10" ? 0.875 : 1.125,
  };
  return { project, input };
}

function kitchen() {
  return projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/plumbing/kitchen-tee.yardwork.json", import.meta.url,
  ), "utf8")));
}

test("the isolator option sizes actual bores and adds the exact fifteen-unit purchasing packs without changing the pipe or shield takeoff", () => {
  for (const spec of [
    ["hd-pex-u860w10", "hd-holdrite-161j15", "308675097"],
    ["hd-pex-u870w10", "hd-holdrite-162j15", "308675098"],
  ] as const) {
    const { project, input } = wallRun(spec[0]);
    const plain = previewWaterRun(project, input);
    const upgrade = previewWaterRun(plain.project, { ...input, isolator }, plain.run.id);
    assert.equal(upgrade.run.pipeId, plain.run.pipeId);
    assert.equal(upgrade.layout.length, plain.layout.length);
    assert.equal(upgrade.run.shields.length, plain.run.shields.length);
    assert.equal(upgrade.layout.studs.length, 5);
    assert.ok(upgrade.layout.studs.every(({ opening }) => opening.diameter === 1.375));
    assert.equal(upgrade.run.isolators?.length, 5);
    const row = bom(upgrade.project).find(({ id }) => id === spec[1])!;
    assert.equal(row.quantity, 1);
    assert.equal(row.packCount, 15);
    assert.equal(row.physicalStockUnits, 5);
    assert.match(JSON.stringify(homeDepotShoppingList(upgrade.project)), new RegExp(spec[2]));
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(upgrade.project)));
    assert.ok(reviewWaterRun(restored, restored.waterRuns![0]).measured);
    assert.match(guideMarkdown(restored), /10 flange nails specified/);
    assert.match(guideMarkdown(restored), /Longest span between modeled supports · 16 in/);
    const reversed = previewWaterRun(restored, { ...input, isolator: { flange: 0.0625, face: "end" } }, upgrade.run.id);
    close(reversed.layout.supports[0].distance - upgrade.layout.supports[0].distance, 1.5);
    assert.deepEqual(reversed.run.isolators, upgrade.run.isolators);
    const moved = transformSection(reversed.project, input.sectionId, [10, 0, 20], [0, Math.PI / 2, 0]);
    assert.ok(reviewWaterRun(moved, reversed.run).measured);
    const removed = removeWaterRun(moved, reversed.run);
    assert.ok(removed.pieces.every(({ id }) => !waterRunMembers(reversed.run).includes(id)));
  }
});

test("isolators reject insufficient edge wood and blocked flanges before altering the existing route", () => {
  const { project, input } = wallRun();
  const nearEdge = previewWaterRun(project, { ...input, depth: 0.55 });
  assert.throws(() => previewWaterRun(nearEdge.project, { ...input, depth: 0.55, isolator }, nearEdge.run.id), /at least 5\/8 in/);
  const preview = previewWaterRun(project, { ...input, isolator });
  const face = preview.layout.supports[0].placement.position;
  const obstacle = part("Blocking in flange space", "stud", [0.04, 0.25, 0.2], [face[0], face[1] + 0.8, face[2]], project.steps[0].id, "Test");
  const occupied: Project = { ...project, pieces: [...project.pieces, obstacle] };
  assert.throws(() => previewWaterRun(occupied, { ...input, isolator }), /isolator flange hits Blocking/);
  assert.ok(previewWaterRun(occupied, input).layout.studs.length > 0);
  assert.equal(nearEdge.project.waterRuns![0].isolators, undefined);
});

test("the spacing review follows a reducing tee along all three centerline paths", () => {
  const base = kitchen();
  let current = base;
  for (const run of base.waterRuns!) current = previewWaterRun(current, { ...waterRunDraft(run), isolator }, run.id).project;
  const result = waterSupportNetwork(current);
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.loop, false);
  assert.equal(result.spans.filter(({ kind }) => kind === "end-reach").length, 3);
  const joinedPaths = result.spans.filter(({ kind, from, to }) => kind === "supported" && from.runId !== to.runId);
  assert.equal(joinedPaths.length, 3);
  for (const span of joinedPaths) assert.ok(span.length > 4 && span.length <= 32);
  const inline = joinedPaths.find(({ from, to }) => ![from.label, to.label].some((name) => name.includes("Island feed")))!;
  close(inline.length, 16);
  assert.equal(result.spans.filter(longSupportSpan).length, 0);
  assert.ok(reviewWaterFitting(current, current.waterFittings![0]).layout);
  assert.match(guideMarkdown(current), /PEX support spacing[\s\S]+Between isolators/);
  const main = current.waterRuns!.find(({ name }) => name === "Kitchen main")!;
  const { isolator: _remove, ...plain } = waterRunDraft(main);
  const unsupported = previewWaterRun(current, plain, main.id).project;
  const changed = waterSupportNetwork(unsupported);
  assert.ok(changed.spans.some((span) => longSupportSpan(span) && span.kind === "end-reach"));
  assert.ok(validate(unsupported).some(({ id }) => id === "water-support-spacing"));
});

test("splitting a supported main keeps the isolators assigned to the two new legs and requires a fresh pressure record", () => {
  const { project: wall, input } = wallRun("hd-pex-u870w10");
  const framed = reviewWallTrace(wall, { ...emptyWallTrace(), a: [8, 4], b: [8, 52] }).candidate;
  const main = previewWaterRun(framed, { ...input, isolator });
  const branch = previewWaterRun(main.project, {
    ...input, sectionId: framed.sections[1].id, name: "Branch", materialId: "hd-pex-u860w10",
    start: -2, end: 45, isolator,
  });
  const saved = saveWaterPressureTest(branch.project, blankWaterPressure(main.run.id, "Original route"));
  const branched = previewSplitWaterMain(saved, {
    mainId: main.run.id, branch: { runId: branch.run.id, end: "start" }, inlineLength: 3.5, branchReach: 1.65,
  });
  assert.ok(reviewWaterFitting(branched.project, branched.fitting).layout);
  assert.equal(branched.project.waterRuns?.reduce((count, run) => count + (run.isolators?.length ?? 0), 0),
    main.layout.supports.length + branch.layout.supports.length);
  assert.equal(reviewWaterPressure(branched.project, saved.waterPressureTests![0]).stale, true);
  assert.equal(waterSupportNetwork(branched.project).unresolved.length, 0);
});
