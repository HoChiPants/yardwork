import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyStages } from "../src/assemblyStages";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { bom, guideMarkdown, inspectCutStock, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema, type Project } from "../src/model";
import { removeSection, transformSection } from "../src/sections";
import { emptyWallTrace, reviewWallTrace } from "../src/wallTrace";
import { previewWaterRun } from "../src/wallWaterApply";
import { previewSplitWaterMain, previewWaterFitting } from "../src/waterFittingApply";
import { removeWaterFitting, reviewWaterFitting } from "../src/waterFittings";
import type { WaterFittingInput } from "../src/waterFittingSchema";
import { reviewWaterRun } from "../src/wallWater";
import { toolChecklist } from "../src/tools";

function corner() {
  const first = reviewWallTrace(blank("Utility corner"), { ...emptyWallTrace(), a: [-80, 0], b: [-4, 0] }).candidate;
  const frame = reviewWallTrace(first, { ...emptyWallTrace(), a: [0, 4], b: [0, 80] }).candidate;
  const a = previewWaterRun(frame, {
    name: "Sink feed", sectionId: frame.sections[0].id, materialId: "hd-pex-u860w10", start: 3, end: 78, height: 24, depth: 0, bore: 0.875,
  });
  const b = previewWaterRun(a.project, {
    name: "Return leg", sectionId: frame.sections[1].id, materialId: "hd-pex-u860w10", start: -2, end: 73, height: 24, depth: 0, bore: 0.875,
  });
  const input: WaterFittingInput = { a: { runId: a.run.id, end: "end" }, b: { runId: b.run.id, end: "start" }, reach: [1.4, 1.4] };
  return { project: b.project, a: a.run, b: b.run, input };
}

function straight(height = 24, size = "hd-pex-u870w10") {
  const frame = reviewWallTrace(blank("Utility wall"), { ...emptyWallTrace(), a: [-48, 0], b: [48, 0] }).candidate;
  const draft = { sectionId: frame.sections[0].id, materialId: "hd-pex-u870w10", height: 24, depth: 0, bore: 1.125 };
  const a = previewWaterRun(frame, { ...draft, name: "First leg", start: 3, end: 36 });
  const b = previewWaterRun(a.project, { ...draft, name: "Second leg", start: 46, end: 93, height, materialId: size });
  const input: WaterFittingInput = { a: { runId: a.run.id, end: "end" }, b: { runId: b.run.id, end: "start" }, reach: [1.3, 1.3] };
  return { project: b.project, input };
}

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("a measured 90-degree elbow joins real framed legs, updates both pipe cuts and purchases one exact fitting", () => {
  const { project, input } = corner();
  const result = previewWaterFitting(project, input);
  assert.equal(result.fitting.materialId, "hd-sharkbite-ur248a");
  assert.equal(project.waterFittings, undefined);
  for (const cut of result.pipeCuts) {
    close(cut.before, 75);
    close(cut.after, 76.6);
  }
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(result.project)));
  assert.ok(reviewWaterFitting(reopened, result.fitting).layout);
  assert.equal(bom(reopened).find(({ id }) => id === result.fitting.materialId)?.quantity, 1);
  assert.match(JSON.stringify(homeDepotShoppingList(reopened)), /323676174/);
  assert.match(guideMarkdown(reopened), /PEX fittings and insertion marks[\s\S]+Sink feed · Cut pipe to 76\.6 in\. Mark 1 in of insertion at the end/);
  const titles = assemblyStages(reopened).map(({ title }) => title);
  const connected = titles.indexOf("Connect Sink feed and Return leg");
  for (const name of ["Sink feed", "Return leg"]) {
    const rough = titles.indexOf(`Rough in ${name}`);
    assert.ok(rough >= 0 && rough < connected);
  }
  const updated = previewWaterFitting(reopened, { ...input, reach: [1.42, 1.4] }, result.fitting.id);
  assert.equal(updated.fitting.id, result.fitting.id);
  assert.equal(updated.fitting.pieceId, result.fitting.pieceId);
  assert.ok(reviewWaterFitting(updated.project, updated.fitting).layout);
});

