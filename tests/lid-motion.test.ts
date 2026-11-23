import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, type Project, type V3 } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { cutPiece, bom, validate, guideMarkdown } from "../src/engine";
import { endCutPlane } from "../src/cutProfiles";
import { composeRotation, rotate } from "../src/spatial";
import { transformSection, setSectionLidOpen } from "../src/sections";
import { lidPreview, reviewLidTravel } from "../src/lidMotion";
import { LID_OPEN_ANGLE_DEGREES } from "../src/motionConstants";
import { pieceOverlap } from "../src/solidCollision";
import { measuredHingeFixture } from "./fixtures/measuredHinge";
import { selectHingeMotion } from "../src/hinges";
import { saveSeatLidTest } from "../src/seatLidMotions";
import { motionReviewTravel, runMotionTest, saveMotionPlan } from "../src/mechanismMotion";

function seating() {
  return applyIdeaPlan(blank("Lid motion"), localIdeaPlan({
    prompt: "A storage banquette 6 feet wide, 24 inches deep, 18 inches seat height, three sections with opening lids and no back",
  }));
}
function obstruction(project: Project) {
  const section = project.sections[0];
  // A small obstacle on the front-edge arc at 38 degrees. Both endpoints miss.
  const at = lidPreview(project, section.id, 38).piece;
  const local: V3 = [0, 0, at.size[2] / 2 - 1];
  const point = rotate(local, at.rotation).map((v, i) => v + at.position[i]) as V3;
  return part("Motion obstacle", "stud", [2, 2, 2], point, project.steps[0].id, "Obstacles");
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("a mid-travel obstruction is found while both endpoint lid poses remain separated", () => {
  const p = seating(), section = p.sections[0];
  const blocked = projectSchema.parse({ ...p, pieces: [...p.pieces, obstruction(p)] });
  const before = JSON.stringify(blocked);
  const review = reviewLidTravel(blocked, section.id);
  const collision = review.collisions.find((c) => c.pieceId === blocked.pieces.at(-1)!.id)!;
  assert.ok(collision);
  assert.equal(collision.kind, "solid");
  assert.ok(collision.firstAngle > 0 && collision.firstAngle < 75);
  assert.ok(collision.firstAngle <= collision.inspectAngle);
  for (const angle of [0, LID_OPEN_ANGLE_DEGREES]) {
    const preview = lidPreview(blocked, section.id, angle);
    assert.equal(pieceOverlap(preview.piece, blocked.pieces.at(-1)!), false);
  }
  for (const start of [0, LID_OPEN_ANGLE_DEGREES]) {
    const end = LID_OPEN_ANGLE_DEGREES - start;
    const stop = review.playbackLimit(start, end);
    assert.ok(stop.travel > 0 && stop.travel < LID_OPEN_ANGLE_DEGREES);
    assert.deepEqual(review.preview(stop.travel).interferenceIds, []);
    const stopped = review.preview(stop.travel, stop.inspectAt);
    assert.ok(stopped.atLimit);
    assert.deepEqual(stopped.interferenceIds, [blocked.pieces.at(-1)!.id]);
    assert.equal(review.playbackLimit(stop.travel, start).travel, start);
  }
  assert.equal(JSON.stringify(blocked), before);
});

test("clear travel does not count its resting contact or a neighboring seat as penetration", () => {
  const p = seating();
  const review = reviewLidTravel(p, p.sections[1].id);
  assert.deepEqual(review.collisions, []);
  assert.equal(review.outsideZone, null);
  assert.deepEqual(review.unsupportedPieceIds, []);
  assert.equal(review.playbackLimit(0, LID_OPEN_ANGLE_DEGREES).travel, LID_OPEN_ANGLE_DEGREES);
  assert.equal(review.playbackLimit(LID_OPEN_ANGLE_DEGREES, 0).travel, 0);
});

test("lid travel catches a sub-degree corner obstruction missed by every whole-degree pose", () => {
  const p = seating();
  const id = p.sections[0].id;
  const { piece, pivot } = lidPreview(p, id, 38.5);
  const corner = rotate([0, piece.size[1] / 2, piece.size[2] / 2], piece.rotation)
    .map((v, i) => v + piece.position[i]) as V3;
  const radial = [0, corner[1] - pivot[1], corner[2] - pivot[2]] as V3;
  const size = Math.hypot(...radial);
  const position = corner.map((v, i) => v + (0.1 - 0.01005) * radial[i] / size) as V3;
  const obstacle = part("Grazing stop", "stud", [2, 0.2, 1], position, p.steps[0].id, "Obstacles", [Math.atan2(radial[2], radial[1]), 0, 0]);
  p.pieces.push(obstacle);
  assert.equal(pieceOverlap(lidPreview(p, id, 38.5).piece, obstacle), true);
  for (let angle = 0; angle <= LID_OPEN_ANGLE_DEGREES; angle++) {
    assert.equal(pieceOverlap(lidPreview(p, id, angle).piece, obstacle), false);
  }
  const review = reviewLidTravel(p, id);
  const limit = review.playbackLimit(0, LID_OPEN_ANGLE_DEGREES);
  assert.ok(limit.travel > 38 && limit.travel < 38.5);
  assert.deepEqual(review.preview(limit.travel, limit.inspectAt).interferenceIds, [obstacle.id]);
});

test("travel checks use the actual work-zone ceiling and rear wall rather than just the closed footprint", () => {
  const p = seating();
  p.workZone = { width: 96, depth: 24, height: 22 };
  const review = reviewLidTravel(p, p.sections[0].id);
  assert.ok(review.outsideZone);
  const limit = review.playbackLimit(0, LID_OPEN_ANGLE_DEGREES);
  assert.ok(limit.travel > 0 && limit.travel < LID_OPEN_ANGLE_DEGREES);
  assert.deepEqual(review.preview(limit.travel).outsideZoneFaces, []);
  assert.ok(review.preview(limit.travel, limit.inspectAt).outsideZoneFaces?.length);
  assert.ok(review.outsideZone.faces.includes("ceiling") || review.outsideZone.faces.includes("rear"));
  const roomy = reviewLidTravel({ ...p, workZone: { width: 120, depth: 120, height: 96 } }, p.sections[0].id);
  assert.equal(roomy.outsideZone, null);
});

test("renamed, trimmed and beveled lids retain physical geometry and exact saved data during scrubbing", () => {
  let p = seating();
  const sectionId = p.sections[0].id;
  p = transformSection(p, sectionId, [12, 4, -9], [0.2, 0.65, -0.1]);
  const lidId = p.pieces.find((x) => p.sections[0].pieceIds.includes(x.id) && x.designRole === "seat-lid")!.id;
  p = cutPiece(p, lidId, 18, 0);
  const actual = p.pieces.find((x) => x.id === lidId)!;
  actual.name = "A renamed custom top";
  actual.cutPlanes = [endCutPlane(actual.size, 2, true, 15, 0)];
  actual.position = actual.position.map((v, i) => v + [0.2, 0.1, -0.3][i]) as V3;
  actual.rotation = composeRotation([0.02, 0.01, 0], actual.rotation);
  const before = JSON.stringify(p), rows = bom(p);
  for (const angle of [0, 17, 38, 75]) {
    const value = lidPreview(p, sectionId, angle);
    assert.equal(value.piece.id, lidId);
    assert.equal(value.piece.name, actual.name);
    assert.deepEqual(value.piece.size, actual.size);
    assert.deepEqual(value.piece.cutPlanes, actual.cutPlanes);
    assert.deepEqual(value.piece.cutStock, actual.cutStock);
  }
  reviewLidTravel(p, sectionId);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(bom(p), rows);
  const opened = setSectionLidOpen(p, sectionId, true);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(opened)));
  const returned = lidPreview(reopened, sectionId, 0).piece;
  returned.position.forEach((v, i) => near(v, actual.position[i]));
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]) {
    const a = rotate(axis, returned.rotation), b = rotate(axis, actual.rotation);
    a.forEach((v, i) => near(v, b[i]));
  }
  const closed = setSectionLidOpen(reopened, sectionId, false);
  assert.deepEqual(closed.pieces.filter((x) => x.id !== lidId), p.pieces.filter((x) => x.id !== lidId));
});

