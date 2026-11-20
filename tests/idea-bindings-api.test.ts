import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { plannerHandler } from "../server/planner";
import { blank, projectSchema } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingReview,
  bindingToken,
  previewIdeaRevision,
} from "../src/ideaBindings";
import type { IdeaPlan } from "../src/planSchema";
async function request(body: unknown) {
  let payload: { plan: IdeaPlan; provider: string } | undefined;
  await plannerHandler(
    { body } as Request,
    Object.assign(new EventEmitter(), {
      json(value: typeof payload) {
        payload = value;
        return this;
      },
    }) as unknown as Response,
  );
  assert.ok(payload);
  return payload;
}

test("planner API accepts reopened persisted entries and returns a targeted proposal without appending duplicate seating", async () => {
  const oldURL = process.env.OLLAMA_URL;
  try {
    delete process.env.OLLAMA_URL;
    const source = applyIdeaPlan(
        blank(),
        localIdeaPlan({
          prompt:
            "A banquette 72 inches wide,24 inches deep,18 inches seat height,three sections,storage,opening lids,no back",
        }),
      ),
      p = projectSchema.parse(JSON.parse(JSON.stringify(source))),
      b = p.ideaBindings[0],
      token = bindingToken(p, b.id),
      proposal = await request({
        prompt: "Make section 2 width 30 inches",
        previousPlan: bindingPlan(p, b.id),
      });
    assert.equal(proposal.provider, "Local planning presets");
    assert.deepEqual(
      proposal.plan.modules.map((m) => m.entryId),
      b.entries.map((e) => e.id),
    );
    assert.deepEqual(
      proposal.plan.modules.map((m) => m.width),
      [24, 30, 24],
    );
    const preview = previewIdeaRevision(p, b.id, proposal.plan, token);
    assert.equal(preview.impact.replacedParts, 14);
    const next = applyIdeaRevision(p, b.id, proposal.plan, token);
    assert.equal(next.sections.length, 3);
    assert.equal(next.ideaBindings.length, 1);
    assert.equal(bindingReview(next, b.id).manualEdits, 0);
  } finally {
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
  }
});

test("compact provider output preserves saved entry IDs and unspecified geometry rather than trusting guessed revision fields", async () => {
  const oldURL = process.env.OLLAMA_URL,
    oldFormat = process.env.OLLAMA_PLANNER_FORMAT,
    oldFetch = globalThis.fetch;
  try {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_PLANNER_FORMAT = "compact";
    globalThis.fetch = async () =>
      new globalThis.Response(
        JSON.stringify({
          done: true,
          done_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              family: "bench",
              operation: "revise",
              width: 48,
              depth: 12,
              height: 20,
            }),
          },
        }),
      );
    const p = applyIdeaPlan(
        blank(),
        localIdeaPlan({
          prompt:
            "A banquette 72 inches wide,24 inches deep,18 inches seat height,three sections,storage,opening lids,no back",
        }),
      ),
      b = p.ideaBindings[0],
      previousPlan = bindingPlan(p, b.id),
      proposal = await request({
        prompt: "Make seats 20 inches high",
        previousPlan,
      });
    assert.deepEqual(
      proposal.plan.modules.map((m) => m.entryId),
      previousPlan.modules.map((m) => m.entryId),
    );
    assert.deepEqual(
      proposal.plan.modules.map((m) => [m.width, m.depth, m.height]),
      [
        [24, 24, 20],
        [24, 24, 20],
        [24, 24, 20],
      ],
    );
    const next = applyIdeaRevision(
      p,
      b.id,
      proposal.plan,
      bindingToken(p, b.id),
    );
    assert.equal(next.ideaBindings[0].entries.length, 3);
    assert.equal(next.pieces.length, p.pieces.length);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
    if (oldFormat === undefined) delete process.env.OLLAMA_PLANNER_FORMAT;
    else process.env.OLLAMA_PLANNER_FORMAT = oldFormat;
  }
});

test("clarification leaves the persisted design and current binding token unchanged", async () => {
  const oldURL = process.env.OLLAMA_URL;
  try {
    delete process.env.OLLAMA_URL;
    const p = applyIdeaPlan(
        blank(),
        localIdeaPlan({
          prompt:
            "A greenhouse 72 inches wide,96 inches deep,84 inches eave height",
        }),
      ),
      b = p.ideaBindings[0],
      token = bindingToken(p, b.id),
      before = structuredClone(p),
      proposal = await request({
        prompt: "Make this better",
        previousPlan: bindingPlan(p, b.id),
      });
    assert.ok(proposal.plan.questions.length);
    const preview = previewIdeaRevision(p, b.id, proposal.plan, token);
    assert.equal(preview.impact.changed, false);
    assert.deepEqual(applyIdeaRevision(p, b.id, proposal.plan, token), before);
    assert.equal(bindingToken(p, b.id), token);
  } finally {
    if (oldURL === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = oldURL;
  }
});
