import test from "node:test";
import assert from "node:assert/strict";
import { blank, part } from "../src/model";
import { resizeByCuts } from "../src/cutPlan";
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
