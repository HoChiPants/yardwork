import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import {
  bottomPlateDisplayRuns, bottomPlateSealTakeoff, previewBottomPlateSeal, removeBottomPlateSeal, reviewBottomPlateSeal,
} from "../src/bottomPlateSeal";
import { bottomPlateSealant, subfloorPanel } from "../src/bottomPlateSealReference";
import type { BottomPlateInput } from "../src/bottomPlateSealSchema";
import { buildQuestion } from "../src/buildQuestions";
import { bom, guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, part, projectSchema, type Piece, type Project, type V3 } from "../src/model";
import { rotate } from "../src/spatial";
import { toolChecklist } from "../src/tools";

function fixture() {
  const project = projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/air-sealing/bottom-plate.yardwork.json", import.meta.url,
  ), "utf8")));
  const record = project.bottomPlateSeals![0];
  const { id: _id, signature: _signature, ...input } = record;
  return { project, base: removeBottomPlateSeal(project, record.id), record, input };
}

test("plate layout leaves gaps and blocking open, and buys only the exact supported run quantities", () => {
  const { base, input } = fixture();
  const result = previewBottomPlateSeal(base, input);
  assert.equal(result.layout.clearLength, 75.875);
  assert.deepEqual(bottomPlateDisplayRuns(result.layout).filter(({ problem }) => problem).map(({ start, end }) => [start, end]),
    [[43.9375, 44.0625], [56, 68]]);
  assert.match(result.layout.runs.find(({ blockerId }) => blockerId)!.problem, /Access mockup block/);
  assert.equal(homeDepotPurchaseNeeds(result.project).find(({ id }) => id === bottomPlateSealant.id)?.canAdd, true);
  const withCart = addHomeDepotPurchaseNeed(result.project, bottomPlateSealant.id);
  const items = homeDepotShoppingList(withCart).items;
  assert.equal(items.find(({ productId }) => productId === bottomPlateSealant.internet)?.quantity, 1);
  assert.equal(items.find(({ productId }) => productId === subfloorPanel.internet)?.quantity, 1);
  assert.equal(items.find(({ productId }) => productId === bottomPlateSealant.internet)?.snapshot, null);
  assert.equal(bom(withCart).find(({ id }) => id === subfloorPanel.id)?.quantity, 1);
  assert.equal(withCart.pieces.filter(({ material, offcut }) => material === subfloorPanel.id && offcut).length, 3);
  assert.ok(toolChecklist(withCart).requirements.some(({ capability }) => capability === "apply-quart-sealant"));
  assert.deepEqual(buildQuestion("Air seal the bottom plate to the subfloor"), { kind: "bottom-plate-seal" });
});

test("measured spans stay with the actual parts after rotation and stale runs stop inflating quantities", () => {
  const { project, record, input } = fixture();
  const rotation: [number, number, number] = [0, Math.PI / 4, 0];
  const rotated = { ...project, pieces: project.pieces.map((piece) =>
    ({ ...piece, position: rotate(piece.position, rotation), rotation })) };
  const linked = reviewBottomPlateSeal(rotated, record);
  assert.equal(linked.problem, "");
  assert.equal(linked.layout!.clearLength, 75.875);
  const moved = { ...project, pieces: project.pieces.map((piece) =>
    piece.name === "Access mockup block" ? { ...piece, position: [100, 1, 100] as typeof piece.position } : piece) };
  assert.match(reviewBottomPlateSeal(moved, record).problem!, /access changed/);
  assert.equal(bottomPlateSealTakeoff(moved).required, 0);
  assert.match(guideMarkdown(moved), /The modeled backing or access changed/);
  const updated = previewBottomPlateSeal(moved, input, record.id);
  assert.equal(updated.record.id, record.id);
  assert.equal(updated.layout.clearLength, 87.875);
  assert.ok(validate(updated.project).some(({ id, detail }) => id === `bottom-plate-${record.id}` && detail.includes("Subfloor")));
});

