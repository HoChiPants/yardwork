import test from "node:test";
import assert from "node:assert/strict";
import { blank, projectSchema, uid, type Project, type V3 } from "../src/model";
import { createBuildStudy } from "../src/buildFixtures";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingToken,
} from "../src/ideaBindings";
import { cutPiece, connect } from "../src/engine";
import { reconcileSections, removeSection } from "../src/sections";
import { rotate, composeRotation } from "../src/spatial";
import {
  attachmentPlanSchema,
  emptyShelfPinMeasurements,
  nominalShelfPinBore,
  kregShelfPinPitch,
  type ShelfPinMeasurements,
  type AttachmentPlan,
} from "../src/attachmentSchema";
import {
  attachmentReviews,
  shelfSupportEntries,
  makeShelfPinPlan,
  saveShelfPinPlan,
  removeAttachmentPlan,
  type ShelfPinPlanConfig,
} from "../src/attachments";
const config: ShelfPinPlanConfig = {
  shelfRoles: ["shelf-1"],
  layout: { system: "custom", frontInset: 2, rearInset: 2, datumHeight: null },
};
const measured = (): ShelfPinMeasurements => ({
  pinInsertionDepth: 0.2,
  bearingReach: 0.25,
  bearingOffset: 0.05,
  fullDiameterBoreDepth: 0.25,
  deepestDrillTipDepth: 0.3,
  basis:
    "User caliper measurements of the actual pin and test-drilled scrap; not a load qualification.",
  measuredAt: new Date(Date.now() - 60000).toISOString(),
});
const bookcase = () => createBuildStudy("shelves").project;
const entryId = (p: Project) => p.ideaBindings[0].entries[0].id;
function planned(p = bookcase(), extra: Partial<ShelfPinPlanConfig> = {}) {
  return saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entryId(p), { ...config, ...extra }),
  );
}
const codes = (p: Project) =>
  attachmentReviews(p).flatMap((r) => r.issues.map((i) => i.code));
const review = (p: Project) => attachmentReviews(p)[0];
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function planFor(p: Project, patch: Partial<AttachmentPlan>) {
  return saveShelfPinPlan(p, { ...p.attachmentPlans[0], ...patch });
}

test("blank projects have no support demand; actual whole casework entries expose only surviving shelf identities", () => {
  assert.deepEqual(attachmentReviews(blank()), []);
  assert.deepEqual(shelfSupportEntries(blank()), []);
  const p = bookcase(),
    before = structuredClone(p),
    entries = shelfSupportEntries(p);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].shelves.length, 3);
  assert.deepEqual(
    entries[0].shelves.map((s) => s.role),
    ["shelf-1", "shelf-2", "shelf-3"],
  );
  assert.ok(
    entries[0].shelves.every((s) =>
      p.pieces.some((piece) => piece.id === s.pieceId),
    ),
  );
  assert.deepEqual(p, before);
});

test("explicit selection creates four bearing intentions per shelf from side-edge insets without inventing a pin mesh or hole offset", () => {
  const p = bookcase(),
    before = structuredClone(p),
    plan = makeShelfPinPlan(p, entryId(p), {
      ...config,
      shelfRoles: ["shelf-1", "shelf-3"],
    });
  assert.equal(plan.points.length, 8);
  assert.equal(plan.productId, "kreg-kma-5mpin");
  assert.deepEqual(plan.measurements, emptyShelfPinMeasurements());
  assert.deepEqual(p, before);
  const next = saveShelfPinPlan(p, plan),
    r = review(next);
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.activePinCount, 8);
  assert.equal(next.pieces.length, p.pieces.length);
  assert.equal(next.joints.length, 0);
  assert.ok(
    r.points.every(
      (pt) => pt.holeCenterLocal === null && pt.holeCenterWorld === null,
    ),
  );
  assert.equal(
    r.issues.filter((i) => i.code.startsWith("measurement-")).length,
    5,
  );
  for (const point of plan.points) {
    const mount = p.pieces.find((p) => p.id === point.mount.pieceId)!;
    near(
      point.bearingTargetLocal[0],
      ((point.side === "left" ? 1 : -1) * mount.size[0]) / 2,
    );
    near(
      point.row === "front"
        ? mount.size[2] / 2 - point.bearingTargetLocal[2]
        : point.bearingTargetLocal[2] + mount.size[2] / 2,
      2,
    );
    assert.equal(point.mountFace.axis, 0);
  }
});

