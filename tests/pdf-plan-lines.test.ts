import assert from "node:assert/strict";
import { test } from "node:test";
import { drawingLineLimit, drawingPlanLines, drawingReferenceSchema, type DrawingReference } from "../src/drawingReference";
import { extractPdfPlanLines } from "../src/pdfPlanLines";

const ops = Object.fromEntries("save restore transform constructPath clip eoClip endPath stroke closeStroke fill eoFill fillStroke eoFillStroke closeFillStroke closeEOFillStroke setLineWidth setDash setGState paintFormXObjectBegin paintFormXObjectEnd beginGroup endGroup beginMarkedContent beginMarkedContentProps endMarkedContent"
  .split(" ").map((name, index) => [name, index + 1]));
const previewTransform = [1, 0, 0, 1, 0, 0];
const path = (name: string, commands: number[]) => [ops[name], [new Float32Array(commands)], [0, 0, 1, 1]];
const box = (x: number, y: number, u: number, v: number) => [0, x, y, 1, u, y, 1, u, v, 1, x, v, 4];
const line = (x: number, y: number, u: number, v: number) => [0, x, y, 1, u, v];

function painted(lines: [number, number, number, number][]) {
  const width = 200, height = 120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, u, v] of lines) {
    const length = Math.ceil(Math.hypot(u - x, v - y));
    for (let i = 0; i <= length; i++) {
      const col = Math.floor(x + (u - x) * i / length), row = Math.floor(y + (v - y) * i / length);
      if (col < 0 || row < 0 || col >= width || row >= height) continue;
      const first = (row * width + col) * 4;
      data.fill(0, first, first + 3);
    }
  }
  return { width, height, data };
}

function read(operations: [string, unknown][], image: ReturnType<typeof painted>, visible = (_: unknown) => true) {
  return extractPdfPlanLines({ fnArray: operations.map(([name]) => ops[name]), argsArray: operations.map(([, data]) => data) },
    ops, previewTransform, image, visible);
}

test("PDF path replay honors nested form transforms, clipping and saved state", () => {
  const result = read([
    ["save", null], ["transform", [1, 0, 0, 1, 20, 10]],
    ["paintFormXObjectBegin", [[1, 0, 0, 1, 10, 4], [0, 0, 90, 90]]],
    ["clip", null], ["constructPath", path("endPath", box(5, 4, 65, 50))],
    ["constructPath", path("stroke", line(-10, 25, 110, 25))],
    ["paintFormXObjectEnd", null], ["restore", null],
    ["constructPath", path("stroke", line(125, 72, 165, 72))],
  ], painted([[20, 39, 140, 39], [125, 72, 165, 72]]));
  assert.deepEqual(result, [[0.175, 0.325, 0.475, 0.325], [0.625, 0.6, 0.825, 0.6]]);
});

test("dash, opacity, hidden layers and erased strokes cannot create room edges", () => {
  const result = read([
    ["beginMarkedContentProps", ["OC", "hidden"]], ["constructPath", path("stroke", line(20, 10, 80, 10))], ["endMarkedContent", null],
    ["save", null], ["setDash", [[10, 5], 0]], ["constructPath", path("stroke", line(20, 30, 80, 30))], ["restore", null],
    ["save", null], ["setGState", [[['CA', 0]]]], ["constructPath", path("stroke", line(20, 50, 80, 50))], ["restore", null],
    ["constructPath", path("stroke", line(20, 70, 80, 70))],
    ["constructPath", path("stroke", [0, 20, 90, 2, 30, 80, 70, 80, 80, 90, 1, 110, 90])],
  ], painted([[20, 10, 80, 10], [20, 30, 80, 30], [20, 50, 80, 50], [20, 90, 110, 90]]), (layer) => layer !== "hidden");
  assert.deepEqual(result, [[0.4, 0.75, 0.55, 0.75]]);
});

test("filled shape boundaries can contribute lines but a curved clip preserves manual tracing for its region", () => {
  const result = read([
    ["constructPath", path("fill", box(20, 20, 90, 60))],
    ["save", null], ["eoClip", null], ["constructPath", path("endPath", [0, 10, 95, 3, 30, 120, 100, 95, 4])],
    ["constructPath", path("stroke", line(20, 80, 80, 80))], ["restore", null],
    ["constructPath", path("stroke", line(20, 100, 80, 100))],
  ], painted([[20, 20, 90, 20], [90, 20, 90, 60], [90, 60, 20, 60], [20, 60, 20, 20], [20, 80, 80, 80], [20, 100, 80, 100]]));
  assert.deepEqual(result, [[0.1, 0.16666667, 0.45, 0.16666667], [0.45, 0.16666667, 0.45, 0.5],
    [0.1, 0.5, 0.45, 0.5], [0.1, 0.16666667, 0.1, 0.5], [0.1, 0.83333333, 0.4, 0.83333333]]);
});

test("retained PDF linework applies the same measured scale, center and angle as the sheet", () => {
  const reference: DrawingReference = { name: "plan.pdf", page: 1, width: 400, height: 200,
    image: "data:image/jpeg;base64,/9j/AAAA", pdfLines: [[0.1, 0.2, 0.9, 0.2]],
    calibration: { points: [[0.1, 0.5], [0.9, 0.5]], distance: 160, center: [24, -12], angle: 90, opacity: 0.6, visible: true },
  };
  const parsed = drawingReferenceSchema.parse(JSON.parse(JSON.stringify(reference)));
  const [mapped] = drawingPlanLines(parsed);
  const rounded = (point: number[]) => point.map((value) => Number(value.toFixed(4)));
  assert.deepEqual(rounded(mapped.a), [54, 0.1, -92]);
  assert.deepEqual(rounded(mapped.b), [54, 0.1, 68]);
  assert.deepEqual(drawingPlanLines({ ...parsed, pdfLines: undefined }), []);
  assert.equal(drawingReferenceSchema.safeParse({ ...parsed, page: undefined }).success, false);
});

test("short visible marks on a dense sheet leave room for longer wall lines drawn later", () => {
  const marks: [string, unknown][] = Array.from({ length: drawingLineLimit * 2 + 100 }, (_, index) => {
    const x = 20 + index * 0.012;
    return ["constructPath", path("stroke", line(x, 10, x + 4, 10))];
  });
  const result = read([...marks,
    ["constructPath", path("stroke", box(20, 40, 170, 90))],
  ], painted([[20, 10, 100, 10], [20, 40, 170, 40], [170, 40, 170, 90], [170, 90, 20, 90], [20, 90, 20, 40]]));
  assert.equal(result.length, drawingLineLimit);
  for (const edge of [[0.1, 0.33333333, 0.85, 0.33333333], [0.1, 0.75, 0.85, 0.75],
    [0.1, 0.33333333, 0.1, 0.75], [0.85, 0.33333333, 0.85, 0.75]])
    assert.ok(result.some((line) => line.every((value, index) => value === edge[index])));
});
