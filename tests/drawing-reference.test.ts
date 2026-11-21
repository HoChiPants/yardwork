import assert from "node:assert/strict";
import { test } from "node:test";
import {
  drawingAngleToXAxis, drawingReferenceBounds, drawingReferenceSchema, drawingReferenceSize,
  type DrawingReference,
} from "../src/drawingReference";
import { guideMarkdown } from "../src/engine";
import { blank, projectSchema } from "../src/model";

const sample: DrawingReference = {
  name: "Measured floor.pdf", page: 2, width: 1000, height: 500,
  image: "data:image/jpeg;base64,/9j/AA==",
  calibration: { points: [[0.1, 0.2], [0.5, 0.2]], distance: 96, angle: 90, center: [12, -24], opacity: 0.5, visible: true },
};

test("the drawing uses the pixel distance, then rotates and translates the calibrated footprint", () => {
  const drawing = drawingReferenceSchema.parse(sample);
  const calibration = drawing.calibration;
  assert.deepEqual(drawingReferenceSize(drawing, calibration), { width: 240, depth: 120 });
  const { min, max } = drawingReferenceBounds(drawing, calibration);
  assert.deepEqual(min.map(Math.round), [-48, 0, -144]);
  assert.deepEqual(max.map(Math.round), [72, 0, 96]);
  assert.equal(drawingAngleToXAxis(drawing, [[0.5, 0], [0.5, 1]]), -90);
  const diagonal = { ...calibration, points: [[0, 0], [0.4, 0.6]] as typeof calibration.points, distance: 120 };
  assert.deepEqual(drawingReferenceSize(drawing, diagonal), { width: 240, depth: 120 });
});

test("drawing imports enforce the calibrated size and permit only embedded normalized images", () => {
  assert.throws(() => drawingReferenceSchema.parse({ ...sample, image: "https://example.com/private.jpg" }), /Invalid string/);
  assert.throws(() => drawingReferenceSchema.parse({ ...sample, image: "data:image/svg+xml;base64,PHN2Zz4=" }), /Invalid string/);
  assert.throws(() => drawingReferenceSchema.parse({ ...sample, width: 50000 }), /2048/);
  assert.throws(() => drawingReferenceSchema.parse({
    ...sample, calibration: { ...sample.calibration, points: [[0, 0], [0.001, 0.001]] },
  }), /distinct points/);
  assert.throws(() => drawingReferenceSchema.parse({
    ...sample, calibration: { ...sample.calibration, center: [11999, 0] },
  }), /extends beyond the workspace/);
});

test("an editable project retains the underlay and its guide calibration without altering DXF or parts", () => {
  const old = projectSchema.parse({ ...blank(), schemaVersion: 101, planLines: [{ a: [0, 0, 0], b: [10, 0, 0] }] });
  assert.equal(old.drawingReference, undefined);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify({ ...old, drawingReference: sample })));
  assert.deepEqual(reopened.drawingReference, sample);
  assert.deepEqual(reopened.planLines, old.planLines);
  assert.deepEqual(reopened.pieces, old.pieces);
  assert.match(guideMarkdown(reopened), /## Drawing reference[\s\S]+Page 2 · 20 ft × 10 ft workspace footprint · A–B 8 ft/);
  assert.doesNotMatch(guideMarkdown(reopened), /base64/);
  assert.doesNotMatch(guideMarkdown({ ...reopened, drawingReference: { ...sample, calibration: { ...sample.calibration, visible: false } } }), /## Drawing reference/);
});
