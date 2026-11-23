import { openingFoam, openingSilicone } from "../src/openingAirSealReference";
import type { OpeningAirSeal } from "../src/openingAirSeal";
import { trimBackerRodCutPlan } from "../src/woodJointDecisions";
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
import { windowSealOrderStudy } from "./helpers/windowSealOrderStudy";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { windowFlashingPhaseKinds, windowFlashingSchedule } from "../src/windowFlashingGuide";

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

test("window flashing phases follow the framing and warn only on lining that masks the interior seal", () => {
  assert.deepEqual(windowFlashingSchedule(windowSealOrderStudy(false).project)[0].covers, []);
  const { project, members, interior, exterior, target } = windowSealOrderStudy(true, Math.PI / 6);
  assert.deepEqual(windowFlashingSchedule(project)[0].covers, [{ id: interior.id, name: interior.name, pieceIds: [target.id] }]);
  const [record] = project.openingFlashings!;
  const opposite = saveOpeningFlashing(project, members, { ...record.measurements, exterior: "negative" });
  assert.deepEqual(windowFlashingSchedule(opposite)[0].covers, []);
  const guide = generateBuildGuide(project);
  const [pan, fitted, seal] = windowFlashingPhaseKinds.map((kind) => guide.steps.find(({ generated }) =>
    generated?.kind === kind && generated.planId === members.sill)!);
  const coverId = guide.pieces.find(({ id }) => id === target.id)!.stepId;
  const cover = guide.steps.find(({ id }) => id === coverId)!;
  const sequence = [pan, fitted, seal, cover].map((phase) => guide.steps.indexOf(phase));
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b));
  assert.deepEqual(reviewAssemblyOrder(guide), []);
  assert.match(pan.notes, /Cut 4 ft from 9 in FlexWrap/);
  assert.match(fitted.notes, /drainage gaps centered at 3 in, 13 in, 23 in, 33 in/);
  assert.match(seal.notes, /Keep access at the marked perimeter before installing Drywall · back/);
  assert.ok(!seal.notes.includes(exterior.name));
  assert.ok(guideIsCurrent(guide));

  const early = { ...guide, steps: guide.steps.filter((phase) => phase !== cover)
    .flatMap((phase) => phase === seal ? [cover, seal] : [phase]) };
  assert.deepEqual(reviewAssemblyOrder(early).map(({ current, prerequisites }) =>
    [current.step.id, ...prerequisites.map(({ step }) => step.id)]), [[cover.id, seal.id]]);
  const answer = answerBuildQuestion(early, buildQuestion("When should I seal the window?")!, []);
  assert.deepEqual(answer.rows?.[0].link?.action, { kind: "guide-step", id: cover.id });
  const old = projectSchema.parse({ ...guide, schemaVersion: 171, steps: guide.steps.filter((phase) => ![pan, fitted, seal].includes(phase)) });
  assert.equal(guideIsCurrent(old), false);
  assert.equal(guideIsCurrent(generateBuildGuide(old)), true);
});

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

const foam: OpeningAirSeal = {
  method: "foam", left: 0.375, right: 0.375, head: 0.375, sill: 0.375,
  availableDepth: 1, sealDepth: 0.5,
};

