import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { bom, guideMarkdown } from "../src/engine";
import { blank, part, projectSchema } from "../src/model";
import { motionGapSearch, motionReviewLines, runMotionTest, saveMotionPlan, saveMotionTestScenario } from "../src/mechanismMotion";
import { findClosestPairGap } from "../src/motionPairClearance";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { prepareCollisionSolid, solidGap } from "../src/solidCollision";

function drawerScene() {
  const project = blank("Drawer under a cabinet lip");
  const step = project.steps[0].id;
  const drawer = part("Drawer front", "plywood", [4, 2, 2], [0, 4, 0], step, "Cabinet");
  const lip = part("Cabinet lip", "plywood", [2, 2, 1], [0, 6.0625, 6], step, "Cabinet");
  project.pieces.push(drawer, lip);
  const { project: saved, plan } = saveMotionPlan(project, {
    label: "Drawer", memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  });
  const clearance = { movingId: drawer.id, otherId: lip.id, minimum: 0.125 };
  return { project: saved, plan, clearance, lip };
}

test("sliding through a tight gap flags a mid-path shortfall without a collision", () => {
  const { project, plan, clearance } = drawerScene();
  const base = runMotionTest(project, plan).review!;
  assert.equal(base.playbackLimit(0, 12).travel, 12);
  const review = runMotionTest(project, plan, { held: [], clearance }).review!;
  assert.deepEqual(review.hits, []);
  assert.deepEqual(review.clearance?.result, { status: "short", gap: 0.0625, at: 6 });
  const first = 4.5 - Math.sqrt(clearance.minimum ** 2 - 0.0625 ** 2);
  const last = 12 - first;
  const opening = review.playbackLimit(0, 12);
  const closing = review.playbackLimit(12, 0);
  assert.ok(opening.travel <= first && opening.travel > first - 0.001, `Opened to ${opening.travel}`);
  assert.ok(closing.travel >= last && closing.travel < last + 0.001, `Closed to ${closing.travel}`);
  assert.equal(opening.clearanceStop?.gap, 0.0625);
  assert.equal(closing.clearanceStop?.gap, 0.0625);
  assert.deepEqual(review.playbackLimit(opening.travel, 0), { travel: 0, inspectAt: undefined });
  assert.equal(review.playbackLimit(closing.travel, 12).travel, 12);
  assert.equal(review.playbackLimit(6, 0).travel, 6);
  assert.equal(review.playbackLimit(6, 0).clearanceStop?.gap, 0.0625);
  assert.equal(review.playbackLimit(2, 4).clearanceStop, undefined);
  assert.equal(review.preview(6).interferenceIds.length, 0);
  const pass = runMotionTest(project, plan, { held: [], clearance: { ...clearance, minimum: 0.0625 } }).review!;
  assert.deepEqual(pass.clearance?.result, { status: "met" });
  assert.equal(pass.playbackLimit(0, 12).travel, 12);
  assert.equal(pass.playbackLimit(12, 0).travel, 0);
});

test("pair clearance and solid contact stop at whichever limit playback would reach first", () => {
  const { project, plan, clearance } = drawerScene();
  const obstacle = part("Solid stop", "plywood", [2, 2, 1], [0, 4, 3.5], project.steps[0].id, "Cabinet");
  const review = runMotionTest({ ...project, pieces: [...project.pieces, obstacle] }, plan, { held: [], clearance }).review!;
  const opening = review.playbackLimit(0, 12);
  assert.ok(opening.travel < 3.5);
  assert.equal(opening.clearanceStop, undefined);
  assert.deepEqual(review.preview(opening.travel, opening.inspectAt).obstacleNames, ["Solid stop"]);
  const closing = review.playbackLimit(12, 0);
  assert.ok(closing.travel > 7);
  assert.equal(closing.clearanceStop?.requirement, clearance);
  assert.deepEqual(review.preview(closing.travel, closing.inspectAt).obstacleNames, []);
});

