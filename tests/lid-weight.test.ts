import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { cutPiece, guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotShoppingList } from "../src/handoff";
import { createMeasuredHingeExample } from "../src/hingeExample";
import { lidPreview, persistLidPose } from "../src/lidMotion";
import { everbiltLidSupport, springLidStay } from "../src/lidStayReference";
import {
  lidStayTorqueComparison,
  removeLidWeight,
  reviewLidWeight,
  saveLidWeight,
} from "../src/lidWeight";
import { blank, projectSchema } from "../src/model";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import { transformSection } from "../src/sections";
import { rotate } from "../src/spatial";
import { addSupply } from "../src/supplies";

const banquette = () =>
  createBuildStudy(
    "storage-banquette",
    defaultBuildStudyParameters("storage-banquette"),
    blank(),
  ).project;

test("the lid stay compares against each mount separately and is withheld for other orientations or stale geometry", () => {
  const p = banquette();
  const { id } = p.sections[0];
  const measure = (
    weightLb: number,
    centerLocal: [number, number, number] = [0, 0, 0],
  ) => saveLidWeight(p, id, { weightLb, centerLocal });
  const compare = (project: ReturnType<typeof measure>) =>
    lidStayTorqueComparison(
      reviewLidWeight(project, project.lidWeightPlans[0]),
    );
  const centered = measure(12);
  assert.match(
    compare(centered).note,
    /144 lb-in closing at 0° \(16\.27 N·m\)/,
  );
  assert.match(compare(measure(12, [0, -3, 0])).note, /peaks at 16\.65 N·m at/);
  assert.deepEqual(compare(centered).rows, [
    {
      location: "Side mount",
      range: "17.6–21 N·m",
      result: "Below published range",
    },
    {
      location: "Back mount",
      range: "15–16.5 N·m",
      result: "Within published range",
    },
  ]);
  assert.deepEqual(
    compare(measure(14)).rows.map((row) => row.result),
    ["Within published range", "Above published range"],
  );
  const tilted = transformSection(centered, id, [0, 0, 0], [0.2, 0, 0]);
  assert.equal(
    lidStayTorqueComparison(reviewLidWeight(tilted, centered.lidWeightPlans[0]))
      .rows.length,
    0,
  );
  assert.equal(compare(measure(12, [0, 0, -16])).rows.length, 0);
  const plan = centered.lidWeightPlans[0];
  const changed = cutPiece(centered, plan.pieceId, 20, 2);
  assert.equal(
    lidStayTorqueComparison(reviewLidWeight(changed, plan)).rows.length,
    0,
  );
  assert.match(
    guideMarkdown(centered),
    /Back mount 15–16.5 N·m · Within published range/,
  );
});

test("Home Depot gets only manually added Everbilt kits and the manufacturer model remains a reference", () => {
  const everbilt = findRetailerProduct(everbiltLidSupport.productId)!;
  assert.equal(referenceOffersForProduct(everbilt)[0].productId, "314151479");
  assert.equal(everbilt.roleQualifications.length, 0);
  const sugatsune = findRetailerProduct(springLidStay.productId)!;
  assert.equal(referenceOffersForProduct(sugatsune).length, 0);
  assert.equal(sugatsune.supplier?.url, springLidStay.listing);
  const p = banquette();
  const measured = saveLidWeight(p, p.sections[0].id, {
    weightLb: 12,
    centerLocal: [0, 0, 0],
  });
  assert.doesNotMatch(
    homeDepotShoppingList(measured).text,
    /314151479|S-AT02W/,
  );
  const selected = addSupply(measured, everbilt.id, 2);
  assert.match(homeDepotShoppingList(selected).text, /314151479/);
  assert.throws(
    () => addSupply(measured, sugatsune.id, 1),
    /active reference offer/,
  );
});

test("the lid weight worksheet computes signed closing and opening torque and finds an interior peak", () => {
  const p = banquette();
  const section = p.sections[0];
  const saved = saveLidWeight(p, section.id, {
    weightLb: 12,
    centerLocal: [0, -3, 0],
  });
  const plan = saved.lidWeightPlans![0];
  const review = reviewLidWeight(saved, plan);
  assert.equal(review.state, "ready");
  if (review.state !== "ready") return;
  assert.equal(review.axisLabel, "Provisional rear pivot");
  assert.equal(review.angleTorque(0), 144);
  assert.ok(review.peakAngle > 0 && review.peakAngle < 75);
  assert.ok(Math.abs(review.peak - Math.hypot(144, 31.5)) < 1e-8);
  const rearLoaded = saveLidWeight(p, section.id, {
    weightLb: 12,
    centerLocal: [0, 0, -16],
  });
  const opposite = reviewLidWeight(rearLoaded, rearLoaded.lidWeightPlans![0]);
  assert.equal(opposite.state, "ready");
  if (opposite.state === "ready") assert.equal(opposite.angleTorque(0), -48);
  assert.equal(p.lidWeightPlans, undefined);
});

test("the measured hinge axis and a rotated open lid use the same physical balance point as the sweep", () => {
  const p = createMeasuredHingeExample();
  const section = p.sections[0];
  const saved = saveLidWeight(p, section.id, {
    weightLb: 16,
    centerLocal: [2, -1, 1.5],
  });
  const plan = saved.lidWeightPlans![0];
  const rotated = transformSection(
    saved,
    section.id,
    [30, 12, -20],
    [0.15, 0.6, -0.17],
  );
  const opened = persistLidPose(rotated, section.id, true);
  for (const project of [rotated, opened]) {
    const result = reviewLidWeight(project, plan);
    assert.equal(result.state, "ready");
    if (result.state !== "ready") continue;
    assert.equal(result.axisLabel, "Measured hinge axis");
    for (const angle of [0, 23, 56, 75]) {
      const pose = lidPreview(project, section.id, angle);
      const arm = new Vector3(...rotate(plan.centerLocal, pose.piece.rotation))
        .add(new Vector3(...pose.piece.position))
        .sub(new Vector3(...pose.pivot));
      const expected = arm
        .cross(new Vector3(0, -plan.weightLb, 0))
        .dot(new Vector3(...pose.axis));
      assert.ok(Math.abs(result.angleTorque(angle) - expected) < 1e-7);
    }
  }
});

test("lid measurements persist in the project and flag changed geometry before printing old torque", () => {
  const p = projectSchema.parse({ ...banquette(), schemaVersion: 38 });
  const id = p.sections[0].id;
  assert.equal(p.lidWeightPlans, undefined);
  assert.throws(() =>
    saveLidWeight(p, id, { weightLb: 0, centerLocal: [0, 0, 0] }),
  );
  const ready = generateBuildGuide(
    saveLidWeight(p, id, { weightLb: 12, centerLocal: [0, 0, 0] }),
  );
  assert.ok(guideIsCurrent(ready));
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(ready)));
  assert.deepEqual(reopened.lidWeightPlans, ready.lidWeightPlans);
  assert.match(guideMarkdown(reopened), /closed 144 lb-in closing/);
  const plan = reopened.lidWeightPlans![0];
  const changed = cutPiece(reopened, plan.pieceId, 20, 2);
  assert.equal(reviewLidWeight(changed, plan).state, "stale");
  assert.ok(
    validate(changed).some(
      (finding) => finding.title === "Review lid weight measurements",
    ),
  );
  assert.match(guideMarkdown(changed), /The lid changed shape or material/);
  assert.doesNotMatch(guideMarkdown(changed), /closed 144 lb-in/);
  assert.equal(removeLidWeight(changed, id).lidWeightPlans, undefined);
});
