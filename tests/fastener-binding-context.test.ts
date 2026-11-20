import test from "node:test";
import assert from "node:assert/strict";
import { part, step, uid, type Project } from "../src/model";
import { createBuildStudy } from "../src/buildFixtures";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import {
  bindingHash,
  currentBindingFingerprint,
  reconcileIdeaBindings,
} from "../src/ideaBindingState";
import {
  bindingPlan,
  bindingToken,
  previewIdeaRevision,
} from "../src/ideaBindings";
import { cutPiece } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";

function fixture() {
  let p = createBuildStudy("storage-banquette").project;
  const bindingId = p.ideaBindings[0].id,
    entry = p.ideaBindings[0].entries[0],
    members = new Set(
      p.sections.find((s) => s.id === entry.sections[0].sectionId)!.pieceIds,
    ),
    head = p.pieces.find(
      (piece) => members.has(piece.id) && piece.designRole === "leg",
    )!;
  const receiver = part(
      "External receiver",
      "stud",
      [3.5, 3.5, 1.5],
      [
        head.position[0] + head.size[0] / 2 + 0.25 + 1.75,
        head.position[1],
        head.position[2],
      ],
      p.steps[0].id,
      "External receiver",
    ),
    unrelated = part(
      "Unrelated stock",
      "stud",
      [1.5, 96, 3.5],
      [200, 48, 150],
      p.steps[0].id,
      "Other work",
    );
  p.pieces.push(receiver, unrelated);
  let intent = addFastenerLocation(makeFastenerPlan(p, head.id, receiver.id));
  intent.locations[0].entranceLocal = [-head.size[0] / 2, 0, 0];
  intent.locations[0].driveLocal = [1, 0, 0];
  intent.measurements = {
    surfaceToTipDepth: 2.25,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "SYNTHETIC proposed seated depth; no installation or capacity claim",
    measuredAt: "2026-11-15T10:00:00Z",
  };
  p = reconcileIdeaBindings(saveFastenerPlan(p, intent));
  assert.equal(fastenerReviews(p)[0].state, "path-reviewed");
  return {
    p,
    bindingId,
    entryId: entry.id,
    headId: head.id,
    receiverId: receiver.id,
    unrelatedId: unrelated.id,
  };
}
function proposal(p: Project, bindingId: string) {
  const plan = bindingPlan(p, bindingId);
  plan.modules[0].height += 2;
  return plan;
}

for (const mutation of [
  "move",
  "cut",
  "delete",
  "offcut",
  "same-name-replacement",
] as const)
  test(`external receiver ${mutation} rejects an outstanding binding token without changing saved intent`, () => {
    const f = fixture(),
      original = structuredClone(f.p.fastenerPlans),
      token = bindingToken(f.p, f.bindingId),
      plan = proposal(f.p, f.bindingId);
    let changed = structuredClone(f.p);
    const receiver = changed.pieces.find((piece) => piece.id === f.receiverId)!;
    if (mutation === "move") receiver.position[0] += 0.25;
    if (mutation === "cut") changed = cutPiece(changed, receiver.id, 1, 1);
    if (mutation === "delete")
      changed.pieces = changed.pieces.filter(
        (piece) => piece.id !== receiver.id,
      );
    if (mutation === "offcut") receiver.offcut = true;
    if (mutation === "same-name-replacement") receiver.id = uid();
    assert.deepEqual(changed.fastenerPlans, original);
    assert.equal(fastenerReviews(changed)[0].state, "stale");
    assert.notEqual(bindingToken(changed, f.bindingId), token);
    const reconciled = reconcileIdeaBindings(changed);
    assert.ok(
      reconciled.ideaBindings[0].revision > f.p.ideaBindings[0].revision,
    );
    assert.throws(
      () => previewIdeaRevision(reconciled, f.bindingId, plan, token),
      /changed while/,
    );
    assert.equal(reconciled.fastenerPlans[0].receiver.pieceId, f.receiverId);
  });

test("unrelated off-ray movement and cuts leave the revision token and proposal scope stable", () => {
  const f = fixture(),
    token = bindingToken(f.p, f.bindingId),
    plan = proposal(f.p, f.bindingId);
  let changed = structuredClone(f.p);
  changed.pieces.find((piece) => piece.id === f.unrelatedId)!.position[0] += 10;
  assert.equal(bindingToken(changed, f.bindingId), token);
  changed = cutPiece(changed, f.unrelatedId, 36, 1);
  assert.equal(bindingToken(changed, f.bindingId), token);
  assert.deepEqual(changed.fastenerPlans, f.p.fastenerPlans);
  assert.doesNotThrow(() =>
    previewIdeaRevision(changed, f.bindingId, plan, token),
  );
});

