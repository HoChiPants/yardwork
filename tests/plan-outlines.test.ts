import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { guideMarkdown, parseDxf } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, projectSchema, type Project, type V3 } from "../src/model";
import { detectPlanOutlines, outlineAtPoint } from "../src/planOutlines";
import { duplicateSection } from "../src/sections";
import { pieceOverlap } from "../src/solidCollision";
import { emptyWallTrace, reviewWallOutline, reviewWallTrace } from "../src/wallTrace";

type Point = [number, number];
const line = (a: Point, b: Point): Project["planLines"][number] => ({ a: [a[0], 0, a[1]], b: [b[0], 0, b[1]] });
const closed = (points: Point[]): Project["planLines"] => points.map((point, index) => line(point, points[(index + 1) % points.length]));
const rectangle: Point[] = [[0, 0], [120, 0], [120, 84], [0, 84]];
const polyline = (flag: number, extra: (string | number)[] = []) => [
  0, "LWPOLYLINE", 90, 4, 70, flag, ...rectangle.flatMap(([x, z], index) => [10, x, 20, z, ...(index === 0 ? extra : [])]),
];
const dxf = (...entities: (number | string)[][]) => [...entities.flat(), ""].join("\n");

test("straight lightweight polylines preserve open and closed flags, model space and scaling", () => {
  const file = dxf([0, "SECTION", 2, "BLOCKS"], polyline(1), [0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"],
    polyline(129), polyline(0, [410, "Layout1"]), polyline(1, [42, 0.15]), polyline(1, [230, -1]), [0, "ENDSEC", 0, "EOF"]);
  const lines = parseDxf(file, 2);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0], { a: [0, 0.1, 0], b: [240, 0.1, 0] });
  assert.deepEqual(lines.at(-1)?.b, lines[0].a);
  assert.equal(detectPlanOutlines(lines).length, 1);
  assert.equal(detectPlanOutlines(parseDxf(dxf(polyline(0)), 1)).length, 0);
  assert.throws(() => parseDxf(dxf(polyline(1, [42, 0.15])), 1), /No supported model-space/);
});

test("outline detection separates adjoining rooms, ignores stray lines and retains exact dimensions", () => {
  const lines = [...closed([[0, 0], [240, 0], [240, 84], [0, 84]]),
    line([96, 0], [96, 84]), line([48, 0], [48, 22]), line([140, 18], [140, 42]),
    line([16, 0], [65, 0]), line([240, 0], [0, 0])];
  const outlines = detectPlanOutlines(lines);
  assert.deepEqual(outlines.map(({ area, points }) => [area, points.length]), [[12096, 4], [8064, 4]]);
  assert.deepEqual(outlines.map(({ center }) => center), [[168, 42], [48, 42]]);
  assert.equal(outlineAtPoint(outlines, [24, 60]), 1);
  assert.equal(outlineAtPoint(outlines, [120, 60]), 0);
  assert.equal(outlineAtPoint(outlines, [24, -1]), -1);
});

test("open, skewed and undersized contours do not become walls", () => {
  assert.deepEqual(detectPlanOutlines(closed(rectangle).slice(0, -1)), []);
  assert.deepEqual(detectPlanOutlines(closed([[0, 0], [120, 0], [122, 84], [0, 84]])), []);
  assert.deepEqual(detectPlanOutlines(closed([[0, 0], [24, 0], [24, 12], [0, 12]])), []);
  const gap = closed(rectangle);
  gap[0].a[0] += 0.25;
  assert.deepEqual(detectPlanOutlines(gap), []);
});

test("a rotated concave room builds square-cornered, collision-free separate wall runs", () => {
  const heading = Math.PI / 7;
  const points: Point[] = [[0, 0], [144, 0], [144, 72], [96, 72], [96, 132], [0, 132]];
  const transformed: Point[] = points.map(([x, z]) => [120 + x * Math.cos(heading) - z * Math.sin(heading), 28 + x * Math.sin(heading) + z * Math.cos(heading)]);
  const [outline] = detectPlanOutlines(closed(transformed));
  assert.equal(outline.points.length, 6);
  assert.ok(Math.abs(outline.area - 16128) < 1e-7);
  const preview = reviewWallOutline(blank("L-shaped room"), { ...emptyWallTrace(), stock: "hd-spf-2x4-12", elevation: 4 }, outline, "center");
  assert.deepEqual(preview.runLengths.map((length) => Number(length.toFixed(2))), [147.5, 68.5, 51.5, 56.5, 99.5, 128.5]);
  assert.equal(preview.lengths.length, 7);
  assert.equal(preview.hasInternalOverlap, false);
  assert.equal(preview.obstructions.length, 0);
  assert.equal(preview.row?.oversize, 0);
  for (const [index, first] of preview.added.entries())
    assert.ok(preview.added.slice(index + 1).every((second) => !pieceOverlap(first, second)));
  assert.match(preview.candidate.steps[1].notes, /Room wall 1 of 6.+Walls 6 and 2 butt/);
  assert.match(preview.candidate.steps[3].notes, /Room wall 3 of 6/);
  assert.match(guideMarkdown(preview.candidate), /confirm fastening and finish backing/);
});

