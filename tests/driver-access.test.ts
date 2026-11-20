import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import { reviewDriverAccess } from "../src/fastenerAccess";
import { previewFastenerContactRow } from "../src/fastenerContactRow";
import { fastenerReviews, saveFastenerPlan } from "../src/fastenings";
import {
  assignGuidePlacement,
  guidePlacementTargets,
  rekeyGuidePlacements,
} from "../src/guidePlacement";
import { generateBuildGuide } from "../src/guide";
import { part, projectSchema, uid, type Project, type V3 } from "../src/model";

const measured = {
  bitReach: 2,
  shaftWidth: 0.25,
  bodyWidth: 2,
  bodyLength: 4,
  approachTravel: 0,
};

function fixture(withAccess = true) {
  const base = createBuildStudy("storage-banquette").project;
  const first = base.sections[0].pieceIds;
  const members = base.pieces.filter((piece) => first.includes(piece.id));
  const head = members.find((piece) => piece.designRole === "storage-rear")!;
  const receiver = members.find((piece) => piece.designRole === "leg")!;
  const seed = previewFastenerContactRow(
    base,
    head.id,
    receiver.id,
    {
      count: 2,
      endInset: 2,
      beforeFloorPlacement: false,
    },
    { productId: "grk-cabinet-114069" },
  ).plan;
  const project = saveFastenerPlan(base, {
    ...seed,
    measurements: {
      surfaceToTipDepth: 1.125,
      pilotDiameter: 0.0625,
      pilotDepth: 1,
      basis: "Software clearance fixture",
      measuredAt: new Date().toISOString(),
    },
    ...(withAccess ? { driverAccess: measured } : {}),
  });
  const screw = fastenerReviews(project)[0].locations[0];
  const entry = screw.entranceWorld!;
  const drive = screw.driveWorld!;
  const place = (distance: number, size: V3 = [3, 3, 0.75]) =>
    part(
      "Rear access cover",
      "plywood",
      size,
      entry.map((value, axis) => value - drive[axis] * distance) as V3,
      base.steps[0].id,
      "Access cover",
    );
  return { project, place, seed, entry, drive };
}
const review = (project: Project) =>
  reviewDriverAccess(project, fastenerReviews(project))[0];
function add(project: Project, piece: ReturnType<typeof part>) {
  return { ...project, pieces: [...project.pieces, piece] };
}

test("a completed banquette screw path has a checked window before a later cover", () => {
  const { project, place } = fixture();
  assert.equal(fastenerReviews(project)[0].state, "path-reviewed");
  assert.equal(review(project).locations[0].state, "clear");
  const cover = place(4);
  const withCover = add(project, cover);
  const row = review(withCover).locations[0];
  assert.equal(review(withCover).order, "suggested");
  assert.equal(row.state, "before-stage");
  assert.match(row.detail, /Fit the storage shell.*before.*Rear access cover/);
  assert.deepEqual(row.blockerIds, [cover.id]);

  const guided = generateBuildGuide(withCover);
  assert.equal(review(guided).order, "saved");
  assert.equal(review(guided).locations[0].state, "before-stage");
  assert.match(
    guideMarkdown(guided),
    /Driver clearance and assembly order[\s\S]*Saved guide order[\s\S]*Rear access cover/,
  );
  assert.ok(
    validate(guided).some(
      (item) => item.id === `driver-access-${guided.fastenerPlans[0].id}`,
    ),
  );
  const reopenedAsCopy = rekeyGuidePlacements(guided, uid());
  assert.equal(review(reopenedAsCopy).order, "saved");
  const sameStage = guidePlacementTargets(withCover).find((stage) =>
    stage.memberIds.includes(withCover.fastenerPlans[0].head.pieceId),
  )!;
  const grouped = assignGuidePlacement(withCover, cover.id, {
    ownerId: sameStage.ownerId,
    stageKey: sameStage.stageKey,
  });
  assert.equal(review(grouped).locations[0].state, "within-stage");
  const coverStep = guided.pieces.find(
    (piece) => piece.id === cover.id,
  )!.stepId;
  const outOfOrder = {
    ...guided,
    steps: [
      guided.steps.find((step) => step.id === coverStep)!,
      ...guided.steps.filter((step) => step.id !== coverStep),
    ],
  };
  assert.equal(review(outOfOrder).locations[0].state, "blocked");
  assert.equal(fastenerReviews(outOfOrder)[0].state, "path-reviewed");
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(guided))).fastenerPlans[0]
      .driverAccess,
    measured,
  );
  const { project: earlier } = fixture(false);
  assert.equal(
    projectSchema.parse({ ...earlier, schemaVersion: 62 }).fastenerPlans[0]
      .driverAccess,
    undefined,
  );
});

test("retained through-cuts and the additional straight approach travel change clearance", () => {
  const { project, place } = fixture();
  const wall = place(4);
  const through = {
    ...wall,
    roundOpenings: [
      { axis: 2 as const, center: [0, 0] as [number, number], diameter: 2.9 },
    ],
  };
  assert.equal(review(add(project, through)).locations[0].state, "clear");
  const distant = add(project, place(7.5));
  assert.equal(review(distant).locations[0].state, "clear");
  const extended = saveFastenerPlan(distant, {
    ...distant.fastenerPlans[0],
    driverAccess: { ...measured, approachTravel: 2 },
  });
  assert.equal(review(extended).locations[0].state, "before-stage");
});

test("the modeled floor and a measured wall apply throughout the access window", () => {
  const { project, entry, drive } = fixture();
  assert.equal(Math.abs(drive[2]), 1);
  const wall = {
    id: uid(),
    bindingId: null,
    label: "Back room wall",
    side: drive[2] > 0 ? ("-Z" as const) : ("+Z" as const),
    coordinate: entry[2] - drive[2] * 2,
    top: null,
    minimum: 0,
  };
  const row = review({ ...project, siteClearances: [wall] }).locations[0];
  assert.equal(row.state, "blocked");
  assert.match(row.detail, /Back room wall/);
  const floorProject = createBuildStudy("storage-banquette").project;
  const members = floorProject.pieces.filter((p) =>
    floorProject.sections[0].pieceIds.includes(p.id),
  );
  const head = members.find((p) => p.designRole === "storage-bottom")!;
  const receiver = members.find((p) => p.designRole === "leg")!;
  const seed = previewFastenerContactRow(
    floorProject,
    head.id,
    receiver.id,
    {
      count: 2,
      endInset: 0.5,
      beforeFloorPlacement: true,
    },
    { productId: "grk-cabinet-114069" },
  ).plan;
  const withPlan = saveFastenerPlan(floorProject, {
    ...seed,
    driverAccess: measured,
  });
  assert.match(review(withPlan).locations[0].detail, /modeled floor/);
});