test("role identity wins over misleading names; ambiguous or missing legacy lids reject without mutation", () => {
  const p = seating(), id = p.sections[0].id;
  const lid = p.pieces.find((x) => p.sections[0].pieceIds.includes(x.id) && x.designRole === "seat-lid")!;
  lid.name = "Top";
  assert.equal(lidPreview(p, id, 20).piece.id, lid.id);
  const legacy = structuredClone(p);
  const l = legacy.pieces.find((x) => x.id === lid.id)!;
  delete l.designRole;
  assert.throws(() => lidPreview(legacy, id, 20), /missing/);
  l.name = "Legacy seat lid";
  assert.equal(lidPreview(legacy, id, 20).piece.id, lid.id);
  const duplicate = { ...l, id: crypto.randomUUID() };
  legacy.pieces.push(duplicate);
  legacy.sections[0].pieceIds.push(duplicate.id);
  const before = JSON.stringify(legacy);
  assert.throws(() => lidPreview(legacy, id, 20), /More than one/);
  assert.equal(JSON.stringify(legacy), before);
});

test("invalid angles reject, and tube envelopes and unresolved geometry stay explicit", () => {
  const p = seating(), id = p.sections[0].id;
  for (const angle of [NaN, Infinity, -1, 75.01]) assert.throws(() => lidPreview(p, id, angle), /0 to 75/);
  const at = lidPreview(p, id, 38).piece;
  const tube = part("Tube envelope", "closet-rod-72", [1.3125, 12, 1.3125], at.position, p.steps[0].id, "Obstacles");
  const tiny = part("Tiny legacy stock", "stud", [0.00001, 0.00001, 0.00001], at.position, p.steps[0].id, "Obstacles");
  const review = reviewLidTravel({ ...p, pieces: [...p.pieces, tube, tiny] }, id);
  assert.ok(review.unsupportedPieceIds.includes(tiny.id));
  assert.equal(review.collisions.find((r) => r.pieceId === tube.id)?.kind, "envelope");
});

