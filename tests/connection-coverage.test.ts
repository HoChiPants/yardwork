import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { blank, part, uid, projectSchema } from "../src/model";
import { connectionCoverage } from "../src/connectionCoverage";
import { createBuildStudy } from "../src/buildFixtures";
import { connect, cutPiece } from "../src/engine";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
  fastenerReviews,
} from "../src/fastenings";
import {
  attachmentReviews,
  makeShelfPinPlan,
  saveShelfPinPlan,
} from "../src/attachments";
import { lidHingeReviews } from "../src/hinges";
import {
  addRestraintLocation,
  makeRestraintPlan,
  selectRestraintReceiver,
  saveRestraintPlan,
  restraintReviews,
} from "../src/restraints";
import { addSupply } from "../src/supplies";
import { assemblyStages } from "../src/assemblyStages";
import { rotate, composeRotation } from "../src/spatial";

function boards(count = 3) {
  const p = blank("Actual members");
  p.pieces = [
    part(
      "Identical display name",
      "plywood",
      [8, 8, 0.75],
      [0, 4, 0],
      p.steps[0].id,
      "Test assembly",
    ),
    part(
      "Identical display name",
      "plywood",
      [8, 8, 0.75],
      [0, 4, -0.75],
      p.steps[0].id,
      "Test assembly",
    ),
  ];
  if (count === 3)
    p.pieces.push(
      part(
        "Untouched neighbor",
        "plywood",
        [8, 8, 0.75],
        [30, 4, 0],
        p.steps[0].id,
        "Test assembly",
      ),
    );
  return p;
}
function located() {
  let p = boards(2),
    plan = addFastenerLocation(
      makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
    );
  plan.locations[0].entranceLocal = [0, 0, 0.375];
  plan.locations[0].driveLocal = [0, 0, -1];
  plan.measurements = {
    surfaceToTipDepth: 1.1,
    pilotDiameter: 0.1,
    pilotDepth: 1.2,
    basis: "SYNTHETIC centerline fixture, not installation evidence",
    measuredAt: "2026-11-16T18:00:00Z",
  };
  p = saveFastenerPlan(p, plan);
  return p;
}

test("blank and hardware-only projects have no invented part nodes, contacts or connection intent", () => {
  const p = blank(),
    g = connectionCoverage(p);
  assert.deepEqual(g.parts, []);
  assert.deepEqual(g.intents, []);
  assert.deepEqual(g.components, []);
  assert.equal(g.summary.activeParts, 0);
  const hardware = part(
    "Loose purchased screw",
    "screw",
    [0.18, 3, 0.18],
    [0, 2, 0],
    p.steps[0].id,
    "Hardware",
  );
  assert.equal(
    connectionCoverage({ ...p, pieces: [hardware] }).parts.length,
    0,
  );
});

test("touching members, selected purchase packs and checked guide steps do not create intent or join groups", () => {
  const p = boards(),
    base = connectionCoverage(p);
  assert.equal(base.summary.noIntentParts, 3);
  assert.equal(base.components.length, 3);
  let changed = addSupply(p, "grk-r4-103101", 3, "User purchase");
  changed = {
    ...changed,
    steps: changed.steps.map((step) => ({ ...step, complete: true })),
  };
  assert.deepEqual(connectionCoverage(changed), base);
  assert.equal(p.fastenerPlans.length, 0);
  assert.equal(p.supplies.length, 0);
});

test("one legacy pair record addresses exactly its two actual members, not the whole declared assembly", () => {
  let p = boards();
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  const g = connectionCoverage(p);
  assert.equal(g.summary.legacyRecords, 1);
  assert.equal(g.summary.noCurrentIntentParts, 1);
  assert.equal(g.summary.noIntentParts, 1);
  assert.equal(g.components.length, 2);
  const record = g.intents[0];
  assert.equal(record.state, "legacy-record");
  assert.equal(record.explicitLocationCount, 0);
  assert.equal(record.current, true);
  assert.match(record.issues[0].message, /does not locate holes/);
  assert.deepEqual(
    new Set(record.coveragePieceIds),
    new Set(p.pieces.slice(0, 2).map((piece) => piece.id)),
  );
  assert.equal(
    g.parts.find((part) => part.pieceId === p.pieces[2].id)?.state,
    "missing",
  );
});

