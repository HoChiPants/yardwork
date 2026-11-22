import assert from "node:assert/strict";
import test from "node:test";
import { endCutPlane } from "../src/cutProfiles";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import {
  motionPivotPreset,
  motionReviewHasLimits,
  motionReviewTravel,
  motionSetup,
  motionTestFindings,
  projectMotionReviews,
  removeMotionTestScenario,
  resolveMotionTestSetup,
  reviewMotion,
  runMotionTest,
  saveMotionPlan,
  saveMotionTestScenario,
  saveMotionTestSetup,
} from "../src/mechanismMotion";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { partLabel } from "../src/partLabels";
import { migrateLegacyProject } from "../src/projectVersion";
import { rotate } from "../src/spatial";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);

function panel(project: Project, name: string, size: V3, position: V3) {
  return part(
    name,
    "plywood",
    size,
    position,
    project.steps[0].id,
    "Motion test",
  );
}

test("measured site faces stop a bound door from both directions through a clear-ended swing", () => {
  const base = applyIdeaPlan(
    blank(),
    localIdeaPlan({ prompt: "Storage shelves 36 inches wide" }),
  );
  const leaf = panel(base, "Hinged cabinet door", [20, 2, 0.5], [10, 10, 60]);
  const face = {
    id: uid(),
    bindingId: base.ideaBindings[0].id,
    label: "Measured return wall",
    side: "+Z" as const,
    coordinate: 76,
    top: null,
    minimum: 1,
  };
  const { project, plan } = saveMotionPlan(
    {
      ...base,
      sections: base.sections.map((section, i) =>
        i === 0
          ? { ...section, pieceIds: [...section.pieceIds, leaf.id] }
          : section,
      ),
      pieces: [...base.pieces, leaf],
      siteClearances: [face],
    },
    {
      label: leaf.name,
      memberIds: [leaf.id],
      mechanism: {
        kind: "hinge",
        axis: [0, 1, 0],
        pivot: [0, 10, 60],
        travel: 180,
      },
    },
  );
  const old = structuredClone(project);
  const review = reviewMotion(project, plan);
  assert.equal(review.hits.length, 0);
  assert.equal(review.siteFindings[0].status, "short");
  for (const [from, to] of [
    [0, 180],
    [180, 0],
  ]) {
    assert.deepEqual(review.preview(from).siteFaceHits, []);
    const stop = review.playbackLimit(from, to);
    assert.equal(stop.siteFaceId, face.id);
    assert.ok(stop.travel > 45 && stop.travel < 135);
    assert.deepEqual(review.preview(stop.travel).siteFaceHits, []);
    const inspected = review.preview(
      stop.travel,
      stop.inspectAt,
      stop.siteFaceId,
    );
    assert.deepEqual(inspected.siteFaceHits, [face.id]);
    assert.equal(inspected.shownSiteFaceId, face.id);
  }
  assert.match(
    guideMarkdown(project),
    /Measured return wall .*clearance shortfall near/,
  );
  assert.deepEqual(project, old);
});

test("a linked slide crosses a narrow measured height band between clear endpoints", () => {
  const base = applyIdeaPlan(
    blank(),
    localIdeaPlan({ prompt: "Storage shelves 36 inches wide" }),
  );
  const traveler = panel(base, "Lift-out drawer", [2, 0.25, 2], [0, -5, 61]);
  const lead = panel(base, "Independent slide", [2, 2, 2], [-50, 30, 0]);
  const face = {
    id: uid(),
    bindingId: base.ideaBindings[0].id,
    label: "Measured toe kick",
    side: "+Z" as const,
    coordinate: 62,
    top: 0.125,
    minimum: 0.25,
  };
  const first = saveMotionPlan(
    {
      ...base,
      sections: base.sections.map((section, i) =>
        i === 0
          ? { ...section, pieceIds: [...section.pieceIds, traveler.id] }
          : section,
      ),
      pieces: [...base.pieces, lead, traveler],
      siteClearances: [face],
    },
    {
      label: lead.name,
      memberIds: [lead.id],
      mechanism: { kind: "slide", axis: [1, 0, 0], travel: 20 },
    },
  );
  const { project, plan } = saveMotionPlan(first.project, {
    label: traveler.name,
    memberIds: [traveler.id],
    mechanism: { kind: "slide", axis: [0, 1, 0], travel: 10 },
  });
  assert.equal(reviewMotion(project, first.plan).site.length, 0);
  const linked = reviewMotion(project, first.plan, [], plan);
  assert.equal(linked.siteFindings[0].movingId, traveler.id);
  for (const [from, to, entry] of [
    [0, 20, 9.75],
    [20, 0, 10.5],
  ]) {
    assert.deepEqual(linked.preview(from).siteFaceHits, []);
    const stop = linked.playbackLimit(from, to);
    assert.ok(Math.abs(stop.travel - entry) < 0.001);
    assert.deepEqual(linked.preview(stop.travel).siteFaceHits, []);
    assert.deepEqual(linked.preview(stop.travel, stop.inspectAt).siteFaceHits, [
      face.id,
    ]);
  }
  const extraClearance = {
    ...project,
    siteClearances: [{ ...face, coordinate: 62.25 }],
  };
  const met = reviewMotion(extraClearance, first.plan, [], plan);
  assert.equal(met.site[0].status, "met");
  assert.equal(met.playbackLimit(0, 20).travel, 20);
});

