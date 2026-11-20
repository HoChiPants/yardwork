import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, type V3 } from "../src/model";
import { pickFastenerSurface } from "../src/fastenerPicking";

const fixture = () => part("Picked panel", "plytanium-703", [24, 12, 0.703], [34, 22, 9], blank().steps[0].id, "Casework");
test("canvas picking resolves small float-buffer surface error onto the exact actual face without mutating stock", () => {
  const p = fixture(), before = JSON.stringify(p),
    result = pickFastenerSurface(p, [3, 2, 0.3515001], [0, 0, -1]);
  assert.deepEqual(result.entranceLocal, [3, 2, 0.3515]);
  assert.deepEqual(result.driveLocal, [0, 0, -1]);
  assert.equal(JSON.stringify(p), before);
});
test("a picked angled cut resolves to its actual retained plane and inward unit normal", () => {
  const p = fixture(), n: V3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
  p.cutPlanes = [{normal:n,constant:1}];
  const result = pickFastenerSurface(p, [n[0] * 1.00001, n[1] * 1.00001, 0], n.map((v) => -v) as V3);
  assert.ok(Math.abs(result.entranceLocal[0] * n[0] + result.entranceLocal[1] * n[1] - 1) < 1e-10);
  assert.ok(Math.abs(Math.hypot(...result.driveLocal) - 1) < 1e-10);
});
test("picking never projects distant points, former cut-away surfaces or out-of-face coordinates into valid entrances", () => {
  const p = fixture();
  assert.throws(() => pickFastenerSurface(p, [0, 0, 0.5], [0, 0, -1]), /actual retained face/);
  assert.throws(() => pickFastenerSurface(p, [13, 0, 0.3515], [0, 0, -1]), /inside the retained face/);
  p.cutPlanes = [{normal:[0,0,1],constant:0}];
  assert.throws(() => pickFastenerSurface(p, [0, 0, 0.3515], [0, 0, -1]), /actual retained face/);
});
test("offcuts, nonwood stock and missing normals cannot become clicked wood-fastener entrances", () => {
  const p = fixture();
  assert.throws(() => pickFastenerSurface({...p,offcut:true}, [0,0,0.3515], [0,0,-1]), /selected wood member/);
  assert.throws(() => pickFastenerSurface({...p,material:"roof"}, [0,0,0.3515], [0,0,-1]), /selected wood member/);
  assert.throws(() => pickFastenerSurface(p, [0,0,0.3515], [0,0,0]), /usable entrance and normal/);
});
