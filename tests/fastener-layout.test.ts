import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  blank,
  part,
  projectSchema,
  type Project,
  type V3,
} from "../src/model";
import {
  makeFastenerPlan,
  addFastenerLocation,
  saveFastenerPlan,
  fastenerReviews,
  retainFastenerLabelHistory,
  refreshFastenerPlan,
  changeFastenerProduct,
} from "../src/fastenings";
import { type FastenerPlan } from "../src/fasteningSchema";
import {
  fastenerLayoutFace,
  fastenerLayoutDirection,
  previewFastenerLayout,
  appendFastenerLayout,
  fastenerLayoutReceipt,
  type FastenerLayoutSpec,
} from "../src/fastenerLayout";
import { rotate, composeRotation } from "../src/spatial";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";

const measured = {
  surfaceToTipDepth: 1.2,
  pilotDiameter: 0.0625,
  pilotDepth: 1.3,
  basis: "SYNTHETIC software numerical test only",
  measuredAt: "2026-11-15T12:00:00.000Z",
};
function fixture() {
  let project = blank("SYNTHETIC explicit draft layout");
  const head = part(
      "Same name",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, 0],
      project.steps[0].id,
      "",
    ),
    receiver = part(
      "Receiver",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, -0.953],
      project.steps[0].id,
      "",
    );
  project = { ...project, pieces: [head, receiver] };
  const empty = makeFastenerPlan(project, head.id, receiver.id, {
    notes: "  Existing custom instructions\nStay exact.  ",
  });
  project = saveFastenerPlan(project, empty);
  const draft = addFastenerLocation(project.fastenerPlans[0]);
  draft.locations[0].entranceLocal = [-3, 0, 0.3515];
  draft.locations[0].driveLocal = [0, 0, -1];
  const spec: FastenerLayoutSpec = {
    seedLocationId: draft.locations[0].id,
    uLocal: [1, 0, 0],
    countU: 3,
    spacingU: 2,
    countV: 1,
    spacingV: null,
    basis: "SYNTHETIC user software layout basis",
  };
  return { project, head, receiver, draft, spec };
}
const near = (a: readonly number[], b: readonly number[]) =>
  a.forEach((x, i) =>
    assert.ok(Math.abs(x - b[i]) < 1e-8, `${a} differs from ${b}`),
  );
const reviewed = (project: Project, draft: FastenerPlan) =>
  fastenerReviews(saveFastenerPlan(project, draft)).find(
    (row) => row.plan.id === draft.id,
  )!;

test("an unsaved complete seed previews ordinary points without duplicating the saved same-ID plan or consuming labels", () => {
  const { project, draft, spec } = fixture(),
    before = JSON.stringify(project),
    rawDraft = JSON.stringify(draft);
  const face = fastenerLayoutFace(project, draft, spec.seedLocationId),
    preview = previewFastenerLayout(project, draft, spec);
  near(face.normalLocal, [0, 0, 1]);
  assert.equal(face.kind, "stock");
  assert.equal(face.polygonLocal.length, 4);
  assert.equal(project.fastenerPlans[0].locations.length, 0);
  assert.equal(preview.review.locations.length, 3);
  assert.equal(preview.review.activePointCount, 3);
  assert.equal(preview.candidates.length, 2);
  assert.equal(preview.eligibleCount, 2);
  assert.equal(preview.pendingCount, 2);
  assert.deepEqual(
    preview.candidates.map((row) => row.location.entranceLocal),
    [
      [-1, 0, 0.3515],
      [1, 0, 0.3515],
    ],
  );
  assert.deepEqual(
    preview.candidates.map((row) => row.location.label),
    ["F002", "F003"],
  );
  assert.deepEqual(preview.existingEligibilityChanges, []);
  assert.equal(JSON.stringify(project), before);
  assert.equal(JSON.stringify(draft), rawDraft);
  assert.equal(preview.spec.reverseV, false);
  assert.equal(preview.spec.minimumFaceMargin, null);
});

