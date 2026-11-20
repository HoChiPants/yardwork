import test from "node:test";
import assert from "node:assert/strict";
import { blank, part } from "../src/model";
import { bom, cutPiece, KERF } from "../src/engine";
import { packRectangles } from "../src/packing";
import { sheetPlansMarkdown } from "../src/SheetLayouts";
import { toolChecklist } from "../src/tools";
import {
  checkProductBinding,
  findRetailerProduct,
} from "../src/retailerCatalog";
import { material } from "../src/model";

test("sheet planning fits many generated blanks without pretending to recover physical cut stock", () => {
  const p = blank();
  for (let i = 0; i < 12; i++)
    p.pieces.push(
      part(
        `Panel ${i}`,
        "plywood",
        [18, 0.75, 22],
        [i * 25, 20, 0],
        p.steps[0].id,
        "Shelving",
      ),
    );
  const row = bom(p)[0];
  assert.ok(row.quantity < 12);
  assert.equal(row.sheets.flatMap((sheet) => sheet.placements).length, 12);
  assert.ok(p.pieces.every((piece) => piece.cutStock === null));
  const ids = new Set<string>();
  for (const sheet of row.sheets)
    for (const a of sheet.placements) {
      assert.ok(!ids.has(a.id));
      ids.add(a.id);
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.x + a.width <= sheet.width &&
          a.y + a.length <= sheet.length,
      );
      assert.equal(a.rotated, false);
      for (const b of sheet.placements.filter((b) => b.id !== a.id))
        assert.ok(
          Math.max(
            b.x - a.x - a.width,
            a.x - b.x - b.width,
            b.y - a.y - a.length,
            a.y - b.y - b.length,
          ) >=
            KERF - 1e-8,
          "rectangular blanks leave a full modeled saw gap",
        );
    }
  const text = sheetPlansMarkdown([row], p);
  assert.match(text, /⅛ in kerf/);
  assert.match(text, /Panel 11/);
});

test("kerf prevents exact-width pairs fitting while smaller pairs do fit", () => {
  const cuts = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    name: String(i),
    width: 24,
    length: 48,
  }));
  assert.equal(
    packRectangles(cuts, 48, 96, { kerf: KERF, allowRotation: false }).plans
      .length,
    4,
  );
  assert.equal(
    packRectangles(
      cuts.map((cut) => ({ ...cut, width: 23.875, length: 47.875 })),
      48,
      96,
      { kerf: KERF, allowRotation: false },
    ).plans.length,
    1,
  );
  assert.equal(
    packRectangles(cuts, 48, 96).plans.length,
    1,
    "zero-kerf wire behavior is retained",
  );
});

test("known cut sources reserve whole sheets independently of a new proposed plan", () => {
  const p = blank();
  p.pieces = [
    part(
      "Original",
      "plywood",
      [48, 0.75, 96],
      [0, 0, 0],
      p.steps[0].id,
      "Parts",
    ),
  ];
  const cut = cutPiece(p, p.pieces[0].id, 30, 2);
  cut.pieces.push(
    part(
      "New blank",
      "plywood",
      [20, 0.75, 20],
      [0, 0, 0],
      p.steps[0].id,
      "Parts",
    ),
  );
  const row = bom(cut)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.sheets.length, 1);
  assert.deepEqual(
    row.sheets[0].placements.map((cut) => cut.name),
    ["New blank"],
  );
});

test("specialty stock matches reviewed envelopes and cuts require material-specific tools", () => {
  for (const id of ["sunlite-8mm", "closet-rod-72"] as const) {
    const m = material(id);
    assert.equal(
      checkProductBinding(m, findRetailerProduct(m.productReference!)!)
        .compatible,
      true,
    );
    const p = blank();
    p.pieces = [
      part(m.name, id, [...m.size], [0, 0, 0], p.steps[0].id, "Parts"),
    ];
    const cut = cutPiece(p, p.pieces[0].id, 30);
    assert.equal(bom(cut)[0].quantity, 1);
    const tools = toolChecklist(cut);
    assert.ok(
      tools.requirements.some(
        (row) =>
          row.capability ===
          (id === "closet-rod-72" ? "metal-cut" : "plastic-cut"),
      ),
    );
    assert.ok(
      !tools.requirements.some((row) => row.capability === "wood-crosscut"),
    );
    if (id === "closet-rod-72")
      assert.throws(() => cutPiece(p, p.pieces[0].id, 0.5, 0), /diameter/);
  }
});
