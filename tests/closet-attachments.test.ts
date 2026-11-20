import test from "node:test";
import assert from "node:assert/strict";
import { projectSchema, uid, part, type Project, type V3 } from "../src/model";
import { createBuildStudy } from "../src/buildFixtures";
import { localIdeaPlan, applyIdeaPlan } from "../src/planning";
import {
  attachmentReviews,
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
  closetSupportRoleOptions,
  assignClosetSupportRoles,
  attachmentGeometryFingerprint,
  type ShelfPinPlanConfig,
} from "../src/attachments";
import { attachmentPurchaseSummary } from "../src/attachmentPurchases";
import {
  bindingPlan,
  bindingToken,
  applyIdeaRevision,
  bindingReview,
} from "../src/ideaBindings";
import { cutPiece, connect } from "../src/engine";
import { reconcileSections } from "../src/sections";
import { composeRotation, rotate } from "../src/spatial";
const closet = (exact = false) =>
  createBuildStudy(
    "closet-insert",
    undefined,
    undefined,
    exact
      ? {
          caseworkPanels: {
            materialId: "plytanium-703",
            productRegistryRef: "plytanium-bc-201428",
          },
        }
      : {},
  ).project;
const entry = (p: Project) => p.ideaBindings[0].entries[0];
const config: ShelfPinPlanConfig = {
  shelfRoles: ["tower-shelf-1"],
  layout: { system: "custom", frontInset: 2, rearInset: 2, datumHeight: null },
};
const measurements = () => ({
  pinInsertionDepth: 0.2,
  bearingReach: 0.25,
  bearingOffset: 0.05,
  fullDiameterBoreDepth: 0.25,
  deepestDrillTipDepth: 0.3,
  basis: "User test pin and depth measurements; geometry only.",
  measuredAt: new Date(Date.now() - 60000).toISOString(),
});
const planned = (p = closet(), extra: Partial<ShelfPinPlanConfig> = {}) =>
  saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry(p).id, { ...config, ...extra }),
  );
function legacy(p = closet()) {
  return projectSchema.parse({
    ...p,
    pieces: p.pieces.map((piece) => {
      const { designRole: _role, ...rest } = piece;
      return rest;
    }),
  });
}
const physical = (p: Project) =>
  p.pieces.map((piece) => {
    const { designRole: _role, ...rest } = piece;
    return rest;
  });
function assignments(p: Project) {
  return Object.fromEntries(
    closetSupportRoleOptions(p, entry(p).id).map((o) => [
      o.role,
      o.assignedPieceId ?? o.suggestedPieceId ?? "",
    ]),
  );
}
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("new closet panels carry explicit design roles without splitting or renaming the legacy carcass section", () => {
  const p = closet(),
    e = entry(p);
  assert.deepEqual(
    p.sections.map((s) => s.name),
    ["Closet casework"],
  );
  assert.deepEqual(
    e.sections.map((m) => m.role),
    ["casework-panels"],
  );
  assert.equal(p.pieces.length, 10);
  assert.deepEqual(
    p.pieces.map((x) => x.designRole),
    [
      "bottom",
      "top",
      "side-left",
      "tower-left",
      "tower-right",
      "side-right",
      "tower-shelf-1",
      "tower-shelf-2",
      "tower-shelf-3",
      "tower-shelf-4",
    ],
  );
  const entries = shelfSupportEntries(p);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "closet-insert");
  assert.equal(entries[0].requiresRoleMapping, false);
  assert.equal(entries[0].shelves.length, 4);
  assert.ok(
    closetSupportRoleOptions(p, e.id).every(
      (o) => o.assignedPieceId && o.suggestedPieceId === o.assignedPieceId,
    ),
  );
  assert.equal(bindingReview(p, p.ideaBindings[0].id).manualEdits, 0);
});

