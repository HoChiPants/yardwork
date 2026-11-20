import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { blank, part } from "../src/model";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import {
  fastenerMarkerPoints,
  type FastenerLayoutMarkerPreview,
} from "../src/FastenerMarkers";
import { FastenersPanel } from "../src/FastenersPanel";
import {
  fastenerLayoutDirection,
  fastenerLayoutFace,
  previewFastenerLayout,
} from "../src/fastenerLayout";

function fixture(count = 3, measured = true) {
  let project = blank("SYNTHETIC active fastener caption");
  project.pieces = [
    part(
      "Actual head panel",
      "plywood",
      [12, 72, 0.75],
      [0, 36, 0.375],
      project.steps[0].id,
      "Actual pair",
    ),
    part(
      "Actual receiving wood",
      "stud",
      [3.5, 72, 1.5],
      [0, 36, -0.75],
      project.steps[0].id,
      "Actual pair",
    ),
  ];
  let plan = makeFastenerPlan(
    project,
    project.pieces[0].id,
    project.pieces[1].id,
  );
  for (let i = 0; i < count; i++) {
    plan = addFastenerLocation(plan);
    const location = plan.locations.at(-1)!;
    location.entranceLocal = [0.123456789, i - Math.floor(count / 2), 0.375];
    location.driveLocal = [0, 0, -1];
  }
  if (measured)
    plan.measurements = {
      surfaceToTipDepth: 2.125,
      pilotDiameter: null,
      pilotDepth: null,
      basis: "SYNTHETIC geometry test, no installed screw",
      measuredAt: "2026-11-01T12:00:00.000Z",
    };
  project = saveFastenerPlan(project, plan);
  return {
    project,
    plan: project.fastenerPlans[0],
    review: fastenerReviews(project)[0],
  };
}

test("71 actual entrances and user-depth tips keep all IDs and coordinates while exactly one active qualified caption changes", () => {
  const { project, plan, review } = fixture(71),
    before = JSON.stringify(project);
  assert.equal(review.activePointCount, 71);
  assert.ok(review.locations.every((point) => point.tipWorld));
  for (const id of [null, plan.locations[35].id, plan.locations[70].id]) {
    const points = fastenerMarkerPoints(review, id),
      captioned = points.filter((point) => point.showLabel);
    assert.equal(points.length, 71);
    assert.deepEqual(
      points.map((p) => p.point.location.id),
      plan.locations.map((location) => location.id),
    );
    assert.deepEqual(
      points.map((p) => p.point.entranceWorld),
      review.locations.map((point) => point.entranceWorld),
    );
    assert.deepEqual(
      points.map((p) => p.point.tipWorld),
      review.locations.map((point) => point.tipWorld),
    );
    assert.equal(captioned.length, 1);
    assert.equal(captioned[0].point.location.id, id ?? plan.locations[0].id);
    assert.equal(
      captioned[0].label,
      `${plan.label}/${captioned[0].point.location.label}`,
    );
    for (let i = 0; i < points.length; i++)
      assert.equal(
        points[i].point,
        review.locations[i],
        "Caption state cannot replace reviewed path data.",
      );
  }
  assert.equal(JSON.stringify(project), before);
});

test("default caption falls back to the first actual entrance while a deliberately selected unknown entry has no invented caption or tip", () => {
  const seeded = fixture(2, false),
    draft = structuredClone(seeded.plan);
  draft.locations[0].entranceLocal = null;
  draft.locations[0].driveLocal = null;
  const project = saveFastenerPlan(seeded.project, draft),
    review = fastenerReviews(project)[0],
    before = JSON.stringify(project);
  const fallback = fastenerMarkerPoints(review);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].point.location.id, draft.locations[1].id);
  assert.equal(fallback[0].showLabel, true);
  assert.equal(fallback[0].point.tipWorld, null);
  assert.deepEqual(fallback[0].point.driveWorld, [0, 0, -1]);
  assert.equal(
    fastenerMarkerPoints(review, draft.locations[0].id).filter(
      (point) => point.showLabel,
    ).length,
    0,
  );
  const html = renderToStaticMarkup(
    createElement(FastenersPanel, {
      project,
      selectedPlanId: draft.id,
      focusedLocationId: null,
      onChange: () => assert.fail("Default focus cannot save the plan"),
      onBack: () => {},
    }),
  );
  const selected = html.match(
    /<select aria-label="Active screw location"[^>]*>([\s\S]*?)<\/select>/,
  )![1];
  assert.ok(
    selected.includes(`value="${draft.locations[1].id}" selected=""`),
    "The actual selector and default caption both choose F002, not the unknown F001.",
  );
  assert.equal(JSON.stringify(project), before);
});

