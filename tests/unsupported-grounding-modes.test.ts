import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { localIdeaPlan } from "../src/planning";
import {
  groundUnsupportedPlan,
  assessUnsupportedIntent,
} from "../src/unsupportedIntent";
import { assessUnsupportedIntent as compatibleAssessment } from "../server/unsupportedIntent";
import { plannerHandler } from "../server/planner";
import type { IdeaPlan } from "../src/planSchema";

const primary = [
  "Design a pool with plumbing and drains",
  "Plan electrical wiring for a bathroom",
  "Design an HVAC ductwork layout",
  "Dig a trench for a sprinkler system",
];
const boundaryNote = /systems and their interfaces are not modeled/;

test("local primary-system scope is checked before shelf-delta and previous-furniture reducers", () => {
  for (const prompt of primary) {
    const plan = localIdeaPlan({ prompt });
    assert.deepEqual(plan.modules, [], prompt);
    assert.deepEqual(plan.structures, [], prompt);
    assert.ok(
      plan.questions.some((q) => /does not model/.test(q)),
      prompt,
    );
  }
  const previous = localIdeaPlan({
    prompt: "Plywood bookcase36in wide16in deep72in high with3 shelves",
  });
  const before = JSON.stringify(previous),
    next = localIdeaPlan({
      prompt: "Add one shelf to the bookcase and route new electrical wiring",
      previousPlan: previous,
    });
  assert.deepEqual(next.structures, previous.structures);
  assert.deepEqual(next.modules, previous.modules);
  assert.ok(next.questions.some((q) => /electrical/.test(q)));
  assert.equal(JSON.stringify(previous), before);
});

test("local furniture, utility enclosures and negated systems remain supported with context-only notes", () => {
  for (const prompt of [
    "Build a bench beside the pool",
    "A banquette next to the pool with storage",
    "Build a cabinet around the existing electrical panel",
    "A vanity cabinet with clearance around existing plumbing and drains",
    "Build a cabinet near electrical wiring and plumbing",
  ]) {
    const plan = localIdeaPlan({ prompt });
    assert.ok(plan.modules.length || plan.structures.length, prompt);
    assert.match(
      [...plan.assumptions, ...plan.suggestions, ...plan.questions].join(" "),
      boundaryNote,
      prompt,
    );
  }
  for (const prompt of [
    "No pool or plumbing work; build a bench",
    "Plan a pool table frame",
    "Build a poolside bench",
    "A storage cabinet without plumbing",
  ])
    assert.ok(localIdeaPlan({ prompt }).modules.length > 0, prompt);
});

test("shared grounding preserves source requirements and valid model paraphrases; genuine clarification questions survive", () => {
  assert.equal(compatibleAssessment, assessUnsupportedIntent);
  assert.equal(
    assessUnsupportedIntent(
      "Something cozy to sit on with hidden bins underneath",
    ),
    null,
  );
  const bench = localIdeaPlan({ prompt: "A storage bench" });
  assert.equal(
    groundUnsupportedPlan(
      { prompt: "Something cozy to sit on with hidden bins underneath" },
      bench,
    ),
    bench,
  );
  const previous = localIdeaPlan({ prompt: "A cabinet" });
  previous.assumptions = Array.from(
    { length: 12 },
    (_, i) => `Manufacturer requirement${i + 1}: retain this exact rule.`,
  );
  const noted = groundUnsupportedPlan(
    { prompt: "A cabinet near the electrical panel", previousPlan: previous },
    previous,
  )!;
  assert.deepEqual(noted.assumptions, previous.assumptions);
  assert.match(
    [...noted.assumptions, ...noted.suggestions, ...noted.questions].join(" "),
    boundaryNote,
  );
  const question = "Which measured system boundary should be documented?";
  const clarify: IdeaPlan = {
    title: "Clarify",
    summary: "Need scope",
    assumptions: [],
    suggestions: [],
    questions: [question],
    modules: [],
    structures: [],
  };
  const grounded = groundUnsupportedPlan(
    { prompt: "Plan a pool drain", previousPlan: previous },
    clarify,
  )!;
  assert.deepEqual(grounded.modules, previous.modules);
  assert.deepEqual(grounded.structures, previous.structures);
  assert.ok(grounded.questions.includes(question));
  assert.ok(grounded.questions.length <= 8);
  assert.deepEqual(
    groundUnsupportedPlan({ prompt: "Choose the chair style" }, clarify),
    clarify,
  );
});

