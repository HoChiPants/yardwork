import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blank,
  part,
  projectSchema,
  material,
  uid,
  type Project,
  type V3,
} from "../src/model";
import {
  makeConnectorPlan,
  saveConnectorPlan,
  connectorReviews,
  refreshConnectorPlan,
  changeConnectorSchedule,
  removeConnectorPlan,
  retainConnectorLabelHistory,
  qualifiedConnectorLabel,
} from "../src/connectors";
import {
  connectorPlanSchema,
  assertConnectorHistoryPrefix,
  emptyConnectorMeasurements,
} from "../src/connectorSchema";
import { composeRotation, rotate } from "../src/spatial";
import { cutPiece } from "../src/engine";
import { cutAngledEnd } from "../src/cutPlan";
import { getConnectorProduct } from "../src/connectorProducts";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
  fastenerReviews,
} from "../src/fastenings";
import {
  addHingeLocation,
  makeLidHingePlan,
  saveLidHingePlan,
  lidHingeReviews,
} from "../src/hinges";

const now = Date.parse("2026-11-18T12:00:00Z"),
  measuredAt = "2026-11-17T12:00:00Z";
const near = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-6,
    `${actual} != ${expected}`,
  );
function fixture() {
  const p = blank("SYNTHETIC assigned wood-entry paths");
  p.pieces = [
    part("Base", "stud", [12, 1.5, 3.5], [0, 0.75, 0], p.steps[0].id, "Frame"),
    part(
      "Post",
      "stud",
      [1.5, 12, 3.5],
      [5.25, 7.5, 0],
      p.steps[0].id,
      "Frame",
    ),
  ];
  return p;
}
function intent(p: Project) {
  return makeConnectorPlan(p, p.pieces[0].id, p.pieces[1].id);
}
function entered(p: Project) {
  const plan = intent(p),
    points: V3[] = [
      [-3, 0, 1.75],
      [0, 0, 1.75],
      [0, -3, 1.75],
      [0, 0, 1.75],
    ];
  plan.entries.forEach((entry, i) => {
    entry.entranceLocal = points[i];
    entry.driveLocal = [0, 0, -1];
    entry.measurements = {
      woodEntryToTipDepth: 1,
      pilotDiameter: 0.0625,
      pilotDepth: 1.1,
      basis:
        "SYNTHETIC user wood-entry and deepest pilot-tip dimensions, not manufacturer data",
      measuredAt,
    };
  });
  return plan;
}
function review(p: Project, plan = entered(p)) {
  return connectorReviews(saveConnectorPlan(p, plan), now)[0];
}
function withCompetingW(entranceX = -3) {
  let p = fixture();
  const receiver = part(
    "SYNTHETIC separate W receiver",
    "stud",
    [12, 1.5, 3.5],
    [0, 0.75, -3.5],
    p.steps[0].id,
    "",
  );
  p.pieces.push(receiver);
  let w = addFastenerLocation(makeFastenerPlan(p, p.pieces[0].id, receiver.id));
  w.locations[0].entranceLocal = [entranceX, 0, 1.75];
  w.locations[0].driveLocal = [0, 0, -1];
  // Unknown W tip is preserved; a valid explicit entry still represents a current intention.
  p = saveFastenerPlan(p, w);
  p = saveConnectorPlan(p, entered(p));
  return p;
}

test("factory records one complete reference choice, four unknown slots and no manufactured geometry", () => {
  const p = fixture(),
    raw = JSON.stringify(p),
    plan = intent(p),
    r = review(p, plan);
  assert.equal(plan.label, "C001");
  assert.equal(
    plan.evidenceRevision,
    getConnectorProduct("simpson-a21z")!.evidenceRevision,
  );
  assert.deepEqual(
    plan.entries.map((e) => [e.label, e.role]),
    [
      ["E001", "base"],
      ["E002", "base"],
      ["E003", "post"],
      ["E004", "post"],
    ],
  );
  assert.ok(
    plan.entries.every(
      (e) => e.entranceLocal === null && e.driveLocal === null,
    ),
  );
  assert.ok(
    plan.entries.every(
      (e) =>
        JSON.stringify(e.measurements) ===
        JSON.stringify(emptyConnectorMeasurements()),
    ),
  );
  assert.equal(plan.referenceHistory.length, 0);
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.activeEntryCount, 0);
  assert.ok(r.entries.every((entry) => entry.measurementsCurrent === false));
  assert.equal(r.activeConnectorCount, 1);
  assert.equal(r.scheduledFastenerCount, 4);
  assert.equal(JSON.stringify(p), raw);
  assert.deepEqual(connectorReviews(blank()), []);
});

