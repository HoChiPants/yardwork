import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { buildQuestion } from "../src/buildQuestions";
import { cabinetBackingReviews, previewCabinetBacking, previewCabinetScrewCheck } from "../src/cabinetBacking";
import { cabinetScrewDepthSummary } from "../src/cabinetScrewReach";
import { inspectCutStock } from "../src/cutStock";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { applyCommand, blank, part, projectSchema } from "../src/model";
import { partLabel } from "../src/partLabels";
import { transformSection } from "../src/sections";
import { orientedStockSize } from "../src/stockAxes";

const fixture = new URL("../public/examples/interior/wall-cabinet-backing.yardwork.json", import.meta.url);
function preparedWall() {
  return projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
}

test("cabinet backing maps each mark, groups new cuts, preserves scrap, and goes before drywall", () => {
  const source = preparedWall();
  const wall = source.sections[0];
  const preview = previewCabinetBacking(source, {
    wallId: wall.id, face: "front", height: 54, offsets: [16, 24, 28, 40, 56], stock: "two-six",
  }, true);
  assert.deepEqual(preview.marks.map(({ kind }) => kind), ["stud", "block", "block", "block", "block"]);
  assert.equal(preview.marks[1].receiver, preview.marks[2].receiver);
  assert.deepEqual(preview.blocks.map(({ block }) => block.size[1]), [14.5, 14.5, 14.5]);
  assert.equal(preview.boards, 1);
  assert.equal(preview.reuseCuts.get(preview.marks[1].receiver)?.label, "O001");
  assert.deepEqual(preview.offcuts.map((piece) => orientedStockSize(piece)[2]), [5.375, 66.75]);
  assert.equal(inspectCutStock(preview.project).invalid.length, 0);
  assert.equal(homeDepotShoppingList(preview.project).items.find(({ productId }) => productId === "334216730")?.quantity, 1);
  assert.ok(!source.cabinetBacking);
  const parsed = projectSchema.parse(JSON.parse(JSON.stringify(preview.project)));
  const turned = transformSection(parsed, wall.id, [20, 2, 14], [0, Math.PI / 3, 0]);
  assert.ok(!cabinetBackingReviews(turned)[0].issue);
  const guide = generateBuildGuide(turned);
  const backing = guide.steps.findIndex(({ generated }) => generated?.kind === "assembly-stage" && generated.stageKey === "cabinet-backing");
  const drywall = guide.steps.findIndex(({ generated }) => generated?.kind === "assembly-stage" && generated.stageKey === "hang-drywall");
  assert.ok(backing > 0 && drywall > backing);
  const reordered = [...guide.steps];
  [reordered[backing], reordered[drywall]] = [reordered[drywall], reordered[backing]];
  assert.ok(reviewAssemblyOrder({ ...guide, steps: reordered }).some(({ current }) => current.step.id === guide.steps[drywall].id));
  assert.match(guideMarkdown(guide), /square-cut to 14.5 in/);
  const moved = { ...turned, pieces: turned.pieces.map((piece) => piece.id === preview.marks[1].receiver
    ? { ...piece, position: [piece.position[0], piece.position[1] + 1, piece.position[2]] as typeof piece.position } : piece) };
  assert.match(validate(moved).find(({ id }) => id.startsWith("cabinet-backing-"))!.detail, /moved, changed, or is missing/);
  assert.doesNotMatch(guideMarkdown(moved), /square-cut to 14.5 in/);
});

test("cabinet backing rejects a modeled service or an opening at the mounting row", () => {
  const source = preparedWall();
  const wall = source.sections[0];
  const pipe = part("Modeled pipe", "hd-pex-u860w10", [0.625, 72, 0.625], [-24, 37.5, 1], source.steps[0].id, "");
  const obstructed = { ...source, pieces: [...source.pieces, pipe] };
  const label = partLabel(obstructed, pipe.id);
  const input = { wallId: wall.id, face: "front", height: 54, offsets: [24], stock: "two-six" } as const;
  assert.throws(() => previewCabinetBacking(obstructed, { ...input, offsets: [24] }, true), new RegExp(`${label} · Modeled pipe may obstruct`));
  const back = previewCabinetBacking(obstructed, { ...input, offsets: [24], face: "back" }, true);
  assert.equal(back.blocks.length, 1);
  const windowWall = applyCommand(blank(), { type: "wall", width: 96, height: 96, depth: 48, spacing: 16,
    windowOpening: { width: 36, height: 48, sill: 32 } });
  assert.throws(() => previewCabinetBacking(windowWall, { ...input, wallId: windowWall.sections[0].id, offsets: [48] }, true),
    /lands in a framed opening/);
  assert.deepEqual(buildQuestion("Plan cabinet backing at 54 in"), { kind: "cabinet-backing", height: 54 });
  assert.deepEqual(buildQuestion("Where should I hang my upper cabinets?"), { kind: "cabinet-backing" });
});