test("explicit subset append preserves unsaved manual data, all old IDs/history/source and reserved skipped labels until ordinary Save", () => {
  const { project, draft, spec } = fixture();
  draft.measurements = { ...measured };
  draft.locations[0].name = "My manual seed";
  const preview = previewFastenerLayout(project, draft, { ...spec, countU: 4 }),
    before = JSON.stringify(project);
  const appended = appendFastenerLayout(project, draft, preview, [
    preview.candidates[2].id,
    preview.candidates[0].id,
  ]);
  assert.deepEqual(appended.locations[0], draft.locations[0]);
  assert.deepEqual(appended.locations.slice(1), [
    preview.candidates[0].location,
    preview.candidates[2].location,
  ]);
  assert.equal(appended.nextLocationNumber, 5);
  assert.deepEqual(appended.measurements, draft.measurements);
  assert.deepEqual(appended.referenceHistory, draft.referenceHistory);
  assert.deepEqual(appended.head, draft.head);
  assert.deepEqual(appended.receiver, draft.receiver);
  assert.ok(
    appended.notes.startsWith(draft.notes + "\n\nSoftware layout only"),
  );
  assert.ok(appended.notes.includes("Seed W001/F001"));
  assert.ok(
    appended.notes.includes(
      "not physical measurements or a manufacturer schedule",
    ),
  );
  assert.ok(appended.notes.includes("1/2,1/4"));
  assert.equal(JSON.stringify(project), before);
  assert.throws(
    () =>
      appendFastenerLayout(project, appended, preview, [
        preview.candidates[0].id,
      ]),
    /stale/,
  );
  const saved = saveFastenerPlan(project, appended);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(saved))),
    saved,
  );
  assert.deepEqual(saved.pieces, project.pieces);
  assert.deepEqual(saved.supplies, project.supplies);
  assert.equal(reviewed(project, appended).activePointCount, 3);
});

test("a selected receipt lists only accepted cells and exactly matches the additive note written by append", () => {
  const { project, draft, spec } = fixture(),
    preview = previewFastenerLayout(project, draft, { ...spec, countU: 4 }),
    selected = [preview.candidates[2].id, preview.candidates[0].id],
    before = JSON.stringify({ project, draft, preview }),
    receipt = fastenerLayoutReceipt(draft, preview, selected);
  assert.ok(preview.softwareNote.includes("appended cells 1/2,1/3,1/4"));
  assert.ok(receipt.note.includes("appended cells 1/2,1/4"));
  assert.ok(!receipt.note.includes("appended cells 1/2,1/3"));
  assert.equal(receipt.notes, draft.notes + "\n\n" + receipt.note);
  assert.equal(
    appendFastenerLayout(project, draft, preview, selected).notes,
    receipt.notes,
  );
  assert.equal(JSON.stringify({ project, draft, preview }), before);
});

test("a near3000-character draft can accept a smaller selected receipt even when the full generated receipt overflows", () => {
  const { project, draft, spec } = fixture();
  const initial = previewFastenerLayout(project, draft, { ...spec, countU: 4 }),
    singleLength = fastenerLayoutReceipt(draft, initial, [
      initial.candidates[0].id,
    ]).note.length;
  draft.notes =
    "original notes preserved exactly;" +
    "x".repeat(
      3000 - 2 - singleLength - "original notes preserved exactly;".length,
    );
  const preview = previewFastenerLayout(project, draft, { ...spec, countU: 4 }),
    selected = [preview.candidates[0].id],
    receipt = fastenerLayoutReceipt(draft, preview, selected),
    full = fastenerLayoutReceipt(draft, preview, preview.candidateIds);
  assert.equal(preview.noteFits, false);
  assert.equal(full.noteFits, false);
  assert.equal(receipt.noteFits, true);
  assert.equal(receipt.notes.length, 3000);
  assert.throws(
    () => appendFastenerLayout(project, draft, preview, preview.candidateIds),
    /3000-character/,
  );
  const appended = appendFastenerLayout(project, draft, preview, selected);
  assert.equal(appended.notes, receipt.notes);
  assert.ok(appended.notes.startsWith(draft.notes + "\n\n"));
  assert.equal(appended.locations.length, 2);
});

test("receipt presentation requires an explicit eligible subset without bypassing append's current-context guard", () => {
  const { project, draft, spec } = fixture(),
    preview = previewFastenerLayout(project, draft, spec),
    id = preview.candidates[0].id;
  for (const selected of [[], [id, id], ["unknown"]])
    assert.throws(() => fastenerLayoutReceipt(draft, preview, selected));
  const wrong = { ...draft, id: project.id };
  assert.throws(
    () => fastenerLayoutReceipt(wrong, preview, [id]),
    /associated/,
  );
  const tooWide = previewFastenerLayout(project, draft, {
    ...spec,
    spacingU: 8,
  });
  assert.equal(tooWide.candidates[0].eligible, false);
  assert.throws(
    () => fastenerLayoutReceipt(draft, tooWide, [tooWide.candidates[0].id]),
    /eligible/,
  );
  const changed = { ...draft, notes: "A late unsaved note" };
  assert.equal(fastenerLayoutReceipt(changed, preview, [id]).noteFits, true);
  assert.throws(
    () => appendFastenerLayout(project, changed, preview, [id]),
    /stale/,
  );
});

