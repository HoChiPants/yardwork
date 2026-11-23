import assert from "node:assert/strict";
import { test } from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { inspectCutStock } from "../src/cutStock";
import { bom, guideMarkdown } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema } from "../src/model";
import { assignOffcutToPart, onHandOffcuts } from "../src/offcutAssignment";
import { completeOffcutCut, offcutCutRows } from "../src/offcutCutGuide";
import { planOffcutRelease } from "../src/offcutReleasePlan";
import { previewEqualOffcutSplit, previewOffcutSplit } from "../src/offcutSplit";
import { partLabel } from "../src/partLabels";
import { offcutStockSize } from "../src/stockAxes";

test("a split can supply later cuts from either blank without buying the source again", () => {
  const empty = blank("Stock workshop");
  const step = empty.steps[0].id;
  const board = "hd-kdht-2x4-8";
  const project = addMeasuredOffcut(empty, step, board, [42.25, 3.5, 1.5], "Measured 2×4");
  const original = project.pieces[0];
  const { next, outputs } = previewOffcutSplit(project, original.id, "crosscut", 6, "Finish sample");
  assert.deepEqual(outputs.map(offcutStockSize), [[1.5, 3.5, 6], [1.5, 3.5, 36.125]]);
  assert.deepEqual(outputs.map(({ id }) => partLabel(next, id)), ["O002", "O003"]);
  assert.ok(next.pieces.every(({ offcut, cutStock }) => offcut && cutStock?.id === original.cutStock!.id));
  assert.match(guideMarkdown(generateBuildGuide(next)), /Split O001[\s\S]*Crosscut to 6 in[\s\S]*Keep O002.+O003/);
  assert.match(guideMarkdown(generateBuildGuide(next)), /Cut stock to length/);

  const blanks = [
    part("Test block", board, [3.5, 1.5, 5], [0, 1, 0], step, "Demo"),
    part("Shelf rail", board, [3.5, 1.5, 36], [10, 1, 0], step, "Demo"),
  ].map((piece) => ({ ...piece, stockLengthAxis: 2 as const }));
  const pending = { ...next, pieces: [...next.pieces, ...blanks] };
  const partiallyUsed = assignOffcutToPart(pending, blanks[0].id, outputs[0].id);
  const used = assignOffcutToPart(partiallyUsed, blanks[1].id, outputs[1].id);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(used)));
  const rows = offcutCutRows(reopened);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(({ issues }) => !issues.length));
  assert.equal(rows[1].prior, 1);
  assert.equal(rows[2].prior, 1);
  assert.equal(bom(reopened).find(({ id }) => id === board)?.quantity, 0);
  assert.ok(inspectCutStock(reopened).valid.has(original.cutStock!.id));
  const returned = planOffcutRelease(reopened, rows[0].id).project;
  assert.deepEqual(offcutStockSize(returned.pieces.find(({ id }) => id === original.id)!), offcutStockSize(original));
  assert.ok(returned.pieces.filter(({ offcut }) => !offcut).every(({ cutStock }) => !cutStock));
  assert.equal(offcutCutRows(returned).length, 0);
});

test("sheet rips keep the along-grain length, and missing descendants flag their source cut", () => {
  const empty = blank();
  const saved = addMeasuredOffcut(empty, empty.steps[0].id, "plywood", [30, 14, 0.75], "Plywood remnant");
  const original = saved.pieces[0];
  assert.throws(() => previewOffcutSplit(saved, original.id, "rip", 13.875, ""), /leaves two pieces/);
  const split = previewOffcutSplit(saved, original.id, "rip", 4, "Trial strip");
  assert.deepEqual(split.outputs.map(offcutStockSize), [[0.75, 4, 30], [0.75, 9.875, 30]]);
  const cutAgain = previewOffcutSplit(split.next, split.outputs[1].id, "crosscut", 12, "");
  assert.deepEqual(offcutCutRows(cutAgain.next).map(({ issues, prior }) => [issues, prior]), [[[], undefined], [[], 1]]);
  const missing = { ...cutAgain.next, pieces: cutAgain.next.pieces.filter(({ id }) => id !== cutAgain.outputs[1].id) };
  assert.ok(offcutCutRows(missing).every(({ issues }) => issues.length));
  const question = buildQuestion("What can I use O001 for?")!;
  const idea = answerBuildQuestion(saved, question, []);
  assert.equal(idea.rows?.find(({ title }) => title === "Finish sample")?.link?.action.kind, "offcut-split");
  assert.deepEqual(buildQuestion("Split O001 into two equal pieces."), { kind: "offcut-split", label: "O001", preset: "equal" });
});