test("cabinet screw reach checks the finish stack, shallow backing and a modeled service", () => {
  const source = preparedWall();
  const [wall] = source.sections;
  const pipe = part("Pipe behind the backing", "hd-pex-u860w10", [0.625, 72, 0.625], [-24, 37.5, -0.1], source.steps[0].id, "");
  const project = { ...source, pieces: [...source.pieces, pipe] };
  const preview = previewCabinetBacking(project, {
    wallId: wall.id, face: "front", height: 54, offsets: [16, 24, 28], stock: "two-six",
  }, true);
  const measurements = { seatedLength: 2.5, stack: 0.875, diameter: 0.1875, minimumDepth: 1.5, excludedTip: 0.125 };
  const { review, project: saved } = previewCabinetScrewCheck(preview.project, preview.plan.id, measurements);
  const [stud, obstructed, backing] = review.locations;
  assert.deepEqual(stud.issues, []);
  assert.equal(stud.woodDepth, 3.5);
  assert.equal(stud.countedDepth, 1.5);
  assert.equal(stud.modeledFinish, 0.5);
  assert.equal(backing.woodDepth, 1.5);
  assert.equal(backing.reserve, -0.125);
  assert.match(backing.issues.join(" "), /tip projects 0.125 in/);
  assert.match(obstructed.issues.join(" "), /Pipe behind the backing has a modeled envelope/);
  assert.match(cabinetScrewDepthSummary(review), /shallowest receiver cannot provide/);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.match(guideMarkdown(reopened), /Cabinet screw check/);
  assert.match(validate(reopened).find(({ id }) => id.startsWith("cabinet-screw-"))!.detail, /Pipe behind the backing/);

  const short = previewCabinetScrewCheck(reopened, preview.plan.id, { ...measurements, seatedLength: 2.25 });
  assert.match(short.review.locations[1].issues.join(" "), /falls short/);
  const otherDetail = previewCabinetScrewCheck(reopened, preview.plan.id, { ...measurements, seatedLength: 2.25, minimumDepth: 1.25 });
  assert.ok(otherDetail.review.locations.every(({ issues }) => issues.length === 0));
  assert.match(cabinetScrewDepthSummary(otherDetail.review), /2.25 in to 2.375 in/);
  const shallowStack = previewCabinetScrewCheck(reopened, preview.plan.id, { ...measurements, stack: 0.375 });
  assert.match(shallowStack.review.locations[0].issues.join(" "), /Modeled drywall reaches 0.5 in/);

  const changedFinish = { ...reopened, pieces: reopened.pieces.map((piece) =>
    piece.name === "Drywall row 1 panel 1" ? { ...piece, size: [96, 0.625, 48], position: [0, 72, 2.0625] } as typeof piece : piece) };
  const updated = cabinetBackingReviews(changedFinish)[0];
  assert.ok(updated.fastening?.locations.every(({ finishStale }) => finishStale));
  assert.match(guideMarkdown(changedFinish), /Remeasure the stack before using/);

  const movedPipe = { ...reopened, pieces: reopened.pieces.map((piece) => piece.id === pipe.id
    ? { ...piece, position: [piece.position[0] - 2, piece.position[1], piece.position[2]] as typeof piece.position } : piece) };
  assert.doesNotMatch(cabinetBackingReviews(movedPipe)[0].fastening!.locations[1].issues.join(" "), /Pipe behind the backing/);
  const rotated = transformSection(otherDetail.project, wall.id, [20, 0, 3], [0, Math.PI / 3, 0]);
  assert.ok(cabinetBackingReviews(rotated)[0].fastening?.locations.every(({ finishStale }) => !finishStale));
});
