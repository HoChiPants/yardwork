import assert from "node:assert/strict";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { blank, part, type Project, type V3 } from "../src/model";
import { independentlyMovingContact, inspectMotionStop, saveMotionPlan, runMotionTest, motionReviewPasses } from "../src/mechanismMotion";
import { auditMotionInteractions, heldInteractionTest } from "../src/motionInteractionAudit";
import { stackedCabinetDoors } from "./helpers/stackedCabinetDoors";

function crossing(frontStart = -10, frontTravel = 20) {
  let project = blank("Crossing pull-outs");
  function slide(name: string, position: V3, axis: V3, travel: number) {
    const body = part(name, "plywood", [2, 2, 2], position, project.steps[0].id, "Pull-outs");
    project = { ...project, pieces: [...project.pieces, body] };
    const saved = saveMotionPlan(project, { label: name, memberIds: [body.id], mechanism: { kind: "slide", axis, travel } });
    project = saved.project;
    return { plan: saved.plan, body };
  }
  const side = slide("Side drawer", [-6, 10, 0], [1, 0, 0], 12);
  const front = slide("Front tray", [0, 10, frontStart], [0, 0, 1], frontTravel);
  slide("Remote cabinet", [200, 10, 0], [0, 0, 1], 10);
  return { project, side, front };
}

test("screening finds a mid-travel hit even when each motion clears on its own", async () => {
  const { project, side, front } = crossing();
  for (const plan of [side.plan, front.plan]) assert.ok(motionReviewPasses(runMotionTest(project, plan).review!));
  const snapshot = JSON.stringify(project);
  const progress: number[][] = [];
  const report = await auditMotionInteractions(project, { onProgress: (done, total) => progress.push([done, total]) });
  assert.equal(report.separated, 2);
  assert.deepEqual(report.unavailable, []);
  assert.deepEqual(progress, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]);
  const [{ selected, companion, paths }] = report.pairs;
  assert.equal(report.pairs.length, 1);
  assert.equal(selected.id, side.plan.id);
  assert.equal(companion.id, front.plan.id);
  assert.equal(paths[0].clear, true);
  assert.equal(paths[1].clear, true);
  assert.equal(paths[2].clear, false);
  assert.match(paths[2].issue ?? "", /Opening stop.+Contact/);
  assert.deepEqual(answerBuildQuestion(project, buildQuestion("Which doors or drawers collide?")!, []).link?.action,
    { kind: "motion-setup", audit: true });
  assert.equal(JSON.stringify(project), snapshot);
});

test("independent openings find a collision missed by both orders and synchronized movement", async () => {
  const { project, side, front } = crossing(-19, 24);
  const [{ paths, independent }] = (await auditMotionInteractions(project)).pairs;
  assert.ok(paths.every(({ clear }) => clear));
  assert.equal(independent.status, "solid");
  if (independent.status !== "solid") return;
  assert.equal(independent.movingId, side.body.id);
  assert.equal(independent.obstacleId, front.body.id);
  assert.notEqual(independent.selectedTravel / 12, independent.companionTravel / 24);
  const setup = { held: [{ motionId: front.plan.id, percent: independent.companionTravel / 24 * 100 }] };
  const pose = runMotionTest(project, side.plan, setup).review!.preview(independent.selectedTravel);
  assert.deepEqual(new Set(pose.interferenceIds), new Set([side.body.id, front.body.id]));
});