test("four individual wood paths use actual retained exits without certifying a connector fit", () => {
  const p = fixture(),
    plan = entered(p),
    r = review(p, plan),
    saved = saveConnectorPlan(p, plan);
  assert.equal(r.state, "paths-reviewed");
  assert.equal(r.activeConnectorCount, 1);
  assert.equal(r.scheduledFastenerCount, 4);
  assert.equal(r.activeEntryCount, 4);
  for (const entry of r.entries) {
    assert.equal(entry.state, "path-reviewed");
    assert.equal(entry.measurementsCurrent, true);
    near(entry.availableWoodDepth, 3.5);
    near(entry.tipWorld![2], 0.75);
    near(entry.pilotTipWorld![2], 0.65);
  }
  assert.ok(
    r.issues.some(
      (i) =>
        i.code === "wood-path-only" &&
        /do not establish connector/.test(i.message),
    ),
  );
  assert.deepEqual(saved.pieces, p.pieces);
  assert.deepEqual(saved.joints, p.joints);
  assert.deepEqual(saved.supplies, []);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(saved))),
    saved,
  );
});

test("one invalid entry excludes the whole four-fastener alternative, not just its own datum", () => {
  const p = fixture(),
    plan = entered(p);
  plan.entries[0].measurements.woodEntryToTipDepth = 3.5;
  const r = review(p, plan);
  assert.equal(r.state, "conflict");
  assert.equal(r.activeConnectorCount, 0);
  assert.equal(r.scheduledFastenerCount, 0);
  assert.equal(r.activeEntryCount, 3);
  assert.ok(r.entries.slice(1).every((e) => e.state === "path-reviewed"));
  assert.ok(r.entries[0].issues.some((i) => i.code === "tip-breakthrough"));
  assert.equal(r.entries[0].measurementsCurrent, false);
});

test("unknown dimensions retain pending intent without substituting nominal fastener length or metal gauge", () => {
  const p = fixture(),
    plan = entered(p);
  plan.entries[0].measurements = emptyConnectorMeasurements();
  const r = review(p, plan),
    entry = r.entries[0];
  assert.equal(entry.state, "needs-measurements");
  assert.equal(entry.tipWorld, null);
  assert.equal(entry.pilotTipWorld, null);
  assert.equal(entry.measurementsCurrent, false);
  near(entry.availableWoodDepth, 3.5);
  assert.equal(r.activeConnectorCount, 1);
  assert.equal(r.scheduledFastenerCount, 4);
});

test("a future measurement remains pending with no released numerical tip", () => {
  const p = fixture(),
    plan = entered(p);
  plan.entries[0].measurements.measuredAt = "2026-11-19T00:00:00Z";
  const r = review(p, plan);
  assert.equal(r.entries[0].state, "needs-measurements");
  assert.equal(r.entries[0].tipWorld, null);
  assert.equal(r.entries[0].pilotTipWorld, null);
  assert.equal(r.entries[0].measurementsCurrent, false);
  assert.ok(
    r.entries[0].issues.some((i) => i.code === "measurement-provenance"),
  );
  assert.equal(r.activeConnectorCount, 1);
  assert.throws(() =>
    connectorPlanSchema.parse({
      ...plan,
      entries: plan.entries.map((e, i) =>
        i ? e : { ...e, measurements: { ...e.measurements, basis: "" } },
      ),
    }),
  );
});

test("numeric measurement currentness matures by date without mutating the retained input or inventing missing dimensions", () => {
  const p = fixture(),
    plan = entered(p),
    at = "2026-11-19T00:00:00Z";
  plan.entries[0].measurements.measuredAt = at;
  const saved = saveConnectorPlan(p, plan),
    raw = JSON.stringify(saved);
  const pending = connectorReviews(saved, now)[0],
    matured = connectorReviews(saved, Date.parse(at))[0];
  assert.equal(pending.entries[0].measurementsCurrent, false);
  assert.equal(pending.entries[0].includedInDemand, true);
  near(pending.entries[0].availableWoodDepth, 3.5);
  assert.equal(pending.entries[0].tipWorld, null);
  assert.equal(matured.entries[0].measurementsCurrent, true);
  near(matured.entries[0].tipWorld![2], 0.75);
  assert.equal(matured.state, "paths-reviewed");
  assert.equal(JSON.stringify(saved), raw);
});

test("partial user measurements expose only their known valid numeric evidence; absent basis/date remains withheld", () => {
  const p = fixture(),
    plan = entered(p);
  plan.entries[0].measurements = {
    ...emptyConnectorMeasurements(),
    pilotDepth: 0.45,
    basis:
      "SYNTHETIC deepest pilot tip only; wood-tip depth and diameter unknown",
    measuredAt,
  };
  const saved = saveConnectorPlan(p, plan),
    reviewed = connectorReviews(saved, now)[0].entries[0];
  assert.equal(reviewed.measurementsCurrent, true);
  assert.equal(reviewed.state, "needs-measurements");
  assert.equal(reviewed.tipWorld, null);
  near(reviewed.pilotTipWorld![2], 1.3);
  for (const value of ["basis", "date"] as const) {
    // Intentionally unparsed working input, never admitted as a valid persisted measurement.
    const draft = structuredClone(saved),
      entry = draft.connectorPlans[0].entries[0];
    if (value === "basis") entry.measurements.basis = " ";
    else entry.measurements.measuredAt = null;
    const current = connectorReviews(draft, now)[0],
      point = current.entries[0];
    assert.equal(point.measurementsCurrent, false);
    assert.equal(point.pilotTipWorld, null);
    assert.equal(point.tipWorld, null);
    assert.ok(point.entranceWorld);
    near(point.availableWoodDepth, 3.5);
    assert.equal(current.activeConnectorCount, 1);
    assert.equal(current.scheduledFastenerCount, 4);
  }
});

