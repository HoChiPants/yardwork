import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { blank, projectSchema, type V3 } from "../src/model";
import {
  applyIdeaPlan,
  localIdeaPlan,
  ideaPlanSchema,
  type IdeaPlan,
} from "../src/planning";
import { bindingPlan } from "../src/ideaBindings";
import { bounds } from "../src/engine";
import { reconcileNarrative } from "../src/ideaNarrative";
import { mentionedFamily } from "../src/ideaEdits";
import { intentToPlan } from "../server/intentPlanner";
import { plannerHandler } from "../server/planner";

const prompt =
  "Plywood bookcase 36 inches wide, 16 inches deep and 72 inches high, with three adjustable shelves";
function casework(plan: IdeaPlan) {
  const structure = plan.structures.find((s) => s.kind === "casework-shelves");
  assert.ok(structure?.kind === "casework-shelves");
  return structure;
}
function selectedPlan() {
  const plan = localIdeaPlan({ prompt }),
    s = casework(plan);
  s.parameters.origin = [12, 3, -8];
  s.parameters.yaw = 30;
  s.parameters.shelfClearance = 0.5;
  s.selections.caseworkPanels = {
    materialId: "plytanium-703",
    productRegistryRef: "plytanium-bc-201428",
  };
  const project = applyIdeaPlan(blank(), plan);
  return bindingPlan(project, project.ideaBindings[0].id);
}
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

test("explicit plywood and panel casework language generates a whole eight-panel bookcase", () => {
  for (const label of [
    "Plywood bookcase",
    "Panel casework shelves",
    "Casework shelves",
    "Bookcase made from plywood",
  ]) {
    const plan = localIdeaPlan({
      prompt: `${label} 36 inches wide,16 inches deep,72 inches high with 3 shelves`,
    });
    assert.equal(plan.modules.length, 0);
    const s = casework(plan);
    assert.equal(s.parameters.shelfCount, 3);
    const p = applyIdeaPlan(blank(), plan),
      boxes = p.pieces.map(bounds);
    assert.equal(p.pieces.length, 8);
    assert.equal(p.ideaBindings[0].entries.length, 1);
    near(
      Math.max(...boxes.map((b) => b.max[0])) -
        Math.min(...boxes.map((b) => b.min[0])),
      36,
    );
    near(
      Math.max(...boxes.map((b) => b.max[1])) -
        Math.min(...boxes.map((b) => b.min[1])),
      72,
    );
    near(
      Math.max(...boxes.map((b) => b.max[2])) -
        Math.min(...boxes.map((b) => b.min[2])),
      16,
    );
  }
  assert.equal(
    mentionedFamily("No plywood bookcase; create a workbench"),
    "workbench",
  );
});

test("ordinary framed shelves keep their existing lumber-module geometry", () => {
  const plan = localIdeaPlan({
    prompt:
      "Plan one freestanding shelving unit, 36 inches wide,16 inches deep and72 inches tall,with three shelves. Use a shelf module and ordinary stud lumber plus plywood. No bench or seating.",
  });
  assert.equal(plan.structures.length, 0);
  assert.equal(plan.modules[0].kind, "shelf");
  assert.equal(applyIdeaPlan(blank(), plan).pieces.length, 14);
});

test("saved casework dimension and shelf-count followups preserve identity, source and full requested pose", () => {
  const original = selectedPlan(),
    old = structuredClone(casework(original));
  const next = localIdeaPlan({
    prompt: "Make the shelves width 48 inches and shelf count four",
    previousPlan: original,
  });
  const actual = casework(next);
  assert.deepEqual(actual, {
    ...old,
    parameters: { ...old.parameters, width: 48, shelfCount: 4 },
  });
  assert.ok(actual.entryId);
  assert.equal(next.modules.length, 0);
  const onlyHeight = localIdeaPlan({
    prompt: "Make it 80 inches tall",
    previousPlan: next,
  });
  assert.deepEqual(casework(onlyHeight), {
    ...actual,
    parameters: { ...actual.parameters, height: 80 },
  });
  const p = applyIdeaPlan(blank(), onlyHeight);
  assert.equal(p.pieces.length, 9);
  assert.ok(p.pieces.every((p) => p.material === "plytanium-703"));
  assert.ok(
    p.pieces.every((p) => p.size.some((n) => Math.abs(n - 0.703) < 0.0001)),
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(p))).ideaBindings,
    p.ideaBindings,
  );
});

