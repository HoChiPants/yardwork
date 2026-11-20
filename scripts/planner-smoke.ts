import assert from "node:assert/strict";
import { blank } from "../src/model";
import { ideaPlanSchema, previewIdeaPlan } from "../src/planning";
import { AI_CLIENT_TIMEOUT_MS } from "../src/aiTiming";
const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";
const workZone = { width: 84, depth: 60, height: 84 };
const response = await fetch(`${base}/api/planner`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt:
      "Plan an L-shaped kitchenette banquette, seven feet along the back with a five-foot overall return, seats twenty-four inches deep and eighteen inches high. Include a wood back. Use two bench modules and count the corner once.",
    workZone,
    existingSections: [],
  }),
  signal: AbortSignal.timeout(AI_CLIENT_TIMEOUT_MS),
});
const data = (await response.json()) as any;
assert.equal(response.status, 200, JSON.stringify(data));
assert.equal(
  data.provider,
  "Ollama",
  "This smoke script must exercise an actual configured AI model.",
);
const plan = ideaPlanSchema.parse(data.plan);
assert.equal(plan.modules.length, 2);
assert.ok(plan.modules.every((m) => m.kind === "bench"));
const p = blank();
(p as typeof p & { workZone: typeof workZone }).workZone = workZone;
const preview = previewIdeaPlan(p, plan);
assert.equal(preview.workZoneFits, true);
assert.ok(preview.addedParts > 15);
assert.ok(
  Math.abs(preview.max[0] - preview.min[0] - 84) < 0.01,
  "Requested width must be seven feet.",
);
assert.ok(
  Math.abs(preview.max[2] - preview.min[2] - 60) < 0.01,
  "Requested return must be five feet.",
);
assert.ok(
  plan.modules.every((m) => m.height === 18 && m.depth === 24),
  "Seat height and depth must match the request.",
);
console.log(
  JSON.stringify({
    provider: data.provider,
    plan,
    addedParts: preview.addedParts,
    workZoneFits: preview.workZoneFits,
  }),
);