test("selected tower shelves use real divider inner faces and preserve pending mechanics without invented pins", () => {
  const p = planned(closet(), {
      shelfRoles: ["tower-shelf-1", "tower-shelf-4"],
    }),
    plan = p.attachmentPlans[0],
    r = attachmentReviews(p)[0];
  assert.equal(plan.points.length, 8);
  assert.equal(r.activePinCount, 8);
  assert.equal(r.state, "needs-measurements");
  assert.ok(r.points.every((point) => point.holeCenterWorld === null));
  for (const point of plan.points) {
    assert.equal(point.mount.role, `tower-${point.side}`);
    assert.equal(point.mountFace.axis, 0);
    assert.equal(point.mountFace.sign, point.side === "left" ? 1 : -1);
    const mount = p.pieces.find((p) => p.id === point.mount.pieceId)!;
    near(
      point.bearingTargetLocal[0],
      (point.mountFace.sign * mount.size[0]) / 2,
    );
    assert.equal(mount.designRole, point.mount.role);
  }
  assert.equal(p.pieces.length, 10);
  assert.equal(p.joints.length, 0);
});

test("source-exact .703 closet panels support measured bore geometry and reject nominal-thickness breakthrough", () => {
  const p = planned(closet(true), { measurements: measurements() }),
    r = attachmentReviews(p)[0];
  assert.equal(r.state, "geometry-checked");
  assert.equal(r.activePinCount, 4);
  assert.ok(planParts(p).every((piece) => piece.material === "plytanium-703"));
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(p))).attachmentPlans,
    p.attachmentPlans,
  );
  const tooDeep = {
    ...p,
    attachmentPlans: p.attachmentPlans.map((plan) => ({
      ...plan,
      measurements: { ...plan.measurements, deepestDrillTipDepth: 0.72 },
    })),
  };
  assert.ok(
    attachmentReviews(tooDeep)[0].issues.some(
      (i) => i.code === "panel-breakthrough",
    ),
  );
  assert.equal(attachmentReviews(tooDeep)[0].activePinCount, 0);
});
function planParts(p: Project) {
  const ids = new Set(
    p.attachmentPlans[0].points.flatMap((pt) => [
      pt.mount.pieceId,
      pt.shelf.pieceId,
    ]),
  );
  return p.pieces.filter((piece) => ids.has(piece.id));
}

test("full three-dimensional rigid movement preserves measured tower support points and their saved references", () => {
  const p = planned(closet(true), { measurements: measurements() }),
    before = attachmentReviews(p)[0],
    rotation: V3 = [0.15, 0.55, -0.2],
    offset: V3 = [60, 5, 12],
    move = (v: V3) => rotate(v, rotation).map((n, i) => n + offset[i]) as V3,
    next = {
      ...p,
      pieces: p.pieces.map((piece) => ({
        ...piece,
        position: move(piece.position),
        rotation: composeRotation(rotation, piece.rotation),
      })),
      sections: p.sections.map((section) => ({
        ...section,
        origin: move(section.origin),
        rotation: composeRotation(rotation, section.rotation),
      })),
    };
  const actual = attachmentReviews(next)[0];
  assert.equal(actual.state, "geometry-checked");
  assert.deepEqual(next.attachmentPlans, p.attachmentPlans);
  actual.points[0].bearingTargetWorld.forEach((v, i) =>
    near(v, move(before.points[0].bearingTargetWorld)[i]),
  );
});