test("strict persistence preserves measurement provenance, role references, stable identifiers and exact intent points through JSON", () => {
  const p = planned(bookcase(), { measurements: measured() }),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(reopened.attachmentPlans, p.attachmentPlans);
  assert.equal(review(reopened).state, "geometry-checked");
  assert.equal(review(reopened).activePinCount, 4);
  assert.ok(
    reopened.attachmentPlans[0].measurements.basis.includes("User caliper"),
  );
  assert.equal(nominalShelfPinBore, 5 / 25.4);
  assert.equal(kregShelfPinPitch, 32 / 25.4);
  assert.throws(() =>
    attachmentPlanSchema.parse({
      ...p.attachmentPlans[0],
      productId: "invented-pin",
    }),
  );
  assert.throws(() =>
    attachmentPlanSchema.parse({
      ...p.attachmentPlans[0],
      points: [
        ...p.attachmentPlans[0].points,
        ...Array.from({ length: 22 }, () => p.attachmentPlans[0].points[0]),
      ],
    }),
  );
  const duplicate = {
    ...p,
    attachmentPlans: [
      p.attachmentPlans[0],
      { ...p.attachmentPlans[0], id: uid() },
    ],
  };
  assert.throws(() => projectSchema.parse(duplicate), /Duplicate/);
});

test("recorded signed bearing offset alone derives hole centers and drilling direction; other unknown mechanics remain unresolved", () => {
  const measurements = {
      ...emptyShelfPinMeasurements(),
      bearingOffset: -0.1,
      basis: "User measured bearing below pin axis.",
      measuredAt: new Date(Date.now() - 60000).toISOString(),
    },
    p = planned(bookcase(), { measurements }),
    r = review(p);
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.activePinCount, 4);
  for (const pt of r.points) {
    assert.ok(pt.holeCenterLocal);
    near(pt.holeCenterLocal[1], pt.point.bearingTargetLocal[1] + 0.1);
    near(pt.drillDirectionWorld[0], pt.point.side === "left" ? -1 : 1);
    assert.equal(pt.holeCenterWorld![1], pt.bearingTargetWorld[1] + 0.1);
  }
  const current = bookcase();
  assert.throws(() =>
    makeShelfPinPlan(current, entryId(current), {
      ...config,
      measurements: { ...measurements, basis: "" },
    }),
  );
});

test("whole rigid moves including pitch and roll preserve valid local points and measured bore geometry", () => {
  const p = planned(bookcase(), { measurements: measured() }),
    r = review(p),
    rotation: V3 = [0.2, 0.6, -0.15],
    offset: V3 = [20, 4, -10],
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
  const actual = review(next);
  assert.equal(actual.state, "geometry-checked");
  assert.equal(actual.activePinCount, 4);
  assert.deepEqual(next.attachmentPlans, p.attachmentPlans);
  for (let i = 0; i < r.points.length; i++)
    actual.points[i].bearingTargetWorld.forEach((v, axis) =>
      near(v, move(r.points[i].bearingTargetWorld)[axis]),
    );
});

test("one referenced member moving independently makes the plan stale even when its dimensions remain unchanged", () => {
  const p = planned(bookcase(), { measurements: measured() }),
    id = p.attachmentPlans[0].points[0].shelf.pieceId,
    next = {
      ...p,
      pieces: p.pieces.map((piece) =>
        piece.id === id
          ? {
              ...piece,
              position: [
                piece.position[0] + 0.05,
                piece.position[1],
                piece.position[2],
              ] as V3,
            }
          : piece,
      ),
    };
  assert.equal(review(next).state, "stale");
  assert.equal(review(next).activePinCount, 0);
  assert.ok(codes(next).includes("stale-relative-pose"));
});

