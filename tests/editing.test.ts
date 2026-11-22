import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, type Piece } from "../src/model";
import { snapPlacement, snapSurfacePoint, surfacePlacement } from "../src/editing";
import { bounds } from "../src/engine";
import { endCutPlane } from "../src/cutProfiles";
function block(
  position: [number, number, number],
  size: [number, number, number] = [10, 10, 10],
): Piece {
  const p = blank();
  return part("Solid", "stud", size, position, p.steps[0].id, "Loose parts");
}
test("face snapping uses actual bounds, preserves inputs, and ignores unrelated faces", () => {
  const p = blank();
  const fixed = block([0, 5, 0]);
  const moving = block([10.5, 5, 0]);
  p.pieces = [fixed, moving];
  const position: [number, number, number] = [...moving.position];
  const result = snapPlacement(p, moving, position, [0, 0, 0]);
  assert.equal(result.snapped, true);
  assert.equal(result.position[0], 10);
  assert.deepEqual(position, moving.position);
  assert.deepEqual(
    snapPlacement(p, moving, [10.5, 5, 50], [0, 0, 0]).position,
    [10.5, 5, 50],
  );
});
test("snapping chooses a fitting contact rather than penetrating an adjacent obstacle", () => {
  const p = blank();
  const target = block([0, 5, 0]);
  const blocker = block([4.8, 15.2, 0], [0.2, 10, 10]);
  const moving = block([10.5, 15.2, 0]);
  p.pieces = [target, blocker, moving];
  const result = snapPlacement(p, moving, moving.position, moving.rotation);
  // Contact against the narrow neighboring part must stop at its physical face.
  const actual = bounds({ ...moving, position: result.position });
  assert.ok(actual.min[0] >= bounds(blocker).max[0] - 1e-7);
});
test("rotated stock snaps to ground using its physical extent", () => {
  const p = blank();
  const moving = block([30, 5.5, 0], [2, 20, 10]);
  const rotation: [number, number, number] = [Math.PI / 2, 0, 0];
  const result = snapPlacement(p, moving, moving.position, rotation);
  assert.ok(
    Math.abs(
      bounds({ ...moving, position: result.position, rotation }).min[1],
    ) < 1e-8,
  );
});
test("offcuts and fasteners do not create phantom face snaps", () => {
  const p = blank();
  const moving = block([10.5, 5, 0]);
  p.pieces = [
    { ...block([0, 5, 0]), offcut: true },
    { ...block([0, 5, 0]), material: "screw" },
  ];
  assert.equal(
    snapPlacement(p, moving, moving.position, moving.rotation).snapped,
    false,
  );
});

test("surface placement picks the nearest real top before the floor", () => {
  const p = blank();
  p.pieces = [block([0, 5, 0]), block([0, 15, 0])];
  assert.deepEqual(surfacePlacement(p, [0, 40, 0], [0, -1, 0]), [0, 20, 0]);
  assert.deepEqual(surfacePlacement(p, [20, 40, 0], [0, -1, 0]), [20, 0, 0]);
  assert.deepEqual(
    surfacePlacement(p, [0, 40, 0], [0, -1, 0], p.pieces[1].id),
    [0, 10, 0],
  );
  assert.equal(surfacePlacement(p, [0, 40, 0], [0, 1, 0]), null);
  assert.equal(surfacePlacement(p, [20, 99.98765, 0], [0, -0.57, 0])?.[1], 0);
});

test("a grid snap near thin stock preserves whether the pointer hit its face or the floor", () => {
  const p = blank();
  p.pieces = [block([0, 0.375, 0], [11.5, 0.75, 10.5])];
  assert.deepEqual(snapSurfacePoint(p, [5.7, 0.75, 0], 24), [5.7, 0.75, 0]);
  assert.deepEqual(snapSurfacePoint(p, [0, 0, 5.3], 24), [0, 0, 5.3]);
  assert.deepEqual(snapSurfacePoint(p, [1.3, 0.75, 0], 24), [1, 0.75, 0]);
  assert.deepEqual(snapSurfacePoint(p, [0, 0, 6.3], 24), [0, 0, 6]);
});

test("profile placement intersects the actual sloped face instead of floating on its stock envelope", () => {
  const p = blank();
  const gable = block([0, 5, 0], [1.5, 10, 3.5]);
  gable.cutPlanes = [endCutPlane(gable.size, 1, true, 45, 2)];
  p.pieces = [gable];
  const before = structuredClone(p);
  const hit = surfacePlacement(p, [0, 30, 1.5], [0, -1, 0])!;
  assert.ok(Math.abs(hit[1] - 6.75) < 1e-8);
  assert.ok(hit[1] < bounds(gable).max[1] - 3);
  const other = surfacePlacement(p, [0, 30, -1.25], [0, -1, 0])!;
  assert.ok(Math.abs(other[1] - 9.5) < 1e-8);
  assert.deepEqual(p, before);
  gable.rotation = [0, Math.PI / 2, 0];
  const turned = surfacePlacement(p, [1.5, 30, 0], [0, -1, 0])!;
  assert.ok(Math.abs(turned[1] - 6.75) < 1e-8);
});

test("removed profile footprint corners fall back to the floor and nearer real stock wins", () => {
  const p = blank();
  const clipped = block([0, 5, 0]);
  clipped.cutPlanes = [
    { normal: [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)], constant: 0 },
  ];
  p.pieces = [clipped];
  assert.deepEqual(surfacePlacement(p, [3, 30, 3], [0, -1, 0]), [3, 0, 3]);
  assert.deepEqual(surfacePlacement(p, [-3, 30, -3], [0, -1, 0]), [-3, 10, -3]);
  p.pieces.push(block([0, 15, 0], [10, 1, 10]));
  assert.deepEqual(
    surfacePlacement(p, [-3, 30, -3], [0, -1, 0]),
    [-3, 15.5, -3],
  );
});
test("surface placement ignores hardware/offcuts and intersects the actual angled face", () => {
  const p = blank();
  p.pieces = [
    { ...block([0, 5, 0]), material: "bracket" },
    { ...block([0, 15, 0]), offcut: true },
    { ...block([0, 25, 0]), rotation: [Math.PI / 4, 0, 0] },
  ];
  const angled=surfacePlacement(p,[0,50,0],[0,-1,0])!;
  assert.ok(Math.abs(angled[1]-(25+Math.sqrt(50)))<1e-7);
  p.pieces = [
    { ...block([0, 5, 0], [10, 20, 6]), rotation: [Math.PI / 2, 0, 0] },
  ];
  const point = surfacePlacement(p, [0, 50, 0], [0, -1, 0])!;
  assert.ok(Math.abs(point[1] - 8) < 1e-7);
});
test("a yawed board has a real top but empty corners of its world box are not supports",()=>{
  const p=blank();p.pieces=[{...block([0,5,0]),rotation:[0,Math.PI/4,0]}];
  assert.deepEqual(surfacePlacement(p,[0,30,0],[0,-1,0]),[0,10,0]);
  assert.deepEqual(surfacePlacement(p,[6,30,6],[0,-1,0]),[6,0,6]);
});
