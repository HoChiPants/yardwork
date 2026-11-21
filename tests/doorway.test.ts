import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyStages } from "../src/assemblyStages";
import { interiorDoor, type DoorUnit } from "../src/doorWall";
import { previewDoorway } from "../src/doorwayPreview";
import { bom } from "../src/engine";
import { runMotionTest } from "../src/mechanismMotion";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { applyCommand, blank, parsePrompt, part, projectSchema } from "../src/model";
import { duplicateSection, removeSection, transformSection } from "../src/sections";
import { emptyWallTrace, reviewWallTrace } from "../src/wallTrace";

const opening = { width: 32, height: 82, offset: 0, floor: 0.375 };
const unit: DoorUnit = {
  frameWidth: 31.5, frameHeight: 81.5, jambDepth: 4.375, sideJamb: 0.625, headJamb: 0.625,
  leafWidth: 30, leafHeight: 80, leafThickness: 1.375, floorGap: 0.5,
  frameOffset: 0, leafOffset: 0, leafDepthOffset: 1.4375, hingeSide: "left", swingFace: "front",
  pinSideOffset: 0.0625, pinFaceOffset: 0.125, travel: 90, purchase: interiorDoor.materialId, finishedDepth: 4.5,
};

function fixture() {
  const source = blank("Doorway layout");
  const project = reviewWallTrace(source, { ...emptyWallTrace(), a: [-48, 0], b: [48, 0] }).candidate;
  const section = project.sections[0];
  return { project, section, command: section.generator! };
}

test("a doorway updates only its affected framing, leaves the floor gap clear and reuses measured scrap", () => {
  const { project, section, command } = fixture();
  const source = addMeasuredOffcut(project, project.steps[0].id, "hd-kdht-2x4-8", [37, 3.5, 1.5], "Framing scrap");
  const review = previewDoorway(source, { ...command, doorOpening: opening }, section.id, true);
  const next = review.impact.candidate;
  assert.deepEqual(review.blockers, []);
  assert.equal(review.impact.offcuts?.assignments.length, 1);
  assert.equal(review.impact.wallCuts[0].oversize, 0);
  assert.ok(review.impact.wallCuts[0].bins.some(({ remaining }) => remaining > 0));
  assert.equal(review.plan, undefined);
  for (const role of ["wall-top-plate", "wall-stud-1"]) {
    const original = source.pieces.find(({ designRole }) => designRole === role)!;
    assert.deepEqual(next.pieces.find(({ id }) => id === original.id), original);
  }
  const byRole = (role: string) => next.pieces.find(({ designRole }) => designRole === role)!;
  const left = byRole("door-bottom-left"), right = byRole("door-bottom-right"), head = byRole("door-head");
  assert.equal(left.position[0] + left.size[0] / 2, -16);
  assert.equal(right.position[0] - right.size[0] / 2, 16);
  assert.equal(head.position[1] - head.size[1] / 2, 82.375);
  assert.equal(source.sections[0].generator?.doorOpening, undefined);
});

test("the measured fitted door buys one prehung kit and tests its saved local pin against the hall", () => {
  const { project, section, command } = fixture();
  const proposal = { ...command, doorOpening: opening, doorUnit: unit };
  const clear = previewDoorway(project, proposal, section.id);
  assert.deepEqual(clear.blockers, []);
  assert.equal(clear.swing?.error, undefined);
  assert.equal(clear.swing?.limit, 90);
  project.pieces.push(part("Hall obstruction", "plywood", [6, 60, 2], [4, 35, 20], project.steps[0].id, "Hall"));
  const review = previewDoorway(project, proposal, section.id);
  assert.deepEqual(review.blockers, []);
  assert.ok(review.swing?.limit && review.swing.limit > 0 && review.swing.limit < 90);
  assert.deepEqual(review.swing.blockers, ["Hall obstruction"]);
  const next = projectSchema.parse(JSON.parse(JSON.stringify(review.impact.candidate)));
  const rows = bom(next);
  assert.equal(rows.find(({ id }) => id === interiorDoor.materialId)?.quantity, 1);
  assert.ok(!rows.some(({ id }) => id === "interior-door-jamb"));
  const stages = assemblyStages(next);
  const frame = stages.findIndex(({ title }) => /Assemble.*Wall/.test(title));
  const fit = stages.findIndex(({ title }) => /Fit and swing-test the door/.test(title));
  assert.ok(frame !== -1 && frame < fit, JSON.stringify(stages.map(({ title }) => title)));
  assert.equal(next.motionPlans?.[0].id, review.plan!.id);
});

test("saved swing follows an upright wall and verifies its fitted parts after revisions and copies", () => {
  const { project, section, command } = fixture();
  const next = previewDoorway(project, { ...command, doorOpening: opening, doorUnit: unit }, section.id).impact.candidate;
  const plan = next.motionPlans![0];
  const relocated = transformSection(next, section.id, [96, 2, 20], [0, Math.PI / 3, 0]);
  assert.ok(runMotionTest(relocated, plan).review);
  const tilted = transformSection(next, section.id, [0, 0, 0], [0.2, 0, 0]);
  assert.match(runMotionTest(tilted, plan).error ?? "", /tilted/);
  const editedJamb = { ...next, pieces: next.pieces.map((piece) => piece.designRole === "door-jamb-left"
    ? { ...piece, position: [piece.position[0] - 0.5, piece.position[1], piece.position[2]] as typeof piece.position } : piece) };
  assert.match(runMotionTest(editedJamb, plan).error ?? "", /measurements changed/);
  const revised = applyCommand(next, { ...command, height: 95 }, section.id);
  assert.equal(revised.motionPlans?.[0].id, plan.id);
  assert.deepEqual(revised.sections[0].generator?.doorUnit, unit);
  const copy = duplicateSection(revised, section.id);
  assert.equal(copy.project.motionPlans?.length, 2);
  const copied = removeSection(copy.project, section.id);
  assert.equal(copied.motionPlans?.length, 1);
  assert.ok(runMotionTest(copied, copied.motionPlans![0]).review);
  const removed = applyCommand(next, { ...command, doorOpening: null }, section.id);
  assert.equal(removed.motionPlans?.length, 0);
});

test("measured prompts scope rough dimensions and leave risky or incompatible fits for revision", () => {
  const { project, section, command } = fixture();
  const stated = parsePrompt("Add a 32 by 82 in doorway 6 in left of wall center", command);
  assert.equal(stated.height, command.height);
  assert.deepEqual(stated.doorOpening, { width: 32, height: 82, offset: -6 });
  assert.throws(() => parsePrompt("add a doorway", command), /measured rough doorway/);
  assert.throws(() => previewDoorway(project, { ...command, doorOpening: { ...opening, offset: 30 } }, section.id), /Leave 4½ in/);
  assert.throws(() => previewDoorway(project, { ...command, doorOpening: { ...opening, height: 67 } }, section.id), /at most 24 in/);
  assert.throws(() => previewDoorway(project, { ...command, doorOpening: opening, doorUnit: { ...unit, hingeSide: "right" } }, section.id), /right-hand handing/);
  assert.throws(() => previewDoorway(project, { ...command, doorOpening: opening, doorUnit: { ...unit, finishedDepth: 5 } }, section.id), /measured finished wall thickness/);
  const wall = { ...project, pieces: [...project.pieces, part("Existing base trim", "plywood", [34, 2, 1], [0, 3, 1], project.steps[0].id, "Hall")] };
  assert.ok(previewDoorway(wall, { ...command, doorOpening: opening, doorUnit: unit }, section.id).blockers.includes("Existing base trim"));
});