test("finite normalized drive and unique retained faces are required, including sharp corners", () => {
  const p = fixture();
  for (const [entrance, drive] of [
    [
      [0, 0, 0],
      [0, 0, -1],
    ],
    [
      [0, 0, 1.76],
      [0, 0, -1],
    ],
    [
      [6, 0, 1.75],
      [-Math.SQRT1_2, 0, -Math.SQRT1_2],
    ],
    [
      [0, 0, 1.75],
      [0, 0, 1],
    ],
  ] as [V3, V3][]) {
    const plan = entered(p);
    plan.entries[0].entranceLocal = entrance;
    plan.entries[0].driveLocal = drive;
    assert.equal(review(p, plan).state, "conflict");
  }
  const plan = entered(p);
  plan.entries[0].driveLocal = [0, 0, -2];
  assert.throws(() => connectorPlanSchema.parse(plan));
  plan.entries[0].driveLocal = [NaN, 0, 0];
  assert.throws(() => connectorPlanSchema.parse(plan));
});

test("known invalid entrance conflicts even before its drive or depth is entered", () => {
  const p = fixture(),
    plan = intent(p);
  plan.entries[0].entranceLocal = [0, 0, 0];
  const r = review(p, plan);
  assert.equal(r.state, "conflict");
  assert.equal(r.activeConnectorCount, 0);
  assert.equal(r.entries[0].state, "conflict");
});

test("coplanar duplicate stock/cut faces remain one face; actual bevel face can be entered", () => {
  const p = fixture();
  p.pieces[0].cutPlanes = [{ normal: [0, 0, 1], constant: 1.75 }];
  assert.equal(review(p).state, "paths-reviewed");
  p.pieces[0].cutPlanes = [
    { normal: [Math.SQRT1_2, 0, Math.SQRT1_2], constant: Math.SQRT1_2 },
  ];
  const plan = entered(p);
  plan.entries[0].entranceLocal = [0, 0, 1];
  plan.entries[0].driveLocal = [-Math.SQRT1_2, 0, -Math.SQRT1_2];
  plan.entries[0].measurements = {
    ...plan.entries[0].measurements,
    woodEntryToTipDepth: 0.5,
    pilotDepth: 0.6,
  };
  plan.entries[1].entranceLocal = [-3, 0, 1.75];
  assert.equal(review(p, plan).entries[0].state, "path-reviewed");
  const removed = entered(p);
  removed.entries[0].entranceLocal = [0, 0, 1.75];
  assert.equal(review(p, removed).state, "conflict");
});

test("pilot deepest-tip breakthrough and entry cross-section edges exclude the whole schedule", () => {
  const p = fixture(),
    plan = entered(p);
  plan.entries[0].measurements.pilotDepth = 3.5;
  assert.ok(
    review(p, plan).entries[0].issues.some(
      (i) => i.code === "pilot-breakthrough",
    ),
  );
  plan.entries[0].measurements.pilotDepth = 1.1;
  plan.entries[0].entranceLocal = [5.99, 0, 1.75];
  assert.ok(
    review(p, plan).entries[0].issues.some(
      (i) => i.code === "pilot-entry-edge",
    ),
  );
  assert.equal(review(p, plan).activeConnectorCount, 0);
});

test("additional modeled material in a traversed tip or pilot path is an explicit conflict", () => {
  const p = fixture(),
    plan = entered(p);
  const layer = part(
    "SYNTHETIC extra metal layer",
    "roof",
    [1, 1, 0.04],
    [-3, 0.75, 1.25],
    p.steps[0].id,
    "",
  );
  p.pieces.push(layer);
  const r = review(p, plan);
  assert.equal(r.activeConnectorCount, 0);
  assert.ok(
    r.entries[0].issues.some(
      (i) => i.code === "unselected-layer" && i.pieceIds?.includes(layer.id),
    ),
  );
  layer.position[2] = 0.7; // Beyond the wood tip .75, but inside deepest pilot-tip .65.
  assert.ok(
    review(p, plan).entries[0].issues.some(
      (i) => i.code === "unselected-layer",
    ),
  );
  layer.position[2] = -0.5;
  assert.equal(review(p, plan).state, "paths-reviewed");
  layer.position[2] = 1.25;
  layer.offcut = true;
  assert.equal(review(p, plan).state, "paths-reviewed");
  layer.offcut = false;
  layer.position[0] = -4;
  assert.equal(review(p, plan).state, "paths-reviewed");
});

test("the other assigned member is not silently drilled as a second wood-to-wood layer", () => {
  const p = fixture();
  p.pieces[1].position = [-3, 0.75, 1];
  const plan = entered(p),
    r = review(p, plan);
  assert.equal(r.state, "conflict");
  assert.ok(
    r.entries[0].issues.some(
      (i) =>
        i.code === "unselected-layer" && i.pieceIds?.includes(p.pieces[1].id),
    ),
  );
});

