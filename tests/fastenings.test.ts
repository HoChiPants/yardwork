import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  normalizedFastenerDrive,
  refreshFastenerPlan,
  removeFastenerPlan,
  retainFastenerLabelHistory,
  saveFastenerPlan,
  qualifiedFastenerLabel,
  suggestCenteredFastener,
} from "../src/fastenings";
import { cutAngledEnd } from "../src/cutPlan";
import { fastenerPlanSchema } from "../src/fasteningSchema";
import { getWoodFastenerProduct } from "../src/fastenerProducts";
import { composeRotation, rotate } from "../src/spatial";
import { createBuildStudy } from "../src/buildFixtures";
const now = Date.parse("2026-11-17T10:00:00Z");
const near = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-6,
    `${actual} != ${expected}`,
  );
function fixture(gap = 0.25) {
  const p = blank("SYNTHETIC centerline test"),
    t = 0.703;
  p.pieces = [
    part(
      "Head panel",
      "plytanium-703",
      [10, 10, t],
      [0, 0, 0],
      p.steps[0].id,
      "",
    ),
    part(
      "Receiver panel",
      "plytanium-703",
      [10, 10, t],
      [0, 0, -t - gap],
      p.steps[0].id,
      "",
    ),
  ];
  return p;
}
function plan(p: Project, depth: number | null = 1.2) {
  const initial = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
    next = addFastenerLocation(initial);
  next.locations[0].entranceLocal = [0, 0, 0.703 / 2];
  next.locations[0].driveLocal = [0, 0, -1];
  if (depth !== null)
    next.measurements = {
      ...next.measurements,
      surfaceToTipDepth: depth,
      basis: "SYNTHETIC user datum after proposed seating",
      measuredAt: "2026-11-17T09:00:00Z",
    };
  return next;
}
function review(p: Project, intent = plan(p)) {
  return fastenerReviews(saveFastenerPlan(p, intent), now)[0];
}

test("centered entry uses the actual patch and leaves all measurements pending on angled stock", () => {
  const p = fixture(0);
  const [head, receiver] = p.pieces;
  receiver.position[0] = 0.5;
  receiver.position[1] = -1;
  receiver.size = [3, 4, 0.703];
  let cut = cutAngledEnd(p, head.id, "width", [7.25, 8.75], "start");
  const origin: V3 = [33, 21, -66], rotation: V3 = [0.2, 0.43, 0.13];
  const transform = (point: V3) => rotate(point, rotation).map((v, i) => v + origin[i]);
  cut = {
    ...cut,
    pieces: cut.pieces.map((member) => ({
      ...member,
      rotation: composeRotation(rotation, member.rotation),
      position: transform(member.position) as V3,
    })),
  };
  const original = JSON.stringify(cut);
  const { plan: seeded, review: result } = suggestCenteredFastener(cut, head.id, receiver.id);
  assert.equal(JSON.stringify(cut), original);
  assert.equal(seeded.measurements.surfaceToTipDepth, null);
  assert.equal(seeded.measurements.pilotDiameter, null);
  assert.equal(seeded.measurements.pilotDepth, null);
  assert.equal(result.state, "needs-measurements");
  assert.equal(result.locations[0].tipWorld, null);
  near(result.locations[0].headExitDepth, 0.703);
  assert.equal(result.locations[0].gap, 0);
  const expected = transform([0.5, -1, 0.703 / 2]);
  expected.forEach((value, i) => near(result.locations[0].entranceWorld![i], value));
  const saved = saveFastenerPlan(cut, seeded);
  assert.equal(fastenerReviews(saved)[0].activePointCount, 1);
  assert.throws(() => suggestCenteredFastener(saved, head.id, receiver.id), /explicit locations occupy the same/);

  const forged = structuredClone(cut);
  const remnant = forged.pieces.find((member) => member.offcut)!;
  remnant.cutStock!.offset[0] -= 0.2;
  assert.throws(() => suggestCenteredFastener(forged, head.id, receiver.id), /cut source/);
});

