import assert from "node:assert/strict";
import test from "node:test";
import { assessUnsupportedIntent } from "../server/unsupportedIntent";
import { intentToPlan, wireIntentToPlan } from "../server/intentPlanner";
import { localIdeaPlan, previewIdeaPlan } from "../src/planning";
import { blank, uid } from "../src/model";

const wrongBench = { family: "bench", operation: "create" };
const unsupported = [
  "Design a pool with plumbing and drains",
  "Plan electrical wiring for a bathroom",
  "Design plumbing for a bathroom",
  "Lay out HVAC ductwork for a workshop",
  "Design a sprinkler system for the garden",
  "Place a drain 12 inches from the wall",
  "Dig a 6-foot trench for a water supply line",
];
const seed = () => {
  const plan = localIdeaPlan({
    prompt:
      "A banquette 72 inches wide,24 inches deep,18 inches seat height,three sections,storage,opening lids,no back",
  });
  plan.modules.forEach((module) => {
    module.entryId = uid();
    module.frameMaterial = "lowes-syp-2x4-8";
    module.panelMaterial = "plytanium-703";
  });
  return plan;
};

test("explicit unsupported primary requests cannot be converted into a wire-valid model bench", () => {
  for (const prompt of unsupported) {
    assert.equal(assessUnsupportedIntent(prompt)?.primary, true, prompt);
    const plan = wireIntentToPlan({ prompt }, wrongBench);
    assert.deepEqual(plan.modules, [], prompt);
    assert.deepEqual(plan.structures, [], prompt);
    assert.ok(
      plan.questions.some((question) => /does not model/.test(question)),
      prompt,
    );
    const empty = blank(),
      before = JSON.stringify(empty);
    assert.throws(
      () => previewIdeaPlan(empty, plan),
      /Answer the planning questions/,
    );
    assert.deepEqual(empty.pieces, []);
    assert.equal(JSON.stringify(empty), before);
    assert.doesNotMatch(
      plan.summary,
      /seating section|bench assembly|wall assembly/i,
    );
  }
});

test("the old compatible internal mapper also enforces the raw boundary before model prompting", () => {
  const plan = intentToPlan(
    { prompt: "Design a pool with plumbing and drains" },
    {
      family: "bench",
      summary: "The pool is completed",
      suggestions: ["Screw the pool together"],
    },
  );
  assert.deepEqual(plan.modules, []);
  assert.deepEqual(plan.structures, []);
  assert.ok(plan.questions.length);
  assert.doesNotMatch(JSON.stringify(plan), /pool is completed|Screw the pool/);
});

test("unsupported followups preserve every prior entry, dimension, pose and exact stock choice", () => {
  const previous = seed(),
    before = JSON.stringify(previous);
  for (const prompt of [
    "Now add plumbing and drains to the current cabinet",
    "Route new electrical wiring through section2",
    "Install a drain inside the bench",
    "Make an HVAC duct layout near the seating",
  ]) {
    const plan = wireIntentToPlan(
      { prompt, previousPlan: previous },
      {
        family: "bench",
        operation: "revise",
        height: 30,
        width: 48,
        panelMaterial: "plywood",
      },
    );
    assert.deepEqual(plan.modules, previous.modules, prompt);
    assert.deepEqual(plan.structures, previous.structures, prompt);
    assert.deepEqual(plan.assumptions, previous.assumptions, prompt);
    assert.deepEqual(plan.suggestions, previous.suggestions, prompt);
    assert.ok(plan.questions.length, prompt);
    assert.equal(JSON.stringify(previous), before);
  }
});

test("unsupported work wins before a locally recognized shelf-count edit can change the old proposal", () => {
  const previous = localIdeaPlan({
      prompt:
        "Plywood bookcase 36 inches wide,16 inches deep,72 inches high with3 shelves",
    }),
    before = JSON.stringify(previous);
  const plan = wireIntentToPlan(
    {
      prompt: "Add one shelf to the bookcase and route new electrical wiring",
      previousPlan: previous,
    },
    { family: "casework-shelves", operation: "revise", shelfCount: 4 },
  );
  assert.deepEqual(plan.structures, previous.structures);
  assert.deepEqual(plan.modules, previous.modules);
  assert.ok(plan.questions.some((question) => /electrical/.test(question)));
  assert.equal(JSON.stringify(previous), before);
});