test("changed size, material, cut profiles, stock direction and lineage invalidate cached shape references independently of rigid pose", () => {
  for (const update of [
    (piece: Project["pieces"][number]) => ({
      ...piece,
      size: [piece.size[0] - 0.1, ...piece.size.slice(1)] as V3,
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      material: "plywood-half" as const,
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      cutPlanes: [
        { normal: [0, 0, 1] as V3, constant: piece.size[2] / 2 - 0.05 },
      ],
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      stockLengthAxis: 0 as const,
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      cutStock: {
        id: uid(),
        size: [...piece.size] as V3,
        offset: [0, 0, 0] as V3,
      },
    }),
  ]) {
    const p = planned(),
      id = p.attachmentPlans[0].points[0].shelf.pieceId,
      next = {
        ...p,
        pieces: p.pieces.map((piece) =>
          piece.id === id ? update(piece) : piece,
        ),
      };
    assert.equal(review(next).state, "stale");
    assert.equal(review(next).activePinCount, 0);
    assert.ok(codes(next).includes("stale-geometry"));
  }
});

test("cuts and regenerated parts remain stale until explicit refresh; no role-name replacement is inferred", () => {
  let p = planned(bookcase(), { measurements: measured() }),
    plan = p.attachmentPlans[0],
    shelf = plan.points[0].shelf.pieceId;
  p = reconcileSections(cutPiece(p, shelf, 20, 0));
  assert.equal(review(p).state, "stale");
  const b = p.ideaBindings[0],
    idea = bindingPlan(p, b.id);
  assert.equal(idea.structures[0].kind, "casework-shelves");
  if (idea.structures[0].kind !== "casework-shelves")
    throw Error("Missing casework family");
  idea.structures[0].parameters.height = 80;
  p = applyIdeaRevision(p, b.id, idea, bindingToken(p, b.id), {
    allowRebuild: true,
  });
  assert.deepEqual(p.attachmentPlans[0], plan);
  assert.equal(review(p).state, "stale");
  assert.ok(codes(p).includes("stale-reference"));
  const refreshed = makeShelfPinPlan(p, entryId(p), {
      ...config,
      id: plan.id,
      createdAt: plan.createdAt,
      measurements: plan.measurements,
    }),
    next = saveShelfPinPlan(p, refreshed);
  assert.equal(next.attachmentPlans.length, 1);
  assert.equal(next.attachmentPlans[0].id, plan.id);
  assert.deepEqual(
    next.attachmentPlans[0].points.map((pt) => pt.id),
    plan.points.map((pt) => pt.id),
  );
  assert.notEqual(next.attachmentPlans[0].points[0].shelf.pieceId, shelf);
  assert.equal(review(next).state, "geometry-checked");
});

test("deleted roles retain persisted points and finite stale fallback markers through save/reopen", () => {
  const p = planned(bookcase(), { measurements: measured() }),
    plan = p.attachmentPlans[0],
    next = removeSection(p, plan.points[0].mount.sectionId),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(next))),
    r = review(reopened);
  assert.equal(r.state, "stale");
  assert.equal(r.points.length, 4);
  assert.ok(
    r.points.every((pt) => pt.bearingTargetWorld.every(Number.isFinite)),
  );
  assert.deepEqual(reopened.attachmentPlans, [plan]);
  assert.equal(r.activePinCount, 0);
});

test("measured bearing reach must cross the actual shelf-to-side gap and remain within the retained footprint", () => {
  let p = bookcase();
  const shelfId = shelfSupportEntries(p)[0].shelves[0].pieceId;
  p = {
    ...p,
    pieces: p.pieces.map((piece) =>
      piece.id === shelfId
        ? { ...piece, size: [piece.size[0] - 2, piece.size[1], piece.size[2]] }
        : piece,
    ),
  };
  const tooShort = planned(p, {
    measurements: { ...measured(), bearingReach: 0.5 },
  });
  assert.ok(codes(tooShort).includes("bearing-reach"));
  assert.equal(review(tooShort).activePinCount, 0);
  const reaches = planned(p, {
    measurements: { ...measured(), bearingReach: 1.25 },
  });
  assert.equal(review(reaches).state, "geometry-checked");
  const tiny = {
      ...p,
      pieces: p.pieces.map((piece) =>
        piece.id === shelfId
          ? { ...piece, size: [1, piece.size[1], piece.size[2]] as V3 }
          : piece,
      ),
    },
    overshoot = planned(tiny, {
      measurements: { ...measured(), bearingReach: 12 },
    });
  assert.ok(
    codes(overshoot).some(
      (c) => c === "bearing-profile" || c === "bearing-reach",
    ),
  );
});

