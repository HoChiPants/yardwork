import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inspectCutStock } from "../src/cutStock";
import { bom, guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema } from "../src/model";
import { recordStockCutLayout } from "../src/recordStockCutLayout";
import { stockCutSequences } from "../src/stockCutSequence";
import { removeWaterRun } from "../src/wallWater";
import { previewWaterRun } from "../src/wallWaterApply";
import { waterRunDraft } from "../src/wallWaterSchema";
import { blankWaterPressure } from "../src/waterPressureSchema";
import { previewWaterPressure, reviewWaterPressure, saveWaterPressureTest, waterPressureScope } from "../src/waterPressure";
import { previewWaterStop } from "../src/waterStopApply";
import { reviewWaterStop, removeWaterStop } from "../src/waterStops";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { buildQuestion } from "../src/buildQuestions";
import { emptyWallTrace, reviewWallTrace } from "../src/wallTrace";

function kitchen() {
  const source = projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/plumbing/kitchen-tee.yardwork.json", import.meta.url,
  ), "utf8")));
  const branch = source.waterRuns!.find(({ name }) => name === "Island feed")!;
  const prepared = previewWaterRun(source, { ...waterRunDraft(branch), end: 56 }, branch.id);
  const stock = stockCutSequences(prepared.project, bom(prepared.project)).get(branch.materialId)![0];
  assert.match(stock.steps[0], /^Square-cut/);
  const { project, sourceId } = recordStockCutLayout(prepared.project, stock.layout);
  const draft = {
    name: "Island sink cold", port: { runId: branch.id, end: "end" as const }, exposed: 4,
    trim: 1, access: 2, hose: 3, outlet: "up" as const,
  };
  return { branch: prepared.run, project, draft, sourceId };
}

test("fixture shutoff fits a measured stub-out, retains the recorded stick, and exports the exact purchase", () => {
  const { branch, project, draft, sourceId } = kitchen();
  const result = previewWaterStop(project, draft);
  assert.equal(result.layout.run.pipeId, branch.pipeId);
  assert.equal(result.layout.exposed, 3);
  assert.equal(result.layout.gap, 2);
  assert.equal(result.scrap!.length, 1);
  const material = result.project.pieces.find(({ id }) => id === branch.pipeId)!;
  const scrap = result.project.pieces.find(({ id }) => id === result.scrap!.id)!;
  assert.equal(material.cutStock!.id, sourceId);
  assert.equal(scrap.cutStock!.id, sourceId);
  assert.ok(inspectCutStock(result.project).valid.has(sourceId));
  assert.ok(result.project.pieces.some((piece) => piece.offcut && piece.size[1] > 60 && piece.cutStock?.id === sourceId));
  const purchase = homeDepotShoppingList(result.project).items.find(({ productId }) => productId === "325997124");
  assert.equal(purchase?.quantity, 1);
  assert.equal(purchase?.snapshot, undefined);
  const ready = generateBuildGuide(result.project);
  const phase = ready.steps.findIndex(({ title }) => title === "Review water test before concealment");
  assert.ok(phase >= 0 && ready.steps[phase + 1].title === "Fit Island sink cold");
  const guide = guideMarkdown(ready);
  assert.match(guide, /Fixture shutoffs[\s\S]+3 in exposed at the end and mark 1 in/);
  assert.match(guide, /325997124/);
  assert.deepEqual(buildQuestion("Add a shutoff under the sink"), { kind: "water-stop" });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(ready)));
  assert.ok(reviewWaterStop(reopened, reopened.waterStops![0]).layout);
  const updated = previewWaterStop(reopened, { ...draft, trim: 0, exposed: 3, outlet: "left" }, result.stop.id);
  assert.equal(updated.stop.pieceId, result.stop.pieceId);
  assert.deepEqual(updated.layout.mouth, result.layout.mouth);
  assert.equal(updated.project.pieces.filter(({ offcut }) => offcut).length, result.project.pieces.filter(({ offcut }) => offcut).length);
  assert.ok(!removeWaterRun(updated.project, updated.layout.run).pieces.some(({ id }) => id === updated.stop.pieceId));
});

test("a fixture stop rejects occupied and wrong-size endpoints, a short stub and a blocked installation path", () => {
  const { project, draft } = kitchen();
  assert.throws(() => previewWaterStop(project, { ...draft, port: { ...draft.port, end: "start" } }), /belongs to a PEX fitting/);
  const main = project.waterRuns!.find(({ name }) => name === "Kitchen main")!;
  assert.throws(() => previewWaterStop(project, { ...draft, port: { runId: main.id, end: "start" } }), /½ in SharkBite PEX/);
  assert.throws(() => previewWaterStop(project, { ...draft, exposed: 1.5 }), /less than 1 in/);
  const result = previewWaterStop(project, { ...draft, access: 0.25 });
  const [x, y, z] = result.layout.pose.position;
  const panel = part("Drawer back", "plywood", [2, 2, 0.25], [x, y, z + 1.9], project.steps[0].id, "Island");
  const blocked = { ...project, pieces: [...project.pieces, panel] };
  assert.throws(() => previewWaterStop(blocked, { ...draft, access: 0.25 }), /Insertion travel hits Drawer back/);
  assert.throws(() => previewWaterStop(blocked, draft), /Front access hits Drawer back/);
  assert.ok(validate({ ...result.project, pieces: [...result.project.pieces, panel] })
    .some(({ id, detail }) => id === `water-stop-${result.stop.id}` && detail.includes(panel.name)));
  assert.equal(project.waterStops, undefined);
});

