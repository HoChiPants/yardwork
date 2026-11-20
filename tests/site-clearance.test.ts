import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, uid } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingToken,
  fitDesignToSiteClearance,
  previewIdeaRevision,
} from "../src/ideaBindings";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { reviewSiteClearance } from "../src/siteClearance";
import type { SiteClearance } from "../src/siteClearanceSchema";

function fixture() {
  const project = applyIdeaPlan(
    blank(),
    localIdeaPlan({
      prompt:
        "Three-section storage banquette 72 inches wide 24 inches deep with opening lids and no back",
    }),
  );
  const plane = {
    id: uid(),
    bindingId: project.ideaBindings[0].id,
    label: "Rear baseboard",
    side: "-Z",
    coordinate: -13,
    minimum: 3,
    top: 4,
  } satisfies SiteClearance;
  return { project: { ...project, siteClearances: [plane] }, plane };
}

test("a whole-project face can be saved before parts and checks hand-built motion after reopening", () => {
  const plane: SiteClearance = {
    id: uid(),
    bindingId: null,
    label: "Counter edge",
    side: "+Z",
    coordinate: 7,
    minimum: 1,
    top: 36,
  };
  const base = projectSchema.parse({ ...blank(), siteClearances: [plane] });
  assert.equal(reviewSiteClearance(base, plane).status, "empty");
  assert.ok(
    !validate(base).some(({ id }) => id === `site-clearance-${plane.id}`),
  );
  const drawer = part(
    "Hand-built drawer",
    "plywood",
    [4, 2, 4],
    [0, 10, 0],
    base.steps[0].id,
    "Bench",
  );
  const { project, plan } = saveMotionPlan(
    { ...base, pieces: [drawer] },
    {
      label: "Drawer travel",
      memberIds: [drawer.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
    },
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.ideaBindings, []);
  assert.equal(reviewSiteClearance(reopened, plane).status, "met");
  const review = reviewMotion(reopened, plan);
  assert.equal(review.siteFindings[0].status, "short");
  const stop = review.playbackLimit(0, 12);
  assert.ok(Math.abs(stop.travel - 4) < 0.0001);
  assert.equal(stop.siteFaceId, plane.id);
  assert.match(guideMarkdown(reopened), /Counter edge · Entire project/);
  assert.throws(
    () => fitDesignToSiteClearance(reopened, plane.id),
    /one saved design/,
  );
});

test("saved low face measures the actual design and moves every existing member by the precise shortfall", () => {
  const { project, plane } = fixture();
  const before = reviewSiteClearance(project, plane);
  assert.equal(before.gap, 1);
  assert.equal(before.shortfall, 2);
  assert.equal(before.status, "short");
  assert.ok(
    validate(project).some(
      (finding) => finding.id === `site-clearance-${plane.id}`,
    ),
  );
  const moved = fitDesignToSiteClearance(project, plane.id);
  assert.equal(reviewSiteClearance(moved, plane).gap, 3);
  assert.deepEqual(
    moved.pieces,
    project.pieces.map((p) => ({
      ...p,
      position: [p.position[0], p.position[1], p.position[2] + 2],
    })),
  );
  assert.deepEqual(moved.siteClearances, project.siteClearances);
  const guide = generateBuildGuide(moved);
  assert.ok(guideIsCurrent(guide));
  assert.match(
    guideMarkdown(guide),
    /Rear baseboard .*3 in from the face.*minimum met/,
  );
  assert.equal(
    guideIsCurrent({ ...guide, siteClearances: [{ ...plane, minimum: 4 }] }),
    false,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(moved))),
    moved,
  );
});

test("low faces intersect tilted retained edges instead of using full-height box extents", () => {
  const { project, plane } = fixture();
  const [base] = project.pieces;
  const piece = {
    ...base,
    size: [2, 10, 2] as const,
    position: [0, 5, 0] as const,
    rotation: [0, 0, -Math.PI / 4] as const,
  };
  const isolated = {
    ...project,
    pieces: [
      {
        ...piece,
        size: [...piece.size],
        position: [...piece.position],
        rotation: [...piece.rotation],
      },
    ] as typeof project.pieces,
  };
  const full = reviewSiteClearance(isolated, {
    ...plane,
    side: "+X",
    coordinate: 0,
    top: null,
  });
  const low = reviewSiteClearance(isolated, {
    ...plane,
    side: "+X",
    coordinate: 0,
    top: 3,
  });
  assert.ok(Math.abs(full.gap! + 6 / Math.sqrt(2)) < 1e-9);
  assert.ok(Math.abs(low.gap! - (2 - Math.sqrt(2))) < 1e-9);
  assert.equal(
    reviewSiteClearance(isolated, { ...plane, top: 0.5 }).status,
    "outside-height",
  );
});

