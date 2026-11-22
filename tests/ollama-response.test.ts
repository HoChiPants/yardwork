import assert from "node:assert/strict";
import test from "node:test";
import { generateIntentPlan, modelIntentSchema } from "../server/intentPlanner";
import {
  completedOllamaJson,
  ollamaTimingReceipt,
  OllamaResponseError,
  type OllamaTimingReceipt,
} from "../server/ollamaResponse";
import { localIdeaPlan } from "../src/planning";

const intent = {
  family: "bench",
  operation: "create",
  width: 60,
  depth: 24,
  height: 18,
};
const completed = (content: unknown = intent) => ({
  done: true,
  done_reason: "stop",
  message: { role: "assistant", content: JSON.stringify(content) },
});
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
async function withProvider(mock: typeof fetch, run: () => Promise<void>) {
  const oldFetch = globalThis.fetch,
    oldURL = process.env.OLLAMA_URL,
    oldTimeout = process.env.OLLAMA_TIMEOUT_MS;
  process.env.OLLAMA_URL = "http://ollama.invalid";
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
    if (oldTimeout === undefined) delete process.env.OLLAMA_TIMEOUT_MS;
    else process.env.OLLAMA_TIMEOUT_MS = oldTimeout;
  }
}

test("archived native completion metadata replays without claiming new sparse inference success", () => {
  // Actual envelope fields: work/ollama-full-compact-grammar.jsonl, 2026-11-16.
  // Its old narrative-bearing content remains an internal replay, not a v1 wire result.
  const oldIntent = {
    family: "banquette",
    operation: "revise",
    summary:
      'L-shaped kitchenette banquette with two modules, 72"L x 54"W x 18"H, 24" seat depth, wood back.',
    questions: ["Is the seat depth and height correct for the intended use?"],
    suggestions: [
      "Consider adding a small storage area under the bench for added functionality.",
    ],
  };
  const archived = {
      model: "qwen2.5:3b",
      created_at: "2026-11-16T20:24:31.716107962Z",
      ...completed(oldIntent),
      total_duration: 14706771423,
      load_duration: 2577750,
      prompt_eval_count: 398,
      prompt_eval_cached_count: 321,
      prompt_eval_duration: 2837435000,
      eval_count: 99,
      eval_duration: 11803494000,
    },
    before = JSON.stringify(archived);
  assert.deepEqual(
    modelIntentSchema.parse(completedOllamaJson(archived)),
    oldIntent,
  );
  const timing = ollamaTimingReceipt("success", 14798, 200, archived);
  assert.equal(timing.totalDurationMs, 14706.771423);
  assert.equal(timing.loadDurationMs, 2.57775);
  assert.equal(timing.promptEvalDurationMs, 2837.435);
  assert.equal(timing.evalDurationMs, 11803.494);
  assert.equal(timing.evalCount, 99);
  assert.equal(timing.promptEvalCount, 398);
  assert.equal(timing.promptEvalCachedCount, 321);
  assert.equal(JSON.stringify(archived), before);
});

test("only explicitly normal completed generations can yield a proposal", () => {
  const valid = completed();
  assert.deepEqual(completedOllamaJson(valid), intent);
  for (const body of [
    null,
    [],
    "not an envelope",
    { ...valid, done: false },
    { ...valid, done: undefined },
    { ...valid, done_reason: undefined },
    { ...valid, done_reason: "length" },
    { ...valid, done_reason: "load" },
    { ...valid, done_reason: "unload" },
    { ...valid, done_reason: "unrecognized-provider-stop" },
  ])
    assert.throws(() => completedOllamaJson(body), OllamaResponseError);
  assert.throws(
    () => completedOllamaJson({ ...valid, done_reason: "length" }),
    /truncated proposal/,
  );
});