test("two sliding assemblies can collide only while they move together", () => {
  const base = blank("Crossing drawers");
  const first = panel(base, "Drawer", [2, 2, 2], [-6, 10, 0]);
  const second = panel(base, "Tray", [2, 2, 2], [0, 10, -10]);
  const a = saveMotionPlan(
    { ...base, pieces: [first, second] },
    {
      label: first.name,
      memberIds: [first.id],
      mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
    },
  );
  const b = saveMotionPlan(a.project, {
    label: second.name,
    memberIds: [second.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const snapshot = structuredClone(b.project);
  assert.equal(reviewMotion(b.project, a.plan).hits.length, 0);
  assert.equal(reviewMotion(b.project, b.plan).hits.length, 0);
  const review = reviewMotion(b.project, a.plan, [], b.plan);
  assert.deepEqual(review.preview(0).interferenceIds, []);
  assert.deepEqual(review.preview(12).interferenceIds, []);
  assert.deepEqual(
    review.preview(6).pieces.map(({ position }) => position),
    [
      [0, 10, 0],
      [0, 10, 0],
    ],
  );
  assert.deepEqual(review.preview(6).interferenceIds, [first.id, second.id]);
  assert.deepEqual(review.preview(6).obstacleNames, [second.name]);
  assert.equal(review.hits[0].kind, "solid");
  near(review.hits[0].first, 4.806);
  for (const [from, to] of [
    [0, 12],
    [12, 0],
  ]) {
    const stop = review.playbackLimit(from, to);
    assert.ok(Math.abs(stop.travel - 6) < 1.2);
    assert.deepEqual(review.preview(stop.travel).interferenceIds, []);
    assert.deepEqual(
      review.preview(stop.travel, stop.inspectAt).interferenceIds,
      [first.id, second.id],
    );
  }
  assert.throws(
    () =>
      reviewMotion(b.project, a.plan, [{ plan: b.plan, travel: 1 }], b.plan),
    /own active moving parts/,
  );
  assert.deepEqual(b.project, snapshot);
  const saved = saveMotionTestSetup(b.project, a.plan.id, { linkedId: b.plan.id, held: [] });
  assert.match(guideMarkdown(saved), /Saved clearance test · Drawer · moves with Tray/);
  const renamed = saveMotionPlan(saved, { ...motionSetup(saved, a.plan), label: "Main drawer" }, a.plan.id);
  assert.deepEqual(renamed.plan.testSetup, { linkedId: b.plan.id, held: [] });
  assert.throws(() => saveMotionTestSetup(b.project, a.plan.id, {
    linkedId: b.plan.id, held: [{ motionId: b.plan.id, percent: 50 }],
  }), /distinct motions/);

  const wall = { ...b.project, workZone: { width: 40, height: 30, depth: 19 } };
  const limited = reviewMotion(wall, a.plan, [], b.plan);
  assert.ok(
    limited.zone.some(
      (hit) =>
        hit.movingId === second.id &&
        hit.label === "front" &&
        hit.inspectAt === 12,
    ),
  );
  const wallStop = limited.playbackLimit(8, 12);
  assert.ok(wallStop.travel > 11 && wallStop.travel < 12);
  assert.deepEqual(limited.preview(wallStop.travel).outsideZoneFaces, []);
  assert.deepEqual(
    limited.preview(wallStop.travel, wallStop.inspectAt).outsideZoneFaces,
    ["front"],
  );
});

test("a linked door and drawer use their own angles and distances and detect a mid-travel strike", () => {
  const base = blank("Door and drawer");
  const diagonal = 6 / Math.sqrt(2);
  const door = panel(base, "Door", [12, 5, 0.75], [6, 10, 0]);
  const drawer = panel(
    base,
    "Drawer",
    [1, 2, 1],
    [diagonal, 10, diagonal - 12],
  );
  const a = saveMotionPlan(
    { ...base, pieces: [door, drawer] },
    {
      label: door.name,
      memberIds: [door.id],
      mechanism: {
        kind: "hinge",
        axis: [0, 1, 0],
        pivot: [0, 10, 0],
        travel: 90,
      },
    },
  );
  const b = saveMotionPlan(a.project, {
    label: drawer.name,
    memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const review = reviewMotion(b.project, a.plan, [], b.plan);
  assert.deepEqual(review.preview(0).interferenceIds, []);
  assert.deepEqual(review.preview(45).interferenceIds, [door.id, drawer.id]);
  assert.deepEqual(review.preview(90).interferenceIds, []);
  assert.equal(review.hits[0].kind, "solid");
  const stop = review.playbackLimit(0, 90);
  assert.ok(stop.travel > 30 && stop.travel < 45);
  assert.deepEqual(review.preview(stop.travel).interferenceIds, []);
  assert.deepEqual(
    review.preview(stop.travel, stop.inspectAt).interferenceIds,
    [door.id, drawer.id],
  );
});

test("linked targets change the whole shared path and keep both mechanism ranges intact", () => {
  const project = blank("Cabinet access practice");
  const diagonal = 6 / Math.sqrt(2);
  const door = panel(project, "Cabinet door", [12, 5, 0.75], [6, 10, 0]);
  const drawer = panel(project, "Pull-out drawer", [1, 2, 1], [diagonal, 10, diagonal - 12]);
  const a = saveMotionPlan({ ...project, pieces: [door, drawer] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const b = saveMotionPlan(a.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const fullSetup = { linkedId: b.plan.id, held: [] };
  const full = runMotionTest(b.project, a.plan, fullSetup).review!;
  assert.ok(full.hits.length);
  assert.equal(motionReviewTravel(full), 90);

  const limited = {
    ...fullSetup,
    sequenceTargets: {
      selected: { kind: "hinge", travel: 40 } as const,
      companion: { kind: "slide", travel: 8 } as const,
    },
  };
  const result = saveMotionTestScenario(b.project, a.plan.id, "Limited together", limited);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(result.project)));
  const main = reopened.motionPlans![0];
  assert.deepEqual(main.testScenarios![0].setup, limited);
  assert.deepEqual(reopened.motionPlans!.map(({ mechanism }) => mechanism.travel), [90, 24]);
  const review = runMotionTest(reopened, main, limited).review!;
  assert.equal(motionReviewTravel(review), 40);
  assert.equal(motionReviewHasLimits(review), true);
  assert.deepEqual(review.hits, []);
  const halfway = review.preview(20);
  near(halfway.pieces.find(({ id }) => id === door.id)!.position[0], 6 * Math.cos(20 * Math.PI / 180));
  near(halfway.pieces.find(({ id }) => id === drawer.id)!.position[2], drawer.position[2] + 4);
  assert.equal(halfway.positionText, "Cabinet door 20° · Pull-out drawer 4 in");
  assert.equal(review.playbackLimit(0, 100).travel, 40);
  assert.equal(review.playbackLimit(40, 0).travel, 0);
  assert.match(guideMarkdown(reopened), /Limited together · moves with Pull-out drawer · Test targets · Cabinet door 40°, Pull-out drawer 8 in/);

  // A different ratio still needs a full sweep: each endpoint clears, but the parts cross in between.
  const changed = runMotionTest(reopened, main, {
    ...limited, sequenceTargets: {
      selected: { kind: "hinge", travel: 60 },
      companion: { kind: "slide", travel: 18 },
    },
  }).review!;
  assert.deepEqual(changed.preview(0).interferenceIds, []);
  assert.deepEqual(changed.preview(60).interferenceIds, []);
  assert.ok(changed.hits.some(({ kind }) => kind === "solid"));
  for (const [from, to] of [[0, 60], [60, 0]]) {
    const limit = changed.playbackLimit(from, to);
    assert.ok(limit.travel > 29 && limit.travel < 46);
    assert.deepEqual(changed.preview(limit.travel).interferenceIds, []);
  }
  const edited = { ...reopened, motionPlans: reopened.motionPlans!.map((plan) =>
    plan.id === b.plan.id ? { ...plan, mechanism: { ...b.plan.mechanism, travel: 6 } } : plan) };
  assert.match(runMotionTest(edited, main, limited).error!, /travel target for Pull-out drawer no longer fits/);
  assert.deepEqual(reopened.pieces.map(({ position }) => position), b.project.pieces.map(({ position }) => position));
});

test("a saved solo opening limit stops at the requested angle and preserves older test setups", () => {
  const source = blank("Door near a wall return");
  const door = panel(source, "Cabinet door", [12, 5, 0.75], [6, 10, 0]);
  const obstacle = panel(source, "Wall return", [0.6, 5, 0.6], [0, 10, 11.5]);
  const saved = saveMotionPlan({ ...source, pieces: [door, obstacle] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const legacy = projectSchema.parse(JSON.parse(JSON.stringify({ ...saved.project, schemaVersion: 134 })));
  const plan = legacy.motionPlans![0];
  assert.equal(legacy.schemaVersion, 135);
  assert.ok(runMotionTest(legacy, plan).review!.hits.length);
  const setup = { held: [], sequenceTargets: { selected: { kind: "hinge", travel: 75 } as const } };
  const updated = saveMotionTestSetup(legacy, plan.id, setup);
  assert.deepEqual(updated.motionPlans![0].testSetup, setup);
  const review = runMotionTest(updated, plan, setup).review!;
  assert.equal(motionReviewTravel(review), 75);
  assert.deepEqual(review.hits, []);
  assert.equal(review.playbackLimit(0, 90).travel, 75);
  assert.equal(review.preview(90).travel, 75);
  assert.match(guideMarkdown(updated), /Saved clearance test · Cabinet door · Test targets · Cabinet door 75°/);
});

test("opening order checks both motions with the correct held poses and reverses on closing", () => {
  const base = blank("Door in front of drawer");
  const door = panel(base, "Cabinet door", [12, 5, 0.75], [6, 10, 0]);
  const drawer = panel(base, "Pull-out drawer", [1, 2, 1], [5, 10, -8]);
  const swing = saveMotionPlan({ ...base, pieces: [door, drawer] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const slide = saveMotionPlan(swing.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const setup = { linkedId: swing.plan.id, held: [], openingOrder: "companion-first" as const };
  const saved = saveMotionTestSetup(slide.project, slide.plan.id, setup);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const selected = reopened.motionPlans!.find(({ id }) => id === slide.plan.id)!;
  assert.deepEqual(selected.testSetup, setup);
  const snapshot = JSON.stringify(reopened);
  const result = runMotionTest(reopened, selected, selected.testSetup);
  assert.ok(result.review, result.error);
  const review = result.review;
  assert.deepEqual(review.sequence?.map(({ plan }) => plan.label), [door.name, drawer.name]);
  assert.deepEqual(review.hits, []);
  const position = (progress: number, id: string, axis: number) => review.preview(progress).pieces.find((piece) => piece.id === id)!.position[axis];
  near(position(25, drawer.id, 2), -8);
  near(position(50, door.id, 2), 6);
  near(position(50, drawer.id, 2), -8);
  near(position(75, door.id, 2), 6);
  near(position(75, drawer.id, 2), 4);
  assert.deepEqual(review.playbackLimit(0, 100), { travel: 100 });
  assert.deepEqual(review.playbackLimit(100, 0), { travel: 0 });
  assert.deepEqual(review.playbackLimit(50, 0), { travel: 0 });
  assert.match(guideMarkdown(reopened), /opens in order: Cabinet door → Pull-out drawer\. Closing reverses the order\./);
  assert.equal(JSON.stringify(reopened), snapshot);

  const reversed = runMotionTest(reopened, selected, { ...setup, openingOrder: "selected-first" });
  assert.ok(reversed.review, reversed.error);
  assert.equal(reversed.review.hits[0].phase, 0);
  const close = reversed.review.playbackLimit(100, 0);
  assert.equal(close.phase, 0);
  assert.ok(close.travel > 0 && close.travel < 50);
  assert.deepEqual(reversed.review.preview(close.travel, close.inspectAt, undefined, close.phase).interferenceIds, [drawer.id, door.id]);
  assert.ok(reversed.review.playbackLimit(0, 100).travel < 50);
  assert.match(motionTestFindings(reopened, reversed)[0].detail, /near Pull-out drawer · .+ in/);

  const stop = panel(base, "Counter overhang", [1, 2, 0.5], [5, 10, 14]);
  const blocked = { ...reopened, pieces: [...reopened.pieces, stop] };
  const blockedResult = runMotionTest(blocked, selected, setup);
  assert.ok(blockedResult.review, blockedResult.error);
  const open = blockedResult.review.playbackLimit(0, 100);
  assert.equal(open.phase, 1);
  assert.ok(open.travel > 50 && open.travel < 100);
  assert.equal(blockedResult.review.preview(open.travel).interferenceIds.length, 0);
  assert.deepEqual(blockedResult.review.preview(open.travel, open.inspectAt, undefined, open.phase).interferenceIds, [drawer.id, stop.id]);
  assert.throws(() => saveMotionTestSetup(reopened, selected.id, { held: [], openingOrder: "companion-first" }));
});

test("a limited door-first test uses both physical targets and rejects stale travel", () => {
  const project = blank("Cabinet beside a wall");
  const door = panel(project, "Cabinet door", [12, 5, 0.75], [6, 10, 0]);
  const drawer = panel(project, "Pull-out drawer", [1, 2, 1], [5, 10, -8]);
  const wall = panel(project, "Wall return", [0.6, 5, 0.6], [0, 10, 11.5]);
  const stop = panel(project, "Counter edge", [1, 2, 0.5], [5, 10, 14]);
  const slide = saveMotionPlan({ ...project, pieces: [door, drawer, wall, stop] }, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const swing = saveMotionPlan(slide.project, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const setup = { linkedId: swing.plan.id, held: [], openingOrder: "companion-first" as const };
  const full = runMotionTest(swing.project, slide.plan, setup).review!;
  assert.equal(full.playbackLimit(0, 100).phase, 0);
  assert.ok(full.hits.some(({ obstacleId }) => obstacleId === wall.id));
  assert.ok(full.hits.some(({ obstacleId }) => obstacleId === stop.id));

  const targets = {
    selected: { kind: "slide", travel: 12.5 } as const,
    companion: { kind: "hinge", travel: 75 } as const,
  };
  const limited = { ...setup, sequenceTargets: targets };
  const saved = saveMotionTestScenario(swing.project, slide.plan.id, "Limited opening", limited);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved.project)));
  const plan = reopened.motionPlans!.find(({ id }) => id === slide.plan.id)!;
  const scenario = plan.testScenarios![0];
  assert.deepEqual(scenario.setup, limited);
  const review = runMotionTest(reopened, plan, scenario.setup).review!;
  const position = (progress: number, id: string) => review.preview(progress).pieces.find((piece) => piece.id === id)!.position;
  near(position(50, door.id)[0], 6 * Math.cos(75 * Math.PI / 180));
  near(position(50, drawer.id)[2], -8);
  near(position(100, door.id)[0], position(50, door.id)[0]);
  near(position(100, drawer.id)[2], 4.5);
  assert.deepEqual(review.hits, []);
  assert.deepEqual(review.playbackLimit(0, 100), { travel: 100 });
  assert.deepEqual(review.playbackLimit(100, 0), { travel: 0 });
  assert.match(guideMarkdown(reopened), /Limited opening.*Test targets · Cabinet door 75°, Pull-out drawer 12\.5 in/);
  assert.equal(reopened.motionPlans!.find(({ id }) => id === swing.plan.id)!.mechanism.travel, 90);
  assert.equal(plan.mechanism.travel, 24);

  const tooShallow = runMotionTest(reopened, plan, {
    ...limited, sequenceTargets: { companion: { kind: "hinge", travel: 50 } },
  }).review!;
  assert.ok(tooShallow.hits.some(({ phase, obstacleId }) => phase === 1 && obstacleId === door.id));
  const stale = {
    ...reopened,
    motionPlans: reopened.motionPlans!.map((motion) => motion.id === swing.plan.id
      ? { ...motion, mechanism: { ...motion.mechanism, travel: 70 } }
      : motion),
  };
  assert.match(runMotionTest(stale, plan, limited).error!, /travel target for Cabinet door no longer fits/);
  assert.match(guideMarkdown(stale), /Limited opening.*Needs review.*travel target for Cabinet door/);
  assert.throws(() => saveMotionTestSetup(stale, plan.id, limited), /target for Cabinet door/);
  assert.throws(() => saveMotionTestSetup(reopened, plan.id,
    { ...limited, openingOrder: undefined, linkedId: undefined }), /Choose a second motion/);
});

test("named clearance tests preserve both opening orders and recheck the current geometry", () => {
  const base = blank("Door in front of drawer");
  const door = panel(base, "Cabinet door", [12, 5, 0.75], [6, 10, 0]);
  const drawer = panel(base, "Pull-out drawer", [1, 2, 1], [5, 10, -8]);
  const swing = saveMotionPlan({ ...base, pieces: [door, drawer] }, {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [0, 10, 0], travel: 90 },
  });
  const slide = saveMotionPlan(swing.project, {
    label: drawer.name, memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const doorFirst = { linkedId: swing.plan.id, held: [], openingOrder: "companion-first" as const };
  const drawerFirst = { ...doorFirst, openingOrder: "selected-first" as const };
  const defaultSaved = saveMotionTestSetup(slide.project, slide.plan.id, drawerFirst);
  const first = saveMotionTestScenario(defaultSaved, slide.plan.id, "Open door first", doorFirst);
  const second = saveMotionTestScenario(first.project, slide.plan.id, "Open drawer first", drawerFirst);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(second.project)));
  const selected = reopened.motionPlans!.find(({ id }) => id === slide.plan.id)!;
  assert.deepEqual(reopened.pieces, slide.project.pieces);
  assert.deepEqual(selected.testSetup, drawerFirst);
  assert.deepEqual(selected.testScenarios, [first.scenario, second.scenario]);
  const results = projectMotionReviews(reopened).find(({ plan }) => plan.id === selected.id)!.scenarios;
  assert.deepEqual(results[0].result.review?.hits, []);
  assert.equal(motionTestFindings(reopened, results[0].result, true)[0]?.id, "clear");
  assert.ok(results[1].result.review?.hits[0]);
  assert.match(guideMarkdown(reopened), /Named clearance test · Open door first · opens in order: Cabinet door → Pull-out drawer/);
  assert.match(guideMarkdown(reopened), /Named clearance test · Open drawer first · opens in order: Pull-out drawer → Cabinet door/);

  const updated = saveMotionTestScenario(reopened, selected.id, "  open door first ", drawerFirst);
  assert.equal(updated.scenario.id, first.scenario.id);
  const updatedPlan = updated.project.motionPlans!.find(({ id }) => id === selected.id)!;
  assert.deepEqual(updatedPlan.testScenarios, [updated.scenario, second.scenario]);
  const trim = panel(base, "Counter overhang", [1, 2, 0.5], [5, 10, 14]);
  const changed = { ...reopened, pieces: [...reopened.pieces, trim] };
  const changedResult = projectMotionReviews(changed).find(({ plan }) => plan.id === selected.id)!.scenarios[0].result;
  assert.ok(changedResult.review?.hits.some(({ obstacleId }) => obstacleId === trim.id));
  const missing = { ...reopened, motionPlans: [selected] };
  assert.match(guideMarkdown(missing), /Named clearance test · Open door first · Needs review.*was removed/);
  const removedFirst = removeMotionTestScenario(missing, selected.id, first.scenario.id);
  const removedBoth = removeMotionTestScenario(removedFirst, selected.id, second.scenario.id);
  assert.equal(removedBoth.motionPlans![0].testScenarios, undefined);
  assert.deepEqual(removedBoth.motionPlans![0].testSetup, drawerFirst);
  assert.equal(selected.testScenarios!.length, 2);
});

test("a drawer moves as one assembly and hits a thin obstruction between clear endpoints", () => {
  const base = blank("Drawer clearance");
  const drawer = panel(base, "Drawer box", [8, 3, 4], [0, 10, 0]);
  const front = panel(base, "Drawer front", [8, 3, 0.75], [0, 10, 2.375]);
  const obstruction = panel(
    base,
    "Thin shelf lip",
    [8, 3, 0.04],
    [0, 10, 12.573],
  );
  const existing = {
    ...base,
    pieces: [drawer, front, obstruction],
    workZone: { height: 40, width: 40, depth: 36 },
  };
  const { project, plan } = saveMotionPlan(existing, {
    label: "Top drawer",
    memberIds: [drawer.id, front.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const saved = JSON.stringify(project);
  const result = reviewMotion(project, plan);
  assert.deepEqual(result.preview(0).interferenceIds, []);
  assert.deepEqual(result.preview(20).interferenceIds, []);
  assert.equal(result.hits[0].kind, "solid");
  assert.equal(result.hits[0].movingId, front.id);
  assert.equal(result.hits[0].obstacleId, obstruction.id);
  near(result.hits[0].first, 9.813);
  assert.ok(result.hits[0].closingAt > result.hits[0].inspectAt);
  assert.ok(
    result
      .preview(result.hits[0].closingAt)
      .interferenceIds.includes(obstruction.id),
  );
  assert.deepEqual(
    new Set(result.preview(result.hits[0].inspectAt).interferenceIds),
    new Set([front.id, obstruction.id]),
  );
  const opened = result.preview(20).pieces;
  assert.deepEqual(result.preview(20).guideLine, [
    [0, 10, 0],
    [0, 10, 20],
  ]);
  near(opened[0].position[2], 20);
  near(opened[1].position[2] - opened[0].position[2], 2.375);
  assert.ok(
    result.zone.some((hit) => hit.label === "front" && hit.inspectAt === 20),
  );
  assert.equal(JSON.stringify(project), saved);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(saved)).motionPlans,
    project.motionPlans,
  );
  assert.match(
    guideMarkdown(project),
    /Top drawer · Straight slide[\s\S]+Modeled interference[\s\S]+Work-zone limits exceeded at front/,
  );
});

test("a door swing finds a mid-arc obstruction while retaining geometry and restoring the exact closed pose", () => {
  const base = blank("Door clearance");
  const door = panel(base, "Door", [24, 30, 0.75], [12, 20, 0]);
  door.cutPlanes = [endCutPlane(door.size, 0, true, 18, 2)];
  const distance = 12 / Math.sqrt(2);
  const obstacle = panel(
    base,
    "Counter corner",
    [0.45, 10, 0.45],
    [distance, 20, distance],
  );
  const far = panel(base, "Cabinet", [10, 20, 10], [-15, 16, -18]);
  const closed = { ...base, pieces: [door, obstacle, far] };
  const { project, plan } = saveMotionPlan(closed, {
    label: "Door",
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      pivot: motionPivotPreset(closed, [door.id], "left"),
      axis: [0, 1, 0],
      travel: 90,
    },
  });
  const review = reviewMotion(project, plan);
  assert.deepEqual(review.preview(0).pieces, [door]);
  assert.deepEqual(review.preview(0).interferenceIds, []);
  assert.deepEqual(review.preview(90).interferenceIds, []);
  const hit = review.hits.find((row) => row.obstacleId === obstacle.id)!;
  assert.equal(hit.kind, "solid");
  assert.ok(hit.first > 40 && hit.first < 50);
  assert.ok(
    review.preview(hit.inspectAt).interferenceIds.includes(obstacle.id),
  );
  assert.deepEqual(review.preview(90).pieces[0].cutPlanes, door.cutPlanes);
  near(review.preview(90).pieces[0].position[2], 12);
  assert.deepEqual(review.preview(90).guideLine, [
    [0, 4.25, 0],
    [0, 35.75, 0],
  ]);
  assert.ok(review.bounds.max[2] > 17.99);
  const opening = review.playbackLimit(0, 90);
  const closing = review.playbackLimit(90, 0);
  assert.ok(opening.travel < closing.travel);
  assert.ok(review.preview(opening.travel, opening.inspectAt).atLimit);
  assert.ok(review.preview(closing.travel, closing.inspectAt).atLimit);
  near(review.playbackLimit(opening.travel, 0).travel, 0);

  const originalGuide = generateBuildGuide(closed);
  const edited = saveMotionPlan(originalGuide, {
    ...motionSetup(project, plan),
    label: "Check swing",
  });
  assert.equal(guideIsCurrent(edited.project), false);
});

test("hinge playback stops at a brief trim obstruction from either direction", () => {
  const base = blank("Door and trim swing");
  const door = panel(base, "Cabinet door", [24, 30, 0.75], [12, 18, 0]);
  const trim = panel(base, "Fixed trim", [0.75, 3, 0.75], [20.2820028858828, 18, 13.506899814717375]);
  trim.rotation = [0, -0.5875097009912037, 0];
  const saved = saveMotionPlan({ ...base, pieces: [door, trim] }, {
    label: "Cabinet door",
    memberIds: [door.id],
    mechanism: { kind: "hinge", pivot: [0, 18, 0], axis: [0, 1, 0], travel: 90 },
  });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved.project)));
  const result = reviewMotion(reopened, reopened.motionPlans![0]);
  assert.deepEqual(result.preview(0).interferenceIds, []);
  assert.deepEqual(result.preview(90).interferenceIds, []);
  assert.ok(result.preview(32.767).interferenceIds.includes(trim.id));
  assert.deepEqual(result.preview(33.5).interferenceIds, []);
  assert.ok(result.preview(34.557).interferenceIds.includes(trim.id));
  const opening = result.playbackLimit(0, 90);
  const closing = result.playbackLimit(90, 0);
  assert.ok(opening.travel > 32.74 && opening.travel < 32.767, `Opening stopped at ${opening.travel}°`);
  assert.ok(closing.travel > 34.557 && closing.travel < 35, `Closing stopped at ${closing.travel}°`);
  assert.ok(opening.inspectAt !== undefined);
  assert.ok(closing.inspectAt !== undefined);
  assert.ok(result.preview(opening.inspectAt).interferenceIds.includes(trim.id));
  assert.ok(result.preview(closing.inspectAt).interferenceIds.includes(trim.id));
  assert.deepEqual(result.preview(opening.travel).interferenceIds, []);
  assert.deepEqual(result.preview(closing.travel).interferenceIds, []);
  assert.deepEqual(result.preview(0).pieces, [door]);

  const clear = { ...reopened, pieces: [door, { ...trim, position: [trim.position[0] * 1.01, 18, trim.position[2] * 1.01] as V3 }] };
  const clearResult = reviewMotion(clear, reopened.motionPlans![0]);
  assert.equal(clearResult.playbackLimit(0, 90).travel, 90);
  assert.equal(clearResult.playbackLimit(90, 0).travel, 0);
});

test("hinged travel checks interior work-zone extrema, including a swing with both endpoints inside", () => {
  const project = blank();
  const door = panel(project, "Wide door", [24, 14, 0.75], [12, 15, 0]);
  project.pieces = [door];
  project.workZone = { width: 100, depth: 30, height: 40 };
  const saved = saveMotionPlan(project, {
    label: "Wide swing",
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      pivot: [0, 15, 0],
      axis: [0, 1, 0],
      travel: 180,
    },
  });
  const review = reviewMotion(saved.project, saved.plan);
  assert.deepEqual(review.hits, []);
  const front = review.zone.find((row) => row.label === "front")!;
  assert.ok(front.inspectAt > 85 && front.inspectAt < 95);
  assert.ok(review.bounds.max[2] > 24);
  near(review.preview(180).pieces[0].position[2], 0);
});

test("hinge presets follow a rotated reference leaf even when another moving part extends its bounds", () => {
  const project = blank("Rotated hinge setup");
  const leaf = panel(project, "Angled door", [24, 30, 0.75], [10, 20, 30]);
  leaf.rotation = [0.15, Math.PI / 6, -0.2];
  const handle = panel(project, "Door handle", [1, 3, 6], [25, 20, 24]);
  project.pieces = [leaf, handle];

  const memberIds = [leaf.id, handle.id];
  const worldDatum = (offset: V3) =>
    rotate(offset, leaf.rotation).map((value, i) => value + leaf.position[i]);
  const presets: Record<"left" | "right" | "back" | "front", V3> = {
    left: [-12, 0, 0],
    right: [12, 0, 0],
    back: [0, 0, -0.375],
    front: [0, 0, 0.375],
  };
  for (const edge of Object.keys(presets) as Array<keyof typeof presets>) {
    const expected = worldDatum(presets[edge]);
    motionPivotPreset(project, memberIds, edge, "moving-part").forEach(
      (value, i) => near(value, expected[i]),
    );
  }
  assert.notDeepEqual(
    motionPivotPreset(project, memberIds, "left"),
    motionPivotPreset(project, memberIds, "left", "moving-part"),
  );

  const pivot = motionPivotPreset(project, memberIds, "left", "moving-part");
  const axis = rotate([0, 1, 0], leaf.rotation);
  const saved = saveMotionPlan(project, {
    label: leaf.name,
    memberIds,
    mechanism: { kind: "hinge", pivot, axis, travel: 90 },
  });
  const setup = motionSetup(projectSchema.parse(saved.project), saved.plan);
  assert.equal(setup.mechanism.kind, "hinge");
  setup.mechanism.pivot.forEach((value, i) => near(value, pivot[i]));
  setup.mechanism.axis.forEach((value, i) => near(value, axis[i]));
});

test("a saved mechanism follows its reference part and legacy file reads preserve the closed shape", () => {
  const project = blank();
  const door = panel(project, "Door", [24, 14, 0.75], [12, 15, 0]);
  project.pieces = [door];
  const from15 = projectSchema.parse({ ...project, schemaVersion: 15 });
  assert.deepEqual(from15.pieces, project.pieces);
  assert.equal(from15.motionPlans, undefined);
  const saved = saveMotionPlan(from15, {
    label: "Swing",
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      pivot: [0, 15, 0],
      axis: [0, 1, 0],
      travel: 90,
    },
  });
  const rotation: V3 = [0, Math.PI / 2, 0];
  const moved = {
    ...saved.project,
    pieces: [{ ...door, position: rotate(door.position, rotation), rotation }],
  };
  const setup = motionSetup(moved, saved.plan).mechanism;
  assert.equal(setup.kind, "hinge");
  near(setup.pivot[2], 0);
  const preview = reviewMotion(moved, saved.plan).preview(90);
  near(preview.pieces[0].position[0], 12);
  const absent = { ...moved, pieces: [] };
  assert.throws(
    () => reviewMotion(absent, saved.plan),
    /missing or has become an offcut/,
  );
  assert.match(guideMarkdown(absent), /Motion needs review/);
});

test("contact edges and virtual offcuts remain clear, while uncertain hardware is labeled as an envelope", () => {
  const project = blank();
  const moving = panel(project, "Drawer", [8, 4, 4], [0, 8, 0]);
  const wall = panel(project, "Cabinet side", [1, 4, 30], [4.5, 8, 10]);
  const spare = {
    ...panel(project, "Offcut", [4, 2, 1], [0, 8, 8]),
    offcut: true,
  };
  const rod = part(
    "Metal rod",
    "closet-rod-72",
    [1.3125, 5, 1.3125],
    [0, 8, 12],
    project.steps[0].id,
    "Motion test",
  );
  project.pieces = [moving, wall, spare, rod];
  const saved = saveMotionPlan(project, {
    label: "Drawer",
    memberIds: [moving.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 20 },
  });
  const result = reviewMotion(saved.project, saved.plan);
  assert.deepEqual(
    result.hits.map((row) => [row.obstacleId, row.kind]),
    [[rod.id, "envelope"]],
  );
  assert.equal(
    saveMotionPlan(
      saved.project,
      { ...motionSetup(saved.project, saved.plan), label: "Edited" },
      saved.plan.id,
    ).project.motionPlans?.length,
    1,
  );
  assert.throws(
    () =>
      saveMotionPlan(project, {
        ...motionSetup(saved.project, saved.plan),
        memberIds: [spare.id],
      }),
    /offcut/,
  );
});

test("a drawer can hit a neighboring door held open without changing either saved pose", () => {
  const base = blank("Cabinet clearance");
  const door = panel(base, "Neighbor door", [12, 12, 0.75], [6, 12, 0]);
  const drawer = panel(base, "Drawer", [4, 4, 4], [-2.1, 12, -7]);
  const project = { ...base, pieces: [door, drawer] };
  const swing = saveMotionPlan(project, {
    label: "Neighbor door",
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      axis: [0, 1, 0],
      pivot: [0, 12, 0],
      travel: 90,
    },
  });
  const slide = saveMotionPlan(swing.project, {
    label: "Drawer",
    memberIds: [drawer.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 24 },
  });
  const snapshot = JSON.stringify(slide.project);
  const closed = reviewMotion(slide.project, slide.plan);
  const open = reviewMotion(slide.project, slide.plan, [
    {
      plan: swing.plan,
      travel: 90,
    },
  ]);
  assert.deepEqual(closed.hits, []);
  assert.deepEqual(open.preview(0).interferenceIds, []);
  const stopped = open.playbackLimit(0, 24);
  assert.ok(stopped.travel < closed.playbackLimit(0, 24).travel);
  assert.deepEqual(open.preview(stopped.travel).interferenceIds, []);
  assert.deepEqual(
    new Set(open.preview(stopped.travel, stopped.inspectAt).interferenceIds),
    new Set([drawer.id, door.id]),
  );
  near(
    open.preview(stopped.travel).pieces.find((piece) => piece.id === door.id)!
      .position[2],
    6,
  );
  near(open.playbackLimit(stopped.travel, 0).travel, 0);
  const closing = open.playbackLimit(24, 0);
  assert.ok(closing.inspectAt! > open.hits[0].closingAt);
  assert.deepEqual(open.preview(closing.travel).interferenceIds, []);
  assert.deepEqual(
    open.preview(closing.travel, closing.inspectAt).interferenceIds,
    [drawer.id, door.id],
  );
  near(open.playbackLimit(0, 3).travel, 3);
  const partial = reviewMotion(slide.project, slide.plan, [
    {
      plan: swing.plan,
      travel: 45,
    },
  ]);
  near(
    partial.preview(0).pieces.find((piece) => piece.id === door.id)!
      .position[2],
    6 / Math.sqrt(2),
  );
  assert.throws(
    () =>
      reviewMotion(slide.project, slide.plan, [
        { plan: slide.plan, travel: 3 },
      ]),
    /its own active moving parts/,
  );
  assert.equal(JSON.stringify(slide.project), snapshot);

  const legacy = projectSchema.parse(migrateLegacyProject({ ...slide.project, schemaVersion: 67 }));
  assert.ok(legacy.motionPlans?.every(({ testSetup }) => !testSetup));
  const setup = { held: [{ motionId: swing.plan.id, percent: 100 }] };
  const saved = saveMotionTestSetup(legacy, slide.plan.id, setup);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.pieces, legacy.pieces);
  const active = reopened.motionPlans!.find(({ id }) => id === slide.plan.id)!;
  assert.deepEqual(active.testSetup, setup);
  const resolved = resolveMotionTestSetup(reopened, active.testSetup);
  assert.equal(resolved.held[0].travel, 90);
  const rerun = reviewMotion(reopened, active, resolved.held, resolved.linked);
  assert.equal(rerun.playbackLimit(0, 24).travel, stopped.travel);
  assert.match(guideMarkdown(reopened), /Saved clearance test · Drawer · Neighbor door held at 90°/);
  assert.ok(guideMarkdown(reopened).includes(`Modeled interference · ${partLabel(reopened, drawer.id)} against ${partLabel(reopened, door.id)}`));

  const moved = {
    ...reopened,
    pieces: reopened.pieces.map((piece) => piece.id === door.id
      ? { ...piece, position: [40, 12, 0] as V3 }
      : piece),
  };
  assert.doesNotMatch(guideMarkdown(moved), /Modeled interference ·/);
  const missing = { ...reopened, motionPlans: [active] };
  assert.match(guideMarkdown(missing), /Saved clearance test · Needs review.*was removed/);
  assert.throws(() => saveMotionTestSetup(missing, active.id, setup), /was removed/);
  assert.deepEqual(saveMotionTestSetup(missing, active.id).motionPlans, [slide.plan]);
});

test("playback finds different first obstructions with two independent parts held open", () => {
  const base = blank("Corner cabinet clearance");
  const drawer = panel(base, "Drawer", [4, 4, 4], [-2.1, 12, -7]);
  const door = panel(base, "Door", [12, 12, 0.75], [6, 12, 0]);
  const tray = panel(base, "Tray", [2, 4, 2], [5, 12, 17]);
  const slide = saveMotionPlan(
    { ...base, pieces: [drawer, door, tray] },
    {
      label: drawer.name,
      memberIds: [drawer.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 30 },
    },
  );
  const swing = saveMotionPlan(slide.project, {
    label: door.name,
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      axis: [0, 1, 0],
      pivot: [0, 12, 0],
      travel: 90,
    },
  });
  const { project, plan: trayPlan } = saveMotionPlan(swing.project, {
    label: tray.name,
    memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [-1, 0, 0], travel: 8 },
  });
  const held = [
    { plan: swing.plan, travel: 90 },
    { plan: trayPlan, travel: 8 },
  ];
  const review = reviewMotion(project, slide.plan, held);
  assert.deepEqual(
    review.hits.map((hit) => hit.obstacleId),
    [door.id, tray.id],
  );
  assert.deepEqual(review.preview(0).interferenceIds, []);
  assert.deepEqual(review.preview(30).interferenceIds, []);
  const open = review.playbackLimit(0, 30);
  const close = review.playbackLimit(30, 0);
  assert.deepEqual(
    review.preview(open.travel, open.inspectAt).interferenceIds,
    [drawer.id, door.id],
  );
  assert.deepEqual(
    review.preview(close.travel, close.inspectAt).interferenceIds,
    [drawer.id, tray.id],
  );
  near(review.playbackLimit(open.travel, 0).travel, 0);
  near(review.playbackLimit(close.travel, 30).travel, 30);

  const halfOpen = reviewMotion(project, slide.plan, [
    held[0],
    { ...held[1], travel: 4 },
  ]);
  const closingWithoutTray = halfOpen.playbackLimit(30, 0);
  assert.deepEqual(
    halfOpen.preview(closingWithoutTray.travel, closingWithoutTray.inspectAt)
      .interferenceIds,
    [drawer.id, door.id],
  );
  assert.throws(
    () => reviewMotion(project, slide.plan, [held[0], held[0]]),
    /its own active moving parts/,
  );
  assert.throws(
    () =>
      reviewMotion(project, slide.plan, [
        held[0],
        { ...held[1], plan: { ...trayPlan, memberIds: [door.id, tray.id] } },
      ]),
    /its own active moving parts/,
  );
  assert.deepEqual(project.pieces, [drawer, door, tray]);
});