test("ambiguous units, multiple matching casework designs and framed/casework mixtures retain prior geometry", () => {
  const original = selectedPlan();
  for (const request of [
    "Make it 48 wide",
    "Make the casework shelf depth 18",
    "Set shelf count 7",
  ]) {
    const next = localIdeaPlan({ prompt: request, previousPlan: original });
    assert.deepEqual(next.structures, original.structures);
    assert.ok(next.questions.length > 0);
  }
  assert.equal(
    localIdeaPlan({ prompt: "Plywood bookcase 36 by16" }).structures.length,
    0,
  );
  const duplicate = ideaPlanSchema.parse({
    ...original,
    structures: [
      original.structures[0],
      {
        ...original.structures[0],
        entryId: undefined,
        parameters: {
          ...casework(original).parameters,
          origin: [90, 0, 0] as V3,
        },
      },
    ],
  });
  const ambiguous = localIdeaPlan({
    prompt: "Make casework shelves 48 inches wide",
    previousPlan: duplicate,
  });
  assert.deepEqual(ambiguous.structures, duplicate.structures);
  assert.ok(ambiguous.questions.length > 0);
  const framed = localIdeaPlan({
    prompt: "Shelf 36 inches wide,16 inches deep,60 inches high",
  });
  const mixed = ideaPlanSchema.parse({ ...original, modules: framed.modules });
  const uncertain = localIdeaPlan({
    prompt: "Make shelves 48 inches wide",
    previousPlan: mixed,
  });
  assert.deepEqual(uncertain.modules, mixed.modules);
  assert.deepEqual(uncertain.structures, mixed.structures);
  assert.ok(uncertain.questions.length > 0);
  const pronoun = localIdeaPlan({
    prompt: "Make it 48 inches wide",
    previousPlan: mixed,
  });
  assert.deepEqual(pronoun.modules, mixed.modules);
  assert.deepEqual(pronoun.structures, mixed.structures);
  assert.ok(pronoun.questions.length > 0);
  const numbered = localIdeaPlan({
    prompt: "Make section 1 width 40 inches",
    previousPlan: mixed,
  });
  assert.equal(numbered.modules[0].width, 40);
  assert.deepEqual(numbered.structures, mixed.structures);
});

test("mixed-family casework edits and separate additions retain unrelated entries", () => {
  const original = selectedPlan(),
    greenhouse = localIdeaPlan({
      prompt: "Greenhouse 6 feet wide,8 feet deep,7 feet eave height",
    }),
    bench = localIdeaPlan({
      prompt: "Bench 48 inches wide, 24 inches deep, 18 inches high",
    });
  const mixed = ideaPlanSchema.parse({
    ...original,
    modules: bench.modules,
    structures: [...original.structures, ...greenhouse.structures],
  });
  assert.equal(mixed.modules.length, 1);
  assert.equal(mixed.structures.length, 2);
  const changed = localIdeaPlan({
    prompt: "Make the plywood bookcase 48 inches wide",
    previousPlan: mixed,
  });
  assert.equal(casework(changed).parameters.width, 48);
  assert.deepEqual(changed.modules, mixed.modules);
  assert.deepEqual(changed.structures[1], mixed.structures[1]);
  const appended = localIdeaPlan({
    prompt:
      "Add another plywood bookcase 24 inches wide,12 inches deep,60 inches high with 2 shelves",
    previousPlan: mixed,
  });
  assert.deepEqual(appended.modules, mixed.modules);
  assert.deepEqual(appended.structures.slice(0, 2), mixed.structures);
  assert.equal(appended.structures.length, 3);
  assert.equal(appended.structures[2].kind, "casework-shelves");
});

