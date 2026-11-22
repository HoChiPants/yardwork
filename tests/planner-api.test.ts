import { test } from "node:test";
import { createServer } from "node:http";
import { once, EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { plannerHandler } from "../server/planner";
import { localIdeaPlan } from "../src/planning";
import type { Request, Response } from "express";

test("relative follow-ups use current workspace dimensions with Ollama configured", async () => {
  const originalURL = process.env.OLLAMA_URL, originalFetch = globalThis.fetch;
  const previousPlan = localIdeaPlan({ prompt: "Build a bench 60 inches wide" });
  let payload: { provider: string; plan: typeof previousPlan } | undefined;
  const res = Object.assign(new EventEmitter(), {
    json(value: typeof payload) {
      payload = value;
      return this;
    },
  }) as unknown as Response;
  try {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    globalThis.fetch = async () => { throw Error("A measured resize should resolve before calling Ollama."); };
    await plannerHandler({ body: { prompt: "Make it six inches wider", previousPlan } } as Request, res);
    assert.equal(payload?.provider, "Workspace dimensions");
    assert.equal(payload?.plan.modules[0].width, 66);
    assert.equal(previousPlan.modules[0].width, 60);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalURL;
  }
});

test("closing a planner response cancels model generation and removes disconnect listeners", async () => {
  const oldURL = process.env.OLLAMA_URL,
    oldFormat = process.env.OLLAMA_PLANNER_FORMAT,
    oldFetch = globalThis.fetch;
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false,
    json() {
      throw Error("Canceled request must not respond");
    },
  }) as unknown as Response;
  try {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_PLANNER_FORMAT = "compact";
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = async (_url, init) =>
      new Promise<globalThis.Response>((_resolve, reject) => {
        observedSignal = init!.signal as AbortSignal;
        observedSignal.addEventListener(
          "abort",
          () => reject(observedSignal!.reason),
          { once: true },
        );
        ready();
      });
    const pending = plannerHandler(
      { body: { prompt: "Build a bench" } } as Request,
      res,
    );
    await started;
    assert.equal(observedSignal?.aborted, false);
    res.emit("close");
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(observedSignal?.aborted, true);
    assert.equal(res.listenerCount("close"), 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
    if (oldFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = oldFormat;
  }
});

test("planner uses disclosed local presets, validates model plans, and never falls back silently on provider failure", async () => {
  const originalURL = process.env.OLLAMA_URL,
    originalModel = process.env.OLLAMA_MODEL,
    originalFormat = process.env.OLLAMA_PLANNER_FORMAT,
    originalFetch = globalThis.fetch;
  let payload: unknown;
  const req = { body: { prompt: "A kitchenette banquette" } } as Request,
    res = Object.assign(new EventEmitter(), {
      json(value: unknown) {
        payload = value;
        return this;
      },
    }) as unknown as Response;
  try {
    delete process.env.OLLAMA_URL;
    delete process.env.OLLAMA_PLANNER_FORMAT;
    await plannerHandler(req, res);
    assert.equal((payload as any).provider, "Local planning presets");
    assert.equal((payload as any).plan.modules[0].kind, "bench");
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL = "planner-test-model";
    let called: any;
    globalThis.fetch = async (_url, options) => {
      called = JSON.parse(options!.body as string);
      return new globalThis.Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify(
              called.options.num_ctx === 4096
                ? {
                    family: "bench",
                    operation: "create",
                    width: 60,
                    depth: 24,
                    height: 18,
                  }
                : localIdeaPlan({
                    prompt: "Bench 5 ft wide, 24 inches deep, 18 inches high",
                  }),
            ),
          },
        }),
        { status: 200 },
      );
    };
    await plannerHandler(req, res);
    assert.equal((payload as any).provider, "Ollama");
    assert.equal(called.model, "planner-test-model");
    assert.ok(called.format.oneOf[0].properties.family);
    assert.ok(called.messages[0].content.includes("Extract DIY design intent"));
    assert.equal(called.options.num_ctx, 4096);
    process.env.OLLAMA_PLANNER_FORMAT = "schema";
    await plannerHandler(req, res);
    assert.ok(called.format.properties.modules);
    assert.equal(
      called.format.properties.modules.items.properties.position.items,
      undefined,
    );
    const priorProposal = payload;
    globalThis.fetch = async () => new globalThis.Response(JSON.stringify({
      done: true, done_reason: "length",
      message: { role: "assistant", content: JSON.stringify(localIdeaPlan({ prompt: "A bench" })) },
    }));
    await assert.rejects(() => plannerHandler(req, res), /truncated proposal/);
    assert.equal(payload, priorProposal, "A complete-looking but truncated full-schema response cannot replace a proposal");
    delete process.env.OLLAMA_PLANNER_FORMAT;
    globalThis.fetch = async () =>
      new globalThis.Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              title: "bad",
              modules: [{ width: 9999 }],
            }),
          },
        }),
        { status: 200 },
      );
    await assert.rejects(() => plannerHandler(req, res));
    globalThis.fetch = async () =>
      new globalThis.Response("{}", { status: 503 });
    await assert.rejects(
      () => plannerHandler(req, res),
      /AI planner could not complete/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalURL;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
    if (originalFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = originalFormat;
  }
});

