import test from "node:test";
import assert from "node:assert/strict";
import {
  intentToPlan,
  modelIntentSchema,
  intentMessages,
} from "../server/intentPlanner";
import { applyIdeaPlan, previewIdeaPlan } from "../src/planning";
import { blank, projectSchema } from "../src/model";
test("compact AI intent expands the exact storage request into three actual closed seats", () => {
  const request = {
    prompt:
      "a kitchenette banquette with three sections and an openable lid, no back since the wall will be the back with storage in the bottom so its closed off but the seats open to create a space underneath",
  };
  const plan = intentToPlan(request, {
    family: "banquette",
    width: 72,
    depth: 24,
    height: 18,
    sectionCount: 3,
    openingLid: true,
    storage: true,
    backHeight: 0,
  });
  assert.equal(plan.modules.length, 3);
  assert.ok(
    plan.modules.every((m) => m.storage && m.openingLid && m.backHeight === 0),
  );
  const p = applyIdeaPlan(blank(), plan);
  assert.equal(p.pieces.length, 42);
  projectSchema.parse(p);
  const refined = intentToPlan(
    { prompt: "make the seat height20 inches", previousPlan: plan },
    { family: "banquette", operation: "revise", height: 20 },
  );
  assert.ok(
    refined.modules.every((m) => m.height === 20 && m.storage && m.openingLid),
  );
});
test("compact L intent counts its corner once and fits the explicit measured space", () => {
  const zone = { width: 84, depth: 60, height: 84 },
    plan = intentToPlan(
      {
        prompt:
          "L-shaped kitchenette banquette seven feet along the back and five-foot overall return, seats24 inches deep and18 inches high. Wood back.",
        workZone: zone,
      },
      {
        family: "banquette",
        width: 84,
        depth: 24,
        height: 18,
        shape: "l",
        returnLength: 60,
        backHeight: 16,
      },
    );
  const p = blank();
  p.workZone = zone;
  const preview = previewIdeaPlan(p, plan);
  assert.equal(plan.modules.length, 2);
  assert.equal(preview.workZoneFits, true);
  assert.equal(preview.max[0] - preview.min[0], 84);
  assert.equal(preview.max[2] - preview.min[2], 60);
});
test("compact family intents use real structure generators and reject invented data", () => {
  for (const family of ["greenhouse", "sauna", "closet-insert"] as const) {
    const plan = intentToPlan(
      { prompt: `${family} 6 ft wide6 ft deep7 ft high` },
      { family, width: 72, depth: 72, height: 84 },
    );
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.structures.length, 1);
    assert.ok(applyIdeaPlan(blank(), plan).pieces.length >= 10);
  }
  assert.equal(
    modelIntentSchema.safeParse({ family: "bench", width: 9999 }).success,
    false,
  );
  assert.equal(
    modelIntentSchema.safeParse({ family: "bench", execute: "code" }).success,
    false,
  );
  assert.throws(
    () =>
      intentToPlan(
        { prompt: "bench" },
        { family: "bench", frameMaterial: "closet-rod-72" },
      ),
    /wood lumber/,
  );
});
test("unknown trades ask questions and model context omits full project/geometry payload", () => {
  const plan = intentToPlan(
    { prompt: "Pool plumbing" },
    {
      family: "clarify",
      operation: "clarify",
      questions: ["Which system and measured site constraints apply?"],
    },
  );
  assert.equal(plan.modules.length + plan.structures.length, 0);
  assert.ok(plan.questions.length);
  const messages = intentMessages({
    prompt: "bench",
    previousPlan: intentToPlan({ prompt: "bench" }, { family: "bench" }),
  });
  assert.ok(messages[0].content.length < 6000);
  assert.ok(!messages[0].content.includes("pieceIds"));
});
test("explicit raw project/features take priority over conflicting inferred family or defaults", () => {
  const shelves = intentToPlan(
    {
      prompt:
        "A shelving unit 36 inches wide, 16 inches deep, 72 inches high. No bench or seating.",
    },
    { family: "bench", width: 72, height: 18, depth: 24 },
  );
  assert.ok(
    shelves.modules.every(
      (module) =>
        module.kind === "shelf" && module.width === 36 && module.height === 72,
    ),
  );
  const seats = intentToPlan(
    {
      prompt:
        "Banquette72 inches wide with three sections, opening lids, storage and no back.",
    },
    {
      family: "banquette",
      sectionCount: 3,
      storage: false,
      openingLid: false,
      backHeight: 12,
    },
  );
  assert.ok(
    seats.modules.every(
      (module) =>
        module.storage && module.openingLid && module.backHeight === 0,
    ),
  );
  const back = intentToPlan(
    { prompt: "bench with a wood back" },
    { family: "bench", backHeight: 12 },
  );
  assert.ok(back.modules.every((module) => module.backHeight === 12));
  assert.ok(!back.assumptions.some((note) => note.includes("16 in above")));
  const clarify = intentToPlan(
    { prompt: "change that one", previousPlan: seats },
    { family: "clarify", questions: ["Which section should change?"] },
  );
  assert.deepEqual(clarify.modules, seats.modules);
  assert.deepEqual(clarify.structures, seats.structures);
  assert.deepEqual(clarify.questions, ["Which section should change?"]);
});
test("unused model zero/null slots are omitted without accepting zero physical dimensions or targets", () => {
  const request = {
    prompt:
      "An L-shaped banquette7 feet wide,5 feet overall return,24 inches deep,18 inches seat height. Include a wood back.",
    workZone: { width: 84, depth: 60, height: 84 },
  };
  const plan = intentToPlan(request, {
    family: "banquette",
    operation: "revise",
    width: 72,
    depth: 24,
    height: 18,
    returnLength: 72,
    shape: "straight",
    sectionCount: 2,
    targetSection: 1,
    backHeight: 18,
    shelfCount: 0,
    roofRise: 0,
    doorWidth: 0,
    doorHeight: 0,
    storage: null,
  });
  const p = blank();
  p.workZone = request.workZone;
  const preview = previewIdeaPlan(p, plan);
  assert.equal(preview.workZoneFits, true);
  assert.equal(preview.max[0] - preview.min[0], 84);
  assert.equal(preview.max[2] - preview.min[2], 60);
  assert.throws(
    () =>
      intentToPlan(
        { prompt: "bench height0 inches" },
        { family: "bench", height: 0 },
      ),
    "An explicit zero-sized user request must still be rejected",
  );
  const previous = intentToPlan(
    { prompt: "storage banquette with three sections" },
    { family: "banquette", sectionCount: 3 },
  );
  const invalidTarget = intentToPlan(
    { prompt: "Set section0 height20 inches", previousPlan: previous },
    { family: "banquette", operation: "revise", height: 20, targetSection: 0 },
  );
  assert.deepEqual(invalidTarget.modules, previous.modules);
  assert.ok(invalidTarget.questions.length);
});
