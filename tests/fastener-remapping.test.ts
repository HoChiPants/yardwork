import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  part,
  projectSchema,
  material,
  uid,
  type V3,
} from "../src/model";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  refreshFastenerPlan,
  retainFastenerLabelHistory,
  saveFastenerPlan,
  changeFastenerProduct,
} from "../src/fastenings";
import {
  applyFastenerRemap,
  previewFastenerRemap,
  type FastenerRemapChoice,
} from "../src/fastenerRemapping";
import {
  FASTENER_REFERENCE_HISTORY_LIMIT,
  emptyFastenerMeasurements,
  fastenerPlanSchema,
} from "../src/fasteningSchema";
import { assertFastenerHistoryPrefix } from "../src/fastenerHistory";
import { cutPiece } from "../src/engine";
import { composeRotation, rotate } from "../src/spatial";
function fixture() {
  let p = blank("SYNTHETIC explicit member mapping");
  const oldHead = part(
      "Same name",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, 0],
      p.steps[0].id,
      "",
    ),
    oldReceiver = part(
      "Receiver",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, -0.953],
      p.steps[0].id,
      "",
    ),
    newHead = part(
      "Same name",
      "plytanium-703",
      [20, 20, 0.703],
      [30, 0, 0],
      p.steps[0].id,
      "",
    ),
    newReceiver = part(
      "Receiver",
      "plytanium-703",
      [20, 20, 0.703],
      [30, 0, -0.953],
      p.steps[0].id,
      "",
    );
  p.pieces = [oldHead, oldReceiver, newHead, newReceiver];
  let intent = addFastenerLocation(
    makeFastenerPlan(p, oldHead.id, oldReceiver.id),
  );
  intent.locations[0].entranceLocal = [1.25, -1, 0.3515];
  intent.locations[0].driveLocal = [0, 0, -1];
  intent.measurements = {
    surfaceToTipDepth: 1.2,
    pilotDiameter: 0.125,
    pilotDepth: 1.3,
    basis: "  SYNTHETIC exact original user measurement\nwith whitespace  ",
    measuredAt: "2026-11-15T10:00:00.000Z",
  };
  intent.notes = "Keep my original plan note.";
  p = saveFastenerPlan(p, intent);
  const choice: FastenerRemapChoice = {
    headPieceId: newHead.id,
    receiverPieceId: newReceiver.id,
    locationMode: "clear",
    basis: "User explicitly selected actual replacement IDs.",
  };
  return {
    p,
    id: intent.id,
    oldHead,
    oldReceiver,
    newHead,
    newReceiver,
    choice,
  };
}
test("new references capture actual dimensions, source stock/cuts/pose and printed labels", () => {
  const f = fixture(),
    ref = f.p.fastenerPlans[0].head,
    b = ref.baseline!;
  assert.deepEqual(b.size, [10, 10, 0.703]);
  assert.deepEqual(b.stockSize, [47.938, 0.703, 95.938]);
  assert.equal(b.productRegistryRef, "plytanium-bc-201428");
  assert.equal(b.material, "plytanium-703");
  assert.match(b.partLabel, /^P\d+/);
  assert.deepEqual(b.position, f.oldHead.position);
  assert.deepEqual(b.cutPlanes, []);
  assert.equal(b.cutStock, null);
});
test("format5-style references default to unknown baselines without fabricating historical geometry", () => {
  const f = fixture(),
    raw = JSON.parse(JSON.stringify(f.p.fastenerPlans[0]));
  delete raw.head.baseline;
  delete raw.receiver.baseline;
  delete raw.referenceHistory;
  const legacy = fastenerPlanSchema.parse(raw);
  assert.equal(legacy.head.baseline, null);
  assert.equal(legacy.receiver.baseline, null);
  assert.deepEqual(legacy.referenceHistory, []);
  f.p.fastenerPlans = [legacy];
  assert.deepEqual(
    refreshFastenerPlan(f.p, legacy),
    legacy,
    "A current legacy ref stays unknown on a no-op refresh.",
  );
  const preview = previewFastenerRemap(f.p, f.id, f.choice);
  assert.equal(preview.comparison.previousHead.baseline, null);
  assert.ok(preview.comparison.selectedHead.baseline);
  assert.equal(preview.plan.referenceHistory[0].previous.head.baseline, null);
});
test("preview/cancel is nonmutating and clear mode preserves W/F identities while resetting measurements", () => {
  const f = fixture(),
    before = structuredClone(f.p),
    old = f.p.fastenerPlans[0],
    preview = previewFastenerRemap(f.p, f.id, f.choice);
  assert.deepEqual(f.p, before);
  assert.equal(preview.plan.id, old.id);
  assert.equal(preview.plan.label, old.label);
  assert.deepEqual(
    preview.plan.locations.map((p) => [p.id, p.label, p.name]),
    old.locations.map((p) => [p.id, p.label, p.name]),
  );
  assert.ok(
    preview.plan.locations.every(
      (p) => p.entranceLocal === null && p.driveLocal === null,
    ),
  );
  assert.equal(preview.plan.nextLocationNumber, old.nextLocationNumber);
  assert.equal(preview.plan.notes, old.notes);
  assert.deepEqual(preview.plan.measurements, emptyFastenerMeasurements());
  assert.equal(preview.comparison.clearedLocationCount, 1);
  assert.equal(preview.plan.head.pieceId, f.newHead.id);
  assert.equal(
    preview.plan.head.name,
    old.head.name,
    "Names never determine the selected ID.",
  );
  assert.deepEqual(preview.plan.head.baseline!.size, [20, 20, 0.703]);
});
test("explicit retain-local never scales/translates raw local values or retains measured depths", () => {
  const f = fixture(),
    choice = { ...f.choice, locationMode: "retain-local" as const },
    old = f.p.fastenerPlans[0],
    preview = previewFastenerRemap(f.p, f.id, choice);
  assert.deepEqual(preview.plan.locations, old.locations);
  assert.deepEqual(preview.plan.measurements, emptyFastenerMeasurements());
  assert.equal(preview.review.state, "needs-measurements");
  assert.equal(preview.review.locations[0].tipWorld, null);
  const next = applyFastenerRemap(f.p, f.id, choice, preview.token),
    plan = next.fastenerPlans[0],
    history = plan.referenceHistory[0];
  assert.equal(history.kind, "remap");
  assert.equal(history.locationMode, "retain-local");
  assert.deepEqual(history.previous.locations, old.locations);
  assert.deepEqual(history.previous.measurements, old.measurements);
  assert.deepEqual(history.previous.head, old.head);
  assert.deepEqual(history.next.head, plan.head);
  assert.deepEqual(next.pieces, f.p.pieces);
  assert.deepEqual(next.joints, f.p.joints);
  assert.equal(plan.referenceHistory.length, 1);
  assert.throws(
    () => applyFastenerRemap(next, f.id, choice, preview.token),
    /already current|changed|preview/,
  );
});
test("mapping accepts stale/missing old IDs only through explicit current UUID choices", () => {
  const f = fixture();
  f.p.pieces = f.p.pieces.filter(
    (p) => p.id !== f.oldHead.id && p.id !== f.oldReceiver.id,
  );
  assert.equal(fastenerReviews(f.p)[0].state, "stale");
  const preview = previewFastenerRemap(f.p, f.id, f.choice),
    next = applyFastenerRemap(f.p, f.id, f.choice, preview.token);
  assert.equal(next.fastenerPlans[0].head.pieceId, f.newHead.id);
  assert.equal(
    next.fastenerPlans[0].referenceHistory[0].previous.head.pieceId,
    f.oldHead.id,
  );
  assert.deepEqual(
    next.fastenerPlans[0].referenceHistory[0].previous.measurements,
    f.p.fastenerPlans[0].measurements,
  );
});
test("mapping rejects guessed/missing/foreign/offcut/nonwood/same-ID or identical endpoints and empty basis", () => {
  for (const variant of [
    "foreign",
    "offcut",
    "metal",
    "same",
    "identical",
    "basis",
  ] as const) {
    const f = fixture(),
      choice = { ...f.choice };
    if (variant === "foreign") choice.headPieceId = uid();
    if (variant === "offcut") f.newHead.offcut = true;
    if (variant === "metal") f.newHead.material = "roof";
    if (variant === "same") {
      choice.headPieceId = f.oldHead.id;
      choice.receiverPieceId = f.oldReceiver.id;
    }
    if (variant === "identical") choice.receiverPieceId = choice.headPieceId;
    if (variant === "basis") choice.basis = "   ";
    // Saved project parsing clones pieces; edit the actual selected record deliberately.
    if (variant === "offcut")
      f.p.pieces.find((p) => p.id === f.newHead.id)!.offcut = true;
    if (variant === "metal")
      f.p.pieces.find((p) => p.id === f.newHead.id)!.material = "roof";
    assert.throws(() => previewFastenerRemap(f.p, f.id, choice), variant);
  }
});
test("preview tokens ignore generated receipt IDs/times but reject selected geometry/relative/source changes", () => {
  for (const change of ["move", "cut", "source", "plan", "choice"] as const) {
    const f = fixture(),
      preview = previewFastenerRemap(f.p, f.id, f.choice),
      p = structuredClone(f.p),
      choice = { ...f.choice };
    const target = p.pieces.find((p) => p.id === f.newReceiver.id)!;
    if (change === "move") target.position[0] += 0.25;
    if (change === "cut")
      target.cutPlanes = [{ normal: [1, 0, 0], constant: 0 }];
    if (change === "source") target.stockLengthAxis = 1;
    if (change === "plan") p.fastenerPlans[0].notes += " changed";
    if (change === "choice") choice.basis += " new basis";
    assert.throws(
      () => applyFastenerRemap(p, f.id, choice, preview.token),
      /changed|preview/,
    );
  }
  const f = fixture(),
    a = previewFastenerRemap(f.p, f.id, f.choice),
    b = previewFastenerRemap(f.p, f.id, f.choice);
  assert.notEqual(a.plan.referenceHistory[0].id, b.plan.referenceHistory[0].id);
  assert.equal(a.token, b.token);
});
test("retained-local path tokens reject entering obstructions and new coincident fastener paths", () => {
  const f = fixture(),
    choice = { ...f.choice, locationMode: "retain-local" as const },
    preview = previewFastenerRemap(f.p, f.id, choice);
  const blocked = structuredClone(f.p),
    layer = part(
      "Third layer",
      "roof",
      [2, 2, 0.04],
      [31.25, -1, -0.4765],
      blocked.steps[0].id,
      "",
    );
  blocked.pieces.push(layer);
  assert.equal(
    previewFastenerRemap(blocked, f.id, choice).review.state,
    "conflict",
  );
  assert.throws(
    () => applyFastenerRemap(blocked, f.id, choice, preview.token),
    /changed|preview/,
  );
  let other = addFastenerLocation(
    makeFastenerPlan(f.p, f.newHead.id, f.newReceiver.id),
  );
  other.locations[0].entranceLocal = [
    ...f.p.fastenerPlans[0].locations[0].entranceLocal!,
  ];
  other.locations[0].driveLocal = [0, 0, -1];
  const duplicate = saveFastenerPlan(f.p, other);
  assert.throws(
    () => applyFastenerRemap(duplicate, f.id, choice, preview.token),
    /changed|preview/,
  );
});
test("unrelated metadata/off-ray pieces and no-op saves do not invalidate a preview", () => {
  const f = fixture(),
    preview = previewFastenerRemap(f.p, f.id, f.choice),
    p = structuredClone(f.p);
  p.name = "Renamed project";
  p.notes += "Metadata";
  p.updatedAt = "2026-11-16T10:00:00Z";
  p.fastenerPlans[0].nextLocationNumber += 1;
  p.fastenerPlans[0].updatedAt = "2026-11-16T10:00:00Z";
  p.pieces.push(
    part("Off ray", "stud", [1.5, 96, 3.5], [200, 48, 200], p.steps[0].id, ""),
  );
  assert.equal(previewFastenerRemap(p, f.id, f.choice).token, preview.token);
  const next = applyFastenerRemap(p, f.id, f.choice, preview.token);
  assert.equal(
    next.fastenerPlans[0].nextLocationNumber,
    p.fastenerPlans[0].nextLocationNumber,
  );
});
test("changed same-ID refresh archives original baseline/locations/measurements and resets current values", () => {
  const f = fixture(),
    old = structuredClone(f.p.fastenerPlans[0]),
    p = cutPiece(f.p, f.oldReceiver.id, 4, 1),
    refreshed = refreshFastenerPlan(p, old);
  assert.deepEqual(refreshed.locations, old.locations);
  assert.deepEqual(refreshed.measurements, emptyFastenerMeasurements());
  assert.equal(refreshed.referenceHistory.length, 1);
  assert.equal(refreshed.referenceHistory[0].kind, "refresh");
  assert.deepEqual(
    refreshed.referenceHistory[0].previous.receiver.baseline,
    old.receiver.baseline,
  );
  assert.deepEqual(
    refreshed.referenceHistory[0].previous.measurements,
    old.measurements,
  );
  assert.ok(refreshed.receiver.baseline!.cutStock);
  assert.notDeepEqual(
    refreshed.receiver.baseline!.size,
    old.receiver.baseline!.size,
  );
  const saved = saveFastenerPlan(p, refreshed);
  assert.deepEqual(
    saved.fastenerPlans[0].referenceHistory,
    refreshed.referenceHistory,
  );
  assert.deepEqual(
    refreshFastenerPlan(saved, saved.fastenerPlans[0]),
    saved.fastenerPlans[0],
  );
});
test("no-op and shared full-Euler rigid refresh preserve the entire plan including measured inputs", () => {
  const f = fixture(),
    old = structuredClone(f.p.fastenerPlans[0]);
  assert.deepEqual(refreshFastenerPlan(f.p, old), old);
  const rotation: V3 = [0.6, -0.8, 1.1],
    shift: V3 = [50, 20, -10];
  for (const p of f.p.pieces) {
    p.position = rotate(p.position, rotation).map((v, i) => v + shift[i]) as V3;
    p.rotation = composeRotation(rotation, p.rotation);
  }
  assert.deepEqual(refreshFastenerPlan(f.p, old), old);
});
test("same-ID refresh keeps an unknown legacy prior baseline unknown in history", () => {
  const f = fixture();
  f.p.fastenerPlans[0].head.baseline = null;
  f.p.fastenerPlans[0].receiver.baseline = null;
  f.p.pieces.find((p) => p.id === f.oldReceiver.id)!.position[0] += 0.1;
  const refreshed = refreshFastenerPlan(f.p, f.p.fastenerPlans[0]);
  assert.equal(refreshed.referenceHistory[0].previous.receiver.baseline, null);
  assert.ok(refreshed.receiver.baseline);
});
for (const field of ["productReference", "stockSize"] as const)
  test(`captured catalog ${field} changes stale the plan before refresh and retain the exact old baseline`, () => {
    const f = fixture(),
      old = structuredClone(f.p.fastenerPlans[0]),
      stock = material("plytanium-703"),
      originalReference = stock.productReference,
      originalSize = stock.stockSize;
    try {
      if (field === "productReference")
        stock.productReference = "synthetic-revised-source";
      else stock.stockSize = [47.938, 0.8, 95.938];
      const review = fastenerReviews(f.p)[0];
      assert.equal(review.state, "stale");
      assert.equal(review.activePointCount, 0);
      assert.ok(review.issues.some((i) => i.code === "stale-source"));
      const refreshed = refreshFastenerPlan(f.p, old);
      assert.deepEqual(
        refreshed.referenceHistory[0].previous.head.baseline,
        old.head.baseline,
      );
      assert.deepEqual(refreshed.measurements, emptyFastenerMeasurements());
      assert.notDeepEqual(refreshed.head.baseline, old.head.baseline);
      const legacy = structuredClone(f.p);
      legacy.fastenerPlans[0].head.baseline = null;
      legacy.fastenerPlans[0].receiver.baseline = null;
      assert.equal(
        fastenerReviews(legacy)[0].state,
        "path-reviewed",
        "An unknown past source is not guessed from current stock.",
      );
    } finally {
      if (originalReference === undefined) delete stock.productReference;
      else stock.productReference = originalReference;
      if (originalSize === undefined) delete stock.stockSize;
      else stock.stockSize = originalSize;
    }
    assert.equal(fastenerReviews(f.p)[0].state, "path-reviewed");
  });
