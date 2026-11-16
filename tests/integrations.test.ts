import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
test("optional provider contracts validate AI proposals and exact-store catalog responses without exposing tokens", async () => {
  let badAI = false,
    badStore = false,
    providerFailure = false;
  const calls: { path: string; auth?: string; body?: any }[] = [];
  const mock = createServer(async (req, res) => {
    const u = new URL(req.url!, "http://mock");
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push({
      path: u.pathname,
      auth: req.headers.authorization,
      body: body ? JSON.parse(body) : undefined,
    });
    res.setHeader("content-type", "application/json");
    if (providerFailure) {
      res.writeHead(503);
      res.end("{}");
      return;
    }
    if (u.pathname === "/api/chat") {
      res.end(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              type: "wall",
              width: badAI ? 5000 : 96,
              height: 72,
              depth: 48,
              spacing: 16,
            }),
          },
        }),
      );
      return;
    }
    res.end(
      JSON.stringify([
        {
          material: "stud",
          internetNumber: "123456789",
          name: "Protocol test fixture",
          price: 5,
          available: 42,
          store: badStore ? "wrong-store" : u.searchParams.get("store"),
          zip: u.searchParams.get("zip"),
          checkedAt: new Date().toISOString(),
          url: "https://www.homedepot.com/",
        },
      ]),
    );
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const mockPort = (mock.address() as { port: number }).port;
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "yardwork-providers-"),
  );
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
        OLLAMA_MODEL: "protocol-test-model",
        CATALOG_URL: `http://127.0.0.1:${mockPort}/inventory`,
        CATALOG_TOKEN: "protocol-test-token",
      },
      stdio: "pipe",
    },
  );
  let diagnostics = "";
  child.stderr?.on("data", (chunk) => (diagnostics += chunk));
  child.stdout?.on("data", () => {});
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, diagnostics);
    const health = (await (await fetch(`${base}/api/health`)).json()) as any;
    assert.deepEqual(health, { ok: true, ai: "ollama", catalog: true });
    assert.ok(!JSON.stringify(health).includes("protocol-test-token"));
    const proposal = await fetch(`${base}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "A six foot wall" }),
    });
    assert.equal(proposal.status, 200);
    const ai = (await proposal.json()) as any;
    assert.equal(ai.command.width, 96);
    assert.equal(ai.provider, "Ollama");
    const aiCall = calls.find((c) => c.path === "/api/chat")!;
    assert.equal(aiCall.body.stream, false);
    assert.equal(aiCall.body.model, "protocol-test-model");
    assert.ok(aiCall.body.format.properties.width);
    assert.equal(aiCall.auth, undefined);
    const inventory = await fetch(`${base}/api/catalog?zip=84121&store=4409`);
    assert.equal(inventory.status, 200);
    assert.equal(((await inventory.json()) as any[])[0].available, 42);
    assert.equal(
      calls.find((c) => c.path === "/inventory")?.auth,
      "Bearer protocol-test-token",
    );
    badAI = true;
    assert.equal(
      (
        await fetch(`${base}/api/assistant`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "Invalid dimensions" }),
        })
      ).status,
      400,
    );
    badStore = true;
    assert.equal(
      (await fetch(`${base}/api/catalog?zip=84121&store=4409`)).status,
      400,
    );
    providerFailure = true;
    assert.equal(
      (await fetch(`${base}/api/catalog?zip=84121&store=4409`)).status,
      400,
    );
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