test("legacy hints are unique exact physical matches only; explicit assignment preserves all parts, sections and provenance", () => {
  const p = legacy(closet(true)),
    before = structuredClone(p),
    options = closetSupportRoleOptions(p, entry(p).id);
  assert.equal(options.length, 6);
  assert.ok(
    options.every((o) => o.assignedPieceId === null && o.suggestedPieceId),
  );
  assert.equal(shelfSupportEntries(p)[0].requiresRoleMapping, true);
  assert.deepEqual(shelfSupportEntries(p)[0].shelves, []);
  assert.throws(() => makeShelfPinPlan(p, entry(p).id, config), /assign/);
  const mapped = assignClosetSupportRoles(p, entry(p).id, assignments(p));
  assert.deepEqual(physical(mapped), physical(p));
  assert.deepEqual(mapped.sections, p.sections);
  assert.deepEqual(mapped.history, p.history);
  assert.deepEqual(mapped.notes, p.notes);
  assert.deepEqual(mapped.joints, p.joints);
  assert.ok(mapped.ideaBindings[0].revision > p.ideaBindings[0].revision);
  assert.equal(shelfSupportEntries(mapped)[0].requiresRoleMapping, false);
  assert.equal(bindingReview(mapped, mapped.ideaBindings[0].id).manualEdits, 0);
  assert.deepEqual(p, before);
  assert.equal(
    attachmentReviews(
      planned(projectSchema.parse(JSON.parse(JSON.stringify(mapped))), {
        measurements: measurements(),
      }),
    )[0].state,
    "geometry-checked",
  );
});

test("legacy cut shelves get no guessed role; explicit user mapping retains the cut source and offcut while concrete reach remains reviewable", () => {
  let p = closet(),
    shelf = p.pieces.find((p) => p.designRole === "tower-shelf-1")!,
    divider = p.pieces.find((p) => p.designRole === "tower-left")!;
  p = reconcileSections(cutPiece(p, shelf.id, 20, 0));
  p = connect(p, shelf.id, divider.id, shelf.stepId);
  p = legacy(p);
  const before = structuredClone(p),
    options = closetSupportRoleOptions(p, entry(p).id);
  assert.equal(
    options.find((o) => o.role === "tower-shelf-1")!.suggestedPieceId,
    null,
  );
  const map = assignments(p);
  map["tower-shelf-1"] = shelf.id;
  const mapped = assignClosetSupportRoles(p, entry(p).id, map);
  assert.deepEqual(physical(mapped), physical(p));
  assert.deepEqual(mapped.joints, p.joints);
  assert.deepEqual(
    mapped.pieces.filter((p) => p.offcut),
    p.pieces.filter((p) => p.offcut),
  );
  assert.deepEqual(p, before);
  assert.ok(bindingReview(mapped, mapped.ideaBindings[0].id).manualEdits > 0);
  const r = attachmentReviews(
    planned(mapped, { measurements: measurements() }),
  )[0];
  assert.equal(r.state, "conflict");
  assert.ok(r.issues.some((i) => i.code === "bearing-reach"));
});

test("legacy role suggestions ignore names and array order and refuse ambiguous identical panels", () => {
  const p = legacy(),
    hints = closetSupportRoleOptions(p, entry(p).id),
    leftId = hints.find((o) => o.role === "tower-left")!.suggestedPieceId!,
    shuffled = {
      ...p,
      pieces: [...p.pieces]
        .reverse()
        .map((piece) => ({ ...piece, name: "Uninformative label" })),
    };
  assert.equal(
    closetSupportRoleOptions(shuffled, entry(p).id).find(
      (o) => o.role === "tower-left",
    )!.suggestedPieceId,
    leftId,
  );
  const original = p.pieces.find((piece) => piece.id === leftId)!,
    duplicate = {
      ...structuredClone(original),
      id: uid(),
      name: "Different name",
    },
    ambiguous = {
      ...p,
      pieces: [...p.pieces, duplicate],
      sections: p.sections.map((s) => ({
        ...s,
        pieceIds: [...s.pieceIds, duplicate.id],
      })),
    };
  assert.equal(
    closetSupportRoleOptions(ambiguous, entry(p).id).find(
      (o) => o.role === "tower-left",
    )!.suggestedPieceId,
    null,
  );
  assert.throws(
    () =>
      assignClosetSupportRoles(ambiguous, entry(p).id, assignments(ambiguous)),
    /Choose/,
  );
});