test("grid cells use explicit tangent axes, include the seed once, and reverseV flips only the second grid direction", () => {
  const { project, draft, spec } = fixture();
  const a = previewFastenerLayout(project, draft, {
    ...spec,
    countU: 2,
    countV: 2,
    spacingV: 2,
  });
  assert.deepEqual(
    a.candidates.map((row) => [row.row, row.column]),
    [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  );
  assert.deepEqual(
    a.candidates.map((row) => row.location.entranceLocal),
    [
      [-1, 0, 0.3515],
      [-3, 2, 0.3515],
      [-1, 2, 0.3515],
    ],
  );
  const b = previewFastenerLayout(project, draft, {
    ...spec,
    countU: 2,
    countV: 2,
    spacingV: 2,
    reverseV: true,
  });
  assert.deepEqual(
    b.candidates.map((row) => row.location.entranceLocal),
    [
      [-1, 0, 0.3515],
      [-3, -2, 0.3515],
      [-1, -2, 0.3515],
    ],
  );
});

test("the explicit axis helper normalizes a projected bevel tangent while preview rejects unprojected, zero and parallel vectors", () => {
  const { project, draft, spec } = fixture(),
    face = fastenerLayoutFace(project, draft, spec.seedLocationId);
  near(fastenerLayoutDirection(face, 0), [1, 0, 0]);
  near(fastenerLayoutDirection(face, 1, true), [0, -1, 0]);
  assert.throws(() => fastenerLayoutDirection(face, 2), /parallel/);
  assert.throws(() =>
    previewFastenerLayout(project, draft, { ...spec, uLocal: [0, 0, 0] }),
  );
  assert.throws(
    () =>
      previewFastenerLayout(project, draft, {
        ...spec,
        uLocal: [Math.SQRT1_2, 0, Math.SQRT1_2],
      }),
    /tangent/,
  );
  assert.throws(
    () => previewFastenerLayout(project, draft, { ...spec, uLocal: [2, 0, 0] }),
    /unit/,
  );
});

test("removed seed surfaces, sharp-edge seeds, missing coordinates, offcuts and nonwood members are refused without refresh", () => {
  const { project, draft, spec, head } = fixture();
  const edge = structuredClone(draft);
  edge.locations[0].entranceLocal = [5, 0, 0.3515];
  assert.throws(
    () => fastenerLayoutFace(project, edge, spec.seedLocationId),
    /seed path|unique retained/,
  );
  const incomplete = structuredClone(draft);
  incomplete.locations[0].driveLocal = null;
  assert.throws(
    () => fastenerLayoutFace(project, incomplete, spec.seedLocationId),
    /complete seed/,
  );
  for (const edit of [
    { offcut: true },
    { material: "roof" as const },
    { cutPlanes: [{ normal: [1, 0, 0] as V3, constant: -4 }] },
  ]) {
    const p = {
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === head.id ? { ...piece, ...edit } : piece,
      ),
    };
    assert.throws(
      () => fastenerLayoutFace(p, draft, spec.seedLocationId),
      /seed path|wood|references/,
    );
  }
});

test("a redundant coplanar cut boundary remains one face and a wholly unsaved plan can still preview without project writes", () => {
  const { project, head, receiver } = fixture();
  const p = {
    ...project,
    fastenerPlans: [],
    fastenerPlanLabels: [],
    pieces: project.pieces.map((piece) =>
      piece.id === head.id
        ? {
            ...piece,
            cutPlanes: [{ normal: [0, 0, 1] as V3, constant: 0.3515 }],
          }
        : piece,
    ),
  };
  const draft = addFastenerLocation(makeFastenerPlan(p, head.id, receiver.id));
  draft.locations[0].entranceLocal = [-3, 0, 0.3515];
  draft.locations[0].driveLocal = [0, 0, -1];
  const before = JSON.stringify(p),
    face = fastenerLayoutFace(p, draft, draft.locations[0].id),
    preview = previewFastenerLayout(p, draft, {
      seedLocationId: draft.locations[0].id,
      uLocal: [1, 0, 0],
      countU: 2,
      spacingU: 2,
      countV: 1,
      spacingV: null,
      basis: "SYNTHETIC coplanar face",
    });
  near(face.normalLocal, [0, 0, 1]);
  assert.equal(preview.eligibleCount, 1);
  const next = appendFastenerLayout(p, draft, preview, preview.candidateIds);
  assert.equal(next.locations.length, 2);
  assert.equal(JSON.stringify(p), before);
  assert.equal(p.fastenerPlanLabels.length, 0);
});

