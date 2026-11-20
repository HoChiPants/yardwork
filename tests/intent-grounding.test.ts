/** Real qualification prompts, with deliberately wrong model facts to verify deterministic raw-text grounding. */
import test from "node:test";
import assert from "node:assert/strict";
import { intentToPlan } from "../server/intentPlanner";
import { blank } from "../src/model";
import { previewIdeaPlan } from "../src/planning";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);

test("real storage qualification prompt binds total72-inch width despite incidental Each and wrong AI width", () => {
  const prompt =
    "Build a straight three-section storage banquette, total width 6 feet, depth 24 inches and finished seat height 18 inches. Each section must be a separate bench with enclosed storage and an opening seat lid. No back: the existing wall is the back. Show all lids closed.";
  const plan = intentToPlan(
    { prompt },
    {
      family: "banquette",
      operation: "create",
      width: 60,
      depth: 24,
      height: 18,
      sectionCount: 3,
      storage: true,
      openingLid: true,
      backHeight: 0,
    },
  );
  assert.deepEqual(
    plan.modules.map((m) => m.width),
    [24, 24, 24],
  );
  assert.deepEqual(
    plan.modules.map((m) => m.position[0]),
    [-24, 0, 24],
  );
  const p = previewIdeaPlan(blank(), plan);
  near(p.max[0] - p.min[0], 72);
  assert.ok(
    plan.modules.every(
      (m) => m.storage && m.openingLid && !m.lidOpen && m.backHeight === 0,
    ),
  );
  assert.equal(p.project.pieces.length, 42);
});
test("real greenhouse qualification prompt grounds outside dimensions before conflicting model suffixes", () => {
  const prompt =
    "Plan a greenhouse 7 feet outside width, 8 feet outside depth and 7.5 feet outside eave height. Roof rise is 30 inches above the eave. Use the greenhouse whole-structure generator; do not substitute furniture. Exact glazing and attachment products are not selected.";
  const plan = intentToPlan(
    { prompt },
    {
      family: "greenhouse",
      operation: "create",
      width: 72,
      depth: 84,
      height: 75,
      roofRise: 30,
    },
  );
  const params = plan.structures[0].parameters as {
    width: number;
    depth: number;
    eaveHeight: number;
    roofRise: number;
  };
  assert.deepEqual(
    [params.width, params.depth, params.eaveHeight, params.roofRise],
    [84, 96, 90, 30],
  );
  const p = previewIdeaPlan(blank(), plan);
  near(p.max[0] - p.min[0], 84);
  near(p.max[2] - p.min[2], 96);
  near(p.max[1], 120);
});
test("real shelving qualification prompt chooses the positive shelving family before a negative bench mention", () => {
  const prompt =
    "Plan one freestanding shelving unit, 36 inches wide, 16 inches deep and 72 inches tall, with three shelves. Use a shelf module and ordinary stud lumber plus plywood. No bench or seating.";
  const plan = intentToPlan(
    { prompt },
    {
      family: "shelves",
      operation: "create",
      width: 36,
      depth: 16,
      height: 72,
      shelfCount: 3,
    },
  );
  assert.equal(plan.modules.length, 1);
  assert.equal(plan.modules[0].kind, "shelf");
  assert.equal(plan.modules[0].levels, 3);
  assert.deepEqual(
    [plan.modules[0].width, plan.modules[0].depth, plan.modules[0].height],
    [36, 16, 72],
  );
});