test("invalid catalog pair records and obviously separated endpoints remain excluded instead of gaining current credit", () => {
  let p = boards();
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  const badSize = structuredClone(p);
  badSize.joints[0].length = 2;
  let g = connectionCoverage(badSize);
  assert.equal(g.intents[0].state, "conflict");
  assert.equal(g.summary.noCurrentIntentParts, 3);
  assert.ok(
    g.intents[0].issues.some((issue) => issue.code === "legacy-hardware"),
  );
  const separated = structuredClone(p);
  separated.pieces[1].position[2] -= 10;
  g = connectionCoverage(separated);
  assert.equal(g.intents[0].current, false);
  assert.ok(
    g.intents[0].issues.some((issue) => issue.code === "legacy-separated"),
  );
});

test("started W0 and H0 plans retain actual references but do not pretend to have explicit connection locations", () => {
  let p = boards();
  p = saveFastenerPlan(p, makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id));
  const g = connectionCoverage(p);
  assert.equal(g.intents.length, 1);
  assert.equal(g.intents[0].state, "started");
  assert.equal(g.intents[0].explicitLocationCount, 0);
  assert.equal(g.intents[0].current, false);
  assert.equal(g.summary.noCurrentIntentParts, 3);
  assert.equal(g.components.length, 3);
  const storage = createBuildStudy("storage-banquette").project,
    h = connectionCoverage(storage);
  assert.equal(h.summary.startedIntents, 3);
  assert.equal(h.summary.noCurrentIntentParts, 42);
  assert.equal(h.summary.noIntentParts, 39);
  for (const plan of storage.lidHingePlans) {
    const lid = h.parts.find((part) => part.pieceId === plan.moving.pieceId)!,
      rear = h.parts.find((part) => part.pieceId === plan.fixed.pieceId)!;
    assert.equal(lid.state, "started");
    assert.equal(rear.state, "missing");
    assert.equal(rear.intentIds.length, 0);
    assert.equal(rear.contextIntentIds.length, 1);
  }
});

test("an explicit unknown W location is pending intent, with its missing geometry visible rather than approved", () => {
  let p = boards();
  p = saveFastenerPlan(
    p,
    addFastenerLocation(makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id)),
  );
  const g = connectionCoverage(p),
    row = g.intents[0];
  assert.equal(row.state, "pending");
  assert.equal(row.explicitLocationCount, 1);
  assert.equal(row.label, "W001/F001");
  assert.equal(row.current, true);
  assert.equal(g.summary.pendingIntents, 1);
  assert.equal(g.summary.noCurrentIntentParts, 1);
  assert.ok(g.gaps.some((gap) => gap.kind === "pending-intent"));
  assert.match(g.scope, /do not establish complete joinery/);
  assert.equal("installed" in g, false);
  assert.equal("strengthScore" in g, false);
});

test("a reviewed wood centerline is source-specific evidence and preserves complete input JSON", () => {
  const p = located(),
    before = JSON.stringify(p),
    g = connectionCoverage(p);
  assert.equal(g.intents[0].state, "geometry-reviewed");
  assert.equal(g.intents[0].sourceState, "path-reviewed");
  assert.equal(g.summary.noCurrentIntentParts, 0);
  assert.equal(g.components.length, 1);
  assert.equal(JSON.stringify(p), before);
  assert.match(g.scope, /installed hardware/);
});

test("a conflicting W location does not erase its valid neighbor, and excluded evidence remains actionable", () => {
  let p = located(),
    plan = addFastenerLocation(p.fastenerPlans[0]);
  plan.locations[1].entranceLocal = [100, 0, 0.375];
  plan.locations[1].driveLocal = [0, 0, -1];
  p = saveFastenerPlan(p, plan);
  assert.equal(fastenerReviews(p)[0].state, "conflict");
  const g = connectionCoverage(p);
  assert.equal(g.summary.geometryReviewedIntents, 1);
  assert.equal(g.summary.excludedIntents, 1);
  assert.equal(g.summary.noCurrentIntentParts, 0);
  assert.equal(
    g.intents.find((row) => row.locationId === plan.locations[0].id)?.current,
    true,
  );
  assert.equal(
    g.intents.find((row) => row.locationId === plan.locations[1].id)?.current,
    false,
  );
  assert.ok(g.gaps.some((gap) => gap.kind === "excluded-intent"));
  assert.ok(
    g.parts.every(
      (part) =>
        part.excludedIntentIds.length === 1 &&
        part.currentIntentIds.length === 1,
    ),
  );
});

