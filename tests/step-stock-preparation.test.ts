import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bom, cutPiece, guideMarkdown } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema, step, type Project } from "../src/model";
import { assignOffcutToPart } from "../src/offcutAssignment";
import { completeStockCutSource } from "../src/plannedCutSources";
import { planStockCutLayouts } from "../src/recordStockCutLayout";
import { stockCutSequences } from "../src/stockCutSequence";
import { stockPreparationByStep } from "../src/stepStockPreparation";
import { previewUsableOffcut } from "../src/usableOffcut";

function preparation(project: Project) {
  const rows = bom(project);
  return stockPreparationByStep(project, rows, stockCutSequences(project, rows));
}

test("a step carries its own blanks and shows shared sources as their cuts are recorded", () => {
  const original = projectSchema.parse(JSON.parse(readFileSync(
    new URL("../public/examples/builds/shelves.yardwork.json", import.meta.url), "utf8",
  )));
  const initial = preparation(original);
  const first = original.steps[1], second = original.steps[2];
  const shared = initial.get(first.id)!.find(({ shared }) => shared.includes(3))!;
  const shelf = initial.get(second.id)!.find(({ id }) => id === shared.id)!;
  assert.deepEqual(shared.labels, ["P005"]);
  assert.deepEqual(shelf.labels, ["P006", "P007", "P008"]);
  assert.equal(shelf.earlier, 2);
  const seq = [...stockCutSequences(original, bom(original)).values()].flat()
    .find(({ partIds }) => partIds.includes(shelf.partId))!;
  const { project, sourceIds: [source] } = planStockCutLayouts(original, [seq.layout]);
  assert.match(preparation(project).get(second.id)!.find(({ id }) => id === source)!.detail, /Planned stock cuts/);
  const completed = completeStockCutSource(project, source);
  const ready = preparation(completed).get(second.id)!.find(({ id }) => id === source)!;
  assert.deepEqual(ready.labels, shelf.labels);
  assert.match(ready.detail, /Cuts marked complete/);

  const guide = guideMarkdown(completed, { workshopOrder: true });
  assert.ok(guide.indexOf("## Stock cut order") < guide.indexOf("## 1."));
  assert.equal(guide.match(/^## Stock cut order$/gm)?.length, 1);
  assert.match(guide, /## 3\. Bookcase: Set up supports and place shelves[\s\S]*?### Stock for this step[\s\S]*?Cuts marked complete[\s\S]*?Use P006, P007, P008 · first needed at step 2/);
});

test("only the offcut operations that supply the step are listed alongside the assembly parts", () => {
  const base = blank("Measured stock for two stages");
  const second = step("Fit rails", "Dry-fit the rails first.");
  base.steps.push(second);
  const pool = addMeasuredOffcut(base, base.steps[0].id, "stud", [52, 3.5, 1.5], "Split end board");
  const offcut = pool.pieces[0];
  const { next, output } = previewUsableOffcut(pool, offcut.id, { width: 3.5, length: 44, fromEnd: 2, fromEdge: 0 });
  const rail = { ...part("Rail", "stud", [3.5, 1.5, 36], [0, 0.75, 0], second.id, "rails"), stockLengthAxis: 2 as const };
  const project = assignOffcutToPart({ ...next, pieces: [...next.pieces, rail] }, rail.id, output.id);
  assert.equal(preparation(project).has(base.steps[0].id), false);
  const [row] = preparation(project).get(second.id)!;
  assert.deepEqual(row.offcutOperations, [1, 2]);
  assert.deepEqual(row.issues, []);
  const guide = guideMarkdown(project, { workshopOrder: true });
  assert.ok(guide.indexOf("## Recorded offcut cut order") < guide.indexOf("## 1."));
  assert.match(guide, /## 2\. Fit rails[\s\S]*?Use P001 · offcut operations 1, 2/);
});

test("legacy recorded sources show the original length, width and thickness in that order", () => {
  const project = blank();
  const board = part("Board", "stud", [96, 1.5, 3.5], [0, 0.75, 0], project.steps[0].id, "");
  project.pieces.push(board);
  const cut = cutPiece(project, board.id, 40, 0);
  const [row] = preparation(cut).get(project.steps[0].id)!;
  assert.equal(row.detail, "Recorded blank layout · 8 ft × 3.5 in × 1.5 in");
});