test("missing, removed and another plan's same F label never select a different actual caption", () => {
  const { project, plan, review } = fixture(3),
    other = addFastenerLocation(
      makeFastenerPlan(project, project.pieces[0].id, project.pieces[1].id),
    );
  assert.equal(other.locations[0].label, plan.locations[0].label);
  assert.equal(
    fastenerMarkerPoints(review, other.locations[0].id).filter(
      (point) => point.showLabel,
    ).length,
    0,
  );
  const removedId = plan.locations[2].id;
  const changed = saveFastenerPlan(project, {
      ...plan,
      locations: plan.locations.slice(0, 2),
    }),
    nextReview = fastenerReviews(changed)[0];
  assert.equal(
    fastenerMarkerPoints(nextReview, removedId).filter(
      (point) => point.showLabel,
    ).length,
    0,
  );
  assert.equal(
    fastenerMarkerPoints(nextReview, null).filter((point) => point.showLabel)[0]
      .point.location.id,
    plan.locations[0].id,
  );
});

test("focus changes never resurrect withheld stale tips or reviewed depth intervals", () => {
  const { project, plan } = fixture(3);
  const stale = {
      ...project,
      pieces: project.pieces.filter(
        (piece) => piece.id !== plan.receiver.pieceId,
      ),
    },
    review = fastenerReviews(stale)[0],
    before = JSON.stringify(stale);
  assert.equal(review.state, "stale");
  for (const id of [null, ...plan.locations.map((location) => location.id)]) {
    const points = fastenerMarkerPoints(review, id);
    assert.ok(
      points.every(
        ({ point }) =>
          point.tipWorld === null &&
          point.headExitDepth === null &&
          point.receiverEnterDepth === null &&
          point.receiverExitDepth === null,
      ),
    );
    assert.ok(points.filter((point) => point.showLabel).length <= 1);
  }
  assert.equal(JSON.stringify(stale), before);
});

test("Repeat preview remains authoritative over saved focus and keeps seed/new/selected markers and exact transient coordinates", () => {
  const { project, plan } = fixture(1),
    face = fastenerLayoutFace(project, plan, plan.locations[0].id);
  const preview = previewFastenerLayout(project, plan, {
    seedLocationId: plan.locations[0].id,
    uLocal: fastenerLayoutDirection(face, 1),
    countU: 3,
    spacingU: 2,
    countV: 1,
    spacingV: null,
    basis: "SYNTHETIC explicit repeat for caption precedence",
  });
  const transient: FastenerLayoutMarkerPreview = {
    review: preview.review,
    seedLocationId: plan.locations[0].id,
    candidateIds: preview.candidateIds,
    selectedCandidateIds: [preview.candidateIds[1]],
    focusedCandidateId: null,
  };
  const before = JSON.stringify({ project, preview });
  const seed = fastenerMarkerPoints(
    preview.review,
    "an unrelated saved focus",
    transient,
  );
  assert.equal(
    seed.filter((point) => point.showLabel)[0].point.location.id,
    plan.locations[0].id,
  );
  const focused = fastenerMarkerPoints(preview.review, plan.locations[0].id, {
    ...transient,
    focusedCandidateId: preview.candidateIds[1],
  });
  assert.equal(focused.filter((point) => point.showLabel).length, 1);
  assert.equal(
    focused.filter((point) => point.showLabel)[0].point.location.id,
    preview.candidateIds[1],
  );
  assert.deepEqual(
    focused
      .filter((point) => point.candidate)
      .map((point) => point.point.location.id),
    preview.candidateIds,
  );
  assert.equal(focused.filter((point) => point.accepted).length, 1);
  assert.deepEqual(
    seed.map((point) => point.point.entranceWorld),
    focused.map((point) => point.point.entranceWorld),
  );
  assert.deepEqual(
    seed.map((point) => point.point.tipWorld),
    focused.map((point) => point.point.tipWorld),
  );
  assert.equal(JSON.stringify({ project, preview }), before);
});

test("accessible actual-location selection leaves disclosures, high-precision input and complete saved plan unchanged on render", () => {
  const { project, plan } = fixture(3),
    before = JSON.stringify(project),
    fail = () =>
      assert.fail(
        "A focus render cannot save, pick, preview or emit focus callbacks.",
      );
  const render = (id: string) =>
    renderToStaticMarkup(
      createElement(FastenersPanel, {
        project,
        selectedPlanId: plan.id,
        focusedLocationId: id,
        onFocusLocation: fail,
        onChange: fail,
        onBack: fail,
      }),
    );
  for (const id of [plan.locations[0].id, plan.locations[2].id]) {
    const html = render(id),
      selected = html.match(
        /<select aria-label="Active screw location"[^>]*>([\s\S]*?)<\/select>/,
      )![1];
    assert.ok(selected.includes(`value="${id}" selected=""`));
    assert.match(html, /value="0\.123456789"/);
    assert.match(html, /aria-label="Fastener location F001"/);
    assert.match(html, /aria-label="Fastener location F003"/);
    const first = html.match(
        /<details\b[^>]*aria-label="Fastener location F001"[^>]*>/,
      )?.[0],
      third = html.match(
        /<details\b[^>]*aria-label="Fastener location F003"[^>]*>/,
      )?.[0];
    assert.ok(first?.includes('open=""'));
    assert.ok(third && !third.includes('open=""'));
  }
  assert.equal(JSON.stringify(project), before);
});
