import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { part, projectSchema } from "../src/model";
import { blankProjectCode } from "../src/projectCodeSchema";
import { removeWaterRun } from "../src/wallWater";
import { removeWaterFitting } from "../src/waterFittings";
import { blankWaterPressure, type WaterPressureInput } from "../src/waterPressureSchema";
import { previewWaterPressure, reviewWaterPressure, saveWaterPressureTest, waterPressureScope } from "../src/waterPressure";

function kitchen() {
  const project = projectSchema.parse(JSON.parse(readFileSync(new URL(
    "../public/examples/plumbing/kitchen-tee.yardwork.json", import.meta.url,
  ), "utf8")));
  const root = project.waterRuns!.find(({ name }) => name === "Kitchen main")!;
  return {
    project: {
      ...project,
      projectCode: {
        ...blankProjectCode(), region: "utah" as const, projectDate: "2026-11-21", codePath: "irc" as const,
        work: "existing" as const, trades: ["plumbing" as const], buildingAuthority: "Sample authority",
        authorityBasis: "Simulated residential path for this test fixture.",
      },
    },
    root,
  };
}

function measured(rootRunId: string): WaterPressureInput {
  return {
    ...blankWaterPressure(rootRunId, "Island rough-in observation"), testedOn: "2026-11-21",
    waterSource: "potable", boundaryConfirmed: "yes", boundaryNotes: "Simulated isolation at all three ends.",
    workingPsi: 60, setupLimitPsi: 160, temperatureF: 68,
    gaugeReference: "Sample gauge G1", gaugeScalePsi: 200, gaugeLimitPsi: 200, gaugeIncrementPsi: 1,
    peakPsi: 150, firstHold: { psi: 150, minutes: 30 }, reducedHold: { psi: 30, minutes: 10 },
    secondHold: { psi: 150, minutes: 30 }, secondHoldEndPsi: 149,
    finalHold: { startPsi: 149, lowestPsi: 149, endPsi: 149, minutes: 60 },
    addedWater: "no", leakage: "no",
  };
}

test("a water test binds all ports of a reducing tee and exports separate code and manufacturer findings", () => {
  const { project, root } = kitchen();
  const draft = measured(root.id);
  const saved = saveWaterPressureTest(project, draft);
  assert.equal(project.waterPressureTests, undefined);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const record = reopened.waterPressureTests![0];
  assert.equal(record.scope.runs.length, 3);
  assert.equal(record.scope.openEnds.length, 3);
  assert.equal(new Set(record.scope.openEnds.map(({ runId }) => runId)).size, 3);
  assert.equal(record.scope.fittings[0].model, "UR412A");
  const island = record.scope.runs.find(({ name }) => name === "Island feed")!;
  assert.equal(waterPressureScope(reopened, island.id).scope?.geometry, record.scope.geometry);
  const review = reviewWaterPressure(reopened, record);
  assert.equal(review.stale, false);
  assert.equal(review.rows.find(({ id }) => id === "code")?.state, "measured-match");
  assert.equal(review.rows.find(({ id }) => id === "manufacturer")?.state, "measured-match");
  const guide = guideMarkdown(reopened);
  assert.match(guide, /Water pressure test records[\s\S]*Island rough-in observation[\s\S]*Final hold · Start 149 psi · Low 149 psi · End 149 psi · 60 min/);
  assert.match(guide, /2021 IRC P2503\.7 · Entered measurement matches this check/);
  assert.match(guide, /RWC push-to-connect sequence · Entered measurement matches this check/);
  const ipc = { ...reopened, projectCode: { ...project.projectCode, codePath: "ibc" as const } };
  assert.equal(reviewWaterPressure(ipc, record).rows.find(({ id }) => id === "code")?.label, "2024 IPC §312.6");
});