test("full-diameter bore, insertion length and deepest brad-tip penetration are checked separately against actual panel thickness", () => {
  for (const [measurements, code] of [
    [
      { ...measured(), pinInsertionDepth: 0.3, fullDiameterBoreDepth: 0.2 },
      "insertion-depth",
    ],
    [
      { ...measured(), fullDiameterBoreDepth: 0.25, deepestDrillTipDepth: 0.2 },
      "drill-tip-depth",
    ],
    [{ ...measured(), deepestDrillTipDepth: 0.75 }, "panel-breakthrough"],
  ] as const) {
    const p = planned(bookcase(), { measurements });
    assert.ok(codes(p).includes(code));
    assert.equal(review(p).activePinCount, 0);
  }
  const p = planned(bookcase(), { measurements: measured() });
  assert.equal(review(p).state, "geometry-checked");
});

test("5 mm bore radius checks stock edges and actual profile cuts rather than checking the center point alone", () => {
  const edge = planned(bookcase(), {
    layout: { ...config.layout, frontInset: 0.05 },
    measurements: measured(),
  });
  assert.ok(codes(edge).includes("hole-edge"));
  assert.equal(review(edge).state, "conflict");
  let p = bookcase();
  const side = p.sections.find((s) => s.name === "Left side")!,
    partId = side.pieceIds[0],
    piece = p.pieces.find((x) => x.id === partId)!,
    frontZ = piece.size[2] / 2 - 2;
  p = {
    ...p,
    pieces: p.pieces.map((x) =>
      x.id === partId
        ? {
            ...x,
            cutPlanes: [{ normal: [0, 0, 1] as V3, constant: frontZ + 0.05 }],
          }
        : x,
    ),
  };
  const cut = planned(p, { measurements: measured() });
  assert.ok(codes(cut).includes("hole-profile"));
  assert.equal(review(cut).stale, false);
  assert.equal(review(cut).activePinCount, 0);
});

test("a shelf underside or support target outside the actual retained footprint is a concrete conflict", () => {
  const p = planned(bookcase(), { measurements: measured() }),
    points = structuredClone(p.attachmentPlans[0].points);
  points[0].shelfAnchorLocal[2] = 100;
  const next = planFor(p, { points });
  assert.ok(codes(next).includes("shelf-footprint"));
  assert.ok(codes(next).includes("support-height"));
  assert.equal(review(next).state, "conflict");
  const higher = structuredClone(p.attachmentPlans[0].points);
  higher[0].bearingTargetLocal[1] += 0.125;
  assert.ok(codes(planFor(p, { points: higher })).includes("support-height"));
});

test("Kreg rows require an explicit hole-center datum and nominal 32 mm pitch without moving the requested shelves", () => {
  const p = bookcase(),
    custom = makeShelfPinPlan(p, entryId(p), {
      ...config,
      measurements: measured(),
    }),
    point = custom.points[0],
    mount = p.pieces.find((p) => p.id === point.mount.pieceId)!,
    datum =
      point.bearingTargetLocal[1] -
      custom.measurements.bearingOffset! +
      mount.size[1] / 2,
    good = planned(p, {
      layout: { ...config.layout, system: "kreg-32mm", datumHeight: datum },
      measurements: custom.measurements,
    });
  assert.equal(review(good).state, "geometry-checked");
  assert.ok(review(good).points.every((pt) => pt.rowIndex === 0));
  const missing = planned(p, {
    layout: { ...config.layout, system: "kreg-32mm" },
    measurements: measured(),
  });
  assert.ok(codes(missing).includes("row-datum"));
  assert.equal(review(missing).state, "needs-measurements");
  const offGrid = planned(p, {
    shelfRoles: ["shelf-1", "shelf-2"],
    layout: { ...config.layout, system: "kreg-32mm", datumHeight: datum },
    measurements: measured(),
  });
  assert.ok(codes(offGrid).includes("row-pitch"));
  assert.equal(review(offGrid).activePinCount, 0);
  assert.deepEqual(offGrid.pieces, p.pieces);
});