test("actual geometric face margins exclude only rejected new points and reach the transient review used by markers", () => {
  const { project, draft, spec } = fixture();
  draft.measurements = { ...measured };
  const preview = previewFastenerLayout(project, draft, {
    ...spec,
    countU: 4,
    minimumFaceMargin: 3,
  });
  assert.deepEqual(
    preview.candidates.map((row) => row.faceMargin),
    [4, 4, 2],
  );
  assert.deepEqual(
    preview.candidates.map((row) => row.eligible),
    [true, true, false],
  );
  const bad = preview.candidates[2];
  assert.ok(bad.issues.some((issue) => issue.code === "layout-face-margin"));
  assert.equal(
    preview.review.locations.find((row) => row.location.id === bad.id)!
      .includedInDemand,
    false,
  );
  assert.equal(preview.review.state, "conflict");
  assert.throws(
    () => appendFastenerLayout(project, draft, preview, [bad.id]),
    /eligible/,
  );
  const appended = appendFastenerLayout(
    project,
    draft,
    preview,
    preview.candidates.filter((row) => row.eligible).map((row) => row.id),
  );
  assert.equal(appended.locations.length, 3);
});

test("mixed missed receivers stay visible and do not discard valid candidate or existing manual paths", () => {
  const { project, draft, spec, receiver } = fixture();
  draft.measurements = { ...measured };
  const narrower = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === receiver.id
        ? {
            ...piece,
            size: [6, 10, 0.703] as V3,
            position: [-1, 0, -0.953] as V3,
          }
        : piece,
    ),
  };
  // Explicitly establish current refs in this synthetic fixture; the layout itself never refreshes.
  const saved = saveFastenerPlan(narrower, draft),
    refreshed = saveFastenerPlan(saved, refreshFastenerPlan(saved, draft));
  const fresh = structuredClone(refreshed.fastenerPlans[0]);
  fresh.measurements = { ...measured };
  const p = saveFastenerPlan(refreshed, fresh),
    preview = previewFastenerLayout(p, fresh, { ...spec, countU: 4 });
  assert.deepEqual(
    preview.candidates.map((row) => row.eligible),
    [true, true, false],
  );
  assert.ok(
    preview.candidates[2].issues.some(
      (issue) => issue.code === "missed-receiver",
    ),
  );
  const appended = appendFastenerLayout(
    p,
    fresh,
    preview,
    preview.candidates.filter((row) => row.eligible).map((row) => row.id),
  );
  assert.equal(reviewed(p, appended).activePointCount, 3);
});

test("new duplicates expose impact on older paths, allow an unaffected subset, and never reduce existing valid eligibility", () => {
  const { project, draft, spec, head, receiver } = fixture();
  draft.measurements = { ...measured };
  let other = addFastenerLocation(
    makeFastenerPlan(project, head.id, receiver.id, {
      measurements: { ...measured },
    }),
  );
  // The first plan is saved even though its local seed is not yet saved.
  other.locations[0].entranceLocal = [1, 0, 0.3515];
  other.locations[0].driveLocal = [0, 0, -1];
  const p = saveFastenerPlan(project, other),
    preview = previewFastenerLayout(p, draft, spec);
  assert.deepEqual(
    preview.candidates.map((row) => row.eligible),
    [true, false],
  );
  assert.ok(preview.existingEligibilityChanges.includes(other.locations[0].id));
  assert.throws(
    () => appendFastenerLayout(p, draft, preview, [preview.candidates[1].id]),
    /eligible/,
  );
  const appended = appendFastenerLayout(p, draft, preview, [
      preview.candidates[0].id,
    ]),
    reviews = fastenerReviews(saveFastenerPlan(p, appended));
  assert.equal(
    reviews.find((row) => row.plan.id === other.id)!.activePointCount,
    1,
  );
  assert.equal(
    reviews.find((row) => row.plan.id === draft.id)!.activePointCount,
    2,
  );
  const coincident = previewFastenerLayout(project, draft, {
    ...spec,
    countU: 2,
    spacingU: 5e-7,
  });
  assert.equal(coincident.eligibleCount, 0);
  assert.ok(
    coincident.existingEligibilityChanges.includes(draft.locations[0].id),
  );
});

