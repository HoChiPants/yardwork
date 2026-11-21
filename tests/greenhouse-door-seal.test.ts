import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import {
  checkGreenhouseDoorSeal, greenhouseDoorSealTakeoff,
  packDoorWeathersealCuts, reviewGreenhouseDoorSeal, saveGreenhouseDoorSeal,
} from "../src/greenhouseDoorSeal";
import { doorSeal } from "../src/greenhouseDoorSealReference";
import { greenhouseDoorChoices, greenhouseDoorMotionInput } from "../src/greenhouseDoors";
import { greenhouseDoorStopRoles } from "../src/greenhouseDoorReference";
import { previewGreenhouseDoorStops } from "../src/greenhouseDoorStops";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { hingePoseAroundAxis } from "../src/hinges";
import { motionSetup, saveMotionPlan } from "../src/mechanismMotion";
import { part, projectSchema } from "../src/model";

function fixture(side: "left" | "right" = "left", sealGap = doorSeal.modeledGap as number) {
  const base = createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseGlazing: { materialId: "sunlite-8mm", productRegistryRef: "sunlite-132506" },
  }).project;
  const [{ entry }] = greenhouseDoorChoices(base);
  const motion = saveMotionPlan(base, greenhouseDoorMotionInput(base, {
    entryId: entry.id, side, outset: 0, sideOffset: 0, kitId: null,
  }, 90));
  const fitted = previewGreenhouseDoorStops(motion.project, motion.plan, { sealGap, sillGap: 0.25, reuse: false });
  return { ...motion, project: fitted.project };
}

test("the weatherseal follows either hinge side, previews three strips and buys the exact split pack", () => {
  for (const side of ["left", "right"] as const) {
    const { project, plan } = fixture(side);
    const review = checkGreenhouseDoorSeal(project, plan);
    assert.equal(review.ready, true, review.detail);
    assert.deepEqual(review.rows.map(({ length, gap }) => [length, gap]), [[29.75, 0.1875], [67, 0.1875], [67, 0.1875]]);
    assert.equal(review.rows.find(({ moves }) => moves)?.role, side === "left" ? "right" : "left");
    assert.equal(review.preview?.().obstaclePieces?.length, 3);
    const saved = saveGreenhouseDoorSeal(project, plan.id);
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
    assert.equal(reviewGreenhouseDoorSeal(reopened, reopened.greenhouseDoorSeals![0]).ready, true);
    assert.deepEqual(reopened.pieces, project.pieces);
    const takeoff = greenhouseDoorSealTakeoff(reopened);
    assert.equal(takeoff.required, 1);
    assert.deepEqual(takeoff.strips.map(({ remaining }) => remaining), [5.25, 35]);
    assert.match(guideMarkdown(reopened), /Package 1, strip 1.*Keep 5.25 in/);
    const need = homeDepotPurchaseNeeds(reopened).find(({ id }) => id === doorSeal.id);
    assert.equal(need?.quantityText, "1 weatherseal pack");
    const supplied = addHomeDepotPurchaseNeed(reopened, doorSeal.id);
    assert.equal(homeDepotPurchaseNeeds(supplied).some(({ id }) => id === doorSeal.id), false);
    assert.ok(homeDepotShoppingList(supplied).items.some(({ productId }) => productId === doorSeal.internetNumber));
  }
});

test("closed gap or backing changes withhold purchase and keep earlier weatherseal layouts reviewable", () => {
  const tight = fixture("left", 0);
  assert.ok(checkGreenhouseDoorSeal(tight.project, tight.plan).rows.every(({ issues }) => issues.some((issue) => issue.includes("Gap below"))));
  const loose = fixture("right", 0.3125);
  assert.ok(checkGreenhouseDoorSeal(loose.project, loose.plan).rows.every(({ issues }) => issues.some((issue) => issue.includes("Gap above"))));
  assert.throws(() => saveGreenhouseDoorSeal(loose.project, loose.plan.id), /Resolve the closed gap/);
  const { project, plan } = fixture();
  const saved = saveGreenhouseDoorSeal(project, plan.id);
  const shifted = { ...saved, pieces: saved.pieces.map((piece) =>
    piece.designRole === greenhouseDoorStopRoles.head
      ? { ...piece, position: [piece.position[0], piece.position[1], piece.position[2] - 0.01] as typeof piece.position }
      : piece) };
  assert.equal(checkGreenhouseDoorSeal(shifted, plan).ready, true);
  const review = reviewGreenhouseDoorSeal(shifted, saved.greenhouseDoorSeals![0]);
  assert.equal(review.ready, false);
  assert.match(review.detail, /layout or swing changed/);
  assert.equal(homeDepotPurchaseNeeds(shifted).find(({ id }) => id === doorSeal.id)?.canAdd, false);
  assert.doesNotMatch(guideMarkdown(shifted), /Package 1, strip 1/);
  assert.ok(validate(shifted).some(({ title }) => title === "Review greenhouse door weatherseal"));
});

test("the attached latch-side strip is checked through intermediate angles", () => {
  const { project, plan } = fixture();
  const closed = checkGreenhouseDoorSeal(project, plan).preview?.();
  const strip = closed?.obstaclePieces?.find(({ name }) => name === "Right jamb weatherseal");
  const mechanism = motionSetup(project, plan).mechanism;
  assert.ok(strip && mechanism.kind === "hinge");
  const onArc = hingePoseAroundAxis(strip, mechanism.pivot, mechanism.axis, 35);
  const obstruction = part("Weatherseal rubbing block", "stud", [0.15, 1.5, 0.08], onArc.position, project.steps[0].id, "Trim", onArc.rotation);
  const checked = checkGreenhouseDoorSeal({ ...project, pieces: [...project.pieces, obstruction] }, plan);
  assert.equal(checked.ready, false);
  assert.match(checked.detail, /weatherseal .*Weatherseal rubbing block near/);
  const pose = checked.preview?.();
  assert.ok(pose && pose.travel > 0 && pose.travel < 90);
  assert.ok(pose.obstaclePieces?.find(({ id }) => pose.interferenceIds.includes(id)));
});

test("weatherseal purchasing respects the two separate strips in each pack", () => {
  const packed = packDoorWeathersealCuts([
    { name: "Jamb 1", length: 81 },
    { name: "Jamb 2", length: 81 },
    { name: "Head", length: 33 },
  ]);
  assert.equal(packed.packs, 2);
  assert.deepEqual(packed.strips.map(({ remaining }) => remaining), [21, 21, 69, 102]);
  assert.throws(() => packDoorWeathersealCuts([{ name: "Tall jamb", length: 103 }]), /one continuous/);
});

test("a workspace weatherseal question reports the modeled door without saving a plan", () => {
  const { project, plan } = fixture();
  const question = buildQuestion("How should I weatherstrip the greenhouse door?");
  assert.deepEqual(question, { kind: "greenhouse-weatherseal" });
  const original = structuredClone(project);
  const answer = answerBuildQuestion(project, question!, []);
  assert.equal(answer.rows?.length, 1);
  assert.match(answer.rows![0].detail, /clear the minimum-gap sweep/);
  assert.deepEqual(answer.rows![0].link?.action, { kind: "greenhouse-weatherseal", motionId: plan.id });
  assert.deepEqual(project, original);
  assert.equal(buildQuestion("Build a greenhouse with a sealed door"), null);
});