test("a three-quarter straight coupling preserves both insertion depths and packs the two cuts into one stock stick", () => {
  const { project, input } = straight();
  const result = previewWaterFitting(project, input);
  assert.equal(result.fitting.materialId, "hd-sharkbite-ur016a");
  assert.equal(result.layout.product.insertion, 1.25);
  close(result.pipeCuts.find(({ label }) => label === "First leg")!.after, 37.95);
  close(result.pipeCuts.find(({ label }) => label === "Second leg")!.after, 51.95);
  assert.equal(result.stock?.quantity, 1);
  close(result.stock!.bins[0].remaining, 30.1);
  assert.match(JSON.stringify(homeDepotShoppingList(result.project)), /325997233/);
  assert.throws(() => previewWaterFitting(project, { ...input, reach: [1.4, 1.3] }), /one measured face-to-face length/);
  assert.throws(() => previewWaterFitting(project, { ...input, reach: [1.25, 1.25] }), /must allow 1\.25 in of insertion/);
});

test("blocked body, close fittings, wrong size, wrong end and height conflicts never cut the draft", () => {
  const { project, input } = corner();
  const obstacle = (name: string, position: [number, number, number]): Project => ({
    ...project, pieces: [...project.pieces, part(name, "plywood", [0.3, 0.4, 0.3], position, project.steps[0].id, "Framing")],
  });
  assert.throws(() => previewWaterFitting(obstacle("Junction backing", [0, 24, 0]), input), /fitting envelope hits Junction backing/);
  assert.ok(previewWaterFitting(obstacle("Clear of both legs", [-1.1, 24, 1.1]), input).fitting);
  const confining = { ...project, pieces: [...project.pieces, part("Nearby service fitting", "hd-sharkbite-ur008a", [2.1, 1, 1], [2.3, 24, 1.1], project.steps[0].id, "Water")] };
  assert.throws(() => previewWaterFitting(confining, input), /Leave at least 1 in between/);
  assert.throws(() => previewWaterFitting(project, { ...input, a: { ...input.a, end: "start" } }), /needs pipe extending beyond/);
  const unlevel = straight(25);
  assert.throws(() => previewWaterFitting(unlevel.project, unlevel.input), /different heights/);
  const mixed = straight(24, "hd-pex-u860w10");
  assert.throws(() => previewWaterFitting(mixed.project, mixed.input), /two pipes of the same size/);
  assert.equal(project.waterFittings, undefined);
});

test("occupied ends cannot be reused, moved walls invalidate a saved fit, and removing a fit leaves the pipe cuts", () => {
  const { project, a, input } = corner();
  const { project: connected, fitting } = previewWaterFitting(project, input);
  assert.throws(() => previewWaterFitting(connected, input), /already belongs to another fitting/);
  const wall = connected.sections[0];
  const moved = transformSection(connected, wall.id, [wall.origin[0] - 3, wall.origin[1], wall.origin[2]], wall.rotation);
  assert.match(reviewWaterFitting(moved, fitting).problem ?? "", /pipe ends moved/);
  assert.ok(validate(moved).some(({ id }) => id === `water-fitting-${fitting.id}`));
  const guide = guideMarkdown(moved);
  assert.match(guide, /Review connection before joining/);
  assert.doesNotMatch(guide, /Mark 1 in of insertion at the end/);
  const removed = removeWaterFitting(connected, fitting);
  assert.deepEqual(removed.waterRuns, connected.waterRuns);
  assert.ok(!removed.pieces.some(({ id }) => id === fitting.pieceId));
  const wallRemoved = removeSection(connected, a.sectionId);
  assert.deepEqual(wallRemoved.waterFittings, []);
  assert.ok(!wallRemoved.pieces.some(({ id }) => id === fitting.pieceId));
});

test("the idea planner opens the fitting tool and reads a saved connection", () => {
  const { project, input } = corner();
  const { project: connected, fitting } = previewWaterFitting(project, input);
  const question = buildQuestion("Connect two PEX runs around a corner");
  assert.deepEqual(question, { kind: "water-fitting" });
  const answer = answerBuildQuestion(connected, question!, []);
  assert.deepEqual(answer.rows?.[0].link?.action, { kind: "water-fitting", fittingId: fitting.id });
});