test("third layers, actual tip and pilot breakthrough exclude new points while unknown measurements remain pending", () => {
  const { project, draft, spec } = fixture();
  const obstacle = part(
    "SYNTHETIC third layer",
    "roof",
    [0.2, 0.2, 0.04],
    [-1, 0, -0.4765],
    project.steps[0].id,
    "",
  );
  const p = { ...project, pieces: [...project.pieces, obstacle] },
    preview = previewFastenerLayout(p, draft, spec);
  assert.deepEqual(
    preview.candidates.map((row) => row.eligible),
    [false, true],
  );
  assert.ok(
    preview.candidates[0].issues.some(
      (issue) =>
        issue.code === "unselected-layer" &&
        issue.pieceIds?.includes(obstacle.id),
    ),
  );
  assert.equal(preview.candidates[1].review.state, "needs-measurements");
  const savedDepth = structuredClone(draft);
  savedDepth.measurements = { ...measured, surfaceToTipDepth: 2 };
  assert.throws(
    () => previewFastenerLayout(project, savedDepth, spec),
    /seed path/,
  );
  const savedPilot = structuredClone(draft);
  savedPilot.measurements = { ...measured, pilotDepth: 2 };
  assert.throws(
    () => previewFastenerLayout(project, savedPilot, spec),
    /seed path/,
  );
});

test("a beveled receiving exit can invalidate only a new repeated tip/pilot while preserving the valid seed and neighboring candidate", () => {
  const { project, head, receiver } = fixture();
  const length = Math.hypot(0.15, 1);
  const p = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === receiver.id
        ? {
            ...piece,
            cutPlanes: [
              {
                normal: [0.15 / length, 0, -1 / length] as V3,
                constant: -0.05 / length,
              },
            ],
          }
        : piece,
    ),
  };
  const draft = addFastenerLocation(
    makeFastenerPlan(p, head.id, receiver.id, {
      measurements: { ...measured },
    }),
  );
  draft.locations[0].entranceLocal = [-3, 0, 0.3515];
  draft.locations[0].driveLocal = [0, 0, -1];
  const preview = previewFastenerLayout(p, draft, {
    seedLocationId: draft.locations[0].id,
    uLocal: [1, 0, 0],
    countU: 3,
    spacingU: 2,
    countV: 1,
    spacingV: null,
    basis: "SYNTHETIC variable retained receiving depth",
  });
  assert.deepEqual(
    preview.candidates.map((candidate) => candidate.eligible),
    [true, false],
  );
  const bad = preview.candidates[1];
  assert.ok(bad.issues.some((issue) => issue.code === "tip-breakthrough"));
  assert.ok(bad.issues.some((issue) => issue.code === "pilot-breakthrough"));
  near([bad.review.receiverExitDepth!], [1.1045]);
  const next = appendFastenerLayout(p, draft, preview, [
    preview.candidates[0].id,
  ]);
  assert.equal(reviewed(p, next).activePointCount, 2);
  assert.deepEqual(next.locations[0], draft.locations[0]);
});