test("centered entry requires contact and an uncovered outer face", () => {
  const p = fixture(0.0625), [head, receiver] = p.pieces;
  assert.throws(() => suggestCenteredFastener(p, head.id, receiver.id), /direct contact/);
  receiver.position[2] = -0.703;
  const cover = { ...head, id: uid(), position: [0, 0, 0.703] as V3 };
  p.pieces.push(cover);
  assert.throws(() => suggestCenteredFastener(p, head.id, receiver.id), /covers the centered entry/);
  cover.offcut = true;
  assert.equal(suggestCenteredFastener(p, head.id, receiver.id).review.locations[0].gap, 0);
  head.cutPlanes = [{ normal: [Math.sin(0.001), 0, Math.cos(0.001)], constant: 0.3 }];
  assert.throws(() => suggestCenteredFastener(p, head.id, receiver.id), /opposite entry face/);
});

test("factories create zero points and unknown depths, retain trusted source revision, and never use nominal length", () => {
  const p = fixture(),
    intent = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id);
  assert.equal(intent.locations.length, 0);
  assert.equal(intent.nextLocationNumber, 1);
  assert.equal(intent.measurements.surfaceToTipDepth, null);
  assert.equal(intent.measurements.pilotDiameter, null);
  assert.equal(
    intent.productEvidenceRevision,
    getWoodFastenerProduct(intent.productId)!.evidenceRevision,
  );
  const result = review(p, intent);
  assert.equal(result.state, "needs-measurements");
  assert.equal(result.activePointCount, 0);
  assert.equal(fastenerReviews(blank()).length, 0);
});
test("pending explicit locations count provisionally and durable labels never reuse deleted numbers", () => {
  const p = fixture();
  let intent = addFastenerLocation(
    makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
  );
  assert.equal(intent.locations[0].label, "F001");
  assert.equal(review(p, intent).activePointCount, 1);
  intent.locations = [];
  intent = addFastenerLocation(intent);
  assert.equal(intent.locations[0].label, "F002");
  intent = addFastenerLocation(intent);
  intent.locations.reverse();
  assert.deepEqual(
    intent.locations.map((l) => l.label),
    ["F003", "F002"],
  );
  assert.equal(intent.nextLocationNumber, 4);
  assert.throws(() =>
    fastenerPlanSchema.parse({ ...intent, nextLocationNumber: 2 }),
  );
});
test("undo/redo preserve reserved labels without allocating or relabeling existing points", () => {
  const p = fixture(),
    first = plan(p),
    one = saveFastenerPlan(p, first),
    second = addFastenerLocation(first),
    two = saveFastenerPlan(one, second),
    undone = retainFastenerLabelHistory(one, two);
  assert.equal(undone.fastenerPlans[0].nextLocationNumber, 3);
  assert.deepEqual(undone.fastenerPlans[0].locations, first.locations);
  const third = addFastenerLocation(undone.fastenerPlans[0]);
  assert.equal(third.locations.at(-1)!.label, "F003");
  assert.throws(() => saveFastenerPlan(two, first), /backwards/);
  const changedLabel = structuredClone(second);
  changedLabel.locations[0].label = "F003";
  changedLabel.nextLocationNumber = 4;
  assert.throws(() => saveFastenerPlan(two, changedLabel), /durable labels/);
  const redone = retainFastenerLabelHistory(
    two,
    saveFastenerPlan(undone, third),
  );
  assert.equal(redone.fastenerPlans[0].nextLocationNumber, 4);
  assert.deepEqual(redone.fastenerPlans[0].locations, second.locations);
});
test("actual .703 retained solids yield head exit, gap, receiver interval and user-depth penetration", () => {
  const r = review(fixture()),
    l = r.locations[0];
  assert.equal(r.state, "path-reviewed");
  assert.equal(r.activePointCount, 1);
  near(l.headExitDepth, 0.703);
  near(l.receiverEnterDepth, 0.953);
  near(l.receiverExitDepth, 1.656);
  near(l.gap, 0.25);
  near(l.penetration, 0.247);
  near(l.availableReceiverDepth, 0.703);
  near(l.tipWorld![2], 0.3515 - 1.2);
  assert.ok(r.issues.some((i) => i.code === "source-conflict"));
  assert.ok(r.issues.some((i) => i.code === "pilot-pending"));
});
test("unknown surface depth gives no tip, even when product nominal length is known", () => {
  const p = fixture(),
    r = review(p, plan(p, null));
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.activePointCount, 1);
  assert.equal(r.locations[0].tipWorld, null);
  assert.equal(r.locations[0].penetration, null);
  near(r.locations[0].headExitDepth, 0.703);
});
test("a known invalid entrance is excluded even when its drive direction is pending", () => {
  const p = fixture(),
    intent = plan(p);
  intent.locations[0].entranceLocal = [0, 0, 0];
  intent.locations[0].driveLocal = null;
  const r = review(p, intent);
  assert.equal(r.state, "conflict");
  assert.equal(r.activePointCount, 0);
  assert.ok(r.issues.some((i) => i.code === "head-entrance"));
});
test("inward face entry is required; interior, outside, removed face and outward directions conflict", () => {
  for (const [entrance, drive] of [
    [
      [0, 0, 0],
      [0, 0, -1],
    ],
    [
      [0, 0, 1],
      [0, 0, -1],
    ],
    [
      [0, 0, 0.3515],
      [0, 0, 1],
    ],
    [
      [5, 0, 0.3515],
      [0, 0, -1],
    ],
  ] as [V3, V3][]) {
    const p = fixture(),
      intent = plan(p);
    intent.locations[0].entranceLocal = entrance;
    intent.locations[0].driveLocal = drive;
    const r = review(p, intent);
    assert.equal(r.state, "conflict");
    assert.equal(r.activePointCount, 0);
    assert.ok(r.issues.some((i) => i.code === "head-entrance"));
  }
});
test("missed and overlapping receiving solids are conflicts rather than guessed contacts", () => {
  const p = fixture();
  p.pieces[1].position[0] = 20;
  let r = review(p);
  assert.ok(r.issues.some((i) => i.code === "missed-receiver"));
  assert.equal(r.activePointCount, 0);
  const overlap = fixture(-0.1);
  r = review(overlap);
  assert.ok(r.issues.some((i) => i.code === "member-overlap"));
  near(r.locations[0].gap, -0.1);
  assert.equal(r.activePointCount, 0);
});
test("short reach, boundary tip and breakthrough use actual receiving exit and reject demand", () => {
  for (const depth of [0.8, 0.953, 1.656, 2.5]) {
    const p = fixture(),
      r = review(p, plan(p, depth));
    assert.equal(r.state, "conflict");
    assert.equal(r.activePointCount, 0);
    assert.ok(
      r.issues.some(
        (i) =>
          i.code === (depth <= 0.953 ? "no-penetration" : "tip-breakthrough"),
      ),
    );
  }
});
test("explicit deepest pilot TIP depth can reveal breakthrough without inventing bit geometry", () => {
  const p = fixture(),
    intent = plan(p);
  intent.measurements.pilotDepth = 1.7;
  let r = review(p, intent);
  assert.ok(r.issues.some((i) => i.code === "pilot-breakthrough"));
  assert.equal(r.activePointCount, 0);
  intent.measurements.pilotDepth = 1.3;
  r = review(p, intent);
  assert.equal(r.state, "path-reviewed");
  assert.equal(intent.measurements.pilotDiameter, null);
});
test("pilot entrance edge conflicts use only explicit diameter and never product head diameter", () => {
  const p = fixture(),
    intent = plan(p);
  intent.locations[0].entranceLocal = [4.98, 0, 0.3515];
  assert.equal(review(p, intent).state, "path-reviewed");
  intent.measurements.pilotDiameter = 0.125;
  const r = review(p, intent);
  assert.ok(r.issues.some((i) => i.code === "pilot-entry-edge"));
  assert.equal(r.activePointCount, 0);
});
test("source/cut changes stale refs; explicit refresh preserves coordinates and detects a removed corner", () => {
  const p = fixture(),
    intent = plan(p);
  intent.locations[0].entranceLocal = [0, 1, 0.3515];
  p.pieces[0].cutPlanes = [{ normal: [0, 1, 0], constant: 0 }];
  const r = review(p, intent);
  assert.equal(r.state, "stale");
  assert.equal(r.locations[0].tipWorld, null);
  assert.equal(r.locations[0].headExitDepth, null);
  assert.equal(r.activePointCount, 0);
  const refreshed = refreshFastenerPlan(p, intent);
  assert.deepEqual(refreshed.locations, intent.locations);
  assert.equal(refreshed.id, intent.id);
  assert.equal(review(p, refreshed).state, "conflict");
  assert.ok(
    review(p, refreshed).issues.some((i) => i.code === "head-entrance"),
  );
});
test("actual cut-profile receiving exit is used rather than its uncut box", () => {
  const p = fixture();
  p.pieces[1].cutPlanes = [{ normal: [0, 0, -1], constant: 0 }];
  const r = review(p, plan(p, 1.5));
  near(r.locations[0].availableReceiverDepth, 0.703 / 2);
  assert.ok(r.issues.some((i) => i.code === "tip-breakthrough"));
});
test("an explicit entrance on a retained profile face uses that face rather than the original blank face", () => {
  const p = fixture();
  p.pieces[0].cutPlanes = [{ normal: [0, 0, 1], constant: 0 }];
  const intent = plan(p, 1);
  intent.locations[0].entranceLocal = [0, 0, 0];
  const r = review(p, intent);
  assert.equal(r.state, "path-reviewed");
  near(r.locations[0].headExitDepth, 0.703 / 2);
  near(r.locations[0].gap, 0.25);
  near(r.locations[0].receiverEnterDepth, 0.6015);
});
test("full Euler shared rigid motion preserves paths and local intent; relative motion stales", () => {
  const p = fixture(),
    intent = plan(p),
    initial = review(p, intent),
    rotation: V3 = [0.61, -0.83, 1.23],
    translation: V3 = [12, 30, -40];
  for (const piece of p.pieces) {
    piece.position = rotate(piece.position, rotation).map(
      (v, i) => v + translation[i],
    ) as V3;
    piece.rotation = composeRotation(rotation, piece.rotation);
  }
  const shared = review(p, intent);
  assert.equal(shared.state, "path-reviewed");
  near(shared.locations[0].penetration, initial.locations[0].penetration!);
  const expected = rotate(initial.locations[0].tipWorld!, rotation).map(
    (v, i) => v + translation[i],
  );
  shared.locations[0].tipWorld!.forEach((v, i) => near(v, expected[i]));
  p.pieces[1].position[0] += 0.1;
  assert.equal(review(p, intent).state, "stale");
  const refreshed = refreshFastenerPlan(p, intent);
  assert.deepEqual(refreshed.locations, intent.locations);
});
test("an independently rotated receiving panel uses its own local retained planes", () => {
  const p = fixture();
  p.pieces[1].size = [0.703, 10, 10];
  p.pieces[1].rotation = [0, Math.PI / 2, 0];
  const r = review(p);
  assert.equal(r.state, "path-reviewed");
  near(r.locations[0].receiverEnterDepth, 0.953);
  near(r.locations[0].availableReceiverDepth, 0.703);
});
test("oblique paths report ray distances rather than normal thickness as engagement", () => {
  const p = fixture(),
    intent = plan(p),
    drive = normalizedFastenerDrive([0.2, 0, -1]);
  intent.locations[0].driveLocal = drive;
  const r = review(p, intent);
  assert.equal(r.state, "path-reviewed");
  near(r.locations[0].headExitDepth, 0.703 / -drive[2]);
  near(r.locations[0].gap, 0.25 / -drive[2]);
  near(r.locations[0].penetration, 1.2 - 0.953 / -drive[2]);
});
test("missing/offcut/replaced parts remain stale and refresh never rebinds by name", () => {
  const p = fixture(),
    intent = plan(p);
  p.pieces[1].offcut = true;
  const r = review(p, intent);
  assert.equal(r.state, "stale");
  assert.equal(r.activePointCount, 0);
  assert.throws(() => refreshFastenerPlan(p, intent), /active part/);
  const old = p.pieces[1];
  p.pieces[1] = { ...old, id: uid(), offcut: false };
  assert.equal(review(p, intent).state, "stale");
  assert.throws(() => refreshFastenerPlan(p, intent));
});
test("refresh cannot bless metal substrates or enlarged/source-forged wood", () => {
  for (const edit of [
    (p: Project) => {
      p.pieces[1].material = "roof";
    },
    (p: Project) => {
      p.pieces[1].size[2] = 24;
    },
    (p: Project) => {
      p.pieces[1].cutStock = {
        id: uid(),
        size: [10, 10, 24],
        offset: [0, 0, 0],
      };
    },
  ]) {
    const p = fixture(),
      intent = plan(p);
    edit(p);
    const refreshed = refreshFastenerPlan(p, intent),
      r = review(p, refreshed);
    assert.equal(r.state, "conflict");
    assert.ok(r.issues.some((i) => i.code === "invalid-source"));
    assert.equal(r.activePointCount, 0);
  }
});
test("one conflicted point leaves another explicit pending point in demand", () => {
  const p = fixture();
  let intent = plan(p);
  intent.locations[0].entranceLocal = [0, 0, 0];
  intent = addFastenerLocation(intent);
  const r = review(p, intent);
  assert.equal(r.state, "conflict");
  assert.equal(r.activePointCount, 1);
  assert.deepEqual(
    r.locations.map((l) => l.includedInDemand),
    [false, true],
  );
});
test("three coincident points across plans all conflict, while distinct locations remain eligible", () => {
  const p = fixture();
  let a = plan(p);
  a = addFastenerLocation(a);
  a.locations[1] = {
    ...a.locations[1],
    entranceLocal: [...a.locations[0].entranceLocal!],
    driveLocal: [...a.locations[0].driveLocal!],
  };
  const firstSaved = saveFastenerPlan(p, a),
    b = plan(firstSaved);
  let saved = saveFastenerPlan(firstSaved, b);
  let reviews = fastenerReviews(saved, now);
  assert.deepEqual(
    reviews.map((r) => r.activePointCount),
    [0, 0],
  );
  b.locations[0].entranceLocal = [1, 0, 0.3515];
  saved = saveFastenerPlan(firstSaved, b);
  reviews = fastenerReviews(saved, now);
  assert.deepEqual(
    reviews.map((r) => r.activePointCount),
    [0, 1],
  );
});
test("plan namespaces distinguish identical names/endpoints and reserve deleted labels across undo", () => {
  const original = fixture(),
    a = plan(original),
    one = saveFastenerPlan(original, a),
    b = plan(one),
    two = saveFastenerPlan(one, b);
  assert.equal(a.label, "W001");
  assert.equal(b.label, "W002");
  assert.equal(qualifiedFastenerLabel(a, a.locations[0]), "W001/F001");
  assert.equal(qualifiedFastenerLabel(b, b.locations[0]), "W002/F001");
  const deleted = removeFastenerPlan(two, a.id),
    next = plan(deleted);
  assert.equal(next.label, "W003");
  const undone = retainFastenerLabelHistory(original, two),
    afterUndo = plan(undone);
  assert.equal(afterUndo.label, "W003");
  assert.equal(undone.fastenerPlanLabels.length, 2);
  assert.deepEqual(
    retainFastenerLabelHistory(fixture(), two).fastenerPlanLabels,
    [],
  );
  assert.throws(
    () => saveFastenerPlan(two, { ...a, label: "W003" }),
    /durable plan labels/,
  );
  const unsavedCollision = plan(original);
  assert.throws(
    () => saveFastenerPlan(one, unsavedCollision),
    /already reserved/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(deleted))).fastenerPlanLabels,
    deleted.fastenerPlanLabels,
  );
});
test("many coincident paths allocate at most one duplicate issue per location", () => {
  let p = fixture();
  for (let n = 0; n < 6; n++) {
    let intent = plan(p);
    for (let i = 1; i < 100; i++) {
      intent = addFastenerLocation(intent);
      intent.locations[i].entranceLocal = [0, 0, 0.3515];
      intent.locations[i].driveLocal = [0, 0, -1];
    }
    p = saveFastenerPlan(p, intent);
  }
  const reviews = fastenerReviews(p, now),
    points = reviews.flatMap((r) => r.locations);
  assert.equal(points.length, 600);
  assert.equal(
    reviews.reduce((n, r) => n + r.activePointCount, 0),
    0,
  );
  assert.ok(
    points.every(
      (p) =>
        p.issues.filter((i) => i.code === "duplicate-location").length === 1,
    ),
  );
  assert.equal(
    reviews
      .flatMap((r) => r.issues)
      .filter((i) => i.code === "duplicate-location").length,
    600,
  );
  assert.ok(reviews.reduce((n, r) => n + r.issues.length, 0) < 1200);
});
test("approximate duplicate chains retain marked neighbors as witnesses", () => {
  const p = fixture();
  let intent = plan(p);
  for (const x of [0.75e-6, 1.5e-6, 4e-6]) {
    intent = addFastenerLocation(intent);
    const point = intent.locations.at(-1)!;
    point.entranceLocal = [x, 0, 0.3515];
    point.driveLocal = [0, 0, -1];
  }
  const r = review(p, intent);
  assert.deepEqual(
    r.locations.map((p) => p.includedInDemand),
    [false, false, false, true],
  );
  assert.equal(r.activePointCount, 1);
});
function obstacle(p: Project, center: V3 = [0, 0, -0.4765]) {
  const other = part(
    "Unselected metal layer",
    "roof",
    [10, 10, 0.04],
    center,
    p.steps[0].id,
    "",
  );
  p.pieces.push(other);
  return other;
}
test("third retained solids in the gap conflict for known and pending screw depths", () => {
  for (const depth of [1.2, null]) {
    const p = fixture(),
      other = obstacle(p),
      r = review(p, plan(p, depth));
    assert.equal(r.state, "conflict");
    assert.equal(r.activePointCount, 0);
    assert.deepEqual(
      r.issues.find((i) => i.code === "unselected-layer")?.pieceIds,
      [other.id],
    );
  }
});
test("obstruction review follows the deeper explicit pilot path but not untraversed solids", () => {
  const p = fixture(),
    other = obstacle(p, [0, 0, -1.05]),
    intent = plan(p);
  assert.equal(review(p, intent).state, "path-reviewed");
  intent.measurements.pilotDepth = 1.5;
  assert.deepEqual(
    review(p, intent).issues.find((i) => i.code === "unselected-layer")
      ?.pieceIds,
    [other.id],
  );
  for (const position of [
    [20, 0, -0.4765],
    [0, 0, -2],
    [0, 0, 1],
  ] as V3[]) {
    other.position = position;
    assert.equal(review(p, intent).state, "path-reviewed");
  }
});
test("obstruction broad phase excludes offcuts and honors actual profile cutouts under full Euler motion", () => {
  const p = fixture(),
    other = obstacle(p);
  other.offcut = true;
  assert.equal(review(p).state, "path-reviewed");
  other.offcut = false;
  other.material = "plywood";
  other.cutPlanes = [{ normal: [1, 0, 0], constant: -1 }];
  const intent = plan(p);
  assert.equal(review(p, intent).state, "path-reviewed");
  const rotation: V3 = [0.6, -0.9, 1.2],
    shift: V3 = [30, 20, -10];
  for (const piece of p.pieces) {
    piece.position = rotate(piece.position, rotation).map(
      (v, i) => v + shift[i],
    ) as V3;
    piece.rotation = composeRotation(rotation, piece.rotation);
  }
  assert.equal(review(p, intent).state, "path-reviewed");
  other.cutPlanes = [];
  assert.ok(
    review(p, intent).issues.some((i) => i.code === "unselected-layer"),
  );
});
test("sharp edge entrances are rejected while redundant coplanar cuts and a single bevel remain valid", () => {
  const p = fixture(),
    intent = plan(p, 1.6);
  intent.locations[0].entranceLocal = [5, 0, 0.3515];
  intent.locations[0].driveLocal = normalizedFastenerDrive([-1, 0, -1]);
  intent.measurements.pilotDiameter = 0.125;
  intent.measurements.pilotDepth = 1.6;
  assert.equal(review(p, intent).state, "conflict");
  const coplanar = fixture();
  coplanar.pieces[0].cutPlanes = [{ normal: [0, 0, 1], constant: 0.3515 }];
  assert.equal(review(coplanar).state, "path-reviewed");
  const bevel = fixture();
  bevel.pieces[0].cutPlanes = [
    { normal: normalizedFastenerDrive([1, 0, 1]), constant: 0 },
  ];
  const beveled = plan(bevel, 1.2);
  beveled.locations[0].entranceLocal = [0, 0, 0];
  beveled.locations[0].driveLocal = normalizedFastenerDrive([-1, 0, -1]);
  assert.equal(review(bevel, beveled).state, "path-reviewed");
});
test("schema rejects nonunit directions, unproven dimensions, duplicate labels and source flags", () => {
  const p = fixture(),
    intent = plan(p);
  assert.deepEqual(normalizedFastenerDrive([0, 0, -2]), [0, 0, -1]);
  assert.throws(() => normalizedFastenerDrive([0, 0, 0]));
  assert.equal(
    fastenerPlanSchema.safeParse({
      ...intent,
      locations: [{ ...intent.locations[0], driveLocal: [0, 0, -2] }],
    }).success,
    false,
  );
  assert.equal(
    fastenerPlanSchema.safeParse({
      ...intent,
      measurements: { ...intent.measurements, basis: "" },
    }).success,
    false,
  );
  assert.equal(
    fastenerPlanSchema.safeParse({ ...intent, manufacturerVerified: true })
      .success,
    false,
  );
  const future = structuredClone(intent);
  future.measurements.measuredAt = "2027-01-01T00:00:00Z";
  const r = review(p, future);
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.locations[0].tipWorld, null);
});
test("product evidence change is stale until explicit same-point refresh, with both conflicts preserved", () => {
  const p = fixture(),
    intent = plan(p);
  intent.productId = "grk-cabinet-113079";
  assert.equal(review(p, intent).state, "stale");
  const refreshed = refreshFastenerPlan(p, intent);
  assert.deepEqual(refreshed.locations, intent.locations);
  assert.equal(review(p, refreshed).state, "needs-measurements");
  assert.equal(refreshed.measurements.surfaceToTipDepth, null);
  assert.deepEqual(
    refreshed.referenceHistory[0].previous.measurements,
    intent.measurements,
  );
  assert.ok(
    review(p, refreshed).issues.some((i) => i.code === "source-conflict"),
  );
});
test("save/reopen/removal preserve refs, measurements and locations without inventing joints", () => {
  const p = fixture(),
    intent = plan(p),
    saved = saveFastenerPlan(p, intent),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.fastenerPlans, saved.fastenerPlans);
  assert.deepEqual(fastenerReviews(reopened, now), fastenerReviews(saved, now));
  assert.equal(saved.joints.length, 0);
  assert.equal(saved.pieces.length, 2);
  assert.equal(removeFastenerPlan(reopened, intent.id).fastenerPlans.length, 0);
  assert.equal(p.fastenerPlans.length, 0);
});
test("actual .703 five-panel carcass pair supports explicit path but no plywood-edge approval", () => {
  const p = createBuildStudy("shelves", undefined, undefined, {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    }).project,
    entry = p.ideaBindings[0].entries[0],
    find = (role: string) =>
      p.pieces.find((piece) =>
        p.sections
          .find(
            (s) =>
              s.id === entry.sections.find((m) => m.role === role)!.sectionId,
          )!
          .pieceIds.includes(piece.id),
      )!,
    head = find("side-left"),
    receiver = find("bottom");
  let intent = addFastenerLocation(makeFastenerPlan(p, head.id, receiver.id));
  intent.locations[0].entranceLocal = [
    -0.703 / 2,
    -head.size[1] / 2 + 0.703 / 2,
    0,
  ];
  intent.locations[0].driveLocal = [1, 0, 0];
  intent.measurements = {
    ...intent.measurements,
    surfaceToTipDepth: 1.5,
    basis: "SYNTHETIC edge fastening candidate",
    measuredAt: "2026-11-17T09:00:00Z",
  };
  const r = review(p, intent);
  assert.equal(r.state, "path-reviewed");
  near(r.locations[0].headExitDepth, 0.703);
  assert.ok(r.issues.some((i) => i.code === "path-only"));
});