test("a removed portion of the real lid is clear while its uncut box would strike the obstacle", () => {
  const p = seating(), id = p.sections[0].id;
  const obstacle = obstruction(p);
  obstacle.position[0] += 6;
  p.pieces.push(obstacle);
  assert.ok(reviewLidTravel(p, id).collisions.some((r) => r.pieceId === obstacle.id));
  const lid = p.pieces.find((piece) => p.sections[0].pieceIds.includes(piece.id) && piece.designRole === "seat-lid")!;
  lid.cutPlanes = [{ normal: [1, 0, 0], constant: -2 }];
  const before = JSON.stringify(p);
  assert.ok(!reviewLidTravel(p, id).collisions.some((r) => r.pieceId === obstacle.id));
  assert.equal(JSON.stringify(p), before);
});

test("project validation catches rotated solid intersections and distinguishes sheet-envelope review", () => {
  const p = blank("Angled intersection");
  const a = part("First", "stud", [20, 2, 2], [0, 4, 0], p.steps[0].id, "Fixture", [0, 0.5, 0]);
  const b = part("Second", "stud", [20, 2, 2], [0, 4, 0], p.steps[0].id, "Fixture", [0, -0.5, 0]);
  p.pieces.push(a, b);
  assert.ok(validate(p).some((f) => f.id === "collision"));
  a.material = "roof";
  assert.ok(!validate(p).some((f) => f.id === "collision"));
  assert.ok(validate(p).some((f) => f.id === "envelope-collision"));
});

test("schema-valid tiny stock remains readable and reports incomplete collision geometry", () => {
  const p = blank("Tiny legacy stock");
  const tiny = part("Tiny saved stock", "stud", [0.00001, 0.00001, 0.00001], [0, 1, 0], p.steps[0].id, "Fixture");
  const accepted = projectSchema.parse({ ...p, pieces: [tiny] });
  const before = JSON.stringify(accepted);
  const findings = validate(accepted);
  assert.ok(findings.some((finding) => finding.id === `collision-geometry-${tiny.id}`));
  assert.equal(JSON.stringify(accepted), before);
});

