import assert from "node:assert/strict";
import { test } from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { applyCommand, blank, parsePrompt, projectSchema, type V3 } from "../src/model";
import { reviewGeneratedWindowWalls, reviewOpeningFlashings, roughOpeningFrame, saveOpeningFlashing } from "../src/openingFlashing";
import { previewSectionCommand, transformSection } from "../src/sections";
import { generatedWindowMembers } from "../src/windowWall";

const prompt = "Build a wall 8 ft wide and 8 ft tall with a 36 by 48 in rough window opening, sill 32 in above floor";

test("local window wall requests keep wall dimensions separate from rough dimensions and retain the opening on revisions", () => {
  const command = parsePrompt(prompt);
  assert.deepEqual(command.windowOpening, { width: 36, height: 48, sill: 32 });
  assert.deepEqual([command.width, command.height], [96, 96]);
  assert.deepEqual(parsePrompt("Make this wall 90 in wide", command).windowOpening, command.windowOpening);
  assert.deepEqual(parsePrompt("Make the window 30 in wide and move the sill to 34 in", command).windowOpening,
    { width: 30, height: 48, sill: 34 });
  assert.equal(parsePrompt("Remove the window opening", command).windowOpening, null);
  assert.equal(parsePrompt(prompt + " with 2x6 studs").windowOpening?.stock, "two-six");
  assert.equal(parsePrompt(prompt + ", 6 in left of wall center").windowOpening?.offset, -6);
  assert.throws(() => parsePrompt("Build a wall 8 ft wide and 8 ft tall with two windows"), /one rough window/);
  assert.throws(() => parsePrompt(prompt + " and a door"), /measured rough doorway/);
  assert.throws(() => parsePrompt("Build a wall 8 ft wide and 8 ft tall with a window"), /rough window width/);
  assert.throws(() => applyCommand(blank(), { ...command, windowOpening: { ...command.windowOpening!, sill: 75 } }), /top plate do not fit/);
  assert.throws(() => applyCommand(blank(), { ...command, windowOpening: { ...command.windowOpening!, height: 24 } }), /24 in from the head/);
  assert.throws(() => applyCommand(blank(), { ...command, windowOpening: { ...command.windowOpening!, offset: 35 } }), /room for the jack/);
  const response = answerBuildQuestion(blank(), buildQuestion(prompt)!, []);
  assert.equal(response.link?.action.kind, "window-wall");
  assert.match(response.detail, /36 in by 48 in/);
});

test("the framed aperture is clear and its actual four members survive a compatible wall resize", () => {
  const command = parsePrompt(prompt);
  const project = applyCommand(blank(), command);
  const section = project.sections[0];
  const members = generatedWindowMembers(project, section)!;
  const dimensions = roughOpeningFrame(project, members);
  assert.deepEqual([dimensions.width, dimensions.height, dimensions.depth], [36, 48, 3.5]);
  assert.equal(validate(project).some(({ id }) => id === "collision"), false);
  assert.ok(project.pieces.some(({ designRole }) => designRole?.startsWith("window-lower-stud")));
  assert.equal(project.pieces.some(({ designRole }) => designRole?.startsWith("window-upper-stud")), false);
  assert.equal(reviewGeneratedWindowWalls(project)[0].ready, true);
  assert.match(guideMarkdown(project), /## Window rough framing[\s\S]+36 in wide × 48 in high/);
  const turned = transformSection(project, section.id, [0, 36, 12], [0, Math.PI / 3, 0]);
  assert.ok(reviewGeneratedWindowWalls(turned)[0].ready);

  const flashed = saveOpeningFlashing(project, members, {
    unit: "window", exterior: "positive", sheathing: 0.5, frameDepth: 2.75,
    faceLap: 2, jambReturn: 6, tapeWidth: 6, pan: { kind: "slope" }, drainage: { kind: "open" },
  });
  const wider = applyCommand(flashed, { type: "wall", width: 104, height: 96, depth: 48, spacing: 16 }, section.id);
  assert.deepEqual(generatedWindowMembers(wider, wider.sections[0]), members);
  assert.equal(reviewOpeningFlashings(wider).rows[0].issues.length, 0);
  const moved = applyCommand(wider, { ...command, windowOpening: { ...command.windowOpening!, offset: 3 } }, section.id);
  assert.notDeepEqual(generatedWindowMembers(moved, moved.sections[0]), members);
  assert.ok(reviewOpeningFlashings(moved).rows[0].issues.length > 0);
  const altered = { ...project, pieces: project.pieces.map((piece) =>
    piece.id === members.jambA ? { ...piece, position: [-18.5, piece.position[1], 0] as V3 } : piece) };
  assert.ok(validate(altered).some(({ id }) => id === `window-wall-${section.id}`));
  const removed = applyCommand(wider, parsePrompt("Remove the window opening", command), section.id);
  assert.equal(removed.sections[0].generator?.windowOpening, null);
  assert.equal(generatedWindowMembers(removed, removed.sections[0]), null);
});

test("the wall preview can reserve a measured scrap and preserve its source on a later resize", () => {
  const command = parsePrompt(prompt);
  const blankProject = blank();
  const project = addMeasuredOffcut(blankProject, blankProject.steps[0].id, "stud", [36, 3.5, 1.5], "Shop stock");
  const preview = previewSectionCommand(project, command, undefined, true);
  assert.equal(project.pieces.length, 1);
  assert.equal(preview.offcuts?.assignments.length, 1);
  assert.match(preview.offcuts!.assignments[0].target, /rough window sill/);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(preview.candidate)));
  const sill = saved.pieces.find(({ designRole }) => designRole === "window-rough-sill")!;
  assert.equal(sill.cutStock?.id, project.pieces[0].cutStock?.id);
  const resized = applyCommand(saved, parsePrompt("Make the wall 90 in wide", command), saved.sections[0].id);
  assert.deepEqual(resized.pieces.find(({ id }) => id === sill.id)?.cutStock, sill.cutStock);
});
