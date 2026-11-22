import assert from "node:assert/strict";
import test from "node:test";
import { buildQuestion, answerBuildQuestion } from "../src/buildQuestions";
import { checkDrawerStop, findDrawerOpening } from "../src/drawerOpening";
import { guideMarkdown } from "../src/engine";
import { blank, part, projectSchema } from "../src/model";
import { runMotionTest, saveMotionPlan, saveMotionTestScenario } from "../src/mechanismMotion";

function cabinet() {
  const project = blank("Drawer behind a cabinet door");
  const step = project.steps[0].id;
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], step, "Cabinet");
  const drawer = part("Pull-out drawer", "plywood", [1, 2, 1], [5, 10, -8], step, "Cabinet");
  const wall = part("Wall return", "plywood", [0.6, 5, 0.6], [0, 10, 11.5], step, "Room");
  const slide = saveMotionPlan({ ...project, pieces: [drawer, door, wall] }, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  return { project: swing.project, slide: slide.plan, swing: swing.plan, drawer, door, wall };
}

test("find a reachable angle for a drawer and save a tested opening and closing sequence", async () => {
  const { project, slide, swing, door, drawer } = cabinet();
  const before = JSON.stringify(project);
  const result = await findDrawerOpening(project, slide, swing, 12.5, { held: [] });
  assert.equal(result.status, "clear");
  assert.ok(result.angle > 25 && result.angle < 75);
  assert.ok(result.maximum < 90, "the wall limits the tested door swing");
  assert.equal(result.tried, result.angle);
  assert.equal(result.setup.openingOrder, "companion-first");
  assert.equal(JSON.stringify(project), before);
  const prior = runMotionTest(project, slide, {
    ...result.setup, sequenceTargets: { selected: { kind: "slide", travel: 12.5 },
      companion: { kind: "hinge", travel: result.angle - 1 } },
  }).review!;
  assert.ok(prior.hits.some(({ movingId, obstacleId }) => movingId === drawer.id && obstacleId === door.id));

  const saved = saveMotionTestScenario(project, slide.id, "Door before drawer", result.setup).project;
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const savedSlide = reopened.motionPlans!.find(({ id }) => id === slide.id)!;
  const scenario = savedSlide.testScenarios![0];
  const review = runMotionTest(reopened, savedSlide, scenario.setup).review!;
  assert.deepEqual(review.playbackLimit(0, 100), { travel: 100 });
  assert.deepEqual(review.playbackLimit(100, 0), { travel: 0 });
  assert.equal(savedSlide.mechanism.travel, 24);
  assert.match(guideMarkdown(reopened), new RegExp(`Test targets · Cabinet door ${result.angle}°, Pull-out drawer 12\\.5 in\\.`));
});

test("a recommendation respects the chosen gap and works with the door as the selected motion", async () => {
  const { project, slide, swing, door, drawer } = cabinet();
  const usual = await findDrawerOpening(project, slide, swing, 12.5, { held: [] });
  const result = await findDrawerOpening(project, swing, slide, 12.5, {
    held: [], clearance: { movingId: drawer.id, otherId: door.id, minimum: 0.75 },
  });
  assert.equal(result.status, "clear");
  assert.ok(result.angle > usual.angle);
  assert.equal(result.setup.openingOrder, "selected-first");
  assert.equal(runMotionTest(project, swing, result.setup).review?.clearance?.result.status, "met");
});

test("offers a test to inspect when a fixed obstruction blocks every drawer angle", async () => {
  const { project, slide, swing, drawer } = cabinet();
  const stop = part("Counter edge", "plywood", [1, 2, 0.5], [5, 10, 8], project.steps[0].id, "Counter");
  const blocked = { ...project, pieces: [...project.pieces, stop] };
  const result = await findDrawerOpening(blocked, slide, swing, 21, { held: [] });
  assert.equal(result.status, "unavailable");
  assert.equal(result.tried, result.total);
  const review = runMotionTest(blocked, slide, result.setup).review!;
  assert.ok(review.hits.some(({ movingId, obstacleId }) => movingId === drawer.id && obstacleId === stop.id));
  await assert.rejects(() => findDrawerOpening(project, slide, swing, 25, { held: [] }), /saved travel/);
  const controller = new AbortController();
  await assert.rejects(() => findDrawerOpening(blocked, slide, swing, 21, { held: [] }, {
    signal: controller.signal, onProgress: () => controller.abort(),
  }), { name: "AbortError" });
});

