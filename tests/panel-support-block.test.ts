import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { bom, guideMarkdown } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { runMotionTest, saveMotionPlan } from "../src/mechanismMotion";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { panelFloorBearing, reviewPanelBearing } from "../src/panelBearing";
import { previewPanelSupportBlock, previewSupportBlock } from "../src/panelSupportBlock";
import { rotate } from "../src/spatial";
import { stockAxes } from "../src/stockAxes";
import { reviewWoodSupport } from "../src/woodSupport";
import { bearingConnections, fittedSupportBlockJoints } from "../src/bearingConnections";
import { saveBearingDecision } from "../src/bearingDecisions";
import { connectionCoverage } from "../src/connectionCoverage";
import { saveWoodJointDecision } from "../src/woodJointDecisions";

function bench(height = 2) {
  const project = blank("Bench with an interrupted rail");
  const step = project.steps[0].id;
  const wood = (name: string, size: V3, position: V3) =>
    part(name, "stud", size, position, step, "Bench");
  const rail = wood("Right rail", [4, 2, 8], [6, height + 1, 0]);
  const left = wood(
    "Left support",
    [4, height + 2, 8],
    [-6, (height + 2) / 2, 0],
  );
  const seat = {
    ...part(
      "Seat lid",
      "plytanium-703",
      [24, 0.703, 12],
      [0, height + 2.3515, 0],
      step,
      "Bench",
    ),
    designRole: "seat-lid",
  };
  project.pieces = [left, rail, seat];
  return { project, rail, seat, step, wood };
}

test("a block fits under a broken branch and reuses the measured source with a real offcut", () => {
  const { project, rail, seat, step } = bench();
  const existing = addMeasuredOffcut(
    project,
    step,
    "stud",
    [20, 3.5, 1.5],
    "Shop scrap",
  );
  const scrap = existing.pieces.find(({ offcut }) => offcut)!;
  const before = structuredClone(existing);
  const fitted = previewPanelSupportBlock(
    existing,
    seat.id,
    rail.id,
    "stud",
    true,
  );
  assert.deepEqual(existing, before);
  assert.equal(fitted.height, 2);
  assert.equal(fitted.baseId, null);
  assert.equal(fitted.reusedId, scrap.id);
  assert.equal(fitted.block.cutStock?.id, scrap.cutStock?.id);
  assert.equal(fitted.offcuts.length, 1);
  const remnant = fitted.offcuts[0];
  assert.ok(Math.abs(remnant.size[stockAxes(remnant).length] - 17.875) < 1e-7);
  assert.equal(
    bom(fitted.project).find(({ id }) => id === "stud")!.quantity,
    bom(existing).find(({ id }) => id === "stud")!.quantity,
  );
  assert.deepEqual(fitted.remainingStops, []);
  const reviewed = reviewPanelBearing(fitted.project).find(
    ({ piece }) => piece.id === seat.id,
  )!;
  assert.equal(
    panelFloorBearing(reviewed, reviewWoodSupport(fitted.project))
      ?.interruptedCount,
    0,
  );
  assert.match(
    guideMarkdown(fitted.project),
    /Recorded offcut cut order[\s\S]*Support block · Right rail/,
  );
  assert.throws(
    () =>
      previewPanelSupportBlock(fitted.project, seat.id, rail.id, "stud", true),
    /current break/,
  );
});

test("a rail with one grounded leg can fit a block beneath its other leg", () => {
  const read = (suffix: string) => readFileSync(
    new URL(`../public/examples/wood-stock/workstand-support${suffix}`, import.meta.url), "utf8");
  const project = projectSchema.parse(JSON.parse(read(".yardwork.json")));
  const [rail, left, right, scrap] = project.pieces;
  const before = reviewWoodSupport(project);
  assert.equal(before.get(rail.id)?.next, left.id);
  assert.equal(before.get(right.id)?.next, undefined);
  const answer = answerBuildQuestion(project, buildQuestion("Where does support stop for P001?")!, []);
  assert.match(answer.detail, /P003 · Short leg/);
  const fit = previewSupportBlock(project, { kind: "part", id: rail.id }, right.id, "stud", true);
  assert.equal(fit.height, 2.5);
  assert.equal(fit.reusedId, scrap.id);
  assert.equal(fit.offcuts[0].size[stockAxes(fit.offcuts[0]).length], 7.375);
  assert.equal(reviewWoodSupport(fit.project).get(right.id)?.next, fit.block.id);
  assert.deepEqual(fit.remainingStops, []);
  assert.equal(bom(fit.project).find(({ id }) => id === "stud")!.quantity, bom(project).find(({ id }) => id === "stud")!.quantity);
  assert.match(read("-guide.md"), /Recorded offcut cut order[\s\S]+Crosscut to 2\.5 in\.[\s\S]+Keep O002 · 7\.375 in/);
});

test("a rotated fit finds the highest full-face grounded base and respects actual overlaps", () => {
  const { project, rail, seat, wood } = bench(8);
  const base = wood("Grounded base", [4, 2, 8], [6, 1, 0]);
  project.pieces.push(base);
  for (const piece of project.pieces) {
    piece.rotation = [0, 0.57, 0];
    piece.position = rotate(piece.position, piece.rotation);
  }
  const fit = previewPanelSupportBlock(
    project,
    seat.id,
    rail.id,
    "stud",
    false,
  );
  assert.equal(fit.height, 6);
  assert.equal(fit.baseId, base.id);
  assert.equal(fit.offcuts.length, 1);
  assert.ok(Math.abs(fit.block.position[0] - rail.position[0]) < 1e-7);
  assert.ok(Math.abs(fit.block.position[2] - rail.position[2]) < 1e-7);

  const obstruction = wood("Shelf in the opening", [4, 2, 8], [6, 5, 0]);
  obstruction.rotation = rail.rotation;
  obstruction.position = rotate(obstruction.position, rail.rotation);
  project.pieces.push(obstruction);
  assert.throws(
    () => previewPanelSupportBlock(project, seat.id, rail.id, "stud", false),
    /No centered fit/,
  );
  project.pieces.pop();
  project.workZone = { width: 6, height: 24, depth: 24 };
  assert.throws(
    () => previewPanelSupportBlock(project, seat.id, rail.id, "stud", false),
    /No centered fit/,
  );
});