test("missing assistant content, tool calls and nonobject/unreadable JSON fail without raw excerpts", () => {
  const secret = "PRIVATE_RAW_RESPONSE_DO_NOT_ECHO",
    valid = completed();
  for (const body of [
    { ...valid, error: secret },
    { ...valid, message: undefined },
    { ...valid, message: { content: JSON.stringify(intent) } },
    { ...valid, message: { role: "user", content: JSON.stringify(intent) } },
    { ...valid, message: { role: "assistant", content: "  " } },
    { ...valid, message: { role: "assistant", content: 5 } },
    { ...valid, message: { role: "assistant", content: `{${secret}` } },
    { ...valid, message: { role: "assistant", content: "null" } },
    { ...valid, message: { role: "assistant", content: "[]" } },
    {
      ...valid,
      message: {
        ...valid.message,
        tool_calls: [{ function: { name: secret } }],
      },
    },
  ])
    assert.throws(
      () => completedOllamaJson(body),
      (error: unknown) =>
        error instanceof OllamaResponseError &&
        !error.message.includes(secret) &&
        /workspace has not changed/.test(error.message),
    );
  assert.deepEqual(
    completedOllamaJson({
      ...valid,
      message: { ...valid.message, tool_calls: [] },
    }),
    intent,
  );
});

test("timing receipts retain zero, ignore malformed metrics, and whitelist no arbitrary strings or secrets", () => {
  const receipt = ollamaTimingReceipt("incomplete", 12, 200, {
    done_reason: "PRIVATE_REASON",
    model: "SECRET_MODEL",
    prompt: "SECRET_PROMPT",
    message: { content: "SECRET_CONTENT" },
    error: "SECRET_ERROR",
    url: "SECRET_URL",
    total_duration: 0,
    load_duration: "123",
    prompt_eval_duration: -1,
    eval_duration: Infinity,
    prompt_eval_count: 0,
    prompt_eval_cached_count: 2.5,
    eval_count: Number.MAX_SAFE_INTEGER + 1,
  });
  assert.equal(receipt.completionReason, "other");
  assert.equal(receipt.totalDurationMs, 0);
  assert.equal(receipt.promptEvalCount, 0);
  for (const field of [
    "loadDurationMs",
    "promptEvalDurationMs",
    "evalDurationMs",
    "promptEvalCachedCount",
    "evalCount",
  ] as const)
    assert.equal(receipt[field], null);
  assert.doesNotMatch(JSON.stringify(receipt), /SECRET|PRIVATE_REASON/);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(
    ollamaTimingReceipt("http-error", NaN, 0, null).httpStatus,
    null,
  );
  assert.equal(
    ollamaTimingReceipt("http-error", NaN, 0, null).wallDurationMs,
    0,
  );
});

test("sparse transport makes one request, uses the converted union grammar and emits one sanitized receipt", async () => {
  let calls = 0;
  const receipts: OllamaTimingReceipt[] = [];
  await withProvider(
    async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.stream, false);
      assert.equal(sent.options.num_ctx, 4096);
      assert.equal(sent.options.num_predict, 512);
      assert.deepEqual(sent.format.oneOf[0].required, ["family", "operation"]);
      const fields = sent.format.oneOf[0].properties;
      assert.deepEqual(fields.family.enum, ["banquette", "bench"]);
      assert.equal(fields.operation.const, "create");
      assert.equal(fields.sectionCount.type, "integer");
      for (const field of ["summary", "roofRise", "shelfCount", "targetSection", "returnLength", "frameMaterial", "panelMaterial"])
        assert.equal(fields[field], undefined, field);
      return reply({
        ...completed(),
        model: "PRIVATE_MODEL",
        total_duration: 7000000,
        load_duration: 1000000,
        eval_count: 20,
        eval_duration: 5000000,
      });
    },
    async () => {
      const result = await generateIntentPlan(
        {
          prompt:
            "PRIVATE_PROMPT bench60 inches wide,24 inches deep,18 inches seat height",
        },
        undefined,
        (receipt) => {
          receipts.push(receipt);
        },
      );
      assert.equal(result.modules[0].width, 60);
      assert.equal(result.modules[0].height, 18);
    },
  );
  assert.equal(calls, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, "success");
  assert.equal(receipts[0].httpStatus, 200);
  assert.equal(receipts[0].loadDurationMs, 1);
  assert.equal(receipts[0].evalDurationMs, 5);
  assert.equal(receipts[0].evalCount, 20);
  assert.ok(receipts[0].wallDurationMs >= 0);
  assert.doesNotMatch(JSON.stringify(receipts), /PRIVATE/);
});

