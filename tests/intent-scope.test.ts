import test from "node:test";
import assert from "node:assert/strict";
import { intentToPlan, modelIntentSchema } from "../server/intentPlanner";
import { prepareIntentEdits } from "../server/intentEdits";
import {
  localIdeaPlan,
  ideaPlanSchema,
  previewIdeaPlan,
} from "../src/planning";
import { blank } from "../src/model";
const seed = () => {
  const p = localIdeaPlan({
    prompt:
      "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height, opening lids and no back",
  });
  p.modules.forEach((m) => (m.panelMaterial = "plytanium-703"));
  return p;
};
const parts = (plan: ReturnType<typeof seed>) =>
  previewIdeaPlan(blank(), plan).project.pieces;

test("raw section2 back request wins omitted and wrong model targets without adding other backs", () => {
  for (const targetSection of [undefined, 1]) {
    const old = seed(),
      next = intentToPlan(
        { prompt: "Set section 2 back height to 16 inches", previousPlan: old },
        { family: "bench", operation: "revise", backHeight: 16, targetSection },
      );
    assert.deepEqual(
      next.modules.map((m) => m.backHeight),
      [0, 16, 0],
    );
    assert.equal(parts(next).length, 43);
    assert.deepEqual(next.modules[0], old.modules[0]);
    assert.deepEqual(next.modules[2], old.modules[2]);
  }
});
test("raw section2 storage removal does not erase the other enclosed compartments", () => {
  for (const targetSection of [undefined, 1]) {
    const old = seed(),
      next = intentToPlan(
        { prompt: "Remove storage from section 2", previousPlan: old },
        { family: "bench", operation: "revise", storage: false, targetSection },
      );
    assert.deepEqual(
      next.modules.map((m) => m.storage),
      [true, false, true],
    );
    assert.deepEqual(
      next.modules.map((m) => m.openingLid),
      [true, false, true],
    );
    assert.equal(parts(next).length, 37);
    assert.deepEqual(next.modules[0], old.modules[0]);
    assert.deepEqual(next.modules[2], old.modules[2]);
  }
});
test("height-only revision discards guessed width/depth/material/features and retains real .703 stock", () => {
  const old = seed(),
    next = intentToPlan(
      { prompt: "Make section 2 seat height20 inches", previousPlan: old },
      {
        family: "bench",
        operation: "revise",
        height: 20,
        width: 60,
        depth: 30,
        panelMaterial: "plywood",
        frameMaterial: "one-two",
        backHeight: 16,
        storage: false,
        openingLid: false,
        shelfCount: 5,
        sectionCount: 4,
      },
    );
  assert.deepEqual(
    next.modules.map((m) => m.height),
    [18, 20, 18],
  );
  assert.ok(
    next.modules.every(
      (m) =>
        m.width === 24 &&
        m.depth === 24 &&
        m.panelMaterial === "plytanium-703" &&
        m.frameMaterial === "stud" &&
        m.storage &&
        m.openingLid &&
        m.backHeight === 0,
    ),
  );
  assert.deepEqual(next.modules[0], old.modules[0]);
  assert.deepEqual(next.modules[2], old.modules[2]);
  assert.ok(
    parts(next)
      .filter((p) => p.material === "plytanium-703")
      .every((p) => Math.min(...p.size) === 0.703),
  );
});
test("a cabinet shelf-count edit leaves the unrelated bookshelf and all benches unchanged", () => {
  const old = ideaPlanSchema.parse({
      ...seed(),
      modules: [
        ...seed().modules,
        {
          ...localIdeaPlan({ prompt: "Cabinet" }).modules[0],
          position: [80, 0, 0],
        },
        {
          ...localIdeaPlan({ prompt: "Shelves" }).modules[0],
          position: [140, 0, 0],
        },
      ],
    }),
    next = intentToPlan(
      { prompt: "Give the cabinet five shelves", previousPlan: old },
      { family: "cabinet", operation: "revise", shelfCount: 5 },
    );
  assert.equal(next.modules[3].levels, 5);
  assert.equal(next.modules[4].levels, 3);
  for (const i of [0, 1, 2, 4])
    assert.deepEqual(next.modules[i], old.modules[i]);
  assert.deepEqual(next.questions, old.questions);
});
test("an explicitly requested section panel change is scoped and other exact product choices survive", () => {
  const old = seed(),
    next = intentToPlan(
      { prompt: "Use half inch plywood in section 2", previousPlan: old },
      {
        family: "bench",
        operation: "revise",
        panelMaterial: "plywood-half",
        frameMaterial: "one-two",
      },
    );
  assert.deepEqual(
    next.modules.map((m) => m.panelMaterial),
    ["plytanium-703", "plywood-half", "plytanium-703"],
  );
  assert.ok(next.modules.every((m) => m.frameMaterial === "stud"));
  assert.deepEqual(next.questions, old.questions);
});
test("a real append touches only the new tail item even if model guesses an old target", () => {
  const old = seed(),
    next = intentToPlan(
      {
        prompt:
          "Add a cabinet 36 inches wide and 60 inches high next to section 2",
        previousPlan: old,
      },
      {
        family: "cabinet",
        operation: "append",
        width: 36,
        height: 60,
        panelMaterial: "plywood-half",
        targetSection: 2,
      },
    );
  assert.equal(next.modules.length, 4);
  assert.deepEqual(next.modules.slice(0, 3), old.modules);
  assert.equal(next.modules[3].panelMaterial, "plywood-half");
});
test("a hallucinated append on a revision cannot add an item or reset prior measurements", () => {
  const old = seed(),
    next = intentToPlan(
      { prompt: "Make section 2 seat height20 inches", previousPlan: old },
      {
        family: "bench",
        operation: "append",
        height: 20,
        width: 72,
        panelMaterial: "plywood",
      },
    );
  assert.equal(next.modules.length, 3);
  assert.deepEqual(
    next.modules.map((m) => m.height),
    [18, 20, 18],
  );
  assert.ok(next.modules.every((m) => m.panelMaterial === "plytanium-703"));
});
test("missing units or an invalid target returns clarification with identical module data", () => {
  const old = seed();
  for (const prompt of [
    "Make section 2 height20",
    "Make section 9 height20 inches",
  ]) {
    const next = intentToPlan(
      { prompt, previousPlan: old },
      {
        family: "bench",
        operation: "revise",
        height: 20,
        width: 72,
        panelMaterial: "plywood",
      },
    );
    assert.deepEqual(next.modules, old.modules);
    assert.deepEqual(next.structures, old.structures);
    assert.ok(next.questions.length);
  }
});
test("preservation clauses cannot become material/storage overrides on a height edit", () => {
  const old = seed();
  old.modules[1].storage = false;
  old.modules[1].openingLid = false;
  const next = intentToPlan(
    {
      prompt:
        "Make section 2 seat height20 inches. Keep the same stock, storage and lid choices.",
      previousPlan: old,
    },
    {
      family: "bench",
      operation: "revise",
      height: 20,
      panelMaterial: "plywood",
      storage: true,
      openingLid: true,
    },
  );
  assert.equal(next.modules[1].height, 20);
  assert.equal(next.modules[1].storage, false);
  assert.equal(next.modules[1].openingLid, false);
  assert.equal(next.modules[1].panelMaterial, "plytanium-703");
});
test("initial sparse inference remains useful and repeated AI metadata is deduplicated", () => {
  const initial = intentToPlan(
    { prompt: "A banquette" },
    {
      family: "bench",
      width: 72,
      height: 18,
      depth: 24,
      storage: true,
      panelMaterial: "plytanium-703",
    },
  );
  assert.equal(initial.modules[0].panelMaterial, "plytanium-703");
  assert.equal(initial.modules[0].storage, true);
  let next = seed();
  for (const height of [19, 20, 21])
    next = intentToPlan(
      { prompt: `Make seats ${height} inches high`, previousPlan: next },
      { family: "bench", operation: "revise", height },
    );
  assert.equal(
    next.assumptions.filter((a) => a.startsWith("AI-interpreted measurements"))
      .length,
    1,
  );
  const prepared = prepareIntentEdits(
    { prompt: "Make section 2 height20 inches", previousPlan: seed() },
    modelIntentSchema.parse({
      family: "bench",
      operation: "revise",
      height: 20,
      width: 60,
      panelMaterial: "plywood",
    }),
  );
  assert.equal(prepared.intent.width, undefined);
  assert.equal(prepared.intent.panelMaterial, undefined);
  assert.equal(prepared.intent.targetSection, 2);
});

test("removing an opening lid cannot add storage to an open bench", () => {
  const old = seed();
  old.modules[1].storage = false;
  old.modules[1].openingLid = false;
  const next = intentToPlan(
    { prompt: "No opening lid on section 2", previousPlan: old },
    { family: "bench", operation: "revise", openingLid: false },
  );
  assert.equal(next.modules[1].storage, false);
  assert.equal(next.modules[1].openingLid, false);
  assert.deepEqual(next.modules[0], old.modules[0]);
  assert.deepEqual(next.modules[2], old.modules[2]);
});
test("unsupported post-only recipe fields ask instead of changing geometry", () => {
  const old = seed(),
    next = intentToPlan(
      { prompt: "Give section 2 five shelves", previousPlan: old },
      { family: "bench", operation: "revise", shelfCount: 5 },
    );
  assert.deepEqual(next.modules, old.modules);
  assert.ok(next.questions.length);
});
