import assert from "node:assert/strict";
import { test } from "node:test";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { applyCommand, blank, projectSchema } from "../src/model";
import { emptyWallTrace, reviewWallTrace, snapWallTracePoint, type WallTrace } from "../src/wallTrace";
import { pieceOverlap } from "../src/solidCollision";

const trace = (settings: Partial<WallTrace> = {}): WallTrace => ({
  ...emptyWallTrace(), a: [0, 0], b: [96, 0], ...settings,
});

test("trace picking snaps to the exact DXF endpoint, line projection or inch grid", () => {
  const project = blank("reference");
  project.planLines = [{ a: [0.3, 0, 4.2], b: [120.43, 0, 4.2] }];
  assert.deepEqual(snapWallTracePoint([1, 4], project.planLines, true), [0.3, 4.2]);
  assert.deepEqual(snapWallTracePoint([47.25, 3.5], project.planLines, true), [47.25, 4.2]);
  assert.deepEqual(snapWallTracePoint([47.25, 8.5], project.planLines, true), [47, 9]);
  assert.deepEqual(snapWallTracePoint([47.25, 3.5], project.planLines, false), [47.25, 3.5]);
});

test("a trace honors trim, faces, rotation, elevation and 2 × 6 stock across distinct panels", () => {
  const project = blank("side room");
  project.workZone = { width: 40, height: 120, depth: 120 };
  const review = reviewWallTrace(project, trace({
    a: [10, 20], b: [10, 265], startTrim: 2, endTrim: 3,
    stock: "hd-spf-2x6-12", alignment: "left", height: 97, elevation: 4,
  }));
  assert.equal(review.runLength, 240);
  assert.deepEqual(review.lengths, [144, 96]);
  assert.deepEqual(review.candidate.sections.map(({ origin }) => origin), [[7.25, 4, 94], [7.25, 4, 214]]);
  assert.deepEqual(review.footprints[0][0], [10, 4, 22]);
  assert.deepEqual(review.footprints[1][2], [4.5, 4, 262]);
  assert.ok(review.added.every(({ material, size }) => material === "hd-spf-2x6-12" && size.includes(5.5)));
  assert.equal(review.outsideZone, true);
  assert.match(review.candidate.steps.at(-1)!.notes, /preceding panel.*paired end studs/);
  assert.equal(review.row?.oversize, 0);
  assert.equal(review.obstructions.length, 0);
  assert.equal(project.sections.length, 0);
  for (const [index, first] of review.added.entries())
    for (const second of review.added.slice(index + 1)) assert.equal(pieceOverlap(first, second), false);
});

test("solid intersections block a trace while a trimmed butt joint or stack on top fits", () => {
  const initial = reviewWallTrace(blank("corners"), trace()).candidate;
  const cross = trace({ a: [48, 0], b: [48, 80] });
  assert.ok(reviewWallTrace(initial, cross).obstructions.some(({ name }) => /plate/.test(name)));
  assert.equal(reviewWallTrace(initial, { ...cross, startTrim: 1.75 }).obstructions.length, 0);
  assert.equal(reviewWallTrace(initial, { ...trace(), elevation: 96 }).obstructions.length, 0);
});

test("a thin tail becomes a constructible panel without overlaps or excessive stud spacing", () => {
  const project = blank("long wall");
  const split = reviewWallTrace(project, trace({ b: [145, 0], stock: "hd-spf-2x4-12" }));
  assert.deepEqual(split.lengths, [121, 24]);
  const narrow = reviewWallTrace(project, trace({ b: [34.1, 0] }));
  const studs = narrow.added.filter(({ designRole }) => designRole?.startsWith("wall-stud"));
  assert.ok(studs.length >= 3);
  for (const [index, first] of studs.entries()) {
    const next = studs[index + 1];
    if (next) {
      const spacing = next.position[0] - first.position[0];
      assert.ok(spacing >= 1.5 && spacing <= 16, `${first.name} to ${next.name} is ${spacing}`);
    }
  }
  assert.throws(() => reviewWallTrace(project, trace({ height: 101 })), /Choose longer lumber/);
  assert.throws(() => reviewWallTrace(project, trace({ startTrim: 84 })), /at least 24 in/);
});

test("an exact stock offcut becomes a retained stud, and an unchanged wall revision keeps it", () => {
  const blankProject = blank("use a scrap");
  const project = addMeasuredOffcut(blankProject, blankProject.steps[0].id, "hd-kdht-2x4-8", [86, 3.5, 1.5], "spare 2 × 4");
  const review = reviewWallTrace(project, trace({ height: 84, b: [120, 0] }));
  const withoutReuse = reviewWallTrace(project, trace({ height: 84, b: [120, 0], reuse: false }));
  assert.equal(review.reuse?.assignments.length, 1);
  assert.equal(review.row!.purchasedStockUnits, withoutReuse.row!.purchasedStockUnits - 1);
  assert.ok(review.reuse?.remnants.some(({ size }) => size[2] > 4));
  const assigned = review.reuse!.assignments[0];
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(review.candidate)));
  const section = reopened.sections.find(({ pieceIds }) => pieceIds.includes(assigned.partId))!;
  const { wallStock, ...dimensionRevision } = section.generator!;
  const revised = applyCommand(reopened, dimensionRevision, section.id);
  assert.ok(revised.pieces.find(({ id }) => id === assigned.partId)?.cutStock);
  assert.deepEqual(revised.sections.find(({ id }) => id === section.id)?.generator?.wallStock, wallStock);
  assert.deepEqual(projectSchema.parse(revised).sections[0].origin, reopened.sections[0].origin);
});
