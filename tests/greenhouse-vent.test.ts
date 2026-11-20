import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  evaluateBuildFixture,
  fixtureCutTable,
} from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import {
  reviewGreenhouseVentBacking,
  ventBackingGuideLines,
} from "../src/greenhouseVentBacking";
import { reviewSunliteRoofBacking } from "../src/sunliteRoofBacking";
import { sunliteTakeoff } from "../src/sunliteTakeoff";
import {
  greenhouseVentChoices,
  greenhouseVentMotionInput,
  greenhouseVentReview,
} from "../src/greenhouseVents";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { defaultGreenhouseRoofVent } from "../src/recipeSchemas";
import { prepareCollisionSolid, solidOverlap } from "../src/solidCollision";
import { rotate } from "../src/spatial";
import { buildGreenhouse } from "../src/structures";

const glazing = {
  greenhouseGlazing: {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  },
} as const;
const defaults = defaultBuildStudyParameters("greenhouse");
const withVent = (side: "left" | "right" = "right") =>
  createBuildStudy(
    "greenhouse",
    { ...defaults, roofVent: { ...defaultGreenhouseRoofVent, side } },
    undefined,
    glazing,
  );

test("a real rafter bay has full-length original rafters, separate blocking, a sash, and four clear edges", () => {
  const original = createBuildStudy("greenhouse", defaults, undefined, glazing);
  for (const side of ["left", "right"] as const) {
    const study = withVent(side);
    const roles = study.structure!.geometryRoles;
    assert.equal(study.structure!.dimensions.roofVentOpeningWidth, 22.5);
    assert.equal(study.structure!.dimensions.roofVentOpeningLength, 24);
    assert.equal(roles["roof-vent-opening"].length, 2);
    assert.equal(roles["roof-vent-sash"].length, 5);
    const staticRoof = study.project.pieces.filter((piece) =>
      [
        ...roles["roof-framing"],
        ...roles["roof-vent-opening"],
        ...roles["glazing-roof-panels"],
      ].includes(piece.id),
    );
    const rafters = (project: typeof study.project) =>
      project.pieces
        .filter((piece) => piece.name.includes("plumb-cut rafter"))
        .map(({ position, size, cutPlanes }) => ({
          position,
          size,
          cutPlanes,
        }));
    assert.deepEqual(rafters(study.project), rafters(original.project));
    const sash = study.project.pieces.filter((piece) =>
      roles["roof-vent-sash"].includes(piece.id),
    );
    assert.equal(
      sash.filter(
        (piece) =>
          piece.stockLengthAxis === 1 && piece.material === "sunlite-8mm",
      ).length,
      1,
    );
    for (const piece of sash) {
      for (const fixed of staticRoof) {
        assert.equal(
          solidOverlap(
            prepareCollisionSolid(piece)!,
            prepareCollisionSolid(fixed)!,
          ),
          false,
          piece.name,
        );
      }
    }
    const cutRows = fixtureCutTable(study.project);
    for (const role of ["roof-vent-opening", "roof-vent-sash"])
      assert.ok(
        roles[role].every((id) =>
          cutRows.some((row) => row.partIds.includes(id) && row.stockFits),
        ),
      );
    const surroundings = study.project.pieces.filter((piece) =>
      /roof panel (above|below) vent/.test(piece.name),
    );
    const roofPanels = study.project.pieces.filter((piece) =>
      roles["glazing-roof-panels"].includes(piece.id),
    );
    assert.ok(
      roofPanels.every((piece) => piece.size[0] >= 12 && piece.size[0] <= 24),
    );
    assert.equal(surroundings.length, 2);
    assert.ok(
      surroundings.every(
        (piece) => piece.cutPlanes.length === 1 && piece.stockLengthAxis === 1,
      ),
    );
    const report = evaluateBuildFixture(study);
    assert.ok(
      !report.missingGeometry.some(
        (row) => row.id === "geometry.greenhouse-openings",
      ),
    );
    assert.equal(report.buildReady, false);
  }
});

