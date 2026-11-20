import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema, uid } from "../src/model";
import { saveBearingDecision } from "../src/bearingDecisions";
import { guideMarkdown } from "../src/engine";
import {
  clearBearingRemovalPath,
  saveBearingRemovalPath,
} from "../src/recordedRemoval";
import { reviewRemovalPath, type RemovalLeg } from "../src/removalMotion";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";

const lift: RemovalLeg = { axis: [0, 1, 0], travel: 2 };
const pull: RemovalLeg = { axis: [0, 0, 1], travel: 18 };

function setup() {
  const project = blank("Lift and pull shelf");
  const step = project.steps[0].id;
  const shelf = part(
    "Shelf",
    "plywood",
    [16, 0.75, 10],
    [0, 1.875, 0],
    step,
    "Casework",
  );
  const cleat = part(
    "Cleat",
    "stud",
    [1.5, 1.5, 7],
    [0, 0.75, 0],
    step,
    "Casework",
  );
  const obstruction = part(
    "Face trim",
    "stud",
    [8, 1.5, 2],
    [0, 4.25, 8],
    step,
    "Casework",
  );
  project.pieces = [shelf, cleat, obstruction];
  return { project, shelf, cleat, obstruction };
}

test("a measured wall changes clearance and requires an old removal test to be repeated", () => {
  const { project: fixture, shelf, cleat } = setup();
  const design = applyIdeaPlan(
    fixture,
    localIdeaPlan({ prompt: "Storage shelves 36 inches wide" }),
  );
  const base = {
    ...design,
    pieces: [shelf, cleat],
    sections: design.sections.map((section, i) =>
      i === 0 ? { ...section, pieceIds: [shelf.id, cleat.id] } : section,
    ),
  };
  const decision = saveBearingDecision(
    base,
    shelf.id,
    cleat.id,
    "Lift before sliding out.",
  );
  const noFace = saveBearingRemovalPath(decision, shelf.id, cleat.id, [
    lift,
    pull,
  ]);
  assert.equal(noFace.bearingDecisions![0].removalPath!.outcome, "clear");
  const face = {
    id: uid(),
    bindingId: design.ideaBindings[0].id,
    label: "Measured alcove wall",
    side: "+Z" as const,
    coordinate: 12,
    top: null,
    minimum: 1,
  };
  const measured = { ...noFace, siteClearances: [face] };
  assert.match(
    guideMarkdown(measured),
    /Retest required for the current model/,
  );
  const reviewed = reviewRemovalPath(measured, shelf.id, [lift, pull]);
  assert.equal(reviewed.segments[0].path.siteFindings.length, 0);
  assert.equal(reviewed.segments[1].path.siteFindings[0].status, "short");
  const stop = reviewed.playbackLimit(0, reviewed.total);
  assert.ok(Math.abs(stop.travel - 8) < 0.001);
  assert.equal(stop.siteFaceId, face.id);
  assert.deepEqual(
    reviewed.preview(stop.travel, stop.inspectAt, stop.siteFaceId).siteFaceHits,
    [face.id],
  );
  const retested = saveBearingRemovalPath(measured, shelf.id, cleat.id, [
    lift,
    pull,
  ]);
  assert.equal(retested.bearingDecisions![0].removalPath!.outcome, "blocked");
  assert.match(
    guideMarkdown(retested),
    /Modeled obstruction in the saved test/,
  );
});

test("a lift and pull uses the same continuous collision checks for both movements and the return", () => {
  const { project, shelf, obstruction } = setup();
  const before = structuredClone(project);
  const route = reviewRemovalPath(project, shelf.id, [lift, pull]);
  assert.deepEqual(
    route.segments.map(({ start, end }) => [start, end]),
    [
      [0, 2],
      [2, 20],
    ],
  );
  assert.deepEqual(route.segments[0].path.hits, []);
  const hit = route.segments[1].path.hits[0];
  assert.equal(hit.obstacleId, obstruction.id);
  assert.equal(hit.kind, "solid");
  assert.ok(Math.abs(hit.first - 2) < 0.02);
  assert.deepEqual(route.preview(0).pieces[0].position, shelf.position);
  assert.deepEqual(route.preview(2).pieces[0].position, [0, 3.875, 0]);
  assert.deepEqual(route.preview(20).pieces[0].position, [0, 3.875, 18]);
  assert.deepEqual(route.preview(0).bounds, route.preview(20).bounds);

  const forward = route.playbackLimit(0, 20);
  assert.ok(Math.abs(forward.travel - 4) < 0.02);
  assert.deepEqual(
    route.preview(forward.travel, forward.inspectAt).obstacleNames,
    ["Face trim"],
  );
  const back = route.playbackLimit(20, 0);
  assert.ok(Math.abs(back.travel - 16) < 0.03);
  assert.deepEqual(route.preview(back.travel, back.inspectAt).obstacleNames, [
    "Face trim",
  ]);
  assert.deepEqual(project, before);
});

