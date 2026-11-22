import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { defaultDrawerSideGap, drawerBoxOpening, drawerBoxSlideChoices, previewDrawerBox, type DrawerBoxInput } from "../src/drawerBoxes";
import { libertyBarPull } from "../src/cabinetPullReference";
import { homeDepotShoppingList } from "../src/handoff";
import { drawerSlideDemand, reviewDrawerSlide } from "../src/drawerSlides";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { motionSetup, runMotionTest } from "../src/mechanismMotion";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { previewProposalStock } from "../src/proposalStock";
import { rotate } from "../src/spatial";

function fixture(yaw = 0) {
  const base = blank("Drawer test");
  const turn: V3 = [0, yaw, 0];
  const panel = (name: string, side: number) =>
    part(name, "plywood", [0.75, 10, 18.25], rotate([side, 5, 0], turn), base.steps[0].id, "Cabinet", turn);
  const left = panel("Cabinet left", -8.375), right = panel("Cabinet right", 8.375);
  base.pieces.push(left, right);
  const input: DrawerBoxInput = {
    panelIds: [left.id, right.id], reverse: false, label: "Kitchen drawer", stockId: "hd-purebond-birch-703",
    bottomOffset: 0.25, height: 4, frontInset: 0, rearGap: 0.125, sideGap: defaultDrawerSideGap,
    finishFront: false, reveal: 0.125, depth: 18, slideId: "accuride-t46322g18",
  };
  return { base, input, turn, left, right };
}

test("a square drawer retains its actual dimensions, cut guide and slide travel in either direction on a rotated cabinet", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI / 3]) {
    const { base, input, turn, left, right } = fixture(yaw);
    for (const reverse of [false, true]) {
      const candidate = previewDrawerBox(base, { ...input, reverse });
      assert.equal(candidate.pieces.length, 5);
      assert.ok(Math.abs(candidate.width - 14.96875) < 1e-7);
      assert.ok(Math.abs(candidate.pieces[2].size[0] - 13.56275) < 1e-7);
      assert.deepEqual(candidate.closed.interferenceIds, []);
      assert.deepEqual(candidate.review.hits, []);
      assert.equal(candidate.review.playbackLimit(0, 18).travel, 18);
      assert.deepEqual(candidate.project.pieces.filter((piece) => input.panelIds.includes(piece.id)), [left, right]);
      const motion = motionSetup(candidate.project, candidate.plan);
      const heading = rotate([0, 0, reverse ? -1 : 1], turn);
      assert.ok(Math.hypot(...heading.map((n, i) => n - motion.mechanism.axis[i])) < 1e-7);
      assert.equal(candidate.plan.mechanism.kind === "slide" && candidate.plan.mechanism.drawerSlide?.cabinetLeft, reverse ? right.id : left.id);
      assert.equal(drawerSlideDemand(candidate.project, input.slideId).needed, 1);
      const project = projectSchema.parse(JSON.parse(JSON.stringify(candidate.project)));
      const guide = guideMarkdown(generateBuildGuide(project));
      assert.match(guide, /Dry-fit the five panels square/);
      assert.match(guide, /T46322G18.*Modeled dimensions match/s);
      assert.deepEqual(project.motionPlans, candidate.project.motionPlans);
    }
  }
});

test("measured clearances and front thickness change the available rail lengths and opening limit", () => {
  const { base, input } = fixture();
  const opening = drawerBoxOpening(base, input.panelIds);
  assert.deepEqual(drawerBoxSlideChoices(opening, 0, 0.125, 0).available.map(({ travel }) => travel), [14, 16, 18]);
  assert.deepEqual(drawerBoxSlideChoices(opening, 0, 0.125, 0.703).available.map(({ travel }) => travel), [14, 16]);
  assert.throws(() => previewDrawerBox(base, { ...input, finishFront: true }), /leaves .*box depth/);
  assert.throws(() => previewDrawerBox(base, { ...input, depth: 17.75 }), /closed rail/);
  assert.throws(() => previewDrawerBox(base, { ...input, sideGap: 0.4 }), /side space/);
  const front = previewDrawerBox(base, { ...input, finishFront: true, depth: 16, slideId: "accuride-t46322g16" });
  assert.deepEqual(front.pieces[5].size, [15.75, 4, 0.703]);
  assert.equal(front.review.hits.length, 0);

  const obstruction = part("Island", "plywood", [30, 8, 0.75], [0, 4, 20], base.steps[0].id, "Island");
  const result = previewDrawerBox({ ...base, pieces: [...base.pieces, obstruction] }, input);
  assert.deepEqual(result.closed.interferenceIds, []);
  const limit = result.review.playbackLimit(0, 18);
  assert.ok(limit.travel > 10 && limit.travel < 11.5);
  assert.ok(result.review.hits.some(({ obstacleId }) => obstacleId === obstruction.id));
  assert.throws(() => drawerBoxOpening(result.project, [result.pieces[0].id, result.pieces[1].id]), /fixed/);

  const cabinetBack = part("Back panel extending into the opening", "plywood", [16, 8, 0.75], [0, 4, -8.75], base.steps[0].id, "Cabinet");
  const occupied = previewDrawerBox({ ...base, pieces: [...base.pieces, cabinetBack] }, input);
  assert.ok(occupied.closed.interferenceIds.includes(cabinetBack.id));
});