test("the roof-aligned hinge moves the sash outwards and catches a middle-only obstruction", () => {
  const study = withVent();
  const id = greenhouseVentChoices(study.project)[0].entry.id;
  const { project, plan } = saveMotionPlan(
    study.project,
    greenhouseVentMotionInput(study.project, { entryId: id, outset: 0 }, 45),
  );
  const review = reviewMotion(project, plan);
  assert.deepEqual(review.hits, []);
  assert.equal(review.playbackLimit(0, 45).travel, 45);
  assert.equal(review.playbackLimit(45, 0).travel, 0);
  const nearLowerRail = review
    .preview(25)
    .pieces.find((piece) => piece.name.includes("lower rail"))!;
  const clearance = part(
    "Mid-swing obstruction",
    "plywood",
    [0.4, 0.4, 0.4],
    nearLowerRail.position,
    project.steps[0].id,
    "Test",
  );
  const blocked = reviewMotion(
    { ...project, pieces: [...project.pieces, clearance] },
    plan,
  );
  assert.deepEqual(blocked.preview(0).interferenceIds, []);
  assert.deepEqual(blocked.preview(45).interferenceIds, []);
  const stopped = blocked.playbackLimit(0, 45);
  assert.ok(stopped.travel > 8 && stopped.travel < 25);
  assert.ok(
    blocked
      .preview(stopped.travel, stopped.inspectAt)
      .interferenceIds.includes(clearance.id),
  );
  const altered = {
    ...project,
    pieces: project.pieces.filter((piece) => piece.id !== plan.memberIds[0]),
  };
  assert.match(greenhouseVentReview(altered, plan)!.warning!, /removed/);
  assert.throws(() => reviewMotion(altered, plan), /removed/);
  assert.match(guideMarkdown(project), /Top-hinged roof vent sash/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(project))).motionPlans,
    [plan],
  );
  assert.equal(project.supplies.length, 0);
});

test("a vent cannot overrun the supported span, cut a rafter or require a wider single glazing sheet", () => {
  const base = {
    width: 96,
    depth: 96,
    eaveHeight: 84,
    roofRise: 24,
    doorHeight: 65,
  };
  const build = (extras: Partial<Parameters<typeof buildGreenhouse>[1]>) =>
    buildGreenhouse(blank(), { ...base, ...extras }, glazing);
  assert.throws(
    () => build({ roofVent: { ...defaultGreenhouseRoofVent, bay: 32 } }),
    /rafter bay/,
  );
  assert.throws(
    () =>
      build({ roofVent: { ...defaultGreenhouseRoofVent, ridgeOffset: 45 } }),
    /full-depth rafters/,
  );
  assert.throws(
    () => build({ roofVent: defaultGreenhouseRoofVent, rafterSpacing: 40 }),
    /glazing is too narrow/,
  );
  const plain = createBuildStudy("greenhouse", defaults, undefined, glazing);
  assert.deepEqual(
    projectSchema.parse({ ...plain.project, schemaVersion: 21 }).pieces,
    plain.project.pieces,
  );
  assert.deepEqual(greenhouseVentChoices(plain.project), []);
});

test("partial fixed roof seams use their exact shared sections and retain the purchasing review status", () => {
  for (const side of ["left", "right"] as const) {
    const { project } = withVent(side);
    const estimate = sunliteTakeoff(project)!;
    const partial = estimate.seams.filter(
      ({ full, issue }) => !full && issue?.includes("Partial overlap"),
    );
    const review = reviewSunliteRoofBacking(project)[0];
    const checked = review.seams.filter((seam) => seam.partial);
    assert.equal(checked.length, 4);
    for (const seam of checked) {
      const source = partial.find(({ id }) => seam.id === id)!;
      assert.equal(seam.length, source.length);
      assert.ok(seam.gaps.every(({ length }) => length <= seam.length + 1e-7));
      assert.ok(!estimate.profileRuns.some(({ id }) => id === source.id));
      assert.ok(estimate.unresolvedSeams.some(({ id }) => id === source.id));
    }
    assert.equal(checked.filter(({ gaps }) => gaps.length).length, 2);
    assert.match(
      guideMarkdown(project),
      /Shared edge checked: 7\.89501 in.*Gaps along seam.*profile termination and flashing/,
    );
    assert.match(
      validate(project).find(({ id }) =>
        id.startsWith("sunlite-roof-backing-"),
      )!.detail,
      /Includes 4 partial edge overlaps/,
    );
  }
});

