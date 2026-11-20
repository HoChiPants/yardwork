import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, step } from "../src/model";
import { assemblyPartForOffcut, visibleStagePieces, visibleStockPieces } from "../src/sceneVisibility";
import { cutPiece, bom } from "../src/engine";

function fixture() {
  let project = blank("SYNTHETIC stock display");
  const board = part("Actual board", "hd-pine-1x4", [0.75, 96, 3.5], [0, 48, 0], project.steps[0].id, "Build");
  project.pieces = [board];
  project = cutPiece(project, board.id, 24, 1);
  const second = part("Second assembly member", "stud", [1.5, 24, 3.5], [12, 12, 0], project.steps[0].id, "Build");
  project.pieces.push(second);
  return { project, board, offcut: project.pieces.find((piece) => piece.offcut)!, second };
}
test("assembly hides loose remnants without changing cut source or one-board BOM", () => {
  const { project, board, second } = fixture(), before = JSON.stringify(project);
  assert.deepEqual(visibleStockPieces(project, {}).map((piece) => piece.id), [board.id, second.id]);
  assert.equal(bom(project).find((row) => row.id === "hd-pine-1x4")?.quantity, 1);
  assert.equal(JSON.stringify(project), before);
});
test("deliberate offcut inspection reveals only that actual record; Show offcuts reveals all", () => {
  const { project, board, offcut, second } = fixture();
  const next = cutPiece(project, second.id, 12, 1), extra = next.pieces.find((piece) => piece.offcut && piece.id !== offcut.id)!;
  assert.deepEqual(visibleStockPieces(next, { selectedId: offcut.id }).filter((piece) => piece.offcut).map((piece) => piece.id), [offcut.id]);
  assert.equal(visibleStockPieces(next, { showOffcuts: true }).length, 4);
  assert.equal(assemblyPartForOffcut(next, offcut.id), board.id);
  assert.equal(assemblyPartForOffcut(next, extra.id), second.id);
});
test("precision assembly views withhold virtual stock even if globally visible or selected", () => {
  const { project, board, offcut, second } = fixture();
  assert.deepEqual(visibleStockPieces(project, { assemblyOnly: true, showOffcuts: true, selectedId: offcut.id }).map((piece) => piece.id), [board.id, second.id]);
});
test("build-through filtering stays separate from explicit selected-stock inspection", () => {
  const { project, board, offcut, second } = fixture(), later = step("Later work", "SYNTHETIC phase");
  project.steps.push(later); second.stepId = later.id; offcut.stepId = later.id;
  assert.deepEqual(visibleStagePieces(project, { stage: 0, showOffcuts: true }).map((piece) => piece.id), [board.id]);
  assert.deepEqual(visibleStagePieces(project, { stage: 0, selectedId: second.id }).map((piece) => piece.id), [board.id]);
  assert.deepEqual(visibleStagePieces(project, { stage: 0, selectedId: offcut.id }).map((piece) => piece.id), [board.id, offcut.id]);
});
test("an offcut without a surviving exact source never guesses a return member", () => {
  const { project, board, offcut } = fixture();
  project.pieces = project.pieces.filter((piece) => piece.id !== board.id);
  assert.equal(assemblyPartForOffcut(project, offcut.id), null);
  offcut.cutStock = null;
  assert.equal(assemblyPartForOffcut(project, offcut.id), null);
});
