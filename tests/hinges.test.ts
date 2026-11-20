import test from "node:test";
import assert from "node:assert/strict";
import { part, projectSchema, type V3 } from "../src/model";
import {
  lidHingeReviews,
  selectHingeMotion,
  saveLidHingePlan,
  refreshHingePlan,
  previewHingeRemap,
  applyHingeRemap,
  hingePurchaseAllocations,
} from "../src/hinges";
import { lidAxisSegment, lidPreview, reviewLidTravel } from "../src/lidMotion";
import {
  duplicateSection,
  resizeRecipeSection,
  setSectionLidOpen,
  transformSection,
} from "../src/sections";
import { updateHingeStockSource } from "../src/hingeStock";
import { hingePurchaseSummary } from "../src/hingePurchases";
import { retainHingeLabelHistory } from "../src/hingeHistory";
import { rotate } from "../src/spatial";
import {
  measuredHingeFixture,
  syntheticBasis,
  datumAt,
} from "./fixtures/measuredHinge";
import {
  bindingPlan,
  bindingToken,
  applyIdeaRevision,
  previewIdeaRevision,
} from "../src/ideaBindings";

function near(a: V3, b: V3, tolerance = 1e-8) {
  a.forEach((v, i) =>
    assert.ok(Math.abs(v - b[i]) < tolerance, `${a} != ${b}`),
  );
}
test("explicit paired datums resolve only the allocated measured segment, not nominal stock", () => {
  const p = measuredHingeFixture(),
    review = lidHingeReviews(p)[0];
  assert.equal(review.state, "geometry-reviewed");
  near(review.resolvedAxis!.pivot, [-11.375, 17.35, -12.1]);
  near(review.resolvedAxis!.axis, [1, 0, 0]);
  assert.equal(review.resolvedAxis!.length, 22.75);
  assert.equal(
    review.locations.every((hole) => hole.state === "geometry-reviewed"),
    true,
  );
  const missing = structuredClone(p);
  missing.lidHingePlans[0].stockAllocation = null;
  assert.equal(lidHingeReviews(missing)[0].resolvedAxis, null);
  assert.throws(
    () => selectHingeMotion(missing, review.plan.id, true),
    /retained allocation/,
  );
  const wrong = structuredClone(p);
  wrong.lidHingePlans[0].axis.fixedB![0] += 0.1;
  assert.equal(lidHingeReviews(wrong)[0].state, "conflict");
  assert.equal(lidHingeReviews(wrong)[0].resolvedAxis, null);
});
test("measured axis drives read-only travel and persisted 0/75/0 under a full Euler transform", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  p = transformSection(p, p.sections[0].id, [12, 4, -8], [0.2, 0.65, -0.1]);
  const original = JSON.stringify(p),
    review = lidHingeReviews(p)[0],
    axis = review.resolvedAxis!;
  assert.ok(axis);
  const preview = lidPreview(p, p.sections[0].id, 75);
  assert.ok(Math.abs(preview.width - 22.75) < 1e-8);
  near(preview.pivot, axis.pivot);
  near(preview.axis, axis.axis);
  const displayed = lidAxisSegment(preview);
  near(displayed[0], axis.pivot);
  near(
    displayed[1],
    axis.pivot.map((value, i) => value + axis.length * axis.axis[i]) as V3,
  );
  assert.equal(JSON.stringify(p), original);
  near(reviewLidTravel(p, p.sections[0].id).preview(75).piece.position, preview.piece.position);
  const opened = setSectionLidOpen(p, p.sections[0].id, true);
  assert.ok(opened.sections[0].recordedLidMotion);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(opened)));
  const closed = setSectionLidOpen(reopened, reopened.sections[0].id, false);
  const initial = p.pieces.find(
    (piece) => piece.id === review.plan.moving.pieceId,
  )!;
  const returned = closed.pieces.find((piece) => piece.id === initial.id)!;
  near(returned.position, initial.position);
  for (const v of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as V3[])
    near(rotate(v, returned.rotation), rotate(v, initial.rotation));
  assert.equal(closed.sections[0].recordedLidMotion, undefined);
  assert.equal(lidHingeReviews(closed)[0].state, "geometry-reviewed");
});
test("provisional display spans remain centered rather than taking the measured endpoint convention", () => {
  const p = measuredHingeFixture();
  const preview = lidPreview(p, p.sections[0].id, 30);
  assert.equal(preview.mechanism, undefined);
  const [a, b] = lidAxisSegment(preview);
  near(
    a,
    preview.pivot.map(
      (value, i) => value - (preview.width / 2) * preview.axis[i],
    ) as V3,
  );
  near(
    b,
    preview.pivot.map(
      (value, i) => value + (preview.width / 2) * preview.axis[i],
    ) as V3,
  );
});
test("selected stale mechanism does not fall back, while its recorded axis can close the open lid", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  const before = p.pieces.find(
    (piece) => piece.id === p.lidHingePlans[0].moving.pieceId,
  )!;
  p = setSectionLidOpen(p, p.sections[0].id, true);
  p.hingeStockSources[0] = updateHingeStockSource(
    p.hingeStockSources[0],
    { usableLength: 47.9 },
    syntheticBasis,
    datumAt,
  );
  assert.equal(lidHingeReviews(p)[0].state, "stale");
  assert.throws(() => lidPreview(p, p.sections[0].id, 25), /not fallen back/);
  assert.throws(() => duplicateSection(p, p.sections[0].id), /Close.*lid/i);
  assert.throws(
    () =>
      resizeRecipeSection(p, p.sections[0].id, {
        width: 26,
        depth: 24,
        height: 18,
      }),
    /Close.*lid/i,
  );
  const closed = setSectionLidOpen(p, p.sections[0].id, false);
  near(
    closed.pieces.find((piece) => piece.id === before.id)!.position,
    before.position,
  );
  assert.equal(lidHingeReviews(closed)[0].state, "stale");
});
test("a recorded open axis moves rigidly with its section and remains reversible", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  const movedClosed = transformSection(
    p,
    p.sections[0].id,
    [9, 3, 6],
    [0.3, -0.4, 0.25],
  );
  const open = setSectionLidOpen(p, p.sections[0].id, true);
  const movedOpen = transformSection(
    open,
    open.sections[0].id,
    [9, 3, 6],
    [0.3, -0.4, 0.25],
  );
  const closed = setSectionLidOpen(movedOpen, movedOpen.sections[0].id, false);
  const id = p.lidHingePlans[0].moving.pieceId;
  near(
    closed.pieces.find((piece) => piece.id === id)!.position,
    movedClosed.pieces.find((piece) => piece.id === id)!.position,
  );
  assert.equal(lidHingeReviews(closed)[0].state, "geometry-reviewed");
  assert.deepEqual(closed.pieces, movedClosed.pieces);
});