test("a slide stops at the first contact even when a later thin obstacle has an earlier inspection pose", () => {
  const project = blank("Two close drawer stops");
  const moving = panel(
    project,
    "Thin sliding panel",
    [8, 2, 0.011],
    [0, 10, 0],
  );
  const first = panel(project, "First stop", [2, 2, 1], [-2, 10, 5.5]);
  const second = panel(project, "Second stop", [2, 2, 0.011], [2, 10, 5.015]);
  project.pieces = [moving, second, first];
  const saved = saveMotionPlan(project, {
    label: moving.name,
    memberIds: [moving.id],
    mechanism: { kind: "slide", axis: [0, 0, 1], travel: 10 },
  });
  const review = reviewMotion(saved.project, saved.plan);
  assert.deepEqual(
    review.hits.map((hit) => hit.obstacleId),
    [first.id, second.id],
  );
  assert.ok(review.hits[0].inspectAt > review.hits[1].inspectAt);
  const stop = review.playbackLimit(0, 10);
  assert.ok(stop.travel <= 5.0045 && stop.travel > 5.0043);
  assert.deepEqual(review.preview(stop.travel).interferenceIds, []);
  assert.deepEqual(
    review.preview(stop.travel, stop.inspectAt).interferenceIds,
    [moving.id, first.id],
  );
});