test("clear single-leg paths and two-leg work-zone limits preserve the modeled installation", () => {
  const { project, shelf } = setup();
  project.pieces.pop();
  project.workZone = { width: 30, depth: 20, height: 6 };
  const vertical = reviewRemovalPath(project, shelf.id, [lift]);
  assert.deepEqual(vertical.playbackLimit(0, 2), { travel: 2 });
  assert.deepEqual(vertical.playbackLimit(2, 0), { travel: 0 });
  assert.deepEqual(vertical.segments[0].path.hits, []);
  const route = reviewRemovalPath(project, shelf.id, [lift, pull]);
  const result = route.playbackLimit(0, 20);
  assert.ok(Math.abs(result.travel - 7) < 0.03);
  assert.deepEqual(
    route.preview(result.travel, result.inspectAt).outsideZoneFaces,
    ["front"],
  );
  assert.throws(() => reviewRemovalPath(project, shelf.id, []), /one or two/);
  assert.throws(() =>
    reviewRemovalPath(project, shelf.id, [lift, { ...pull, travel: 241 }]),
  );
  assert.throws(
    () => reviewRemovalPath(project, shelf.id, [lift, pull, lift]),
    /one or two/,
  );
});

test("a saved path records the test outcome and asks for retest if obstacles, measurements or the work zone change", () => {
  const { project, shelf, cleat, obstruction } = setup();
  const original = saveBearingDecision(
    project,
    shelf.id,
    cleat.id,
    "Lift before sliding out.",
  );
  const legacy = projectSchema.parse({ ...original, schemaVersion: 29 });
  assert.equal(legacy.bearingDecisions![0].removalPath, undefined);
  assert.equal(
    legacy.bearingDecisions![0].note,
    original.bearingDecisions![0].note,
  );
  const saved = saveBearingRemovalPath(legacy, shelf.id, cleat.id, [
    lift,
    pull,
  ]);
  assert.equal(saved.bearingDecisions![0].removalPath?.outcome, "blocked");
  assert.match(
    guideMarkdown(saved),
    /Up 2 in, then Front 18 in · Modeled obstruction in the saved test/,
  );
  assert.deepEqual(saved.pieces, original.pieces);

  const moved = structuredClone(saved);
  moved.pieces.find(({ id }) => id === obstruction.id)!.position[0] += 30;
  assert.match(
    guideMarkdown(moved),
    /Up 2 in, then Front 18 in · Retest required for the current model/,
  );
  assert.equal(moved.bearingDecisions![0].removalPath?.outcome, "blocked");
  const cleared = saveBearingRemovalPath(moved, shelf.id, cleat.id, [
    lift,
    pull,
  ]);
  assert.equal(cleared.bearingDecisions![0].removalPath?.outcome, "clear");
  assert.match(
    guideMarkdown(cleared),
    /No modeled interference in the saved test/,
  );
  assert.match(
    guideMarkdown({
      ...cleared,
      workZone: { width: 40, depth: 30, height: 12 },
    }),
    /Retest required/,
  );
  const edited = structuredClone(cleared);
  edited.bearingDecisions![0].removalPath!.legs[1].travel = 12;
  assert.match(guideMarkdown(edited), /Front 1 ft · Retest required/);

  const renoted = saveBearingDecision(
    cleared,
    shelf.id,
    cleat.id,
    "Lift vertically first.",
  );
  assert.deepEqual(
    renoted.bearingDecisions![0].removalPath,
    cleared.bearingDecisions![0].removalPath,
  );
  assert.match(
    guideMarkdown(renoted),
    /No modeled interference in the saved test/,
  );
  const withoutPath = clearBearingRemovalPath(renoted, shelf.id, cleat.id);
  assert.equal(withoutPath.bearingDecisions![0].note, "Lift vertically first.");
  assert.doesNotMatch(guideMarkdown(withoutPath), /Removal path ·/);

  edited.pieces[0].position[1] += 1;
  assert.throws(
    () => saveBearingRemovalPath(edited, shelf.id, cleat.id, [lift]),
    /changed bearing contact/,
  );
  assert.match(
    guideMarkdown(edited),
    /The saved parts no longer bear on each other/,
  );
  assert.match(guideMarkdown(edited), /Front 1 ft · Retest required/);
});
