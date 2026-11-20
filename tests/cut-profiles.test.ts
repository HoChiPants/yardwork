import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  clipBox,
  cutPlaneSchema,
  endCutPlane,
  solidBounds,
  solidVolume,
  triangulateSolid,
  type ConvexSolid,
  type CutPlane,
} from "../src/cutProfiles";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function closed(solid: ConvexSolid) {
  const edges = new Map<string, [number, number][]>();
  for (const face of solid.faces) {
    const first = new Vector3(...solid.vertices[face.indices[0]]);
    const a = new Vector3(...solid.vertices[face.indices[1]]).sub(first);
    const b = new Vector3(...solid.vertices[face.indices[2]]).sub(first);
    assert.ok(
      a.cross(b).dot(new Vector3(...face.normal)) > 1e-10,
      "Face winding must point outwards",
    );
    near(Math.hypot(...face.normal), 1);
    for (let i = 0; i < face.indices.length; i++) {
      const a = face.indices[i],
        b = face.indices[(i + 1) % face.indices.length];
      const key = [a, b].sort((a, b) => a - b).join(":");
      edges.set(key, [...(edges.get(key) ?? []), [a, b]]);
    }
  }
  for (const pair of edges.values()) {
    assert.equal(pair.length, 2, "Every solid edge needs exactly two faces");
    assert.deepEqual(
      pair[0],
      [...pair[1]].reverse(),
      "Shared edges must have opposite winding",
    );
  }
}
test("uncut local stock is a closed centered box with exact volume", () => {
  const solid = clipBox([4, 10, 2], []);
  assert.equal(solid.vertices.length, 8);
  assert.equal(solid.faces.length, 6);
  assert.deepEqual(solidBounds(solid), { min: [-2, -5, -1], max: [2, 5, 1] });
  near(solidVolume(solid), 80);
  closed(solid);
});
test("a straight end trim produces its actual shorter solid and cap", () => {
  const solid = clipBox([4, 10, 2], [{ normal: [0, 1, 0], constant: 3 }]);
  assert.equal(solidBounds(solid).max[1], 3);
  near(solidVolume(solid), 64);
  assert.equal(solid.faces.filter((f) => f.kind === "cut").length, 1);
  closed(solid);
});
test("a 45 degree corner-referenced end bevel removes the expected wedge", () => {
  const size: [number, number, number] = [4, 10, 2];
  const plane = endCutPlane(size, 1, true, 45, 0);
  const solid = clipBox(size, [plane]);
  near(solidVolume(solid), 64); // 80 - (4 × 4 / 2) × 2
  assert.ok(
    solid.vertices.every(
      (v) =>
        v.reduce((sum, n, i) => sum + n * plane.normal[i], 0) <=
        plane.constant + 1e-8,
    ),
  );
  closed(solid);
  const triangles = triangulateSolid(solid);
  assert.equal(triangles.positions.length, triangles.normals.length);
  assert.equal(triangles.positions.length % 9, 0);
});
test("both end bevels remain parallel, closed, and retain known volume", () => {
  const size: [number, number, number] = [4, 10, 2];
  const start = endCutPlane(size, 1, false, 45, 0);
  const end = endCutPlane(size, 1, true, 45, 0);
  start.normal.forEach((v, i) => near(v, -end.normal[i]));
  const solid = clipBox(size, [start, end]);
  near(solidVolume(solid), 48);
  closed(solid);
  assert.equal(solid.faces.filter((f) => f.kind === "cut").length, 2);
  near(solidVolume(clipBox(size, [end, start])), 48);
});
test("caps passing through existing vertices stay closed without duplicate coplanar faces", () => {
  const diagonal: CutPlane = {
    normal: [Math.SQRT1_2, Math.SQRT1_2, 0],
    constant: 0,
  };
  const half = clipBox([2, 2, 2], [diagonal]);
  near(solidVolume(half), 4);
  closed(half);
  const duplicate = clipBox([2, 2, 2], [diagonal, diagonal]);
  assert.equal(duplicate.faces.length, half.faces.length);
  near(solidVolume(duplicate), 4);
  closed(duplicate);
  near(
    solidVolume(clipBox([2, 2, 2], [endCutPlane([2, 2, 2], 0, true, 0, 1)])),
    8,
  );
});
test("negative bevels and different stock length axes preserve volume", () => {
  for (const [size, axis, tilt] of [
    [[10, 4, 2], 0, 1],
    [[2, 4, 10], 2, 1],
  ] as const) {
    const solid = clipBox(
      [...size],
      [endCutPlane([...size], axis, true, -45, tilt)],
    );
    near(solidVolume(solid), 64);
    closed(solid);
  }
});
test("invalid/non-unit planes, too many planes, empty and degenerate cuts are rejected", () => {
  assert.equal(
    cutPlaneSchema.safeParse({ normal: [0, 0, 0], constant: 0 }).success,
    false,
  );
  assert.equal(
    cutPlaneSchema.safeParse({ normal: [0, 2, 0], constant: 0 }).success,
    false,
  );
  assert.equal(
    cutPlaneSchema.safeParse({ normal: [0, 1, 0], constant: Infinity }).success,
    false,
  );
  assert.throws(() => clipBox([0, 2, 2], []));
  assert.throws(() => clipBox([2, NaN, 2], []));
  assert.throws(() =>
    clipBox(
      [2, 2, 2],
      Array.from(
        { length: 7 },
        () => ({ normal: [1, 0, 0], constant: 1 }) as CutPlane,
      ),
    ),
  );
  assert.throws(
    () => clipBox([2, 2, 2], [{ normal: [1, 0, 0], constant: -1 }]),
    /degenerate/,
  );
  assert.throws(
    () => clipBox([2, 2, 2], [{ normal: [1, 0, 0], constant: -2 }]),
    /degenerate/,
  );
  assert.throws(() => endCutPlane([2, 10, 2], 1, true, 80, 0), /75/);
  assert.throws(() => endCutPlane([2, 10, 2], 1, true, 30, 1), /different/);
});

test("a true three-axis cap closes and removes the exact corner tetrahedron", () => {
  const unit = 1 / Math.sqrt(3);
  const solid = clipBox(
    [2, 2, 2],
    [{ normal: [unit, unit, unit], constant: unit }],
  );
  near(solidVolume(solid), 20 / 3);
  closed(solid);
  const cap = solid.faces.find((face) => face.kind === "cut")!;
  assert.equal(cap.indices.length, 3);
});

test("bounded multi-plane profiles preserve topology and all retained halfspaces", () => {
  let seed = 127;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let sample = 0; sample < 24; sample++) {
    const planes: CutPlane[] = Array.from({ length: 6 }, () => {
      const normal = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
        .normalize()
        .toArray() as [number, number, number];
      return { normal, constant: 0.2 + random() * 0.9 };
    });
    const solid = clipBox([2, 2, 2], planes);
    closed(solid);
    const volume = solidVolume(solid);
    assert.ok(volume > 0 && volume <= 8 + 1e-7);
    for (const vertex of solid.vertices)
      for (const plane of planes)
        assert.ok(
          vertex.reduce((sum, value, i) => sum + value * plane.normal[i], 0) <=
            plane.constant + 1e-7,
        );
  }
});
