import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, uid, type Project } from "../src/model";
import { resizeByCuts } from "../src/cutPlan";
import { bom, cutPiece, inspectCutStock, validate, KERF } from "../src/engine";
import { homeDepotHandoff } from "../src/handoff";
function sheet() {
  const p = blank("One physical sheet");
  p.pieces = [
    part(
      "Sheet",
      "plywood",
      [48, 0.75, 96],
      [35, 21, -10],
      p.steps[0].id,
      "Sheet",
      [0, Math.PI / 2, 0],
    ),
  ];
  return p;
}
const quantity = (project: Project, id = "plywood") =>
  bom(project).find((r) => r.id === id)?.quantity;

test("two-axis sheet cuts conserve source volume minus kerf and buy one shared sheet", () => {
  const p = sheet(),
    before = structuredClone(p);
  const next = resizeByCuts(p, p.pieces[0].id, 60, 24);
  assert.equal(next.pieces.length, 3);
  assert.equal(quantity(next), 1);
  assert.equal(new Set(next.pieces.map((p) => p.cutStock?.id)).size, 1);
  assert.deepEqual(next.pieces[0].cutStock?.size, [48, 0.75, 96]);
  assert.deepEqual(next.pieces[0].cutStock?.offset, [0, 0, 0]);
  assert.deepEqual(next.pieces[1].cutStock?.offset, [0, 0, 60 + KERF]);
  assert.deepEqual(next.pieces[2].cutStock?.offset, [24 + KERF, 0, 0]);
  const volume = (size: number[]) => size.reduce((a, b) => a * b, 1);
  const remaining = next.pieces.reduce((sum, p) => sum + volume(p.size), 0);
  assert.ok(
    Math.abs(
      volume(p.pieces[0].size) -
        remaining -
        KERF * 48 * 0.75 -
        KERF * 60 * 0.75,
    ) < 1e-8,
  );
  assert.equal(inspectCutStock(next).invalid.length, 0);
  assert.deepEqual(p, before);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(next)));
  assert.equal(quantity(restored), 1);
  assert.match(homeDepotHandoff(restored), /- 1 sheet — ¾ in exterior plywood/);
});

test("reusing and recutting an offcut keeps its original source region and purchase count", () => {
  const p = sheet();
  let next = cutPiece(p, p.pieces[0].id, 60, 2);
  const offcut = next.pieces[1];
  offcut.offcut = false;
  next = cutPiece(next, offcut.id, 20, 0);
  assert.equal(quantity(next), 1);
  assert.equal(inspectCutStock(next).invalid.length, 0);
  assert.equal(
    next.pieces.find((p) => p.id === offcut.id)?.cutStock?.offset[2],
    60 + KERF,
  );
  assert.deepEqual(next.pieces.at(-1)?.cutStock?.offset, [
    20 + KERF,
    0,
    60 + KERF,
  ]);
  next.pieces = next.pieces.filter((p) => !p.offcut);
  assert.equal(quantity(next), 1);
});

test("source regions are independent of world translation and rotation", () => {
  const p = sheet();
  const next = resizeByCuts(p, p.pieces[0].id, 60, 24);
  for (const piece of next.pieces) {
    piece.position = [-500, 150, 300];
    piece.rotation = [0.3, 0.5, 0.7];
  }
  assert.equal(inspectCutStock(next).invalid.length, 0);
  assert.equal(quantity(next), 1);
});

