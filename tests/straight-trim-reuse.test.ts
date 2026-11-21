import assert from "node:assert/strict";
import { test } from "node:test";
import { makeLabeledCutPreview } from "../src/CutStudio";
import { bom, guideMarkdown } from "../src/engine";
import { cutSourceRegion } from "../src/cutSourceAxes";
import { inspectCutStock } from "../src/cutStock";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema } from "../src/model";
import { offcutCutRows } from "../src/offcutCutGuide";
import { planOffcutRelease } from "../src/offcutReleasePlan";
import { planOffcutReuse } from "../src/offcutReusePlan";

function panels(includeSmall: boolean) {
  const project = blank("Shelf and long filler");
  const step = project.steps[0].id;
  const material = "plytanium-703";
  const panel = part("Shelf blank", material, [40, 0.703, 80], [0, 10, 0], step, "Shelf");
  const filler = part("Long filler", material, [12, 0.703, 70], [55, 10, 0], step, "Shelf");
  const small = part("Finish test strip", material, [3, 0.703, 20], [65, 10, 0], step, "Shelf");
  project.pieces = includeSmall ? [panel, filler, small] : [panel, filler];
  return { project, panel, filler, small };
}

test("rip first preserves a long matching strip while other scraps remain available", () => {
  const { project, panel, filler, small } = panels(true);
  const input = addMeasuredOffcut(project, panel.stepId, panel.material, [72, 14, 0.703], "Existing shop stock");
  const oldScrap = input.pieces.at(-1)!;
  const frozen = JSON.stringify(input);
  const across = makeLabeledCutPreview(input, panel.id, 40, 24, "crosscut-first");
  const along = makeLabeledCutPreview(input, panel.id, 40, 24, "rip-first");
  assert.deepEqual(along.project.pieces[0].size, across.project.pieces[0].size);
  assert.deepEqual(along.project.pieces[0].position, across.project.pieces[0].position);
  assert.equal(along.offcutIds.length, 2);
  const first = planOffcutReuse(across.project, across.offcutIds);
  assert.deepEqual(first.assignments.map(({ partId }) => partId), [small.id]);
  const reuse = planOffcutReuse(along.project, along.offcutIds);
  assert.deepEqual(reuse.assignments.map(({ partId }) => partId), [filler.id, small.id]);
  assert.equal(reuse.assignments[1].fromEarlierCut, true);
  const final = projectSchema.parse(JSON.parse(JSON.stringify(reuse.project)));
  assert.deepEqual(final.pieces.find(({ id }) => id === oldScrap.id), oldScrap);
  assert.deepEqual(bom(final).map(({ quantity }) => quantity), [1]);
  assert.deepEqual(cutSourceRegion(final.pieces[1]).size, [12, 0.703, 70]);
  assert.ok(inspectCutStock(final).valid.has(final.pieces[0].cutStock!.id));
  const rows = offcutCutRows(final);
  assert.deepEqual(rows[0].cuts, ["Rip to 2 ft", "Crosscut to 40 in"]);
  assert.deepEqual(rows.map(({ prior, issues }) => [prior, issues]), [[undefined, []], [1, []], [2, []]]);
  assert.match(guideMarkdown(final), /Trim P001 · Shelf blank[\s\S]*Rip to 2 ft · Crosscut to 40 in[\s\S]*remnant from cut 1/);
  assert.throws(() => planOffcutRelease(final, rows[0].id), /trim that produced/);
  assert.equal(planOffcutRelease(final, rows[1].id).project.pieces[1].cutStock, null);
  assert.equal(JSON.stringify(input), frozen);
});

test("the guide retains a prior trim when a later cut uses the same blank", () => {
  const { project, panel } = panels(false);
  const initial = makeLabeledCutPreview(project, panel.id, 40, 24, "rip-first");
  const next = makeLabeledCutPreview(initial.project, panel.id, 36, 23);
  const rows = offcutCutRows(next.project);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ issues }) => issues), [[], []]);
  assert.equal(rows[1].preparedBy, 1);
  assert.match(guideMarkdown(next.project), /blank from cut 1/);
  const changed = { ...next.project, pieces: next.project.pieces.map((piece) =>
    piece.id === panel.id ? { ...piece, size: [22, 0.703, 36] as typeof panel.size } : piece,
  ) };
  assert.ok(offcutCutRows(changed).every(({ issues }) => issues.length > 0));
});
