import assert from "node:assert/strict";
import { test } from "node:test";
import { guideMarkdown } from "../src/engine";
import { blank, part, projectSchema } from "../src/model";
import { motionReviewLines, runMotionTest, saveMotionPlan, saveMotionTestScenario } from "../src/mechanismMotion";
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
  const review = runMotionTest(project, plan, { held: [], clearance }).review!;
  assert.deepEqual(review.hits, []);
  assert.deepEqual(review.clearance?.result, { status: "short", gap: 0.0625, at: 6 });
  assert.equal(review.playbackLimit(0, 12).travel, 12);
  assert.equal(review.playbackLimit(0, 12).inspectAt, undefined);
  const pass = runMotionTest(project, plan, { held: [], clearance: { ...clearance, minimum: 0.0625 } }).review!;
  assert.deepEqual(pass.clearance?.result, { status: "met" });
});

test("a swinging door checks the gap at an interior pose in a sequential test", () => {
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
});

test("solid distance measures a Euclidean diagonal between separated retained parts", () => {
  const project = blank();
  const step = project.steps[0].id;
  const a = part("A", "plywood", [2, 2, 2], [0, 0, 0], step, "Test");
  const b = part("B", "plywood", [2, 2, 2], [2.3, 2.4, 0], step, "Test");
  assert.ok(Math.abs(solidGap(prepareCollisionSolid(a)!, prepareCollisionSolid(b)!) - 0.5) < 1e-8);
});

test("the clearance checker measures the inside edge of a through-cut", () => {
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
});
