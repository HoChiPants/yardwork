import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { plannerConnectionStatus } from "../server/plannerConnection";

test("planner connection reports whether the configured model is installed without requesting a proposal", async () => {
  let reply = { status: 200, payload: { models: [{ name: "qwen2.5:1.5b" }] } as unknown };
  const requests: string[] = [];
  const service = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(reply.status, { "content-type": "application/json" });
    response.end(JSON.stringify(reply.payload));
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  assert.ok(address && typeof address === "object");
  const { OLLAMA_URL, OLLAMA_MODEL } = process.env;
  const signal = new AbortController().signal;
  try {
    delete process.env.OLLAMA_URL;
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "built-in" });
    assert.deepEqual(requests, []);

    process.env.OLLAMA_URL = `http://127.0.0.1:${address.port}`;
    process.env.OLLAMA_MODEL = "qwen2.5:3b";
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "missing-model", model: "qwen2.5:3b" });
    reply.payload = { models: [{ model: "registry.ollama.ai/library/qwen2.5:3b", digest: "not exposed" }] };
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "installed", model: "qwen2.5:3b" });
    reply.payload = { models: [{ name: "library/custom:latest" }] };
    process.env.OLLAMA_MODEL = "custom";
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "installed", model: "custom" });
    reply.payload = { service: "unexpected" };
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "unreachable", model: "custom" });
    reply.status = 503;
    assert.deepEqual(await plannerConnectionStatus(signal), { state: "unreachable", model: "custom" });
    assert.deepEqual(requests, Array(5).fill("GET /api/tags"));
  } finally {
    if (OLLAMA_URL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = OLLAMA_URL;
    if (OLLAMA_MODEL === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = OLLAMA_MODEL;
    await new Promise<void>((resolve, reject) => service.close((error) => error ? reject(error) : resolve()));
  }
});
