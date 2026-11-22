import assert from "node:assert/strict";
import test from "node:test";
import { guideMarkdown } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { projectSchema } from "../src/model";
import { weatherWatch } from "../src/roofValleyReference";
import { modeledRoofValleys, reviewRoofValleys, saveRoofValley } from "../src/roofValleys";
import { valleyFixture } from "./fixtures/roofValley";

test("a continuous sloped valley yields full-width strips, end laps and remaining stock", () => {
  const { roof, input } = valleyFixture();
  const [modeled, ...extra] = modeledRoofValleys(roof);
  assert.deepEqual(extra, []);
  assert.equal(modeled.panels.length, 8);
  assert.ok(Math.abs(modeled.length - 312) < 1e-6);
  assert.ok(modeled.end[1] > modeled.start[1]);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(saveRoofValley(roof, input))));
  const { rows, rolls, scraps } = reviewRoofValleys(saved);
  assert.deepEqual(rows[0].strips.map(({ from, length, cover }) => [from, length, cover]), [[0, 168, 168], [162, 168, 168]]);
  assert.deepEqual([rolls.length, rolls[0].left, scraps[0].left], [1, 432, 12]);
  const guide = guideMarkdown(saved);
  assert.match(guide, /strip 2 · cut 14 ft, start 162 in up from the eave/);
  assert.match(guide, /Offcut Leftover A .*1 ft left with intact backing/);
});

test("a ridge, horizontal joint or discontinuous seam cannot produce approved cuts", () => {
  for (const options of [{ ridge: true }, { horizontal: true }]) {
    const { roof, input } = valleyFixture(options);
    assert.deepEqual(modeledRoofValleys(roof), []);
    assert.throws(() => saveRoofValley(roof, input), /no longer form/);
  }
  const { roof, input } = valleyFixture({ gap: 2 });
  assert.match(modeledRoofValleys(roof)[0].issue ?? "", /gap/);
  assert.throws(() => saveRoofValley(roof, input), /gap/);
});

test("a short seam uses one 10 ft handling blank and retains the rest of the roll", () => {
  const { roof, input } = valleyFixture({ sections: 1 });
  assert.throws(() => saveRoofValley(roof, { ...input, length: 80 }), /differs from the modeled/);
  assert.throws(() => saveRoofValley(roof, { ...input, lap: 5 }));
  const saved = saveRoofValley(roof, { ...input, offcut: undefined });
  const review = reviewRoofValleys(saved);
  const [{ length, cover }] = review.rows[0].strips;
  assert.deepEqual([length, cover, review.rolls[0].left], [120, 96, 480]);
  assert.match(guideMarkdown(saved), /Trim to 8 ft for the measured finish/);
});

test("a measured short offcut changes the strip lengths while retaining the uphill lap", () => {
  const { roof, input } = valleyFixture();
  const saved = saveRoofValley(roof, { ...input, offcut: { ...input.offcut!, length: 144 } });
  const { rows, rolls, scraps } = reviewRoofValleys(saved);
  assert.deepEqual(rows[0].strips.map(({ from, length, cover }) => [from, length, cover]), [[0, 144, 144], [138, 192, 192]]);
  assert.equal(scraps[0].left, 0);
  assert.equal(rolls[0].left, 408);
});

test("a moved roof panel holds linked stock from the Home Depot list", () => {
  const { roof, input } = valleyFixture();
  const saved = saveRoofValley(roof, input);
  const request = homeDepotPurchaseNeeds(saved).find(({ id }) => id === weatherWatch.id);
  assert.equal(request?.missing, 1);
  const purchased = addHomeDepotPurchaseNeed(saved, request!.id);
  assert.match(homeDepotShoppingList(purchased).text, /100083257/);
  const moved = { ...purchased, pieces: purchased.pieces.map((piece, i) => i === 0
    ? { ...piece, position: [piece.position[0], piece.position[1] + 2, piece.position[2]] as typeof piece.position }
    : piece) };
  assert.equal(reviewRoofValleys(moved).needsReview, true);
  assert.doesNotMatch(homeDepotShoppingList(moved).text, /100083257/);
});
