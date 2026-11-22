import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema } from "../src/model";
import { floorRegisterGuideLines, floorRegisterReviews, floorRegisterSealMethod,
  previewFloorRegister, recordFloorRegisterCutout, removeFloorRegister, saveFloorRegister } from "../src/floorRegister";
import { bom, guideMarkdown, validate } from "../src/engine";
import { assignOffcutToPart } from "../src/offcutAssignment";
import { orientedStockSize } from "../src/stockAxes";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { floorRegisterBoot } from "../src/floorRegisterReference";
import { addSupply } from "../src/supplies";
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

test("one measured register cutout keeps the source grain and supplies a later panel without a purchase", () => {
  const { project, panel, input } = floor();
  panel.size[0] = 46;
  panel.stockLengthAxis = 2;
  const step = project.steps[0].id;
  const saved = saveFloorRegister(project, input);
  const [plan] = saved.floorRegisterPlans!;
  const sample = part("Shop test blank", panel.material, [8, 0.703, 3], [75, 1, 75], step, "Workshop");
  sample.stockLengthAxis = 2;
  const withSample = { ...saved, pieces: [...saved.pieces, sample] };
  assert.throws(() => recordFloorRegisterCutout(withSample, plan.id, step, [10, 5, 0.703]), /within the saved opening/);

  const withScrap = recordFloorRegisterCutout(withSample, plan.id, step, [9.75, 3.875, 0.703]);
  const scrap = withScrap.pieces.at(-1)!;
  assert.equal(scrap.offcut, true);
  assert.deepEqual(orientedStockSize(scrap), [0.703, 9.75, 3.875]);
  assert.deepEqual(withScrap, projectSchema.parse(JSON.parse(JSON.stringify(withScrap))));
  assert.throws(() => recordFloorRegisterCutout(withScrap, plan.id, step, [9, 3, 0.703]), /already recorded/);
  assert.match(guideMarkdown(withScrap), /Recorded cutout · 9\.75 in × 3\.875 in × 0\.703 in\. See O001 in the Cut pool/);

  const reused = assignOffcutToPart(withScrap, sample.id, scrap.id);
  assert.equal(reused.pieces.find(({ id }) => id === sample.id)?.cutStock?.id, scrap.cutStock?.id);
  assert.equal(bom(reused).find(({ id }) => id === panel.material)?.quantity, 1);
  const removed = removeFloorRegister(reused, plan.id);
  assert.equal(removed.pieces.find(({ id }) => id === sample.id)?.cutStock?.id, scrap.cutStock?.id);
});

test("only explicitly selected clear register plans contribute the exact end box to shopping review", () => {
  const { project, joist, input } = floor();
  const unselected = saveFloorRegister(project, input);
  const findNeed = (p: typeof project) => homeDepotPurchaseNeeds(p).find(({ id }) => id === floorRegisterBoot.id);
  assert.equal(findNeed(unselected), undefined);
  const chosen = saveFloorRegister(unselected, input, unselected.floorRegisterPlans![0].id, true);
  assert.deepEqual(chosen, projectSchema.parse(JSON.parse(JSON.stringify(chosen))));
  assert.equal(findNeed(chosen)?.missing, 1);
  assert.match(guideMarkdown(chosen), /Selected boot · ERB10X4X6 · Home Depot Internet #100197347/);
  const ordered = addHomeDepotPurchaseNeed(chosen, floorRegisterBoot.id);
  const list = homeDepotShoppingList(ordered);
  assert.equal(list.items.find(({ productId }) => productId === floorRegisterBoot.internet)?.quantity, 1);

  const blocked = { ...ordered, pieces: ordered.pieces.map((piece) => piece.id === joist.id
    ? { ...piece, position: [0, joist.position[1], 7] as typeof piece.position } : piece) };
  assert.equal(homeDepotShoppingList(blocked).items.some(({ productId }) => productId === floorRegisterBoot.internet), false);
  assert.doesNotMatch(homeDepotHandoff(blocked), /- 1 × box: Master Flow/);
  assert.match(homeDepotHandoff(blocked), /LINKED PURCHASES TO REVIEW[\s\S]*Master Flow/);
  assert.match(guideMarkdown(blocked), /Review floor register fit/);
  assert.equal(findNeed(blocked)?.required, null);
  const withManual = addSupply(blocked, floorRegisterBoot.id, 1, "Separate repair");
  const manualChecklist = homeDepotHandoff(withManual);
  assert.match(manualChecklist, /- 1 × box: Master Flow/);
  assert.match(manualChecklist, /Purpose: Separate repair/);
  assert.doesNotMatch(manualChecklist, /Purpose: Measured floor register plans/);
});