test("duplicate entries within and across C plans exclude whole schedules without quadratic issue growth", () => {
  let p = fixture();
  const first = entered(p);
  first.entries[1].entranceLocal = [...first.entries[0].entranceLocal!];
  assert.equal(review(p, first).activeConnectorCount, 0);
  assert.equal(
    review(p, first).entries[0].issues.filter(
      (i) => i.code === "duplicate-entry",
    ).length,
    1,
  );
  // Each group has 48 exact duplicates, including all potential first/last witnesses.
  for (let i = 0; i < 48; i++) p = saveConnectorPlan(p, entered(p));
  const result = connectorReviews(p, now);
  assert.ok(
    result.every(
      (r) =>
        r.state === "conflict" &&
        r.activeConnectorCount === 0 &&
        r.scheduledFastenerCount === 0,
    ),
  );
  assert.equal(
    result
      .flatMap((r) => r.entries)
      .filter((e) => e.issues.some((i) => i.code === "duplicate-entry")).length,
    192,
  );
  assert.ok(
    result
      .flatMap((r) => r.entries)
      .every(
        (e) =>
          e.issues.filter((i) => i.code === "duplicate-entry").length === 1,
      ),
  );
  assert.ok(result.flatMap((r) => r.issues).length < 48 * 30);
});

test("approximate duplicate chains retain witnesses after an earlier pair is marked", () => {
  let p = fixture();
  for (const offset of [0, 0.75e-6, 1.5e-6]) {
    const plan = entered(p);
    plan.entries[0].entranceLocal![0] += offset;
    p = saveConnectorPlan(p, plan);
  }
  assert.ok(
    connectorReviews(p, now).every((r) =>
      r.entries[0].issues.some((i) => i.code === "duplicate-entry"),
    ),
  );
});

test("an eligible W entry at the same entrance/direction excludes C only, with exact W/F and member context", () => {
  const p = withCompetingW(),
    raw = JSON.stringify(p),
    w = fastenerReviews(p, now)[0],
    r = connectorReviews(p, now)[0];
  assert.equal(w.locations[0].includedInDemand, true);
  assert.equal(w.locations[0].tipWorld, null);
  assert.equal(r.state, "conflict");
  assert.equal(r.activeConnectorCount, 0);
  assert.equal(r.scheduledFastenerCount, 0);
  const issue = r.entries[0].issues.find((i) => i.code === "competing-entry")!;
  assert.match(issue.message, /W001\/F001/);
  assert.deepEqual(issue.pieceIds, [p.pieces[0].id]);
  assert.equal(r.entries[0].measurementsCurrent, false);
  assert.equal(
    r.entries.slice(1).every((e) => e.state === "path-reviewed"),
    true,
  );
  assert.deepEqual(fastenerReviews(p, now)[0], w);
  assert.equal(JSON.stringify(p), raw);
});

test("nonduplicate, stale, incomplete or invalid W rays do not block current C wood paths", () => {
  assert.equal(
    connectorReviews(withCompetingW(-2), now)[0].state,
    "paths-reviewed",
  );
  const p = withCompetingW();
  for (const variant of ["stale", "incomplete", "invalid", "source"] as const) {
    const changed = structuredClone(p);
    if (variant === "stale") changed.pieces[2].position[0] += 0.1;
    if (variant === "incomplete")
      changed.fastenerPlans[0].locations[0].driveLocal = null;
    if (variant === "invalid")
      changed.fastenerPlans[0].locations[0].driveLocal = [0, 0, 1];
    if (variant === "source")
      changed.fastenerPlans[0].productEvidenceRevision = "old-evidence";
    assert.equal(
      connectorReviews(changed, now)[0].state,
      "paths-reviewed",
      variant,
    );
  }
  const conflictedNeighbor = structuredClone(p),
    w = addFastenerLocation(conflictedNeighbor.fastenerPlans[0]);
  w.locations[1].entranceLocal = [0, 0, 0];
  w.locations[1].driveLocal = [0, 0, -1];
  const mixed = saveFastenerPlan(conflictedNeighbor, w),
    wr = fastenerReviews(mixed, now)[0];
  assert.equal(wr.state, "conflict");
  assert.equal(wr.locations[0].includedInDemand, true);
  assert.equal(
    connectorReviews(mixed, now)[0].activeConnectorCount,
    0,
    "An independently invalid W point must not erase its eligible competing neighbor.",
  );
});

