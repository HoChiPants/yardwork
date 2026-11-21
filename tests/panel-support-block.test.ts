import assert from "node:assert/strict";
import test from "node:test";
import { bom, guideMarkdown } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { runMotionTest, saveMotionPlan } from "../src/mechanismMotion";
import { blank, part, type V3 } from "../src/model";
import { panelFloorBearing, reviewPanelBearing } from "../src/panelBearing";
import { previewPanelSupportBlock } from "../src/panelSupportBlock";
import { rotate } from "../src/spatial";
import { stockAxes } from "../src/stockAxes";
import { reviewWoodSupport } from "../src/woodSupport";

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