test("duplicate or nearby hole envelopes are excluded across separate plans rather than double-counted", () => {
  let p = planned(bookcase(), { measurements: measured() }),
    second = makeShelfPinPlan(p, entryId(p), {
      ...config,
      measurements: measured(),
    });
  p = saveShelfPinPlan(p, second);
  const reviews = attachmentReviews(p);
  assert.equal(reviews.length, 2);
  assert.ok(
    reviews.every((r) => r.state === "conflict" && r.activePinCount === 0),
  );
  assert.ok(
    reviews.every((r) => r.issues.some((i) => i.code === "duplicate-hole")),
  );
  let pending = planned();
  pending = saveShelfPinPlan(
    pending,
    makeShelfPinPlan(pending, entryId(pending), config),
  );
  assert.ok(
    attachmentReviews(pending).every(
      (r) =>
        r.activePinCount === 0 &&
        r.issues.some((i) => i.code === "duplicate-bearing"),
    ),
  );
});

test("opposing measured drilling envelopes on the same physical panel report a conflict even across plans", () => {
  let p = planned(bookcase(), {
      measurements: {
        ...measured(),
        fullDiameterBoreDepth: 0.4,
        deepestDrillTipDepth: 0.45,
      },
    }),
    other = makeShelfPinPlan(p, entryId(p), {
      ...config,
      measurements: {
        ...measured(),
        fullDiameterBoreDepth: 0.4,
        deepestDrillTipDepth: 0.45,
      },
    });
  other = {
    ...other,
    points: other.points.map((point) => ({
      ...point,
      mountFace: {
        ...point.mountFace,
        sign: point.mountFace.sign === 1 ? -1 : 1,
      },
      bearingTargetLocal: [
        -point.bearingTargetLocal[0],
        point.bearingTargetLocal[1],
        point.bearingTargetLocal[2],
      ],
    })),
  };
  p = saveShelfPinPlan(p, other);
  assert.ok(attachmentReviews(p).every((r) => r.activePinCount === 0));
  assert.ok(
    attachmentReviews(p).every((r) =>
      r.issues.some((i) => i.code === "opposing-holes"),
    ),
  );
});

test("existing fasteners without coordinates remain explicitly unresolved instead of acquiring invented hole locations", () => {
  let p = planned(bookcase(), { measurements: measured() }),
    side = p.attachmentPlans[0].points[0].mount.pieceId,
    back = p.sections.find((s) => s.name === "Back")!.pieceIds[0];
  p = connect(p, side, back, p.pieces.find((x) => x.id === side)!.stepId);
  const r = review(p);
  assert.ok(
    r.issues.some(
      (i) =>
        i.code === "fastener-locations-unresolved" && i.severity === "review",
    ),
  );
  assert.equal(r.state, "needs-measurements");
  assert.equal(r.activePinCount, 4);
  assert.equal(r.points.length, 4);
});

test("plan removal changes only planned records; invalid selection and malformed provenance never mutate a project", () => {
  const p = planned(),
    before = structuredClone(p),
    removed = removeAttachmentPlan(p, p.attachmentPlans[0].id);
  assert.deepEqual(removed.attachmentPlans, []);
  assert.deepEqual(removed.pieces, p.pieces);
  assert.deepEqual(removed.supplies, p.supplies);
  assert.deepEqual(p, before);
  assert.throws(() =>
    makeShelfPinPlan(p, entryId(p), {
      ...config,
      shelfRoles: ["shelf-1", "shelf-1"],
    }),
  );
  assert.throws(() =>
    makeShelfPinPlan(p, entryId(p), { ...config, shelfRoles: ["shelf-6"] }),
  );
  assert.throws(() =>
    makeShelfPinPlan(p, entryId(p), {
      ...config,
      measurements: { ...measured(), basis: "" },
    }),
  );
  assert.throws(() => makeShelfPinPlan(p, uid(), config));
});

test("within one plan a shared unknown bearing offset cannot hide front/rear rows that are already closer than the nominal bore diameter", () => {
  const p = bookcase(),
    plan = makeShelfPinPlan(p, entryId(p), {
      ...config,
      layout: { ...config.layout, frontInset: 7.6, rearInset: 7.55 },
    }),
    next = saveShelfPinPlan(p, plan);
  assert.equal(review(next).state, "conflict");
  assert.ok(codes(next).includes("duplicate-hole"));
  assert.equal(review(next).activePinCount, 0);
  assert.ok(
    review(next).points.every((point) => point.holeCenterLocal === null),
  );
});

