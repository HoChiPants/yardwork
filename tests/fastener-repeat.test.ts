import assert from "node:assert/strict";
import test from "node:test";
import { makeConnectorPlan, saveConnectorPlan } from "../src/connectors";
import { createBuildStudy } from "../src/buildFixtures";
import { greenhouseRoofAttachments } from "../src/greenhouseRoofAttachments";
import { greenhouseScrewRepeatFixture } from "./fixtures/greenhouse-screw-repeat";
import { guideMarkdown } from "../src/engine";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import { previewFastenerContactRow } from "../src/fastenerContactRow";
import { fastenerPurchaseSummary } from "../src/fastenerPurchases";
import {
  applyFastenerRepeat,
  fastenerRepeatKind,
  previewFastenerRepeat,
} from "../src/fastenerRepeat";
import {
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import { emptyFastenerMeasurements } from "../src/fasteningSchema";
import { part, projectSchema, uid, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";

function study(headRole = "storage-rear") {
  const baseline = createBuildStudy("storage-banquette").project;
  const [section, second, third] = baseline.sections;
  const members = baseline.pieces.filter((piece) =>
    section.pieceIds.includes(piece.id),
  );
  const head = members.find((piece) => piece.designRole === headRole)!;
  const receiver = members.find((piece) => piece.designRole === "leg")!;
  const floor = headRole === "storage-bottom";
  const draft = previewFastenerContactRow(
    baseline,
    head.id,
    receiver.id,
    { count: 3, endInset: floor ? 0.5 : 2, beforeFloorPlacement: floor },
    { productId: "grk-cabinet-114069" },
  ).plan;
  const source = floor
    ? draft
    : {
        ...draft,
        measurements: {
          surfaceToTipDepth: 1.125,
          pilotDiameter: 0.0625,
          pilotDepth: 1,
          basis: "Synthetic software test fixture",
          measuredAt: new Date().toISOString(),
        },
      };
  return { source, project: saveFastenerPlan(baseline, source), second, third };
}

test("a saved three-mark banquette joint repeats on two translated modules with fresh local references", () => {
  const { project, source, second, third } = study();
  assert.equal(fastenerReviews(project)[0].state, "path-reviewed");
  const preview = previewFastenerRepeat(project, source.id);
  assert.deepEqual(
    preview.rows.map(({ section, issue }) => [section.id, issue]),
    [
      [second.id, null],
      [third.id, null],
    ],
  );
  assert.equal(project.fastenerPlans.length, 1);
  const result = applyFastenerRepeat(
    project,
    preview,
    [second.id, third.id],
    false,
  );
  assert.deepEqual(result.pieces, project.pieces);
  assert.deepEqual(result.supplies, project.supplies);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(result)));
  const [original, a, b] = reopened.fastenerPlans;
  assert.deepEqual(
    [original.label, a.label, b.label],
    ["W001", "W002", "W003"],
  );
  assert.deepEqual(original, project.fastenerPlans[0]);
  for (const [copied, section] of [
    [a, second],
    [b, third],
  ] as const) {
    assert.ok(section.pieceIds.includes(copied.head.pieceId));
    assert.ok(section.pieceIds.includes(copied.receiver.pieceId));
    assert.deepEqual(
      copied.locations.map((location) => location.entranceLocal),
      source.locations.map((location) => location.entranceLocal),
    );
    assert.deepEqual(copied.measurements, emptyFastenerMeasurements());
    assert.equal(copied.referenceHistory.length, 0);
  }
  assert.equal(
    new Set(
      reopened.fastenerPlans.flatMap(({ locations }) =>
        locations.map(({ id }) => id),
      ),
    ).size,
    9,
  );
  assert.deepEqual(
    fastenerReviews(reopened).map(({ state }) => state),
    ["path-reviewed", "needs-measurements", "needs-measurements"],
  );
  assert.equal(
    fastenerPurchaseSummary(reopened).products.find(
      (row) => row.productId === source.productId,
    )?.plannedScrews,
    9,
  );
  assert.match(guideMarkdown(reopened), /Repeated layout from W001/);
  assert.match(fastenerScheduleCsv(reopened), /W003/);
  assert.throws(
    () => applyFastenerRepeat(reopened, preview, [second.id], false),
    /changed/,
  );
});