test("genuine clarify output retains its useful question and never creates geometry", () => {
  const question = "Which measured system boundary should be documented?";
  const plan = wireIntentToPlan(
    { prompt: "Plan pool plumbing" },
    { family: "clarify", operation: "clarify", question },
  );
  assert.ok(plan.questions.includes(question));
  assert.ok(plan.questions.some((item) => /does not model/.test(item)));
  assert.deepEqual(plan.modules, []);
  const previous = seed(),
    retained = wireIntentToPlan(
      { prompt: "Add a new drain to it", previousPlan: previous },
      { family: "clarify", operation: "clarify", question },
    );
  assert.deepEqual(retained.modules, previous.modules);
  assert.ok(retained.questions.includes(question));
});

test("supported seating beside a pool remains buildable with explicit unmodeled-interface scope", () => {
  for (const prompt of [
    "A banquette next to the pool with storage",
    "Build a bench beside the pool",
    "Seating for the pool deck",
    "The pool is 20 feet wide. I want a bench nearby.",
  ]) {
    assert.equal(assessUnsupportedIntent(prompt)?.primary, false, prompt);
    const plan = wireIntentToPlan(
      { prompt },
      { family: "banquette", operation: "create", storage: true },
    );
    assert.ok(plan.modules.length > 0, prompt);
    assert.ok(plan.modules.every((module) => module.kind === "bench"));
    assert.match(
      [...plan.assumptions, ...plan.suggestions, ...plan.questions].join(" "),
      /systems and their interfaces are not modeled/,
    );
  }
});

test("cabinet and box enclosures near utilities keep their physical geometry rather than planning those systems", () => {
  const cases = [
    ["Build a cabinet around the existing electrical panel", "cabinet"],
    [
      "A vanity cabinet with clearance around existing plumbing and drains",
      "cabinet",
    ],
    ["Plan a cabinet enclosure for plumbing utilities", "cabinet"],
    ["A protective box for an HVAC unit", "frame"],
    ["Build a cabinet near electrical wiring and plumbing", "cabinet"],
    ["Design a pool pump enclosure", "frame"],
  ];
  for (const [prompt, family] of cases) {
    assert.equal(assessUnsupportedIntent(prompt)?.primary, false, prompt);
    const plan = wireIntentToPlan({ prompt }, { family, operation: "create" });
    assert.ok(plan.modules.length, prompt);
    assert.match(
      [...plan.assumptions, ...plan.suggestions, ...plan.questions].join(" "),
      /interfaces are not modeled/,
    );
  }
});

test("a later explicit system action is not hidden by an earlier nearby furniture/context mention", () => {
  for (const prompt of [
    "Build a cabinet near electrical panel and install new wiring",
    "Make a cabinet and install a new drain",
    "Build seating beside the pool and dig a trench",
    "Build a sauna with a dedicated electrical circuit",
  ]) {
    assert.equal(assessUnsupportedIntent(prompt)?.primary, true, prompt);
    const plan = wireIntentToPlan({ prompt }, wrongBench);
    assert.equal(plan.modules.length + plan.structures.length, 0, prompt);
  }
});

test("negated system mentions and furniture compounds are not an unsupported keyword ban", () => {
  for (const prompt of [
    "No pool or plumbing work; build a bench",
    "Do not add electrical wiring. Just cabinets",
    "A cabinet without plumbing",
    "Not a pool; build seating",
    "Plan a pool table frame",
    "Build a poolside bench",
  ]) {
    assert.equal(assessUnsupportedIntent(prompt), null, prompt);
    assert.ok(
      wireIntentToPlan({ prompt }, wrongBench).modules.length > 0,
      prompt,
    );
  }
  assert.equal(
    assessUnsupportedIntent(
      "Something cozy to sit on with hidden bins underneath",
    ),
    null,
  );
  const inferred = wireIntentToPlan(
    { prompt: "Something cozy to sit on with hidden bins underneath" },
    { family: "banquette", operation: "create", storage: true },
  );
  assert.equal(inferred.modules[0].kind, "bench");
  assert.equal(inferred.modules[0].storage, true);
});

test("source/manufacturer requirements are not dropped to make room for interface notes", () => {
  const previous = seed();
  previous.assumptions = Array.from(
    { length: 12 },
    (_, i) =>
      `Manufacturer requirement ${i + 1}: preserve this exact source statement.`,
  );
  const plan = wireIntentToPlan(
    {
      prompt: "Make section2 seat height20 inches near the pool",
      previousPlan: previous,
    },
    { family: "bench", operation: "revise", height: 20 },
  );
  assert.deepEqual(
    plan.modules.map((module) => module.height),
    [18, 20, 18],
  );
  for (const note of previous.assumptions)
    assert.ok(plan.assumptions.includes(note));
  assert.match(
    [...plan.assumptions, ...plan.suggestions, ...plan.questions].join(" "),
    /interfaces are not modeled/,
  );
});
