import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, type Piece, type V3 } from "../src/model";
import { bounds, cutPiece, KERF } from "../src/engine";
import { clipBox, endCutPlane, solidVolume } from "../src/cutProfiles";
import { inverseRotation, rotate } from "../src/spatial";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function fixture() {
  const project = blank("Profiled stock");
  const board = part(
    "Beveled board",
    "stud",
    [4, 10, 2],
    [10, 20, 30],
    project.steps[0].id,
    "Frame",
    [0.2, 0.4, 0.6],
  );
  board.cutPlanes = [
    endCutPlane(board.size, 1, false, 45, 0),
    endCutPlane(board.size, 1, true, 45, 0),
  ];
  project.pieces = [board];
  return project;
}
const volume = (piece: Piece) =>
  solidVolume(clipBox(piece.size, piece.cutPlanes));
test("profiled world bounds rotate actual retained vertices rather than the stock box", () => {
  const project = blank();
  const piece = part(
    "Diagonal prism",
    "stud",
    [2, 2, 2],
    [3, 10, 7],
    project.steps[0].id,
    "Frame",
    [0, 0, Math.PI / 4],
  );
  piece.cutPlanes = [{ normal: [Math.SQRT1_2, Math.SQRT1_2, 0], constant: 0 }];
  const result = bounds(piece);
  near(result.min[0], 3 - Math.SQRT2);
  near(result.max[0], 3 + Math.SQRT2);
  near(result.min[1], 10 - Math.SQRT2);
  near(result.max[1], 10);
  near(result.min[2], 6);
  near(result.max[2], 8);
});
test("cutting a profiled rotated member preserves its physical planes and kerf volume", () => {
  const project = fixture();
  const source = project.pieces[0];
  const before = structuredClone(project);
  const next = cutPiece(project, source.id, 5, 1);
  assert.deepEqual(project, before);
  assert.equal(next.pieces.length, 2);
  const [kept, offcut] = next.pieces;
  assert.equal(offcut.offcut, true);
  near(volume(kept) + volume(offcut), volume(source) - 4 * 2 * KERF);
  const shifts = [(5 - 10) / 2, (5 + KERF) / 2];
  for (const [i, result] of next.pieces.entries()) {
    source.cutPlanes.forEach((plane, j) =>
      near(
        result.cutPlanes[j].constant,
        plane.constant - plane.normal[1] * shifts[i],
      ),
    );
    for (const local of clipBox(result.size, result.cutPlanes).vertices) {
      const world = rotate(local, result.rotation).map(
        (v, axis) => v + result.position[axis],
      ) as V3;
      const oldLocal = rotate(
        world.map((v, axis) => v - source.position[axis]) as V3,
        inverseRotation(source.rotation),
      );
      for (const plane of source.cutPlanes)
        assert.ok(
          oldLocal.reduce((sum, v, axis) => sum + v * plane.normal[axis], 0) <=
            plane.constant + 1e-7,
        );
      if (result.offcut) assert.ok(oldLocal[1] >= 0.125 - 1e-7);
      else assert.ok(oldLocal[1] <= 1e-7);
    }
  }
  assert.deepEqual(kept.cutStock?.size, source.size);
  near(offcut.cutStock!.offset[1], 5 + KERF);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(next))), next);
});
test("an empty retained profile rejects atomically", () => {
  const project = fixture();
  project.pieces[0].cutPlanes = [{ normal: [0, -1, 0], constant: 0 }];
  const before = structuredClone(project);
  assert.throws(
    () => cutPiece(project, project.pieces[0].id, 4, 1),
    /degenerate|remove/,
  );
  assert.deepEqual(project, before);
});
test("an empty offcut region is waste instead of a phantom reusable part", () => {
  const project = fixture();
  project.pieces[0].cutPlanes = [{ normal: [0, 1, 0], constant: 0 }];
  const source = project.pieces[0];
  const next = cutPiece(project, source.id, 6, 1);
  assert.equal(next.pieces.length, 1);
  near(volume(next.pieces[0]), volume(source));
  const after = bounds(next.pieces[0]),
    before = bounds(source);
  for (const key of ["min", "max"] as const)
    after[key].forEach((v, i) => near(v, before[key][i]));
  assert.deepEqual(next.pieces[0].cutStock?.size, source.size);
  projectSchema.parse(next);
});
test("legacy projects default empty profiles and impossible imported solids are rejected", () => {
  const project = fixture();
  const legacy = structuredClone(project) as unknown as {
    pieces: Record<string, unknown>[];
  };
  delete legacy.pieces[0].cutPlanes;
  assert.deepEqual(projectSchema.parse(legacy).pieces[0].cutPlanes, []);
  project.pieces[0].cutPlanes = [{ normal: [0, 1, 0], constant: -6 }];
  assert.equal(projectSchema.safeParse(project).success, false);
});
