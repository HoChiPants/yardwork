import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, part, projectSchema, type V3 } from "../src/model";
import {
  addRoundDuctOffcut, previewRoundDuct, releaseRoundDuctOffcut, removeRoundDuctOffcut,
  reserveRoundDuctOffcut, roundDuctPurchaseCount, roundDuctReviews, roundDuctTakeoff, saveRoundDuct,
} from "../src/roundDuct";
import { roundDuctStock } from "../src/roundDuctReference";
import type { RoundDuctInput } from "../src/roundDuctSchema";

function fixture() {
  const project = blank("Supply branch practice");
  const joist = part("Crossing joist", "hd-spf-2x6-8", [1.5, 5.5, 48], [0, 18, 0], project.steps[0].id, "Floor");
  project.pieces = [joist];
  const input: RoundDuctInput = {
    name: "Supply branch", start: [-36, 4, 8], end: [44, 4, 8], envelopeWidth: 8,
    stockLength: 60, startEngagement: 2, endEngagement: 2, jointOverlap: 1, cutLoss: 0.125,
  };
  return { project, joist, input };
}

test("straight duct cuts account for both collars, one pipe lap and measured cutting loss", () => {
  const { project, input } = fixture();
  const preview = previewRoundDuct(project, input);
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.geometry?.length, 80);
  assert.deepEqual(preview.geometry?.size, [8, 80, 8]);
  assert.deepEqual(preview.cuts, [
    { length: 60, whole: true, tail: 0 },
    { length: 25, whole: false, tail: 34.875 },
  ]);
  assert.equal(preview.jointCount, 3);
  const saved = saveRoundDuct(project, input);
  assert.deepEqual(saved, projectSchema.parse(JSON.parse(JSON.stringify(saved))));
  const guide = guideMarkdown(saved);
  assert.match(guide, /Round duct cutting and sealing/);
  assert.match(guide, /Pipe 2 · Cut to 25 in\. Estimated tail 34\.875 in/);
  assert.match(guide, /Seal 3 round joints/);
});

test("the last two sections share a cut when the outgoing lap would consume the final pipe", () => {
  const { project, input } = fixture();
  const preview = previewRoundDuct(project, { ...input, end: [23, 4, 8], startEngagement: 0, endEngagement: 4 });
  assert.deepEqual(preview.issues, []);
  assert.deepEqual(preview.cuts?.map(({ length }) => length), [30, 34]);
  assert.match(previewRoundDuct(project, { ...input, jointOverlap: 0 }).issues[0], /measured pipe-to-pipe overlap/);
  assert.match(previewRoundDuct(project, { ...input, end: input.start }).issues[0], /different collar tips/);
});

test("framing and other duct envelopes block a planned route and hold its linked purchase", () => {
  const { project, joist, input } = fixture();
  const crossing = { ...input, start: [-36, 18, 8] as V3, end: [44, 18, 8] as V3 };
  assert.deepEqual(previewRoundDuct(project, crossing).geometry?.hits.map(({ id }) => id), [joist.id]);
  assert.throws(() => saveRoundDuct(project, crossing), /Crossing joist/);
  const saved = saveRoundDuct(project, input);
  assert.match(previewRoundDuct(saved, { ...input, name: "Second branch" }).issues[0], /saved run “Supply branch”/);
  assert.equal(homeDepotPurchaseNeeds(saved).find(({ id }) => id === roundDuctStock.id)?.missing, 2);
  const purchased = addHomeDepotPurchaseNeed(saved, roundDuctStock.id);
  assert.equal(homeDepotShoppingList(purchased).items.find(({ productId }) => productId === roundDuctStock.internet)?.quantity, 2);

  const moved = { ...purchased, pieces: [{ ...purchased.pieces[0], position: [0, 4, 0] as V3 }] };
  assert.match(roundDuctReviews(moved)[0].issues[0], /Crossing joist/);
  assert.ok(validate(moved).some(({ title }) => title === "Review duct route · Supply branch"));
  assert.doesNotMatch(guideMarkdown(moved), /Pipe 2 · Cut to 25 in/);
  assert.equal(homeDepotShoppingList(moved).items.some(({ productId }) => productId === roundDuctStock.internet), false);
  assert.match(homeDepotHandoff(moved), /LINKED PURCHASES TO REVIEW[\s\S]*Master Flow 6 in × 5 ft round metal duct/);
});

test("the practice branch touches the boot envelope at the collar and detects a reversed run through it", () => {
  const sample = projectSchema.parse(JSON.parse(readFileSync(new URL("../public/examples/hvac/round-duct.yardwork.json", import.meta.url), "utf8")));
  const [run] = sample.roundDuctRuns!;
  assert.deepEqual(previewRoundDuct(sample, run.input, run.id).issues, []);
  const backwards = { ...run.input, end: [-21.375, 7.1485, 7.125] as V3 };
  assert.match(previewRoundDuct(sample, backwards, run.id).issues.join(" "), /crosses the register boot at P001/);
});