test("four equal blanks from one scrap keep every cut and can be released as a chain", () => {
  const project = blank("Matching plywood strips");
  const saved = addMeasuredOffcut(project, project.steps[0].id, "plywood", [30, 16.375, 0.75], "Shop plywood");
  const source = saved.pieces[0];
  const question = buildQuestion("Rip O001 into four equal strips.")!;
  const answer = answerBuildQuestion(saved, question, []);
  assert.deepEqual(answer.link?.action, { kind: "offcut-split", offcutId: source.id, preset: { count: 4, kind: "rip" } });
  const { next, outputs } = previewEqualOffcutSplit(saved, source.id, "rip", 4, "Layout strip");
  assert.deepEqual(outputs.map(offcutStockSize), Array.from({ length: 4 }, () => [0.75, 4, 30]));
  assert.ok(outputs.every((part) => part.name === "Offcut · Layout strip" && part.cutStock?.id === source.cutStock!.id));
  assert.equal(new Set(outputs.map((part) => partLabel(next, part.id))).size, 4);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(next)));
  const cuts = offcutCutRows(reopened);
  assert.deepEqual(cuts.map(({ prior, issues }) => [prior, issues]), [[undefined, []], [1, []], [2, []]]);
  assert.deepEqual(cuts.map(({ remnantHandoffs }) => remnantHandoffs), [
    ["Set aside O003 for cut 2."], ["Set aside O005 for cut 3."], [],
  ]);
  assert.equal(bom(reopened).find(({ id }) => id === "plywood")?.quantity, 0);
  assert.equal(guideMarkdown(generateBuildGuide(reopened)).match(/Rip to 4 in/g)?.length, 3);
  const spacer = { ...part("Spacer", "plywood", [4, 0.75, 30], [0, 0.375, 0], project.steps[0].id, ""), stockLengthAxis: 2 as const };
  const fitted = assignOffcutToPart({ ...reopened, pieces: [...reopened.pieces, spacer] }, spacer.id, outputs[0].id);
  assert.ok(offcutCutRows(fitted)[0].remnantHandoffs.includes("Set aside O002 for operation 4."));
  const restored = planOffcutRelease(reopened, cuts[0].id).project;
  assert.deepEqual(restored.pieces.map(offcutStockSize), [offcutStockSize(source)]);
  assert.equal(restored.pieces[0].id, source.id);

  assert.deepEqual(onHandOffcuts(reopened), []);
  assert.throws(() => completeOffcutCut(reopened, cuts[1].id), /operation 1 first/);
  const firstCut = completeOffcutCut(reopened, cuts[0].id);
  assert.deepEqual(onHandOffcuts(firstCut).map(({ id }) => id), [outputs[0].id]);
  assert.strictEqual(completeOffcutCut(firstCut, cuts[0].id), firstCut);
  assert.throws(() => planOffcutRelease(firstCut, cuts[0].id), /marked complete/);
  const done = cuts.slice(1).reduce((current, cut) => completeOffcutCut(current, cut.id), firstCut);
  assert.deepEqual(new Set(onHandOffcuts(done).map(({ id }) => id)), new Set(outputs.map(({ id }) => id)));
});
