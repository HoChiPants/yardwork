import test from "node:test";
import assert from "node:assert/strict";
import {
  intentToPlan,
  modelIntentSchema,
  intentMessages,
} from "../server/intentPlanner";
import { applyIdeaPlan, localIdeaPlan, previewIdeaPlan, workspacePlanningResult } from "../src/planning";
import { blank, projectSchema } from "../src/model";

test("typed seat widths and explicit seat references take priority over model guesses", () => {
  const base = intentToPlan({
    prompt: "Build a straight 72 in storage banquette with three sections, a finished seat height of 18 in, opening lids, and no back.",
  }, { family: "banquette", operation: "create", width: 48, height: 23, sectionCount: 2 });
  assert.deepEqual(base.modules.map(({ width, height }) => [width, height]), [[24, 18], [24, 18], [24, 18]]);
  const result = intentToPlan({ prompt: "Remove the opening lid from the right-hand seat.", previousPlan: base }, {
    family: "banquette", operation: "revise", targetSection: 1, depth: 35, storage: false, openingLid: false,
  });
  assert.deepEqual(result.modules, [base.modules[0], base.modules[1], { ...base.modules[2], openingLid: false }]);
});

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
test("lift-up window seats preserve separate storage compartments and no backrest", () => {
  const request = {
    prompt: "A 72 in wide window seat with three separate sections, seats that lift up, and enclosed storage underneath. No backrest.",
  };
  for (const plan of [
    localIdeaPlan(request),
    intentToPlan(request, { family: "bench", sectionCount: 1, storage: false, openingLid: false, backHeight: 16 }),
  ]) {
    assert.deepEqual(plan.modules.map((seat) =>
      [seat.width, seat.storage, seat.openingLid, seat.lidOpen, seat.backHeight]),
    Array.from({ length: 3 }, () => [24, true, true, false, 0]));
    assert.equal(applyIdeaPlan(blank(), plan).pieces.length, 42);
  }
  const fixed = intentToPlan({ prompt: "A backless window seat without under-seat storage." },
    { family: "bench", storage: true, openingLid: true });
  assert.deepEqual(fixed.modules.map(({ storage, openingLid }) => [storage, openingLid]), [[false, false]]);
});

test("lid preview commands move only the selected opening seats and clarify ambiguous requests", () => {
  const previousPlan = localIdeaPlan({
    prompt: "Three-section storage banquette with opening lids and no back",
  });
  const pose = (prompt: string, previous = previousPlan) =>
    workspacePlanningResult({ prompt, previousPlan: previous })?.plan;
  const middle = pose("Open the middle seat lid.");
  assert.deepEqual(middle?.modules, [
    previousPlan.modules[0],
    { ...previousPlan.modules[1], lidOpen: true },
    previousPlan.modules[2],
  ]);
  assert.deepEqual(pose("Open the middle lid.")?.modules, middle?.modules);
  const revised = pose("Make section 2 two inches taller and close its lid.", middle);
  assert.deepEqual(revised?.modules, [
    previousPlan.modules[0],
    { ...previousPlan.modules[1], height: 20 },
    previousPlan.modules[2],
  ]);
  const fixed = pose("Remove section 2's lid.")!;
  assert.deepEqual(pose("Open all lids.", fixed)?.modules.map((seat) => seat.lidOpen), [true, false, true]);
  assert.match(pose("Open the lid on section 2.", fixed)?.questions[0] ?? "", /fixed top/);
  for (const prompt of ["Open the lid.", "Open the middle seat lid and close its lid."]) {
    const unchanged = pose(prompt);
    assert.ok(unchanged?.questions.length);
    assert.deepEqual(unchanged.modules, previousPlan.modules);
  }
  assert.equal(pose("Open the cabinet door."), undefined);
});

test("a greenhouse door dimension stays separate from the wall envelope", () => {
  const request = {
    prompt: "Plan a greenhouse six feet wide and eight feet deep, with a 30 in wide door and 72 in high door. Eave height is 7 feet, roof rise 24 in.",
  };
  for (const plan of [
    localIdeaPlan(request),
    intentToPlan(request, { family: "greenhouse", width: 30, height: 72 }),
  ]) {
    const greenhouse = plan.structures[0];
    assert.equal(greenhouse.kind, "greenhouse");
    if (greenhouse.kind !== "greenhouse") throw Error("Expected a greenhouse.");
    assert.deepEqual(
      [greenhouse.parameters.width, greenhouse.parameters.depth, greenhouse.parameters.eaveHeight,
        greenhouse.parameters.doorWidth, greenhouse.parameters.doorHeight],
      [72, 96, 84, 30, 72],
    );
    assert.throws(() => previewIdeaPlan(blank(), plan), /modeled opening can be up to 71\.25 in high/);
    const taller = localIdeaPlan({ prompt: "Set the eave height to 90 inches.", previousPlan: plan });
    assert.ok(previewIdeaPlan(blank(), taller).addedParts > 5);
    assert.deepEqual(taller.structures[0].parameters, { ...greenhouse.parameters, eaveHeight: 90 });
    const edit = intentToPlan({
      prompt: "Make the greenhouse door 34 in wide. Keep the rest of the greenhouse.",
      previousPlan: plan,
    }, { family: "greenhouse", operation: "revise", width: 34 });
    assert.deepEqual(edit.structures[0].parameters, { ...greenhouse.parameters, doorWidth: 34 });
  }
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