test("all four sash edges are checked against moving members and retain real cut gaps", () => {
  const { project, structure } = withVent();
  const sash = project.sections.find((row) =>
    row.pieceIds.includes(structure!.geometryRoles["roof-vent-sash"][0]),
  )!;
  const rail = project.pieces.find(
    (part) =>
      sash.pieceIds.includes(part.id) && part.name.includes("hinge rail"),
  )!;
  const panel = project.pieces.find(
    (part) =>
      sash.pieceIds.includes(part.id) && part.material === "sunlite-8mm",
  )!;
  const review = () => reviewGreenhouseVentBacking(project)[0];
  assert.deepEqual(
    new Set(review().edges.map(({ name }) => name)),
    new Set(["Ridge-side edge", "Front edge", "Eave-side edge", "Back edge"]),
  );
  assert.ok(review().edges.every(({ gaps }) => gaps.length === 0));

  // The same world-positioned rail cannot be backing once it is left in the fixed roof.
  sash.pieceIds = sash.pieceIds.filter((id) => id !== rail.id);
  const ridge = review().edges.find(({ name }) => name === "Ridge-side edge")!;
  assert.ok(Math.abs(ridge.gaps[0].length - rail.size[0]) < 1e-6);
  assert.equal(
    validate(project).find(({ id }) => id.startsWith("sunlite-vent-backing-"))
      ?.area?.kind,
    "vent-sash-gap",
  );
  assert.match(
    guideMarkdown(project),
    /Roof vent sash backing[\s\S]*Ridge-side edge.*Gaps 15\.25 in/,
  );

  sash.pieceIds.push(rail.id);
  assert.ok(review().edges.every(({ gaps }) => gaps.length === 0));
  panel.roundOpenings = [{ axis: 2, center: [0, 0], diameter: 0.25 }];
  assert.ok(review().edges.every(({ gaps }) => gaps.length === 0));
  panel.roundOpenings = [
    { axis: 2, center: [panel.size[0] / 2 - 0.05, 0], diameter: 0.25 },
  ];
  assert.match(
    ventBackingGuideLines(project, review()).join(" "),
    /through-cut changes the sash panel perimeter/,
  );
  assert.match(
    sunliteTakeoff(project)!.panels.find((row) =>
      row.issue?.includes("changes the panel perimeter"),
    )?.issue ?? "",
    /Measure the retained edge/,
  );
});

test("wood that travels with a sash does not close gaps in fixed roof backing", () => {
  const { project, structure } = withVent();
  const roof = reviewSunliteRoofBacking(project)[0];
  const target = roof.seams.find(
    ({ partial, gaps }) => partial && gaps.length,
  )!;
  const expected = target.gaps[0].length;
  const shared = sunliteTakeoff(project)!.seams.find(
    ({ id }) => id === target.id,
  )!;
  const panel = project.pieces.find(({ id }) => id === shared.pieceIds[0])!;
  const normal = rotate([0, 0, 1], panel.rotation);
  const position = shared.overlapPoints[0].map(
    (value, i) =>
      (value + shared.overlapPoints[1][i]) / 2 -
      normal[i] * (panel.size[2] / 2 + 0.75),
  ) as V3;
  const support = part(
    "Partial seam backer",
    "stud",
    [1.5, shared.length, 1.5],
    position,
    panel.stepId,
    "",
    panel.rotation,
  );
  project.pieces.push(support);
  const gaps = () =>
    reviewSunliteRoofBacking(project)[0].seams.find(
      ({ id }) => id === target.id,
    )!.gaps;
  assert.equal(gaps().length, 0);
  const sash = project.sections.find((row) =>
    row.pieceIds.includes(structure!.geometryRoles["roof-vent-sash"][0]),
  )!;
  sash.pieceIds.push(support.id);
  assert.ok(Math.abs(gaps()[0].length - expected) < 1e-6);
});