test("a short manufacturer observation can meet the narrow code hold without clearing the manufacturer row", () => {
  const { project, root } = kitchen();
  const draft = measured(root.id);
  const scope = waterPressureScope(project, root.id).scope!;
  const rows = (overrides: Partial<WaterPressureInput>) =>
    Object.fromEntries(previewWaterPressure(project, { ...draft, ...overrides }, scope).map(({ id, state }) => [id, state]));
  assert.deepEqual(rows({ finalHold: { ...draft.finalHold, minutes: 15 } }), {
    field: "recorded-condition", limits: "measured-match", code: "measured-match", manufacturer: "discrepancy",
  });
  assert.equal(rows({ finalHold: { ...draft.finalHold, minutes: 14 } }).code, "discrepancy");
  const drop = rows({ finalHold: { ...draft.finalHold, lowestPsi: 145, endPsi: 149 } });
  assert.equal(drop.code, "discrepancy");
  assert.equal(drop.manufacturer, "discrepancy");
  assert.equal(rows({ waterSource: "other" }).field, "discrepancy");
  assert.equal(rows({ gaugeScalePsi: 200, gaugeLimitPsi: 100 }).limits, "discrepancy");
  assert.equal(rows({ gaugeScalePsi: 200, gaugeLimitPsi: 100 }).manufacturer, "discrepancy");
  assert.equal(rows({ secondHoldEndPsi: 145 }).manufacturer, "discrepancy");
  assert.equal(rows({ temperatureF: 80 }).limits, "authority-review");
  assert.equal(rows({ boundaryNotes: "" }).code, "needs-input");
  assert.equal(rows({ gaugeIncrementPsi: 5 }).code, "discrepancy");
  assert.equal(previewWaterPressure({ ...project, projectCode: { ...project.projectCode, projectDate: "2026-11-22" } },
    draft, scope).find(({ id }) => id === "code")?.state, "authority-review");
});

test("a changed route or disconnected tee archives old observations without transferring them to the new section", () => {
  const { project, root } = kitchen();
  const draft = measured(root.id);
  const saved = saveWaterPressureTest(project, draft);
  const record = saved.waterPressureTests![0];
  const isolatedWork = { ...saved, pieces: [...saved.pieces, part("Unrelated blocking", "stud", [1.5, 3.5, 12], [150, 24, 40], saved.steps[0].id, "Other room")] };
  assert.equal(reviewWaterPressure(isolatedWork, record).stale, false);
  const withoutTee = removeWaterFitting(saved, saved.waterFittings![0]);
  const historical = reviewWaterPressure(withoutTee, record);
  assert.equal(historical.stale, true);
  assert.equal(historical.rows[0].state, "discrepancy");
  assert.throws(() => saveWaterPressureTest(withoutTee, draft, record.id), /Start a new water test record/);
  assert.match(guideMarkdown(withoutTee), /149 psi[\s\S]+connected routes, sockets or pipe geometry changed/);
  assert.ok(validate(withoutTee).some(({ id }) => id === `water-pressure-${record.id}`));
  const removed = removeWaterRun(saved, root);
  assert.equal(reviewWaterPressure(removed, record).stale, true);
  assert.equal(removed.waterPressureTests?.length, 1);
});

test("the generated guide places pressure review after fitting and before finish, and the idea planner opens the record", () => {
  const { project, root } = kitchen();
  const saved = saveWaterPressureTest(project, measured(root.id));
  const guide = generateBuildGuide(saved);
  assert.ok(guideIsCurrent(guide));
  const tests = guide.steps.findIndex(({ generated }) => generated?.kind === "water-pressure-review");
  const fitting = guide.steps.findIndex(({ generated }) => generated?.kind === "assembly-stage" && generated.stageKey === "water-fitting");
  const finish = guide.steps.findIndex(({ generated }) => generated?.kind === "project-finish");
  assert.ok(fitting > 0 && fitting < tests && tests < finish);
  const moved = { ...guide, steps: [guide.steps[tests], ...guide.steps.filter((_, i) => i !== tests)] };
  assert.ok(reviewAssemblyOrder(moved).some(({ current, prerequisites }) =>
    current.step.id === guide.steps[tests].id && prerequisites.some(({ step }) => step.id === guide.steps[fitting].id)));
  const intent = buildQuestion("Review the water pressure tests");
  assert.deepEqual(intent, { kind: "water-pressure" });
  assert.deepEqual(answerBuildQuestion(saved, intent!, []).rows?.[0].link?.action,
    { kind: "water-pressure", recordId: saved.waterPressureTests![0].id });
});
