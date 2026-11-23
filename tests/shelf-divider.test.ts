import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import {
  bom,
  cutPiece,
  guideMarkdown,
  inspectCutStock,
  validate,
} from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { runMotionTest, saveMotionPlan } from "../src/mechanismMotion";
import { material, part, projectSchema, type V3 } from "../src/model";
import { reviewPanelBearing } from "../src/panelBearing";
import { previewShelfDivider } from "../src/shelfDivider";
import { saveShelfSagPlan, shelfSagGeometry } from "../src/shelfSag";
import { composeRotation, rotate } from "../src/spatial";
import { reviewWoodSupport } from "../src/woodSupport";

function fixture() {
  const project = createBuildStudy("shelves").project;
  const [{ piece: shelf }] = reviewPanelBearing(project);
  const [x, y, z] = shelf.position;
  const fullDepth = shelf.size[2];
  for (const direction of [-1, 1])
    project.pieces.push(
      part(
        "Synthetic cleat",
        "stud",
        [1.5, 1.5, fullDepth],
        [
          x + direction * (shelf.size[0] / 2 - 0.75),
          y - shelf.size[1] / 2 - 0.75,
          z,
        ],
        shelf.stepId,
        shelf.assembly,
      ),
    );
  const bearing = reviewPanelBearing(project).find(
    (row) => row.piece.id === shelf.id,
  )!;
  const geometry = shelfSagGeometry(bearing)!;
  assert.equal(geometry.longest.length, 33);
  return {
    project: saveShelfSagPlan(project, shelf.id, {
      ...geometry.identity,
      weight: 120,
      stiffness: 200000,
      target: 0.125,
      basis: "Synthetic sheet data",
    }),
    shelf,
    bottom: project.pieces.find(({ name }) => name === "Bottom · panel")!,
  };
}

test("a divider fits on supported casework, generates a physical sheet source once and lowers the live estimate", () => {
  const { project, shelf, bottom } = fixture();
  const original = JSON.stringify(project);
  const preview = previewShelfDivider(
    project,
    shelf.id,
    "plytanium-703",
    false,
  );
  assert.equal(JSON.stringify(project), original);
  assert.equal(preview.baseId, bottom.id);
  assert.equal(preview.height, 17.0625);
  assert.equal(preview.depth, 15);
  assert.equal(preview.thickness, 0.703);
  assert.equal(preview.offcuts.length, 2);
  assert.equal(preview.previous.geometry.longest.length, 33);
  assert.equal(preview.after.geometry.longest.length, 16.5);
  assert.equal(preview.after.withinTarget, true);
  const { divider, project: built } = preview;
  assert.equal(reviewWoodSupport(built).get(divider.id)?.next, bottom.id);
  assert.ok(inspectCutStock(built).valid.has(divider.cutStock!.id));
  assert.ok(
    preview.offcuts.every(
      ({ cutStock }) => cutStock?.id === divider.cutStock!.id,
    ),
  );
  assert.equal(
    bom(built).find(({ id }) => id === "plytanium-703")?.quantity,
    1,
  );
  assert.match(homeDepotShoppingList(built).text, /#100061386/);
  assert.match(guideMarkdown(built), /Shelf divider · Adjustable shelf 1/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(built))).pieces,
    built.pieces,
  );
  assert.equal(
    validate(built).find(({ id }) => id === `shelf-sag-${shelf.id}`)?.severity,
    "info",
  );
});

test("a yawed design reuses an exact recorded offcut without charging for another source", () => {
  const { project, shelf, bottom } = fixture();
  const rotation = [0, Math.PI / 2, 0] as const;
  for (const item of project.pieces) {
    item.position = rotate(item.position, [...rotation]);
    item.rotation = [...rotation];
  }
  const stock = material("plytanium-703");
  const whole = part(
    "Existing exact sheet",
    stock.id,
    [...stock.size],
    [180, 2, 0],
    shelf.stepId,
    "Scrap source",
  );
  whole.stockLengthAxis = 2;
  const prepared = cutPiece(
    { ...project, pieces: [...project.pieces, whole] },
    whole.id,
    60,
    2,
  );
  const offcut = prepared.pieces.find(({ offcut }) => offcut)!;
  const preview = previewShelfDivider(prepared, shelf.id, stock.id, true);
  assert.equal(preview.reusedId, offcut.id);
  assert.equal(preview.baseId, bottom.id);
  assert.equal(preview.divider.cutStock?.id, offcut.cutStock?.id);
  assert.ok(inspectCutStock(preview.project).valid.has(offcut.cutStock!.id));
  assert.equal(
    bom(preview.project).find(({ id }) => id === stock.id)?.quantity,
    1,
  );
  assert.equal(preview.after.geometry.longest.length, 16.5);
});

