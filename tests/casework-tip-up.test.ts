import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import {
  caseworkTipUpChoices,
  caseworkTipUpPreview,
  reviewCaseworkTipUp,
  saveCaseworkTipUp,
} from "../src/caseworkTipUp";
import { everbiltClosetRod } from "../src/closetRodReference";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { part, projectSchema, uid, type Project, type V3 } from "../src/model";
import { rotate } from "../src/spatial";
import type { CaseworkTipUpPlan } from "../src/caseworkTipUpSchema";

const front = {
  ceilingHeight: 96,
  stagingOffset: 0,
  restingFace: "front",
} as const;
const planFor = (
  project: Project,
  options: Omit<CaseworkTipUpPlan, "entryId"> = front,
) =>
  saveCaseworkTipUp(
    project,
    caseworkTipUpChoices(project)[0].entry.id,
    options,
  );

const check = (project: Project) =>
  reviewCaseworkTipUp(project, project.caseworkTipUpPlans![0]);

test("an 84-inch closet needs additional ceiling height during its swept quarter turn", () => {
  const base = createBuildStudy("closet-insert", undefined, undefined, {
    closetRod: {
      materialId: everbiltClosetRod.materialId,
      productRegistryRef: everbiltClosetRod.productId,
    },
  }).project;
  const low = planFor(base, { ...front, ceilingHeight: 85 });
  const blocked = check(low);
  assert.equal(blocked.uprightHeight, 84);
  assert.ok(Math.abs(blocked.peakHeight! - Math.hypot(84, 24)) < 1e-8);
  assert.equal(blocked.state, "blocked", blocked.detail);
  assert.match(blocked.detail, /Measured ceiling/);
  assert.deepEqual(base.pieces, low.pieces);
  const turn = blocked.legs[0];
  const pose = caseworkTipUpPreview(blocked, turn, turn.limit.travel, true);
  assert.ok(turn.limit.travel > 59 && turn.limit.travel < 62);
  assert.deepEqual(pose.obstacleNames, ["Measured ceiling"]);
  assert.equal(pose.hiddenPieceIds?.length, 6);
  assert.equal(pose.pieces.length, 6);
  assert.equal(pose.clearanceCeiling?.center[1], 85);
  assert.match(
    guideMarkdown(low),
    /Casework tip-up and placement[\s\S]*87\.36132 in[\s\S]*Measured ceiling/,
  );
  assert.ok(validate(low).some(({ id }) => id.startsWith("casework-tip-up-")));
  const tall = planFor(base);
  assert.equal(check(tall).state, "clear");
  const savedGuide = generateBuildGuide(tall);
  assert.equal(guideIsCurrent(savedGuide), true);
  assert.equal(
    guideIsCurrent({
      ...savedGuide,
      caseworkTipUpPlans: low.caseworkTipUpPlans,
    }),
    false,
  );
  const copy = projectSchema.parse(JSON.parse(JSON.stringify(tall)));
  assert.deepEqual(copy.caseworkTipUpPlans, tall.caseworkTipUpPlans);
  assert.equal(
    projectSchema.parse({ ...base, schemaVersion: 64 }).caseworkTipUpPlans,
    undefined,
  );
});

test("a back-down bookcase can be raised forward of its final position and slid back", () => {
  const base = createBuildStudy("shelves").project;
  const project = planFor(base, {
    ...front,
    restingFace: "back",
    stagingOffset: 84,
  });
  const report = check(project);
  assert.equal(report.state, "clear", report.detail);
  assert.equal(report.legs.length, 2);
  assert.equal(report.hiddenPieceIds.length, 3);
  const [turn, slide] = report.legs;
  assert.ok(
    caseworkTipUpPreview(report, turn, 0).pieces.every(
      (piece) => Math.abs(rotate([0, 1, 0], piece.rotation)[1]) < 1e-7,
    ),
  );
  const wall = {
    id: uid(),
    bindingId: null,
    label: "Rear wall",
    side: "-Z" as const,
    coordinate: -9,
    top: null,
    minimum: 0,
  };
  const againstWall = { ...base, siteClearances: [wall] };
  const withoutStaging = planFor(againstWall, {
    ...front,
    restingFace: "back",
    stagingOffset: 0,
  });
  assert.match(check(withoutStaging).detail, /Rear wall/);
  const awayFromWall = planFor(againstWall, {
    ...front,
    restingFace: "back",
    stagingOffset: 84,
  });
  assert.equal(check(awayFromWall).state, "clear");
  const placed = caseworkTipUpPreview(report, slide, slide.limit.travel).pieces;
  for (const piece of placed) {
    const original = base.pieces.find(({ id }) => id === piece.id)!;
    assert.deepEqual(piece.position, original.position);
    assert.deepEqual(piece.rotation, original.rotation);
  }
});

test("modeled obstacles stop either leg and a disconnected carcass asks for repair", () => {
  const base = createBuildStudy("closet-insert").project;
  const raised = planFor(base);
  const cabinet = part(
    "Hall cabinet",
    "plywood",
    [6, 4, 4],
    [39, 60, 70],
    base.steps[0].id,
    "Hall",
  );
  const hit = check({ ...raised, pieces: [...raised.pieces, cabinet] });
  assert.equal(hit.state, "blocked", hit.detail);
  assert.match(hit.detail, /Hall cabinet/);
  assert.equal(hit.legs.length, 1);
  const bracket = {
    ...cabinet,
    name: "Existing wall bracket",
    material: "bracket" as const,
  };
  const hardware = check({ ...raised, pieces: [...raised.pieces, bracket] });
  assert.equal(hardware.state, "blocked", hardware.detail);
  assert.match(hardware.detail, /Existing wall bracket/);
  const hardwareLeg = hardware.legs[0];
  assert.equal(
    caseworkTipUpPreview(hardware, hardwareLeg, hardwareLeg.limit.travel, true)
      .envelopeOnly,
    true,
  );
  const forward = planFor(base, { ...front, stagingOffset: 50 });
  const trim = part(
    "Tall trim projection",
    "plywood",
    [6, 10, 4],
    [39, 40, 25],
    base.steps[0].id,
    "Closet trim",
  );
  const slide = check({ ...forward, pieces: [...forward.pieces, trim] });
  assert.equal(slide.state, "blocked", slide.detail);
  assert.equal(slide.legs.length, 2);
  assert.match(slide.detail, /Slide.*Tall trim projection/);
  const detached = {
    ...raised,
    pieces: raised.pieces.map((piece) =>
      piece.designRole === "tower-left"
        ? {
            ...piece,
            position: [piece.position[0], piece.position[1], 70] as V3,
          }
        : piece,
    ),
  };
  const pending = check(detached);
  assert.equal(pending.state, "needs-review");
  assert.match(pending.detail, /separated/);
});
