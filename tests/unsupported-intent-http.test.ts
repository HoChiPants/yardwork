import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { localIdeaPlan } from "../src/planning";

test("HTTP raw unsupported grounding rejects wrong bench geometry and never writes a project", async () => {
  let mode: "bench" | "clarify" | "truncated" = "bench",
    calls = 0;
  const mock = createServer(async (req, res) => {
    for await (const _chunk of req) {
      /* Consume the mocked request without logging private payload. */
    }
    calls++;
    const content =
      mode === "clarify"
        ? {
            family: "clarify",
            operation: "clarify",
            question: "Which measured system boundary should be documented?",
          }
        : {
            family: "bench",
            operation: "create",
            width: 72,
            depth: 24,
            height: 18,
          };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        done: true,
        done_reason: mode === "truncated" ? "length" : "stop",
        message: { role: "assistant", content: JSON.stringify(content) },
        eval_count: 20,
        eval_duration: 1000000,
      }),
    );
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const mockPort = (mock.address() as { port: number }).port,
    directory = await mkdtemp(path.join(os.tmpdir(), "yardwork-unsupported-")),
    reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
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
        OLLAMA_URL: `http://127.0.0.1:${mockPort}`,
        OLLAMA_MODEL: "mock-only-no-native",
        OLLAMA_PLANNER_FORMAT: "compact",
      },
      stdio: "pipe",
    },
  );
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.stdout.on("data", () => {});
  const base = `http://127.0.0.1:${port}`;
  const post = (
    prompt: string,
    previousPlan?: ReturnType<typeof localIdeaPlan>,
  ) =>
    fetch(base + "/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, previousPlan }),
    });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for the isolated test server only. */
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(ready, output || "Isolated test server did not start");
    for (const prompt of [
      "Design a pool with plumbing and drains",
      "Plan electrical wiring for a bathroom",
      "Dig a trench and design the sprinkler system",
    ]) {
      const before = calls,
        response = await post(prompt),
        data = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(data.plan.modules, []);
      assert.deepEqual(data.plan.structures, []);
      assert.ok(
        data.plan.questions.some((question: string) =>
          /does not model/.test(question),
        ),
      );
      assert.equal(data.timing.outcome, "success");
      assert.equal(calls, before + 1);
    }
    const previous = localIdeaPlan({
        prompt:
          "A banquette 72 inches wide,24 inches deep,18 inches seat height,three sections,storage,opening lids,no back",
      }),
      serialized = JSON.stringify(previous);
    const retained = await post(
        "Add plumbing and drains to this design",
        previous,
      ),
      retainedData = await retained.json();
    assert.equal(retained.status, 200);
    assert.deepEqual(retainedData.plan.modules, previous.modules);
    assert.deepEqual(retainedData.plan.structures, previous.structures);
    assert.equal(JSON.stringify(previous), serialized);
    const adjacent = await post("A banquette next to the pool with storage"),
      adjacentData = await adjacent.json();
    assert.equal(adjacent.status, 200);
    assert.ok(adjacentData.plan.modules.length > 0);
    assert.match(
      [...adjacentData.plan.assumptions, ...adjacentData.plan.suggestions].join(
        " ",
      ),
      /interfaces are not modeled/,
    );
    mode = "clarify";
    const genuine = await post("Plan a pool drain"),
      genuineData = await genuine.json();
    assert.equal(genuine.status, 200);
    assert.ok(
      genuineData.plan.questions.includes(
        "Which measured system boundary should be documented?",
      ),
    );
    assert.deepEqual(genuineData.plan.modules, []);
    mode = "truncated";
    const truncated = await post("Plan a pool drain"),
      truncatedData = await truncated.json();
    assert.equal(truncated.status, 400);
    assert.equal(truncatedData.timing.outcome, "incomplete");
    assert.deepEqual(await (await fetch(base + "/api/projects")).json(), []);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
