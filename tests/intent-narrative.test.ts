import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileNarrative } from "../server/intentNarrative";
import { generateIntentPlan, intentMessages } from "../server/intentPlanner";
import { ideaPlanSchema, localIdeaPlan } from "../src/planning";
const captured = () =>
  ideaPlanSchema.parse(
    JSON.parse(
      readFileSync(
        new URL("./fixtures/intent-narrative-l.json", import.meta.url),
        "utf8",
      ),
    ),
  );

test("captured real L proposal narrative uses final84×60 footprint and actual feature flags", () => {
  const plan = captured(),
    next = reconcileNarrative(plan);
  assert.equal(next.title, "2-section banquette");
  assert.match(next.summary, /84 × 60 in/);
  assert.match(next.summary, /0 opening lids/);
  assert.match(next.summary, /Back height above the seat: 18 in/);
  assert.doesNotMatch(next.summary, /72/);
  assert.ok(
    next.assumptions.includes(
      "Provisional back height: 18 in above the seat. Verify before cutting.",
    ),
  );
  assert.doesNotMatch(
    next.assumptions.join(" "),
    /Storage is enclosed|Seat lids can be shown/,
  );
  assert.match(next.assumptions.join(" "), /Panel joints and fasteners/);
  assert.doesNotMatch(next.suggestions.join(" "), /Seat lids are modeled/);
  ideaPlanSchema.parse(next);
});
test("narrative reconciliation retains geometry, exact materials, poses, questions and references", () => {
  const plan = captured();
  plan.modules[0].panelMaterial = "plytanium-703";
  plan.modules[1].position = [90, 6, -30];
  plan.modules[1].yaw = 35;
  const before = JSON.stringify({
      modules: plan.modules,
      structures: plan.structures,
      questions: plan.questions,
    }),
    next = reconcileNarrative(plan);
  assert.equal(
    JSON.stringify({
      modules: next.modules,
      structures: next.structures,
      questions: next.questions,
    }),
    before,
  );
  assert.equal(next.modules, plan.modules);
  assert.equal(next.structures, plan.structures);
  assert.equal(next.questions, plan.questions);
});
test("partial storage is counted without describing every seat as enclosed or opening", () => {
  const plan = localIdeaPlan({
    prompt: "Three-section storage banquette, opening lids and no back",
  });
  for (const i of [1, 2]) {
    plan.modules[i].storage = false;
    plan.modules[i].openingLid = false;
  }
  const next = reconcileNarrative(plan);
  assert.equal(next.title, "3-section banquette");
  assert.match(next.summary, /1 enclosed for storage, 1 opening lid/);
  assert.ok(
    next.assumptions.some((note) => note.startsWith("Seat lids can be shown")),
  );
});
test("manufacturer requirements and unknown review notes survive obsolete feature filtering verbatim", () => {
  const plan = captured(),
    required =
      "Manufacturer rod supports require maximum32-inch spacing and substrate-specific attachments.";
  plan.assumptions.push(required);
  plan.suggestions[1] += " " + required;
  const next = reconcileNarrative(plan);
  assert.ok(next.assumptions.includes(required));
  assert.ok(next.suggestions.some((note) => note.endsWith(required)));
  assert.ok(next.assumptions.some((note) => note.includes("load capacity")));
});
test("mixed project narrative describes final furniture and structure types without replacing either", () => {
  const plan = ideaPlanSchema.parse({
      ...captured(),
      modules: [
        ...captured().modules,
        localIdeaPlan({ prompt: "Cabinet" }).modules[0],
      ],
      structures: localIdeaPlan({
        prompt: "Greenhouse seven feet wide, eight feet deep, 7.5 feet high",
      }).structures,
    }),
    next = reconcileNarrative(plan);
  assert.equal(next.title, "Mixed project design");
  assert.match(next.summary, /1 cabinet/);
  assert.match(next.summary, /Greenhouse study: outside 84 × 96 in/);
  assert.equal(next.modules, plan.modules);
  assert.equal(next.structures, plan.structures);
  ideaPlanSchema.parse(next);
});
test("clarification narrative retains all data and empty proposals claim no built geometry", () => {
  const plan = {
      ...captured(),
      summary:
        "Your previous proposal is retained while the edit is clarified.",
      questions: ["Which section should change?"],
    },
    next = reconcileNarrative(plan);
  assert.match(next.summary, /retained while the edit is clarified/);
  assert.equal(next.modules, plan.modules);
  assert.equal(next.questions, plan.questions);
  const empty = ideaPlanSchema.parse({
    title: "42 rooms",
    summary: "A72-inch pool has been built",
    modules: [],
    structures: [],
    assumptions: [],
    suggestions: [],
    questions: ["Which project?"],
  });
  assert.equal(reconcileNarrative(empty).title, "Clarify the project");
  assert.doesNotMatch(reconcileNarrative(empty).summary, /72|built/);
});
test("native sparse schema omits narrative output and still validates returned design intent", async () => {
  const originalFetch = globalThis.fetch,
    oldUrl = process.env.OLLAMA_URL;
  let body: Record<string, any> | undefined;
  process.env.OLLAMA_URL = "http://ollama.invalid";
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        done: true,
        done_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify({
            family: "bench",
            operation: "create",
            width: 72,
            height: 18,
          }),
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const next = await generateIntentPlan({ prompt: "A bench" });
    assert.equal(typeof body?.format, "object");
    const design = body?.format.oneOf[0], clarify = body?.format.oneOf[1];
    assert.equal(design.properties.storage.type, "boolean");
    assert.equal(design.properties.questions, undefined);
    assert.equal(design.properties.summary, undefined);
    assert.equal(design.properties.suggestions, undefined);
    assert.equal(design.additionalProperties, false);
    assert.deepEqual(design.required, ["family", "operation"]);
    assert.equal(clarify.properties.question.maxLength, 240);
    assert.doesNotMatch(next.summary, /return|three opening lids/);
    assert.match(
      intentMessages({ prompt: "bench" })[0].content,
      /doorWidth, doorHeight/,
    );
    assert.match(intentMessages({ prompt: "bench" })[0].content, /Return no summary, suggestions, questions array/);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({ family: "bench", questions: false }),
          },
        }),
        { status: 200 },
      );
    await assert.rejects(() => generateIntentPlan({ prompt: "bench" }));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldUrl;
  }
});

test("obsolete generated run/back clauses preserve appended manufacturer requirements", () => {
  const plan = captured(),
    required =
      "Manufacturer attachment schedule remains unresolved; use only the selected approved fasteners.";
  plan.assumptions.push(
    `The 2 sections are arranged side by side in one straight run; confirm whether you instead want an L or U layout. ${required}`,
  );
  plan.assumptions.push(
    `Provisional back height: 16 in above the seat. Verify before cutting. ${required}`,
  );
  const next = reconcileNarrative(plan);
  assert.ok(next.assumptions.includes(required));
  assert.ok(
    next.assumptions.some(
      (note) =>
        note.startsWith("Back heights above the seat: 18 in.") &&
        note.endsWith(required),
    ),
  );
  assert.equal(next.modules, plan.modules);
});
