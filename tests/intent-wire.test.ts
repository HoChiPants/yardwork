import assert from "node:assert/strict";
import test from "node:test";
import {
  intentMessages,
  intentToPlan,
  intentWireSchema,
  modelIntentSchema,
  wireIntentToPlan,
} from "../server/intentPlanner";
import { toOllamaSchema } from "../server/ollamaSchema";
import { blank, uid } from "../src/model";
import { localIdeaPlan, previewIdeaPlan } from "../src/planning";

test("design wire requires only family and operation without injecting narrative defaults", () => {
  const schema = toOllamaSchema(intentWireSchema.toJSONSchema()),
    branches = schema.oneOf as Record<string, any>[];
  assert.equal(branches.length, 2);
  const design = branches[0],
    clarify = branches[1];
  assert.deepEqual(design.required, ["family", "operation"]);
  assert.deepEqual(clarify.required, ["family", "operation", "question"]);
  assert.equal(design.additionalProperties, false);
  assert.equal(clarify.additionalProperties, false);
  assert.equal(clarify.properties.question.maxLength, 240);
  assert.equal(clarify.properties.family.const, "clarify");
  for (const family of design.properties.family.enum) {
    const minimal = { family, operation: "create" };
    assert.deepEqual(intentWireSchema.parse(minimal), minimal);
    assert.ok(
      JSON.stringify(minimal).length <
        JSON.stringify(modelIntentSchema.parse(minimal)).length,
    );
  }
  for (const key of ["summary", "suggestions", "questions", "question"])
    assert.equal(key in design.properties, false);
  const inspect = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    assert.equal(
      "default" in item,
      false,
      "Wire grammar must not require empty/default narrative output",
    );
    assert.equal((item as { items?: unknown }).items === false, false);
    Object.values(item).forEach(inspect);
  };
  inspect(schema);
  assert.equal(design.properties.storage.type, "boolean");
  assert.ok(design.properties.frameMaterial.enum.includes("lowes-syp-2x4-8"));
  assert.equal(design.properties.width.maximum, 240);
});

test("design wire rejects narrative, undeclared fields, placeholders and missing operation", () => {
  const base = { family: "bench", operation: "create" };
  for (const invalid of [
    { family: "bench" },
    { operation: "create" },
    { ...base, summary: "An invented summary" },
    { ...base, suggestions: [] },
    { ...base, questions: [] },
    { ...base, question: "Which bench?" },
    { ...base, width: 0 },
    { ...base, width: null },
    { ...base, storage: "yes" },
    { ...base, targetSection: 0 },
    { ...base, frameMaterial: "unlisted-source" },
    { ...base, operation: "clarify" },
    { ...base, execute: "code" },
  ])
    assert.equal(
      intentWireSchema.safeParse(invalid).success,
      false,
      JSON.stringify(invalid),
    );
  assert.ok(
    modelIntentSchema.parse({
      family: "bench",
      summary: "Older replay evidence",
      questions: [],
      suggestions: [],
    }),
  );
});

test("clarify wire admits exactly one concise question and preserves the existing proposal", () => {
  const previous = localIdeaPlan({
      prompt:
        "A storage banquette with three sections and opening lids, no back",
    }),
    before = JSON.stringify(previous);
  const wire = intentWireSchema.parse({
    family: "clarify",
    operation: "clarify",
    question: " Which section should change? ",
  });
  assert.equal(wire.family, "clarify");
  if (wire.family === "clarify")
    assert.equal(wire.question, "Which section should change?");
  const next = wireIntentToPlan(
    { prompt: "Change that one", previousPlan: previous },
    wire,
  );
  assert.deepEqual(next.modules, previous.modules);
  assert.deepEqual(next.structures, previous.structures);
  assert.deepEqual(next.questions, ["Which section should change?"]);
  assert.equal(JSON.stringify(previous), before);
  for (const invalid of [
    { family: "clarify", operation: "clarify" },
    { family: "clarify", operation: "create", question: "Which section?" },
    { family: "clarify", operation: "clarify", question: " " },
    { family: "clarify", operation: "clarify", question: "a".repeat(241) },
    {
      family: "clarify",
      operation: "clarify",
      question: "Which section?",
      width: 72,
    },
    { family: "clarify", operation: "clarify", questions: ["Which section?"] },
  ])
    assert.equal(intentWireSchema.safeParse(invalid).success, false);
});

test("sparse wire retains raw measurement priority and actual L geometry", () => {
  const request = {
    prompt:
      "L-shaped kitchenette banquette seven feet along the back and five-foot overall return, seats24 inches deep and18 inches high. Wood back.",
    workZone: { width: 84, depth: 60, height: 84 },
  };
  const plan = wireIntentToPlan(request, {
    family: "banquette",
    operation: "create",
    width: 72,
    depth: 24,
    height: 18,
    returnLength: 72,
    shape: "straight",
    backHeight: 18,
  });
  const project = blank();
  project.workZone = request.workZone;
  const preview = previewIdeaPlan(project, plan);
  assert.equal(preview.max[0] - preview.min[0], 84);
  assert.equal(preview.max[2] - preview.min[2], 60);
  assert.equal(preview.workZoneFits, true);
  assert.equal(plan.modules.length, 2);
});

