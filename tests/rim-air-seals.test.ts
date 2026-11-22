import assert from "node:assert/strict";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { applyCommand, blank, part, projectSchema, type Project } from "../src/model";
import { rimEdgeSealant, rimFoam } from "../src/rimAirSealReference";
import type { RimAirSealInput, RimSide } from "../src/rimAirSealSchema";
import { reviewRimAirSeals, rimAirSealFrame, rimEdgeSealEstimate, saveRimAirSeal } from "../src/rimAirSeals";
import { transformSection } from "../src/sections";
import { addSupply } from "../src/supplies";

function floor() {
  return applyCommand(blank("Measured floor"), {
    type: "foundation",
    width: 48,
    depth: 48,
    height: 12,
    spacing: 16,
  });
}

function measurements(project: Project, side: RimSide, indexes = [0, 1]): RimAirSealInput {
  const sectionId = project.sections[0].id;
  const { bays } = rimAirSealFrame(project, sectionId, side);
  return {
    sectionId, side, confirmedBacking: true, topInset: 0.25, gap: 0.125, kerf: 0.125,
    bays: indexes.map((index) => {
      const { left, right, width } = bays[index];
      return { left, right, width, height: 5 };
    }),
  };
}

test("rim plans size foam from measured bays, reuse an offcut, and share new sheets across rims", () => {
  const project = floor();
  const back = measurements(project, "back");
  const front = measurements(project, "front", [1, 2]);
  const withBack = saveRimAirSeal(project, {
    ...back, offcut: { label: "Foam A", width: 14.25, length: 4.75 },
  });
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(saveRimAirSeal(withBack, front))));
  const prepared = reviewRimAirSeals(saved);
  assert.deepEqual(prepared.rows.map(({ issues }) => issues), [[], []]);
  assert.deepEqual(prepared.rows[0].cuts.map(({ width, length }) => [width, length]),
    [[13.5, 4.75], [14.25, 4.75]]);
  assert.equal(prepared.scraps.length, 1);
  assert.equal(prepared.scraps[0].stock.placements.length, 1);
  assert.equal(prepared.sheets.length, 1);
  assert.equal(prepared.sheets[0].stock.placements.length, 3);
  assert.ok(prepared.sheets[0].order.remnants.length);
  assert.ok(prepared.sheets[0].order.steps.length);
  const guide = guideMarkdown(saved);
  assert.match(guide, /## Floor rim foam and air seals/);
  assert.match(guide, /seal the four edges/);
  assert.match(guide, /Keep reusable foam/);
  assert.match(guide, /Offcut Foam A/);
  const need = homeDepotPurchaseNeeds(saved).find(({ id }) => id === rimFoam.id);
  assert.equal(need?.required, 1);
  assert.equal(need?.canAdd, true);
  const shopping = homeDepotShoppingList(addHomeDepotPurchaseNeed(saved, rimFoam.id));
  assert.match(shopping.text, /1 sheet.*Internet #345181221/);
});

test("a rigid horizontal move keeps the plan, while a blockage holds its planned purchase", () => {
  const project = floor();
  const input = measurements(project, "back", [1]);
  const approved = addHomeDepotPurchaseNeed(saveRimAirSeal(project, input), rimFoam.id);
  const moved = transformSection(approved, input.sectionId, [81, 7, -30], [0, 0.4, 0]);
  const live = reviewRimAirSeals(moved);
  assert.deepEqual(live.rows[0].issues, []);
  assert.equal(live.sheets.length, 1);
  assert.notDeepEqual(live.rows[0].cuts[0].outline, reviewRimAirSeals(approved).rows[0].cuts[0].outline);

  const { outline } = live.rows[0].cuts[0];
  const position = outline[0].map((point, axis) => (point + outline[2][axis]) / 2) as [number, number, number];
  const obstruction = part("Blocking near seal", "stud", [1, 2, 2], position, moved.steps[0].id, "Review");
  const blocked = { ...moved, pieces: [...moved.pieces, obstruction] };
  assert.match(reviewRimAirSeals(blocked).rows[0].issues[0], /blocks the seated foam/);
  assert.equal(reviewRimAirSeals(blocked).sheets.length, 0);
  assert.equal(homeDepotPurchaseNeeds(blocked).find(({ id }) => id === rimFoam.id)?.required, null);
  assert.ok(validate(blocked).some(({ title }) => title.startsWith("Review rim air seal")));
  assert.doesNotMatch(homeDepotShoppingList(blocked).text, /345181221/);
  assert.match(homeDepotShoppingList(addSupply(blocked, rimFoam.id, 1, "Separate mock-up")).text, /1 sheet.*345181221/);
});

test("rim plans reject changed measurements, replaced members and double-allocated measured offcuts", () => {
  const project = floor();
  const back = measurements(project, "back", [1]);
  const front = measurements(project, "front", [1]);
  assert.throws(() => saveRimAirSeal(project, {
    ...back, bays: [{ ...back.bays[0], width: back.bays[0].width + 0.125 }],
  }), /match the modeled/);
  assert.throws(() => saveRimAirSeal(project, { ...back, topInset: 1 }), /beyond the shared/);
  const withScrap = saveRimAirSeal(project, { ...back, offcut: { label: "F-01", width: 15, length: 5 } });
  assert.throws(() => saveRimAirSeal(withScrap, {
    ...front, offcut: { label: "f-01", width: 15, length: 5 },
  }), /assigned twice/);
  const movedJoist = { ...withScrap, pieces: withScrap.pieces.map((piece) =>
    piece.id === back.bays[0].left ? { ...piece, position: [piece.position[0] - 0.125, piece.position[1], piece.position[2]] as [number, number, number] } : piece) };
  const reviewed = reviewRimAirSeals(movedJoist);
  assert.match(reviewed.rows[0].issues[0], /opening moved or changed/);
  assert.equal(reviewed.sheets.length, 0);
  assert.equal(reviewed.scraps.length, 0);
});

