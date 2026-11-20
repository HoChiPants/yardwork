import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, type V3 } from "../src/model";
import { endCutPlane } from "../src/cutProfiles";
import { cutDiagram, convexHull, type Point2 } from "../src/cutDiagram";
import { resizeByCuts } from "../src/cutPlan";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const area = (points: Point2[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return sum + p[0] * next[1] - p[1] * next[0];
    }, 0),
  ) / 2;
function sheet(rotation: V3 = [0, 0, 0]) {
  const project = blank("Cut a panel");
  project.pieces = [
    part(
      "Sheet",
      "plywood",
      [48, 0.75, 96],
      [80, 24, -30],
      project.steps[0].id,
      "Panel",
      rotation,
    ),
  ];
  return project;
}
test("a two-axis sheet cut projects true retained and offcut regions with kerf gaps", () => {
  const project = sheet([0.2, 0.7, 0.3]);
  const before = structuredClone(project);
  const id = project.pieces[0].id;
  const preview = resizeByCuts(project, id, 60, 24);
  const diagram = cutDiagram(project, id, preview);
  assert.deepEqual(diagram.axes, { long: 2, wide: 0 });
  near(area(diagram.source), 48 * 96);
  near(area(diagram.retained), 24 * 60);
  assert.equal(diagram.offcuts.length, 2);
  const offcutAreas = diagram.offcuts
    .map((p) => area(p.points))
    .sort((a, b) => a - b);
  near(offcutAreas[0], 23.875 * 60);
  near(offcutAreas[1], 48 * 35.875);
  near(
    area(diagram.retained) + offcutAreas[0] + offcutAreas[1],
    48 * 96 - 0.125 * (48 + 60),
  );
  assert.deepEqual(project, before);
});
test("beveled source footprints preserve missing stock corners instead of a filled rectangle", () => {
  const project = blank();
  const source = part(
    "Profile",
    "stud",
    [4, 10, 2],
    [0, 5, 0],
    project.steps[0].id,
    "Rafter",
  );
  source.cutPlanes = [
    endCutPlane(source.size, 1, false, 45, 0),
    endCutPlane(source.size, 1, true, 45, 0),
  ];
  project.pieces = [source];
  const preview = resizeByCuts(project, source.id, 5, 3);
  const diagram = cutDiagram(project, source.id, preview);
  near(area(diagram.source), 24);
  near(area(diagram.retained), 7.5);
  assert.ok(
    !diagram.source.some(([x, y]) => Math.abs(x) < 1e-7 && Math.abs(y) < 1e-7),
    "Removed lower-left corner must stay absent",
  );
  assert.ok(
    !diagram.source.some(
      ([x, y]) => Math.abs(x - 4) < 1e-7 && Math.abs(y - 10) < 1e-7,
    ),
    "Removed upper-right corner must stay absent",
  );
  assert.equal(diagram.offcuts.length, 2);
  for (const polygon of [
    diagram.retained,
    ...diagram.offcuts.map((o) => o.points),
  ])
    for (const [x, y] of polygon) {
      assert.ok(x >= -1e-7 && x <= 4 + 1e-7 && y >= -1e-7 && y <= 10 + 1e-7);
      assert.ok(Math.abs(x - 2 + (y - 5)) <= 3 + 1e-7);
    }
});
test("world translation and arbitrary rotation do not change a profiled stock's diagram", () => {
  const make = (rotation: V3, position: V3) => {
    const project = blank();
    const source = part(
      "Roof member",
      "stud",
      [1.5, 30, 3.5],
      position,
      project.steps[0].id,
      "Roof",
      rotation,
    );
    source.cutPlanes = [
      endCutPlane(source.size, 1, false, -30, 2),
      endCutPlane(source.size, 1, true, -30, 2),
    ];
    project.pieces = [source];
    return cutDiagram(
      project,
      source.id,
      resizeByCuts(project, source.id, 18, 2),
    );
  };
  const original = make([0, 0, 0], [0, 0, 0]);
  const rotated = make([-0.3, 0.4, 1.2], [200, 80, -200]);
  for (const key of ["source", "retained"] as const) {
    assert.equal(rotated[key].length, original[key].length);
    near(area(rotated[key]), area(original[key]));
    for (const point of rotated[key])
      assert.ok(
        original[key].some(
          (other) =>
            Math.hypot(other[0] - point[0], other[1] - point[1]) < 1e-7,
        ),
      );
  }
  assert.equal(rotated.offcuts.length, original.offcuts.length);
  rotated.offcuts.forEach((o, i) =>
    near(area(o.points), area(original.offcuts[i].points)),
  );
});
test("existing/unrelated offcuts never appear as new fragments of this stock", () => {
  const project = sheet();
  const existing = {
    ...part(
      "Old offcut",
      "plywood",
      [10, 0.75, 20],
      [300, 1, 0],
      project.steps[0].id,
      "Loose",
    ),
    offcut: true,
  };
  project.pieces.push(existing);
  const id = project.pieces[0].id;
  const preview = resizeByCuts(project, id, 60, 24);
  preview.pieces.push({
    ...existing,
    id: crypto.randomUUID(),
    cutStock: {
      id: crypto.randomUUID(),
      size: [10, 0.75, 20],
      offset: [0, 0, 0],
    },
  });
  assert.equal(cutDiagram(project, id, preview).offcuts.length, 2);
});
test("unchanged previews show the source while invalid previews add no fictitious retained shape", () => {
  const project = sheet();
  const id = project.pieces[0].id;
  const same = cutDiagram(project, id);
  assert.deepEqual(same.source, same.retained);
  assert.deepEqual(same.offcuts, []);
  const invalid = cutDiagram(project, id, null);
  near(area(invalid.source), 48 * 96);
  assert.deepEqual(invalid.retained, []);
  assert.deepEqual(invalid.offcuts, []);
});
test("projection hull removes interior, repeated and collinear points deterministically", () => {
  assert.deepEqual(
    convexHull([
      [1, 1],
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 0],
      [2, 2],
    ]),
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
  );
  assert.deepEqual(convexHull([]), []);
  assert.throws(() => convexHull([[NaN, 1]]), /finite/);
});
test("nearly coincident projected thickness edges retain every silhouette corner", () => {
  const points: Point2[] = [
    [2.125, 1.2268693220279552],
    [2.125 - 2e-14, 18],
    [2.125 + 1e-14, 1.226869322027956],
    [2.125, 18 - 1e-14],
    [3.5, 2.02072594216369],
    [3.5, 18],
  ];
  const hull = convexHull(points);
  assert.equal(hull.length, 4);
  near(area(hull), 22.51727825586825);
  assert.deepEqual(convexHull([...points].reverse()), hull);
});
