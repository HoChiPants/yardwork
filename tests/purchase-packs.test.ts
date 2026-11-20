import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type MaterialId,
} from "../src/model";
import { bom, cutPiece, validate } from "../src/engine";
import { resizeByCuts } from "../src/cutPlan";
import { purchaseCount } from "../src/purchaseUnits";
function withPack<T>(id: MaterialId, count: number, run: () => T): T {
  const m = material(id),
    original = structuredClone(m);
  try {
    m.packCount = count;
    m.unit = "bundle";
    return run();
  } finally {
    Object.assign(m, original);
  }
}
function fullStock(count: number, id: MaterialId = "stud") {
  const p = blank("Bundle review"),
    m = material(id);
  p.pieces = Array.from({ length: count }, (_, i) =>
    part(
      `Stock ${i + 1}`,
      id,
      [...m.size],
      [i * 60, 48, 0],
      p.steps[0].id,
      "Stock",
    ),
  );
  return p;
}
test("purchase count separates required physical items from sell packs and surplus", () => {
  assert.deepEqual(purchaseCount(7, 6), {
    physicalStockUnits: 7,
    packCount: 6,
    quantity: 2,
    purchasedStockUnits: 12,
    surplusStockUnits: 5,
  });
  assert.equal(purchaseCount(0, 6).quantity, 0);
  assert.equal(purchaseCount(6, 6).quantity, 1);
  for (const [count, pack] of [
    [-1, 6],
    [1.5, 6],
    [1, 0],
    [1, -2],
    [1, 1.5],
    [NaN, 1],
    [1, Infinity],
  ])
    assert.throws(() => purchaseCount(count, pack));
});
test("five and seven boards buy one and two six-board bundles without compressing cut bins", () =>
  withPack("stud", 6, () => {
    for (const count of [5, 6, 7]) {
      const row = bom(fullStock(count))[0];
      assert.equal(row.physicalStockUnits, count);
      assert.equal(row.bins.length, count);
      assert.equal(row.quantity, count <= 6 ? 1 : 2);
      assert.equal(row.packCount, 6);
      assert.equal(row.surplusStockUnits, row.quantity * 6 - count);
      assert.equal(row.total, row.quantity * material("stud").price);
    }
  }));
test("recut remnants and full-length ripped strips retain one source before bundle conversion", () =>
  withPack("stud", 6, () => {
    const p = fullStock(1);
    let cut = cutPiece(p, p.pieces[0].id, 48, 1);
    cut = cutPiece(cut, cut.pieces[1].id, 24, 1);
    for (const next of [cut, resizeByCuts(p, p.pieces[0].id, 96, 2)]) {
      const restored = projectSchema.parse(JSON.parse(JSON.stringify(next))),
        row = bom(restored)[0];
      assert.equal(row.physicalStockUnits, 1);
      assert.equal(row.quantity, 1);
      assert.equal(row.bins.length, 1);
      assert.equal(row.surplusStockUnits, 5);
    }
  }));
test("sheet packing plus physical cut sources convert to packs only after source counting", () =>
  withPack("plywood", 2, () => {
    const p = fullStock(3, "plywood"),
      row = bom(p)[0];
    assert.equal(row.physicalStockUnits, 3);
    assert.equal(row.sheets.length, 3);
    assert.equal(row.quantity, 2);
    assert.equal(row.surplusStockUnits, 1);
    const cut = resizeByCuts(p, p.pieces[0].id, 60, 24);
    assert.equal(bom(cut)[0].physicalStockUnits, 3);
    assert.equal(bom(cut)[0].quantity, 2);
  }));
test("two-axis sheet remnants count one stock sheet and overlapping forged regions stay conservative", () =>
  withPack("plywood", 2, () => {
    const p = fullStock(1, "plywood"),
      cut = resizeByCuts(p, p.pieces[0].id, 60, 24);
    assert.equal(bom(cut)[0].physicalStockUnits, 1);
    assert.equal(bom(cut)[0].quantity, 1);
    cut.pieces.push({ ...structuredClone(cut.pieces[0]), id: uid() });
    const invalid = bom(cut)[0];
    assert.equal(invalid.physicalStockUnits, 4);
    assert.equal(invalid.quantity, 2);
    assert.ok(validate(cut).some((f) => f.id.startsWith("cut-source-")));
  }));
test("hardware boxes are rounded once and preserve the physical units plus surplus", () => {
  const p = fullStock(121, "n10dhdg-r"),
    row = bom(p)[0];
  assert.equal(row.physicalStockUnits, 121);
  assert.equal(row.packCount, 120);
  assert.equal(row.quantity, 2);
  assert.equal(row.surplusStockUnits, 119);
});
test("snapshot prices and available stock are compared per bundle, oversized requirements remain excluded", () =>
  withPack("stud", 6, () => {
    const p = fullStock(7);
    p.store = "Test store";
    p.inventory = [
      {
        material: "stud",
        retailer: "home-depot",
        internetNumber: "123456789",
        name: "Test six-board bundle",
        price: 30,
        available: 1,
        store: p.store,
        zip: p.zip,
        checkedAt: new Date().toISOString(),
        url: "https://www.homedepot.com/p/123456789",
      },
    ];
    p.pieces.push(
      part(
        "Too long",
        "stud",
        [1.5, 120, 3.5],
        [0, 60, 0],
        p.steps[0].id,
        "Stock",
      ),
    );
    const row = bom(p)[0];
    assert.equal(row.physicalStockUnits, 7);
    assert.equal(row.quantity, 2);
    assert.equal(row.total, 60);
    assert.equal(row.oversize, 1);
    assert.ok(validate(p).some((f) => f.title === "Store stock is short by 1"));
  }));