test("a rim insulation question routes to the modeled floor without fabricating field dimensions", () => {
  const project = floor();
  const query = buildQuestion("How do I air seal the rim joists?");
  assert.deepEqual(query, { kind: "rim-air-seal" });
  const result = answerBuildQuestion(project, query!, []);
  assert.deepEqual(result.link?.action, { kind: "rim-air-seal", sectionId: project.sections[0].id });
  assert.match(result.detail, /measure the openings/);
  assert.equal(answerBuildQuestion(blank(), query!, []).link, undefined);
  assert.equal(buildQuestion("Build a 10 ft floor with foam at the rim joists"), null);
});

test("edge sealant uses a four-edge centerline and rounds cans by work session", () => {
  const project = floor();
  const edgeSeal = { depth: 0.5, trialLengthPerCan: 120, session: "First floor" };
  const back = measurements(project, "back");
  const front = measurements(project, "front", [1]);
  const withBack = saveRimAirSeal(project, {
    ...back, edgeSeal, offcut: { label: "Foam A", width: 14.25, length: 4.75 },
  });
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(saveRimAirSeal(withBack, {
    ...front, edgeSeal: { ...edgeSeal, session: "first floor" },
  }))));
  const review = reviewRimAirSeals(saved);
  const estimate = rimEdgeSealEstimate(review.rows[0])!;
  assert.equal(estimate.run, 75.5);
  assert.equal(estimate.cans, 75.5 / 120);
  assert.equal(review.rows[0].cuts[0].edgeOutline?.length, 5);
  assert.deepEqual(review.rows[0].cuts[0].edgeOutline?.[0], review.rows[0].cuts[0].edgeOutline?.[4]);
  assert.equal(review.edgeSealant?.required, 1);
  assert.equal(review.edgeSealant?.sessions[0].run, 114);
  const split = saveRimAirSeal(saved, { ...front, edgeSeal: { ...edgeSeal, session: "Later" } });
  assert.equal(reviewRimAirSeals(split).edgeSealant?.required, 2);
  assert.match(guideMarkdown(saved), /75.5 in at 0.5 in fill depth/);
  assert.match(guideMarkdown(saved), /1 can of Great Stuff Gaps & Cracks/);
  assert.match(guideMarkdown(saved), /Offcut Foam A/);
  assert.match(answerBuildQuestion(saved, buildQuestion("How much sealant do I need for my rim joists?")!, []).detail,
    /saved trial coverage estimates 1 can/);
  const need = homeDepotPurchaseNeeds(saved).find(({ id }) => id === rimEdgeSealant.id);
  assert.equal(need?.required, 1);
  const included = addHomeDepotPurchaseNeed(saved, rimEdgeSealant.id);
  assert.strictEqual(addHomeDepotPurchaseNeed(included, rimEdgeSealant.id), included);
  assert.match(homeDepotShoppingList(included).text, /1 can.*Internet #312450325/);
  const sealed = review.rows[0].cuts[0].outline;
  const position = sealed[0].map((point, axis) => (point + sealed[2][axis]) / 2) as [number, number, number];
  const obstruction = part("Pipe backing", "stud", [1, 2, 2], position, project.steps[0].id, "Review");
  const blocked = { ...included, pieces: [...included.pieces, obstruction] };
  assert.equal(reviewRimAirSeals(blocked).edgeSealant?.required, null);
  assert.equal(homeDepotPurchaseNeeds(blocked).find(({ id }) => id === rimEdgeSealant.id)?.required, null);
  assert.doesNotMatch(homeDepotShoppingList(blocked).text, /312450325/);
  assert.match(homeDepotShoppingList(addSupply(blocked, rimEdgeSealant.id, 1, "Separate trial")).text, /1 can.*312450325/);
});

test("old rim plans retain their cuts and measured seal estimates stay in the product scope", () => {
  const project = floor();
  const input = measurements(project, "back");
  const old = { ...saveRimAirSeal(project, input), schemaVersion: 123 };
  const reopened = projectSchema.parse(old);
  assert.equal(reopened.schemaVersion, 124);
  assert.deepEqual(reopened.rimAirSeals, old.rimAirSeals);
  assert.equal(reviewRimAirSeals(reopened).edgeSealant, null);
  assert.equal(reviewRimAirSeals(reopened).rows[0].cuts[0].edgeOutline, undefined);
  const edgeSeal = { depth: 0.5, trialLengthPerCan: 120, session: "Bench trial" };
  assert.throws(() => saveRimAirSeal(project, { ...input, gap: 1.125, edgeSeal }), /gaps up to 1 in/);
  assert.throws(() => saveRimAirSeal(project, { ...input, edgeSeal: { ...edgeSeal, depth: 2.125 } }));
  assert.throws(() => saveRimAirSeal(project, { ...input, edgeSeal: { ...edgeSeal, trialLengthPerCan: 0 } }));
});
