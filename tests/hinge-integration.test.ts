import test from "node:test";
import assert from "node:assert/strict";
import {
  bom,
  validate,
  shoppingCsv,
  guideMarkdown,
  projectPricingCoverage,
} from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { retailerHandoff } from "../src/handoff";
import {
  addMissingHingePacks,
  hingePurchaseSummary,
} from "../src/hingePurchases";
import {
  hingePurchaseAllocations,
  makeLidHingePlan,
  removeLidHingePlan,
  saveLidHingePlan,
} from "../src/hinges";
import { measuredHingeFixture } from "./fixtures/measuredHinge";

test("a measured hinge source is compared once and selected supplies alone add purchase/pricing lines", () => {
  const p = measuredHingeFixture(),
    before = JSON.stringify(p),
    stock = bom(p);
  assert.ok(
    projectPricingCoverage(p).unresolvedQuantities.some((row) =>
      /physical hinge/.test(row.description),
    ),
  );
  const selected = addMissingHingePacks(p, hingePurchaseAllocations(p));
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(bom(selected), stock);
  assert.deepEqual(selected.pieces, p.pieces);
  assert.deepEqual(selected.joints, p.joints);
  assert.equal(
    hingePurchaseSummary(selected, hingePurchaseAllocations(selected))
      .shortfallHinges,
    0,
  );
  assert.equal(selected.supplies.length, 1);
  assert.equal(
    addMissingHingePacks(selected, hingePurchaseAllocations(selected)),
    selected,
  );
  const csv = shoppingCsv(selected);
  assert.equal(
    csv.split("\n").filter((line) => /314150989/.test(line)).length,
    1,
  );
  const handoff = retailerHandoff(selected);
  assert.match(
    handoff,
    /1 distinct physical hinge sources allocated; 1 whole hinges selected; 0 missing/,
  );
  assert.match(
    handoff,
    /retained segments.*not.*extra|retained segments.*do not add/i,
  );
  assert.equal(
    projectPricingCoverage(selected).unresolvedQuantities.some((row) =>
      /physical hinge/.test(row.description),
    ),
    false,
  );
});
test("guide and project checks expose pending/conflict data and preserve current generated phases", () => {
  const p = measuredHingeFixture();
  const generated = generateBuildGuide(p);
  assert.ok(guideIsCurrent(generated));
  assert.equal(
    generated.steps.filter((s) => s.generated?.kind === "lid-hinge-preparation")
      .length,
    1,
  );
  assert.match(guideMarkdown(generated), /H001\/L001/);
  assert.ok(
    validate(generated).some(
      (finding) =>
        finding.hingePlanId === p.lidHingePlans[0].id &&
        finding.severity === "info",
    ),
  );
  const bad = structuredClone(generated);
  bad.lidHingePlans[0].locations[0].measurements.pilotDepth = 0.8;
  assert.ok(
    validate(bad).some(
      (finding) =>
        finding.hingePlanId === p.lidHingePlans[0].id &&
        finding.severity === "error",
    ),
  );
  assert.equal(guideIsCurrent(bad), false);
  assert.match(
    guideMarkdown(generateBuildGuide(bad)),
    /coordinates.*withheld/i,
  );
});
test("removed H labels stay reserved when another actual-member plan is created", () => {
  const p = measuredHingeFixture(),
    old = p.lidHingePlans[0];
  const removed = removeLidHingePlan(p, old.id);
  const created = makeLidHingePlan(
    removed,
    old.sectionId,
    old.moving.pieceId,
    old.fixed.pieceId,
  );
  assert.equal(created.label, "H002");
  const next = saveLidHingePlan(removed, created);
  assert.equal(next.hingePlanLabels.length, 2);
  assert.equal(next.lidHingePlans[0].locations.length, 0);
  assert.equal(next.lidHingePlans[0].axis.fixedA, null);
});
