import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { guideMarkdown, shoppingCsv, validate } from "../src/engine";
import { blank, part, type Project, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import { reviewSunliteRoofBacking } from "../src/sunliteRoofBacking";
import { sunliteTakeoff } from "../src/sunliteTakeoff";

const sunlite = {
  greenhouseGlazing: {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  },
} as const;
const study = (rafterSpacing: number) =>
  createBuildStudy(
    "greenhouse",
    { ...defaultBuildStudyParameters("greenhouse"), rafterSpacing },
    blank(),
    sunlite,
  ).project;
const near = (n: number, expected: number) =>
  assert.ok(Math.abs(n - expected) < 1e-6, `${n} vs ${expected}`);

test("the check distinguishes mismatched rafters from short ridge terminations without changing quantities", () => {
  const tight = study(16),
    aligned = study(24);
  const [at16] = reviewSunliteRoofBacking(tight);
  const [at24] = reviewSunliteRoofBacking(aligned);
  assert.equal(at16.seams.length, 6);
  assert.equal(at24.seams.length, 6);
  assert.equal(
    at16.seams.filter(({ gaps }) => gaps.some(({ length }) => length > 40))
      .length,
    4,
  );
  assert.ok(
    at24.seams.every(({ gaps }) => gaps.length === 1 && gaps[0].length < 1.1),
  );
  const baseline = JSON.stringify(tight);
  const shopping = shoppingCsv(tight);
  const findings = validate(tight);
  const issue = findings.find(({ id }) =>
    id.startsWith("sunlite-roof-backing-"),
  )!;
  assert.equal(issue.area?.kind, "roof-seam-gap");
  assert.match(issue.detail, /Longest gap 43\.26662 in/);
  assert.match(
    guideMarkdown(tight),
    /SUNLITE roof seam backing[\s\S]+Gaps along seam 43\.26662 in/,
  );
  assert.equal(JSON.stringify(tight), baseline);
  assert.equal(shoppingCsv(tight), shopping);
});

test("actual added wood closes the gap while offcuts, a lower face and a plumb crossing do not", () => {
  const project = study(16);
  const check = reviewSunliteRoofBacking(project)[0].seams.find(({ gaps }) =>
    gaps.some(({ length }) => length > 40),
  )!;
  const seam = sunliteTakeoff(project)!.seams.find(
    ({ id }) => id === check.id,
  )!;
  const panel = project.pieces.find(({ id }) => id === seam.pieceIds[0])!;
  const direction = rotate([0, 0, 1], panel.rotation);
  const [a, b] = seam.points;
  const middle = a.map((n, i) => (n + b[i]) / 2) as V3;
  const center = middle.map(
    (n, i) => n - direction[i] * (8 / 25.4 / 2 + 1.75),
  ) as V3;
  const backing = part(
    "Test seam backer",
    "stud",
    [1.5, seam.length, 3.5],
    center,
    project.steps[0].id,
    "Backing",
    panel.rotation,
  );
  const review = (added: Project["pieces"]) =>
    reviewSunliteRoofBacking({
      ...project,
      pieces: [...project.pieces, ...added],
    })[0].seams.find(({ id }) => id === seam.id)!;
  assert.equal(review([backing]).gaps.length, 0);
  const trimmed = {
    ...backing,
    cutPlanes: [{ normal: [0, 1, 0] as V3, constant: 0 }],
  };
  near(review([trimmed]).gaps[0].length, seam.length / 2);
  const complementary = {
    ...backing,
    id: crypto.randomUUID(),
    cutPlanes: [{ normal: [0, -1, 0] as V3, constant: 0 }],
  };
  assert.equal(review([trimmed, complementary]).gaps.length, 0);
  const below = {
    ...backing,
    position: center.map((n, i) => n - direction[i] / 4) as V3,
  };
  const crossing = { ...backing, rotation: [0, 0, 0] as V3 };
  for (const piece of [below, crossing, { ...backing, offcut: true }])
    near(review([piece]).gaps[0].length, seam.length);
});

test("roof review stays attached to the saved panel geometry when the whole room is moved and rotated", () => {
  const project = study(16);
  const rotation: V3 = [0.11, 0.63, -0.1];
  const origin: V3 = [105, 30, -13];
  const pose = (position: V3) =>
    rotate(position, rotation).map((n, i) => n + origin[i]) as V3;
  const moved = {
    ...project,
    pieces: project.pieces.map((piece) => ({
      ...piece,
      position: pose(piece.position),
      rotation: composeRotation(rotation, piece.rotation),
    })),
    ideaBindings: project.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) => ({
        ...entry,
        pose: { origin, rotation },
      })),
    })),
  };
  const before = reviewSunliteRoofBacking(project)[0].seams;
  const after = new Map(
    reviewSunliteRoofBacking(moved)[0].seams.map((seam) => [seam.id, seam]),
  );
  assert.equal(after.size, before.length);
  for (const seam of before) {
    const candidate = after.get(seam.id)!;
    assert.equal(candidate.gaps.length, seam.gaps.length);
    for (const [index, gap] of seam.gaps.entries()) {
      near(candidate.gaps[index].length, gap.length);
      for (const [i, point] of gap.points.entries())
        pose(point).forEach((n, axis) =>
          near(candidate.gaps[index].points[i][axis], n),
        );
    }
  }
});

test("retained wood through-cuts interrupt backing without counting internal cell faces", () => {
  const project = study(16);
  const target = reviewSunliteRoofBacking(project)[0].seams.find(({ gaps }) =>
    gaps.some(({ length }) => length > 40),
  )!;
  const seam = sunliteTakeoff(project)!.seams.find(
    ({ id }) => id === target.id,
  )!;
  const panel = project.pieces.find(({ id }) => id === seam.pieceIds[0])!;
  const outward = rotate([0, 0, 1], panel.rotation);
  const center = seam.points[0].map(
    (value, i) =>
      (value + seam.points[1][i]) / 2 - outward[i] * (8 / 25.4 / 2 + 1.75),
  ) as V3;
  const backer = part(
    "Slotted backer",
    "stud",
    [1.5, seam.length, 3.5],
    center,
    project.steps[0].id,
    "",
    panel.rotation,
  );
  backer.rectangularOpenings = [{ axis: 2, center: [0, 0], spans: [0.8, 4] }];
  project.pieces.push(backer);
  const [gap] = reviewSunliteRoofBacking(project)[0].seams.find(
    ({ id }) => id === target.id,
  )!.gaps;
  near(gap.length, 4);
  backer.rectangularOpenings = [];
  assert.equal(
    reviewSunliteRoofBacking(project)[0].seams.find(
      ({ id }) => id === target.id,
    )!.gaps.length,
    0,
  );
});