test("the interior seal moves to the measured gap and keeps the exterior drain and stock independent", () => {
  const { project, members } = frame();
  const legacy = saveOpeningFlashing(projectSchema.parse({ ...project, schemaVersion: 100 }), members, measured);
  assert.deepEqual(reviewOpeningFlashings(legacy).airSealBatches, []);
  const checked = checkOpeningFlashing(project, members, { ...measured, airSeal: foam });
  assert.deepEqual(checked.issues, []);
  assert.equal(checked.airSeal?.length, 166.5);
  assert.equal(checked.airSeal?.use, 166.5 * 0.375 * 0.5 / openingFoam.coverage);
  assert.deepEqual(checked.preview.interiorSeal[0], [-17.8125, 33.6875, -1.25]);
  assert.deepEqual(checked.preview.drainage[0], checkOpeningFlashing(project, members, measured).preview.drainage[0]);
  const reversed = checkOpeningFlashing(project, members, { ...measured, exterior: "negative", airSeal: { ...foam, left: 0.5 } });
  assert.deepEqual(reversed.preview.interiorSeal[0], [17.75, 33.6875, 1.25]);
  const saved = saveOpeningFlashing(project, members, { ...measured, airSeal: foam });
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(saved))).openingFlashings, saved.openingFlashings);
  const need = homeDepotPurchaseNeeds(saved).find(({ id }) => id === openingFoam.id);
  assert.equal(need?.missing, 1);
  assert.match(guideMarkdown(saved), /166.5 in of interior air seal[\s\S]+Smart Dispenser[\s\S]+reuse within 30 days/);
  const answer = answerBuildQuestion(saved, buildQuestion("Review the interior air seal")!, []);
  assert.match(answer.rows?.[0].detail ?? "", /166.5 in of interior air seal/);
  const moved = { ...saved, pieces: saved.pieces.filter(({ id }) => id !== members.jambA) };
  assert.equal(reviewOpeningFlashings(moved).airSealBatches.length, 0);
  assert.ok(validate(moved).some(({ openingFlashingSillId }) => openingFlashingSillId === members.sill));
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, airSeal: { ...foam, left: 1.25 } }), /Left jamb is wider/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, airSeal: { ...foam, availableDepth: 0.25 } }), /smallest measured cavity/);
  assert.throws(() => saveOpeningFlashing(project, members, {
    ...measured, frameDepth: 0.5, airSeal: foam,
  }), /back from the exterior drainage plane/);
});

test("rod sizes follow each measured side and silicone is estimated from the bounded bead over the rod", () => {
  const { project, members } = frame();
  const airSeal: OpeningAirSeal = { ...foam, method: "silicone", left: 0.25, sill: 0.25, sealDepth: 0.25 };
  const checked = checkOpeningFlashing(project, members, { ...measured, airSeal });
  const run = checked.airSeal!;
  assert.deepEqual(run.issues, []);
  assert.deepEqual(run.edges.map(({ rod, length }) => [rod?.model, length]), [
    ["C21H", 47.6875], ["C22H", 47.6875], ["C22H", 35.6875], ["C21H", 35.6875],
  ]);
  assert.equal(run.use, (47.6875 + 35.6875) * (0.25 + 0.375) * 0.25 / openingSilicone.coverage);
  const saved = saveOpeningFlashing(project, members, { ...measured, airSeal });
  assert.deepEqual(trimBackerRodCutPlan(saved).map(({ product, rolls }) => [product.model, rolls[0].left]),
    [["C21H", 156.625], ["C22H", 156.625]]);
  for (const id of [openingSilicone.id, "frost-king-c21h", "frost-king-c22h"])
    assert.equal(homeDepotPurchaseNeeds(saved).find((row) => row.id === id)?.missing, 1);
  assert.match(guideMarkdown(saved), /## Backer rod cut plan[\s\S]+156.625 in/);
  assert.ok(toolChecklist(saved).requirements.some(({ capability }) => capability === "apply-window-sealant"));
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, airSeal: { ...airSeal, sealDepth: 0.125 } }), /sealant above the rod/);
  const wider = checkOpeningFlashing(project, members, { ...measured, airSeal: { ...airSeal, head: 0.5 } });
  assert.deepEqual(wider.airSeal?.issues, []);
  assert.equal(wider.airSeal?.edges.find(({ edge }) => edge === "Head")?.rod?.model, "C23H");
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, airSeal: { ...airSeal, head: 0.501 } }), /wider than this silicone option/);
  assert.throws(() => saveOpeningFlashing(project, members, { ...measured, airSeal: { ...airSeal, availableDepth: 0.625 } }), /Right jamb needs room/);
});

test("sealant stock rounds after grouping matching work sessions, not per opening", () => {
  const a = frame();
  const b = frame(a.project, 60);
  const c = frame(b.project, 120);
  let project = saveOpeningFlashing(c.project, a.members, { ...measured, airSeal: { ...foam, batch: "Trim day" } });
  project = saveOpeningFlashing(project, b.members, { ...measured, airSeal: { ...foam, batch: "trim day" } });
  project = saveOpeningFlashing(project, c.members, { ...measured, airSeal: { ...foam, batch: "Later" } });
  assert.deepEqual(reviewOpeningFlashings(project).airSealBatches.map(({ label, units }) => [label, units]), [["Trim day", 1], ["Later", 1]]);
  assert.equal(homeDepotPurchaseNeeds(project).find(({ id }) => id === openingFoam.id)?.missing, 2);
});
