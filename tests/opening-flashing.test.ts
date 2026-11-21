import assert from "node:assert/strict";
import { test } from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { validate, guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, part, projectSchema, type Project, type V3 } from "../src/model";
import { checkOpeningFlashing, reviewOpeningFlashings, roughOpeningFrame, saveOpeningFlashing } from "../src/openingFlashing";
import { flashingKnife, flexWrap, windowFlashingTape } from "../src/openingFlashingReference";
import { findRetailerProduct } from "../src/retailerCatalog";
import { toolChecklist } from "../src/tools";
import type { OpeningFlashingMeasurements, WindowFlashingTape } from "../src/openingFlashingSchema";
import { composeRotation, rotate } from "../src/spatial";

function frame(project = blank(), x = 0, depth = 5.5) {
  const board = (name: string, width: number, height: number, dx: number, y: number) =>
    part(name, depth === 5.5 ? "two-six" : "stud", [width, height, depth], [x + dx, y, 0], project.steps[0].id, "Window framing");
  const sill = board("Rough sill", 36, 1.5, 0, 32.75);
  const jambA = board("Left jamb", 1.5, 48, -18.75, 57.5);
  const jambB = board("Right jamb", 1.5, 48, 18.75, 57.5);
  const head = board("Rough head", 39, 3, 0, 83);
  project.pieces.push(sill, jambA, jambB, head);
  return { project, members: { sill: sill.id, jambA: jambA.id, jambB: jambB.id, head: head.id } };
}

const measured: OpeningFlashingMeasurements = {
  unit: "window", exterior: "positive", sheathing: 0.5,
  frameDepth: 4.5, tapeWidth: 9, faceLap: 2.5, jambReturn: 6,
  pan: { kind: "back-dam", rise: 0.5 }, drainage: { kind: "gaps", centers: [33, 3, 13, 23] },
};

test("the installed frame depth, pan folds and exterior drainage are checked on actual geometry", () => {
  const { project, members } = frame();
  const checked = checkOpeningFlashing(project, members, measured);
  assert.deepEqual(checked.issues, []);
  assert.deepEqual([checked.frame.width, checked.frame.height, checked.frame.depth, checked.length, checked.bed], [36, 48, 5.5, 48, 6]);
  assert.deepEqual(checked.preview.drainage[0], [[-16, 33.5, 3.25], [-14, 33.5, 3.25]]);
  assert.deepEqual(checked.preview.interiorSeal[0], [-18, 33.5, -1.25]);
  assert.equal(checked.preview.interiorSeal.length, 5);
  const reverse = checkOpeningFlashing(project, members, { ...measured, exterior: "negative" });
  assert.deepEqual(reverse.preview.drainage[0], [[16, 33.5, -3.25], [14, 33.5, -3.25]]);
  assert.deepEqual(reverse.preview.interiorSeal[0], [-18, 33.5, 1.25]);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, jambReturn: 5 }), /too small/i);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, faceLap: 1.5 }), /too small/i);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, frameDepth: 5.125 }), /beyond the inside edge/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, pan: { kind: "slope" } }), /past the shared backing/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, drainage: { kind: "gaps", centers: [0, 13, 23, 36] } }), /fit entirely/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, drainage: { kind: "gaps", centers: [5, 14, 22, 31] } }), /within 4 in/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, drainage: { kind: "gaps", centers: [3, 33] } }), /6 to 12 in apart/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, drainage: { kind: "gaps", centers: [3, 5, 13, 23, 33] } }), /6 to 12 in apart/);
  assert.equal(checkOpeningFlashing(project, members, { ...measured, drainage: { kind: "open" } }).preview.drainage.length, 1);
  assert.throws(() => saveOpeningFlashing(project, { ...members, head: members.sill }, measured), /distinct/);
});