test("HTTP planner route returns local questions, bounded AI modules, and errors without mutating stored projects", async () => {
  let responseMode: "valid" | "unknown-material" | "malformed" | "truncated" | "failure" =
    "valid";
  let installedModel = false;
  const requests: any[] = [];
  const mock = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/api/tags") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ models: installedModel ? [{ name: "http-planner-fixture:latest" }] : [] }));
      return;
    }
    let input = "";
    for await (const chunk of req) input += chunk;
    requests.push(JSON.parse(input));
    res.setHeader("content-type", "application/json");
    if (responseMode === "failure") {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    const plan: any = {
      family: "bench",
      operation: "create",
      width: 60,
      depth: 24,
      height: 20,
    };
    if (responseMode === "unknown-material")
      plan.frameMaterial = "unlisted-board";
    res.end(
      JSON.stringify({
        done: true,
        done_reason: responseMode === "truncated" ? "length" : "stop",
        message: {
          role: "assistant",
          content:
            responseMode === "malformed" ? "{not JSON" : JSON.stringify(plan),
        },
      }),
    );
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const enginePort = (mock.address() as { port: number }).port;
  const directory = await mkdtemp(path.join(os.tmpdir(), "yardwork-planner-"));
  async function start(withModel: boolean) {
    const reserve = createServer();
    reserve.listen(0, "127.0.0.1");
    await once(reserve, "listening");
    const port = (reserve.address() as { port: number }).port;
    await new Promise<void>((r) => reserve.close(() => r()));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          PORT: String(port),
          DATA_DIR: directory,
          OLLAMA_URL: withModel ? `http://127.0.0.1:${enginePort}` : "",
          OLLAMA_MODEL: "http-planner-fixture",
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stderr.on("data", (c) => (output += c));
    child.stdout.on("data", () => {});
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) return { base, child };
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    child.kill("SIGTERM");
    throw Error(output || "Planner test server failed to start.");
  }
  const post = (base: string, prompt: string) =>
    fetch(`${base}/api/planner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        workZone: { width: 84, depth: 60, height: 84 },
        existingSections: [],
      }),
    });
  try {
    const local = await start(false);
    try {
      const response = await post(
        local.base,
        "I want kitchenette banquette seating",
      );
      assert.equal(response.status, 200);
      const data = (await response.json()) as any;
      assert.equal(data.provider, "Local planning presets");
      assert.equal(data.plan.modules[0].kind, "bench");
      const unknown = await post(local.base, "Design a pool with plumbing");
      const question = (await unknown.json()) as any;
      assert.equal(unknown.status, 200);
      assert.equal(question.plan.modules.length, 0);
      assert.ok(question.plan.questions.length);
    } finally {
      local.child.kill("SIGTERM");
      await once(local.child, "exit");
    }
    const actual = await start(true);
    try {
      const connection = () => fetch(actual.base + "/api/planner/connection").then((response) => response.json());
      assert.deepEqual(await connection(), { state: "missing-model", model: "http-planner-fixture" });
      installedModel = true;
      assert.deepEqual(await connection(), { state: "installed", model: "http-planner-fixture" });
      assert.equal(requests.length, 0);
      const builtIn = await fetch(actual.base + "/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Build a wall 8 ft wide and 6 ft tall", builtIn: true }),
      });
      assert.equal(builtIn.status, 200);
      const builtInResult = await builtIn.json() as { command: { width: number; height: number }; provider: string };
      assert.equal(builtInResult.provider, "Local command parser");
      assert.equal(builtInResult.command.width, 96);
      assert.equal(builtInResult.command.height, 72);
      assert.equal(requests.length, 0);
      const response = await post(actual.base, "A bench for my kitchenette");
      assert.equal(response.status, 200);
      const proposal = (await response.json()) as any;
      assert.equal(proposal.provider, "Ollama");
      assert.equal(proposal.timing.outcome, "success");
      assert.equal(proposal.timing.protocol, "sparse-intent-v1");
      assert.equal(proposal.timing.completionReason, "stop");
      assert.ok(proposal.timing.wallDurationMs >= 0);
      assert.equal(requests[0].model, "http-planner-fixture");
      assert.ok(requests[0].format.oneOf[0].properties.family);
      assert.ok(requests[0].messages[0].content.includes('"width":84'));
      responseMode = "unknown-material";
      assert.equal((await post(actual.base, "Bad fixture")).status, 400);
      responseMode = "malformed";
      assert.equal((await post(actual.base, "Malformed fixture")).status, 400);
      responseMode = "truncated";
      const truncated = await post(actual.base, "SYNTHETIC private truncated fixture");
      assert.equal(truncated.status, 400);
      const rejected = (await truncated.json()) as any;
      assert.match(rejected.error, /truncated proposal/);
      assert.equal(rejected.timing.outcome, "incomplete");
      assert.equal(rejected.timing.completionReason, "length");
      assert.equal(rejected.plan, undefined);
      assert.doesNotMatch(JSON.stringify(rejected.timing), /SYNTHETIC|fixture|private/);
      assert.equal(Object.hasOwn(rejected.timing, "prompt"), false);
      assert.equal(Object.hasOwn(rejected.timing, "content"), false);
      responseMode = "failure";
      const failed = await post(actual.base, "Unavailable fixture");
      assert.equal(failed.status, 400);
      assert.match(((await failed.json()) as any).error, /AI planner/);
      const stored = await fetch(`${actual.base}/api/projects`);
      assert.deepEqual(
        await stored.json(),
        [],
        "Generating proposals must not save or modify projects.",
      );
      const legacy = await fetch(`${actual.base}/api/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "a chicken coop" }),
      });
      // A configured model may fail before its command is read; local coop rejection is covered by model/parser tests.
      assert.ok(!legacy.ok);
    } finally {
      actual.child.kill("SIGTERM");
      await once(actual.child, "exit");
    }
  } finally {
    await new Promise<void>((r) => mock.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("measured closet openings resolve quickly when an Ollama connection is configured", async () => {
  const oldURL = process.env.OLLAMA_URL;
  const oldFormat = process.env.OLLAMA_PLANNER_FORMAT;
  const oldFetch = globalThis.fetch;
  const previousPlan = localIdeaPlan({
    prompt: "Closet insert overall width 72 inches and overall height 84 inches.",
  });
  let payload: { provider: string; plan: typeof previousPlan } | undefined;
  const response = Object.assign(new EventEmitter(), {
    json(value: typeof payload) {
      payload = value;
      return this;
    },
  }) as unknown as Response;
  try {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_PLANNER_FORMAT = "schema";
    globalThis.fetch = async () => { throw Error("A measured bay should resolve before calling Ollama."); };
    await plannerHandler({
      body: { previousPlan, prompt: "Set the left hanging bay width to 36 inches and rod center height to 62 inches." },
    } as Request, response);
    assert.equal(payload?.provider, "Workspace dimensions");
    const revised = payload?.plan.structures[0];
    if (revised?.kind !== "closet-insert") throw Error("Expected a closet insert");
    assert.equal(revised.parameters.width, 72);
    assert.equal(revised.parameters.height, 84);
    assert.equal(revised.parameters.leftBayWidth, 36);
    assert.equal(revised.parameters.rodHeight, 62);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
    if (oldFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = oldFormat;
  }
});