test("a partly-open question resolves two current motions and offers checked opening orders", () => {
  const { project, side, front } = crossing(-19, 24);
  const input = "Could my side drawer hit the front tray if one is only partly open?";
  assert.deepEqual(buildQuestion(input), { kind: "independent-motion", subjects: ["my side drawer", "the front tray"] });
  const quoted = buildQuestion('Check “Side drawer” and “Front tray” at different openings');
  assert.deepEqual(quoted, { kind: "independent-motion", subjects: ['"Side drawer"', '"Front tray"'] });
  const labels = buildQuestion("Will P1 hit P2 with both partly open?");
  const result = answerBuildQuestion(project, labels!, []);
  assert.match(result.detail, /Side drawer at 6 in and Front tray at 18 in/);
  assert.match(result.rows?.[0].detail ?? "", /Side drawer first.+Front tray first/);
  assert.deepEqual(result.link?.action, { kind: "independent-motion", selectedId: side.plan.id, companionId: front.plan.id });

  const alternate = saveMotionPlan(project, { label: "Another side drawer", memberIds: [side.body.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 10 } }).project;
  const ambiguous = answerBuildQuestion(alternate, buildQuestion("Will P001 hit the front tray at different openings?")!, []);
  assert.match(ambiguous.detail, /More than one pair matches/);
  assert.equal(ambiguous.link, undefined);
  assert.equal(buildQuestion("Will my drawer hit the cabinet door if the door is halfway open?")?.kind === "independent-motion", false);
});

test("independent travel can rule out contact between touching sweep bounds", async () => {
  const { project, front } = crossing();
  const shifted = { ...project, pieces: project.pieces.map((piece) => piece.id === front.body.id
    ? { ...piece, position: [0, 12, -10] as V3 } : piece) };
  const [{ independent }] = (await auditMotionInteractions(shifted)).pairs;
  assert.deepEqual(independent, { status: "clear" });
});

test("a non-contacting pair can fail a minimum gap at independent hinge openings", async () => {
  const { project, lower, upper, selected, companion } = stackedCabinetDoors();
  assert.deepEqual(independentlyMovingContact(project, selected, companion), { status: "clear" });
  assert.deepEqual(independentlyMovingContact(project, selected, companion, undefined, 1 / 16), { status: "clear" });
  const report = await auditMotionInteractions(project, { minimum: 1 / 8 });
  assert.equal(report.separated, 0);
  const [{ independent }] = report.pairs;
  assert.equal(independent.status, "short");
  if (independent.status !== "short") assert.fail("Expected a solid gap finding.");
  assert.equal(independent.gap, 1 / 16);
  const test = heldInteractionTest(project, selected, companion, independent)!;
  assert.equal(test.setup.clearance?.minimum, 1 / 8);
  assert.equal(test.setup.held[0].percent, 50);
  const pose = inspectMotionStop(test.result.review!, test.inspection.stop, { planId: selected.id, setup: test.setup });
  assert.deepEqual(pose.focusPair, [lower.id, upper.id]);
  assert.ok(pose.gapEndpoints);
  assert.deepEqual(pose.interferenceIds, []);

  const question = buildQuestion('Check a 1/8 in gap between "Lower door" and "Upper door" at different openings.');
  assert.equal(question?.kind, "independent-motion");
  const answer = answerBuildQuestion(project, question!, []);
  assert.match(answer.detail, /0\.0625 in.+required 0\.125 in/);
  assert.equal(answer.link?.label, "Inspect gap");
  assert.deepEqual(answer.rows, undefined);
});

test("shared moving parts, missing geometry, and cancelled scans stay distinct", async () => {
  const { project, side, front } = crossing();
  const alternate = saveMotionPlan(project, { label: "Alternate side drawer", memberIds: [side.body.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 10 } }).project;
  const missing: Project = { ...alternate, pieces: alternate.pieces.filter(({ id }) => id !== front.body.id) };
  const report = await auditMotionInteractions(missing);
  assert.deepEqual(report.unavailable.map(({ plan }) => plan.id), [front.plan.id]);
  assert.equal(report.shared, 1);
  assert.equal(report.pairs.length, 0);
  const controller = new AbortController();
  await assert.rejects(auditMotionInteractions(project, {
    signal: controller.signal,
    onProgress: (done) => { if (done === 1) controller.abort(); },
  }), { name: "AbortError" });
});