test("a common rigid move preserves reviewed cuts, and a resized opening returns to Checks", () => {
  const { project, members } = frame();
  const legacy = projectSchema.parse({ ...project, schemaVersion: 97 });
  const guide = generateBuildGuide(legacy);
  assert.ok(guideIsCurrent(guide));
  const saved = saveOpeningFlashing(guide, members, measured);
  assert.equal(guideIsCurrent(saved), false);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.pieces, guide.pieces);
  assert.deepEqual(reopened.openingFlashings, saved.openingFlashings);
  const turn: V3 = [0, 0.4, 0];
  const moved = {
    ...reopened,
    pieces: reopened.pieces.map((piece) => ({
      ...piece, rotation: composeRotation(turn, piece.rotation),
      position: rotate(piece.position, turn).map((value) => value + 15) as V3,
    })),
  };
  const review = reviewOpeningFlashings(moved);
  assert.deepEqual(review.rows[0].issues, []);
  assert.equal(review.groups[0].rolls[0].left, 852);
  const markdown = guideMarkdown(moved);
  assert.match(markdown, /## Opening flashing and drainage[\s\S]+Cut 4 ft[\s\S]+2 in drainage gaps[\s\S]+entire interior perimeter/);
  assert.equal(homeDepotPurchaseNeeds(moved).find(({ id }) => id === flexWrap.id)?.missing, 1);
  const answer = answerBuildQuestion(moved, buildQuestion("Review flashing for P001")!, []);
  assert.match(answer.rows?.[0].detail ?? "", /Cut one 4 ft/);
  assert.equal(answer.rows?.[0].link?.action.kind, "opening-flashing");

  const changed = { ...reopened, pieces: reopened.pieces.map((piece) =>
    piece.id === members.jambB ? { ...piece, position: [18.5, 57.5, 0] as V3 } : piece) };
  assert.match(reviewOpeningFlashings(changed).rows[0].issues[0], /framing changed/);
  assert.equal(homeDepotPurchaseNeeds(changed).some(({ id }) => id === flexWrap.id), false);
  assert.ok(validate(changed).find(({ openingFlashingSillId }) => openingFlashingSillId === members.sill));
  const missing = { ...changed, pieces: changed.pieces.filter(({ id }) => id !== members.head) };
  assert.match(reviewOpeningFlashings(missing).rows[0].issues[0], /active, aligned/);
  assert.throws(() => roughOpeningFrame({ ...project, pieces: project.pieces.map((piece) =>
    piece.id === members.head ? { ...piece, position: [5, 83, 0] as V3 } : piece) }, members), /reach both jamb/);
});

test("one continuous cut per opening is shared across rolls of the right width", () => {
  let project: Project = blank();
  for (let i = 0; i < 19; i++) {
    const { members } = frame(project, i * 60);
    project = saveOpeningFlashing(project, members, measured);
  }
  const { members } = frame(project, 1200, 3.5);
  project = saveOpeningFlashing(project, members, {
    ...measured, tapeWidth: 6, frameDepth: 2.75, faceLap: 2,
    pan: { kind: "slope" }, drainage: { kind: "open" },
  });
  const { groups } = reviewOpeningFlashings(project);
  assert.deepEqual(groups.map(({ width, rolls }) => [width, rolls.map(({ left }) => left)]), [[6, [852]], [9, [36, 852]]]);
  const bought = addHomeDepotPurchaseNeed(project, flexWrap.id);
  assert.deepEqual(bought.supplies.map(({ productId, quantity }) => [productId, quantity]), [[flexWrap.id, 2]]);
});

const jambHead: WindowFlashingTape = {
  tapeWidth: 4, pastApron: 1, pastJambs: 1,
  left: { inset: 0.25, flange: 1.5 }, right: { inset: 0.375, flange: 1.5 }, head: { inset: 0.25, flange: 1.5 },
};