test("only the part of a subfloor cutout inside the full bead band interrupts the seal", () => {
  const project = blank("Bottom plate over a cutout");
  const id = project.steps[0].id;
  const plate = part("Bottom plate", "stud", [88, 1.5, 3.5], [0, 1.5, 0], id, "Wall");
  const floor = part("Subfloor", "plywood", [96, 0.75, 12], [0, 0.375, 0], id, "Floor");
  const input: BottomPlateInput = {
    plateId: plate.id, side: "a", gap: 0, depth: 0.125, bead: "3/8",
    session: "Wall air sealing", dryExposedWood: true,
  };
  const clear = previewBottomPlateSeal({ ...project, pieces: [plate, floor] }, input);
  const cases: [Partial<Piece>, number[][]][] = [
    [{ rectangularOpenings: [{ axis: 1, center: [-1.75, 0], spans: [0.125, 6] }] }, [[41, 47]]],
    [{ rectangularOpenings: [{ axis: 1, center: [-2.01, 0], spans: [0.125, 6] }] }, []],
    [{ roundOpenings: [{ axis: 1, center: [-1.75, 0], diameter: 0.25 }] }, [[43.875, 44.125]]],
  ];
  for (const [profile, expected] of cases) {
    const rotation: V3 = [0, Math.PI / 4, 0];
    const pieces = [plate, { ...floor, ...profile }].map((piece) =>
      ({ ...piece, rotation, position: rotate(piece.position, rotation) }));
    const edited = { ...clear.project, pieces };
    assert.equal(reviewBottomPlateSeal(edited, clear.record).outdated, expected.length > 0);
    const plan = previewBottomPlateSeal(edited, input, clear.record.id);
    const breaks = bottomPlateDisplayRuns(plan.layout).filter(({ problem }) => problem);
    assert.deepEqual(breaks.map(({ start, end }) => [start, end]), expected);
    const supported = 88 - expected.reduce((sum, [start, end]) => sum + end - start, 0);
    assert.equal(plan.layout.clearLength, supported);
    assert.equal(bottomPlateSealTakeoff(plan.project).batches[0].use, supported / (38 * 12));
  }
});

test("compare the entered gap and product limits, pool cartridges only within a work session", () => {
  const { project, record, input } = fixture();
  assert.throws(() => previewBottomPlateSeal(project, input), /already has an air-seal plan/);
  assert.throws(() => previewBottomPlateSeal(project, { ...input, depth: 0.375, bead: "1/4" }, record.id), /covers the measured gap/);
  const higher = { ...project, pieces: project.pieces.map((piece) =>
    piece.id === record.plateId ? { ...piece, position: [0, piece.position[1] + 0.25, 0] as typeof piece.position } : piece) };
  const wrong = previewBottomPlateSeal(higher, input, record.id);
  assert.equal(wrong.layout.clearLength, 0);
  assert.ok(wrong.layout.runs.some(({ problem }) => /gap exceeds/.test(problem)));
  const matches = previewBottomPlateSeal(higher, { ...input, gap: 0.25 }, record.id);
  assert.equal(matches.layout.clearLength, 75.875);
  const other: BottomPlateInput = { ...input, side: "b", bead: "1/4", session: input.session.toUpperCase() };
  const batched = previewBottomPlateSeal(project, other);
  assert.equal(bottomPlateSealTakeoff(batched.project).required, 1);
  const separate = previewBottomPlateSeal(project, { ...other, session: "Second visit" });
  assert.equal(bottomPlateSealTakeoff(separate.project).required, 2);
});

test("the portable study keeps a current guide, stage precedence, stock cuts and source references", () => {
  const { project, record } = fixture();
  assert.ok(guideIsCurrent(project));
  const guide = guideMarkdown(project);
  assert.equal(guide, readFileSync(new URL("../public/examples/air-sealing/bottom-plate-guide.md", import.meta.url), "utf8"));
  assert.match(guide, /Bottom plate air seals[\s\S]*56 in to 68 in.+Access mockup block/);
  assert.match(guide, /test the bead on matching scrap/i);
  assert.match(guide, /matching Cut pool pieces O\d+/);
  assert.match(guide, /203169027/);
  const ready = generateBuildGuide(project);
  assert.ok(guideIsCurrent(ready));
  const seal = ready.steps.find(({ generated }) => generated?.kind === "bottom-plate-air-seal")!;
  const plate = ready.pieces.find(({ id }) => id === record.plateId)!;
  const finish = ready.steps.findIndex(({ generated }) => generated?.kind === "project-finish");
  assert.ok(ready.steps.findIndex(({ id }) => id === plate.stepId) < ready.steps.indexOf(seal));
  assert.ok(ready.steps.indexOf(seal) < finish);
  const badOrder: Project = { ...ready, steps: [seal, ...ready.steps.filter(({ id }) => id !== seal.id)] };
  assert.ok(reviewAssemblyOrder(badOrder).some(({ current, prerequisites }) =>
    current.step.id === seal.id && prerequisites.some(({ step }) => step.id === plate.stepId)));
});