test("closing preserves edits made while open rather than replacing them with its exact prior pose", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  const id = p.lidHingePlans[0].moving.pieceId,
    before = p.pieces.find((piece) => piece.id === id)!;
  const open = setSectionLidOpen(p, p.sections[0].id, true);
  const edited = open.pieces.find((piece) => piece.id === id)!;
  edited.position[0] += 0.123456789;
  edited.name = "Keep this edit while open";
  const closed = setSectionLidOpen(
    projectSchema.parse(JSON.parse(JSON.stringify(open))),
    p.sections[0].id,
    false,
  );
  const returned = closed.pieces.find((piece) => piece.id === id)!;
  near(returned.position, [
    before.position[0] + 0.123456789,
    before.position[1],
    before.position[2],
  ]);
  assert.equal(returned.name, edited.name);
  assert.equal(lidHingeReviews(closed)[0].state, "stale");
});
test("cut-away entrances, breakthrough and an intervening panel exclude active drill tips", () => {
  const p = measuredHingeFixture();
  const cut = structuredClone(p),
    host = cut.pieces.find(
      (piece) => piece.id === cut.lidHingePlans[0].moving.pieceId,
    )!;
  host.cutPlanes = [{ normal: [0, 0, -1], constant: 10 }];
  let refreshed = refreshHingePlan(cut, cut.lidHingePlans[0]);
  refreshed.locations[0].measurements =
    p.lidHingePlans[0].locations[0].measurements;
  const refreshedProject = saveLidHingePlan(cut, refreshed);
  const removed = lidHingeReviews(refreshedProject)[0].locations[0];
  assert.equal(removed.state, "conflict");
  assert.equal(removed.tipWorld, null);
  const deep = structuredClone(p);
  deep.lidHingePlans[0].locations[1].measurements.pilotDepth = 0.75;
  const badDepth = lidHingeReviews(deep)[0].locations[1];
  assert.ok(badDepth.issues.some((i) => i.code === "breakthrough"));
  assert.equal(badDepth.pilotTipWorld, null);
  const blocked = structuredClone(p);
  const obstacle = part(
    "Intervening thin panel",
    "plywood",
    [1, 1, 0.1],
    [0, 16.75, -11.8],
    p.steps[0].id,
    "Obstruction",
  );
  blocked.pieces.push(obstacle);
  const path = lidHingeReviews(blocked)[0].locations[1];
  assert.equal(path.state, "conflict");
  assert.ok(path.issues.some((i) => i.code === "intervening-material"));
});
test("source-end identity changes stale allocations and exact references require explicit mapping receipts", () => {
  const p = measuredHingeFixture(),
    old = p.lidHingePlans[0];
  assert.throws(
    () =>
      previewHingeRemap(p, old.id, {
        movingId: old.moving.pieceId,
        fixedId: old.fixed.pieceId,
        mode: "clear",
        basis: syntheticBasis,
      }),
    /different actual member/,
  );
  const changed = structuredClone(p);
  changed.hingeStockSources[0].cuts[0].position = 22.5;
  assert.equal(lidHingeReviews(changed)[0].state, "stale");
  const replacement = {
    ...p.pieces.find((piece) => piece.id === old.fixed.pieceId)!,
    id: crypto.randomUUID(),
  };
  const withReplacement = { ...p, pieces: [...p.pieces, replacement] };
  const preview = previewHingeRemap(withReplacement, old.id, {
    movingId: old.moving.pieceId,
    fixedId: replacement.id,
    mode: "retain-local",
    basis: syntheticBasis,
  });
  assert.equal(preview.plan.axis.fixedA, null);
  assert.equal(preview.plan.locations[0].measurements.surfaceToTipDepth, null);
  assert.deepEqual(preview.plan.referenceHistory[0].previous.fixed, old.fixed);
  assert.throws(
    () =>
      applyHingeRemap(
        { ...withReplacement, workZone: { width: 60, depth: 60, height: 60 } },
        preview,
      ),
    /Preview again/,
  );
  const next = applyHingeRemap(withReplacement, preview);
  assert.equal(next.lidHingePlans[0].fixed.pieceId, replacement.id);
  assert.throws(
    () =>
      saveLidHingePlan(next, {
        ...next.lidHingePlans[0],
        referenceHistory: [],
      }),
    /append-only/,
  );
  const undone = retainHingeLabelHistory(p, next);
  assert.equal(undone.lidHingePlans[0].fixed.pieceId, old.fixed.pieceId);
  assert.deepEqual(
    undone.lidHingePlans[0].referenceHistory,
    next.lidHingePlans[0].referenceHistory,
  );
});
test("duplicate segment claims are excluded with reasons and a physical source is purchased once", () => {
  const p = measuredHingeFixture();
  const one = hingePurchaseSummary(p, hingePurchaseAllocations(p));
  assert.equal(one.requiredHinges, 1);
  const clone = {
    ...p.lidHingePlans[0],
    id: crypto.randomUUID(),
    label: "H002",
  };
  p.lidHingePlans.push(clone);
  p.hingePlanLabels.push({ planId: clone.id, label: clone.label });
  const allocations = hingePurchaseAllocations(p);
  assert.equal(
    allocations.every(
      (row) =>
        !row.included && row.reasons.some((r) => /same retained/.test(r)),
    ),
    true,
  );
  assert.equal(hingePurchaseSummary(p, allocations).requiredHinges, 0);
});
test("inconsistent open measured imports reject instead of trapping an unclosable lid", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  const open = setSectionLidOpen(p, p.sections[0].id, true);
  delete open.sections[0].recordedLidMotion;
  assert.equal(projectSchema.safeParse(open).success, false);
  const provisional = structuredClone(p);
  provisional.lidHingePlans[0].selectedForMotion = false;
  assert.ok(
    projectSchema.parse(
      setSectionLidOpen(provisional, provisional.sections[0].id, true),
    ),
  );
});
test("saved idea pose and lid edits use the same measured mechanism and preserve its closing axis", () => {
  let p = measuredHingeFixture();
  p = selectHingeMotion(p, p.lidHingePlans[0].id, true);
  const id = p.ideaBindings[0].id,
    initial = p.pieces.find(
      (piece) => piece.id === p.lidHingePlans[0].moving.pieceId,
    )!;
  const plan = bindingPlan(p, id);
  plan.modules[0].lidOpen = true;
  plan.modules[0].position = [10, 0, 4];
  const opened = applyIdeaRevision(p, id, plan, bindingToken(p, id));
  assert.ok(opened.sections[0].recordedLidMotion);
  const closePlan = bindingPlan(opened, id);
  closePlan.modules[0].lidOpen = false;
  const closed = applyIdeaRevision(
    opened,
    id,
    closePlan,
    bindingToken(opened, id),
  );
  near(
    closed.pieces.find((piece) => piece.id === initial.id)!.position,
    initial.position.map((v, i) => v + [10, 0, 4][i]) as V3,
  );
  assert.equal(lidHingeReviews(closed)[0].state, "geometry-reviewed");
  const resizing = bindingPlan(opened, id);
  resizing.modules[0].height = 20;
  assert.throws(
    () => previewIdeaRevision(opened, id, resizing, bindingToken(opened, id)),
    /Close the measured lid/,
  );
});
test("a closed dimensional rebuild reports hinge impact and retains exact old references until explicit remapping", () => {
  const p = measuredHingeFixture(),
    id = p.ideaBindings[0].id,
    plan = bindingPlan(p, id);
  plan.modules[0].height = 20;
  const preview = previewIdeaRevision(p, id, plan, bindingToken(p, id));
  assert.equal(preview.impact.affectedHingePlans, 1);
  assert.equal(preview.requiresRebuild, true);
  assert.throws(
    () => applyIdeaRevision(p, id, plan, bindingToken(p, id)),
    /explicitly allow/,
  );
  const next = applyIdeaRevision(p, id, plan, bindingToken(p, id), {
    allowRebuild: true,
  });
  assert.deepEqual(next.lidHingePlans, p.lidHingePlans);
  assert.equal(lidHingeReviews(next)[0].state, "stale");
});
