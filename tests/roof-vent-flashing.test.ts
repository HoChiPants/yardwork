import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, part, projectSchema, uid } from "../src/model";
import { saveProjectCode } from "../src/projectCode";
import { blankProjectCode } from "../src/projectCodeSchema";
import {
  reviewRoofVentFlashing, roofVentFlashingGuideLines, roofVentFlashingReviews, saveRoofVentFlashing, type RoofVentMeasurements,
} from "../src/roofVentFlashing";
import { composeRotation } from "../src/spatial";
import { oateyRoofVentBoot } from "../src/roofVentFlashingReference";

function fixture(pitch = 6) {
  const project = blank("Vent penetration review");
  const roof = part("Plywood roof deck", "plywood", [48, 0.75, 96], [20, 48, 8], project.steps[0].id, "Roof",
    composeRotation([0, 0.63, 0], [-Math.atan(pitch / 12), 0, 0]));
  project.pieces.push(roof);
  const scoped = saveProjectCode(project, {
    ...blankProjectCode(),
    trades: ["roofing"],
    shingleRoof: {
      productId: null, coveragePerBundle: null, wastePercent: null, coverageBasis: "",
      planes: [{ id: uid(), label: roof.name, basis: { kind: "panel", pieceId: roof.id }, underlayment: "single" }],
    },
  });
  const measurements: RoofVentMeasurements = {
    panelId: roof.id, across: 0, downhill: 0,
    outsideDiameter: 2.375, radialClearance: 0.125, flangeLeft: 9, flangeUphill: 9,
  };
  return { scoped, measurements };
}

test("a vertical pipe needs a longer opening through a rotated sloped deck", () => {
  const { scoped, measurements } = fixture();
  const { issue, geometry } = reviewRoofVentFlashing(scoped, measurements);
  assert.equal(issue, undefined);
  assert.ok(Math.abs(geometry!.pitch - 6) < 1e-6);
  assert.equal(geometry!.openingWidth, 2.625);
  const expectedLength = 2.625 * Math.hypot(1, 0.5) + 0.75 * 0.5;
  assert.ok(Math.abs(geometry!.openingLength - expectedLength) < 1e-6);
  assert.ok(Math.abs(geometry!.openingShift - 0.1875) < 1e-6);
  const [left, right, bottom] = geometry!.flange.map((point) => new Vector3(...point));
  assert.ok(Math.abs(left.distanceTo(right) - 18) < 1e-6);
  assert.ok(Math.abs(right.distanceTo(bottom) - 18) < 1e-6);
});

test("nominal sizing, pitch and field placement each have their own fit check", () => {
  const { scoped, measurements } = fixture();
  assert.match(reviewRoofVentFlashing(scoped, { ...measurements, outsideDiameter: 2 }).issue ?? "", /outside diameter/);
  assert.match(reviewRoofVentFlashing(scoped, { ...measurements, radialClearance: -0.25 }).issue ?? "", /planned clearance/);
  assert.match(reviewRoofVentFlashing(scoped, { ...measurements, flangeUphill: 1 }).issue ?? "", /opening envelope/);
  assert.match(reviewRoofVentFlashing(scoped, { ...measurements, across: 22 }).issue ?? "", /deck edge/);
  for (const pitch of [1.5, 13]) {
    const roof = fixture(pitch);
    assert.match(reviewRoofVentFlashing(roof.scoped, roof.measurements).issue ?? "", /pitch/);
  }
});

test("a saved vent layout holds conflicting footprints and follows retained deck geometry on reopen", () => {
  const { scoped, measurements } = fixture();
  const older = projectSchema.parse({ ...scoped, schemaVersion: 120 });
  assert.equal(older.roofVentFlashings, undefined);
  const input = { ...measurements, label: "Kitchen vent", fieldConfirmed: true as const };
  const saved = saveRoofVentFlashing(older, input);
  assert.throws(() => saveRoofVentFlashing(saved, { ...input, across: 10 }), /overlaps another/);
  const two = saveRoofVentFlashing(saved, { ...input, label: "Second vent", downhill: 24 });
  const reloaded = projectSchema.parse(JSON.parse(JSON.stringify(two)));
  assert.deepEqual(reloaded.roofVentFlashings, two.roofVentFlashings);
  assert.ok(roofVentFlashingReviews(reloaded).every(({ issue }) => !issue));
  assert.match(roofVentFlashingGuideLines(reloaded).join("\n"), /2.625 in across × 3.30984 in downslope/);
  reloaded.pieces[0].position[2] += 4;
  assert.ok(roofVentFlashingReviews(reloaded).every(({ issue }) => /layout changed/.test(issue ?? "")));
});

test("the guide and Home Depot list use the checked layout and hold stale planned purchases", () => {
  const { scoped, measurements } = fixture();
  const project = saveRoofVentFlashing(scoped, { ...measurements, label: "Kitchen vent", fieldConfirmed: true });
  assert.match(guideMarkdown(project), /## Roof vent flashing[\s\S]*2.625 in across/);
  const need = homeDepotPurchaseNeeds(project).find(({ id }) => id === oateyRoofVentBoot.id);
  assert.equal(need?.missing, 1);
  const purchased = addHomeDepotPurchaseNeed(project, need!.id);
  assert.match(homeDepotShoppingList(purchased).text, /204715523/);
  purchased.pieces[0].position[1] += 3;
  assert.doesNotMatch(homeDepotShoppingList(purchased).text, /204715523/);
  assert.match(guideMarkdown(purchased), /Kitchen vent.*Needs review/);
  assert.ok(validate(purchased).some(({ title }) => title === "Review roof vent flashing · Kitchen vent"));
});
