import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part, projectSchema } from "../src/model";
import { bom, cutPiece, inspectCutStock } from "../src/engine";
import { stockAxes, orientedStockSize } from "../src/stockAxes";
import { cuttingAxes } from "../src/cutPlan";
import { cutInstructions, cutInstructionsText } from "../src/cutInstructions";
import { buildGreenhouse } from "../src/structures";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
test("a short wide fluted blank retains specified sheet direction in cuts and purchasing", () => {
  const p = blank(),
    t = material("sunlite-8mm").size[1];
  const panel = part(
    "Above-door panel",
    "sunlite-8mm",
    [24, 8, t],
    [0, 30, 0],
    p.steps[0].id,
    "Glazing",
  );
  panel.stockLengthAxis = 1;
  p.pieces = [panel];
  assert.deepEqual(orientedStockSize(panel), [t, 24, 8]);
  assert.deepEqual(cuttingAxes(panel), [1, 0]);
  const placement = bom(p)[0].sheets[0].placements[0];
  assert.equal(placement.width, 24);
  assert.equal(placement.length, 8);
  assert.equal(placement.rotated, false);
  const cut = cutPiece(p, panel.id, 4);
  assert.equal(cut.pieces[0].size[1], 4);
  assert.equal(cut.pieces[0].size[0], 24);
  assert.equal(bom(cut)[0].quantity, 1);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(cut)));
  assert.ok(reopened.pieces.every((piece) => piece.stockLengthAxis === 1));
  const instructions = cutInstructions(reopened.pieces[0], {
    lineageStatus: "validated",
  });
  assert.equal(instructions.stockAxes.length, "Y");
  assert.match(cutInstructionsText(instructions), /specified stock length/);
});
test("grain/flute direction rejects cross-stock blanks that fit only after an incorrect quarter turn", () => {
  const p = blank(),
    panel = part(
      "Wrong flute orientation",
      "sunlite-8mm",
      [80, 12, 8 / 25.4],
      [0, 0, 0],
      p.steps[0].id,
      "Glazing",
    );
  panel.stockLengthAxis = 1;
  p.pieces = [panel];
  assert.equal(bom(p)[0].oversize, 1);
  assert.equal(bom(p)[0].quantity, 0);
  panel.stockLengthAxis = null;
  assert.equal(
    bom(p)[0].oversize,
    0,
    "Unspecified direction remains explicitly inferred",
  );
});
test("greenhouse low gables and above-door panels keep vertical flute cutting layouts", () => {
  const result = buildGreenhouse(
    blank(),
    { width: 72, depth: 96, eaveHeight: 84, roofRise: 6 },
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  );
  const p = result.project,
    panels = p.pieces.filter((piece) => piece.material === "sunlite-8mm");
  assert.ok(panels.some((piece) => piece.size[0] > piece.size[1]));
  assert.ok(panels.every((piece) => piece.stockLengthAxis === 1));
  const row = bom(p).find((row) => row.id === "sunlite-8mm")!;
  assert.equal(row.oversize, 0);
  for (const placement of row.sheets.flatMap((sheet) => sheet.placements)) {
    const piece = panels.find((piece) => piece.id === placement.id)!,
      axes = stockAxes(piece);
    assert.equal(placement.length, piece.size[1]);
    assert.equal(placement.width, piece.size[axes.width]);
  }
  const guide = generateBuildGuide(p);
  assert.equal(guideIsCurrent(guide), true);
  guide.pieces[0].stockLengthAxis = 0;
  assert.equal(guideIsCurrent(guide), false);
});
test("inconsistent source orientation cannot be used to share a purchase unit", () => {
  const p = blank(),
    panel = part(
      "Sheet",
      "plywood",
      [24, 0.75, 48],
      [0, 0, 0],
      p.steps[0].id,
      "Sheet",
    );
  panel.stockLengthAxis = 2;
  p.pieces = [panel];
  const cut = cutPiece(p, panel.id, 24);
  cut.pieces[1].stockLengthAxis = 0;
  assert.equal(inspectCutStock(cut).invalid.length, 1);
  assert.ok(bom(cut)[0].quantity >= 2);
});