test("a blocked bay, a floating base and inadequate sheet stock leave the plan unchanged", () => {
  const { project, shelf, bottom } = fixture();
  const obstacle = part(
    "Bin in the way",
    "stud",
    [2, 2, 6],
    [0, 6, 0],
    shelf.stepId,
    "Synthetic",
  );
  const obstructed = { ...project, pieces: [...project.pieces, obstacle] };
  assert.throws(
    () => previewShelfDivider(obstructed, shelf.id, "plytanium-703", true),
    /no unobstructed fit/,
  );
  const floating = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === bottom.id
        ? {
            ...piece,
            position: [
              piece.position[0],
              1.375,
              piece.position[2],
            ] as typeof piece.position,
          }
        : piece,
    ),
  };
  assert.throws(
    () => previewShelfDivider(floating, shelf.id, "plytanium-703", false),
    /no unobstructed fit/,
  );
  assert.throws(
    () => previewShelfDivider(project, shelf.id, "stud", false),
    /Choose a rectangular wood sheet/,
  );
});

test("the shelf divider search preserves saved slide travel, assigns real scrap and flags later movement", () => {
  const { project, shelf } = fixture();
  const tray = part("Practice slide-away tray", "plytanium-703", [4, 0.703, 8],
    [-6, 2.5, shelf.position[2]], shelf.stepId, "");
  const withMotion = saveMotionPlan({ ...project, pieces: [...project.pieces, tray] }, {
    label: "Slide-away tray", memberIds: [tray.id], mechanism: { kind: "slide", axis: [1, 0, 0], travel: 8 },
  }).project;
  const prepared = addMeasuredOffcut(withMotion, shelf.stepId, "plytanium-703", [26, 18, 0.703], "Practice plywood remainder");
  const center = previewShelfDivider(prepared, shelf.id, "plytanium-703", true);
  assert.equal(center.offset, 17.25);
  assert.ok(center.motion.includes("Slide-away tray"));
  assert.ok(runMotionTest(center.project, center.project.motionPlans![0]).review!.playbackLimit(0, 8).travel < 8);
  const moved = previewShelfDivider(prepared, shelf.id, "plytanium-703", true, { method: "find-clear" });
  assert.ok(moved.offset > 21.5 && moved.offset < 24);
  assert.deepEqual(moved.motion, []);
  assert.equal(runMotionTest(moved.project, moved.project.motionPlans![0]).review!.playbackLimit(0, 8).travel, 8);
  assert.ok(moved.after.withinTarget);
  assert.ok(moved.after.deflection > center.after.deflection);
  assert.ok(moved.reusedId);
  assert.ok(moved.project.history.some(({ offcutCut }) => offcutCut?.targetId === moved.divider.id &&
    offcutCut.inputId === moved.reusedId));
  assert.equal(moved.project.shelfDividerPlans?.[0].offset, moved.offset);
  assert.match(guideMarkdown(moved.project), /## Fitted shelf dividers/);
  assert.match(guideMarkdown(moved.project), /if it is removed/);
  assert.doesNotMatch(guideMarkdown(moved.project), /Saved movement contacts this divider/);

  assert.throws(() => previewShelfDivider(prepared, shelf.id, "plytanium-703", true,
    { method: "measured", offset: 1.6 }), /full thickness fits/);
  const measured = previewShelfDivider(prepared, shelf.id, "plytanium-703", true, { method: "measured", offset: 24 });
  assert.equal(measured.offset, 24);
  assert.deepEqual(measured.motion, []);
  const shifted = { ...moved.project, pieces: moved.project.pieces.map((piece) => piece.id === moved.divider.id
    ? { ...piece, position: [piece.position[0] + 0.5, piece.position[1], piece.position[2]] as typeof piece.position } : piece) };
  assert.match(validate(shifted).find(({ id }) => id === `shelf-divider-${moved.divider.id}`)!.detail, /marked offset/);
  assert.match(guideMarkdown(shifted), /installation mark or base changed/);

  const yaw: V3 = [0, Math.PI / 3, 0];
  const oldStockMoved = { ...moved.project, pieces: moved.project.pieces.map((piece) => ({
    ...piece, position: rotate(piece.position, yaw), rotation: composeRotation(yaw, piece.rotation),
  })) };
  assert.ok(!validate(oldStockMoved).some(({ id }) => id === `shelf-divider-${moved.divider.id}`));
});