test("native compact casework uses actual selected panel thickness and retains count-only edits", () => {
  const initial = intentToPlan(
    { prompt },
    {
      family: "casework-shelves",
      operation: "create",
      width: 36,
      depth: 16,
      height: 72,
      shelfCount: 3,
      panelMaterial: "plytanium-703",
    },
  );
  const selected = casework(initial);
  assert.deepEqual(selected.selections.caseworkPanels, {
    materialId: "plytanium-703",
    productRegistryRef: "plytanium-bc-201428",
  });
  const p = applyIdeaPlan(blank(), initial),
    previous = bindingPlan(p, p.ideaBindings[0].id);
  assert.equal(p.pieces.length, 8);
  assert.ok(
    p.pieces.every((p) => p.size.some((n) => Math.abs(n - 0.703) < 0.0001)),
  );
  const count = intentToPlan(
    { prompt: "Make shelf count 4", previousPlan: previous },
    {
      family: "shelves",
      operation: "revise",
      shelfCount: 4,
      width: 99,
      depth: 99,
      height: 99,
      panelMaterial: "plywood",
    },
  );
  assert.deepEqual(casework(count), {
    ...casework(previous),
    parameters: { ...casework(previous).parameters, shelfCount: 4 },
  });
  const height = intentToPlan(
    { prompt: "Make it 80 inches high", previousPlan: count },
    { family: "bench", operation: "revise", height: 80 },
  );
  assert.deepEqual(casework(height), {
    ...casework(count),
    parameters: { ...casework(count).parameters, height: 80 },
  });
  const narrative = reconcileNarrative(height);
  assert.match(narrative.title, /casework/i);
  assert.match(narrative.summary, /36 × 16 × 80/);
  assert.match(narrative.summary, /4 adjustable shelves/);
});

test("native compact raw casework request wins over wrong framed-shelf inference and respects clarification", () => {
  const plan = intentToPlan(
    { prompt },
    {
      family: "shelves",
      operation: "create",
      width: 99,
      depth: 99,
      height: 99,
    },
  );
  assert.equal(plan.modules.length, 0);
  near(casework(plan).parameters.width, 36);
  near(casework(plan).parameters.height, 72);
  const original = selectedPlan();
  const ambiguous = intentToPlan(
    { prompt: "Make the depth 18", previousPlan: original },
    { family: "casework-shelves", operation: "revise", depth: 18 },
  );
  assert.deepEqual(ambiguous.structures, original.structures);
  assert.ok(ambiguous.questions.length > 0);
});

test("native casework revisions and append operations stay scoped in mixed proposals", () => {
  const original = selectedPlan(),
    framed = localIdeaPlan({
      prompt: "Shelf 36 inches wide,16 inches deep,60 inches high",
    }),
    greenhouse = localIdeaPlan({
      prompt: "Greenhouse 6 feet wide,8 feet deep,7 feet eave height",
    });
  const mixed = ideaPlanSchema.parse({
    ...original,
    modules: framed.modules,
    structures: [...original.structures, ...greenhouse.structures],
  });
  const edited = intentToPlan(
    { prompt: "Make plywood bookcase width 48 inches", previousPlan: mixed },
    {
      family: "casework-shelves",
      operation: "revise",
      width: 48,
      height: 99,
      depth: 99,
      shelfCount: 6,
      panelMaterial: "plywood",
    },
  );
  assert.deepEqual(casework(edited), {
    ...casework(mixed),
    parameters: { ...casework(mixed).parameters, width: 48 },
  });
  assert.deepEqual(edited.modules, mixed.modules);
  assert.deepEqual(edited.structures[1], mixed.structures[1]);
  const ambiguous = intentToPlan(
    { prompt: "Make shelves width 48 inches", previousPlan: mixed },
    { family: "shelves", operation: "revise", width: 48 },
  );
  assert.deepEqual(ambiguous.modules, mixed.modules);
  assert.deepEqual(ambiguous.structures, mixed.structures);
  assert.ok(ambiguous.questions.length > 0);
  const appended = intentToPlan(
    {
      prompt:
        "Add another plywood bookcase 24 inches wide,12 inches deep,60 inches high with 2 shelves",
      previousPlan: mixed,
    },
    {
      family: "casework-shelves",
      operation: "append",
      width: 24,
      depth: 12,
      height: 60,
      shelfCount: 2,
      panelMaterial: "plytanium-703",
    },
  );
  assert.deepEqual(appended.modules, mixed.modules);
  assert.deepEqual(appended.structures.slice(0, 2), mixed.structures);
  const added = appended.structures[2];
  assert.ok(added.kind === "casework-shelves");
  assert.equal(added.parameters.shelfCount, 2);
  assert.equal(added.selections.caseworkPanels?.materialId, "plytanium-703");
});