test("a smaller opening can clear an adjacent pull-out even when the fully open door blocks it", async () => {
  const base = blank("Pull-out beside an outward swing");
  const step = base.steps[0].id;
  const door = part("Cabinet door", "plywood", [12, 5, 0.75], [6, 10, 0], step, "Corner cabinet");
  const drawer = part("Adjacent pull-out", "plywood", [1, 2, 1], [-3, 10, 9], step, "Corner cabinet");
  const tray = part("Low tray", "plywood", [1, 1, 1], [-5, 1, 0], step, "Corner cabinet");
  const swing = saveMotionPlan({ ...base, pieces: [door, drawer, tray] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const slide = saveMotionPlan(swing.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  const parked = saveMotionPlan(slide.project, {
    label: tray.name, memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 2 },
  });
  const held = [{ motionId: parked.plan.id, percent: 50 }];
  const fullDoor = runMotionTest(parked.project, slide.plan, {
    held, linkedId: swing.plan.id, openingOrder: "companion-first",
  }).review!;
  assert.ok(fullDoor.hits.some(({ phase, obstacleId }) => phase === 1 && obstacleId === door.id));
  const result = await findDrawerOpening(parked.project, slide.plan, swing.plan, 12, { held });
  assert.equal(result.status, "clear");
  assert.equal(result.angle, 1);
  assert.equal(result.maximum, 90);
  assert.deepEqual(result.setup.held, held);
});

test("an idea question hands off the saved door and drawer without inventing geometry", () => {
  const { project, slide, swing } = cabinet();
  const question = buildQuestion("How far should I open the door before pulling out the drawer?");
  assert.deepEqual(question, { kind: "drawer-opening" });
  assert.deepEqual(answerBuildQuestion(project, question!, []).link?.action, {
    kind: "drawer-opening", drawerId: slide.id, doorId: swing.id,
  });
  assert.equal(answerBuildQuestion(blank(), question!, []).link?.action.kind, "motion-setup");
  assert.equal(buildQuestion("Build a kitchenette with a door in front of a drawer"), null);
});

test("a measured door stop tests the exact angle and distinguishes drawer and wall interference", async () => {
  const { project, slide, swing, drawer, door, wall } = cabinet();
  const before = JSON.stringify(project);
  const least = await findDrawerOpening(project, slide, swing, 12.5, { held: [] });
  const exact = least.angle + 0.25;
  const short = checkDrawerStop(project, slide, swing, 12.5, least.angle - 1, { held: [] });
  const clear = checkDrawerStop(project, slide, swing, 12.5, exact, { held: [] });
  const obstructed = checkDrawerStop(project, slide, swing, 12.5, 90, { held: [] });
  assert.equal(short.status, "review");
  assert.match(short.findings.join("\n"), new RegExp(door.name));
  assert.match(short.findings.join("\n"), new RegExp(drawer.name));
  assert.equal(obstructed.status, "review");
  assert.match(obstructed.findings.join("\n"), new RegExp(wall.name));
  assert.equal(clear.status, "clear");
  assert.equal(clear.angle, exact);
  assert.deepEqual(clear.setup.sequenceTargets, {
    selected: { kind: "slide", travel: 12.5 }, companion: { kind: "hinge", travel: exact },
  });
  const review = runMotionTest(project, slide, clear.setup).review!;
  assert.deepEqual(review.playbackLimit(0, 100), { travel: 100 });
  assert.deepEqual(review.playbackLimit(100, 0), { travel: 0 });
  assert.equal(JSON.stringify(project), before);
  assert.throws(() => checkDrawerStop(project, slide, swing, 12.5, 91, { held: [] }), /door's saved travel/);
  assert.throws(() => checkDrawerStop(project, slide, swing, 25, exact, { held: [] }), /drawer.*saved travel/);
  const saved = saveMotionTestScenario(project, slide.id, "Exact installed door stop", clear.setup).project;
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.match(guideMarkdown(restored), new RegExp(`Cabinet door ${exact.toString().replace(".", "\\.")}°`));
});

test("an explicit door-stop question keeps its measured angle and drawer extension", () => {
  const { project, slide, swing } = cabinet();
  const question = buildQuestion("Will an 86.25 degree door stop let my drawer open 12.5 inches?");
  assert.deepEqual(question, { kind: "drawer-opening", stop: { angle: 86.25, extension: 12.5 } });
  assert.deepEqual(answerBuildQuestion(project, question!, []).link, {
    label: "Check the door stop",
    action: { kind: "drawer-opening", drawerId: slide.id, doorId: swing.id, stop: { angle: 86.25, extension: 12.5 } },
  });
  assert.deepEqual(buildQuestion("Will an 86° door stop let my drawer open?"), {
    kind: "drawer-opening", stop: { angle: 86 },
  });
});