test("cut or missing same-name references remain stale and are never rebound to replacement parts", () => {
  const original = located(),
    cut = cutPiece(original, original.pieces[0].id, 6, 0),
    g = connectionCoverage(cut);
  assert.equal(g.intents[0].state, "stale");
  assert.equal(g.summary.noCurrentIntentParts, 2);
  assert.equal(g.parts.length, 2);
  assert.ok(cut.pieces.some((piece) => piece.offcut));
  const oldId = original.pieces[0].id,
    replacement = { ...original.pieces[0], id: uid() },
    changed = { ...original, pieces: [replacement, original.pieces[1]] },
    missing = connectionCoverage(changed);
  assert.equal(missing.intents[0].state, "stale");
  assert.ok(missing.intents[0].pieceIds.includes(oldId));
  assert.ok(!missing.intents[0].pieceIds.includes(replacement.id));
  assert.equal(
    missing.parts.find((part) => part.pieceId === replacement.id)?.state,
    "missing",
  );
  assert.equal(missing.summary.noCurrentIntentParts, 2);
});

test("shared fullEuler rigid motion preserves intent states and component identities", () => {
  const p = located(),
    r: [number, number, number] = [0.3, -0.6, 0.2],
    delta = [12, 4, -7],
    moved = {
      ...p,
      pieces: p.pieces.map((piece) => ({
        ...piece,
        position: rotate(piece.position, r).map((v, i) => v + delta[i]) as [
          number,
          number,
          number,
        ],
        rotation: composeRotation(r, piece.rotation),
      })),
    };
  const before = connectionCoverage(p),
    after = connectionCoverage(moved);
  assert.deepEqual(after.summary, before.summary);
  assert.deepEqual(after.components, before.components);
  assert.equal(after.intents[0].state, "geometry-reviewed");
});

