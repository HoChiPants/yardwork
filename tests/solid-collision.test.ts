import assert from "node:assert/strict";
import test from "node:test";
import {
  blank,
  part,
  type MaterialId,
  type Piece,
  type V3,
} from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import {
  prepareCollisionSolid,
  pieceOverlap,
  solidOverlap,
  type CollisionSolid,
} from "../src/solidCollision";

const phase = blank().steps[0].id;
function box(
  size: V3 = [4, 4, 4],
  position: V3 = [0, 0, 0],
  rotation: V3 = [0, 0, 0],
  material: MaterialId = "stud",
): Piece {
  return {
    ...part(
      "Collision fixture",
      material,
      size,
      position,
      phase,
      "Collision fixture",
    ),
    rotation,
  };
}
function prepared(piece: Piece): CollisionSolid {
  const value = prepareCollisionSolid(piece);
  assert.ok(value);
  return value;
}
function shift(piece: Piece, rotation: V3, offset: V3): Piece {
  return {
    ...structuredClone(piece),
    rotation: composeRotation(rotation, piece.rotation),
    position: rotate(piece.position, rotation).map(
      (value, axis) => value + offset[axis],
    ) as V3,
  };
}
const dot = (a: V3, b: V3) =>
  a.reduce((sum, value, axis) => sum + value * b[axis], 0);
function overlapOnFaceAxes(
  a: CollisionSolid,
  b: CollisionSolid,
  tolerance: number,
): boolean {
  return [...a.faceNormals, ...b.faceNormals].every((axis) => {
    const aa = a.vertices.map((point) => dot(point, axis)),
      bb = b.vertices.map((point) => dot(point, axis));
    return (
      Math.max(...aa) - Math.min(...bb) > tolerance &&
      Math.max(...bb) - Math.min(...aa) > tolerance
    );
  });
}

test("prepared boxes contain actual world vertices and normalized polygon-edge directions", () => {
  const p = box([4, 10, 2], [20, 30, 40], [Math.PI / 2, 0, 0]),
    solid = prepared(p);
  assert.equal(solid.kind, "solid");
  assert.equal(solid.vertices.length, 8);
  assert.equal(solid.faceNormals.length, 3);
  assert.equal(solid.edgeDirections.length, 3);
  assert.deepEqual(solid.bounds, { min: [18, 29, 35], max: [22, 31, 45] });
  for (const direction of [...solid.faceNormals, ...solid.edgeDirections])
    assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
});

test("rotated crossing boards have interior overlap even away from unrotated orientations", () => {
  const first = box([8, 0.75, 0.75], [0, 0, 0], [0.31, -0.2, Math.PI / 4]),
    second = box([8, 0.75, 0.75], [0, 0, 0], [-0.15, 0.3, -Math.PI / 4]);
  assert.equal(pieceOverlap(first, second), true);
  assert.equal(pieceOverlap(second, first), true);
  assert.equal(pieceOverlap(first, first), true);
});

test("overlapping world AABBs of parallel diagonal boards do not imply solid overlap", () => {
  const first = prepared(box([8, 0.2, 0.2], [0, 0, 0], [0, 0, Math.PI / 4])),
    second = prepared(box([8, 0.2, 0.2], [-0.4, 0.4, 0], [0, 0, Math.PI / 4]));
  assert.ok(
    [0, 1, 2].every(
      (axis) =>
        first.bounds.max[axis] > second.bounds.min[axis] &&
        second.bounds.max[axis] > first.bounds.min[axis],
    ),
  );
  assert.equal(solidOverlap(first, second), false);
});

test("edge-cross axes separate skew boards whose projections overlap on every face normal", () => {
  const first = prepared(
      box(
        [4, 0.6, 0.9],
        [0, 0, 0],
        [1.6918124242220074, 0.7836320553906262, 2.855203000595793],
      ),
    ),
    second = prepared(
      box(
        [3, 0.7, 0.5],
        [0.7610525507479906, -0.058694309554994106, -1.2013401351869106],
        [2.4827706310898066, 2.4929186787921935, 1.1720204944722354],
      ),
    );
  assert.ok(overlapOnFaceAxes(first, second, 0.01));
  assert.equal(solidOverlap(first, second), false);
  assert.equal(solidOverlap(second, first), false);
});

test("removed profile space remains clear despite overlap with the original box and clipped AABB", () => {
  const clipped = box();
  clipped.cutPlanes = [
    { normal: [Math.SQRT1_2, Math.SQRT1_2, 0], constant: 0 },
  ];
  const removed = box([0.5, 0.5, 0.5], [1.2, 1.2, 0]),
    retained = box([0.5, 0.5, 0.5], [-1.2, -1.2, 0]);
  assert.equal(pieceOverlap(box(), removed), true);
  assert.equal(pieceOverlap(clipped, removed), false);
  assert.equal(pieceOverlap(clipped, retained), true);
  assert.ok(
    prepared(clipped).faceNormals.some(
      (axis) => Math.abs(axis[0]) > 0.7 && Math.abs(axis[1]) > 0.7,
    ),
  );
  assert.ok(prepared(clipped).edgeDirections.length > 3);
});

test("face, edge and corner contact and shallow penetration within tolerance are excluded", () => {
  const first = box([2, 2, 2]);
  for (const position of [
    [2, 0, 0],
    [2, 2, 0],
    [2, 2, 2],
    [3, 0, 0],
    [1.995, 0, 0],
    [1.99, 0, 0],
  ] as V3[])
    assert.equal(
      pieceOverlap(first, box([2, 2, 2], position)),
      false,
      JSON.stringify(position),
    );
  assert.equal(pieceOverlap(first, box([2, 2, 2], [1.98, 0, 0])), true);
  assert.equal(pieceOverlap(first, box([2, 2, 2], [1.995, 0, 0]), 0), true);
  assert.equal(pieceOverlap(first, box([2, 2, 2], [2, 0, 0]), 0), false);
});