test("adding or removing shelves inside saved casework adjusts its count and preserves every other field", () => {
  const previous = selectedPlan(),
    old = casework(previous);
  for (const [prompt, count] of [
    ["Add a shelf", 4],
    ["Add 2 shelves inside this bookcase", 5],
    ["Remove one shelf", 2],
  ] as const) {
    const local = localIdeaPlan({ prompt, previousPlan: previous });
    const native = intentToPlan(
      { prompt, previousPlan: previous },
      {
        family: "shelves",
        operation: "append",
        shelfCount: 1,
        width: 99,
        height: 99,
        depth: 99,
        panelMaterial: "plywood",
      },
    );
    for (const actual of [local, native]) {
      assert.equal(actual.modules.length, 0);
      assert.equal(actual.structures.length, 1);
      assert.deepEqual(casework(actual), {
        ...old,
        parameters: { ...old.parameters, shelfCount: count },
      });
      assert.equal(applyIdeaPlan(blank(), actual).pieces.length, count + 5);
    }
  }
});

test("combined shelf deltas and outside dimensions compose locally and with native guesses", () => {
  const previous = selectedPlan(),
    old = casework(previous);
  for (const [prompt, patch] of [
    [
      "Remove one shelf and make the bookcase 84 inches tall",
      { shelfCount: 2, height: 84 },
    ],
    [
      "Add a shelf and make the casework 42 inches wide and 18 inches deep",
      { shelfCount: 4, width: 42, depth: 18 },
    ],
  ] as const) {
    const local = localIdeaPlan({ prompt, previousPlan: previous }),
      native = intentToPlan(
        { prompt, previousPlan: previous },
        {
          family: "shelves",
          operation: "append",
          shelfCount: 1,
          width: 99,
          height: 99,
          depth: 99,
          panelMaterial: "plywood",
        },
      );
    for (const plan of [local, native]) {
      assert.deepEqual(casework(plan), {
        ...old,
        parameters: { ...old.parameters, ...patch },
      });
      assert.equal(plan.structures.length, 1);
      assert.equal(plan.modules.length, 0);
      assert.equal(
        applyIdeaPlan(blank(), plan).pieces.length,
        patch.shelfCount + 5,
      );
    }
  }
  for (const prompt of [
    "Remove one shelf and make the bookcase 84 tall",
    "Add a shelf and make the bookcase 4 inches wide",
  ]) {
    for (const plan of [
      localIdeaPlan({ prompt, previousPlan: previous }),
      intentToPlan(
        { prompt, previousPlan: previous },
        {
          family: "casework-shelves",
          operation: "revise",
          shelfCount: 1,
          height: 84,
        },
      ),
    ]) {
      assert.deepEqual(plan.structures, previous.structures);
      assert.deepEqual(plan.modules, previous.modules);
      assert.ok(plan.questions.length > 0);
    }
  }
});