test("linked storage lids replay from closed while keeping an intentionally saved open pose", () => {
  const initial = seating();
  const [one, two] = initial.sections;
  const actual = setSectionLidOpen(initial, one.id, true);
  const saved = saveSeatLidTest(actual, one.id, 75, two.id);
  const project = projectSchema.parse(JSON.parse(JSON.stringify(saved.project)));
  const motion = project.motionPlans!.find(({ id }) => id === saved.plan.id)!;
  const before = JSON.stringify(project);
  const result = runMotionTest(project, motion, motion.testScenarios![0].setup);
  assert(result.review, result.error);
  for (const angle of [0, 30, 75]) {
    const { pieces } = result.review.preview(angle);
    for (const seat of [one, two]) {
      const existing = lidPreview(initial, seat.id, angle).piece;
      const modeled = pieces.find(({ id }) => id === existing.id)!;
      modeled.position.forEach((n, axis) => near(n, existing.position[axis]));
      modeled.rotation.forEach((n, axis) => near(n, existing.rotation[axis]));
    }
  }
  assert.equal(result.review.playbackLimit(0, 75).travel, 75);
  assert.equal(result.review.playbackLimit(75, 0).travel, 0);
  assert.equal(JSON.stringify(project), before);
  assert.equal(project.sections[0].recipe?.lidOpen, true);
  assert.match(guideMarkdown(project), /Named clearance test · Both lids/);
});

test("a linked lid uses the selected measured hinge and requires review after it changes", () => {
  const fixture = measuredHingeFixture();
  const selected = selectHingeMotion(fixture, fixture.lidHingePlans[0].id, true);
  const { id } = selected.sections[0];
  const linked = saveSeatLidTest(selected, id, 75);
  const open = setSectionLidOpen(linked.project, id, true);
  const tested = runMotionTest(open, linked.plan);
  assert(tested.review, tested.error);
  const actual = tested.review.preview(39).pieces[0];
  const expected = lidPreview(selected, id, 39).piece;
  actual.position.forEach((n, axis) => near(n, expected.position[axis]));
  actual.rotation.forEach((n, axis) => near(n, expected.rotation[axis]));

  const changed = selectHingeMotion(linked.project, fixture.lidHingePlans[0].id, false);
  assert.match(runMotionTest(changed, linked.plan).error!, /hinge selection changed/);
  const reconnected = saveSeatLidTest(changed, id, 75);
  assert.equal(reconnected.plan.id, linked.plan.id);
  assert(runMotionTest(reconnected.project, reconnected.plan).review);
});

test("linked lid and side pull-out can clear at endpoints and collide while moving together", () => {
  const initial = seating();
  const section = initial.sections[0];
  const lid = lidPreview(initial, section.id, 0).piece;
  const tray = part("Side pull-out", "plywood", [14, 0.75, 9], [lid.position[0] - 22, 28, 2],
    initial.steps[0].id, "Pull-out");
  const linked = saveSeatLidTest({ ...initial, pieces: [...initial.pieces, tray] }, section.id, 75);
  const slide = saveMotionPlan(linked.project, { label: tray.name, memberIds: [tray.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 14 } });
  const setup = { linkedId: slide.plan.id, held: [] };
  const together = runMotionTest(slide.project, linked.plan, setup);
  assert(together.review, together.error);
  assert.deepEqual(together.review.preview(0).interferenceIds, []);
  assert.deepEqual(together.review.preview(75).interferenceIds, []);
  const limit = together.review.playbackLimit(0, 75);
  assert(limit.travel > 0 && limit.travel < 75 && limit.inspectAt !== undefined);
  assert(together.review.preview(limit.travel, limit.inspectAt).interferenceIds.includes(tray.id));
  const ordered = runMotionTest(slide.project, linked.plan, { ...setup, openingOrder: "selected-first" });
  assert(ordered.review, ordered.error);
  assert.equal(ordered.review.playbackLimit(0, motionReviewTravel(ordered.review)).inspectAt, undefined);
  assert.equal(ordered.review.playbackLimit(motionReviewTravel(ordered.review), 0).inspectAt, undefined);
});
