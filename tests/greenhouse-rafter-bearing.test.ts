import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { retainedWoodFaces } from "../src/connectionContacts";
import { guideMarkdown, validate } from "../src/engine";
import { reviewGreenhouseRafterBearing } from "../src/greenhouseRafterBearing";
import { part, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";

const glass = {
  greenhouseGlazing: {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  },
} as const;
const study = (glazed = false) =>
  createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    undefined,
    glazed ? glass : undefined,
  ).project;
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("the framing study shows edge-only eaves and the glazed study measures a gap even with flush ridge faces", () => {
  const standard = study();
  const glazed = study(true);
  for (const [project, expected] of [
    [standard, "edge"],
    [glazed, "gap"],
  ] as const) {
    const stamp = JSON.stringify(project);
    const [roof] = reviewGreenhouseRafterBearing(project);
    assert.equal(roof.rows.length, 10);
    for (const row of roof.rows) {
      assert.equal(row.eave.state, expected);
      assert.equal(row.ridge.state, "contact");
      assert.ok(row.ridge.patches[0].area > 6);
      if (expected === "gap") near(row.eave.gap!, 0.20997375328084);
    }
    const findings = validate(project);
    assert.equal(
      findings.find(({ id }) => id.startsWith("rafter-eave"))?.severity,
      "warning",
    );
    assert.equal(
      findings.find(({ id }) => id.startsWith("rafter-ridge"))?.severity,
      "info",
    );
    assert.match(
      guideMarkdown(project),
      /Greenhouse rafter joints[\s\S]+Ridge wood contact/,
    );
    assert.equal(JSON.stringify(project), stamp);
  }
});

test("a beveled block must both contact the real underside and sit on the wall plate", () => {
  const project = study(true);
  const target = project.pieces.find(
    ({ designRole, position }) =>
      designRole === "greenhouse-rafter" &&
      position[0] > 0 &&
      Math.abs(position[2]) < 15,
  )!;
  const plate = project.pieces.find(
    ({ designRole, position }) =>
      designRole === "greenhouse-eave-plate" && position[0] > 0,
  )!;
  const bottom = retainedWoodFaces(target).find(
    ({ normal }) => normal[1] < -0.5,
  )!;
  const top = retainedWoodFaces(plate).find(({ normal }) => normal[1] > 0.99)!;
  const blockHeight = 3;
  const center: V3 = [
    plate.position[0],
    top.points[0][1] + blockHeight / 2,
    target.position[2],
  ];
  const block = part(
    "Modeled bevel block",
    "one-four",
    [1.5, blockHeight, 1.5],
    center,
    project.steps[0].id,
    "Eave",
  );
  const normal = bottom.normal.map((v) => -v) as V3;
  block.cutPlanes = [
    {
      normal,
      constant: normal.reduce(
        (sum, v, i) => sum + v * (bottom.points[0][i] - center[i]),
        0,
      ),
    },
  ];
  project.pieces.push(block);
  const eave = () =>
    reviewGreenhouseRafterBearing(project)[0].rows.find(
      ({ id }) => id === target.id,
    )!.eave;
  assert.equal(eave().state, "contact");
  assert.deepEqual(eave().patches[0].supportIds, [block.id, plate.id]);
  block.size[1] -= 0.08;
  assert.equal(eave().state, "gap");
  block.size[1] += 0.08;
  block.offcut = true;
  assert.equal(eave().state, "gap");
});

test("ridge movement produces an exact separation and saved identifiers withstand renaming and an assembly transform", () => {
  const project = study();
  const ridge = project.pieces.find(
    ({ designRole }) => designRole === "greenhouse-ridge",
  )!;
  ridge.name = "Custom ridge member";
  ridge.position[0] += 0.25;
  const rot: V3 = [0.18, 0.47, 0.09],
    origin: V3 = [24, 18, -31];
  const entry = project.ideaBindings[0].entries[0];
  entry.pose = { origin, rotation: rot };
  project.pieces = project.pieces.map((piece) => ({
    ...piece,
    position: rotate(piece.position, rot).map((v, i) => v + origin[i]) as V3,
    rotation: composeRotation(rot, piece.rotation),
  }));
  const [roof] = reviewGreenhouseRafterBearing(project);
  const gaps = roof.rows.filter(({ ridge }) => ridge.state === "gap");
  assert.equal(gaps.length, 5);
  assert.ok(roof.rows.every(({ eave }) => eave.state === "edge"));
  gaps.forEach(({ ridge }) => near(ridge.gap!, 0.25));
});

test("untagged legacy roof members are matched within their saved greenhouse sections", () => {
  const project = study();
  for (const piece of project.pieces) delete piece.designRole;
  const [roof] = reviewGreenhouseRafterBearing(project);
  assert.equal(roof.rows.length, 10);
  assert.ok(
    roof.rows.every(
      ({ ridge, eave }) => ridge.state === "contact" && eave.state === "edge",
    ),
  );
});
