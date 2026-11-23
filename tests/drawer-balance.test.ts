import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuestion } from "../src/buildQuestions";
import { drawerBalanceCabinets, drawerBalanceGuideLines, previewDrawerBalance, saveDrawerBalance } from "../src/drawerBalance";
import { previewDrawerCabinet } from "../src/drawerCabinet";
import { validate } from "../src/engine";
import { reviewMotionPath } from "../src/mechanismMotion";
import { blank, part, projectSchema } from "../src/model";

test("three loaded drawers can move the balance past the support line when each alone stays behind it", () => {
  const project = previewDrawerCabinet(blank(), {
    width: 20, depth: 26, height: 36, bayCount: 1, drawerHeights: [5, 5, 5],
    drawerGap: 0.25, position: [0, 0, 0], stock: "plywood", barPull: true,
  }).project;
  const [cabinet] = drawerBalanceCabinets(project);
  const input = {
    sectionId: cabinet.section.id, loadedWeight: 80, closedSetback: 5,
    drawers: cabinet.plans.map(({ id }) => ({ motionId: id, extension: 16, weight: 18 })),
  };
  const report = previewDrawerBalance(project, input);
  assert.equal(report.closed, 5);
  assert.ok(Math.abs(report.single - 1.4) < 1e-8);
  assert.ok(Math.abs(report.combined + 5.8) < 1e-8);
  assert.ok(Math.abs(report.crossing! - 5 / 10.8) < 1e-8);
  assert.ok(Math.abs(report.balanceAt(report.crossing!)) < 1e-8);
  assert.equal(report.pose?.pieces.length, 21);
  assert.throws(() => previewDrawerBalance(project, { ...input, loadedWeight: 40 }), /must include/);

  const saved = projectSchema.parse(JSON.parse(JSON.stringify(saveDrawerBalance(project, report))));
  assert.ok(validate(saved).some(({ drawerBalanceSectionId, severity }) => drawerBalanceSectionId === input.sectionId && severity === "warning"));
  assert.ok(drawerBalanceGuideLines(saved).includes("At requested drawer positions · 5.8 in past the front support line."));
  const front = saved.pieces.find(({ id, name }) => cabinet.plans[0].memberIds.includes(id) && name.includes("finished front"))!;
  const obstacle = part("Nearby chair", "plywood", [4, 4, 1], [0, front.position[1], 17], saved.steps[0].id, "Room");
  const later = previewDrawerBalance({ ...saved, pieces: [...saved.pieces, obstacle] }, input, report.geometryKey);
  assert.match(later.travelMessage ?? "", /Modeled travel stops.*Nearby chair/);
  assert.ok(later.fraction < later.crossing! && later.reached > 0);
  assert.ok(later.pose?.atLimit);
  const changed = { ...saved, motionPlans: saved.motionPlans?.slice(0, 2) };
  assert.match(drawerBalanceGuideLines(changed)[0], /each drawer in the current cabinet/);
  assert.deepEqual(buildQuestion("Will the cabinet tip over with all drawers open?"), { kind: "drawer-balance" });
});

test("simultaneous motion checks contact between groups other than the primary", () => {
  const project = blank();
  const build = (name: string, x: number, z: number) =>
    part(name, "plywood", [4, 2, 4], [x, 1, z], project.steps[0].id, name);
  const first = build("Remote drawer", 20, 0);
  const second = build("Second drawer", 0, 5);
  const third = build("Third drawer", 0, 11);
  project.pieces = [first, second, third];
  const slide = { kind: "slide", axis: [0, 0, 1], travel: 8 } as const;
  const mechanism = { ...slide, axis: [...slide.axis] as [number, number, number] };
  const path = reviewMotionPath(project, [first], mechanism, {
    additionalMotions: [
      { parts: [second], mechanism },
      { parts: [third], mechanism: { ...mechanism, travel: 1 } },
    ],
  });
  // Separate groups can share identical axes and travel and remain distinct bodies for collision checks.
  assert.ok(path.hits.some(({ movingId, obstacleId }) => movingId === second.id && obstacleId === third.id));
  assert.ok(path.playbackLimit(0, 8).travel < 3);
});
