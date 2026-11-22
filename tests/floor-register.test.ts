import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema } from "../src/model";
import { floorRegisterGuideLines, floorRegisterReviews, floorRegisterSealMethod,
  previewFloorRegister, removeFloorRegister, saveFloorRegister } from "../src/floorRegister";
import { guideMarkdown, validate } from "../src/engine";
import { rectangularOpeningMarks, editThroughOpening } from "../src/throughOpeningCuts";
import type { FloorRegisterMeasurements } from "../src/floorRegisterSchema";

function floor() {
  const project = blank("Floor register practice");
  const step = project.steps[0].id;
  const panel = part("Subfloor", "hd-osb-subfloor-486701", [48, 0.703, 32], [0, 12, 0], step, "Floor");
  const joist = part("Center joist", "hd-spf-2x6-8", [48, 5.5, 1.5], [0, 8.8985, 0], step, "Floor");
  project.pieces = [panel, joist];
  const input: FloorRegisterMeasurements = {
    panelId: panel.id, fromLeft: 10, fromFront: 21, openingLength: 10.25, openingWidth: 4.25,
    throatLength: 10, throatWidth: 4, bodyLength: 15, bodyWidth: 6, depth: 9, bodyOffsetX: 2, bodyOffsetZ: 0,
  };
  return { project, panel, joist, input };
}

test("a register opening records the correct unequal axes and the seal length", () => {
  const { project, panel, input } = floor();
  const preview = previewFloorRegister(project, input);
  assert.equal(preview.issue, undefined);
  assert.equal(preview.layout?.sealRun, 28.5);
  assert.deepEqual(preview.layout?.nominalGap, [0.125, 0.125]);
  const saved = saveFloorRegister(project, input);
  assert.deepEqual(saved, projectSchema.parse(JSON.parse(JSON.stringify(saved))));
  const [plan] = saved.floorRegisterPlans!;
  const cut = saved.pieces[0].rectangularOpenings![0];
  assert.deepEqual(cut.source, { floorRegisterId: plan.id });
  assert.deepEqual(rectangularOpeningMarks(saved.pieces[0], cut), { axis: 1, spans: [4.25, 10.25], fromEdges: [21, 10] });
  assert.deepEqual(cut.center, [7.125, -8.875]);
  assert.equal(floorRegisterReviews(saved)[0].issue, undefined);
  const guide = guideMarkdown(saved);
  assert.match(guide, /## Floor register cutting and sealing/);
  assert.match(guide, /10.25 in × 4.25 in opening.*10 in from the low X edge and 21 in from the low Z edge/);
  assert.match(guide, /28.5 in modeled perimeter/);
  assert.throws(() => editThroughOpening(saved, panel.id, "rectangularOpenings", 0, null), /floor register planner/);
  assert.equal(removeFloorRegister(saved, plan.id).pieces[0].rectangularOpenings, undefined);
});

test("the boot and cutter envelope block conflicts and recheck a moved joist", () => {
  const { project, joist, input } = floor();
  const blocked = previewFloorRegister(project, { ...input, fromFront: 14 });
  assert.match(blocked.issue!, /crosses a modeled part/);
  assert.deepEqual(blocked.layout?.blockers.map(({ id }) => id), [joist.id]);
  assert.throws(() => saveFloorRegister(project, { ...input, fromFront: 14 }), /crosses a modeled part/);
  assert.equal(project.pieces[0].rectangularOpenings, undefined);
  const saved = saveFloorRegister(project, input);
  const moved = { ...saved, pieces: saved.pieces.map((piece) =>
    piece.id === joist.id ? { ...piece, position: [0, joist.position[1], 7] as typeof piece.position } : piece) };
  assert.match(floorRegisterReviews(moved)[0].issue!, /crosses a modeled part/);
  assert.match(floorRegisterGuideLines(moved).join(" "), /Review floor register fit/);
  assert.doesNotMatch(guideMarkdown(moved), /10.25 in × 4.25 in opening\. Start/);
  assert.ok(validate(moved).some(({ title }) => title === "Review floor register fit"));
});

test("the 3/8 in gap boundary switches from bead to mesh and stays local to a turned panel", () => {
  const { project, input } = floor();
  const turned = { ...project, pieces: [{ ...project.pieces[0], rotation: [0, Math.PI / 2, 0] as typeof project.pieces[0]["rotation"] }] };
  const wide = previewFloorRegister(turned, { ...input, openingWidth: 4.75 });
  assert.equal(wide.issue, undefined);
  assert.deepEqual(wide.layout?.nominalGap, [0.125, 0.375]);
  assert.match(floorRegisterSealMethod(wide.layout!), /fiberglass mesh tape and mastic/);
  const [a, b] = wide.layout!.opening;
  assert.ok(Math.abs(a[0] - b[0]) < 1e-8);
  assert.ok(Math.abs(Math.abs(a[2] - b[2]) - 10.25) < 1e-8);
  assert.match(previewFloorRegister(turned, { ...input, fromLeft: 0 }).issue!, /inside the sheet edges/);
  assert.match(previewFloorRegister(turned, { ...input, openingWidth: 3.75 }).issue!, /throat is wider/);
});