test("cross-domain entrance matching survives full-Euler shared motion and uses the same approximate-ray epsilon", () => {
  const p = withCompetingW(),
    rotation: V3 = [0.33, -0.61, 0.27],
    offset: V3 = [11, -4, 9];
  p.fastenerPlans[0].locations[0].entranceLocal![0] += 0.75e-6;
  assert.equal(connectorReviews(p, now)[0].activeConnectorCount, 0);
  p.pieces = p.pieces.map((piece) => ({
    ...piece,
    position: rotate(piece.position, rotation).map(
      (n, i) => n + offset[i],
    ) as V3,
    rotation: composeRotation(rotation, piece.rotation),
  }));
  assert.ok(
    connectorReviews(p, now)[0].issues.some(
      (i) => i.code === "competing-entry",
    ),
  );
  assert.notEqual(fastenerReviews(p, now)[0].state, "stale");
  p.fastenerPlans[0].locations[0].entranceLocal![0] += 2e-6;
  assert.equal(connectorReviews(p, now)[0].state, "paths-reviewed");
});

test("an actual current H entry on a linear frame member competes, while pending axis/hardware supplies no extra numerical defaults", () => {
  let p = projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/builds/storage-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const section = p.sections[0],
    baseId = "bfaf9102-f44e-4bcc-9e6c-e961e96e67e8",
    postId = "77ca8a23-e316-4c8c-9040-0f43a1688d43",
    otherFixedId = "94069b37-e6e5-4f96-85e6-5a2e7e26fc18";
  let h = addHingeLocation(
    makeLidHingePlan(p, section.id, postId, otherFixedId),
    "moving",
  );
  h.locations[0].entranceLocal = [0, 4, 1.75];
  h.locations[0].driveLocal = [0, 0, -1];
  p = saveLidHingePlan(p, h);
  const plan = makeConnectorPlan(p, baseId, postId),
    points: V3[] = [
      [-8, 0, 0.75],
      [-7, 0, 0.75],
      [0, 4, 1.75],
      [0, 5, 1.75],
    ];
  plan.entries.forEach((entry, i) => {
    entry.entranceLocal = points[i];
    entry.driveLocal = [0, 0, -1];
    entry.measurements = {
      woodEntryToTipDepth: 1,
      pilotDepth: 1.1,
      pilotDiameter: 0.0625,
      basis:
        "SYNTHETIC current connector path only, not real hinge compatibility",
      measuredAt,
    };
  });
  p = saveConnectorPlan(p, plan);
  const raw = JSON.stringify(p),
    hr = lidHingeReviews(p).find((r) => r.plan.id === h.id)!,
    r = connectorReviews(p, now)[0];
  assert.equal(hr.state, "needs-measurements");
  assert.ok(hr.locations[0].entranceWorld);
  assert.equal(hr.locations[0].tipWorld, null);
  assert.equal(r.activeConnectorCount, 0);
  assert.ok(
    r.entries[2].issues.some(
      (i) =>
        i.code === "competing-entry" &&
        i.message.includes(`${h.label}/L001`) &&
        i.pieceIds?.includes(postId),
    ),
  );
  assert.deepEqual(
    lidHingeReviews(p).find((r) => r.plan.id === h.id),
    hr,
  );
  assert.equal(JSON.stringify(p), raw);
  const stale = structuredClone(p);
  stale.pieces.find((piece) => piece.id === otherFixedId)!.position[0] += 0.1;
  assert.equal(
    lidHingeReviews(stale).find((r) => r.plan.id === h.id)!.state,
    "stale",
  );
  assert.equal(connectorReviews(stale, now)[0].state, "paths-reviewed");
  const excluded = structuredClone(p);
  excluded.lidHingePlans.find(
    (plan) => plan.id === h.id,
  )!.locations[0].measurements = {
    surfaceToTipDepth: 4,
    pilotDepth: null,
    pilotDiameter: null,
    basis: "SYNTHETIC invalid historical/current path",
    measuredAt,
  };
  assert.equal(
    lidHingeReviews(excluded).find((r) => r.plan.id === h.id)!.state,
    "conflict",
  );
  assert.equal(connectorReviews(excluded, now)[0].state, "paths-reviewed");
});

test("shared full-Euler rigid movement keeps local paths current and refresh is a complete no-op", () => {
  const p = fixture();
  const current = saveConnectorPlan(p, entered(p)),
    old = current.connectorPlans[0],
    r0 = connectorReviews(current, now)[0];
  const rotation: V3 = [0.41, -0.73, 0.22],
    translation: V3 = [30, -12, 8];
  current.pieces = current.pieces.map((piece) => ({
    ...piece,
    position: rotate(piece.position, rotation).map(
      (n, i) => n + translation[i],
    ) as V3,
    rotation: composeRotation(rotation, piece.rotation),
  }));
  const r = connectorReviews(current, now)[0];
  assert.equal(r.state, "paths-reviewed");
  r.entries.forEach((e, i) => {
    const expected = rotate(r0.entries[i].tipWorld!, rotation).map(
      (n, j) => n + translation[j],
    );
    e.tipWorld!.forEach((n, j) => near(n, expected[j]));
  });
  assert.deepEqual(refreshConnectorPlan(current, old), old);
});