test("playback stops when crossing the room limit from either side of a swing", () => {
  const project = blank();
  const door = panel(project, "Door", [24, 14, 0.75], [12, 15, 0]);
  project.pieces = [door];
  project.workZone = { width: 100, depth: 30, height: 40 };
  const { project: saved, plan } = saveMotionPlan(project, {
    label: "Wide swing",
    memberIds: [door.id],
    mechanism: {
      kind: "hinge",
      pivot: [0, 15, 0],
      axis: [0, 1, 0],
      travel: 180,
    },
  });
  const review = reviewMotion(saved, plan);
  assert.deepEqual(review.preview(0).outsideZoneFaces, []);
  assert.deepEqual(review.preview(180).outsideZoneFaces, []);
  const opening = review.playbackLimit(25, 180);
  const closing = review.playbackLimit(160, 0);
  assert.ok(opening.travel > 30 && opening.travel < 45);
  assert.ok(closing.travel > 135 && closing.travel < 150);
  assert.deepEqual(review.preview(opening.travel).outsideZoneFaces, []);
  assert.deepEqual(
    review.preview(opening.travel, opening.inspectAt).outsideZoneFaces,
    ["front"],
  );
  assert.deepEqual(
    review.preview(closing.travel, closing.inspectAt).outsideZoneFaces,
    ["front"],
  );
  near(review.playbackLimit(opening.travel, 0).travel, 0);
});

