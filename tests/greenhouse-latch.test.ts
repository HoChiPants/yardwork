import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import {
  greenhouseDoorChoices,
  greenhouseDoorMotionInput,
} from "../src/greenhouseDoors";
import {
  greenhouseLatchGuideLines,
  reviewGreenhouseLatch,
  saveGreenhouseLatch,
} from "../src/greenhouseLatch";
import type { GreenhouseLatchInput } from "../src/greenhouseLatchSchema";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { saveMotionPlan } from "../src/mechanismMotion";
import { part, projectSchema } from "../src/model";
import { toolChecklist } from "../src/tools";

function fixture(hingeSide: "left" | "right" = "left", glazing = false) {
  const base = createBuildStudy(
    "greenhouse",
    undefined,
    undefined,
    glazing
      ? {
          greenhouseGlazing: {
            materialId: "sunlite-8mm",
            productRegistryRef: "sunlite-132506",
          },
        }
      : {},
  ).project;
  const [{ entry }] = greenhouseDoorChoices(base);
  return saveMotionPlan(
    base,
    greenhouseDoorMotionInput(
      base,
      {
        entryId: entry.id,
        side: hingeSide,
        outset: 0,
        sideOffset: 0,
        kitId: "everbilt-24417-gate-kit",
      },
      90,
    ),
  );
}

const mount = {
  inset: 0.75,
  width: 1.25,
  height: 3,
  clearanceDepth: 1,
  reach: 0.8125,
  rise: 0,
  standout: 0.5,
  centers: [
    [0, -0.75],
    [0, 0.75],
  ] as [number, number][],
  pilotDepth: 1,
  screwDiameter: 0.25,
  screwDepth: 1.25,
};

const draft: GreenhouseLatchInput = {
  height: 40,
  keeperHeightOffset: 0,
  tolerance: 0.05,
  latch: mount,
  keeper: mount,
};

test("Everbilt latch and keeper use both jamb/leaf sides and export measured marks", () => {
  for (const hinge of ["left", "right"] as const) {
    const { project, plan: motion } = fixture(hinge);
    const saved = saveGreenhouseLatch(project, motion.id, draft);
    const [plan] = saved.greenhouseLatchPlans;
    const review = reviewGreenhouseLatch(saved, plan);
    assert.equal(
      review.state,
      "checked",
      JSON.stringify(
        review.mounts.map(({ issues, holes }) => [issues, holes.detail]),
      ),
    );
    assert.deepEqual(review.delta, [0, 0, 0]);
    assert.equal(plan.side, hinge === "left" ? "right" : "left");
    assert.equal(
      review.mounts[0].piece.name,
      "Greenhouse door opening · jack stud under header",
    );
    assert.ok(motion.memberIds.includes(plan.keeperId));
    assert.ok(!motion.memberIds.includes(plan.latchId));
    assert.deepEqual(
      review.mounts.map(({ holes }) => holes.marks.length),
      [2, 2],
    );
    assert.deepEqual(saved.pieces, project.pieces);
    assert.match(
      guideMarkdown(saved),
      /Greenhouse door latch layout[\s\S]*3\/16 in[\s\S]*Door keeper.*hole 2/,
    );
    const tools = toolChecklist(saved);
    assert.ok(
      tools.requirements
        .find(({ capability }) => capability === "drill-pilot")
        ?.sources.some(
          (source) =>
            source.kind === "greenhouse-latch" &&
            source.reason.includes("3/16 in"),
        ),
    );
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(saved)))
        .greenhouseLatchPlans,
      [plan],
    );
    assert.equal(
      projectSchema.parse({ ...project, schemaVersion: 61 })
        .greenhouseLatchPlans,
      undefined,
    );
    assert.equal(guideIsCurrent(generateBuildGuide(saved)), true);
    assert.equal(
      guideIsCurrent({
        ...generateBuildGuide(saved),
        greenhouseLatchPlans: [],
      }),
      false,
    );
  }
});

test("screw breakthrough, misalignment, and a physical obstruction withhold transfer marks", () => {
  const { project, plan: motion } = fixture();
  const saved = saveGreenhouseLatch(project, motion.id, {
    ...draft,
    keeper: { ...mount, rise: 0.25, screwDepth: 4 },
  });
  const [plan] = saved.greenhouseLatchPlans;
  const review = reviewGreenhouseLatch(saved, plan);
  assert.equal(review.state, "conflict");
  assert.deepEqual(review.delta, [0, 0.25, 0]);
  assert.match(
    review.mounts[1].holes.marks[0].issues.join(" "),
    /passes the back/,
  );
  assert.doesNotMatch(
    greenhouseLatchGuideLines(saved).join("\n"),
    /Door keeper.*hole 1/,
  );
  assert.ok(
    validate(saved).some(({ id }) => id === `greenhouse-latch-${motion.id}`),
  );

  const corrected = saveGreenhouseLatch(project, motion.id, {
    ...draft,
    keeperHeightOffset: -0.25,
    keeper: { ...mount, rise: 0.25 },
  });
  assert.equal(
    reviewGreenhouseLatch(corrected, corrected.greenhouseLatchPlans[0]).state,
    "checked",
  );
  const aligned = saveGreenhouseLatch(project, motion.id, draft);
  const [record] = aligned.greenhouseLatchPlans;
  const keeper = reviewGreenhouseLatch(aligned, record).mounts[1];
  const glazing = part(
    "Glazing in front of keeper",
    "sunlite-8mm",
    [4, 4, 0.315],
    [keeper.origin[0], keeper.origin[1], keeper.origin[2] + 0.16],
    project.steps[0].id,
    "Door",
  );
  const blocked = { ...aligned, pieces: [...aligned.pieces, glazing] };
  assert.match(
    reviewGreenhouseLatch(blocked, record).mounts[1].issues.join(" "),
    /Glazing in front of keeper/,
  );

  const other = fixture("right");
  const missing = { ...aligned, motionPlans: other.project.motionPlans };
  assert.equal(reviewGreenhouseLatch(missing, record).state, "stale");
});

test("a through-cut and the real glazed leaf are checked against mounting paths and working space", () => {
  const { project, plan: motion } = fixture("left", true);
  const saved = saveGreenhouseLatch(project, motion.id, draft);
  const [plan] = saved.greenhouseLatchPlans;
  const original = reviewGreenhouseLatch(saved, plan);
  assert.equal(original.state, "conflict");
  assert.match(
    original.mounts[1].issues.join(" "),
    /space in front.*Greenhouse door glazing/i,
  );
  const plain = fixture();
  const fitted = saveGreenhouseLatch(plain.project, plain.plan.id, draft);
  const [bound] = fitted.greenhouseLatchPlans;
  const piece = fitted.pieces.find((item) => item.id === bound.keeperId)!;
  const mark = reviewGreenhouseLatch(fitted, bound).mounts[1].holes.marks[0]
    .local;
  const cut = {
    ...piece,
    roundOpenings: [
      {
        axis: 2 as const,
        center: [mark[0], mark[1]] as [number, number],
        diameter: 0.375,
      },
    ],
  };
  const edited = {
    ...fitted,
    pieces: fitted.pieces.map((item) => (item.id === cut.id ? cut : item)),
  };
  const review = reviewGreenhouseLatch(edited, bound);
  assert.equal(review.state, "conflict", review.detail);
  assert.match(review.mounts[1].issues.join(" "), /through-cut/);
});