test("independent movement, cut, deletion, offcut or same-name replacement retain stale raw intent", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p)),
    raw = JSON.stringify(saved.connectorPlans[0]);
  for (const variant of [
    "move",
    "cut",
    "delete",
    "offcut",
    "replacement",
  ] as const) {
    let changed = structuredClone(saved);
    if (variant === "move") changed.pieces[1].position[0] += 0.1;
    if (variant === "cut")
      changed = cutPiece(changed, changed.pieces[1].id, 10, 1);
    if (variant === "delete") changed.pieces = changed.pieces.slice(0, 1);
    if (variant === "offcut") changed.pieces[1].offcut = true;
    if (variant === "replacement") changed.pieces[1].id = uid();
    const r = connectorReviews(changed, now)[0];
    assert.equal(r.state, "stale", variant);
    assert.equal(r.activeConnectorCount, 0);
    assert.ok(
      r.entries.every(
        (e) => e.tipWorld === null && e.availableWoodDepth === null,
      ),
    );
    assert.equal(JSON.stringify(changed.connectorPlans[0]), raw);
  }
});

test("source identity/stock updates and product evidence updates cannot remain source-current", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p)),
    stock = material("stud"),
    original = structuredClone(stock);
  const restore = () => {
    Object.assign(stock, original);
    if (original.stockSize === undefined) delete stock.stockSize;
    if (original.productReference === undefined) delete stock.productReference;
  };
  try {
    stock.productReference = "SYNTHETIC changed identity";
    assert.equal(connectorReviews(saved, now)[0].state, "stale");
    restore();
    stock.stockSize = [1.5, 120, 3.5];
    assert.equal(connectorReviews(saved, now)[0].state, "stale");
  } finally {
    restore();
  }
  const changed = structuredClone(saved);
  changed.connectorPlans[0].evidenceRevision = "old-source";
  assert.equal(connectorReviews(changed, now)[0].state, "stale");
  const inconsistent = structuredClone(saved);
  inconsistent.connectorPlans[0].base.baseline!.size[0] += 1;
  assert.equal(connectorReviews(inconsistent, now)[0].state, "stale");
});

test("stock direction and cut-source changes stale the actual reference even when its bounding dimensions stay fixed", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p));
  const axis = structuredClone(saved);
  axis.pieces[0].stockLengthAxis = 0;
  assert.equal(connectorReviews(axis, now)[0].state, "stale");
  const lineage = structuredClone(saved);
  lineage.pieces[0].cutStock = {
    id: uid(),
    size: [24, 1.5, 3.5],
    offset: [0, 0, 0],
  };
  assert.equal(connectorReviews(lineage, now)[0].state, "stale");
});

test("changed refresh archives exact old inputs and clears every current datum without reassigning E IDs", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p)),
    old = structuredClone(saved.connectorPlans[0]);
  saved.pieces[1].position[0] += 0.1;
  const refreshed = refreshConnectorPlan(saved, old),
    row = refreshed.referenceHistory[0];
  assert.deepEqual(row.previous.entries, old.entries);
  assert.deepEqual(row.previous.base, old.base);
  assert.deepEqual(row.previous.post, old.post);
  assert.equal(row.kind, "refresh");
  assert.ok(
    refreshed.entries.every(
      (e) =>
        e.entranceLocal === null &&
        e.driveLocal === null &&
        e.measurements.woodEntryToTipDepth === null,
    ),
  );
  assert.deepEqual(
    refreshed.entries.map((e) => [e.id, e.label, e.role]),
    old.entries.map((e) => [e.id, e.label, e.role]),
  );
  const updated = saveConnectorPlan(saved, refreshed);
  assert.equal(connectorReviews(updated, now)[0].state, "needs-measurements");
  assert.deepEqual(
    refreshConnectorPlan(updated, updated.connectorPlans[0]),
    updated.connectorPlans[0],
  );
  assert.equal(updated.connectorPlans[0].referenceHistory.length, 1);
  updated.pieces = updated.pieces.slice(0, 1);
  assert.throws(
    () => refreshConnectorPlan(updated, updated.connectorPlans[0]),
    /same-ID/,
  );
});

test("schedule changes archive the working draft, retain raw refs even when missing, and reset current inputs", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p)),
    working = structuredClone(saved.connectorPlans[0]);
  working.entries[0].measurements.woodEntryToTipDepth = 0.9;
  saved.pieces = saved.pieces.slice(0, 1);
  const changed = changeConnectorSchedule(saved, working, "n10dhdg");
  assert.equal(changed.scheduleId, "n10dhdg");
  assert.deepEqual(changed.base, working.base);
  assert.deepEqual(changed.post, working.post);
  assert.deepEqual(
    changed.referenceHistory[0].previous.entries,
    working.entries,
  );
  assert.ok(
    changed.entries.every(
      (e) =>
        e.entranceLocal === null &&
        e.driveLocal === null &&
        e.measurements.pilotDepth === null,
    ),
  );
  const current = saveConnectorPlan(saved, changed);
  assert.equal(connectorReviews(current, now)[0].state, "stale");
  assert.deepEqual(
    changeConnectorSchedule(current, current.connectorPlans[0], "n10dhdg"),
    current.connectorPlans[0],
  );
});