test("shelf support points address shelves only; their side mounts still need carcass connection intent", () => {
  let p = createBuildStudy("shelves").project;
  const entry = p.ideaBindings[0].entries[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.id, {
      shelfRoles: ["shelf-1", "shelf-2", "shelf-3"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  const g = connectionCoverage(p);
  assert.equal(g.summary.pendingIntents, 12);
  assert.equal(g.summary.noCurrentIntentParts, 5);
  const shelves = g.stages.find((stage) => stage.key === "shelves")!,
    carcass = g.stages.find((stage) => stage.key === "carcass")!;
  assert.equal(shelves.pendingPartIds.length, 3);
  assert.equal(carcass.noIntentPartIds.length, 5);
  assert.equal(carcass.noCurrentIntentPartIds.length, 5);
  for (const row of g.intents) {
    assert.equal(row.purpose, "shelf-support");
    assert.equal(row.coveragePieceIds.length, 1);
    assert.equal(row.pieceIds.length, 2);
    const mount = row.pieceIds.find(
      (id) => !row.coveragePieceIds.includes(id),
    )!;
    assert.equal(
      g.parts.find((part) => part.pieceId === mount)?.currentIntentIds.length,
      0,
    );
  }
});

test("external restraint rows retain a wall association without inventing wall parts or covering internal joinery", () => {
  let p = boards(2);
  p.pieces[0] = { ...p.pieces[0], material: "one-four", size: [8, 3.5, 0.75] };
  let plan = selectRestraintReceiver(p, makeRestraintPlan(p), p.pieces[0].id);
  plan = addRestraintLocation(plan);
  plan.locations[0].wallEyeWorld = [0, 5, -2];
  p = saveRestraintPlan(p, plan);
  const g = connectionCoverage(p);
  assert.equal(g.summary.externalRestraintIntents, 1);
  assert.equal(g.parts.length, 2);
  assert.equal(g.components.length, 2);
  assert.equal(g.summary.noCurrentIntentParts, 2);
  assert.equal(g.parts[0].currentIntentIds.length, 0);
  assert.equal(g.parts[0].externalIntentIds.length, 1);
  assert.deepEqual(g.intents[0].external?.wallEyeWorld, [0, 5, -2]);
  assert.equal(g.intents[0].purpose, "external-restraint");
  assert.ok(!g.parts.some((part) => part.pieceId.includes("wall")));
});

test("current stage ownership survives stale guide metadata and cross-stage references without crediting context mounts", () => {
  let p = createBuildStudy("shelves").project;
  const entry = p.ideaBindings[0].entries[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.id, {
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  p.guideFingerprint = null;
  const g = connectionCoverage(p);
  assert.equal(g.stages.length, 2);
  const shelf = g.stages.find((stage) => stage.key === "shelves")!,
    carcass = g.stages.find((stage) => stage.key === "carcass")!;
  assert.equal(shelf.ownerId, entry.id);
  assert.equal(shelf.pendingPartIds.length, 1);
  assert.equal(carcass.noCurrentIntentPartIds.length, 5);
  assert.equal(shelf.intentIds.length, 4);
  assert.equal(carcass.intentIds.length, 4);
});

test("cached source reviews produce the same graph without being mutated; missing cached reviews remain excluded", () => {
  const p = located(),
    cache = {
      stages: assemblyStages(p),
      fasteners: fastenerReviews(p),
      hinges: lidHingeReviews(p),
      attachments: attachmentReviews(p),
      restraints: restraintReviews(p),
    },
    before = structuredClone(cache),
    expected = connectionCoverage(p);
  assert.deepEqual(connectionCoverage(p, cache), expected);
  assert.deepEqual(cache, before);
  const unavailable = connectionCoverage(p, { ...cache, fasteners: [] });
  assert.equal(unavailable.intents[0].state, "conflict");
  assert.equal(unavailable.intents[0].current, false);
  assert.ok(
    unavailable.intents[0].issues.some(
      (issue) => issue.code === "review-unavailable",
    ),
  );
});

test("allfive actual public families retain full part/stage membership and unresolved connection work", async () => {
  for (const [file, count] of [
    ["storage-banquette", 42],
    ["shelves", 8],
    ["closet-insert", 12],
    ["greenhouse", 99],
    ["sauna", 46],
  ] as const) {
    const p = projectSchema.parse(JSON.parse(
        await readFile(
          new URL(
            `../public/examples/builds/${file}.yardwork.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      )),
      before = JSON.stringify(p),
      g = connectionCoverage(p);
    assert.equal(g.parts.length, count);
    assert.equal(g.summary.noCurrentIntentParts, count);
    assert.equal(g.summary.geometryReviewedIntents, 0);
    assert.deepEqual(
      new Set(g.stages.flatMap((stage) => stage.memberIds)),
      new Set(g.parts.map((part) => part.pieceId)),
    );
    assert.equal(g.stages.flatMap((stage) => stage.memberIds).length, count);
    assert.ok(g.gaps.length);
    assert.equal(JSON.stringify(p), before);
  }
});

test("actual synthetic measured H001 covers the moving lid task, never its rear shell or unmodeled neighbors", async () => {
  const p = projectSchema.parse(JSON.parse(
      await readFile(
        new URL(
          "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    )),
    g = connectionCoverage(p),
    plan = p.lidHingePlans.find((plan) => plan.label === "H001")!;
  assert.equal(g.summary.geometryReviewedIntents, 2);
  assert.equal(g.summary.pendingIntents, 1);
  assert.equal(g.summary.startedIntents, 2);
  assert.equal(g.summary.noCurrentIntentParts, 39);
  const hingeRows = g.intents.filter((row) => row.planId === plan.id);
  assert.ok(
    hingeRows.every(
      (row) =>
        row.coveragePieceIds.length === 1 &&
        row.coveragePieceIds[0] === plan.moving.pieceId,
    ),
  );
  const rear = g.parts.find((part) => part.pieceId === plan.fixed.pieceId)!;
  assert.equal(rear.currentIntentIds.length, 1);
  assert.ok(
    rear.currentIntentIds.every(
      (id) => g.intents.find((row) => row.id === id)?.kind === "wood-fastener",
    ),
  );
  assert.equal(rear.contextIntentIds.length, 2);
  assert.equal(
    g.parts.find((part) => part.pieceId === plan.moving.pieceId)?.state,
    "geometry-reviewed",
  );
});

test("changed actual lid geometry excludes H evidence without attaching its fixed rear panel to the shell", async () => {
  const p = projectSchema.parse(JSON.parse(
      await readFile(
        new URL(
          "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    )),
    plan = p.lidHingePlans.find((plan) => plan.label === "H001")!;
  p.pieces.find((piece) => piece.id === plan.moving.pieceId)!.size[0] -= 1;
  const g = connectionCoverage(p),
    hinges = g.intents.filter((row) => row.planId === plan.id);
  assert.equal(hinges.length, 2);
  assert.ok(hinges.every((row) => row.state === "stale" && !row.current));
  const lid = g.parts.find((part) => part.pieceId === plan.moving.pieceId)!;
  assert.equal(lid.currentIntentIds.length, 0);
  assert.equal(lid.excludedIntentIds.length, 2);
  const rear = g.parts.find((part) => part.pieceId === plan.fixed.pieceId)!;
  assert.ok(
    rear.currentIntentIds.every(
      (id) => g.intents.find((row) => row.id === id)?.kind === "wood-fastener",
    ),
  );
});

test("conflicting shelf drilling evidence cannot cover either shelves or contextual carcass mounts", () => {
  let p = createBuildStudy("shelves").project;
  const entry = p.ideaBindings[0].entries[0];
  let plan = makeShelfPinPlan(p, entry.id, {
    shelfRoles: ["shelf-1", "shelf-2", "shelf-3"],
    layout: {
      system: "custom",
      frontInset: 2,
      rearInset: 2,
      datumHeight: null,
    },
  });
  plan = {
    ...plan,
    measurements: {
      pinInsertionDepth: 0.2,
      bearingReach: 0.25,
      bearingOffset: 0.05,
      fullDiameterBoreDepth: 0.9,
      deepestDrillTipDepth: 1,
      basis: "SYNTHETIC deliberately invalid through-drill",
      measuredAt: "2026-11-16T18:00:00Z",
    },
  };
  p = saveShelfPinPlan(p, plan);
  const g = connectionCoverage(p);
  assert.equal(g.summary.excludedIntents, 12);
  assert.equal(g.summary.noCurrentIntentParts, 8);
  assert.ok(g.intents.every((row) => row.state === "conflict" && !row.current));
  assert.equal(
    g.stages.find((stage) => stage.key === "carcass")?.noIntentPartIds.length,
    5,
  );
});

test("wholly missing retained plan references remain actionable without generating ghost piece or wall nodes", () => {
  const original = located(),
    p = { ...original, pieces: [] },
    g = connectionCoverage(p);
  assert.deepEqual(g.parts, []);
  assert.deepEqual(g.components, []);
  assert.equal(g.intents.length, 1);
  assert.equal(g.intents[0].state, "stale");
  assert.ok(
    g.gaps.some(
      (gap) =>
        gap.stageKey === "unassigned-intents" &&
        gap.intentIds.includes(g.intents[0].id),
    ),
  );
  let external = blank();
  external = saveRestraintPlan(
    external,
    addRestraintLocation(makeRestraintPlan(external)),
  );
  const e = connectionCoverage(external);
  assert.deepEqual(e.parts, []);
  assert.equal(e.intents.length, 1);
  assert.equal(e.intents[0].current, false);
  assert.ok(e.gaps.some((gap) => gap.intentIds.includes(e.intents[0].id)));
});

test("partial or duplicated stage caches do not drop or double-count actual members, and intent components ignore array order", () => {
  const p = boards(),
    stage = assemblyStages(p)[0],
    g = connectionCoverage(p, {
      stages: [
        { ...stage, memberIds: [stage.memberIds[0], uid()] },
        { ...stage, memberIds: [stage.memberIds[0]] },
      ],
    });
  assert.equal(g.parts.length, 3);
  assert.equal(g.stages.flatMap((stage) => stage.memberIds).length, 3);
  assert.equal(new Set(g.stages.flatMap((stage) => stage.memberIds)).size, 3);
  assert.ok(g.stages.some((stage) => stage.key === "unassigned-parts"));
  const linked = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  assert.deepEqual(
    connectionCoverage({ ...linked, pieces: [...linked.pieces].reverse() })
      .components,
    connectionCoverage(linked).components,
  );
});