test("different minimum gaps stop opening and closing first in the same drawer test", () => {
  const { project, plan, clearance, lip } = drawerScene();
  const trim = part("Near trim", "plywood", [2, 2, 1], [0, 6.0625, 3], project.steps[0].id, "Cabinet");
  const additional = { ...clearance, otherId: trim.id };
  project.pieces.push(trim);
  const legacy = projectSchema.parse({ ...project, schemaVersion: 136 });
  const test = { held: [], clearance, additionalClearances: [additional] };
  const withScenario = saveMotionTestScenario(legacy, plan.id, "Two trim gaps", test).project;
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(withScenario)));
  const setup = reopened.motionPlans![0].testScenarios![0].setup;
  assert.deepEqual(setup, test);
  const review = runMotionTest(reopened, reopened.motionPlans![0], setup).review!;
  assert.deepEqual(review.clearances?.map(({ result }) => result.status), ["short", "short"]);
  assert.equal(review.hits.length, 0);
  const opens = review.playbackLimit(0, 12);
  const closes = review.playbackLimit(12, 0);
  assert.deepEqual(opens.clearanceStop?.requirement, additional);
  assert.deepEqual(closes.clearanceStop?.requirement, clearance);
  assert.ok(opens.travel > 1.39 && opens.travel < 1.4);
  assert.ok(closes.travel > 7.6 && closes.travel < 7.62);
  const guide = guideMarkdown(reopened);
  assert.match(guide, /Opening pauses near 1\.39 in for the minimum gap between P001 and P003/);
  assert.match(guide, /Closing pauses near 7\.61 in for the minimum gap between P001 and P002/);
  assert.throws(() => saveMotionTestScenario(legacy, plan.id, "Duplicate",
    { ...test, additionalClearances: [{ ...clearance, movingId: lip.id, otherId: clearance.movingId }] }),
    /Each minimum gap must check a different pair/);
  const changed = { ...reopened, pieces: reopened.pieces.filter(({ id }) => id !== trim.id) };
  const stale = runMotionTest(changed, plan, setup).review!;
  assert.equal(stale.playbackLimit(0, 12).travel, 0);
  assert.equal(stale.clearances?.[1].result.status, "needs-review");

  const mixed = saveMotionTestScenario(reopened, plan.id, "Near trim first", {
    ...test, clearance: { ...clearance, minimum: 0.05 },
  }).project;
  const question = buildQuestion('Check motion for "Drawer"');
  assert.ok(question);
  const answer = answerBuildQuestion(mixed, question, []);
  const row = answer.rows?.find(({ title }) => title === "Near trim first");
  assert.match(row?.detail ?? "", /P001 and P003 · Shortfall/);
});

test("a swinging door finds the closest pose during the second leg of a sequence", async () => {
  const project = blank("Swinging door");
  const step = project.steps[0].id;
  const door = part("Door", "plywood", [10, 2, 1], [5, 4, 0], step, "Cabinet");
  const lip = part("Cabinet lip", "plywood", [2, 2, 2], [6, 6.0625, 6], step, "Cabinet");
  const drawer = part("Drawer", "plywood", [2, 2, 2], [24, 4, 10], step, "Cabinet");
  project.pieces.push(door, lip, drawer);
  const { project: withDoor, plan: doorPlan } = saveMotionPlan(project, {
    label: "Door", memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 4, 0], travel: 90 },
  });
  const { project: withDrawer, plan: drawerPlan } = saveMotionPlan(withDoor, {
    label: "Drawer", memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 10 },
  });
  const result = runMotionTest(withDrawer, drawerPlan, {
    linkedId: doorPlan.id, held: [], openingOrder: "selected-first",
    clearance: { movingId: door.id, otherId: lip.id, minimum: 0.125 },
  }).review!;
  assert.deepEqual(result.hits, []);
  assert.equal(result.clearance?.phase, 1);
  assert.deepEqual(result.clearance?.result, { status: "short", gap: 0.0625, at: 75 });
  const opening = result.playbackLimit(0, 100);
  const closing = result.playbackLimit(100, 0);
  assert.equal(opening.phase, 1);
  assert.equal(closing.phase, 1);
  assert.ok(opening.travel > 50 && opening.travel < 75);
  assert.ok(closing.travel > 75 && closing.travel < 100);
  assert.equal(result.playbackLimit(0, 50).travel, 50);
  assert.equal(result.playbackLimit(50, 0).travel, 0);
  const gap = await result.clearance!.findClosest!();
  assert.equal(gap.phase, 1);
  assert.equal(gap.at, 75);
  assert.equal(gap.gap, 0.0625);
  assert.ok(gap.lowerBound <= 0.0625 && gap.gap - gap.lowerBound <= 1 / 256);
});

