import assert from "node:assert/strict";
import test from "node:test";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import { previewFastenerContactRow } from "../src/fastenerContactRow";
import {
  addMissingFastenerPacks,
  fastenerPurchaseSummary,
} from "../src/fastenerPurchases";
import { fastenerReviews, saveFastenerPlan } from "../src/fastenings";
import { guideMarkdown } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { rotate } from "../src/spatial";

const options = { productId: "grk-cabinet-114069" as const };
const inputs = { count: 3, endInset: 2, beforeFloorPlacement: false };
function cabinet() {
  const project = blank("Cabinet joint");
  const make = (name: string, size: V3, position: V3) =>
    part(name, "plywood", size, position, project.steps[0].id, "Casework");
  const top = make("Shelf", [36, 0.75, 15], [0, 17.125, 0]);
  const bottom = make("Base", [36, 0.75, 15], [0, 0.375, 0]);
  const divider = make("Divider", [0.75, 16, 15], [0, 8.75, 0]);
  divider.stockLengthAxis = 1;
  project.pieces.push(top, bottom, divider);
  return { project, top, bottom, divider };
}

test("contact row transfers evenly spaced marks, uses explicit purchase quantities and preserves the plan in exports", () => {
  const { project, top, divider } = cabinet();
  const before = JSON.stringify(project);
  const preview = previewFastenerContactRow(
    project,
    top.id,
    divider.id,
    inputs,
    options,
  );
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(
    [preview.length, preview.width, preview.spacing],
    [15, 0.75, 5.5],
  );
  assert.deepEqual(
    preview.review.locations.map(({ entranceWorld }) => entranceWorld),
    [
      [0, 17.5, -5.5],
      [0, 17.5, 0],
      [0, 17.5, 5.5],
    ],
  );
  assert.deepEqual(
    preview.review.locations.map(
      ({ receiverEnterDepth }) => receiverEnterDepth,
    ),
    [0.75, 0.75, 0.75],
  );
  assert.equal(preview.review.state, "needs-measurements");
  assert.equal(preview.plan.measurements.surfaceToTipDepth, null);
  const saved = saveFastenerPlan(project, preview.plan);
  const purchase = fastenerPurchaseSummary(saved).products.find(
    ({ productId }) => productId === options.productId,
  );
  assert.equal(purchase?.plannedScrews, 3);
  assert.equal(purchase.requiredPacks, 1);
  assert.equal(saved.supplies.length, 0);
  const ordered = addMissingFastenerPacks(saved, options.productId);
  assert.match(homeDepotShoppingList(ordered).text, /#203556408/);
  assert.match(guideMarkdown(ordered), /Center spacing 5.5 in/);
  assert.match(fastenerScheduleCsv(ordered), /Contact row mark 3/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(ordered))).fastenerPlans,
    saved.fastenerPlans,
  );
  assert.throws(
    () => previewFastenerContactRow(saved, top.id, divider.id, inputs, options),
    /duplicate|coincident|overlap|another plan/i,
  );
});

test("a floor-side row requires explicit staged access and an intervening part blocks individual entries", () => {
  const { project, top, bottom, divider } = cabinet();
  assert.throws(
    () =>
      previewFastenerContactRow(
        project,
        bottom.id,
        divider.id,
        inputs,
        options,
      ),
    /modeled floor blocks access/,
  );
  const fromBelow = previewFastenerContactRow(
    project,
    bottom.id,
    divider.id,
    { ...inputs, beforeFloorPlacement: true },
    options,
  );
  assert.equal(fromBelow.floorAccess, true);
  assert.match(fromBelow.plan.notes, /before setting the assembly down/);
  assert.ok(
    fromBelow.review.locations.every(
      ({ entranceWorld, driveWorld }) =>
        entranceWorld?.[1] === 0 && driveWorld?.[1] === 1,
    ),
  );
  assert.throws(
    () =>
      previewFastenerContactRow(
        project,
        top.id,
        divider.id,
        { ...inputs, endInset: 7.5 },
        options,
      ),
    /too little room/,
  );
  project.pieces.push(
    part(
      "Obstacle on one entry",
      "plywood",
      [2, 0.75, 2],
      [0, 17.875, 5.5],
      top.stepId,
      "Test",
    ),
  );
  assert.throws(
    () =>
      previewFastenerContactRow(project, top.id, divider.id, inputs, options),
    /covers the centered entry face/,
  );
});

test("a pilot wider than the receiving edge becomes a conflict even while the tip centerline fits", () => {
  const { project, top, divider } = cabinet();
  const rotation: V3 = [0, 0.5, 0];
  for (const piece of project.pieces) {
    piece.position = rotate(piece.position, rotation);
    piece.rotation = rotation;
  }
  const { plan } = previewFastenerContactRow(
    project,
    top.id,
    divider.id,
    inputs,
    options,
  );
  const measurements = {
    surfaceToTipDepth: 1.25,
    pilotDepth: 1,
    pilotDiameter: 0.8,
    basis: "Synthetic fixture",
    measuredAt: new Date().toISOString(),
  };
  const saved = saveFastenerPlan(project, { ...plan, measurements });
  const [conflict] = fastenerReviews(saved);
  assert.equal(conflict.activePointCount, 0);
  assert.ok(
    conflict.locations.every(
      ({ penetration, issues }) =>
        penetration === 0.5 &&
        issues.some(({ code }) => code === "pilot-receiver-edge"),
    ),
  );
  const [cleared] = fastenerReviews(
    saveFastenerPlan(saved, {
      ...plan,
      measurements: { ...measurements, pilotDiameter: 0.125 },
    }),
  );
  assert.equal(cleared.state, "path-reviewed");
  assert.equal(cleared.activePointCount, 3);
});