test("a covered entrance and a changed retained profile stay outside repeatable joints", () => {
  const { project, source, second, third } = study();
  const fresh = previewFastenerRepeat(project, source.id);
  const selected = fresh.rows[0].target!;
  const point = selected.plan.locations[0].entranceLocal!.map(
    (value, index) => value + selected.head.position[index],
  ) as V3;
  const cover = part(
    "Entry cover",
    "plywood",
    [1, 1, 0.5],
    [point[0], point[1], point[2] - 0.25],
    selected.head.stepId,
    "Manual",
  );
  const alternate = fresh.rows[1].target!;
  const edited = {
    ...project,
    pieces: [
      ...project.pieces.map((piece) =>
        piece.id === alternate.head.id
          ? {
              ...piece,
              size: [piece.size[0] - 1, piece.size[1], piece.size[2]] as V3,
            }
          : piece,
      ),
      cover,
    ],
  };
  const preview = previewFastenerRepeat(edited, source.id);
  assert.match(
    preview.rows.find(({ section }) => section.id === second.id)!.issue!,
    /covers a screw entrance/,
  );
  assert.match(
    preview.rows.find(({ section }) => section.id === third.id)!.issue!,
    /cut shapes/,
  );
  assert.throws(
    () => applyFastenerRepeat(edited, fresh, [second.id], false),
    /changed/,
  );
  assert.equal(edited.fastenerPlans.length, 1);
});

test("a rigidly rotated module matches, and an existing reverse-direction plan is preserved", () => {
  const { project, source, second, third } = study();
  const [secondTarget, thirdTarget] = previewFastenerRepeat(
    project,
    source.id,
  ).rows.map(({ target }) => target!);
  const withPlan = saveFastenerPlan(
    project,
    makeFastenerPlan(project, thirdTarget.receiver.id, thirdTarget.head.id),
  );
  const yaw: V3 = [0, 0.53, 0];
  const rotated = {
    ...withPlan,
    pieces: withPlan.pieces.map((piece) =>
      second.pieceIds.includes(piece.id)
        ? {
            ...piece,
            position: rotate(piece.position, yaw).map(
              (value, axis) => value + [100, 0, 30][axis],
            ) as V3,
            rotation: composeRotation(yaw, piece.rotation),
          }
        : piece,
    ),
  };
  const preview = previewFastenerRepeat(rotated, source.id);
  assert.equal(preview.rows[0].target?.head.id, secondTarget.head.id);
  assert.match(preview.rows[1].issue!, /already has a screw plan/);
  assert.throws(
    () => applyFastenerRepeat(rotated, preview, [second.id, third.id], false),
    /no longer available/,
  );
  const result = applyFastenerRepeat(rotated, preview, [second.id], false);
  assert.equal(result.fastenerPlans[1].id, withPlan.fastenerPlans[1].id);
  assert.equal(fastenerReviews(result)[2].locations[0].gap, 0);
});

test("floor-side entries need an explicit access decision for the new destination", () => {
  const { project, source, third } = study("storage-bottom");
  const preview = previewFastenerRepeat(project, source.id);
  assert.ok(preview.rows.every(({ target }) => target?.floorAccess));
  assert.throws(
    () => applyFastenerRepeat(project, preview, [third.id], false),
    /floor-side entries/,
  );
  const added = applyFastenerRepeat(project, preview, [third.id], true);
  assert.equal(added.fastenerPlans[1].label, "W002");
  assert.match(
    added.fastenerPlans[1].notes,
    /before setting the assembly down/,
  );
});