test("transport keeps return measurements, explicit stock and valid edit operations when requested", async () => {
  const previousPlan = localIdeaPlan({ prompt: "a storage banquette with three sections and opening lids" });
  await withProvider(
    async (_url, init) => {
      const { properties: fields } = JSON.parse(String(init?.body)).format.oneOf[0];
      assert.ok(fields.returnLength);
      assert.ok(fields.shape);
      assert.ok(fields.panelMaterial);
      assert.ok(fields.targetSection);
      assert.deepEqual(fields.operation.enum, ["create", "revise", "append"]);
      assert.equal(fields.roofRise, undefined);
      return reply(completed({ family: "clarify", operation: "clarify", question: "How long is the return?" }));
    },
    async () => {
      const plan = await generateIntentPlan({
        prompt: "Make this banquette L-shaped and use plywood.",
        previousPlan,
      });
      assert.deepEqual(plan.modules, previousPlan.modules);
      assert.deepEqual(plan.questions, ["How long is the return?"]);
    },
  );
});

test("an unnamed new design can use an inferred family even if the provider sends a revise operation", async () => {
  await withProvider(
    async (_url, init) => {
      const sent = JSON.parse(String(init?.body));
      const { properties: fields } = sent.format.oneOf[0];
      assert.match(sent.messages[0].content, /worktop for standing tasks is a workbench/);
      assert.ok(fields.family.enum.includes("workbench"));
      assert.ok(fields.family.enum.includes("greenhouse"));
      assert.ok(fields.roofRise);
      assert.equal(fields.operation.const, "create");
      return reply(completed({ ...intent, family: "workbench", operation: "revise", height: 38 }));
    },
    async () => {
      const plan = await generateIntentPlan({
        prompt: "A surface for sorting mail, 60 inches wide, 24 inches deep and 38 inches high.",
      });
      assert.deepEqual(
        plan.modules.map(({ kind, width, depth, height }) => [kind, width, depth, height]),
        [["workbench", 60, 24, 38]],
      );
    },
  );
});

test("HTTP failure never retries, accepts raw error bodies or changes the previous proposal", async () => {
  const previous = localIdeaPlan({ prompt: "bench" }),
    before = JSON.stringify(previous),
    receipts: OllamaTimingReceipt[] = [];
  let calls = 0;
  await withProvider(
    async () => {
      calls++;
      return new Response("SECRET_PROVIDER_ERROR", { status: 503 });
    },
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan(
            { prompt: "Make seat height20 inches", previousPlan: previous },
            undefined,
            (r) => {
              receipts.push(r);
            },
          ),
        /AI planner could not complete/,
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(previous), before);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, "http-error");
  assert.equal(receipts[0].httpStatus, 503);
  assert.doesNotMatch(JSON.stringify(receipts), /SECRET/);
});

test("truncated valid JSON and wrong sparse schema both reject non-destructively with distinct outcomes", async () => {
  const previous = localIdeaPlan({ prompt: "bench" }),
    before = JSON.stringify(previous);
  for (const [body, outcome] of [
    [{ ...completed(), done_reason: "length", eval_count: 512 }, "incomplete"],
    [
      completed({ ...intent, summary: "FORBIDDEN_NARRATIVE" }),
      "invalid-intent",
    ],
    [
      completed({ ...intent, frameMaterial: "unknown-source" }),
      "invalid-intent",
    ],
  ] as const) {
    const receipts: OllamaTimingReceipt[] = [];
    let calls = 0;
    await withProvider(
      async () => {
        calls++;
        return reply(body);
      },
      async () => {
        await assert.rejects(() =>
          generateIntentPlan(
            { prompt: "Make seat height20 inches", previousPlan: previous },
            undefined,
            (r) => {
              receipts.push(r);
            },
          ),
        );
      },
    );
    assert.equal(calls, 1);
    assert.equal(receipts[0].outcome, outcome);
    assert.equal(JSON.stringify(previous), before);
    assert.doesNotMatch(JSON.stringify(receipts), /FORBIDDEN/);
  }
});

