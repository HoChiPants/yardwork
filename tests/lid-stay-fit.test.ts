import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { guideIsCurrent, generateBuildGuide } from "../src/guide";
import { guideMarkdown, validate } from "../src/engine";
import {
  lidWeightPose,
  persistLidPose,
  reviewLidTravel,
} from "../src/lidMotion";
import {
  addMissingLidStays,
  lidStayPurchases,
  reviewLidStayFit,
  saveLidStayFit,
} from "../src/lidStayFit";
import { foldingLidStays } from "../src/lidStayReference";
import { findRetailerProduct } from "../src/retailerCatalog";
import { recordSupplyInventory, supplyRows } from "../src/supplies";
import { homeDepotShoppingList } from "../src/handoff";
import { transformSection } from "../src/sections";
import type { LidStayFitInput } from "../src/lidStayFitSchema";
import { inspectLidTravel, lidTravelPose } from "../src/lidTravelFindings";

const left = "everbilt-19834-lid-stay";
const right = "everbilt-19844-lid-stay";
function cabinet() {
  const project = {
    ...applyIdeaPlan(
      blank(),
      localIdeaPlan({
        prompt:
          "One-section storage banquette 24 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back",
      }),
    ),
    store: "4409",
    workZone: null,
  };
  const section = project.sections[0];
  const fixed = project.pieces.find(
    (piece) => piece.designRole === "storage-left",
  )!;
  const input: LidStayFitInput = {
    fixedPieceId: fixed.id,
    productId: left,
    fixedPin: [0.5, 4, -6],
    lidPin: [-11.125, -0.375, -5],
    fixedArm: 4,
    lidArm: 4,
    foldSign: 1,
    testAngle: 90,
  };
  return { project, fixed, section, input };
}

test("reach and actual linkage centerlines use the closed lid and track both arms", () => {
  const { project, section, input } = cabinet();
  const fitted = saveLidStayFit(project, section.id, input);
  const plan = fitted.lidStayFits![0];
  const review = reviewLidStayFit(fitted, plan);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  assert.ok(
    review.limit && review.limit.travel > 0 && review.limit.travel < 75,
  );
  assert.ok(review.distanceRange[1] > 12);
  assert.equal(review.preview(90).state, "too-far");
  const distance = (a: V3, b: V3) => Math.hypot(...a.map((n, i) => n - b[i]));
  const [base, elbow, lid] = review.preview(12).points;
  assert.ok(Math.abs(distance(base, elbow) - input.fixedArm) < 1e-9);
  assert.ok(Math.abs(distance(lid, elbow) - input.lidArm) < 1e-9);
  const opposite = saveLidStayFit(
    fitted,
    section.id,
    { ...input, foldSign: -1 },
    plan.id,
  );
  const other = reviewLidStayFit(opposite, opposite.lidStayFits![0]);
  assert.equal(other.state, "current");
  if (other.state !== "current") return;
  assert.notDeepEqual(other.preview(12).points[1], elbow);
  assert.equal(reviewLidTravel(fitted, section.id, 90).preview(90).angle, 90);
  assert.equal(reviewLidTravel(fitted, section.id).travel, 90);
  assert.equal(reviewLidTravel(project, section.id).travel, 75);
  assert.ok(
    validate(fitted).some((row) => row.id === `lid-stay-fit-${plan.id}`),
  );
  assert.deepEqual(fitted.pieces, project.pieces);
});

test("an obstruction between reachable ends stops linkage playback in both directions", () => {
  const { project, section, fixed, input } = cabinet();
  const { pivot, piece } = lidWeightPose(project, section.id);
  // Put the two pins farthest apart at 45°, with both endpoint spacings smaller.
  const radial = 4;
  const diag = radial / Math.sqrt(2);
  const fixedWorld: V3 = [0, pivot[1] - diag, pivot[2] - diag];
  const set = saveLidStayFit(project, section.id, {
    ...input,
    fixedPin: fixedWorld.map((n, i) => n - fixed.position[i]) as V3,
    lidPin: [
      0,
      pivot[1] - piece.position[1],
      pivot[2] + radial - piece.position[2],
    ],
    fixedArm: 3.85,
    lidArm: 3.85,
  });
  const review = reviewLidStayFit(set, set.lidStayFits![0]);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  assert.ok(Math.abs(review.distanceRange[1] - 8) < 1e-8);
  assert.equal(review.preview(0).state, "reachable");
  assert.equal(review.preview(45).state, "too-far");
  assert.equal(review.preview(90).state, "reachable");
  const open = review.playbackLimit(0, 90)!;
  const close = review.playbackLimit(90, 0)!;
  assert.ok(open.travel > 0 && open.inspectAt < 45);
  assert.ok(close.travel < 90 && close.inspectAt > 45);
});