test("shelf-count deltas outside one to six and ambiguous mixed targets retain all current geometry", () => {
  const previous = selectedPlan();
  for (const prompt of [
    "Add 4 shelves inside this bookcase",
    "Remove 3 shelves",
    "Remove all shelves",
    "Add 0 shelves",
    "Add shelves",
  ]) {
    for (const next of [
      localIdeaPlan({ prompt, previousPlan: previous }),
      intentToPlan(
        { prompt, previousPlan: previous },
        { family: "shelves", operation: "revise", shelfCount: 1 },
      ),
    ]) {
      assert.deepEqual(next.structures, previous.structures);
      assert.deepEqual(next.modules, previous.modules);
      assert.ok(next.questions.length > 0);
    }
  }
  const bench = localIdeaPlan({
      prompt: "Bench 48 inches wide,24 inches deep,18 inches high",
    }),
    mixed = ideaPlanSchema.parse({ ...previous, modules: bench.modules });
  const unclear = localIdeaPlan({ prompt: "Add a shelf", previousPlan: mixed });
  assert.deepEqual(unclear.structures, mixed.structures);
  assert.deepEqual(unclear.modules, mixed.modules);
  assert.ok(unclear.questions.length > 0);
  const clear = localIdeaPlan({
    prompt: "Add 2 shelves inside this bookcase",
    previousPlan: mixed,
  });
  assert.deepEqual(clear.modules, mixed.modules);
  assert.equal(casework(clear).parameters.shelfCount, 5);
  assert.equal(casework(clear).entryId, casework(mixed).entryId);
});

test("a separate bookcase or freestanding shelf still appends instead of changing a saved bookcase count", () => {
  const previous = selectedPlan();
  for (const parse of [
    (prompt: string) => localIdeaPlan({ prompt, previousPlan: previous }),
    (prompt: string) =>
      intentToPlan(
        { prompt, previousPlan: previous },
        { family: "shelves", operation: "append", shelfCount: 1 },
      ),
  ]) {
    const another = parse("Add another bookcase");
    assert.equal(another.modules.length, 0);
    assert.equal(another.structures.length, 2);
    assert.deepEqual(another.structures[0], previous.structures[0]);
    assert.equal(another.structures[1].kind, "casework-shelves");
    const freestanding = parse("Add a freestanding shelving unit");
    assert.equal(freestanding.modules.length, 1);
    assert.equal(freestanding.modules[0].kind, "shelf");
    assert.deepEqual(freestanding.structures, previous.structures);
  }
});

test("planner API compact grammar exposes casework and expands mocked native output without source substitution", async () => {
  const oldURL = process.env.OLLAMA_URL,
    oldFormat = process.env.OLLAMA_PLANNER_FORMAT,
    oldFetch = globalThis.fetch;
  let payload: unknown, upstream: Record<string, unknown> | undefined;
  const previous = selectedPlan();
  try {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_PLANNER_FORMAT = "compact";
    globalThis.fetch = async (_url, options) => {
      upstream = JSON.parse(String(options?.body));
      return new globalThis.Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              family: "casework-shelves",
              operation: "revise",
              height: 80,
              shelfCount: 4,
            }),
          },
        }),
        { status: 200 },
      );
    };
    const response = Object.assign(new EventEmitter(), {
      json(body: unknown) {
        payload = body;
        return this;
      },
    }) as unknown as Response;
    await plannerHandler(
      {
        body: {
          prompt: "Make the casework shelves 80 inches high with 4 shelves",
          previousPlan: previous,
        },
      } as Request,
      response,
    );
    const result = payload as { provider: string; plan: unknown };
    assert.equal(result.provider, "Ollama");
    const plan = ideaPlanSchema.parse(result.plan),
      old = casework(previous);
    assert.deepEqual(casework(plan), {
      ...old,
      parameters: { ...old.parameters, height: 80, shelfCount: 4 },
    });
    assert.match(JSON.stringify(upstream), /casework-shelves/);
    assert.equal(applyIdeaPlan(blank(), plan).pieces.length, 9);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
    if (oldFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = oldFormat;
  }
});