test("a third run can connect at the other end of an already linked pipe", () => {
  const wall = reviewWallTrace(blank("Supply extension"), {
    ...emptyWallTrace(), a: [-72, 0], b: [72, 0], stock: "hd-spf-2x4-12",
  }).candidate;
  const spec = { sectionId: wall.sections[0].id, materialId: "hd-pex-u860w10", height: 24, depth: 0, bore: 0.875 };
  const a = previewWaterRun(wall, { ...spec, name: "Supply", start: 3, end: 36 });
  const b = previewWaterRun(a.project, { ...spec, name: "Middle", start: 44, end: 84 });
  const c = previewWaterRun(b.project, { ...spec, name: "Outlet", start: 92, end: 140 });
  const first = previewWaterFitting(c.project, {
    a: { runId: a.run.id, end: "end" }, b: { runId: b.run.id, end: "start" }, reach: [1.05, 1.05],
  });
  const second = previewWaterFitting(first.project, {
    a: { runId: b.run.id, end: "end" }, b: { runId: c.run.id, end: "start" }, reach: [1.05, 1.05],
  });
  assert.equal(second.project.waterFittings?.length, 2);
  for (const entry of second.project.waterFittings!) assert.ok(reviewWaterFitting(second.project, entry).layout);
  assert.equal(bom(second.project).find(({ id }) => id === "hd-sharkbite-ur008a")?.quantity, 2);
});

function branchLayout({ onHand = false, mainSize = "hd-pex-u870w10", branchSize = "hd-pex-u860w10" } = {}) {
  const first = reviewWallTrace(blank("Kitchen service tee"), {
    ...emptyWallTrace(), a: [-54, 0], b: [54, 0], stock: "hd-spf-2x4-10",
  }).candidate;
  let framed = reviewWallTrace(first, { ...emptyWallTrace(), a: [0, 4], b: [0, 52] }).candidate;
  if (onHand) framed = addMeasuredOffcut(framed, framed.steps[0].id, "hd-pex-u870w10", [110, 0.875, 0.875], "Shop supply remnant");
  const main = previewWaterRun(framed, { name: "Kitchen main", sectionId: framed.sections[0].id, materialId: mainSize,
    start: 3, end: 105, height: 24, depth: 0, bore: 1.125, reuse: onHand });
  const branch = previewWaterRun(main.project, { name: "Island feed", sectionId: framed.sections[1].id, materialId: branchSize,
    start: -2, end: 45, height: 24, depth: 0, bore: 1.125 });
  const draft = { mainId: main.run.id, branch: { runId: branch.run.id, end: "start" },
    inlineLength: 3.5, branchReach: 1.65 };
  return { project: branch.project, main: main.run, branch: branch.run, draft };
}

test("a reducing tee splits an existing supply into two in-line cuts and seats the smaller branch separately", () => {
  const { project, main, branch, draft } = branchLayout();
  const plan = previewSplitWaterMain(project, draft);
  assert.equal(plan.fitting.materialId, "hd-sharkbite-ur412a");
  assert.equal(plan.fitting.a.runId, main.id);
  assert.equal(plan.fitting.branch?.port.runId, branch.id);
  assert.equal(plan.split.before, 102);
  close(plan.split.left, 50.5);
  close(plan.split.right, 50.5);
  close(plan.split.removed, 1);
  close(plan.pipeCuts.find(({ label }) => label === "Island feed")!.after, 48.35);
  assert.deepEqual(plan.layout.positions.map(({ insertion }) => insertion), [1.25, 1.25, 1]);
  assert.deepEqual(plan.stocks.map(({ quantity }) => quantity), [1, 1]);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(plan.project)));
  assert.ok(reopened.waterRuns?.every((run) => reviewWaterRun(reopened, run).measured));
  assert.ok(reviewWaterFitting(reopened, plan.fitting).layout);
  assert.match(JSON.stringify(homeDepotShoppingList(reopened)), /325997410/);
  assert.match(guideMarkdown(reopened), /Island feed · Cut pipe to 48.35 in. Mark 1 in of insertion at the start/);
  assert.match(guideMarkdown(reopened), /Inline pipe ends · 1 in apart/);
  assert.ok(toolChecklist(reopened).requirements.some(({ capability, referenceUrls }) =>
    capability === "pex-insertion-mark" && referenceUrls.includes("https://www.homedepot.com/p/329736096")));
  const stages = assemblyStages(reopened).map(({ title }) => title);
  assert.ok(stages.indexOf("Rough in Island feed") < stages.indexOf("Connect Kitchen main and Kitchen main · B and Island feed"));
  assert.deepEqual(buildQuestion("Add a tee to the PEX main for the island"), { kind: "water-fitting", tee: true });
  assert.equal(project.waterRuns?.length, 2);
});