test("source, schedule and immutable slot identities cannot bypass explicit history", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p));
  for (const field of ["schedule", "member", "slot"] as const) {
    const plan = structuredClone(saved.connectorPlans[0]);
    if (field === "schedule") plan.scheduleId = "n10dhdg";
    if (field === "member") plan.post = structuredClone(plan.base);
    if (field === "slot") plan.entries[0].role = "post";
    assert.throws(() => saveConnectorPlan(saved, plan));
  }
  const updated = saveConnectorPlan(
    saved,
    changeConnectorSchedule(saved, saved.connectorPlans[0], "n10dhdg"),
  );
  const truncated = structuredClone(updated.connectorPlans[0]);
  truncated.referenceHistory = [];
  assert.throws(() => saveConnectorPlan(updated, truncated), /append-only/);
  const rewritten = structuredClone(updated.connectorPlans[0]);
  rewritten.referenceHistory[0].previous.entries[0].name = "rewritten";
  assert.throws(
    () => assertConnectorHistoryPrefix(updated.connectorPlans, [rewritten]),
    /append-only/,
  );
  assert.doesNotThrow(() =>
    assertConnectorHistoryPrefix(updated.connectorPlans, []),
  );
});

test("two C namespaces survive no-op saves, delete/Undo and branch history without reservation reuse", () => {
  const p = fixture(),
    one = saveConnectorPlan(p, intent(p)),
    two = saveConnectorPlan(one, intent(one));
  assert.deepEqual(
    two.connectorPlans.map((p) => p.label),
    ["C001", "C002"],
  );
  assert.equal(
    qualifiedConnectorLabel(
      two.connectorPlans[1],
      two.connectorPlans[1].entries[0],
    ),
    "C002/E001",
  );
  const noOp = saveConnectorPlan(two, two.connectorPlans[0]);
  assert.deepEqual(
    noOp.connectorPlans.map((p) => p.id),
    two.connectorPlans.map((p) => p.id),
  );
  const deleted = removeConnectorPlan(two, two.connectorPlans[0].id),
    third = intent(deleted);
  assert.equal(third.label, "C003");
  const undone = retainConnectorLabelHistory(
    one,
    saveConnectorPlan(deleted, third),
  );
  assert.equal(intent(undone).label, "C004");
  const changed = saveConnectorPlan(
    two,
    changeConnectorSchedule(two, two.connectorPlans[0], "n10dhdg"),
  );
  const undo = retainConnectorLabelHistory(two, changed);
  assert.equal(undo.connectorPlans[0].scheduleId, "sd9112");
  assert.equal(undo.connectorPlans[0].referenceHistory.length, 1);
  const branch = saveConnectorPlan(
    undo,
    changeConnectorSchedule(undo, undo.connectorPlans[0], "n10dhdg"),
  );
  assert.equal(branch.connectorPlans[0].referenceHistory.length, 2);
  const redo = retainConnectorLabelHistory(changed, branch);
  assert.equal(redo.connectorPlans[0].referenceHistory.length, 2);
  const forged = structuredClone(changed);
  forged.connectorPlans[0].referenceHistory[0].basis = "rewritten";
  assert.throws(
    () => retainConnectorLabelHistory(forged, changed),
    /cannot be rewritten/,
  );
});

test("malformed or unsupported imported records remain readable but are excluded, never implicitly repaired", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, intent(p));
  const variants = [
    (v: Project) => {
      v.connectorPlans[0].entries.pop();
    },
    (v: Project) => {
      v.connectorPlans[0].post.pieceId = uid();
    },
    (v: Project) => {
      v.pieces[1].material = "plytanium-703";
    },
    (v: Project) => {
      v.connectorPlans[0].base.baseline = null;
    },
  ];
  for (const edit of variants) {
    const next = structuredClone(saved);
    edit(next);
    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(next))),
      raw = JSON.stringify(parsed);
    assert.equal(connectorReviews(parsed, now)[0].activeConnectorCount, 0);
    assert.equal(JSON.stringify(parsed), raw);
  }
  const panel = fixture();
  panel.pieces[1].material = "plytanium-703";
  assert.throws(() => intent(panel), /linear wood/);
  assert.throws(
    () => makeConnectorPlan(p, p.pieces[0].id, p.pieces[0].id),
    /distinct/,
  );
});

test("explicit refresh retains unknown imported baselines historically and captures current stock only after action", () => {
  const p = fixture(),
    saved = saveConnectorPlan(p, entered(p));
  saved.connectorPlans[0].base.baseline = null;
  const refreshed = refreshConnectorPlan(saved, saved.connectorPlans[0]);
  assert.equal(refreshed.referenceHistory[0].previous.base.baseline, null);
  assert.notEqual(refreshed.base.baseline, null);
  assert.ok(
    refreshed.entries.every(
      (entry) =>
        entry.entranceLocal === null &&
        entry.measurements.woodEntryToTipDepth === null,
    ),
  );
  assert.equal(review(saved, refreshed).activeConnectorCount, 1);
});

