import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed } from "../src/handoffPurchases";
import { projectSchema } from "../src/model";
import { saveRoundDuct } from "../src/roundDuct";
import { roundDuctMastic } from "../src/roundDuctReference";
import { previewRoundDuctSeal, reviewRoundDuctSeal, saveRoundDuctSeal } from "../src/roundDuctSeal";

const measurements = {jointCircumference: 18.85, fittingSeams: 36, reinforcedSeams: 12, coveragePerTube: 120};
const practice = () => projectSchema.parse(JSON.parse(readFileSync(new URL("../public/examples/hvac/round-duct-sealing.yardwork.json", import.meta.url), "utf8")));

test("count each elbow collar once and include measured fitting seams and trial tube coverage", () => {
  const project = practice();
  const estimate = previewRoundDuctSeal(project, measurements);
  assert.equal(estimate.joints, 4);
  assert.equal(estimate.longitudinal, 80);
  assert.equal(estimate.jointSeams, 75.4);
  assert.equal(estimate.total, 191.4);
  assert.equal(estimate.tubes, 2);
  assert.match(previewRoundDuctSeal(project, { ...measurements, reinforcedSeams: 200 }).issue ?? "", /exceeds/);
  const saved = saveRoundDuctSeal(project, measurements);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(saved))), saved);
  assert.match(guideMarkdown(saved), /Total seam length is 191.4 in\. At 10 ft per tube, allow 2 × WBA10.5/);
  assert.match(guideMarkdown(saved), /12 in of compatible mesh/);
  const purchased = addHomeDepotPurchaseNeed(saved, roundDuctMastic.id);
  assert.equal(homeDepotShoppingList(purchased).items.find(({ productId }) => productId === "100396972")?.quantity, 2);
});

test("a changed route holds measured mastic purchases until the seam takeoff is reviewed again", () => {
  const saved = addHomeDepotPurchaseNeed(saveRoundDuctSeal(practice(), measurements), roundDuctMastic.id);
  const first = saved.roundDuctRuns![0];
  const renamed = saveRoundDuct(saved, { ...first.input, name: "West bay" }, first.id);
  assert.equal(reviewRoundDuctSeal(renamed)?.tubes, 2);
  const changed = saveRoundDuct(saved, { ...first.input, start: [-53, 10, 0] }, first.id);
  assert.match(reviewRoundDuctSeal(changed)?.issue ?? "", /Duct geometry changed/);
  assert.ok(validate(changed).some(({ title }) => title === "Review round duct sealing"));
  assert.ok(!homeDepotShoppingList(changed).items.some(({ productId }) => productId === "100396972"));
  assert.match(homeDepotHandoff(changed), /LINKED PURCHASES TO REVIEW[\s\S]*Master Flow 10.5 oz water-based duct sealant/);
  assert.equal(reviewRoundDuctSeal(saveRoundDuctSeal(changed, measurements))?.tubes, 2);
});