test("a recorded main keeps both splits, original offcut and center trim on one on-hand stock source", () => {
  const { project, main, branch, draft } = branchLayout({ onHand: true });
  const source = project.pieces.find(({ id }) => id === main.pipeId)!.cutStock!;
  const plan = previewSplitWaterMain(project, draft);
  assert.ok(plan.split.recorded);
  const assigned = plan.project.pieces.filter(({ cutStock }) => cutStock?.id === source.id);
  assert.equal(assigned.length, 4);
  for (const kept of assigned.filter(({ offcut }) => !offcut)) close(kept.size[1], 50.5);
  assert.deepEqual(assigned.filter(({ offcut }) => offcut).map(({ size }) => size[1]).sort((a, b) => a - b), [1, 8]);
  assert.ok(inspectCutStock(plan.project).valid.has(source.id));
  assert.equal(plan.stock?.quantity, 0);
  assert.ok(plan.project.onHandCutSources?.includes(source.id));
  const removed = removeSection(plan.project, branch.sectionId);
  assert.deepEqual(removed.waterFittings, []);
  assert.ok(!removed.pieces.some(({ id }) => id === plan.fitting.pieceId));
});

test("splitting a main preserves an existing far-end coupling and its dependent guide stage", () => {
  const { project, main, draft } = branchLayout();
  const frame = reviewWallTrace(project, { ...emptyWallTrace(), a: [64, 0], b: [112, 0] }).candidate;
  const extension = previewWaterRun(frame, {
    name: "Utility outlet", sectionId: frame.sections.at(-1)!.id, materialId: main.materialId,
    start: -2, end: 45, height: 24, depth: 0, bore: 1.125,
  });
  const connected = previewWaterFitting(extension.project, {
    a: { runId: main.id, end: "end" }, b: { runId: extension.run.id, end: "start" }, reach: [1.3, 1.3],
  });
  const split = previewSplitWaterMain(connected.project, draft);
  const coupling = split.project.waterFittings?.find(({ id }) => id === connected.fitting.id);
  assert.equal(coupling?.a.runId, split.fitting.b.runId);
  assert.equal(coupling?.pieceId, connected.fitting.pieceId);
  assert.ok(reviewWaterFitting(split.project, coupling!).layout);
  assert.ok(reviewWaterFitting(split.project, split.fitting).layout);
});

test("all three tee sockets reject occupied, incompatible or obstructed layouts before changing the draft", () => {
  const { project, draft } = branchLayout();
  assert.throws(() => previewSplitWaterMain(project, { ...draft, branchReach: 0.9 }), /the branch must allow 1 in/);
  assert.throws(() => previewSplitWaterMain(project, { ...draft, branch: { ...draft.branch, end: "end" } }), /facing the main/);
  const obstruction = part("Branch shoulder obstruction", "plywood", [0.15, 0.2, 0.3], [0.58, 24, 1.35], project.steps[0].id, "Kitchen");
  const blocked = { ...project, pieces: [...project.pieces, obstruction] };
  assert.throws(() => previewSplitWaterMain(blocked, draft), /fitting envelope hits Branch shoulder obstruction/);
  const plan = previewSplitWaterMain(project, draft);
  assert.throws(() => previewSplitWaterMain(plan.project, draft), /already belongs to another fitting/);
  const revised = previewWaterFitting(plan.project, {
    a: plan.fitting.a, b: plan.fitting.b, reach: [1.76, 1.76],
    branch: { ...plan.fitting.branch!, reach: 1.68 },
  }, plan.fitting.id);
  assert.equal(revised.fitting.pieceId, plan.fitting.pieceId);
  assert.ok(reviewWaterFitting(revised.project, revised.fitting).layout);
  assert.equal(plan.project.waterFittings?.[0].reach[0], 1.75);
  for (const [size, result] of [["hd-pex-u860w10", "hd-sharkbite-ur362a"], ["hd-pex-u870w10", "hd-sharkbite-ur370a"]]) {
    const same = branchLayout({ mainSize: size, branchSize: size });
    assert.equal(previewSplitWaterMain(same.project, same.draft).fitting.materialId, result);
  }
  const upsized = branchLayout({ mainSize: "hd-pex-u860w10", branchSize: "hd-pex-u870w10" });
  assert.throws(() => previewSplitWaterMain(upsized.project, upsized.draft), /same-size branch or a ½ in branch/);
});
