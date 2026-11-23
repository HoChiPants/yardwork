import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { cabinetDoorGuide, cabinetDoorTestSummary, previewCabinetDoors, previewCabinetPullRevision, reviewCabinetDoors } from "../src/cabinetDoors";
import { cabinetDoorStock, defaultCabinetDoorPull, type CabinetDoorsInput } from "../src/cabinetDoorsSchema";
import { libertyBarPull } from "../src/cabinetPullReference";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema } from "../src/model";
import { saveMotionTestScenario } from "../src/mechanismMotion";
import { proposalMotionChanges } from "../src/motionImpact";
import { rotate } from "../src/spatial";

test("paired cabinet pulls move with their doors and a relocation clears a pull-only obstruction", () => {
  const source = blank("Cabinet pull clearance");
  const task = source.steps[0].id;
  const frame = [
    part("Left stile", "hd-pine-1x4", [3.5, 30, 0.75], [-14.75, 15, 0], task, "Face frame"),
    part("Right stile", "hd-pine-1x4", [3.5, 30, 0.75], [14.75, 15, 0], task, "Face frame"),
    part("Bottom rail", "hd-pine-1x4", [26, 3.5, 0.75], [0, 1.75, 0], task, "Face frame"),
    part("Top rail", "hd-pine-1x4", [26, 3.5, 0.75], [0, 28.25, 0], task, "Face frame"),
  ] as const;
  const lip = part("Adjacent lip", "plywood", [0.5, 2, 0.5], [-13.8, 7.625, 11.9], task, "Room");
  source.pieces = [...frame, lip];
  const input: CabinetDoorsInput = {
    frameIds: [frame[0].id, frame[1].id, frame[2].id, frame[3].id],
    leaves: "pair", stock: cabinetDoorStock[0], outerGap: 0.125, centerGap: 0.125, angle: 90,
    pinTowardFrame: 0.0625, pinForward: 0.125, hingesPerLeaf: 2, hingeEnd: 2, hinge: "measured",
  };
  const bare = previewCabinetDoors(source, input);
  assert.ok(bare.tests.every(({ result }) => !cabinetDoorTestSummary(result).review));
  const retrofit = previewCabinetPullRevision(bare.project, bare.section.id, defaultCabinetDoorPull);
  assert.equal(retrofit.pulls.length, 2);
  assert.deepEqual(retrofit.plans.map(({ id }) => id), bare.plans.map(({ id }) => id));
  const fitted = previewCabinetDoors(source, { ...input, pull: defaultCabinetDoorPull });
  assert.equal(fitted.issue, undefined);
  const [left, right] = fitted.pulls;
  assert.equal(left.position[0], -right.position[0]);
  assert.ok(rotate([1, 0, 0], left.rotation)[1] > 0.999);
  assert.deepEqual(fitted.plans.map(({ memberIds }) => memberIds[1]), [left.id, right.id]);
  const together = fitted.tests[2].result;
  assert.match(cabinetDoorTestSummary(together).detail, /possible contact at Adjacent lip/);
  assert.ok(together.review?.hits.some(({ movingId, obstacleId, kind }) =>
    movingId === left.id && obstacleId === lip.id && kind === "envelope"));

  assert.throws(() => previewCabinetDoors(source, { ...input, pull: { ...defaultCabinetDoorPull, height: 1 } }), /pull toward the middle/);
  const revised = previewCabinetDoors(source, { ...input, pull: { ...defaultCabinetDoorPull, inset: 4 } });
  assert.ok(revised.tests.every(({ result }) => !cabinetDoorTestSummary(result).review));
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(revised.project)));
  const section = saved.sections.at(-1)!;
  assert.match(cabinetDoorGuide(saved, section), /96 mm Liberty pull.*4 in from the finished free edge/);
  const purchases = homeDepotShoppingList(saved).text;
  assert.match(purchases, new RegExp(`2 each.*Liberty Solid Bar cabinet pull.*Internet #${libertyBarPull.internet}`));
  const changed = { ...saved, pieces: saved.pieces.filter(({ id }) => id !== revised.pulls[0].id) };
  assert.match(reviewCabinetDoors(changed, section).issue ?? "", /pulls or their positions changed/);
  assert.doesNotMatch(cabinetDoorGuide(changed, section), /Transfer the two holes/);
  assert.deepEqual(buildQuestion("Fit two cabinet doors with matching pulls."), { kind: "cabinet-doors", leaves: "pair", barPull: true });
});

test("revising saved cabinet pulls keeps physical cuts, materials and named clearances", () => {
  const raw = readFileSync(new URL("../public/examples/interior/cabinet-doors-with-pulls.yardwork.json", import.meta.url), "utf8");
  const project = projectSchema.parse(JSON.parse(raw));
  const section = project.sections.find(({ cabinetDoors }) => cabinetDoors)!;
  const leftPull = project.pieces.find(({ designRole }) => designRole === "cabinet-inset-pull-left")!;
  const lip = project.pieces.find(({ name }) => name === "Existing adjacent cabinet lip")!;
  const plan = project.motionPlans![0];
  const custom = saveMotionTestScenario(project, plan.id, "Check clearance at the lip", {
    held: [], clearance: { movingId: leftPull.id, otherId: lip.id, minimum: 0.0625 },
  }).project;
  const inset = 1.5;
  const question = buildQuestion("Move the cabinet pulls to 1.5 in from the finished free edge.")!;
  assert.deepEqual(question, { kind: "cabinet-pulls", inset });
  assert.deepEqual(answerBuildQuestion(custom, question, []).link?.action, { kind: "cabinet-pulls", sectionId: section.id, inset });

  const revised = previewCabinetPullRevision(custom, section.id, { ...section.cabinetDoors!.pull!, inset });
  assert.deepEqual(revised.project.motionPlans, custom.motionPlans);
  assert.deepEqual(revised.project.edgeBanding, custom.edgeBanding);
  assert.deepEqual(revised.project.pieces.filter(({ material }) => material !== libertyBarPull.id),
    custom.pieces.filter(({ material }) => material !== libertyBarPull.id));
  assert.deepEqual(revised.project.onHandCutSources, custom.onHandCutSources);
  assert.deepEqual(revised.project.history, custom.history);
  assert.deepEqual(revised.section.pieceIds, section.pieceIds);
  assert.ok(revised.pulls.some(({ id }) => id === leftPull.id));
  assert.ok(proposalMotionChanges(custom, revised.project).some(({ label }) => label.includes("Check clearance at the lip")));
  assert.match(cabinetDoorGuide(revised.project, revised.section), /mark the midpoint 1.5 in/);
  assert.equal(section.cabinetDoors!.pull!.inset, 4);
});