test("a unique retained miter face supplies a frame; common full Euler motion preserves local rows but invalidates an old preview", () => {
  let project = blank("SYNTHETIC miter layout");
  const normal: V3 = [Math.SQRT1_2, 0, Math.SQRT1_2],
    head = part(
      "Bevel",
      "stud",
      [3.5, 10, 1.5],
      [0, 0, 0],
      project.steps[0].id,
      "",
    ),
    receiver = part(
      "Receiver",
      "stud",
      [3.5, 10, 1.5],
      normal.map((n) => -3 * n) as V3,
      project.steps[0].id,
      "",
    );
  head.cutPlanes = [{ normal, constant: 0.5 }];
  project = { ...project, pieces: [head, receiver] };
  let draft = addFastenerLocation(
    makeFastenerPlan(project, head.id, receiver.id),
  );
  draft.locations[0].entranceLocal = [
    Math.SQRT1_2 * 0.5,
    -3,
    Math.SQRT1_2 * 0.5,
  ];
  draft.locations[0].driveLocal = normal.map((n) => -n) as V3;
  const spec: FastenerLayoutSpec = {
    seedLocationId: draft.locations[0].id,
    uLocal: [0, 1, 0],
    countU: 3,
    spacingU: 2,
    countV: 1,
    spacingV: null,
    basis: "SYNTHETIC bevel geometry only",
  };
  const face = fastenerLayoutFace(project, draft, spec.seedLocationId);
  assert.equal(face.kind, "cut");
  near(face.normalLocal, normal);
  const resolved = fastenerLayoutDirection(face, 0);
  near(resolved, [Math.SQRT1_2, 0, -Math.SQRT1_2]);
  const preview = previewFastenerLayout(project, draft, spec);
  assert.equal(preview.eligibleCount, 2);
  const rotation: V3 = [0.31, 0.72, -0.49],
    translation: V3 = [30, 20, -12],
    moved = {
      ...project,
      pieces: project.pieces.map((piece) => ({
        ...piece,
        position: rotate(piece.position, rotation).map(
          (n, i) => n + translation[i],
        ) as V3,
        rotation: composeRotation(rotation, piece.rotation),
      })),
    };
  const next = previewFastenerLayout(moved, draft, spec);
  assert.equal(next.eligibleCount, 2);
  near(
    next.candidates[0].location.entranceLocal!,
    preview.candidates[0].location.entranceLocal!,
  );
  near(
    next.candidates[0].review.entranceWorld!,
    rotate(preview.candidates[0].review.entranceWorld!, rotation).map(
      (n, i) => n + translation[i],
    ),
  );
  assert.throws(
    () =>
      appendFastenerLayout(moved, draft, preview, [preview.candidates[0].id]),
    /stale/,
  );
});

test("physical, competing-path, reference and working-draft edits stale a preview, while unrelated guide checks/notes do not", () => {
  const { project, draft, spec, head, receiver } = fixture(),
    preview = previewFastenerLayout(project, draft, spec),
    accepted = [preview.candidates[0].id];
  const edits: Project[] = [
    {
      ...project,
      pieces: project.pieces.map((p) =>
        p.id === receiver.id ? { ...p, position: [0, 0, -1] as V3 } : p,
      ),
    },
    { ...project, pieces: project.pieces.filter((p) => p.id !== receiver.id) },
    {
      ...project,
      pieces: project.pieces.map((p) =>
        p.id === head.id
          ? { ...p, cutPlanes: [{ normal: [1, 0, 0] as V3, constant: 2 }] }
          : p,
      ),
    },
    {
      ...project,
      pieces: project.pieces.map((p) =>
        p.id === receiver.id ? { ...p, offcut: true } : p,
      ),
    },
    {
      ...project,
      pieces: [
        ...project.pieces,
        part(
          "Third actual layer",
          "roof",
          [0.2, 0.2, 0.04],
          [-1, 0, -0.4765],
          project.steps[0].id,
          "",
        ),
      ],
    },
  ];
  for (const p of edits)
    assert.throws(
      () => appendFastenerLayout(p, draft, preview, accepted),
      /stale/,
    );
  const changed = structuredClone(draft);
  changed.notes += " Late unsaved edit";
  assert.throws(
    () => appendFastenerLayout(project, changed, preview, accepted),
    /stale/,
  );
  const product = changeFastenerProduct(project, draft, "grk-cabinet-113079");
  assert.throws(
    () => appendFastenerLayout(project, product, preview, accepted),
    /stale/,
  );
  const unrelated = {
    ...project,
    notes: "Unrelated project notes",
    steps: project.steps.map((step) => ({
      ...step,
      complete: !step.complete,
      notes: "Guide note",
    })),
  };
  assert.equal(
    appendFastenerLayout(unrelated, draft, preview, accepted).locations.length,
    2,
  );
});

test("a newly introduced competing W path and an actual same-name replacement reject an old preview rather than rebinding", () => {
  const { project, draft, spec, head, receiver } = fixture(),
    preview = previewFastenerLayout(project, draft, spec);
  let other = addFastenerLocation(
    makeFastenerPlan(project, head.id, receiver.id),
  );
  other.locations[0].entranceLocal = [-1, 0, 0.3515];
  other.locations[0].driveLocal = [0, 0, -1];
  const competing = saveFastenerPlan(project, other);
  assert.throws(
    () =>
      appendFastenerLayout(competing, draft, preview, [
        preview.candidates[0].id,
      ]),
    /stale/,
  );
  const replacement = part(
    receiver.name,
    receiver.material,
    receiver.size,
    receiver.position,
    project.steps[0].id,
    "",
  );
  const p = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === receiver.id ? replacement : piece,
    ),
  };
  assert.notEqual(replacement.id, receiver.id);
  assert.throws(
    () => appendFastenerLayout(p, draft, preview, [preview.candidates[0].id]),
    /stale/,
  );
});

