import assert from "node:assert/strict";
import test from "node:test";
import { previewBoardAlongDimension } from "../src/dimensionBoardPlacement";
import { saveMotionPlan } from "../src/mechanismMotion";
import { blank, part, type V3 } from "../src/model";
import { prepareCollisionSolid } from "../src/solidCollision";
import { rotate } from "../src/spatial";

const floor = { a: [0, 0, 0] as V3, b: [24, 0, 0] as V3 };

test("place lumber flat at a floor mark and center a shorter board on a sloped mark", () => {
  const project = blank();
  const jamb = part("Opening jamb", "plywood", [1.5, 12, 6], [24.75, 6, 0], project.steps[0].id, "Casework");
  project.pieces.push(jamb);
  const board = previewBoardAlongDimension(project, floor, "stud", 24);
  assert.deepEqual(board.position, [12, 0.75, 0]);
  assert.ok(Math.abs(prepareCollisionSolid(board)!.bounds.min[1]) < 1e-8);
  assert.deepEqual(rotate([1, 0, 0], board.rotation), [0, 1, 0]);
  assert.equal(project.pieces.length, 1);
  const sloped = previewBoardAlongDimension(project, { a: [0, 12, 0], b: [6, 20, 0] }, "stud", 8);
  assert.deepEqual(sloped.position, [3, 16, 0]);
  const end = rotate([0, 4, 0], sloped.rotation);
  assert.ok(Math.abs(end[0] - 2.4) < 1e-8 && Math.abs(end[1] - 3.2) < 1e-8);
  assert.throws(() => previewBoardAlongDimension(project, floor, "stud", 24.25), /beyond the saved marks/);
});

test("flag an exact dimension placement that overlaps wood, leaves the work zone, or obstructs saved travel", () => {
  const project = blank();
  const tray = part("Tray", "plywood", [2, 1, 2], [10, 0.75, -6], project.steps[0].id, "Casework");
  const blocked = { ...project, pieces: [{ ...tray, position: [10, 0.75, 0] as V3 }] };
  assert.throws(() => previewBoardAlongDimension(blocked, floor, "stud", 24), /overlap.*Tray/);
  const smallZone = { ...project, workZone: { width: 40, height: 80, depth: 60 } };
  assert.throws(() => previewBoardAlongDimension(smallZone, floor, "stud", 24), /outside the work zone/);
  const live = saveMotionPlan({ ...project, pieces: [tray] }, {
    label: "Sliding tray", memberIds: [tray.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
  }).project;
  assert.throws(() => previewBoardAlongDimension(live, floor, "stud", 24), /obstruct Sliding tray/);
  assert.equal(live.pieces.length, 1);
});
