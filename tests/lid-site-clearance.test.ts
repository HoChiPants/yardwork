import { fitDesignToSiteClearance } from "../src/ideaBindings";
import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, uid, type Project } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { guideMarkdown } from "../src/engine";
import {
  lidPreview,
  reviewLidSiteClearances,
  reviewLidTravel,
} from "../src/lidMotion";
import { sweepLidSiteFaces } from "../src/lidSiteClearance";
import {
  gapToSiteFace,
  reviewSiteClearance,
  worldClearanceShape,
} from "../src/siteClearance";
import { hingePoseAroundAxis } from "../src/hinges";
import type { SiteClearance } from "../src/siteClearanceSchema";

function baseboardStudy() {
  const project = applyIdeaPlan(
    blank("Wall fit"),
    localIdeaPlan({
      prompt:
        "Three-section storage banquette 72 inches wide 24 inches deep with opening lids and no back",
    }),
  );
  const face: SiteClearance = {
    id: uid(),
    bindingId: project.ideaBindings[0].id,
    label: "Measured rear wall",
    side: "-Z",
    coordinate: -14,
    minimum: 1.75,
    top: null,
  };
  return { project: { ...project, siteClearances: [face] }, face };
}

test("a retained lid clears the closed placement and falls below its recorded minimum during travel", () => {
  const { project, face } = baseboardStudy();
  const before = JSON.stringify(project);
  assert.equal(reviewSiteClearance(project, face).status, "met");
  const section = project.sections[0];
  const review = reviewLidTravel(project, section.id);
  const hit = review.siteClearances[0];
  assert.equal(hit.status, "short");
  assert.ok(hit.angle! > 0);
  assert.ok(hit.gap! < face.minimum);
  const stop = review.playbackLimit(0, 75);
  assert.ok(stop.travel > 0 && stop.travel < hit.angle!);
  assert.deepEqual(review.preview(stop.travel).siteFaceHits, []);
  assert.deepEqual(review.preview(stop.travel, stop.inspectAt).siteFaceHits, [
    face.id,
  ]);
  assert.equal(review.playbackLimit(stop.travel, 0).travel, 0);
  assert.deepEqual(lidPreview(project, section.id, 0).siteFaceHits, []);
  const shown = lidPreview(project, section.id, hit.angle!);
  assert.equal(shown.shownSiteFaceId, face.id);
  assert.deepEqual(shown.siteFaceHits, [face.id]);
  assert.ok(
    Math.abs(
      gapToSiteFace(worldClearanceShape(shown.piece), face)! - hit.gap!,
    ) < 1e-8,
  );
  assert.match(
    guideMarkdown(project),
    /Lid swing at measured site faces[\s\S]+Measured rear wall[\s\S]+Clearance shortfall/,
  );
  assert.equal(JSON.stringify(project), before);
});

test("a workspace face checks lid motion without a saved design binding", () => {
  const { project, face } = baseboardStudy();
  const workspaceFace = { ...face, bindingId: null };
  const workspace = {
    ...project,
    ideaBindings: [],
    siteClearances: [workspaceFace],
  };
  const { id } = workspace.sections[0];
  const review = reviewLidTravel(workspace, id);
  assert.equal(review.siteClearances[0].status, "short");
  const stop = review.playbackLimit(0, 75);
  assert.ok(stop.travel > 0 && stop.travel < 75);
  assert.deepEqual(review.preview(stop.travel, stop.inspectAt).siteFaceHits, [
    face.id,
  ]);
});