test("measured hinge shift finds a middle obstruction while the closed and open poses stay clear", () => {
  const project = blank("Concealed hinge samples");
  const door = panel(project, "Door", [1, 2, 1], [0, 10, 0]);
  const trim = panel(project, "Trim", [4, 4, 0.4], [0, 10, 3.1]);
  project.pieces = [door, trim];
  const hinge = {
    kind: "hinge" as const, axis: [0, 1, 0] as V3, pivot: [0, 10, 0] as V3, travel: 90,
  };
  const baseline = saveMotionPlan(project, { label: door.name, memberIds: [door.id], mechanism: hinge });
  assert.equal(reviewMotion(project, baseline.plan).hits.length, 0);
  const saved = saveMotionPlan(project, {
    label: door.name, memberIds: [door.id],
    mechanism: { ...hinge, hingePath: [{ angle: 45, offset: [0, 0, 2.5] }, { angle: 90, offset: [0, 0, 0] }] },
  });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved.project)));
  const restored = reopened.motionPlans![0];
  const review = reviewMotion(reopened, restored);
  near(review.preview(22.5).pieces[0].position[2], 1.25);
  near(review.preview(67.5).pieces[0].position[2], 1.25);
  near(review.preview(45).guideLine[0][2], 2.5);
  assert.deepEqual(review.preview(0).interferenceIds, []);
  assert.deepEqual(review.preview(90).interferenceIds, []);
  assert.deepEqual(review.preview(45).interferenceIds, [door.id, trim.id]);
  assert.equal(review.hits[0].kind, "solid");
  const opening = review.playbackLimit(0, 90);
  const closing = review.playbackLimit(90, 0);
  assert.ok(opening.travel < 45 && opening.travel > 30);
  assert.ok(closing.travel > 45 && closing.travel < 60);
  near(reviewMotion(reopened, restored, [], undefined, 30).preview(30).pieces[0].position[2], 2.5 * 30 / 45);
  assert.match(guideMarkdown(reopened), /Measured hinge path[\s\S]*At 45°, datum offset · X 0 in, Y 0 in, Z 2\.5 in/);
  assert.deepEqual(reopened.pieces, project.pieces);
});

