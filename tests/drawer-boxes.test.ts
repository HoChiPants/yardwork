import assert from "node:assert/strict";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { defaultDrawerSideGap, drawerBoxOpening, drawerBoxSlideChoices, previewDrawerBox, type DrawerBoxInput } from "../src/drawerBoxes";
import { drawerSlideDemand } from "../src/drawerSlides";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { motionSetup } from "../src/mechanismMotion";
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
