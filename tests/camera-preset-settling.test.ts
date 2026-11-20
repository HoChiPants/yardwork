import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three-stdlib";
import {
  fitPerspectiveBounds,
  workshopViewOffset,
  WORKSHOP_MAX_POLAR_ANGLE,
} from "../src/cameraFit";

test("small Front preset animation reaches a destination allowed by the real orbit controls", () => {
  const target = new Vector3(0.175125, 0.5, 0),
    camera = new PerspectiveCamera(38, 390 / 660, 0.05, 500);
  camera.position.set(12, 9, 14);
  const controls = new OrbitControls(camera);
  controls.target.set(0, 3, 0);
  controls.maxPolarAngle = WORKSHOP_MAX_POLAR_ANGLE;
  controls.minDistance = 2;
  controls.maxDistance = 400;
  const fit = fitPerspectiveBounds(
    { min: [0, 0, -1 / 3], max: [4.203 / 12, 1, 1 / 3] },
    {
      verticalFovDegrees: 38,
      aspect: 390 / 660,
      direction: workshopViewOffset("front", 6),
      minDistance: 2,
    },
  );
  const destination = new Vector3(...fit.position);
  let reached = false;
  for (let frame = 0; frame < 600; frame++) {
    camera.position.lerp(destination, 1 / 12);
    controls.target.lerp(target, 1 / 12);
    controls.update();
    if (
      camera.position.distanceTo(destination) < 0.005 &&
      controls.target.distanceTo(target) < 0.005
    ) {
      reached = true;
      break;
    }
  }
  assert.ok(
    reached,
    "Front animation must stop instead of invalidating forever at the orbit limit",
  );
  camera.position.copy(destination);
  controls.target.copy(target);
  controls.update();
  assert.ok(camera.position.distanceTo(destination) < 1e-10);
  assert.ok(camera.position.y > controls.target.y);
  controls.dispose();
});

test("preset offsets retain top/iso behavior and place Front at the shared polar boundary", () => {
  assert.deepEqual(workshopViewOffset("top", 6), [0, 10.8, 0.01]);
  assert.deepEqual(
    workshopViewOffset("iso", 6),
    [7.199999999999999, 5.1, 8.100000000000001],
  );
  const front = new Vector3(...workshopViewOffset("front", 6));
  assert.ok(Math.abs(front.length() - 10.8) < 1e-12);
  assert.ok(
    Math.abs(Math.acos(front.y / front.length()) - WORKSHOP_MAX_POLAR_ANGLE) <
      1e-12,
  );
});