test("source-exact .703 side stock checks actual breakthrough rather than nominal three-quarter-inch thickness", () => {
  const p = createBuildStudy("shelves", undefined, undefined, {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    }).project,
    next = planned(p, {
      measurements: { ...measured(), deepestDrillTipDepth: 0.72 },
    });
  assert.ok(codes(next).includes("panel-breakthrough"));
  assert.equal(review(next).activePinCount, 0);
  assert.equal(
    review(planned(p, { measurements: measured() })).state,
    "geometry-checked",
  );
});

test("removing a planned shelf role retains its exact orphan intentions without rebinding to a surviving shelf", () => {
  const p = planned(bookcase(), {
      shelfRoles: ["shelf-3"],
      measurements: measured(),
    }),
    plan = p.attachmentPlans[0],
    b = p.ideaBindings[0],
    idea = bindingPlan(p, b.id);
  assert.equal(idea.structures[0].kind, "casework-shelves");
  if (idea.structures[0].kind !== "casework-shelves")
    throw Error("Missing casework family");
  idea.structures[0].parameters.shelfCount = 2;
  const next = applyIdeaRevision(p, b.id, idea, bindingToken(p, b.id));
  assert.deepEqual(next.attachmentPlans, [plan]);
  assert.equal(review(next).state, "stale");
  assert.equal(review(next).activePinCount, 0);
  assert.equal(review(next).points.length, 4);
  assert.throws(
    () =>
      makeShelfPinPlan(next, entryId(next), {
        ...config,
        id: plan.id,
        shelfRoles: ["shelf-3"],
      }),
    /missing/,
  );
});

test("explicit refresh cannot qualify metal, glazing or linear stock as a wood shelf-pin panel", () => {
  for (const [role, material] of [
    ["side-left", "roof"],
    ["side-right", "stud"],
    ["shelf-1", "sunlite-8mm"],
  ] as const) {
    let p = planned(bookcase(), { measurements: measured() });
    const plan = p.attachmentPlans[0],
      ref = plan.points
        .flatMap((point) => [point.mount, point.shelf])
        .find((ref) => ref.role === role)!;
    p = {
      ...p,
      pieces: p.pieces.map((piece) =>
        piece.id === ref.pieceId ? { ...piece, material } : piece,
      ),
    };
    assert.equal(review(p).state, "stale");
    const fresh = makeShelfPinPlan(p, entryId(p), {
      ...config,
      id: plan.id,
      measurements: plan.measurements,
    });
    p = saveShelfPinPlan(p, fresh);
    assert.equal(review(p).stale, false);
    assert.ok(codes(p).includes("unsupported-panel-material"));
    assert.equal(review(p).state, "conflict");
    assert.equal(review(p).activePinCount, 0);
  }
});

test("actual local side-X and shelf-Y thickness must match selected source stock after explicit refresh", () => {
  for (const [role, axis] of [
    ["side-left", 0],
    ["shelf-1", 1],
  ] as const) {
    let p = planned(bookcase(), { measurements: measured() });
    const plan = p.attachmentPlans[0],
      ref = plan.points
        .flatMap((point) => [point.mount, point.shelf])
        .find((ref) => ref.role === role)!;
    p = {
      ...p,
      pieces: p.pieces.map((piece) => {
        if (piece.id !== ref.pieceId) return piece;
        const size = [...piece.size] as V3;
        size[axis] = 24;
        return { ...piece, size };
      }),
    };
    const fresh = makeShelfPinPlan(p, entryId(p), {
      ...config,
      id: plan.id,
      measurements: plan.measurements,
    });
    p = saveShelfPinPlan(p, fresh);
    assert.ok(codes(p).includes("panel-source-thickness"));
    assert.equal(review(p).state, "conflict");
    assert.equal(review(p).activePinCount, 0);
  }
  const p = bookcase(),
    ref = shelfSupportEntries(p)[0].shelves[0],
    reoriented = {
      ...p,
      pieces: p.pieces.map((piece) =>
        piece.id === ref.pieceId
          ? { ...piece, stockLengthAxis: 1 as const }
          : piece,
      ),
    },
    plan = planned(reoriented, { measurements: measured() });
  assert.ok(codes(plan).includes("panel-thickness-axis"));
  assert.equal(review(plan).activePinCount, 0);
});