test("malformed outer JSON records an invalid response without echoing JSON parser excerpts", async () => {
  const receipts: OllamaTimingReceipt[] = [];
  await withProvider(
    async () => new Response('{"PRIVATE_PROVIDER_BLOB', { status: 200 }),
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan({ prompt: "bench" }, undefined, (r) => {
            receipts.push(r);
          }),
        (error: unknown) =>
          error instanceof Error &&
          /unreadable response JSON/.test(error.message) &&
          !error.message.includes("PRIVATE"),
      );
    },
  );
  assert.equal(receipts[0].outcome, "invalid-response");
  assert.doesNotMatch(JSON.stringify(receipts), /PRIVATE/);
});

test("parent cancellation propagates upstream and emits one canceled receipt", async () => {
  const controller = new AbortController(),
    receipts: OllamaTimingReceipt[] = [];
  let upstream: AbortSignal | undefined;
  await withProvider(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        upstream = init!.signal!;
        upstream.addEventListener("abort", () => reject(upstream!.reason), {
          once: true,
        });
        controller.abort();
      }),
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan({ prompt: "bench" }, controller.signal, (r) => {
            receipts.push(r);
          }),
        { name: "AbortError" },
      );
    },
  );
  assert.equal(upstream?.aborted, true);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].outcome, "cancelled");
});

test("an already canceled request never starts transport", async () => {
  const controller = new AbortController(),
    receipts: OllamaTimingReceipt[] = [];
  controller.abort();
  let calls = 0;
  await withProvider(
    async () => {
      calls++;
      return reply(completed());
    },
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan({ prompt: "bench" }, controller.signal, (r) => {
            receipts.push(r);
          }),
        { name: "AbortError" },
      );
    },
  );
  assert.equal(calls, 0);
  assert.equal(receipts[0].outcome, "cancelled");
});

test("timeout stays a timeout and does not silently invoke a second request", async () => {
  const receipts: OllamaTimingReceipt[] = [];
  let calls = 0;
  await withProvider(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        calls++;
        const signal = init!.signal!;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        // Hold the mock alive while the unref'ed AbortSignal timeout expires.
        const alive = setTimeout(() => {}, 100);
        signal.addEventListener("abort", () => clearTimeout(alive), {
          once: true,
        });
      }),
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan(
            { prompt: "bench" },
            AbortSignal.timeout(5),
            (r) => {
              receipts.push(r);
            },
          ),
        { name: "TimeoutError" },
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(receipts[0].outcome, "timeout");
});

test("cancel-first remains cancellation when a slow mock rejects after the later server deadline", async () => {
  const controller = new AbortController(),
    receipts: OllamaTimingReceipt[] = [];
  await withProvider(
    async () => {
      controller.abort();
      return new Promise<Response>((_resolve, reject) =>
        setTimeout(() => reject(Error("late transport rejection")), 1100),
      );
    },
    async () => {
      process.env.OLLAMA_TIMEOUT_MS = "1000";
      await assert.rejects(
        () =>
          generateIntentPlan({ prompt: "bench" }, controller.signal, (r) => {
            receipts.push(r);
          }),
        { name: "AbortError" },
      );
    },
  );
  assert.equal(receipts[0].outcome, "cancelled");
});

test("a completed late response after cancellation cannot become a usable plan", async () => {
  const controller = new AbortController(),
    receipts: OllamaTimingReceipt[] = [];
  await withProvider(
    async () => {
      controller.abort();
      return reply(completed());
    },
    async () => {
      await assert.rejects(
        () =>
          generateIntentPlan({ prompt: "bench" }, controller.signal, (r) => {
            receipts.push(r);
          }),
        { name: "AbortError" },
      );
    },
  );
  assert.equal(receipts[0].outcome, "cancelled");
  assert.equal(receipts[0].httpStatus, 200);
});

test("an optional observer failure cannot replace a validated planning result", async () => {
  await withProvider(
    async () => reply(completed()),
    async () => {
      const plan = await generateIntentPlan(
        { prompt: "bench" },
        undefined,
        () => {
          throw Error("observer failure");
        },
      );
      assert.equal(plan.modules[0].kind, "bench");
    },
  );
});
