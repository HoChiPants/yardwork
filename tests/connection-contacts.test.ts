import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, type Piece, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import {
  reviewConnectionContact,
  nearbyConnectionPairs,
} from "../src/connectionContacts";
const phase = blank().steps[0].id;
const box = (size: V3, position: V3): Piece =>
  part("Contact fixture", "stud", size, position, phase, "Fixture");
function transform(piece: Piece, rotation: V3, offset: V3): Piece {
  return {
    ...piece,
    position: rotate(piece.position, rotation).map(
      (n, i) => n + offset[i],
    ) as V3,
    rotation: composeRotation(rotation, piece.rotation),
  };
}
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("actual overlapping opposite faces produce a contact area, not a fastening location", () => {
  const a = box([2, 4, 2], [0, 2, 0]),
    b = box([4, 1, 2], [0, 4.5, 0]);
  const before = JSON.stringify([a, b]),
    result = reviewConnectionContact(a, b);
  assert.equal(result.state, "face-contact");
  near(result.gap!, 0);
  near(result.area!, 4);
  result.center!.forEach((n, i) => near(n, [0, 4, 0][i]));
  assert.equal(JSON.stringify([a, b]), before);
  assert.equal("entranceLocal" in result, false);
  assert.equal("hardware" in result, false);
});
test("positive gaps remain proximity, with the search distance never presented as a fit allowance", () => {
  const a = box([2, 4, 2], [0, 2, 0]),
    b = box([4, 1, 2], [0, 4.5625, 0]);
  const result = reviewConnectionContact(a, b);
  assert.equal(result.state, "near-face");
  near(result.gap!, 0.0625);
  near(result.area!, 4);
  assert.equal(reviewConnectionContact(a, b, 0.01).state, "outside-search");
  assert.match(result.reason, /not.*fit|not.*fasten|proximity/i);
});
test("shared full Euler motion preserves true face area and gap", () => {
  const a = box([2, 4, 2], [0, 2, 0]),
    b = box([4, 1, 2], [0, 4.5625, 0]),
    r: V3 = [0.31, 0.72, -0.27],
    t: V3 = [120, -18, 23];
  const result = reviewConnectionContact(
    transform(a, r, t),
    transform(b, r, t),
  );
  assert.equal(result.state, "near-face");
  near(result.gap!, 0.0625);
  near(result.area!, 4);
});
test("retained profile faces reject contact with removed stock and find an actual miter interface", () => {
  const a = box([4, 4, 4], [0, 0, 0]),
    s = Math.SQRT1_2;
  a.cutPlanes = [{ normal: [s, s, 0], constant: 0 }];
  assert.equal(
    reviewConnectionContact(a, box([1, 1, 1], [2.5, 1.5, 0])).state,
    "no-facing-contact",
  );
  const b = box([4, 4, 4], [0, 0, 0]);
  b.cutPlanes = [{ normal: [-s, -s, 0], constant: 0 }];
  const result = reviewConnectionContact(a, b);
  assert.equal(result.state, "face-contact");
  near(result.area!, 16 * Math.SQRT2);
});
test("partial face overlap is clipped while edge-only contact is not a surface-pair suggestion", () => {
  const a = box([4, 4, 4], [0, 0, 0]);
  const partial = reviewConnectionContact(a, box([4, 4, 4], [4, 3, 0]));
  assert.equal(partial.state, "face-contact");
  near(partial.area!, 4);
  assert.equal(
    reviewConnectionContact(a, box([4, 4, 4], [4, 4, 0])).state,
    "no-facing-contact",
  );
});
test("a slightly tilted face is not silently flattened into a parallel contact area", () => {
  const a = box([2, 4, 2], [0, 2, 0]),
    b = box([4, 1, 2], [0, 4.500002, 0]);
  b.rotation = [0, 0, 0.000001];
  assert.equal(reviewConnectionContact(a, b).state, "no-facing-contact");
});
test("penetrating solids, envelopes and malformed retained shapes cannot become face contacts", () => {
  const a = box([4, 4, 4], [0, 0, 0]);
  assert.equal(
    reviewConnectionContact(a, box([4, 4, 4], [3.995, 0, 0])).state,
    "interference",
  );
  const envelope = {
    ...box([4, 4, 4], [4, 0, 0]),
    material: "sunlite-8mm" as const,
  };
  assert.equal(reviewConnectionContact(a, envelope).state, "unsupported");
  const removed = {
    ...box([4, 4, 4], [4, 0, 0]),
    cutPlanes: [{ normal: [1, 0, 0] as V3, constant: -9 }],
  };
  assert.equal(reviewConnectionContact(a, removed).state, "unsupported");
});
test("nearby pairs keep real IDs, scope cross-stage contacts, and ignore offcuts without mutating the project", () => {
  const p = blank();
  const a = box([2, 4, 2], [0, 2, 0]),
    b = box([4, 1, 2], [0, 4.5, 0]),
    c = box([2, 4, 2], [20, 2, 0]),
    d = box([4, 1, 2], [20, 4.5, 0]);
  p.pieces = [a, b, c, d, { ...b, id: crypto.randomUUID(), offcut: true }];
  const before = JSON.stringify(p),
    result = nearbyConnectionPairs(p, [a.id]);
  assert.equal(result.pairs.length, 1);
  assert.deepEqual(
    new Set([result.pairs[0].aId, result.pairs[0].bId]),
    new Set([a.id, b.id]),
  );
  assert.equal(result.complete, true);
  assert.equal(result.truncated, false);
  assert.equal(JSON.stringify(p), before);
});
test("bounded searches disclose incomplete results instead of implying all joints were examined", () => {
  const p = blank();
  p.pieces = [
    box([2, 2, 2], [0, 0, 0]),
    box([2, 2, 2], [2, 0, 0]),
    box([2, 2, 2], [4, 0, 0]),
  ];
  const partial = nearbyConnectionPairs(p, undefined, { maxChecks: 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.truncated, true);
  assert.equal(partial.checkedPairs, 1);
  const limited = nearbyConnectionPairs(p, undefined, { limit: 1 });
  assert.equal(limited.complete, true);
  assert.equal(limited.truncated, true);
  assert.equal(limited.candidateCount, 2);
  assert.equal(limited.pairs.length, 1);
  p.pieces.forEach((piece) => {
    piece.position = [0, 0, 0];
  });
  const overlaps = nearbyConnectionPairs(p, undefined, { limit: 1 });
  assert.equal(overlaps.issueCount, 3);
  assert.equal(overlaps.issues.length, 1);
  assert.equal(overlaps.truncated, true);
});