test("oversized stock and invalid original cut lineage cannot be refreshed into usable source", () => {
  const p = fixture();
  p.pieces[0].size = [12, 2, 3.5];
  assert.equal(review(p, intent(p)).state, "conflict");
  const cut = fixture(),
    id = uid();
  cut.pieces[0].cutStock = { id, size: [24, 1.5, 3.5], offset: [0, 0, 0] };
  const sibling = structuredClone(cut.pieces[0]);
  sibling.id = uid();
  sibling.offcut = true;
  sibling.cutStock!.offset = [1, 0, 0];
  cut.pieces.push(sibling);
  assert.ok(
    review(cut, intent(cut)).issues.some(
      (i) => i.code === "invalid-member-source",
    ),
  );
});

test("a valid angled cut remains eligible stock for a connector review", () => {
  const p = fixture();
  p.pieces[1].position[0] = 0;
  const cut = cutAngledEnd(p, p.pieces[0].id, "width", [7, 9], "start");
  const result = review(cut, intent(cut));
  assert.equal(result.state, "needs-measurements");
  assert.ok(!result.issues.some((i) => i.code === "invalid-member-source"));
});

test("public banquette, greenhouse and sauna frame members can carry pending C intent without modifying any existing record", () => {
  for (const family of ["storage-banquette", "greenhouse", "sauna"]) {
    const p = projectSchema.parse(
        JSON.parse(
          readFileSync(
            new URL(
              `../public/examples/builds/${family}.yardwork.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ),
      before = structuredClone(p);
    const wood = p.pieces.filter(
      (piece) =>
        !piece.offcut &&
        material(piece.material).wood &&
        material(piece.material).stockKind === "linear",
    );
    assert.ok(wood.length >= 2);
    const plan = makeConnectorPlan(p, wood[0].id, wood[1].id),
      saved = saveConnectorPlan(p, plan),
      r = connectorReviews(saved, now)[0];
    assert.equal(r.activeConnectorCount, 1, family);
    assert.equal(r.scheduledFastenerCount, 4, family);
    assert.equal(r.state, "needs-measurements", family);
    assert.deepEqual(saved.pieces, before.pieces);
    assert.deepEqual(saved.lidHingePlans, before.lidHingePlans);
    assert.deepEqual(saved.hingeStockSources, before.hingeStockSources);
    assert.deepEqual(saved.fastenerPlans, before.fastenerPlans);
    assert.deepEqual(saved.supplies, before.supplies);
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(saved))),
      saved,
    );
    assert.deepEqual(p, before);
  }
});

test("explicit actual rail/stud wood paths work on the three public frame families without creating a manufactured hole pattern", () => {
  const cases = [
    {
      family: "storage-banquette",
      baseId: "bfaf9102-f44e-4bcc-9e6c-e961e96e67e8",
      postId: "77ca8a23-e316-4c8c-9040-0f43a1688d43",
      points: [
        [-8, 0, 0.75],
        [-7, 0, 0.75],
        [0, 4, 1.75],
        [0, 5, 1.75],
      ],
    },
    {
      family: "greenhouse",
      baseId: "76c85efc-c35f-4848-bb39-c57bf0d97de7",
      postId: "e2109d0d-f6fa-45f9-9141-cf0314b44288",
      points: [
        [-19, 0, 1.75],
        [-18, 0, 1.75],
        [0, -34, 1.75],
        [0, -33, 1.75],
      ],
    },
    {
      family: "sauna",
      baseId: "a3ccab3b-01ac-43f4-837e-9e10366e142e",
      postId: "413c4b19-ec99-40e5-90b9-906288394ea2",
      points: [
        [-9, 0, 1.75],
        [-8, 0, 1.75],
        [0, -39, 1.75],
        [0, -38, 1.75],
      ],
    },
  ];
  for (const example of cases) {
    const p = projectSchema.parse(
        JSON.parse(
          readFileSync(
            new URL(
              `../public/examples/builds/${example.family}.yardwork.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ),
      raw = JSON.stringify(p),
      plan = makeConnectorPlan(p, example.baseId, example.postId);
    plan.entries.forEach((entry, i) => {
      entry.entranceLocal = example.points[i] as V3;
      entry.driveLocal = [0, 0, -1];
      entry.measurements = {
        woodEntryToTipDepth: 1,
        pilotDiameter: 0.0625,
        pilotDepth: 1.1,
        basis:
          "SYNTHETIC software path coordinates only; not a connector hole layout, seating or site/heat approval",
        measuredAt,
      };
    });
    const r = review(p, plan);
    assert.equal(
      r.state,
      "paths-reviewed",
      `${example.family}: ${r.issues
        .filter((i) => i.severity === "error")
        .map((i) => i.code + " " + i.message)
        .join("; ")}`,
    );
    assert.equal(r.activeConnectorCount, 1);
    assert.ok(
      r.entries.every(
        (e) => e.availableWoodDepth !== null && e.availableWoodDepth > 1.1,
      ),
    );
    assert.ok(
      r.issues.some(
        (i) =>
          i.code === "product-unresolved" && /heated sauna/.test(i.message),
      ),
    );
    assert.equal(JSON.stringify(p), raw);
  }
});
