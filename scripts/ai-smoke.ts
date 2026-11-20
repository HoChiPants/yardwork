import assert from "node:assert/strict";
import { AI_CLIENT_TIMEOUT_MS } from "../src/aiTiming";
import {
  applyCommand,
  blank,
  commandSchema,
  projectSchema,
  type Command,
} from "../src/model";
import { guideMarkdown } from "../src/engine";
const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";
async function propose(prompt: string, context?: unknown) {
  const start = Date.now();
  const response = await fetch(`${base}/api/assistant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, context }),
    signal: AbortSignal.timeout(AI_CLIENT_TIMEOUT_MS),
  });
  const data = (await response.json()) as {
    provider: string;
    command: Command;
    targetSectionId?: string;
    error?: string;
  };
  assert.equal(response.status, 200, data.error ?? JSON.stringify(data));
  assert.equal(
    data.provider,
    "Ollama",
    "The real model path must be used, not the local parser.",
  );
  const command = commandSchema.parse(data.command);
  console.log(
    JSON.stringify({
      prompt,
      command,
      provider: data.provider,
      elapsedMs: Date.now() - start,
    }),
  );
  return { ...data, command };
}
const health = (await (await fetch(`${base}/api/health`)).json()) as {
  ai: string;
};
assert.equal(health.ai, "ollama");
const first = await propose(
  "Please create a framed wall seven feet wide and five feet tall, with studs twenty-four inches apart.",
);
assert.deepEqual(first.command, {
  type: "wall",
  width: 84,
  height: 60,
  depth: 48,
  spacing: 24,
});
let project = applyCommand(blank("Real model qualification"), first.command);
assert.equal(project.pieces.length, 7);
const section = project.sections[0];
const second = await propose(
  "For the wall I selected, leave its height alone and increase its width to nine feet.",
  {
    sectionId: section.id,
    name: section.name,
    command: section.generator,
    pieceCount: section.pieceIds.length,
  },
);
assert.deepEqual(second.command, {
  type: "wall",
  width: 108,
  height: 60,
  depth: 48,
  spacing: 24,
});
assert.equal(second.targetSectionId, section.id);
project = applyCommand(project, second.command, section.id);
assert.equal(project.sections[0].id, section.id);
assert.equal(project.pieces.length, 8);
assert.match(guideMarkdown(project), /9′/);
const third = await propose(
  "Start a foundation base five feet across and three feet deep. Put its joists twelve inches apart.",
);
assert.deepEqual(third.command, {
  type: "foundation",
  width: 60,
  height: 48,
  depth: 36,
  spacing: 12,
});
project = projectSchema.parse(applyCommand(project, third.command));
assert.equal(project.sections.length, 2);
const saved = await fetch(`${base}/api/projects/${project.id}`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ project, baseRevision: 0 }),
});
assert.equal(saved.status, 200, await saved.text());
const restored = (await (
  await fetch(`${base}/api/projects/${project.id}`)
).json()) as { project: unknown; revision: number };
const checked = projectSchema.parse(restored.project);
assert.deepEqual(checked.pieces, project.pieces);
assert.deepEqual(checked.sections, project.sections);
assert.equal(restored.revision, 1);
console.log(
  "Real AI created a wall, revised the selected section, added a base, and round-tripped the plan through server storage.",
);