test("candidate tampering, repeated acceptance, empty/foreign/duplicate selections and exceeded note limits cannot silently alter the draft", () => {
  const { project, draft, spec } = fixture(),
    preview = previewFastenerLayout(project, draft, spec),
    id = preview.candidates[0].id;
  for (const ids of [[], [id, id], ["not-a-candidate"]])
    assert.throws(() => appendFastenerLayout(project, draft, preview, ids));
  const tampered = structuredClone(preview);
  tampered.candidates[0].location.entranceLocal = [0, 0, 0.3515];
  assert.throws(
    () => appendFastenerLayout(project, draft, tampered, [id]),
    /changed/,
  );
  const long = structuredClone(draft);
  long.notes = "x".repeat(2990);
  const tooLong = previewFastenerLayout(project, long, spec);
  assert.equal(tooLong.noteFits, false);
  assert.throws(
    () =>
      appendFastenerLayout(project, long, tooLong, [tooLong.candidates[0].id]),
    /3000-character/,
  );
  assert.equal(long.notes.length, 2990);
});

test("count/spacing/direction/counter/location bounds are explicit and never silently clamped", () => {
  const { project, draft, spec } = fixture();
  for (const edit of [
    { countU: 1 },
    { countU: 2.5 },
    { countU: 101 },
    { spacingU: 0 },
    { spacingU: -1 },
    { spacingU: Infinity },
    { countV: 2, spacingV: null },
    { countU: 20, countV: 20, spacingV: 1 },
    { basis: "" },
    { minimumFaceMargin: -1 },
  ])
    assert.throws(() =>
      previewFastenerLayout(project, draft, { ...spec, ...edit }),
    );
  const almost = structuredClone(draft);
  almost.nextLocationNumber = 999999;
  assert.throws(() => previewFastenerLayout(project, almost, spec), /labels/);
  let full = draft;
  for (let i = 0; i < 98; i++) full = addFastenerLocation(full);
  assert.equal(full.locations.length, 99);
  assert.throws(
    () => previewFastenerLayout(project, full, spec),
    /100-location/,
  );
});

test("save/guide roundtrip and Undo reservations retain ordinary F identities and preserve prior user notes/history", () => {
  const { project, draft, spec } = fixture(),
    preview = previewFastenerLayout(project, draft, spec),
    next = appendFastenerLayout(project, draft, preview, preview.candidateIds),
    saved = saveFastenerPlan(project, next);
  const guide = generateBuildGuide(saved);
  assert.ok(guideIsCurrent(guide));
  assert.deepEqual(guide.fastenerPlans, saved.fastenerPlans);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(guide)));
  assert.deepEqual(reopened.fastenerPlans, saved.fastenerPlans);
  const undo = retainFastenerLabelHistory(project, saved);
  assert.equal(undo.fastenerPlans[0].locations.length, 0);
  assert.equal(undo.fastenerPlans[0].nextLocationNumber, 4);
  const branch = addFastenerLocation(undo.fastenerPlans[0]);
  assert.equal(branch.locations[0].label, "F004");
  const redo = retainFastenerLabelHistory(saved, undo);
  assert.deepEqual(redo.fastenerPlans[0].locations, next.locations);
});