test("inside and outside face offsets preserve their respective dimensions", () => {
  const [outline] = detectPlanOutlines(closed(rectangle));
  const trace = { ...emptyWallTrace(), stock: "hd-spf-2x6-12" as const };
  for (const [face, extents] of [
    ["inside", [-5.5, -5.5, 125.5, 89.5]],
    ["outside", [0, 0, 120, 84]],
  ] as const) {
    const preview = reviewWallOutline(blank("face check"), trace, outline, face);
    const footprint = preview.footprints.flat() as V3[];
    const actual = [Math.min(...footprint.map(([x]) => x)), Math.min(...footprint.map(([, , z]) => z)),
      Math.max(...footprint.map(([x]) => x)), Math.max(...footprint.map(([, , z]) => z))];
    assert.deepEqual(actual.map((value) => Number(value.toFixed(4))), extents);
    assert.equal(preview.hasInternalOverlap, false);
  }
});

test("preview blocks existing obstructions and allocates a saved offcut at most once across the room", () => {
  const [outline] = detectPlanOutlines(closed(rectangle));
  const project = blank("room stock");
  const trace = { ...emptyWallTrace(), height: 84, stock: "hd-spf-2x4-12" as const };
  const onHand = addMeasuredOffcut(project, project.steps[0].id, trace.stock, [90, 3.5, 1.5], "room stud offcut");
  const result = reviewWallOutline(onHand, trace, outline, "center");
  assert.equal(result.reuse?.assignments.length, 1);
  assert.ok(result.reuse?.remnants.length);
  assert.equal(projectSchema.parse(result.candidate).sections.length, 4);
  assert.equal(onHand.sections.length, 0);
  const obstructed = reviewWallTrace(onHand, { ...trace, a: rectangle[0], b: rectangle[1], reuse: false }).candidate;
  const preview = reviewWallOutline(obstructed, trace, outline, "center");
  assert.ok(preview.obstructions.length > 0);
  assert.equal(preview.reuse, null);
});

test("walls crossing a narrow interior throat are flagged even when every run fits the stock", () => {
  const [outline] = detectPlanOutlines(closed([
    [0, 0], [45, 0], [45, 79], [93, 79], [93, 0], [168, 0],
    [168, 168], [120, 168], [120, 81], [72, 81], [72, 168], [0, 168],
  ]));
  const review = reviewWallOutline(blank("tight throat"), emptyWallTrace(), outline, "center");
  assert.equal(review.hasInternalOverlap, true);
  assert.equal(review.obstructions.length, 0);
  assert.equal(review.row?.oversize, 0);
});

test("the saved room guide keeps both through-walls before adjoining panels and flags manual reordering", () => {
  const [outline] = detectPlanOutlines(closed(rectangle));
  const trace = { ...emptyWallTrace(), stock: "hd-spf-2x4-10" as const };
  const proposed = reviewWallOutline(blank("guide order"), trace, outline, "outside").candidate;
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(proposed)));
  const guide = generateBuildGuide(reopened);
  const wallOf = (sectionId: string) => guide.sections.find(({ id }) => id === sectionId)?.roomFraming?.wall;
  const stages = guide.steps.filter(({ generated }) => generated?.kind === "assembly-stage");
  assert.deepEqual(stages.map(({ generated }) => wallOf(generated!.planId)), [1, 3, 2, 4]);
  assert.deepEqual(reviewAssemblyOrder(guide), []);
  const early = stages[2];
  const moved = { ...guide, steps: [early, ...guide.steps.filter(({ id }) => id !== early.id)] };
  const [finding] = reviewAssemblyOrder(moved);
  assert.equal(finding.current.step.id, early.id);
  assert.deepEqual(finding.prerequisites.map(({ step }) => wallOf(step.generated!.planId)), [1, 3]);
  const copied = duplicateSection(reopened, reopened.sections[0].id);
  assert.equal(copied.project.sections.find(({ id }) => id === copied.sectionId)?.roomFraming, undefined);
  assert.equal(projectSchema.parse(copied.project).sections.length, 5);
});