test("full-schema HTTP grounds only completed valid proposals and never turns truncation/failure into clarification success", async () => {
  const previous = localIdeaPlan({
      prompt: "Plywood bookcase36in wide16in deep72in high with3 shelves",
    }),
    before = JSON.stringify(previous),
    wrongBench = localIdeaPlan({ prompt: "Bench60in wide24in deep18in high" });
  let proposed: IdeaPlan = wrongBench,
    done = true,
    reason = "stop",
    upstreamStatus = 200,
    calls = 0;
  const requestBodies: Record<string, unknown>[] = [];
  const upstream = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls++;
    requestBodies.push(JSON.parse(body));
    res.statusCode = upstreamStatus;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        done,
        done_reason: reason,
        message: { role: "assistant", content: JSON.stringify(proposed) },
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const oldUrl = process.env.OLLAMA_URL,
    oldFormat = process.env.OLLAMA_PLANNER_FORMAT;
  process.env.OLLAMA_URL = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`;
  process.env.OLLAMA_PLANNER_FORMAT = "schema";
  const app = express();
  app.use(express.json());
  app.post("/api/planner", (req, res, next) => {
    plannerHandler(req, res).catch(next);
  });
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(400).json({ error: error.message }),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = async (prompt: string, previousPlan?: IdeaPlan) => {
    const count = calls,
      response = await fetch(base + "/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, previousPlan }),
        signal: AbortSignal.timeout(5000),
      }),
      data = await response.json();
    assert.equal(
      calls,
      count + 1,
      "exactly one mocked provider call; no primary-system pre-model bypass or retry",
    );
    return { response, data };
  };
  try {
    for (const prompt of primary) {
      const { response, data } = await post(prompt);
      assert.equal(response.status, 200);
      assert.equal(data.provider, "Ollama");
      assert.deepEqual(data.plan.modules, []);
      assert.deepEqual(data.plan.structures, []);
      assert.ok(
        data.plan.questions.some((q: string) => /does not model/.test(q)),
      );
      assert.equal(
        data.timing,
        undefined,
        "full-schema grounding does not invent sparse-protocol timing evidence",
      );
    }
    const retained = await post(
      "Add one shelf and route new electrical wiring",
      previous,
    );
    assert.deepEqual(retained.data.plan.structures, previous.structures);
    assert.deepEqual(retained.data.plan.modules, previous.modules);
    assert.equal(JSON.stringify(previous), before);
    const adjacent = await post("A bench beside the pool");
    assert.deepEqual(adjacent.data.plan.modules, wrongBench.modules);
    assert.match(
      [
        ...adjacent.data.plan.assumptions,
        ...adjacent.data.plan.suggestions,
        ...adjacent.data.plan.questions,
      ].join(" "),
      boundaryNote,
    );
    const paraphrase = await post(
      "Something cozy to sit on with hidden bins underneath",
    );
    assert.deepEqual(paraphrase.data.plan, wrongBench);
    proposed = {
      title: "Clarify",
      summary: "Need scope",
      assumptions: [],
      suggestions: [],
      questions: ["Which measured system boundary should be documented?"],
      modules: [],
      structures: [],
    };
    const clarify = await post("Plan a pool drain");
    assert.ok(clarify.data.plan.questions.includes(proposed.questions[0]));
    for (const envelope of [
      { done: true, reason: "length" },
      { done: false, reason: "stop" },
      { done: true, reason: "load" },
    ]) {
      done = envelope.done;
      reason = envelope.reason;
      const failed = await post("Plan pool plumbing", previous);
      assert.equal(failed.response.status, 400);
      assert.equal(failed.data.plan, undefined);
    }
    done = true;
    reason = "stop";
    proposed = {
      ...wrongBench,
      modules: [{ ...wrongBench.modules[0], width: 9999 }],
    };
    const invalidTyped = await post("Plan pool plumbing");
    assert.equal(invalidTyped.response.status, 400);
    assert.equal(
      invalidTyped.data.plan,
      undefined,
      "normally stopped but invalid typed output is not rescued",
    );
    done = true;
    reason = "stop";
    upstreamStatus = 503;
    const httpFailure = await post("Plan pool plumbing");
    assert.equal(httpFailure.response.status, 400);
    assert.equal(httpFailure.data.plan, undefined);
    assert.ok(
      requestBodies.every(
        (body) => !!(body.format as { properties?: unknown })?.properties,
      ),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    if (oldUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldUrl;
    if (oldFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = oldFormat;
  }
});