test("role assignment rejects foreign, duplicate, offcut, unsupported and incomplete assignments without changing the project", () => {
  const p = legacy(),
    e = entry(p),
    before = structuredClone(p),
    valid = assignments(p);
  assert.throws(() => assignClosetSupportRoles(p, e.id, {}), /Choose/);
  assert.throws(
    () =>
      assignClosetSupportRoles(p, e.id, {
        ...valid,
        "tower-right": valid["tower-left"],
      }),
    /different/,
  );
  assert.throws(
    () => assignClosetSupportRoles(p, e.id, { ...valid, "tower-left": uid() }),
    /owned/,
  );
  assert.throws(
    () =>
      assignClosetSupportRoles(p, e.id, { ...valid, "tower-shelf-6": uid() }),
    /current/,
  );
  const roof = part(
      "Not a wood divider",
      "roof",
      [0.02, 80, 24],
      [100, 40, 0],
      p.steps[0].id,
      "Closet casework",
    ),
    withRoof = {
      ...p,
      pieces: [...p.pieces, roof],
      sections: p.sections.map((s) => ({
        ...s,
        pieceIds: [...s.pieceIds, roof.id],
      })),
    };
  assert.throws(
    () =>
      assignClosetSupportRoles(withRoof, e.id, {
        ...valid,
        "tower-left": roof.id,
      }),
    /wood sheet/,
  );
  const offcut = {
    ...p,
    pieces: p.pieces.map((piece) =>
      piece.id === valid["tower-left"] ? { ...piece, offcut: true } : piece,
    ),
  };
  assert.throws(() => assignClosetSupportRoles(offcut, e.id, valid), /owned/);
  assert.deepEqual(p, before);
});

test("an explicitly misassigned divider never receives a false geometric fit", () => {
  const p = legacy(),
    map = assignments(p),
    wrong = assignClosetSupportRoles(p, entry(p).id, {
      ...map,
      "tower-left": map["tower-right"],
      "tower-right": map["tower-left"],
    }),
    r = attachmentReviews(planned(wrong, { measurements: measurements() }))[0];
  assert.equal(r.state, "conflict");
  assert.equal(r.activePinCount, 0);
  assert.ok(
    r.issues.some(
      (i) => i.code === "shelf-penetration" || i.code === "bearing-profile",
    ),
  );
});

test("a divider profile cut is checked against the full measured drilling envelope after explicit role adoption", () => {
  let p = closet();
  const divider = p.pieces.find((p) => p.designRole === "tower-left")!;
  p = {
    ...p,
    pieces: p.pieces.map((piece) =>
      piece.id === divider.id
        ? { ...piece, cutPlanes: [{ normal: [-1, 0, 0] as V3, constant: 0.1 }] }
        : piece,
    ),
  };
  const r = attachmentReviews(
    planned(p, {
      measurements: {
        ...measurements(),
        fullDiameterBoreDepth: 0.55,
        deepestDrillTipDepth: 0.6,
      },
    }),
  )[0];
  assert.equal(r.state, "conflict");
  assert.equal(r.activePinCount, 0);
  assert.ok(r.issues.some((i) => i.code === "hole-profile"));
});

test("closet resize and shelf-count removal keep saved support intentions stale without rebinding replaced or removed roles", () => {
  let p = planned(closet(true), {
      shelfRoles: ["tower-shelf-4"],
      measurements: measurements(),
    }),
    plan = structuredClone(p.attachmentPlans[0]),
    b = p.ideaBindings[0],
    proposal = bindingPlan(p, b.id);
  assert.equal(proposal.structures[0].kind, "closet-insert");
  if (proposal.structures[0].kind !== "closet-insert")
    throw Error("Wrong family");
  proposal.structures[0].parameters.width = 84;
  proposal.structures[0].parameters.shelfCount = 2;
  p = applyIdeaRevision(p, b.id, proposal, bindingToken(p, b.id));
  assert.deepEqual(p.attachmentPlans, [plan]);
  assert.equal(attachmentReviews(p)[0].state, "stale");
  assert.equal(attachmentReviews(p)[0].activePinCount, 0);
  assert.equal(shelfSupportEntries(p)[0].requiresRoleMapping, false);
  assert.deepEqual(
    shelfSupportEntries(p)[0].shelves.map((s) => s.role),
    ["tower-shelf-1", "tower-shelf-2"],
  );
  assert.throws(
    () =>
      makeShelfPinPlan(p, entry(p).id, {
        ...config,
        id: plan.id,
        shelfRoles: ["tower-shelf-4"],
      }),
    /missing/,
  );
  const refreshed = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry(p).id, {
      ...config,
      id: plan.id,
      measurements: plan.measurements,
    }),
  );
  assert.equal(refreshed.attachmentPlans[0].id, plan.id);
  assert.equal(attachmentReviews(refreshed)[0].state, "geometry-checked");
});