test("measured hinge translation is checked against the work zone and measured site bands", () => {
  const project = blank("Door against room and sill");
  const door = panel(project, "Shifting door", [1, 2, 1], [0, 10, 0]);
  project.pieces = [door];
  const saved = saveMotionPlan(project, {
    label: door.name, memberIds: [door.id],
    mechanism: {
      kind: "hinge", axis: [0, 1, 0], pivot: door.position, travel: 90,
      hingePath: [{ angle: 45, offset: [0, 0, 2.5] }, { angle: 90, offset: [0, 0, 0] }],
    },
  });
  const zone = reviewMotion({
    ...saved.project,
    workZone: { width: 12, depth: 6, height: 14 },
  }, saved.plan);
  assert.equal(zone.zone[0].label, "front");
  near(zone.zone[0].inspectAt, 45);
  assert.ok(zone.playbackLimit(0, 90).travel < 45);
  assert.ok(zone.playbackLimit(90, 0).travel > 45);

  const site = {
    id: uid(), bindingId: null, label: "Return wall",
    side: "+Z" as const, coordinate: 3.2, top: null, minimum: 0.2,
  };
  const withSite = reviewMotion({
    ...saved.project,
    siteClearances: [site, { ...site, id: uid(), top: 9.5 }],
  }, saved.plan);
  assert.equal(withSite.siteFindings.length, 2);
  assert.ok(withSite.siteFindings.every(({ status }) => status === "short"));
  assert.ok(withSite.playbackLimit(0, 90).siteFaceId);
  assert.ok(withSite.playbackLimit(90, 0).siteFaceId);
  const highBand = reviewMotion({
    ...saved.project,
    siteClearances: [{ ...site, top: 8 }],
  }, saved.plan);
  assert.equal(highBand.site[0].status, "outside-height");
  assert.equal(highBand.playbackLimit(0, 90).travel, 90);
});

