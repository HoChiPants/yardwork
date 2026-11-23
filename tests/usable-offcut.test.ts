import assert from "node:assert/strict";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { cutSourceRegion } from "../src/cutSourceAxes";
import { inspectCutStock } from "../src/cutStock";
import { guideMarkdown } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { assignOffcutToPart, fittingOffcuts } from "../src/offcutAssignment";
import { offcutCutRows } from "../src/offcutCutGuide";
import { planOffcutRelease } from "../src/offcutReleasePlan";
import { previewOffcutSplit } from "../src/offcutSplit";
import { partLabel } from "../src/partLabels";
import { previewUsableOffcut } from "../src/usableOffcut";

function sheet() {
  const base = blank();
  return addMeasuredOffcut(base, base.steps[0].id, "plywood", [60, 40, 0.75], "Chipped plywood");
}

test("the usable rectangle keeps its source and only supplies parts inside the new dimensions", () => {
  let source = sheet();
  const [original] = source.pieces;
  const rotation: V3 = [0, Math.PI / 2, 0];
  source = { ...source, pieces: [{ ...original, rotation }] };
  assert.equal(answerBuildQuestion(source, buildQuestion("Measure usable blank from O001")!, []).link?.action.kind, "usable-offcut");
  const previous = cutSourceRegion(original);
  const { next, output } = previewUsableOffcut(source, original.id, { length: 42, width: 30, fromEnd: 3, fromEdge: 2 });
  const region = cutSourceRegion(output);
  assert.deepEqual(region.size, [0.75, 30, 42]);
  assert.deepEqual(region.offset, [0, 2, 3]);
  assert.deepEqual(region.sourceSize, previous.sourceSize);
  assert.deepEqual(output.rotation, rotation);
  assert.ok(Math.abs(output.position[0] + 6) < 1e-7 && Math.abs(output.position[2] - 3) < 1e-7);
  assert.equal(output.cutStock?.id, original.cutStock?.id);
  assert.equal(partLabel(next, original.id), "O001");
  assert.equal(partLabel(next, output.id), "O002");

  const oversize = { ...part("Wider shelf", "plywood", [35, 0.75, 40], [0, 4, 0], source.steps[0].id, ""), stockLengthAxis: 2 as const };
  const good = { ...oversize, id: crypto.randomUUID(), name: "Short shelf", size: [29, 0.75, 40] as V3 };
  assert.equal(fittingOffcuts(source, oversize).length, 1);
  assert.equal(fittingOffcuts(next, oversize).length, 0);
  assert.equal(fittingOffcuts(next, good).length, 1);
  const live = assignOffcutToPart({ ...next, pieces: [...next.pieces, oversize, good] }, good.id, output.id);
  const project = projectSchema.parse(JSON.parse(JSON.stringify(live)));
  assert.ok(inspectCutStock(project).valid.has(original.cutStock!.id));
  assert.deepEqual(offcutCutRows(project).map(({ issues }) => issues), [[], []]);
  assert.match(guideMarkdown(project), /remnant from measurement 1/);
  assert.match(guideMarkdown(project), /from 3 in along the length and 2 in across the width/);
  const released = planOffcutRelease(project, project.history.at(-1)!.id).project;
  const restored = released.pieces.find(({ id }) => id === output.id)!;
  assert.deepEqual(cutSourceRegion(restored).size, region.size);
  assert.deepEqual(cutSourceRegion(restored).offset, region.offset);
});

test("measurement chains preserve the loose split and prevent releasing unusable stock", () => {
  const source = sheet();
  const split = previewOffcutSplit(source, source.pieces[0].id, "crosscut", 24, "");
  const first = previewUsableOffcut(split.next, split.outputs[1].id, {
    length: 32, width: 36, fromEnd: 1, fromEdge: 2,
  });
  const second = previewUsableOffcut(first.next, first.output.id, {
    length: 28, width: 35, fromEnd: 1, fromEdge: 0,
  });
  assert.deepEqual(offcutCutRows(second.next).map(({ issues }) => issues), [[], [], []]);
  const splitId = split.next.history.at(-1)!.id;
  assert.throws(() => planOffcutRelease(second.next, splitId), /restore unusable material/);
  assert.throws(() => previewUsableOffcut(source, source.pieces[0].id, {
    length: 60, width: 36, fromEnd: 1, fromEdge: 2,
  }), /beyond the recorded offcut/);
  const pending = { ...source, plannedCutSources: [{ sourceId: source.pieces[0].cutStock!.id, historyIds: [], fingerprint: "planned" }] };
  assert.throws(() => previewUsableOffcut(pending, source.pieces[0].id, {
    length: 32, width: 36, fromEnd: 1, fromEdge: 2,
  }), /stock that has already been cut/);
});