test("ordinary saves preserve immutable history and refuse unreviewed reference changes", () => {
  const f = fixture(),
    preview = previewFastenerRemap(f.p, f.id, f.choice),
    p = applyFastenerRemap(f.p, f.id, f.choice, preview.token),
    plan = p.fastenerPlans[0];
  const trimmed = structuredClone(plan);
  trimmed.referenceHistory = [];
  assert.throws(() => saveFastenerPlan(p, trimmed), /append-only/);
  const changed = structuredClone(plan);
  changed.referenceHistory[0].previous.measurements.basis = "rewrite";
  assert.throws(() => saveFastenerPlan(p, changed), /append-only/);
  const direct = structuredClone(plan);
  direct.receiver = structuredClone(plan.referenceHistory[0].previous.receiver);
  assert.throws(() => saveFastenerPlan(p, direct), /explicit reviewed/);
  const edited = structuredClone(plan);
  edited.notes += " User note";
  assert.deepEqual(
    saveFastenerPlan(p, edited).fastenerPlans[0].referenceHistory,
    plan.referenceHistory,
  );
});
test("explicit product edits archive the saved prior inputs and retain unsaved local/notes edits even with missing refs", () => {
  const f = fixture(),
    saved = structuredClone(f.p.fastenerPlans[0]),
    draft = structuredClone(saved);
  draft.notes += " unsaved note";
  draft.locations[0].entranceLocal = [2.5, -2, 0.3515];
  f.p.pieces = f.p.pieces.filter((p) => p.id !== f.oldReceiver.id);
  const changed = changeFastenerProduct(f.p, draft, "grk-cabinet-113079");
  assert.deepEqual(changed.head, saved.head);
  assert.deepEqual(changed.receiver, saved.receiver);
  assert.deepEqual(changed.locations, draft.locations);
  assert.equal(changed.notes, draft.notes);
  assert.deepEqual(changed.measurements, emptyFastenerMeasurements());
  assert.deepEqual(
    changed.referenceHistory[0].previous.measurements,
    saved.measurements,
  );
  assert.deepEqual(
    changed.referenceHistory[0].previous.locations,
    saved.locations,
  );
  assert.equal(changed.referenceHistory[0].previous.productId, saved.productId);
  assert.match(changed.referenceHistory[0].basis, /product reference change/);
  const next = saveFastenerPlan(f.p, changed);
  assert.equal(next.fastenerPlans[0].productId, "grk-cabinet-113079");
  assert.equal(fastenerReviews(next)[0].state, "stale");
  assert.deepEqual(
    changeFastenerProduct(next, next.fastenerPlans[0], "grk-cabinet-113079"),
    next.fastenerPlans[0],
  );
  assert.throws(
    () =>
      refreshFastenerPlan(f.p, {
        ...saved,
        receiver: { ...saved.receiver, pieceId: f.newReceiver.id },
      }),
    /mapping preview/,
  );
});
test("Undo/Redo retains one immutable receipt and mapping after Undo appends another branch", () => {
  const f = fixture(),
    preview = previewFastenerRemap(f.p, f.id, f.choice),
    mapped = applyFastenerRemap(f.p, f.id, f.choice, preview.token),
    undone = retainFastenerLabelHistory(f.p, mapped),
    old = f.p.fastenerPlans[0];
  assert.deepEqual(undone.fastenerPlans[0].head, old.head);
  assert.deepEqual(undone.fastenerPlans[0].locations, old.locations);
  assert.deepEqual(undone.fastenerPlans[0].measurements, old.measurements);
  assert.equal(undone.fastenerPlans[0].referenceHistory.length, 1);
  const redone = retainFastenerLabelHistory(mapped, undone);
  assert.equal(redone.fastenerPlans[0].referenceHistory.length, 1);
  const again = previewFastenerRemap(undone, f.id, f.choice),
    branched = applyFastenerRemap(undone, f.id, f.choice, again.token);
  assert.equal(branched.fastenerPlans[0].referenceHistory.length, 2);
  assert.deepEqual(
    branched.fastenerPlans[0].referenceHistory[0],
    mapped.fastenerPlans[0].referenceHistory[0],
  );
  const conflict = structuredClone(mapped);
  conflict.fastenerPlans[0].referenceHistory[0].basis = "rewritten";
  assert.throws(
    () => retainFastenerLabelHistory(conflict, mapped),
    /Conflicting reference history/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(branched))),
    branched,
  );
});
test("bounded history refuses another replacement without truncating prior records", () => {
  const f = fixture(),
    row = previewFastenerRemap(f.p, f.id, f.choice).plan.referenceHistory[0];
  f.p.fastenerPlans[0].referenceHistory = Array.from(
    { length: FASTENER_REFERENCE_HISTORY_LIMIT },
    () => ({ ...structuredClone(row), id: uid() }),
  );
  const before = JSON.stringify(f.p);
  assert.throws(
    () => previewFastenerRemap(f.p, f.id, f.choice),
    /history is full/,
  );
  assert.equal(JSON.stringify(f.p), before);
});
test("neutral persistence guard rejects truncation/rewrites but permits removal, new plans and Undo active mappings", () => {
  const f = fixture(),
    preview = previewFastenerRemap(f.p, f.id, f.choice),
    mapped = applyFastenerRemap(f.p, f.id, f.choice, preview.token),
    undone = retainFastenerLabelHistory(f.p, mapped);
  assert.throws(
    () => assertFastenerHistoryPrefix(mapped.fastenerPlans, f.p.fastenerPlans),
    /append-only/,
  );
  const rewritten = structuredClone(mapped.fastenerPlans);
  rewritten[0].referenceHistory[0].basis = "changed";
  assert.throws(
    () => assertFastenerHistoryPrefix(mapped.fastenerPlans, rewritten),
    /append-only/,
  );
  assert.doesNotThrow(() =>
    assertFastenerHistoryPrefix(mapped.fastenerPlans, undone.fastenerPlans),
  );
  assert.doesNotThrow(() =>
    assertFastenerHistoryPrefix(mapped.fastenerPlans, []),
  );
  assert.doesNotThrow(() =>
    assertFastenerHistoryPrefix([], mapped.fastenerPlans),
  );
  assert.doesNotThrow(() =>
    assertFastenerHistoryPrefix([{ id: f.id }], mapped.fastenerPlans),
  );
});