test("measurements rotate with the moving part and must extend through the full opening", () => {
  const project = blank();
  const door = panel(project, "Door", [1, 2, 1], [0, 10, 0]);
  project.pieces = [door];
  const draft = {
    label: door.name, memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: door.position, travel: 90, hingePath: [{ angle: 90, offset: [0, 0, 2] }] },
  };
  assert.throws(() => saveMotionPlan(project, {
    ...draft,
    mechanism: { ...draft.mechanism, hingePath: [{ angle: 45, offset: [0, 0, 1] }] },
  }), /maximum opening angle/);
  const saved = saveMotionPlan(project, draft);
  const moved = { ...saved.project, pieces: [{ ...door, position: [20, 10, 0] as V3, rotation: [0, Math.PI / 2, 0] as V3 }] };
  const pose = reviewMotion(moved, saved.plan).preview(90).pieces[0];
  near(pose.position[0], 22);
  near(pose.position[2], 0);
});

test("a drawer can be blocked by a partly open shifting door and clear a fully open door", () => {
  const project = blank("Inner drawer and measured hinge");
  const door = panel(project, "Concealed hinge door", [1, 2, 1], [0, 10, 0]);
  const drawer = panel(project, "Inner drawer", [1, 2, 1], [0, 10, 4]);
  project.pieces = [door, drawer];
  const swing = saveMotionPlan(project, {
    label: door.name, memberIds: [door.id],
    mechanism: {
      kind: "hinge", axis: [0, 1, 0], pivot: door.position, travel: 90,
      hingePath: [{ angle: 45, offset: [0, 0, 2.5] }, { angle: 90, offset: [0, 0, 0] }],
    },
  });
  const slide = saveMotionPlan(swing.project, {
    label: drawer.name, memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, -1], travel: 2.6 },
  });
  const setup = { linkedId: slide.plan.id, openingOrder: "selected-first" as const, held: [] };
  const partly = runMotionTest(slide.project, swing.plan, {
    ...setup, sequenceTargets: { selected: { kind: "hinge", travel: 45 } },
  });
  const limit = partly.review!.playbackLimit(0, 100);
  assert.equal(limit.phase, 1);
  assert.ok(limit.travel > 50 && limit.travel < 100);
  assert.deepEqual(partly.review!.preview(limit.travel, limit.inspectAt, undefined, 1).interferenceIds, [drawer.id, door.id]);
  const fully = runMotionTest(slide.project, swing.plan, setup);
  assert.equal(fully.review!.hits.length, 0);
  assert.equal(fully.review!.playbackLimit(0, 100).travel, 100);
});

test("work-zone extrema include an interior angle between measured hinge readings", () => {
  const project = blank();
  const door = panel(project, "Door", [2, 2, 1], [0, 8, 0]);
  const { project: saved, plan } = saveMotionPlan({
    ...project, workZone: { width: 2.25, depth: 10, height: 12 }, pieces: [door],
  }, {
    label: door.name, memberIds: [door.id],
    mechanism: {
      kind: "hinge", axis: [0, 1, 0], pivot: door.position, travel: 90,
      hingePath: [{ angle: 90, offset: [0.2, 0, 0] }],
    },
  });
  const review = reviewMotion(saved, plan);
  assert.deepEqual(review.preview(0).outsideZoneFaces, []);
  assert.deepEqual(review.preview(90).outsideZoneFaces, []);
  const side = review.zone.find(({ label }) => label === "right")!;
  const angle = Math.atan2(0.5, 1) + Math.asin((0.2 / (Math.PI / 2)) / Math.hypot(1, 0.5));
  near(side.inspectAt, angle * 180 / Math.PI);
  assert.ok(review.playbackLimit(0, 90).travel < side.inspectAt);
});