test("full-length wood rip strips share a single physical board without claiming two length cuts", () => {
  const p = blank();
  p.pieces = [
    part("Board", "stud", [1.5, 96, 3.5], [0, 48, 0], p.steps[0].id, "Stock"),
  ];
  const next = resizeByCuts(p, p.pieces[0].id, 96, 2),
    row = bom(next).find((r) => r.id === "stud")!;
  assert.equal(row.quantity, 1);
  assert.equal(row.bins.length, 1);
  assert.equal(row.bins[0].cuts.length, 1);
  assert.equal(row.bins[0].cuts[0].length, 96);
  assert.deepEqual(row.bins[0].sourceSize, [1.5, 96, 3.5]);
  assert.equal(inspectCutStock(next).invalid.length, 0);
  // An unrelated full board does not borrow this source identity or its retained regions.
  next.pieces.push(
    part(
      "Separate board",
      "stud",
      [1.5, 96, 3.5],
      [20, 48, 0],
      p.steps[0].id,
      "Stock",
    ),
  );
  assert.equal(quantity(next, "stud"), 2);
});

test("unrelated sheets remain conservative rather than being silently nested", () => {
  const p = sheet();
  p.pieces[0].size = [24, 0.75, 48];
  p.pieces.push({ ...structuredClone(p.pieces[0]), id: uid() });
  assert.equal(quantity(p), 2);
  const raw = JSON.parse(JSON.stringify(p));
  for (const piece of raw.pieces) delete piece.cutStock;
  assert.ok(projectSchema.parse(raw).pieces.every((p) => p.cutStock === null));
});

test("forged duplicate source regions cannot suppress purchasing quantities", () => {
  const p = sheet();
  const next = cutPiece(p, p.pieces[0].id, 60, 2);
  next.pieces.push({
    ...structuredClone(next.pieces[0]),
    id: uid(),
    position: [500, 100, 0],
  });
  assert.equal(quantity(next), 3);
  const inspection = inspectCutStock(next);
  assert.equal(inspection.invalid.length, 1);
  assert.match(inspection.invalid[0].detail, /overlapping regions/);
  assert.ok(
    validate(next).some(
      (f) =>
        f.id === `cut-source-${inspection.invalid[0].sourceId}` && f.pieceId,
    ),
  );
  assert.match(homeDepotHandoff(next), /INCOMPLETE MATERIAL LIST/);
  assert.match(homeDepotHandoff(next), /CUT SOURCE QUESTIONS/);
});

test("source-local bounds, material, original dimensions, and catalog stock must agree", () => {
  const p = sheet();
  const cut = cutPiece(p, p.pieces[0].id, 60, 2);
  const outside = structuredClone(cut);
  outside.pieces[0].cutStock!.offset[0] = 1;
  assert.match(
    inspectCutStock(outside).invalid[0].detail,
    /beyond its original/,
  );
  assert.equal(quantity(outside), 2);
  const mixed = structuredClone(cut);
  mixed.pieces[1].material = "plywood-half";
  assert.match(inspectCutStock(mixed).invalid[0].detail, /different materials/);
  const inconsistent = structuredClone(cut);
  inconsistent.pieces[1].cutStock!.size[0] = 47;
  assert.match(
    inspectCutStock(inconsistent).invalid[0].detail,
    /original stock dimensions/,
  );
  const oversized = structuredClone(cut);
  oversized.pieces.forEach((p) => (p.cutStock!.size[0] = 60));
  assert.match(
    inspectCutStock(oversized).invalid[0].detail,
    /exceeds the selected catalog/,
  );
});

test("a shorter original wood source leaves conservative stock remainder after its extraction kerf", () => {
  const p = blank();
  p.pieces = [
    part(
      "Half board",
      "stud",
      [1.5, 48, 3.5],
      [0, 24, 0],
      p.steps[0].id,
      "Stock",
    ),
  ];
  const cut = cutPiece(p, p.pieces[0].id, 24, 1);
  assert.equal(
    bom(cut).find((r) => r.id === "stud")?.bins[0].remaining,
    96 - 48 - KERF,
  );
});

test("forged touching pieces cannot consume the saw kerf and understate source purchases", () => {
  const p = sheet(),
    cut = cutPiece(p, p.pieces[0].id, 48, 2);
  cut.pieces[0].size[2] = 48 + KERF;
  assert.match(inspectCutStock(cut).invalid[0].detail, /saw kerf/);
  assert.equal(quantity(cut), 2);
});