test("containment is overlap even when the contained solid is thinner than the contact tolerance", () => {
  const outer = prepared(box([4, 4, 4])),
    inner = prepared(box([0.01, 0.01, 0.01]));
  assert.equal(solidOverlap(outer, inner), true);
  assert.equal(solidOverlap(inner, outer), true);
  assert.equal(solidOverlap(outer, inner, 3), false);
});

test("shared full-Euler transforms preserve overlap and actual-cut separation at translated origins", () => {
  const rotation: V3 = [0.27, -0.48, 0.62],
    offset: V3 = [11000, -9000, 8000],
    first = box();
  first.cutPlanes = [{ normal: [Math.SQRT1_2, Math.SQRT1_2, 0], constant: 0 }];
  for (const second of [
    box([0.5, 0.5, 0.5], [1.2, 1.2, 0]),
    box([0.5, 0.5, 0.5], [-1.2, -1.2, 0]),
    box([3, 0.7, 0.5], [0, 0, 0], [0.4, 0.8, 0.2]),
  ])
    assert.equal(
      pieceOverlap(
        shift(first, rotation, offset),
        shift(second, rotation, offset),
      ),
      pieceOverlap(first, second),
    );
});

test("near-parallel boards, axis scaling and near-zero tolerance retain finite consistent answers", () => {
  const first = prepared(
      box([96, 1.5, 3.5], [10000, 0, 0], [1e-11, -1e-11, 0]),
    ),
    second = prepared(box([96, 1.5, 3.5], [10000, 1.7, 0]));
  assert.equal(solidOverlap(first, second, 0), false);
  const crossing = prepared(box([96, 1.5, 3.5], [10000, 1.4, 0]));
  const scaled = {
    ...crossing,
    faceNormals: crossing.faceNormals.map(
      (axis) => axis.map((v) => v * 40) as V3,
    ),
    edgeDirections: crossing.edgeDirections.map(
      (axis) => axis.map((v) => v / 100) as V3,
    ),
  };
  assert.equal(solidOverlap(first, scaled), true);
  assert.equal(solidOverlap(first, scaled), solidOverlap(first, crossing));
});

test("wood panels are solids, glazing/metal panels are envelopes, and other profiles are unsupported", () => {
  assert.equal(
    prepared(box([12, 0.703, 12], [0, 0, 0], [0, 0, 0], "plytanium-703")).kind,
    "solid",
  );
  const glazing = prepared(
    box([24, 96, 8 / 25.4], [0, 0, 0], [0, 0, 0], "sunlite-8mm"),
  );
  assert.equal(glazing.kind, "envelope");
  assert.equal(solidOverlap(glazing, prepared(box())), true);
  assert.equal(
    prepared(box([24, 36, 0.04], [0, 0, 0], [0, 0, 0], "roof")).kind,
    "envelope",
  );
  for (const id of [
    "closet-rod-72",
    "mesh",
    "screw",
    "bracket",
  ] as MaterialId[]) {
    const p = box([1, 1, 1], [0, 0, 0], [0, 0, 0], id);
    assert.equal(prepareCollisionSolid(p), null);
    assert.equal(pieceOverlap(p, box()), null);
  }
  const offcut = { ...box(), offcut: true };
  assert.equal(
    prepared(offcut).kind,
    "solid",
    "Callers choose whether offcuts belong in their collision scope",
  );
});

test("glazing profile cuts narrow the external envelope without asserting a filled panel", () => {
  const glazing = box([12, 12, 0.315], [0, 0, 0], [0, 0, 0], "sunlite-8mm");
  glazing.cutPlanes = [{ normal: [1, 0, 0], constant: 0 }];
  const result = prepared(glazing);
  assert.equal(result.kind, "envelope");
  assert.equal(result.bounds.max[0], 0);
  assert.equal(pieceOverlap(glazing, box([1, 1, 1], [3, 0, 0])), false);
});

test("invalid tolerance, nonfinite geometry and unrepresentable/empty cuts fail explicitly", () => {
  const p = box(),
    solid = prepared(p);
  for (const tolerance of [-1, NaN, Infinity])
    assert.throws(() => solidOverlap(solid, solid, tolerance), /tolerance/);
  for (const altered of [
    { ...p, position: [NaN, 0, 0] as V3 },
    { ...p, rotation: [0, Infinity, 0] as V3 },
    { ...p, size: [0, 4, 4] as V3 },
    { ...p, position: [1e20, 1e20, 1e20] as V3 },
    { ...p, cutPlanes: [{ normal: [1, 0, 0] as V3, constant: -2 }] },
  ])
    assert.throws(() => prepareCollisionSolid(altered));
  assert.throws(
    () => solidOverlap({ ...solid, faceNormals: [[0, 0, 0]] }, solid),
    /prepared/,
  );
});

test("preparation and overlap do not change source parts, cuts, lineage or prepared arrays", () => {
  const first = box(),
    second = box([1, 1, 1]);
  first.cutPlanes = [{ normal: [1, 0, 0], constant: 1.5 }];
  first.cutStock = { id: first.id, size: [4, 4, 4], offset: [0, 0, 0] };
  const before = JSON.stringify([first, second]),
    a = prepared(first),
    b = prepared(second),
    preparedBefore = JSON.stringify([a, b]);
  assert.equal(solidOverlap(a, b), true);
  assert.equal(JSON.stringify([first, second]), before);
  assert.equal(JSON.stringify([a, b]), preparedBefore);
  a.vertices[0][0] += 10;
  assert.equal(JSON.stringify([first, second]), before);
});
