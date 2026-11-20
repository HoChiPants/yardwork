import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, uid, type Project, type V3 } from "../src/model";
import { fittedStockFaces, pickFittedStockFace } from "../src/fittedStock";
import { pickRenderedFittedStockFace } from "../src/fittedStockPicking";
import { composeRotation, rotate } from "../src/spatial";
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a: V3, b: V3): V3 => a.map((n, i) => n - b[i]) as V3;
const unit = (v: V3): V3 => v.map((n) => n / Math.hypot(...v)) as V3;
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function fixture() {
  const p = blank("SYNTHETIC rendered retained face");
  p.pieces = [
    part(
      "Clipped actual stud",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      p.steps[0].id,
      "",
    ),
  ];
  p.pieces[0].cutPlanes = [{ normal: [0, 1, 0], constant: 37.1 }];
  return p;
}
const rendered = (p: V3) => p.map((n) => Math.fround(n / 12) * 12) as V3;

test("37.1in retained cut face resolves Float32 feet rounding without weakening manual datum checks", () => {
  const p = fixture(),
    raw = JSON.stringify(p),
    point: V3 = [0.123456789, Math.fround(37.1 / 12) * 12, 0.678901234];
  assert.equal(point[1], 37.10000038146973);
  assert.ok(point[1] - 37.1 > 1e-7);
  assert.throws(
    () => pickFittedStockFace(p, p.pieces[0].id, point, [0, 1, 0]),
    /selected face/,
  );
  const ref = pickRenderedFittedStockFace(p, p.pieces[0].id, point, [0, 1, 0]);
  near(ref.pointLocal[1], 37.1);
  assert.equal(ref.pointLocal[0], point[0]);
  assert.equal(ref.pointLocal[2], point[2]);
  assert.deepEqual(ref.normalLocal, [0, 1, 0]);
  assert.deepEqual(
    pickFittedStockFace(p, p.pieces[0].id, ref.pointLocal, ref.normalLocal),
    ref,
  );
  assert.equal(JSON.stringify(p), raw);
});

test("an oblique retained triangle accepts rounded mesh points/normals and preserves their exact tangential projection", () => {
  const p = fixture(),
    n: V3 = [0, Math.cos(0.53), Math.sin(0.53)];
  p.pieces[0].cutPlanes = [{ normal: n, constant: 37.1 }];
  const face = fittedStockFaces(p, p.pieces[0].id).find(
    (f) => Math.hypot(...sub(f.normalLocal, n)) < 1e-10,
  )!;
  assert.ok(face);
  const vertices = face.verticesLocal.slice(0, 3).map(rendered),
    point = [0, 1, 2].map(
      (axis) =>
        0.2 * vertices[0][axis] +
        0.3 * vertices[1][axis] +
        0.5 * vertices[2][axis],
    ) as V3,
    normal = unit(
      cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])),
    );
  const ref = pickRenderedFittedStockFace(p, p.pieces[0].id, point, normal);
  near(dot(n, ref.pointLocal), 37.1);
  assert.ok(Math.hypot(...sub(ref.normalLocal, n)) < 1e-10);
  assert.ok(
    Math.hypot(...cross(sub(ref.pointLocal, point), n)) < 1e-10,
    "The correction must change only normal distance, never the clicked tangent datum.",
  );
  assert.ok(
    Math.hypot(...sub(ref.pointLocal, face.centerLocal)) > 0.01,
    "Do not substitute the polygon center.",
  );
});

test("the local pick remains correct inside a full-Euler moved assembly", () => {
  const p = fixture(),
    r: V3 = [0.43, -0.71, 0.29];
  p.pieces[0].rotation = composeRotation(r, p.pieces[0].rotation);
  p.pieces[0].position = [18, 50, -9];
  const point: V3 = [0.25, Math.fround(37.1 / 12) * 12, -0.5],
    ref = pickRenderedFittedStockFace(p, p.pieces[0].id, point, [0, 1, 0]);
  near(ref.pointLocal[1], 37.1);
  const actual = rotate(ref.pointLocal, r),
    expected = rotate([0.25, 37.1, -0.5], r);
  actual.forEach((n, i) => near(n, expected[i]));
});

test("old removed faces, excessive correction distance and actual outside-face points stay rejected", () => {
  const p = fixture(),
    id = p.pieces[0].id;
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0, 48, 0], [0, 1, 0]),
    /retained face/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0, 37.1011, 0], [0, 1, 0]),
    /retained face/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0.751, 37.1, 0], [0, 1, 0]),
    /inside.*retained face/,
  );
  assert.throws(
    () =>
      pickRenderedFittedStockFace(
        p,
        id,
        [0.7500005, Math.fround(37.1 / 12) * 12, 0],
        [0, 1, 0],
      ),
    /selected face/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0, 37.1, 0], [1, 1, 0]),
    /retained face/,
  );
});

test("sharp edges/corners are rejected, while a redundant coplanar stock/cut face remains one face", () => {
  const p = fixture(),
    id = p.pieces[0].id;
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0.75, 37.1, 0], [0, 1, 0]),
    /sharp edge or corner/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0.75, 37.1, 1.75], [0, 1, 0]),
    /sharp edge or corner/,
  );
  p.pieces[0].cutPlanes = [{ normal: [0, 1, 0], constant: 48 }];
  assert.doesNotThrow(() =>
    pickRenderedFittedStockFace(p, id, [0, 48, 0], [0, 1, 0]),
  );
});

test("nonwood, offcut and missing references never turn into a current face by name or proximity", () => {
  const p = fixture(),
    id = p.pieces[0].id;
  const variations: ((p: Project) => void)[] = [
    (p) => {
      p.pieces[0].material = "roof";
    },
    (p) => {
      p.pieces[0].offcut = true;
    },
  ];
  for (const change of variations) {
    const current = structuredClone(p);
    change(current);
    assert.throws(
      () => pickRenderedFittedStockFace(current, id, [0, 37.1, 0], [0, 1, 0]),
      /wood member/,
    );
  }
  assert.throws(
    () => pickRenderedFittedStockFace(p, uid(), [0, 37.1, 0], [0, 1, 0]),
    /actual current/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [NaN, 37.1, 0], [0, 1, 0]),
    /usable entrance/,
  );
  assert.throws(
    () => pickRenderedFittedStockFace(p, id, [0, 37.1, 0], [0, 0, 0]),
    /usable entrance/,
  );
});