test("a passing slide finds the gap away from the endpoints and first midpoint", async () => {
  const { project, plan, clearance, lip } = drawerScene();
  lip.position[2] = 3;
  const drawer = project.pieces.find(({ id }) => id === clearance.movingId)!;
  drawer.size[2] = 0.5;
  lip.size[2] = 0.5;
  const review = runMotionTest(project, plan, { held: [], clearance: { ...clearance, minimum: 0.05 } }).review!;
  assert.deepEqual(review.clearance?.result, { status: "met" });
  const closest = await review.clearance!.findClosest!();
  assert.equal(closest.at, 3);
  assert.equal(closest.gap, 0.0625);
  assert.ok(closest.lowerBound <= 0.0625 && closest.gap - closest.lowerBound <= 1 / 256);
});

test("the gap search measures a moving pair without assigning a required minimum", async () => {
  const { project, plan, clearance, lip } = drawerScene();
  const review = runMotionTest(project, plan).review!;
  assert.equal(review.clearance, undefined);
  const search = motionGapSearch(review, clearance);
  assert.ok(search);
  assert.equal((await search()).gap, 0.0625);
  assert.equal(motionGapSearch(review, { movingId: lip.id, otherId: lip.id }), undefined);
  assert.equal(motionGapSearch(review, { movingId: clearance.movingId, otherId: "missing" }), undefined);
});

test("a hinge finds a narrow interior pass while keeping the minimum bounded", async () => {
  const project = blank("Hinge corner");
  const step = project.steps[0].id;
  const door = part("Door", "plywood", [10, 2, 1], [5, 4, 0], step, "Cabinet");
  const radians = 35 * Math.PI / 180;
  const lip = part("Lip", "plywood", [0.5, 2, 0.5], [10 * Math.cos(radians), 6.0625, 10 * Math.sin(radians)], step, "Cabinet");
  const { project: saved, plan } = saveMotionPlan({ ...project, pieces: [door, lip] }, {
    label: "Door", memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 4, 0], travel: 90 },
  });
  const clearance = { movingId: door.id, otherId: lip.id, minimum: 0.05 };
  const review = runMotionTest(saved, plan, { held: [], clearance }).review!;
  assert.deepEqual(review.clearance?.result, { status: "met" });
  const gap = await review.clearance!.findClosest!();
  assert.ok(gap.at > 30 && gap.at < 40);
  // The overlap in plan near 35° leaves the constant Y separation as the gap.
  assert.equal(gap.gap, 0.0625);
  assert.ok(gap.lowerBound <= 0.0625 && gap.gap - gap.lowerBound <= 1 / 256);
});

test("the gap search retains a lower bound when its pose budget runs out", async () => {
  const project = blank();
  const a = part("A", "plywood", [2, 2, 2], [0, 0, 0], project.steps[0].id, "Test");
  const b = part("B", "plywood", [2, 2, 2], [0, 3, 0], project.steps[0].id, "Test");
  const pair = [prepareCollisionSolid(a)!, prepareCollisionSolid(b)!] as const;
  let checked = 0;
  const gap = await findClosestPairGap(90, () => {
    checked++;
    return [...pair];
  }, () => 100_000);
  assert.equal(checked, 511);
  assert.equal(gap.at, 0);
  assert.equal(gap.gap, 1);
  assert.equal(gap.lowerBound, 0);
  const signal = AbortSignal.abort();
  await assert.rejects(findClosestPairGap(90, () => {
    assert.fail("An aborted search should skip geometry work.");
  }, () => 100_000, signal), { name: "AbortError" });
});