test("window tape uses the measured flange and actual sill apron, mirrors exterior labels, and protects drainage", () => {
  const { project, members } = frame();
  const withTape = { ...measured, jambHead };
  const checked = checkOpeningFlashing(project, members, withTape);
  assert.deepEqual(checked.issues, []);
  assert.deepEqual(checked.jambHead?.cuts.map(({ length }) => length), [53.75, 53.75, 45.375]);
  const [left, , upper] = checked.preview.jambHead!;
  assert.deepEqual(left[0], [-21.75, 30, 3.25]);
  assert.equal(left[1][1], 83.75);
  assert.deepEqual(upper[0], [-22.75, 81.25, 3.25]);
  const reverse = checkOpeningFlashing(project, members, { ...withTape, exterior: "negative" });
  assert.deepEqual(reverse.preview.jambHead?.[0][0], [21.75, 30, -3.25]);
  assert.throws(() => saveOpeningFlashing(project, members, {
    ...withTape, jambHead: { ...jambHead, right: { inset: 0, flange: 4 } },
  }), /Right jamb tape must cover the flange/);
  assert.throws(() => saveOpeningFlashing(project, members, {
    ...withTape, jambHead: { ...jambHead, head: { inset: 0, flange: 3.5 } },
  }), /head tape must cover the jamb tops/);
  assert.throws(() => saveOpeningFlashing(project, members, {
    ...withTape, jambHead: { ...jambHead, left: { inset: 2.5, flange: 3 } },
  }), /planned sill drainage gap/);
  assert.throws(() => saveOpeningFlashing(project, members, {
    ...withTape, jambHead: { ...jambHead, right: { inset: 2, flange: 1.5 } },
  }), /Right jamb flange does not reach backing/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...withTape, unit: "door" }), /rectangular flanged window/);
});

test("only current jamb and head cuts count toward exact boxes, offcuts, and preparation tools", () => {
  const { project, members } = frame();
  const [tape4, tape6] = windowFlashingTape.products;
  const old = saveOpeningFlashing(projectSchema.parse({ ...project, schemaVersion: 99 }), members, measured);
  assert.deepEqual(reviewOpeningFlashings(old).tapeGroups, []);
  const saved = saveOpeningFlashing(old, members, { ...measured, jambHead });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.openingFlashings, saved.openingFlashings);
  const { tapeGroups } = reviewOpeningFlashings(reopened);
  assert.deepEqual(tapeGroups.map(({ product, rolls, boxes }) => [product.width, rolls[0].left, boxes]), [[4, 747.125, 1]]);
  const needs = homeDepotPurchaseNeeds(reopened);
  assert.equal(needs.find(({ id }) => id === tape4.id)?.missing, 1);
  assert.equal(needs.some(({ id }) => id === tape6.id), false);
  assert.equal(findRetailerProduct(tape4.id)?.profile.packCount, 4);
  const tool = toolChecklist(reopened).requirements.find(({ capability }) => capability === "trim-flashing-tape");
  assert.equal(tool?.sources[0].id, members.sill);
  assert.ok(findRetailerProduct(flashingKnife.id)?.capabilities.includes("trim-flashing-tape"));
  assert.match(guideMarkdown(reopened), /lap the jambs over the sill pan[\s\S]+box of four 75 ft rolls/i);
  const answer = answerBuildQuestion(reopened, buildQuestion("Review jamb and head flashing")!, []);
  assert.match(answer.rows?.[0].detail ?? "", /window tape cuts are left jamb 53.75 in/i);
  const moved = { ...reopened, pieces: reopened.pieces.filter(({ id }) => id !== members.head) };
  assert.equal(homeDepotPurchaseNeeds(moved).some(({ id }) => id === tape4.id), false);
  assert.equal(toolChecklist(moved).requirements.some(({ capability }) => capability === "trim-flashing-tape"), false);
});

test("rolls group by actual tape width and wrap into four-roll boxes after sharing leftover lengths", () => {
  let project: Project = blank();
  for (let i = 0; i < 27; i++) {
    const { members } = frame(project, i * 60);
    project = saveOpeningFlashing(project, members, { ...measured, jambHead });
  }
  const { members } = frame(project, 1800);
  project = saveOpeningFlashing(project, members, { ...measured, jambHead: { ...jambHead, tapeWidth: 6 } });
  const { tapeGroups } = reviewOpeningFlashings(project);
  assert.deepEqual(tapeGroups.map(({ product, rolls, boxes }) => [product.width, rolls.length, boxes]),
    [[4, 5, 2], [6, 1, 1]]);
  const withBox = addHomeDepotPurchaseNeed(project, windowFlashingTape.products[0].id);
  assert.equal(withBox.supplies.find(({ productId }) => productId === windowFlashingTape.products[0].id)?.quantity, 2);
  assert.equal(homeDepotPurchaseNeeds(withBox).some(({ id }) => id === windowFlashingTape.products[0].id), false);
});