test("layout preserves an actual prior explicit reference-refresh receipt and never supplies replacement measurements", () => {
  const { project, draft, spec, receiver } = fixture(),
    saved = saveFastenerPlan(project, draft);
  const moved = {
    ...saved,
    pieces: saved.pieces.map((piece) =>
      piece.id === receiver.id
        ? { ...piece, position: [0, 0, -1.053] as V3 }
        : piece,
    ),
  };
  const refreshed = saveFastenerPlan(
      moved,
      refreshFastenerPlan(moved, saved.fastenerPlans[0]),
    ),
    current = refreshed.fastenerPlans[0];
  assert.equal(current.referenceHistory.length, 1);
  const original = JSON.stringify(refreshed),
    preview = previewFastenerLayout(refreshed, current, spec);
  const appended = appendFastenerLayout(
    refreshed,
    current,
    preview,
    preview.candidateIds,
  );
  assert.deepEqual(appended.referenceHistory, current.referenceHistory);
  assert.deepEqual(appended.head, current.head);
  assert.deepEqual(appended.receiver, current.receiver);
  assert.deepEqual(appended.measurements, current.measurements);
  assert.equal(appended.measurements.surfaceToTipDepth, null);
  assert.equal(preview.pendingCount, 2);
  assert.equal(JSON.stringify(refreshed), original);
  assert.equal(
    saveFastenerPlan(refreshed, appended).fastenerPlans[0].referenceHistory
      .length,
    1,
  );
});

const actualPairs = [
  {
    kind: "storage-banquette",
    head: "P002",
    receiver: "P006",
    seed: [-10.547, -5, -0.3515],
    drive: [0, 0, 1],
    u: [0, 1, 0],
    spacing: 4,
    depth: 1.8,
    exit: 0.703,
  },
  {
    kind: "shelves",
    head: "P001",
    receiver: "P004",
    seed: [-0.3515, 35.6485, -5],
    drive: [1, 0, 0],
    u: [0, 0, 1],
    spacing: 5,
    depth: 1.8,
    exit: 0.703,
  },
  {
    kind: "closet-insert",
    head: "P002",
    receiver: "P003",
    seed: [-39.6485, 0.3515, -10],
    drive: [0, -1, 0],
    u: [0, 0, 1],
    spacing: 10,
    depth: 1.8,
    exit: 0.703,
  },
  {
    kind: "greenhouse",
    head: "P023",
    receiver: "P025",
    seed: [-28.68503937007874, 0.75, 0],
    drive: [0, -1, 0],
    u: [1, 0, 0],
    spacing: 0.5,
    depth: 2,
    exit: 1.5,
  },
  {
    kind: "sauna",
    head: "P002",
    receiver: "P005",
    seed: [-9.5, 0.75, 0],
    drive: [0, -1, 0],
    u: [1, 0, 0],
    spacing: 0.5,
    depth: 2,
    exit: 1.5,
  },
] as const;
for (const config of actualPairs)
  test(`actual ${config.kind} members support an explicit3-position synthetic row without changing any physical records`, async () => {
    const project = projectSchema.parse(
        JSON.parse(
          await readFile(
            new URL(
              `../public/examples/builds/${config.kind}.yardwork.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ),
      before = JSON.stringify(project),
      ids = new Map(project.partLabels.map((row) => [row.label, row.partId]));
    let draft = addFastenerLocation(
      makeFastenerPlan(
        project,
        ids.get(config.head)!,
        ids.get(config.receiver)!,
      ),
    );
    draft.locations[0].entranceLocal = [...config.seed];
    draft.locations[0].driveLocal = [...config.drive];
    const spec: FastenerLayoutSpec = {
      seedLocationId: draft.locations[0].id,
      uLocal: [...config.u],
      countU: 3,
      spacingU: config.spacing,
      countV: 1,
      spacingV: null,
      basis: "SYNTHETIC actual-build geometry test; not a schedule",
    };
    const pending = previewFastenerLayout(project, draft, spec);
    assert.equal(pending.pendingCount, 2);
    assert.equal(pending.review.activePointCount, 3);
    draft = {
      ...draft,
      measurements: {
        ...measured,
        surfaceToTipDepth: config.depth,
        pilotDepth: config.depth,
      },
    };
    const preview = previewFastenerLayout(project, draft, spec);
    assert.equal(preview.eligibleCount, 2);
    assert.equal(preview.pendingCount, 0);
    assert.ok(
      preview.review.locations.every(
        (point) => point.state === "path-reviewed",
      ),
    );
    near([preview.candidates[0].review.headExitDepth!], [config.exit]);
    const appended = appendFastenerLayout(
        project,
        draft,
        preview,
        preview.candidateIds,
      ),
      saved = saveFastenerPlan(project, appended);
    assert.equal(appended.locations.length, 3);
    assert.equal(JSON.stringify(project), before);
    assert.deepEqual(saved.pieces, project.pieces);
    assert.deepEqual(saved.supplies, project.supplies);
    assert.deepEqual(saved.lidHingePlans, project.lidHingePlans);
    assert.deepEqual(appended.referenceHistory, draft.referenceHistory);
  });