test("fixture stops change the test boundary and a closed handle never clears its 125 psi inlet rating", () => {
  const { project, draft, branch } = kitchen();
  const observation = { ...blankWaterPressure(branch.id, "Kitchen rough-in"), peakPsi: 150, boundaryConfirmed: "yes" as const,
    boundaryNotes: "Installer measured a temporary rough-in boundary before installing the valve." };
  const old = saveWaterPressureTest(project, observation);
  const result = previewWaterStop(old, draft);
  const scope = waterPressureScope(result.project, branch.id).scope!;
  assert.equal(scope.openEnds.length, 2);
  assert.equal(scope.stops?.[0].name, draft.name);
  assert.ok(reviewWaterPressure(result.project, old.waterPressureTests![0]).stale);
  const row = (id: string, stopExposure?: "included" | "excluded") =>
    previewWaterPressure(result.project, { ...observation, stopExposure }, scope).find((item) => item.id === id)!;
  assert.equal(row("fixture-stops").state, "needs-input");
  assert.match(row("limits", "included").detail, /fixture shutoff \(125 psi\)/);
  assert.match(row("manufacturer", "included").detail, /150 psi phases exceed/);
  assert.equal(row("fixture-stops", "excluded").state, "recorded-condition");
  assert.doesNotMatch(row("limits", "excluded").detail, /exceeds modeled fixture/);
  const logged = saveWaterPressureTest(result.project, { ...observation, stopExposure: "excluded" });
  assert.ok(reviewWaterPressure(removeWaterStop(logged, result.stop), logged.waterPressureTests!.at(-1)!).stale);
});

test("the existing slide simulation stops a cabinet front that clears the valve when closed", () => {
  const { project, draft } = kitchen();
  const front = part("Island pullout front", "hd-purebond-birch-703", [0.703, 5, 3], [-7, 24.3, 61.6],
    project.steps[0].id, "Island");
  const moving = saveMotionPlan({ ...project, pieces: [...project.pieces, front] }, {
    label: "Island pullout", memberIds: [front.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const checked = previewWaterStop(moving.project, draft);
  assert.match(checked.movement[0], /Island pullout · Possible contact with the valve/);
  const travel = reviewMotion(checked.project, moving.plan);
  assert.deepEqual(travel.preview(0).interferenceIds, []);
  const hit = travel.hits.find(({ obstacleId }) => obstacleId === checked.stop.pieceId)!;
  assert.equal(hit.kind, "envelope");
  const stop = travel.playbackLimit(0, 12);
  assert.ok(stop.travel < 12);
  assert.ok(travel.preview(stop.travel, stop.inspectAt).interferenceIds.includes(checked.stop.pieceId));
});

test("trimming the start of a recorded stick keeps the source coordinates on the retained run", () => {
  const wall = reviewWallTrace(blank("Left stub"), {
    ...emptyWallTrace(), a: [-48, 0], b: [48, 0], stock: "hd-kdht-2x4-8",
  }).candidate;
  const rough = previewWaterRun(wall, {
    name: "Left stub", sectionId: wall.sections[0].id, materialId: "hd-pex-u860w10",
    start: -8, end: 90, height: 24, depth: 0, bore: 0.875,
  });
  const plan = stockCutSequences(rough.project, bom(rough.project)).get(rough.run.materialId)![0];
  const recorded = recordStockCutLayout(rough.project, plan.layout);
  const fit = previewWaterStop(recorded.project, {
    name: "Wall faucet", port: { runId: rough.run.id, end: "start" }, exposed: 4,
    trim: 2, access: 2, hose: 3, outlet: "up",
  });
  const pipe = fit.project.pieces.find(({ id }) => id === rough.run.pipeId)!;
  const trim = fit.project.pieces.find(({ id }) => id === fit.scrap!.id)!;
  assert.equal(pipe.cutStock!.id, recorded.sourceId);
  assert.equal(pipe.cutStock!.offset[1], 2);
  assert.equal(trim.cutStock!.offset[1], 0);
  assert.equal(trim.size[1], 2);
  assert.ok(inspectCutStock(fit.project).valid.has(recorded.sourceId));
});