test("continuous full-height projection finds a sub-degree interference that integer samples miss", () => {
  const project = blank();
  const p = part(
    "Edited lid",
    "plywood",
    [2, 2, 4],
    [0, 0, 0],
    project.steps[0].id,
    "Test",
  );
  const expectedAngle = (Math.atan(1 / 2) * 180) / Math.PI;
  const trueGap = 4 - Math.sqrt(5);
  const nearestIntegerGap = Math.min(
    ...[26, 27].map(
      (degrees) =>
        4 -
        2 * Math.cos((degrees * Math.PI) / 180) -
        Math.sin((degrees * Math.PI) / 180),
    ),
  );
  const face: SiteClearance = {
    id: uid(),
    bindingId: uid(),
    label: "Front face",
    side: "+Z",
    coordinate: 4,
    minimum: (trueGap + nearestIntegerGap) / 2,
    top: null,
  };
  for (let angle = 0; angle <= 75; angle++) {
    const pose = hingePoseAroundAxis(p, [0, 0, 0], [1, 0, 0], angle);
    assert.ok(gapToSiteFace(worldClearanceShape(pose), face)! >= face.minimum);
  }
  const hit = sweepLidSiteFaces(p, [0, 0, 0], [1, 0, 0], 75, [face])[0];
  assert.equal(hit.status, "short");
  assert.ok(Math.abs(hit.angle! - expectedAngle) < 1e-9);
  assert.ok(Math.abs(hit.gap! - trueGap) < 1e-9);
});

test("height bands omit unreachable obstacles, certify clear ones and flag a real shortfall", () => {
  const { project, face } = baseboardStudy();
  const planes: SiteClearance[] = [
    { ...face, top: 4 },
    { ...face, id: uid(), coordinate: -30, top: 26 },
    { ...face, id: uid(), top: 19 },
    { ...face, id: uid(), bindingId: uid() },
  ];
  const checks = reviewLidSiteClearances(
    { ...project, siteClearances: planes },
    project.sections[0].id,
  );
  assert.deepEqual(
    checks.map(({ status }) => status),
    ["outside-height", "met", "short"],
  );
  assert.deepEqual(
    lidPreview(
      { ...project, siteClearances: planes },
      project.sections[0].id,
      checks[2].angle!,
    ).siteFaceHits,
    [planes[2].id],
  );
});

test("a low-band tangency that cannot be certified stays unresolved", () => {
  const project = blank();
  const p = part(
    "Edited lid",
    "plywood",
    [2, 2, 4],
    [0, 5, 0],
    project.steps[0].id,
    "Test",
  );
  const face: SiteClearance = {
    id: uid(),
    bindingId: uid(),
    label: "Face",
    side: "+Z",
    coordinate: 4,
    minimum: 4 - Math.sqrt(5),
    top: 6,
  };
  const result = sweepLidSiteFaces(p, [0, 5, 0], [1, 0, 0], 75, [face])[0];
  assert.equal(result.status, "needs-review");
});

test("a missing moving member produces a guide review instead of a computed gap", () => {
  const { project } = baseboardStudy();
  const section = project.sections[0];
  const missing: Project = {
    ...project,
    pieces: project.pieces.filter(
      (piece) =>
        !section.pieceIds.includes(piece.id) || piece.designRole !== "seat-lid",
    ),
  };
  assert.match(
    guideMarkdown(missing),
    /Lid swing at measured site faces[\s\S]+section's lid is missing/,
  );
});

test("fitting the full-height face accounts for the worst opening pose of every lid", () => {
  const { project, face } = baseboardStudy();
  const moved = fitDesignToSiteClearance(project, face.id, true);
  assert.notDeepEqual(
    moved.ideaBindings[0].entries[0].pose,
    project.ideaBindings[0].entries[0].pose,
  );
  assert.deepEqual(
    moved.pieces.map((p) => p.id),
    project.pieces.map((p) => p.id),
  );
  assert.deepEqual(moved.siteClearances, project.siteClearances);
  for (const section of moved.sections) {
    const [motion] = reviewLidSiteClearances(moved, section.id);
    assert.equal(motion.status, "met");
    assert.ok(Math.abs(motion.gap! - face.minimum) < 1e-7);
  }
  assert.throws(
    () =>
      fitDesignToSiteClearance(
        {
          ...project,
          siteClearances: [
            face,
            { ...face, id: uid(), side: "+Z", coordinate: 14, minimum: 2 },
          ],
        },
        face.id,
        true,
      ),
    /another recorded clearance/,
  );
});