test("a folded length conflict is detected on closing from a reachable pose", () => {
  const { project, section, input } = cabinet();
  const fitted = saveLidStayFit(project, section.id, {
    ...input,
    fixedArm: 8,
    lidArm: 2,
  });
  const review = reviewLidStayFit(fitted, fitted.lidStayFits![0]);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  assert.equal(review.preview(0).state, "too-short");
  assert.equal(review.preview(40).state, "reachable");
  assert.equal(review.limit?.travel, 0);
  const closing = review.playbackLimit(40, 0)!;
  assert.ok(closing.travel > 0 && closing.travel < 40);
});

test("measured stay rectangles detect a mid-swing obstacle on opening and closing, and clear its retained trim", () => {
  const { project, section, fixed, input } = cabinet();
  const stop = part(
    "Stay arm test block",
    "stud",
    [0.125, 0.25, 0.25],
    [0.11, 12.776, -2.865],
    project.steps[0].id,
    "Test",
  );
  project.pieces.push(stop);
  const fitted = saveLidStayFit(project, section.id, {
    ...input,
    fixedPin: [-fixed.position[0], 11 - fixed.position[1], -7],
    lidPin: [0, -1.5, -5],
    fixedArm: 9,
    lidArm: 9,
    armEnvelopes: [
      { width: 0.5, thickness: 0.125 },
      { width: 0.5, thickness: 0.125 },
    ],
  });
  const fit = fitted.lidStayFits![0];
  const review = reviewLidStayFit(fitted, fit);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  assert.equal(review.limit, null);
  assert.deepEqual(reviewLidTravel(fitted, section.id).collisions, []);
  assert.deepEqual(
    review.preview(35).arms?.map(({ hitIds }) => hitIds),
    [[stop.id], []],
  );
  for (const end of [0, 90])
    assert.ok(review.preview(end).arms?.every(({ hitIds }) => !hitIds.length));
  const opening = review.playbackLimit(0, 90)!;
  const closing = review.playbackLimit(90, 0)!;
  for (const contact of [opening, closing]) {
    assert.equal(contact.kind, "arm-contact");
    assert.ok(Math.abs(contact.travel - contact.inspectAt) < 0.001);
    assert.ok(
      review
        .preview(contact.inspectAt)
        .arms?.some(({ hitIds }) => hitIds.includes(stop.id)),
    );
    assert.ok(
      review
        .preview(contact.travel)
        .arms?.every(({ hitIds }) => !hitIds.length),
    );
  }
  assert.ok(opening.travel < 35 && closing.travel > 35);
  assert.match(
    validate(fitted).find(({ id }) => id === `lid-stay-fit-${fit.id}`)!.detail,
    /Modeled stay arm hits/,
  );
  assert.match(guideMarkdown(fitted), /Modeled stay arm hits/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(fitted))).lidStayFits,
    fitted.lidStayFits,
  );

  const trimmed = fitted.pieces.find(({ id }) => id === stop.id)!;
  trimmed.cutPlanes = [{ normal: [-1, 0, 0], constant: -0.015 }];
  const clear = reviewLidStayFit(fitted, fit);
  assert.equal(clear.state, "current");
  if (clear.state !== "current") return;
  assert.equal(clear.armClearance?.(), null);
  assert.match(
    guideMarkdown(fitted),
    /Modeled stay arms have clearance throughout the tested swing through 90°/,
  );
});

test("a folding stay finds a short collision between the old half-degree samples in either direction", () => {
  const { project, section, fixed, input } = cabinet();
  const catchPiece = part("Narrow catch", "stud", [0.05, 0.006, 0.006],
    [0, 13.2525906, -1.6010801], project.steps[0].id, "Test");
  project.pieces.push(catchPiece);
  const fitted = saveLidStayFit(project, section.id, {
    ...input,
    fixedPin: [-fixed.position[0], 11 - fixed.position[1], -7],
    lidPin: [0, -1.5, -5],
    fixedArm: 9,
    lidArm: 9,
    armEnvelopes: [
      { width: 0.004, thickness: 0.125 },
      { width: 0.004, thickness: 0.125 },
    ],
  });
  const fit = fitted.lidStayFits![0];
  const review = reviewLidStayFit(fitted, fit);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  for (let angle = 0; angle <= 90; angle += 0.5)
    assert.ok(review.preview(angle).arms?.every(({ hitIds }) => !hitIds.length));
  const open = review.playbackLimit(0, 90)!;
  const close = review.playbackLimit(90, 0)!;
  assert.ok(open.travel > 34 && open.travel < 34.25);
  assert.ok(close.travel > 34.25 && close.travel < 34.5);
  for (const contact of [open, close]) {
    if (contact.kind !== "arm-contact") assert.fail(`Expected a confirmed arm hit, received ${contact.kind}`);
    const { hitIds, inspectAt, travel } = contact;
    assert.deepEqual(hitIds, [catchPiece.id]);
    assert.ok(review.preview(inspectAt).arms?.some((arm) => arm.hitIds.includes(catchPiece.id)));
    assert.ok(review.preview(travel).arms?.every((arm) => !arm.hitIds.length));
  }

  const envelope = projectSchema.parse({
    ...fitted,
    pieces: fitted.pieces.map((piece) => piece.id === catchPiece.id ? { ...piece, material: "roof" } : piece),
  });
  const inspection = inspectLidTravel(envelope, section.id);
  const finding = inspection.findings.find(({ id }) => id === `stay/${fit.id}`)!;
  assert.match(finding.detail, /Stay arm clearance needs review/);
  assert.equal(finding.stayStop?.kind, "arm-unresolved");
  const preview = lidTravelPose(inspection.review!.preview(finding.angle!),
    inspection.stays.map(({ status }) => status), undefined, finding.stayStop);
  assert.deepEqual(preview.stayArmReviewIds, [catchPiece.id]);
  assert.equal(preview.stayArmReviewFitId, fit.id);
  assert.equal(preview.stayArmHitIds, undefined);
});

