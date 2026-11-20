import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
  attachmentReviews,
} from "../src/attachments";
import { emptyShelfPinMeasurements } from "../src/attachmentSchema";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { guideMarkdown } from "../src/engine";
import { attachmentGuideText } from "../src/attachmentGuide";
import { attachmentScheduleCsv } from "../src/attachmentCsv";
import { rotate } from "../src/spatial";
import type { V3 } from "../src/model";
function planned() {
  let p = createBuildStudy(
    "shelves",
    { ...defaultBuildStudyParameters("shelves"), width: 36 },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  const entry = shelfSupportEntries(p)[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.entryId, {
      shelfRoles: entry.shelves.map((s) => s.role),
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 3,
        datumHeight: null,
      },
      measurements: {
        ...emptyShelfPinMeasurements(),
        bearingOffset: 0.052,
        basis: "User caliper",
        measuredAt: "2026-11-17T02:00:00Z",
      },
    }),
  );
  return generateBuildGuide(p);
}
test("saved project notes remain verbatim and visibly separate from later support records", () => {
  const p = planned();
  p.notes =
    "Original idea: no shelf-pin plan yet.\n\nKeep my pencil note: measure twice.";
  const snapshot = JSON.stringify(p),
    markdown = guideMarkdown(p),
    heading = markdown.indexOf("## Saved project notes"),
    note = markdown.indexOf(p.notes),
    sequence = markdown.indexOf("## 1.");
  assert.ok(heading >= 0, "Historical notes need an explicit saved-notes context");
  assert.ok(heading < note && note < sequence);
  assert.match(markdown, /May include earlier assumptions/);
  assert.equal(markdown.split(p.notes).length, 2);
  assert.match(markdown, /included planned pins: 12/i);
  assert.equal(JSON.stringify(p), snapshot);
  assert.ok(guideIsCurrent(p));
});
test("paper guide keeps exact .703 source thickness and labeled hole edge measurements, without machine identifiers", () => {
  const p = planned(),
    snapshot = JSON.stringify(p),
    text = attachmentGuideText(p),
    md = guideMarkdown(p);
  assert.match(md, /P001.*0\.703 in/);
  assert.match(text, /P001/);
  assert.match(text, /left \/ front.*2 in.*Candidate \/ pending/);
  assert.match(text, /left \/ rear.*3 in.*Candidate \/ pending/);
  const point = attachmentReviews(p)[0].points[0],
    mount = p.pieces.find((x) => x.id === point.point.mount.pieceId)!;
  const height = Number(
    (point.holeCenterLocal![1] + mount.size[1] / 2).toFixed(6),
  );
  assert.ok(text.includes(`${height} in`));
  for (const ref of [p.attachmentPlans[0].id, point.point.id, mount.id])
    assert.ok(!text.includes(ref));
  assert.ok(attachmentScheduleCsv(p).includes(mount.id));
  assert.equal(JSON.stringify(p), snapshot);
});
test("edge-based hole dimensions remain unchanged under a complete full-Euler rigid motion", () => {
  const p = planned(),
    original = attachmentGuideText(p),
    rot: V3 = [12, 26, 8],
    delta: V3 = [27, 13, -19];
  for (const piece of p.pieces) {
    piece.position = rotate(piece.position, rot).map(
      (v, i) => v + delta[i],
    ) as V3;
    piece.rotation = [...rot];
  }
  const before = original
    .split("\n")
    .filter(
      (line) => line.startsWith("- left /") || line.startsWith("- right /"),
    );
  const after = attachmentGuideText(p)
    .split("\n")
    .filter(
      (line) => line.startsWith("- left /") || line.startsWith("- right /"),
    );
  assert.equal(attachmentReviews(p)[0].state, "needs-measurements");
  assert.deepEqual(after, before);
});
test("stale schedules retain labels but suppress former edge drill dimensions", () => {
  const p = planned(),
    mountId = p.attachmentPlans[0].points[0].mount.pieceId;
  p.pieces.find((x) => x.id === mountId)!.size[1] -= 1;
  const text = attachmentGuideText(p),
    rows = text
      .split("\n")
      .filter(
        (line) => line.startsWith("- left /") || line.startsWith("- right /"),
      );
  assert.equal(attachmentReviews(p)[0].state, "stale");
  assert.ok(
    rows.every((line) =>
      line.includes("PENDING · PENDING · PENDING — plan excluded"),
    ),
  );
});

test("profiled mounts retain an explicit original-blank datum instead of claiming a removed edge", () => {
  const p = planned(),
    mountId = p.attachmentPlans[0].points[0].mount.pieceId,
    mount = p.pieces.find((x) => x.id === mountId)!;
  mount.cutPlanes = [{ normal: [0, -1, 0], constant: mount.size[1] / 2 - 6 }];
  const old = p.attachmentPlans[0],
    fresh = makeShelfPinPlan(p, old.entryId, {
      id: old.id,
      name: old.name,
      shelfRoles: old.shelfRoles,
      layout: old.layout,
      measurements: old.measurements,
    });
  const refreshed = saveShelfPinPlan(p, fresh),
    text = attachmentGuideText(refreshed);
  assert.equal(attachmentReviews(refreshed)[0].state, "needs-measurements");
  assert.match(text, /rectangular blank bottom datum \(local −Y\)/);
  assert.match(text, /transfer these datums before profile cuts/);
});