test("casework and closet support purchases aggregate explicit pin demand once while old casework references stay valid", () => {
  let p = createBuildStudy("shelves").project;
  const bookId = entry(p).id;
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, bookId, { ...config, shelfRoles: ["shelf-1"] }),
  );
  const old = structuredClone(p.attachmentPlans[0]),
    oldFingerprint = attachmentGeometryFingerprint(
      p.pieces.find((piece) => piece.id === old.points[0].mount.pieceId)!,
    );
  const idea = localIdeaPlan({
    prompt: "A closet insert 72 inches wide,24 inches deep,84 inches tall",
  });
  idea.structures[0].parameters.origin = [150, 0, 0];
  p = applyIdeaPlan(p, idea);
  const closetId = shelfSupportEntries(p).find(
    (e) => e.kind === "closet-insert",
  )!.entryId;
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, closetId, {
      ...config,
      shelfRoles: ["tower-shelf-1", "tower-shelf-2", "tower-shelf-3"],
    }),
  );
  assert.deepEqual(p.attachmentPlans[0], old);
  assert.equal(attachmentReviews(p)[0].state, "needs-measurements");
  assert.equal(
    attachmentGeometryFingerprint(
      p.pieces.find((piece) => piece.id === old.points[0].mount.pieceId)!,
    ),
    oldFingerprint,
  );
  const summary = attachmentPurchaseSummary(p);
  assert.equal(summary.plannedPins, 16);
  assert.equal(summary.requiredPacks, 1);
  const raw = JSON.parse(JSON.stringify(p));
  raw.schemaVersion = 2;
  const reopened = projectSchema.parse(raw);
  assert.deepEqual(reopened.attachmentPlans, p.attachmentPlans);
  assert.equal(
    attachmentReviews(reopened).reduce((n, r) => n + r.activePinCount, 0),
    16,
  );
});

test("manual mapping of a legacy tilted closet preserves its complete three-dimensional pose without guessing from its old parameters", () => {
  let p = legacy(),
    map = assignments(p);
  const rotation: V3 = [0.2, 0.6, -0.15],
    offset: V3 = [20, 5, -12],
    move = (v: V3) => rotate(v, rotation).map((n, i) => n + offset[i]) as V3;
  p = {
    ...p,
    pieces: p.pieces.map((piece) => ({
      ...piece,
      position: move(piece.position),
      rotation: composeRotation(rotation, piece.rotation),
    })),
    sections: p.sections.map((section) => ({
      ...section,
      origin: move(section.origin),
      rotation: composeRotation(rotation, section.rotation),
    })),
  };
  assert.ok(
    closetSupportRoleOptions(p, entry(p).id).every(
      (o) => o.suggestedPieceId === null,
    ),
  );
  const before = physical(p),
    mapped = assignClosetSupportRoles(p, entry(p).id, map);
  assert.deepEqual(physical(mapped), before);
  assert.deepEqual(mapped.sections, p.sections);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(mapped))),
    r = attachmentReviews(
      planned(reopened, { measurements: measurements() }),
    )[0];
  assert.equal(r.state, "geometry-checked");
  assert.equal(r.activePinCount, 4);
});