test("a workspace question selects the exact modeled sides and the drawer can reuse existing plywood", () => {
  const { base, input } = fixture();
  const request = buildQuestion("Plan a drawer between P001 and P002")!;
  const answer = answerBuildQuestion(base, request, []);
  assert.match(answer.detail, /16 in wide/);
  assert.deepEqual(answer.link?.action, { kind: "drawer-box", panelIds: input.panelIds });
  assert.equal(answerBuildQuestion(base, buildQuestion("Fit a drawer between P001 and P999")!, []).link, undefined);
  const stock = addMeasuredOffcut(base, base.steps[0].id, input.stockId, [35, 19, 0.703], "Cabinet offcut");
  const box = previewDrawerBox(stock, input);
  const reuse = previewProposalStock(stock, box.project, []);
  assert.ok(reuse.plan?.assignments.length);
  assert.ok(reuse.plan?.assignments.every(({ partId }) => box.plan.memberIds.includes(partId)));
  assert.deepEqual(reuse.project.motionPlans, box.project.motionPlans);
  assert.match(guideMarkdown(reuse.project), /Recorded offcut cut order[\s\S]+Kitchen drawer/);
});

test("asymmetric spacer layers shift the drawer and provide fixed, stock-sized mounting faces", () => {
  const { base, input, turn, left, right } = fixture(Math.PI / 3);
  const withScrap = addMeasuredOffcut(base, base.steps[0].id, input.stockId, [22, 2.25, 0.703], "Narrow plywood strip");
  const asked = buildQuestion("Plan a drawer between P001 and P002 with two left spacer layers and one right spacer layer")!;
  assert.deepEqual(answerBuildQuestion(withScrap, asked, []).link?.action, {
    kind: "drawer-box", panelIds: input.panelIds, spacers: { left: 2, right: 1 },
  });
  const candidate = previewDrawerBox(withScrap, { ...input, spacers: { left: 2, right: 1 } });
  assert.ok(Math.abs(candidate.width - 12.85975) < 1e-7);
  assert.deepEqual(candidate.spacers.map(({ size }) => size), Array.from({ length: 3 }, () => [0.703, 2, 18]));
  assert.equal(candidate.plan.memberIds.length, 5);
  const railFit = reviewDrawerSlide(candidate.project, candidate.plan);
  assert.equal(railFit?.ready, true);
  assert.equal(railFit.setup.cabinetLeft, candidate.spacers[1].id);
  assert.equal(railFit.setup.cabinetRight, candidate.spacers[2].id);
  const baseline = previewDrawerBox(withScrap, input);
  const shift = candidate.pieces[4].position.map((n, i) => n - baseline.pieces[4].position[i]);
  assert.ok(Math.hypot(...shift.map((n, i) => n - rotate([0.3515, 0, 0], turn)[i])) < 1e-7);
  assert.deepEqual(candidate.closed.interferenceIds, []);
  assert.deepEqual(withScrap.pieces.slice(0, 2), [left, right]);
  const reuse = previewProposalStock(withScrap, candidate.project, []);
  const applied = reuse.plan?.assignments[0];
  assert.ok(applied && candidate.spacers.some(({ id }) => id === applied.partId));
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(reuse.project)));
  const guide = guideMarkdown(generateBuildGuide(saved));
  assert.match(guide, /Cut and fit drawer slide spacers/);
  assert.match(guide, /Recorded offcut cut order[\s\S]*spacer/);
  assert.equal(reviewDrawerSlide(saved, candidate.plan)?.ready, true);
});

test("spacer blocked by fixed wood or too many layers cannot be added", () => {
  const { base, input } = fixture();
  const block = part("Cabinet stop block", "plywood", [0.75, 3, 1], [-7.5, 2.5, 0], base.steps[0].id, "Cabinet");
  assert.throws(() => previewDrawerBox({ ...base, pieces: [...base.pieces, block] }, {
    ...input, spacers: { left: 1, right: 0 },
  }), /spacer 1.*Cabinet stop block/i);
  assert.throws(() => previewDrawerBox(base, { ...input, spacers: { left: 20, right: 5 } }), /too narrow/i);
  assert.throws(() => previewDrawerBox(base, { ...input, spacers: { left: 0.5, right: 0 } }), /whole spacer layers/i);
});