function ductReusePractice() {
  return projectSchema.parse(JSON.parse(readFileSync(new URL("../public/examples/hvac/duct-offcut-reuse.yardwork.json", import.meta.url), "utf8")));
}

test("a measured tail credits the finished cut and supplies a second run at the correct mating ends", () => {
  const sample = ductReusePractice();
  const tail = roundDuctTakeoff(sample).tails.find(({ run }) => run.input.name === "Straight supply branch")!;
  assert.equal(roundDuctPurchaseCount(sample), 3);
  const measured = addRoundDuctOffcut(sample, { label: "Branch tail", length: 34.75, ends: ["crimped", "plain"], tailKey: tail.revisionKey });
  assert.equal(roundDuctPurchaseCount(measured), 2);
  const target = roundDuctTakeoff(measured).targets.find(({ run }) => run.input.name === "Utility branch")!;
  const [offcut] = measured.roundDuctOffcuts!;
  assert.throws(() => reserveRoundDuctOffcut(measured, offcut.id, target.revisionKey, ["crimped", "crimped"]), /mating ends/);
  const assigned = reserveRoundDuctOffcut(measured, offcut.id, target.revisionKey, ["plain", "crimped"]);
  assert.deepEqual(assigned, projectSchema.parse(JSON.parse(JSON.stringify(assigned))));
  assert.equal(roundDuctPurchaseCount(assigned), 1);
  assert.deepEqual(roundDuctTakeoff(assigned).assigned.get(target.key)?.fit, { reversed: true, trim: "start" });
  assert.match(guideMarkdown(assigned), /Already cut to 25 in/);
  assert.match(guideMarkdown(assigned), /Use measured offcut Branch tail at 26 in. Reverse its recorded ends. Trim at the start/);
  assert.match(guideMarkdown(assigned), /Cut pool · Branch tail · 34\.75 in · crimped \/ plain ends. Recovered from Straight supply branch · Pipe 2. Reserved/);
  const purchased = addHomeDepotPurchaseNeed(assigned, roundDuctStock.id);
  assert.equal(homeDepotShoppingList(purchased).items.find(({ productId }) => productId === roundDuctStock.internet)?.quantity, 1);
});

test("moving the source run keeps the measured tail while reviewing new stock for the edited route", () => {
  const sample = ductReusePractice();
  const tail = roundDuctTakeoff(sample).tails.find(({ run }) => run.input.name === "Straight supply branch")!;
  const measured = addRoundDuctOffcut(sample, { label: "Branch tail", length: 34, ends: ["plain", "crimped"], tailKey: tail.revisionKey });
  const changed = saveRoundDuct(measured, { ...tail.run.input, start: [1.625, 7.1485, 7.125], end: [81.625, 7.1485, 7.125] }, tail.run.id);
  assert.equal(roundDuctPurchaseCount(changed), 3);
  assert.equal(changed.roundDuctOffcuts?.[0].length, 34);
  assert.match(guideMarkdown(changed), /Branch tail.*Available in the Cut pool/);
});

test("an endpoint edit holds a stale reservation and retiring a tail preserves its finished source cut", () => {
  const sample = ductReusePractice();
  const tail = roundDuctTakeoff(sample).tails.find(({ run }) => run.input.name === "Straight supply branch")!;
  const measured = addRoundDuctOffcut(sample, { label: "Branch tail", length: 34, ends: ["crimped", "plain"], tailKey: tail.revisionKey });
  const target = roundDuctTakeoff(measured).targets.find(({ run }) => run.input.name === "Utility branch")!;
  const [offcut] = measured.roundDuctOffcuts!;
  const reserved = reserveRoundDuctOffcut(measured, offcut.id, target.revisionKey, ["plain", "crimped"]);
  const edited = saveRoundDuct(reserved, { ...target.run.input, end: [37, 7.1485, 30] }, target.run.id);
  assert.equal(roundDuctPurchaseCount(edited), null);
  assert.ok(validate(edited).some(({ title }) => title === "Review duct offcut · Branch tail"));
  const released = releaseRoundDuctOffcut(edited, offcut.id);
  assert.equal(roundDuctPurchaseCount(released), 2);
  const retired = removeRoundDuctOffcut(released, offcut.id);
  assert.equal(retired.roundDuctOffcuts?.[0].retired, true);
  assert.equal(roundDuctPurchaseCount(retired), 2);
  assert.throws(() => addRoundDuctOffcut(retired, { label: "Duplicate tail", length: 25, ends: ["plain", "plain"], tailKey: tail.revisionKey }), /already recorded/);
});
