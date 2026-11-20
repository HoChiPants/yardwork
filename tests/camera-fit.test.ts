import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import {
  fitPerspectiveBounds,
  boundsCorners,
  type PerspectiveBounds,
} from "../src/cameraFit";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  listBuildFixtures,
} from "../src/buildFixtures";
import { bounds } from "../src/engine";
import { blank, type Project, type V3 } from "../src/model";
import { buildGreenhouse } from "../src/structures";
import { motionViewport, unionBounds } from "../src/motionCamera";
import { reviewLidTravel } from "../src/lidMotion";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function projectBounds(project: Project): PerspectiveBounds {
  const boxes = project.pieces.map(bounds);
  return {
    min: [0, 1, 2].map(
      (i) => Math.min(...boxes.map((b) => b.min[i])) / 12,
    ) as V3,
    max: [0, 1, 2].map(
      (i) => Math.max(...boxes.map((b) => b.max[i])) / 12,
    ) as V3,
  };
}
function assertFit(box: PerspectiveBounds, aspect: number, direction: V3) {
  const fit = fitPerspectiveBounds(box, {
      verticalFovDegrees: 38,
      aspect,
      direction,
      padding: 1.1,
    }),
    camera = new PerspectiveCamera(38, aspect, 0.05, 500);
  camera.position.set(...fit.position);
  camera.lookAt(new Vector3(...fit.target));
  camera.updateMatrixWorld();
  for (const corner of boundsCorners(box)) {
    const p = new Vector3(...corner).project(camera);
    assert.ok(
      Math.abs(p.x) <= 1 / 1.1 + 1e-7,
      `x ${p.x} outside padded frustum`,
    );
    assert.ok(
      Math.abs(p.y) <= 1 / 1.1 + 1e-7,
      `y ${p.y} outside padded frustum`,
    );
    assert.ok(p.z > -1 && p.z < 1, `z ${p.z} outside clip range`);
  }
  assert.ok(fit.nearDistance >= 0.1 - 1e-8);
  assert.ok(fit.farDistance < 500);
  return fit;
}

test("every whole-build study fits desktop and phone preview frusta with ten-percent margin", () => {
  for (const fixture of listBuildFixtures()) {
    const box = projectBounds(createBuildStudy(fixture.id).project);
    for (const aspect of [494 / 260, 316 / 260, 260 / 390, 2.8])
      for (const direction of [
        [1.2, 0.85, 1.35],
        [0, 0, 1],
        [0, 1, 0.0001],
      ] as V3[])
        assertFit(box, aspect, direction);
  }
  const glazed = createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    undefined,
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  );
  assertFit(projectBounds(glazed.project), 316 / 260, [1.2, 0.85, 1.35]);
  const rotated = buildGreenhouse(blank(), {
    width: 72,
    depth: 96,
    eaveHeight: 84,
    roofRise: 24,
    origin: [140, 24, -80],
    yaw: 38,
  });
  assertFit(projectBounds(rotated.project), 494 / 260, [1.2, 0.85, 1.35]);
});

test("fit preserves the target and view direction and accounts for depth perspective", () => {
  const box: PerspectiveBounds = { min: [-4, 0, -5], max: [4, 10, 5] },
    fit = assertFit(box, 0.7, [1, 1, 1]);
  assert.deepEqual(fit.target, [0, 5, 0]);
  near(fit.position[0] - fit.target[0], fit.position[1] - fit.target[1]);
  near(fit.position[0] - fit.target[0], fit.position[2] - fit.target[2]);
  assertFit(box, 0.7, [0.0003, 1, 0.0007]);
  const landscape = assertFit(box, 2, [1, 1, 1]);
  assert.ok(fit.distance > landscape.distance);
  const shifted: PerspectiveBounds = {
      min: box.min.map((v) => v + 1000) as V3,
      max: box.max.map((v) => v + 1000) as V3,
    },
    shiftedFit = assertFit(shifted, 0.7, [1, 1, 1]);
  near(shiftedFit.distance, fit.distance);
  shiftedFit.position.forEach((n, i) => near(n - fit.position[i], 1000));
});

test("point bounds and directly overhead views remain finite; invalid frusta fail clearly", () => {
  const point: PerspectiveBounds = { min: [7, 8, 9], max: [7, 8, 9] },
    f = fitPerspectiveBounds(point, {
      verticalFovDegrees: 38,
      aspect: 1,
      direction: [0, 1, 0],
      minDistance: 2,
    });
  assert.equal(f.distance, 2);
  assert.deepEqual(f.target, [7, 8, 9]);
  assert.deepEqual(f.position, [7, 10, 9]);
  for (const options of [
    { verticalFovDegrees: 0, aspect: 1, direction: [0, 0, 1] },
    { verticalFovDegrees: 38, aspect: 0, direction: [0, 0, 1] },
    { verticalFovDegrees: 38, aspect: 1, direction: [0, 0, 0] },
    { verticalFovDegrees: 38, aspect: 1, direction: [0, 0, 1], padding: 0.9 },
  ] as const)
    assert.throws(() =>
      fitPerspectiveBounds(point, {
        ...options,
        direction: [...options.direction] as V3,
      }),
    );
  assert.throws(() => boundsCorners({ min: [0, 0, 0], max: [-1, 1, 1] }));
  assert.throws(() => boundsCorners({ min: [NaN, 0, 0], max: [1, 1, 1] }));
});

test("full sampled lid travel fits the overlay-free phone and desktop area in each view", () => {
  const project = createBuildStudy("storage-banquette").project;
  const travel = reviewLidTravel(project, project.sections[0].id);
  const inches = unionBounds([...project.pieces.filter((p) => !p.offcut).map(bounds), travel.bounds]);
  const box = { min: inches.min.map((n) => n / 12) as V3, max: inches.max.map((n) => n / 12) as V3 };
  for (const [width, height] of [[390, 300], [1440, 620], [260, 300], [756, 340]]) {
    const viewport = motionViewport(width, height);
    for (const direction of [[1.2, .85, 1.35], [0, 0, 1], [0, 1, .0001]] as V3[]) {
      const fitted = fitPerspectiveBounds(box, { verticalFovDegrees: 38, aspect: width / height, direction, viewportInsets: viewport.insets });
      const camera = new PerspectiveCamera(38, width / height, .05, 500);
      camera.position.set(...fitted.position);
      camera.lookAt(new Vector3(...fitted.target));
      camera.updateMatrixWorld();
      for (const corner of boundsCorners(box)) {
        const p = new Vector3(...corner).project(camera);
        const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
        assert.ok(x >= viewport.safeRect.left && x <= viewport.safeRect.right, `${x} outside safe width`);
        assert.ok(y >= viewport.safeRect.top && y <= viewport.safeRect.bottom, `${y} outside safe height`);
      }
    }
  }
});

test("reserved viewport margins remain finite during mount and reject impossible fit options", () => {
  const small = motionViewport(1, 1);
  assert.ok(Object.values(small.insets).every((n) => n < .5));
  assert.throws(() => fitPerspectiveBounds({ min: [0, 0, 0], max: [1, 1, 1] }, {
    verticalFovDegrees: 38, aspect: 1, direction: [1, 1, 1], viewportInsets: { left: 0, right: .5, top: 0, bottom: 0 },
  }));
});