test("fitting refuses other entered gaps, work-zone crossings and overlap with loose wood", () => {
  const { project, plane } = fixture();
  assert.throws(
    () =>
      fitDesignToSiteClearance(
        {
          ...project,
          siteClearances: [
            plane,
            {
              ...plane,
              id: uid(),
              label: "Front",
              side: "+Z",
              coordinate: 14,
              minimum: 2,
              top: null,
            },
          ],
        },
        plane.id,
      ),
    /another recorded clearance/,
  );
  assert.throws(
    () =>
      fitDesignToSiteClearance(
        { ...project, workZone: { width: 96, depth: 26, height: 48 } },
        plane.id,
      ),
    /outside your work zone/,
  );
  const loose = part(
    "Loose wood",
    "stud",
    [2, 3, 2],
    [0, 1.5, 14],
    project.steps[0].id,
    "Temporary obstacle",
  );
  assert.throws(
    () =>
      fitDesignToSiteClearance(
        { ...project, pieces: [...project.pieces, loose] },
        plane.id,
      ),
    /overlaps wood/,
  );
});

test("an applied revision cannot worsen a measured gap and a detached target remains reviewable", () => {
  const { project, plane } = fixture();
  const positioned = fitDesignToSiteClearance(project, plane.id);
  const previousPlan = bindingPlan(positioned, plane.bindingId);
  const plan = localIdeaPlan({
    previousPlan,
    prompt: "Move the whole banquette 1 inch along -Z",
  });
  const token = bindingToken(positioned, plane.bindingId);
  assert.deepEqual(
    previewIdeaRevision(positioned, plane.bindingId, plan, token)
      .clearanceConflicts,
    [plane],
  );
  assert.throws(
    () => applyIdeaRevision(positioned, plane.bindingId, plan, token),
    /measured site clearance/,
  );
  assert.equal(
    reviewSiteClearance({ ...positioned, ideaBindings: [] }, plane).status,
    "missing",
  );
  const legacy = projectSchema.parse({
    ...positioned,
    schemaVersion: 11,
    siteClearances: undefined,
  });
  assert.equal(legacy.schemaVersion, positioned.schemaVersion);
  assert.equal(legacy.siteClearances, undefined);
  assert.deepEqual(legacy.pieces, positioned.pieces);
  const format39 = projectSchema.parse({ ...positioned, schemaVersion: 39 });
  assert.equal(format39.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(format39.siteClearances, [plane]);
});

test("an unrelated part already past a project face cannot mask an applied design's new shortfall", () => {
  const { project, plane } = fixture();
  const positioned = fitDesignToSiteClearance(project, plane.id);
  const workspaceFace = { ...plane, bindingId: null };
  const loose = part(
    "Unrelated shortfall",
    "stud",
    [1.5, 3, 1.5],
    [60, 1.5, -25],
    project.steps[0].id,
    "Loose",
  );
  const workspace = {
    ...positioned,
    pieces: [...positioned.pieces, loose],
    siteClearances: [workspaceFace],
  };
  assert.equal(reviewSiteClearance(workspace, workspaceFace).pieceId, loose.id);
  const previousPlan = bindingPlan(workspace, plane.bindingId);
  const plan = localIdeaPlan({
    previousPlan,
    prompt: "Move the whole banquette 1 inch along -Z",
  });
  const token = bindingToken(workspace, plane.bindingId);
  assert.deepEqual(
    previewIdeaRevision(workspace, plane.bindingId, plan, token)
      .clearanceConflicts,
    [workspaceFace],
  );
  assert.throws(
    () => applyIdeaRevision(workspace, plane.bindingId, plan, token),
    /measured site clearance/,
  );
});