test("an unselected solid entering a related path invalidates the token while off-ray work does not", () => {
  const f = fixture(),
    token = bindingToken(f.p, f.bindingId),
    plan = proposal(f.p, f.bindingId),
    p = structuredClone(f.p),
    head = p.pieces.find((piece) => piece.id === f.headId)!,
    other = part(
      "Third metal layer",
      "roof",
      [0.03, 2, 2],
      [200, 200, 200],
      p.steps[0].id,
      "Other work",
    );
  p.pieces.push(other);
  assert.equal(bindingToken(p, f.bindingId), token);
  other.position[0] += 1;
  assert.equal(bindingToken(p, f.bindingId), token);
  other.position = [
    head.position[0] + head.size[0] / 2 + 0.125,
    head.position[1],
    head.position[2],
  ];
  const review = fastenerReviews(p)[0];
  assert.equal(review.state, "conflict");
  assert.deepEqual(
    review.issues.find((issue) => issue.code === "unselected-layer")?.pieceIds,
    [other.id],
  );
  assert.deepEqual(p.fastenerPlans, f.p.fastenerPlans);
  assert.notEqual(bindingToken(p, f.bindingId), token);
  assert.throws(
    () => previewIdeaRevision(p, f.bindingId, plan, token),
    /changed while/,
  );
  other.position = [201, 200, 200];
  assert.equal(bindingToken(p, f.bindingId), token);
});

test("foreign step assignments, plan allocation metadata and W reservations do not change a target token", () => {
  const f = fixture(),
    token = bindingToken(f.p, f.bindingId),
    p = structuredClone(f.p),
    externalStep = step("External operation");
  p.steps.push(externalStep);
  p.pieces.find((piece) => piece.id === f.receiverId)!.stepId = externalStep.id;
  p.fastenerPlans[0].nextLocationNumber += 2;
  p.fastenerPlans[0].createdAt = "2026-11-14T10:00:00Z";
  p.fastenerPlans[0].updatedAt = "2026-11-16T10:00:00Z";
  p.fastenerPlanLabels.push({ planId: uid(), label: "W999" });
  assert.equal(bindingToken(p, f.bindingId), token);
  assert.deepEqual(
    reconcileIdeaBindings(p).ideaBindings[0],
    f.p.ideaBindings[0],
  );
});

test("saving the first of two plans retains order, guide checks and binding token", () => {
  const f = fixture();
  let p = f.p;
  const first = p.fastenerPlans[0],
    second = addFastenerLocation(makeFastenerPlan(p, f.headId, f.receiverId));
  second.locations[0].entranceLocal = [...first.locations[0].entranceLocal!];
  second.locations[0].entranceLocal[1] = 0.5;
  second.locations[0].driveLocal = [1, 0, 0];
  second.measurements = { ...first.measurements };
  p = saveFastenerPlan(p, second);
  p.fastenerPlans[0].updatedAt = "2026-11-14T10:00:00Z";
  p = reconcileIdeaBindings(generateBuildGuide(p));
  p.steps.forEach((s) => {
    s.complete = true;
  });
  const ids = p.fastenerPlans.map((intent) => intent.id),
    token = bindingToken(p, f.bindingId),
    saved = saveFastenerPlan(p, p.fastenerPlans[0]);
  assert.notEqual(
    saved.fastenerPlans[0].updatedAt,
    p.fastenerPlans[0].updatedAt,
  );
  assert.deepEqual(
    saved.fastenerPlans.map((intent) => intent.id),
    ids,
  );
  assert.equal(bindingToken(saved, f.bindingId), token);
  assert.ok(guideIsCurrent(saved));
  assert.deepEqual(generateBuildGuide(saved).steps, p.steps);
});

test("empty fastener bindings keep the exact pre-context fingerprint input shape", () => {
  const p = createBuildStudy("storage-banquette").project,
    binding = p.ideaBindings[0],
    ids = new Set(
      binding.entries.flatMap((entry) =>
        entry.sections.flatMap(
          (m) => p.sections.find((s) => s.id === m.sectionId)?.pieceIds ?? [],
        ),
      ),
    ),
    sources = new Set(
      p.pieces
        .filter((piece) => ids.has(piece.id) && piece.cutStock)
        .map((piece) => piece.cutStock!.id),
    ),
    old = bindingHash({
      entries: binding.entries,
      sections: binding.entries.flatMap((e) =>
        e.sections.map((m) => ({
          role: m.role,
          section: p.sections.find((s) => s.id === m.sectionId) ?? null,
        })),
      ),
      pieces: p.pieces.filter(
        (piece) =>
          ids.has(piece.id) ||
          (piece.offcut && piece.cutStock && sources.has(piece.cutStock.id)),
      ),
      joints: p.joints.filter((j) => ids.has(j.a) || ids.has(j.b)),
    });
  assert.equal(currentBindingFingerprint(p, binding), old);
});
