import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblyStages } from "../src/assemblyStages";
import { buildQuestion, answerBuildQuestion } from "../src/buildQuestions";
import { cutInstructions } from "../src/cutInstructions";
import { previewDoorway } from "../src/doorwayPreview";
import { bom, guideMarkdown, inspectCutStock, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { applyCommand, blank, part, projectSchema, type Project } from "../src/model";
import { duplicateSection, removeSection, snapSectionOrigin, transformSection } from "../src/sections";
import { editThroughOpening } from "../src/throughOpeningCuts";
import { emptyWallTrace, reviewWallTrace } from "../src/wallTrace";
import { toolChecklist } from "../src/tools";
import { reviewWaterRun, waterRunGuide } from "../src/wallWater";
import { previewWaterRun } from "../src/wallWaterApply";
import type { WaterRunInput } from "../src/wallWaterSchema";

function fixture(depth = 3.5) {
  const project = reviewWallTrace(blank("Kitchen rough-in"), {
    ...emptyWallTrace(), a: [-48, 0], b: [48, 0],
    stock: depth === 3.5 ? "hd-kdht-2x4-8" : "hd-spf-2x6-8",
  }).candidate;
  const section = project.sections[0];
  const input: WaterRunInput = {
    name: "Sink cold supply", sectionId: section.id, materialId: "hd-pex-u860w10",
    start: 3, end: 93, height: 24, depth: 0, bore: 0.875, reuse: true,
  };
  return { project, input, section };
}

test("a measured route bores actual studs, places both shields where needed, and builds an exact guide and shopping list", () => {
  const { project, input } = fixture();
  const preview = previewWaterRun(project, input);
  assert.equal(preview.layout.length, 90);
  assert.equal(preview.remaining, 30);
  assert.equal(preview.run.studs.length, 5);
  assert.equal(preview.run.shields.length, 10);
  assert.ok(preview.layout.studs.every(({ yMark, nearEdge }) => yMark === 22.5 && nearEdge === 1.3125));
  assert.ok(project.pieces.every(({ roundOpenings }) => !roundOpenings));
  const next = projectSchema.parse(JSON.parse(JSON.stringify(preview.project)));
  assert.ok(reviewWaterRun(next, preview.run).measured);
  assert.equal(bom(next).find(({ id }) => id === input.materialId)?.quantity, 1);
  assert.equal(bom(next).find(({ id }) => id === "hd-nail-shield-ns1")?.quantity, 10);
  assert.ok(JSON.stringify(homeDepotShoppingList(next)).includes("202033036"));
  assert.ok(JSON.stringify(homeDepotShoppingList(next)).includes("100375167"));
  const tools = toolChecklist(next);
  assert.ok(tools.requirements.some(({ capability }) => capability === "pex-cut"));
  assert.ok(!tools.requirements.some(({ capability }) => capability === "metal-cut" || capability === "plastic-cut"));
  assert.match(guideMarkdown(next), /Wall water-line schedule[\s\S]*22\.5 in above the stud’s lower end/);
  const stages = assemblyStages(next);
  const framing = stages.findIndex(({ title }) => title.startsWith("Assemble Wall"));
  assert.ok(framing >= 0 && framing < stages.findIndex(({ title }) => title === "Rough in Sink cold supply"));
  const wider = fixture(5.5);
  assert.equal(previewWaterRun(wider.project, wider.input).run.shields.length, 0);
});

test("bore limits, substrate notches, end entry, rough openings and model obstructions each prevent a cut", () => {
  const { project, input, section } = fixture();
  for (const [update, message] of [
    [{ bore: 0.625 }, /needs clearance/],
    [{ bore: 2.25 }, /60% of actual stud depth/],
    [{ depth: 0.9 }, /from bore edge to stud face/],
    [{ start: 16 }, /endpoint stops inside/],
    [{ height: 0.75 }, /hits.*bottom plate/],
  ] as const) assert.throws(() => previewWaterRun(project, { ...input, ...update }), message);
  const studId = project.pieces.find(({ designRole }) => designRole === "wall-stud-2")!.id;
  const notched = editThroughOpening(project, studId, "rectangularOpenings", null,
    { axis: 0, fromEdges: [22, 3], spans: [1, 1] });
  assert.throws(() => previewWaterRun(notched, input), /shares a cross section with a notch/);
  const obstructed = {
    ...project, pieces: [...project.pieces, part("Cabinet blocking", "stud", [2, 3, 3.5], [0, 24, 0], project.steps[0].id, "Kitchen")],
  };
  assert.throws(() => previewWaterRun(obstructed, input), /Cabinet blocking/);
  const doorway = previewDoorway(project, { ...section.generator!, doorOpening: { width: 32, height: 82 } }, section.id).impact.candidate;
  assert.throws(() => previewWaterRun(doorway, input), /crosses the rough doorway/);
});

test("a measured PEX scrap yields a retained pipe and exact usable remnant without buying a second stick", () => {
  const { project, input } = fixture();
  const stock = addMeasuredOffcut(project, project.steps[0].id, input.materialId, [100, 0.625, 0.625], "Clean PEX remnant");
  const original = stock.pieces.at(-1)!;
  const preview = previewWaterRun(stock, input);
  const saved = preview.project.pieces.find(({ id }) => id === preview.run.pipeId)!;
  const spare = preview.project.pieces.find(({ id, offcut, material }) => id !== original.id && offcut && material === input.materialId)!;
  assert.equal(preview.stock, original.name);
  assert.equal(preview.remaining, 10);
  assert.equal(saved.id, original.id);
  assert.equal(spare.size[1], 10);
  assert.equal(spare.cutStock?.id, original.cutStock?.id);
  assert.ok(inspectCutStock(preview.project).valid.has(original.cutStock!.id));
  assert.equal(bom(preview.project).find(({ id }) => id === input.materialId)?.quantity, 0);
  const movedLine = previewWaterRun(preview.project, { ...input, height: 30 }, preview.run.id);
  assert.equal(movedLine.run.pipeId, preview.run.pipeId);
  assert.equal(movedLine.project.pieces.find(({ id }) => id === movedLine.run.pipeId)?.cutStock?.id, original.cutStock?.id);
});

test("saved route geometry follows wall moves, survives unrelated revisions and withholds stale drilling marks", () => {
  const { project, input, section } = fixture();
  const { project: designed, run } = previewWaterRun(project, input);
  assert.deepEqual(snapSectionOrigin(designed, section.id, [0.25, 0, 0.25], [0, 0, 0]), [0.25, 0, 0.25]);
  const rotated = transformSection(designed, section.id, [10, 4, 20], [0, Math.PI / 2, 0]);
  assert.ok(reviewWaterRun(rotated, run).measured);
  const revised = applyCommand(designed, section.generator!, section.id);
  assert.ok(reviewWaterRun(revised, run).measured);
  const invalid: Project = { ...designed, pieces: designed.pieces.map((piece) => piece.id === run.pipeId
    ? { ...piece, position: [piece.position[0], piece.position[1] + 2, piece.position[2]] } : piece) };
  assert.match(waterRunGuide(invalid, run)[0], /Review before boring/);
  assert.ok(!guideMarkdown(invalid).includes("above the stud’s lower end"));
  assert.ok(validate(invalid).some(({ id }) => id === `water-line-${run.id}`));
  const stud = designed.pieces.find(({ id }) => id === run.studs[0])!;
  assert.equal(cutInstructions(stud).openings, undefined);
  const copy = duplicateSection(designed, section.id);
  const duplicate = copy.project.sections.find(({ id }) => id === copy.sectionId)!;
  assert.ok(copy.project.pieces.filter(({ id }) => duplicate.pieceIds.includes(id)).every(({ roundOpenings }) => !roundOpenings));
  assert.equal(removeSection(designed, section.id).waterRuns?.length, 0);
});

test("a plain-language build question finds the named line and opens its measured layout", () => {
  const { project, input } = fixture();
  const { project: withLine, run } = previewWaterRun(project, input);
  const question = buildQuestion("Review the water line Sink cold supply");
  assert.deepEqual(question, { kind: "wall-water", subject: "Sink cold supply" });
  const answer = answerBuildQuestion(withLine, question!, []);
  assert.deepEqual(answer.rows?.[0].link?.action, { kind: "wall-water", runId: run.id });
  assert.match(answer.rows?.[0].detail ?? "", /5 modeled stud bores/);
});