test("a roof repeats marks on matching rafter and block pairs from one pitch and accounts for the screws", () => {
  const { project, source, joint } = greenhouseScrewRepeatFixture();
  assert.equal(fastenerRepeatKind(project, source), "roof");
  assert.equal(fastenerReviews(project)[0].activePointCount, 1);
  const before = JSON.stringify(project);
  const preview = previewFastenerRepeat(project, source.id);
  assert.equal(JSON.stringify(project), before);
  assert.equal(preview.rows.length, 9);
  const choices = preview.rows.filter(({ target }) => target !== null);
  assert.equal(choices.length, 4);
  assert.ok(
    choices.every(
      ({ section }) =>
        section.id !== joint.id &&
        section.name.startsWith("Rafter to eave block"),
    ),
  );
  const result = applyFastenerRepeat(
    project,
    preview,
    choices.map(({ section }) => section.id),
    false,
  );
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(saved.pieces, project.pieces);
  assert.deepEqual(saved.supplies, project.supplies);
  assert.deepEqual(saved.fastenerPlans[0], project.fastenerPlans[0]);
  assert.equal(saved.fastenerPlans.length, 5);
  for (const copied of saved.fastenerPlans.slice(1)) {
    assert.deepEqual(
      copied.locations[0].entranceLocal,
      source.locations[0].entranceLocal,
    );
    assert.deepEqual(
      copied.locations[0].driveLocal,
      source.locations[0].driveLocal,
    );
    assert.deepEqual(copied.measurements, emptyFastenerMeasurements());
  }
  assert.ok(
    fastenerReviews(saved).every(({ locations }) => locations[0].gap === 0),
  );
  assert.equal(
    fastenerPurchaseSummary(saved).products.find(
      ({ productId }) => productId === source.productId,
    )?.plannedScrews,
    5,
  );
  assert.match(
    guideMarkdown(saved),
    /Greenhouse roof attachments[\s\S]*Rafter to eave block[^\n]+W00[2-5]/,
  );
});

test("a block layout repeats at distinct spots along the same receiving plate", () => {
  const { project, source } = greenhouseScrewRepeatFixture("block-plate");
  const preview = previewFastenerRepeat(project, source.id);
  const choices = preview.rows.filter(({ target }) => target !== null);
  assert.equal(choices.length, 2);
  assert.ok(
    choices.every(
      ({ target }) => target!.receiver.id === source.receiver.pieceId,
    ),
  );
  const result = applyFastenerRepeat(
    project,
    preview,
    choices.map(({ section }) => section.id),
    false,
  );
  const paths = fastenerReviews(result).map(({ locations }) => locations[0]);
  assert.ok(
    paths.every(({ gap, includedInDemand }) => gap === 0 && includedInDemand),
  );
  assert.equal(
    new Set(paths.map(({ entranceWorld }) => entranceWorld![2])).size,
    3,
  );
});

test("roof repeat leaves covered entries and existing layouts for review and invalidates stale choices", () => {
  const { project, source } = greenhouseScrewRepeatFixture();
  const original = previewFastenerRepeat(project, source.id);
  const [first, second, third, fourth] = original.rows.filter(
    ({ target }) => target !== null,
  );
  const { head, receiver, plan } = first.target!;
  const entry = [...plan.locations[0].entranceLocal!] as V3;
  entry[0] -= 0.1;
  const point = rotate(entry, head.rotation).map(
    (value, i) => value + head.position[i],
  ) as V3;
  const cover = part(
    "Existing entry cover",
    "plywood",
    [0.2, 0.2, 0.2],
    point,
    head.stepId,
    "Existing",
    head.rotation,
  );
  const withCover = { ...project, pieces: [...project.pieces, cover] };
  const { head: otherHead, receiver: otherReceiver } = second.target!;
  const bracket = third.target!;
  const legacy = fourth.target!;
  const withConnector = saveConnectorPlan(
    withCover,
    makeConnectorPlan(withCover, bracket.head.id, bracket.receiver.id),
  );
  const withLegacy = {
    ...withConnector,
    joints: [
      {
        id: uid(),
        a: legacy.head.id,
        b: legacy.receiver.id,
        kind: "screw" as const,
        quantity: 1,
        length: 2,
        stepId: legacy.head.stepId,
      },
    ],
  };
  const edited = saveFastenerPlan(
    withLegacy,
    makeFastenerPlan(withLegacy, otherReceiver.id, otherHead.id),
  );
  const next = previewFastenerRepeat(edited, source.id);
  assert.match(
    next.rows.find(({ section }) => section.id === first.section.id)!.issue!,
    /covers a screw entrance/,
  );
  assert.match(
    next.rows.find(({ section }) => section.id === second.section.id)!.issue!,
    /already has a screw plan/,
  );
  for (const row of [third, fourth])
    assert.match(
      next.rows.find(({ section }) => section.id === row.section.id)!.issue!,
      /connection record/,
    );
  assert.throws(
    () => applyFastenerRepeat(edited, original, [first.section.id], false),
    /changed/,
  );
  assert.ok(
    greenhouseRoofAttachments(edited, [])[0].joints.some(
      ({ pieceIds }) =>
        pieceIds.includes(head.id) && pieceIds.includes(receiver.id),
    ),
  );
});