test("a real seating response with unused zeros and undirected stock retains the requested footprint", () => {
  const prompt = "Plan an L-shaped kitchenette banquette, seven feet along the back with a five-foot overall return, seats twenty-four inches deep and eighteen inches high. Include a wood back. Use two bench modules and count the corner once.";
  const workZone = { width: 84, depth: 60, height: 84 };
  const response = {
    family: "banquette", operation: "append", width: 84, depth: 24,
    height: 18, shape: "straight", returnLength: 15, sectionCount: 2,
    targetSection: 1, storage: false, openingLid: false, backHeight: 18,
    shelfCount: 1, roofRise: 0, doorWidth: 0, doorHeight: 0,
    frameMaterial: "cedarbrook-cedar-tg-72", panelMaterial: "cedarbrook-cedar-tg-72",
  };
  const plan = wireIntentToPlan({ prompt, workZone }, response);
  assert.equal(plan.modules.length, 2);
  assert.ok(plan.modules.every((bench) =>
    bench.height === 18 && bench.depth === 24 &&
    bench.frameMaterial === "stud" && bench.panelMaterial === "plywood"));
  const preview = previewIdeaPlan({ ...blank(), workZone }, plan);
  assert.equal(preview.max[0] - preview.min[0], 84);
  assert.equal(preview.max[2] - preview.min[2], 60);
  assert.equal(preview.workZoneFits, true);
  assert.throws(() => wireIntentToPlan({ prompt }, { ...response, width: 0 }));
  assert.throws(() => wireIntentToPlan({ prompt }, { ...response, family: "greenhouse" }));
  assert.throws(() => wireIntentToPlan({ prompt }, { ...response, panelMaterial: "unlisted-source" }));

  const explicit = wireIntentToPlan(
    { prompt: prompt + " Use Plytanium plywood for the panels." },
    { ...response, panelMaterial: "plytanium-703" },
  );
  assert.ok(explicit.modules.every((bench) => bench.panelMaterial === "plytanium-703"));
});

test("named section wire edits preserve entry IDs, selected sources and unrequested neighbor geometry", () => {
  const previous = localIdeaPlan({
    prompt:
      "Three-section storage banquette72 inches wide,24 inches deep,18 inches seat height with opening lids and no back",
  });
  previous.modules.forEach((module) => {
    module.entryId = uid();
    module.frameMaterial = "lowes-syp-2x4-8";
    module.panelMaterial = "plytanium-703";
  });
  const before = JSON.stringify(previous),
    next = wireIntentToPlan(
      {
        prompt: "Make only section2 seat height20 inches",
        previousPlan: previous,
      },
      {
        family: "bench",
        operation: "revise",
        targetSection: 1,
        height: 20,
        width: 90,
        depth: 12,
        panelMaterial: "plywood",
        storage: false,
      },
    );
  assert.deepEqual(
    next.modules.map((module) => module.height),
    [18, 20, 18],
  );
  assert.deepEqual(next.modules[0], previous.modules[0]);
  assert.deepEqual(next.modules[2], previous.modules[2]);
  assert.equal(next.modules[1].entryId, previous.modules[1].entryId);
  assert.equal(next.modules[1].frameMaterial, "lowes-syp-2x4-8");
  assert.equal(next.modules[1].panelMaterial, "plytanium-703");
  assert.equal(next.modules[1].storage, true);
  assert.equal(next.modules[1].openingLid, true);
  assert.equal(JSON.stringify(previous), before);
});

test("whole-casework sparse edits preserve exact source, typed family, pose and fixed sheet thickness", () => {
  const previous = localIdeaPlan({
      prompt:
        "Plywood bookcase 36 inches wide, 16 inches deep, 72 inches high with 3 shelves",
    }),
    structure = previous.structures[0];
  assert.equal(structure.kind, "casework-shelves");
  structure.entryId = uid();
  if (structure.kind !== "casework-shelves")
    throw Error("Fixture family mismatch");
  structure.parameters.origin = [12, 3, -8];
  structure.parameters.yaw = 30;
  structure.selections.caseworkPanels = {
    materialId: "plytanium-703",
    productRegistryRef: "plytanium-bc-201428",
  };
  const before = JSON.stringify(previous),
    next = wireIntentToPlan(
      {
        prompt: "Make the casework shelves 80 inches high with 4 shelves",
        previousPlan: previous,
      },
      {
        family: "casework-shelves",
        operation: "revise",
        height: 80,
        shelfCount: 4,
        width: 48,
      },
    );
  const changed = next.structures[0];
  assert.equal(changed.kind, "casework-shelves");
  if (changed.kind !== "casework-shelves")
    throw Error("Fixture family mismatch");
  assert.equal(changed.entryId, structure.entryId);
  assert.deepEqual(changed.selections, structure.selections);
  assert.deepEqual(changed.parameters.origin, [12, 3, -8]);
  assert.equal(changed.parameters.yaw, 30);
  assert.equal(changed.parameters.width, 36);
  assert.equal(changed.parameters.height, 80);
  assert.equal(changed.parameters.shelfCount, 4);
  const geometry = previewIdeaPlan(blank(), next).project;
  assert.equal(geometry.pieces.length, 9);
  assert.ok(
    geometry.pieces.every(
      (piece) =>
        piece.material === "plytanium-703" && piece.size.includes(0.703),
    ),
  );
  assert.equal(JSON.stringify(previous), before);
});

test("older narrative-bearing replays still use the compatible internal mapper while wire refuses them", () => {
  const old = {
    family: "banquette",
    operation: "create",
    summary: "A wrong72-inch return",
    questions: [],
    suggestions: ["An older model suggestion"],
  };
  assert.ok(modelIntentSchema.safeParse(old).success);
  assert.equal(intentWireSchema.safeParse(old).success, false);
  const plan = intentToPlan(
    {
      prompt:
        "An L-shaped banquette84 inches wide with60 inches overall return",
    },
    old,
  );
  assert.equal(plan.modules.length, 2);
  assert.doesNotMatch(plan.summary, /wrong/);
  assert.match(
    intentMessages({ prompt: "bench" })[0].content,
    /Return no summary/,
  );
  assert.match(
    intentMessages({ prompt: "bench" })[0].content,
    /doorWidth, doorHeight/,
  );
});