test("saved gap checks export the observed result and review removed parts on reopen", () => {
  const { project, plan, clearance, lip } = drawerScene();
  const legacy = projectSchema.parse({ ...project, schemaVersion: 82 });
  assert.equal(legacy.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(legacy.motionPlans![0].testSetup, undefined);
  const saved = saveMotionTestScenario(legacy, plan.id, "Lip clearance", { held: [], clearance }).project;
  const roundTrip = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(roundTrip.motionPlans![0].testScenarios![0].setup.clearance, clearance);
  assert.match(guideMarkdown(roundTrip), /0\.125 in minimum gap · P001 and P002 · Shortfall\. Observed 0\.0625 in near 6 in/);
  roundTrip.pieces = roundTrip.pieces.filter(({ id }) => id !== lip.id);
  assert.match(motionReviewLines(roundTrip).join("\n"), /Needs review\. A selected part is missing/);
  const review = runMotionTest(roundTrip, roundTrip.motionPlans![0], roundTrip.motionPlans![0].testScenarios![0].setup).review!;
  assert.equal(review.playbackLimit(3, 12).travel, 3);
  assert.match(review.playbackLimit(3, 12).clearanceStop?.reason ?? "", /selected part is missing/);
  assert.equal(review.preview(12).travel, 12);
});

test("the editable drawer practice plan keeps its paired clearance and shared offcut", async () => {
  const fixture = new URL("../public/examples/motion/drawer-lip-gap.yardwork.json", import.meta.url);
  const project = projectSchema.parse(JSON.parse(await readFile(fixture, "utf8")));
  const plan = project.motionPlans![0];
  const review = runMotionTest(project, plan, plan.testScenarios![0].setup).review!;
  assert.equal(review.playbackLimit(0, 12).clearanceStop?.gap, 0.0625);
  assert.equal(review.playbackLimit(12, 0).clearanceStop?.gap, 0.0625);
  const row = bom(project).find(({ id }) => id === "plywood")!;
  assert.equal(row.quantity, 0);
  assert.equal(row.onHandStockUnits, 1);
  assert.equal(project.pieces.filter(({ offcut }) => offcut).length, 3);
  const guide = new URL("drawer-lip-gap-guide.md", fixture);
  assert.equal(guideMarkdown(project).trimEnd(), (await readFile(guide, "utf8")).trimEnd());
});

test("solid distance measures a Euclidean diagonal between separated retained parts", () => {
  const project = blank();
  const step = project.steps[0].id;
  const a = part("A", "plywood", [2, 2, 2], [0, 0, 0], step, "Test");
  const b = part("B", "plywood", [2, 2, 2], [2.3, 2.4, 0], step, "Test");
  assert.ok(Math.abs(solidGap(prepareCollisionSolid(a)!, prepareCollisionSolid(b)!) - 0.5) < 1e-8);
});

test("the displayed gap segment joins the closest points on crossing edges", () => {
  const project = blank();
  const step = project.steps[0].id;
  const a = part("A", "plywood", [4, 0.5, 0.5], [0, 0, 0], step, "Test");
  const b = part("B", "plywood", [0.5, 0.5, 4], [0, 1, 0], step, "Test");
  let measured = false;
  const distance = solidGap(prepareCollisionSolid(a)!, prepareCollisionSolid(b)!, ([first, second]) => {
    measured = true;
    assert.equal(first[1], 0.25);
    assert.equal(second[1], 0.75);
    assert.equal(first[0], second[0]);
    assert.equal(first[2], second[2]);
    assert.ok(Math.abs(first[0]) <= 0.25 && Math.abs(first[2]) <= 0.25);
  });
  assert.equal(distance, 0.5);
  assert.ok(measured);
  b.position[1] = 0.5;
  assert.equal(solidGap(prepareCollisionSolid(a)!, prepareCollisionSolid(b)!, () => {
    assert.fail("Touching parts have no positive gap to mark.");
  }), 0);
});

test("the clearance checker measures and marks the inside edge of a through-cut", async () => {
  const project = blank();
  const step = project.steps[0].id;
  const drawer = part("Moving insert", "plywood", [3.875, 3, 1], [0, 8, 0], step, "Cabinet");
  const panel = part("Cutout panel", "plywood", [12, 12, 0.75], [0, 8, 6], step, "Cabinet");
  panel.rectangularOpenings = [{ axis: 2, center: [0, 0], spans: [4, 4] }];
  const { project: saved, plan } = saveMotionPlan({ ...project, pieces: [drawer, panel] }, {
    label: "Insert", memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  });
  const clearance = { movingId: drawer.id, otherId: panel.id, minimum: 0.125 };
  const result = runMotionTest(saved, plan, { held: [], clearance }).review!;
  assert.deepEqual(result.hits, []);
  assert.deepEqual(result.clearance?.result, { status: "short", gap: 0.0625, at: 6 });
  const pass = runMotionTest(saved, plan, { held: [], clearance: { ...clearance, minimum: 0.05 } });
  assert.equal(pass.review?.clearance?.result.status, "met");
  const found = await pass.review!.clearance!.findClosest!();
  const [moving, cell] = found.endpoints!;
  assert.equal(Math.abs(moving[0]), 1.9375);
  assert.equal(Math.abs(cell[0]), 2);

});
