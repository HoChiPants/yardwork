import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema } from "../src/model";
import { cutAngledEnd, resizeByCuts } from "../src/cutPlan";
import { inspectCutStock } from "../src/cutStock";
import { cutStockLayoutMarkdown } from "../src/cutStockLayout";
import { addMeasuredOffcut } from "../src/measuredOffcuts";

test("plywood target length and width create separate exact offcuts without stretching thickness", () => {
  const p = blank();
  const panel = part(
    "Plywood",
    "plywood",
    [48, 0.75, 96],
    [0, 0.375, 0],
    p.steps[0].id,
    "Stock",
    [0, Math.PI / 2, 0],
  );
  p.pieces = [panel];
  const next = resizeByCuts(p, panel.id, 60, 24),
    kept = next.pieces[0];
  assert.deepEqual(kept.size, [24, 0.75, 60]);
  assert.equal(next.pieces.length, 3);
  assert.ok(next.pieces.slice(1).every((p) => p.offcut));
  assert.deepEqual(kept.rotation, panel.rotation);
  assert.deepEqual(p.pieces[0].size, [48, 0.75, 96]);
  assert.equal(next.pieces[1].size[2], 35.875);
  assert.equal(next.pieces[2].size[0], 23.875);
});
test("invalid or oversized cuts never mutate the source", () => {
  const p = blank();
  p.pieces = [
    part("Board", "stud", [1.5, 96, 3.5], [0, 48, 0], p.steps[0].id, "Stock"),
  ];
  const before = JSON.stringify(p);
  for (const dims of [
    [120, 3.5],
    [NaN, 3],
    [95.99, 3.5],
    [-1, 3],
  ])
    assert.throws(() =>
      resizeByCuts(p, p.pieces[0].id, ...(dims as [number, number])),
    );
  assert.equal(JSON.stringify(p), before);
  assert.equal(resizeByCuts(p, p.pieces[0].id, 96, 3.5), p);
});

test("a measured blade kerf follows a wood source through save, straight cuts and angle cuts", () => {
  const project = blank();
  const board = part("Board", "stud", [3.5, 1.5, 96], [0, 3, 0], project.steps[0].id, "");
  project.pieces = [board];
  const unchanged = resizeByCuts(project, board.id, 96, 3.5, "crosscut-first", 0.059);
  assert.equal(unchanged, project);
  const cut = resizeByCuts(project, board.id, 60, 3.5, "crosscut-first", 0.059);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(cut)));
  const [kept, spare] = reopened.pieces;
  assert.equal(kept.cutStock?.woodKerf, 0.059);
  assert.equal(spare.size[2], 35.941);
  assert.equal(spare.cutStock?.woodKerf, 0.059);
  assert.throws(
    () => resizeByCuts(reopened, spare.id, 20, 3.5, "crosscut-first", 0.126),
    /before its first cut/,
  );
  const mitered = cutAngledEnd(reopened, spare.id, "width", [16, 19.5], "start");
  assert.equal(inspectCutStock(mitered).valid.has(kept.cutStock!.id), true);
  assert.ok(mitered.pieces.every((piece) => piece.cutStock?.woodKerf === 0.059));
  const mismatched = structuredClone(mitered);
  mismatched.pieces[1].cutStock!.woodKerf = 0.125;
  assert.match(inspectCutStock(mismatched).invalid[0].detail, /disagree/);
});

test("a measured offcut can record a wider blade on its first modeled cut", () => {
  const project = blank();
  const scrap = addMeasuredOffcut(project, project.steps[0].id, "stud", [20, 3.5, 1.5]);
  const [source] = scrap.pieces;
  const angled = cutAngledEnd(scrap, source.id, "width", [9, 11], "start", 0.16);
  assert.equal(angled.pieces[0].cutStock?.id, source.cutStock?.id);
  assert.equal(angled.pieces[1].cutStock?.woodKerf, 0.16);
  assert.equal(inspectCutStock(angled).invalid.length, 0);
  const layout = cutStockLayoutMarkdown(angled, source.cutStock!.id);
  assert.match(layout, /Recorded blade kerf · 0\.16 in per cut/);
});