test("format 49 stays reopen with their pin reach and without inferred arm dimensions", () => {
  const { project, section, input } = cabinet();
  const fitted = saveLidStayFit(project, section.id, input);
  const imported = projectSchema.parse({ ...fitted, schemaVersion: 49 });
  assert.deepEqual(imported.lidStayFits, fitted.lidStayFits);
  const review = reviewLidStayFit(imported, imported.lidStayFits![0]);
  assert.equal(review.state, "current");
  if (review.state !== "current") return;
  assert.equal(review.armClearance, null);
  assert.equal(review.playbackLimit(0, 90)?.kind, "reach");
});
test("stay references become stale after member edits and follow common rigid movement and saved lid pose", () => {
  const { project, section, fixed, input } = cabinet();
  const fitted = saveLidStayFit(project, section.id, input);
  const fit = fitted.lidStayFits![0];
  const moved = transformSection(
    fitted,
    section.id,
    [20, 2, -13],
    [0.18, 0.8, -0.31],
  );
  assert.equal(reviewLidStayFit(moved, fit).state, "current");
  const opened = persistLidPose(fitted, section.id, true);
  assert.equal(reviewLidStayFit(opened, fit).state, "current");
  const changed = {
    ...fitted,
    pieces: fitted.pieces.map((piece) =>
      piece.id === fixed.id
        ? {
            ...piece,
            position: [
              piece.position[0],
              piece.position[1] - 1,
              piece.position[2],
            ] as V3,
          }
        : piece,
    ),
  };
  assert.equal(reviewLidStayFit(changed, fit).state, "stale");
  const notPlanar = saveLidStayFit(
    fitted,
    section.id,
    { ...input, lidPin: [0, -0.375, -5] },
    fit.id,
  );
  assert.equal(
    reviewLidStayFit(notPlanar, notPlanar.lidStayFits![0]).state,
    "needs-measurement",
  );
  assert.equal(
    projectSchema.parse({ ...project, schemaVersion: 43 }).lidStayFits,
    undefined,
  );
});

test("one separate handed SKU per selected stay reaches the Home Depot snapshot and guide without automatic purchase", () => {
  const { project, section, input } = cabinet();
  const fixed = project.pieces.find(
    (piece) => piece.designRole === "storage-right",
  )!;
  const base = generateBuildGuide(project);
  const first = saveLidStayFit(base, section.id, input);
  const two = saveLidStayFit(first, section.id, {
    ...input,
    fixedPieceId: fixed.id,
    lidPin: [11.125, -0.375, -5],
    fixedPin: [-0.5, 4, -6],
    productId: right,
    testAngle: 75,
  });
  assert.equal(guideIsCurrent(two), false);
  assert.equal(two.supplies.length, 0);
  assert.doesNotMatch(homeDepotShoppingList(two).text, /20448579[56]/);
  const purchased = addMissingLidStays(addMissingLidStays(two, left), right);
  assert.equal(addMissingLidStays(purchased, left), purchased);
  assert.deepEqual(lidStayPurchases(purchased, left), {
    needed: 1,
    already: 1,
    missing: 0,
  });
  const at = new Date("2026-11-20T08:30:00Z");
  const stocked = recordSupplyInventory(purchased, {
    productId: left,
    retailer: "home-depot",
    retailerProductId: foldingLidStays[left].internetNumber,
    zip: "84121",
    store: "4409",
    price: 7.5,
    available: 0,
    checkedAt: at.toISOString(),
    url: foldingLidStays[left].listing,
  });
  assert.equal(
    supplyRows(stocked, +at).find((row) => row.productId === left)?.inventory
      ?.available,
    0,
  );
  assert.equal(findRetailerProduct(right)?.offers[0].productId, "204485796");
  assert.match(
    homeDepotShoppingList(stocked).text,
    /^1 lid stay .*#204485795$/m,
  );
  assert.match(
    homeDepotShoppingList(stocked).text,
    /^1 lid stay .*#204485796$/m,
  );
  const regenerated = generateBuildGuide(stocked);
  assert.equal(guideIsCurrent(regenerated), true);
  const guide = guideMarkdown(regenerated);
  assert.match(guide, /Folding lid stay fit/);
  assert.match(guide, /Entered marks:/);
  assert.match(guide, /90° setup is outside this tested swing/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(regenerated))).lidStayFits,
    regenerated.lidStayFits,
  );
});