test("a clear closed fit flags a block that obstructs recorded drawer travel", () => {
  const { project, rail, seat, wood } = bench();
  const drawer = wood("Drawer", [2, 1, 2], [6, 1, -10]);
  project.pieces.push(drawer);
  const motion = saveMotionPlan(project, {
    label: "Pull-out drawer",
    memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  });
  assert.equal(
    runMotionTest(motion.project, motion.plan).review?.hits.length,
    0,
  );
  assert.deepEqual(
    previewPanelSupportBlock(motion.project, seat.id, rail.id, "stud", true)
      .motionConflicts,
    ["Pull-out drawer"],
  );
});

test("an offset support block clears the center obstruction and uses the measured offcut", () => {
  const { project, rail, wood, step } = bench(4);
  project.pieces.push(wood("Center obstruction", [4, 1, 1], [6, 2, 0]));
  const source = addMeasuredOffcut(project, step, "stud", [20, 3.5, 1.5], "Shop scrap");
  const target = { kind: "part" as const, id: rail.id };
  assert.throws(() => previewSupportBlock(source, target, rail.id, "stud", true), /No centered fit/);
  const exact = previewSupportBlock(source, target, rail.id, "stud", true, { kind: "offset", x: 0, z: 2.5 });
  assert.deepEqual(exact.offset, [0, 2.5]);
  assert.equal(exact.height, 4);
  assert.equal(exact.reusedId, source.pieces.at(-1)?.id);
  assert.deepEqual(exact.remainingStops, []);
  assert.match(guideMarkdown(exact.project), /Center X 6 in, Z 2\.5 in · from the modeled floor to P002/);
  const nearby = previewSupportBlock(source, target, rail.id, "stud", true, { kind: "nearby" });
  assert.notEqual(nearby.offset[1], 0);
  assert.equal(nearby.reusedId, exact.reusedId);
  assert.deepEqual(nearby.remainingStops, []);
  assert.throws(() => previewSupportBlock(source, target, rail.id, "stud", true, { kind: "offset", x: 0, z: 6 }), /full bearing/);

  const moved = { ...exact.project, pieces: exact.project.pieces.map((piece) => piece.id === exact.block.id
    ? { ...piece, position: [6, 2, 4] as V3 } : piece) };
  assert.match(guideMarkdown(moved), /Review the fitted block's current bearing at both ends/);
});

test("nearby search can keep a fitted block outside a saved drawer path", () => {
  const { project, rail, wood } = bench();
  rail.size[0] = 8;
  const drawer = wood("Drawer", [2, 1, 2], [6, 1, -10]);
  project.pieces.push(drawer);
  const saved = saveMotionPlan(project, {
    label: "Pull-out drawer", memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  });
  const target = { kind: "part" as const, id: rail.id };
  assert.deepEqual(previewSupportBlock(saved.project, target, rail.id, "stud", false).motionConflicts, ["Pull-out drawer"]);
  const nearby = previewSupportBlock(saved.project, target, rail.id, "stud", false, { kind: "nearby" });
  assert.deepEqual(nearby.motionConflicts, []);
  assert.ok(Math.abs(nearby.offset[0]) >= 1.75);
  assert.equal(runMotionTest(nearby.project, saved.plan).review?.hits.length, 0);
});

test("a fitted block tracks the two current bearing decisions without treating a seal as a joint", () => {
  const { project, rail, seat, wood } = bench(8);
  const base = wood("Grounded base", [4, 2, 8], [6, 1, 0]);
  project.pieces.push(base);
  const { project: fitted, block } = previewPanelSupportBlock(project, seat.id, rail.id, "stud", false);
  const review = (p: typeof project) => {
    const support = reviewWoodSupport(p);
    return fittedSupportBlockJoints(p, support, bearingConnections(p, support, connectionCoverage(p)))[0];
  };
  assert.match(review(fitted).detail, /Upper joint with P002\. No pair plan recorded\..*Lower joint with P004\. No pair plan recorded/);
  const sealed = saveWoodJointDecision(fitted, block.id, base.id, "sealant", "Seal only the exposed seam.");
  assert.match(review(sealed).detail, /Lower joint with P004\. No pair plan recorded/);
  const removable = saveBearingDecision(sealed, rail.id, block.id, "Keep access to lift the rail.");
  assert.match(review(removable).detail, /Upper joint with P002\. A removable bearing decision is recorded/);
  const planned = saveWoodJointDecision(removable, block.id, base.id, "fitted", "Measure and dry-fit the intended joint before cutting.");
  assert.equal(review(planned).needsReview, false);
  assert.match(guideMarkdown(planned), /### Fitted support-block joints[\s\S]+Upper joint with P002[\s\S]+Lower joint with P004\. Fitted joinery/);
  assert.equal(planned.joints.length, fitted.joints.length);
  assert.equal(planned.supplies.length, fitted.supplies.length);
  const changed = { ...planned, pieces: planned.pieces.map((piece) => piece.id === block.id
    ? { ...piece, position: [6, 5, 4] as V3 } : piece) };
  assert.equal(review(changed).fit, false);
  assert.match(review(changed).detail, /fit changed/);
});
