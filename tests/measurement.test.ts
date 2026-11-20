import test from "node:test";
import assert from "node:assert/strict";
import { measureBetween, formatMeasurement } from "../src/measurement";

test("measurement records exact inch distance and signed axis differences", () => {
  assert.deepEqual(measureBetween([10, 20, 30], [13, 24, 42]), {
    distance: 13,
    delta: [3, 4, 12],
  });
  assert.deepEqual(measureBetween([13, 24, 42], [10, 20, 30]), {
    distance: 13,
    delta: [-3, -4, -12],
  });
});
test("one-axis and coincident endpoints do not require a diagonal", () => {
  assert.deepEqual(measureBetween([0, 4, 0], [0, 52, 0]), {
    distance: 48,
    delta: [0, 48, 0],
  });
  assert.deepEqual(measureBetween([-4, 2, 9], [-4, 2, 9]), {
    distance: 0,
    delta: [0, 0, 0],
  });
});
test("display formats small, negative, and carried foot measurements consistently", () => {
  assert.equal(formatMeasurement(0), "0″");
  assert.equal(formatMeasurement(0.125), "0.13″");
  assert.equal(formatMeasurement(48), "4′");
  assert.equal(formatMeasurement(25.5), "2′ 1.5″");
  assert.equal(formatMeasurement(11.999999), "1′");
  assert.equal(formatMeasurement(-25.5), "−2′ 1.5″");
  assert.equal(formatMeasurement(-0.000001), "0″");
  assert.equal(formatMeasurement(Infinity), "—");
});
test("invalid endpoint coordinates are rejected rather than producing a false result", () => {
  assert.throws(() => measureBetween([NaN, 0, 0], [0, 0, 0]), /finite/);
  assert.throws(() => measureBetween([0, 0, 0], [0, Infinity, 0]), /finite/);
});