test("the spacer practice plan carries its checked stop and retained scrap dimensions", () => {
  const example = new URL("../public/examples/hinges/drawer-slide-spacers.yardwork.json", import.meta.url);
  const project = projectSchema.parse(JSON.parse(readFileSync(example, "utf8")));
  assert.equal(guideIsCurrent(project), true);
  const drawer = project.motionPlans!.find(({ mechanism }) => mechanism.kind === "slide")!;
  assert.equal(reviewDrawerSlide(project, drawer)?.ready, true);
  const { review } = runMotionTest(project, drawer, drawer.testSetup);
  assert.deepEqual(review?.playbackLimit(0, 100), { travel: 100 });
  assert.deepEqual(review?.playbackLimit(100, 0), { travel: 0 });
  assert.equal(project.pieces.filter(({ offcut }) => offcut).length, 2);
  assert.match(guideMarkdown(project), /Crosscut to 18 in · Rip to 2 in/);
});

test("a cabinet pull moves with the drawer, reserves its projection, and purchases one exact unit", () => {
  const { base, input, turn } = fixture(Math.PI / 3);
  const obstacle = part("Opposite cabinet face", "plywood", [20, 8, 0.75], rotate([0, 4, 15.875], turn),
    base.steps[0].id, "Opposite cabinet", turn);
  const project = { ...base, pieces: [...base.pieces, obstacle] };
  const without = previewDrawerBox(project, input);
  const candidate = previewDrawerBox(project, { ...input, barPull: true });
  assert.ok(candidate.pull && candidate.plan.memberIds.includes(candidate.pull.id));
  assert.equal(candidate.panels.length, 5);
  assert.equal(candidate.pieces.length, 6);
  assert.deepEqual(candidate.pull.size, [...libertyBarPull.size]);
  assert.deepEqual(candidate.closed.interferenceIds, []);
  const emptyTravel = without.review.playbackLimit(0, 18).travel;
  const fittedTravel = candidate.review.playbackLimit(0, 18).travel;
  assert.ok(Math.abs(emptyTravel - fittedTravel - 1.3) < 0.05, `${emptyTravel} to ${fittedTravel}`);
  assert.ok(candidate.review.hits.some(({ obstacleId }) => obstacleId === obstacle.id));
  const previewedPull = candidate.review.preview(2).pieces.find(({ id }) => id === candidate.pull?.id)!;
  assert.ok(Math.hypot(...previewedPull.position.map((v, axis) =>
    v - candidate.pull!.position[axis] - rotate([0, 0, 2], turn)[axis])) < 1e-6);

  const saved = projectSchema.parse(JSON.parse(JSON.stringify(candidate.project)));
  const [purchase] = homeDepotShoppingList(saved).items.filter(({ productId }) => productId === libertyBarPull.internet);
  assert.equal(purchase?.quantity, 1);
  const guide = guideMarkdown(generateBuildGuide(saved));
  assert.match(guide, /96 mm Liberty bar pull/);
  assert.match(guide, /pull's full clearance envelope/);
  assert.match(guide, /bar pull[\s\S]*Opposite cabinet face/);
  const requested = buildQuestion("Plan a drawer between P001 and P002 with two left spacer layers and a cabinet pull")!;
  const answer = answerBuildQuestion(base, requested, []);
  assert.deepEqual(answer.link?.action, {
    kind: "drawer-box", panelIds: input.panelIds, spacers: { left: 2, right: 0 }, barPull: true,
  });
});

test("a modeled pull fits either visible front and remains out of the panel cuts", () => {
  const { base, input } = fixture();
  const back = previewDrawerBox(base, {
    ...input, reverse: true, finishFront: true, barPull: true,
    depth: 16, slideId: "accuride-t46322g16",
  });
  assert.equal(back.panels.length, 6);
  assert.match(back.pullScrewReview ?? "", /front stack measures 1.406 in.*supplied 1 in screws/);
  assert.ok(back.pull);
  assert.ok(Math.abs(back.pull.position[2] + 9.125 + 1.3 / 2) < 1e-7);
  assert.deepEqual(back.closed.interferenceIds, []);
  const narrow = { ...base, pieces: base.pieces.map((piece) => ({
    ...piece, position: [piece.position[0] * 0.39, ...piece.position.slice(1)] as V3,
  })) };
  assert.throws(() => previewDrawerBox(narrow, { ...input, barPull: true }), /wider or taller drawer front/);
});
