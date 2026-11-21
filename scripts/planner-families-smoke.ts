/**
 * Manual real-model qualification. Requires a running, Ollama-configured app.
 * SMOKE_URL selects an isolated server; this script saves synthetic projects
 * there and retains them for restart/persistence inspection. Output is JSONL.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AI_CLIENT_TIMEOUT_MS } from "../src/aiTiming";
import { blank } from "../src/model";
import {
  ideaPlanSchema,
  previewIdeaPlan,
  type IdeaPlan,
} from "../src/planning";
import { generateBuildGuide } from "../src/guide";
import { bom, guideMarkdown } from "../src/engine";
import { previewProposalStock } from "../src/proposalStock";
import { planStockCutLayouts } from "../src/recordStockCutLayout";

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:4173";
type Preview = ReturnType<typeof previewIdeaPlan>;
type CaseRecord = {
  name: string;
  prompt: string;
  startedAt: string;
  passed: boolean;
  elapsedMs: number;
  skipped?: boolean;
  error?: string;
  httpStatus?: number;
  response?: unknown;
  geometry?: Pick<Preview, "min" | "max"> & { parts: number };
  persistence?: {
    id: string;
    name: string;
    revision: number;
    pieces: number;
    profiles: number;
    recordedStockUnits: number;
    plannedOffcuts: number;
    projectSha256: string;
  };
};
const records: CaseRecord[] = [];
const near = (actual: number, expected: number, label: string) =>
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${label}: expected ${expected}, got ${actual}`,
  );

function object(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function propose(
  name: string,
  prompt: string,
  validate: (plan: IdeaPlan, preview: Preview) => void,
  previousPlan?: IdeaPlan,
): Promise<IdeaPlan | null> {
  const started = Date.now();
  const record: CaseRecord = {
    name,
    prompt,
    startedAt: new Date().toISOString(),
    passed: false,
    elapsedMs: 0,
  };
  let passedPlan: IdeaPlan | null = null;
  try {
    const response = await fetch(`${base}/api/planner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, previousPlan }),
      signal: AbortSignal.timeout(AI_CLIENT_TIMEOUT_MS),
    });
    const body = object(await response.json());
    record.httpStatus = response.status;
    record.response = body;
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(
      body.provider,
      "Ollama",
      "Must exercise the actual configured model, not a preset or fallback",
    );
    const plan = ideaPlanSchema.parse(body.plan);
    const draft = blank(`Actual AI ${name}`);
    const preview = previewIdeaPlan(draft, plan);
    record.geometry = {
      parts: preview.addedParts,
      min: preview.min,
      max: preview.max,
    };
    assert.ok(preview.addedParts > 5, "No meaningful real geometry generated");
    validate(plan, preview);

    const stock = previewProposalStock(draft, preview.project, null);
    assert.ok(stock.recordable.length, "No reviewed wood stock units to record");
    const recorded = planStockCutLayouts(stock.project, stock.recordable.map(({ layout }) => layout));
    const purchases = (project: typeof draft) => bom(project).map(({ id, quantity }) => [id, quantity]);
    assert.deepEqual(purchases(recorded.project), purchases(preview.project));
    assert.equal(recorded.project.plannedCutSources?.length, recorded.sourceIds.length);
    const project = generateBuildGuide(recorded.project);
    const guide = guideMarkdown(project);
    const order = guide.split(/^## /m).find((section) => section.startsWith("Planned stock cuts\n"));
    assert.ok(order, "The guide needs its saved stock cut order");
    const sources = order.split(/^### /m).slice(1);
    assert.equal(sources.length, recorded.sourceIds.length);
    for (const source of sources) {
      assert.match(source, /^P\d+ · /);
      assert.match(source, /^1\. \S/m);
    }
    const save = await fetch(`${base}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, baseRevision: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const saved = object(await save.json());
    assert.equal(save.status, 200, JSON.stringify(saved));
    // The store owns updatedAt; every design and purchasing field must survive.
    const savedProject = object(saved.project);
    assert.deepEqual({ ...savedProject, updatedAt: project.updatedAt }, project);
    const reopen = await fetch(`${base}/api/projects/${project.id}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(reopen.status, 200);
    const reopened = object(await reopen.json());
    assert.equal(reopened.revision, 1);
    assert.deepEqual(reopened.project, saved.project);
    const profiles = project.pieces.filter((p) => p.cutPlanes.length).length;
    if (name === "greenhouse")
      assert.match(guide, /Angled end face/);
    record.persistence = {
      id: project.id,
      name: project.name,
      revision: 1,
      pieces: project.pieces.length,
      profiles,
      recordedStockUnits: recorded.sourceIds.length,
      plannedOffcuts: recorded.offcuts,
      projectSha256: createHash("sha256")
        .update(JSON.stringify(saved.project))
        .digest("hex"),
    };
    record.passed = true;
    passedPlan = plan;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  }
  record.elapsedMs = Date.now() - started;
  records.push(record);
  console.log(JSON.stringify(record));
  return passedPlan;
}

const storage = await propose(
  "storage-banquette",
  "Build a straight three-section storage banquette, total width 6 feet, depth 24 inches and finished seat height 18 inches. Each section must be a separate bench with enclosed storage and an opening seat lid. No back: the existing wall is the back. Show all lids closed.",
  (plan, preview) => {
    assert.equal(plan.modules.length, 3);
    assert.equal(plan.structures.length, 0);
    for (const module of plan.modules) {
      assert.equal(module.kind, "bench");
      near(module.width, 24, "section width");
      near(module.height, 18, "seat height");
      near(module.depth, 24, "seat depth");
      near(module.backHeight, 0, "no back");
      assert.equal(module.storage, true);
      assert.equal(module.openingLid, true);
      assert.equal(module.lidOpen, false);
    }
    near(preview.max[0] - preview.min[0], 72, "total width");
    near(preview.max[2] - preview.min[2], 24, "total depth");
    near(preview.max[1] - preview.min[1], 18, "height");
  },
);
const followupPrompt =
  "Keep the previous three-section storage banquette and increase only the finished seat height to 20 inches. Preserve every section width, depth, position, yaw, storage, opening lid and no-back feature.";
if (storage) {
  await propose(
    "storage-followup",
    followupPrompt,
    (plan) => {
      assert.equal(plan.modules.length, 3);
      for (let i = 0; i < 3; i++) {
        const actual = plan.modules[i];
        const previous: IdeaPlan["modules"][number] = storage.modules[i];
        near(actual.height, 20, "new seat height");
        for (const key of [
          "kind",
          "width",
          "depth",
          "yaw",
          "backHeight",
          "storage",
          "openingLid",
          "lidOpen",
        ] as const)
          assert.deepEqual(
            actual[key],
            previous[key],
            `Followup changed ${key}`,
          );
        assert.deepEqual(
          actual.position,
          previous.position,
          "Followup moved section",
        );
      }
    },
    storage,
  );
} else {
  const skipped: CaseRecord = {
    name: "storage-followup",
    prompt: followupPrompt,
    startedAt: new Date().toISOString(),
    passed: false,
    skipped: true,
    elapsedMs: 0,
    error: "Storage baseline did not pass geometry and persistence checks",
  };
  records.push(skipped);
  console.log(JSON.stringify(skipped));
}

await propose(
  "greenhouse",
  "Plan a greenhouse 7 feet outside width, 8 feet outside depth and 7.5 feet outside eave height. Roof rise is 30 inches above the eave. Use the greenhouse whole-structure generator; do not substitute furniture. Exact glazing and attachment products are not selected.",
  (plan, preview) => {
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.structures.length, 1);
    const structure = plan.structures[0];
    assert.ok(structure.kind === "greenhouse");
    near(structure.parameters.width, 84, "width");
    near(structure.parameters.depth, 96, "depth");
    near(structure.parameters.eaveHeight, 90, "eave");
    near(structure.parameters.roofRise, 30, "rise");
    assert.ok(
      preview.project.pieces.some((p) => p.cutPlanes.length === 2),
      "Missing clipped rafters",
    );
  },
);
await propose(
  "short-greenhouse",
  "Plan a gabled greenhouse six feet wide, seven feet deep, six feet eave height and a two-foot roof rise.",
  (plan) => {
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.structures.length, 1);
    const structure = plan.structures[0];
    assert.ok(structure.kind === "greenhouse");
    near(structure.parameters.width, 72, "width");
    near(structure.parameters.depth, 84, "depth");
    near(structure.parameters.eaveHeight, 72, "eave");
    near(structure.parameters.roofRise, 24, "rise");
    near(structure.parameters.doorHeight, 59, "modeled provisional opening");
    assert.ok(plan.assumptions.some((line) => line.startsWith("Provisional greenhouse door opening")));
  },
);
await propose(
  "sauna",
  "Plan a sauna room with CLEAR INSIDE dimensions 5 feet wide, 6 feet deep and 7 feet high. Use the sauna whole-structure generator. Show framing around the reserved interior; do not invent selected lining, heater, wiring or attachment products.",
  (plan) => {
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.structures.length, 1);
    const structure = plan.structures[0];
    assert.ok(structure.kind === "sauna");
    near(structure.parameters.clearWidth, 60, "clear width");
    near(structure.parameters.clearDepth, 72, "clear depth");
    near(structure.parameters.clearHeight, 84, "clear height");
  },
);
await propose(
  "closet-insert",
  "Plan a closet insert with outside dimensions 7 feet wide, 24 inches deep and 7.5 feet high. Use the closet-insert whole-structure generator with a 25 inch clear shelf tower and four shelves. No rod or mounting product has been selected.",
  (plan) => {
    assert.equal(plan.modules.length, 0);
    assert.equal(plan.structures.length, 1);
    const structure = plan.structures[0];
    assert.ok(structure.kind === "closet-insert");
    near(structure.parameters.width, 84, "width");
    near(structure.parameters.depth, 24, "depth");
    near(structure.parameters.height, 90, "height");
    near(structure.parameters.towerWidth, 25, "tower width");
    assert.equal(structure.parameters.shelfCount, 4);
  },
);
await propose(
  "shelves",
  "Plan one freestanding shelving unit, 36 inches wide, 16 inches deep and 72 inches tall, with three shelves. Use a shelf module and ordinary stud lumber plus plywood. No bench or seating.",
  (plan, preview) => {
    assert.equal(plan.modules.length, 1);
    assert.equal(plan.structures.length, 0);
    const shelf = plan.modules[0];
    assert.equal(shelf.kind, "shelf");
    near(shelf.width, 36, "width");
    near(shelf.depth, 16, "depth");
    near(shelf.height, 72, "height");
    assert.equal(shelf.levels, 3);
    near(preview.max[0] - preview.min[0], 36, "geometry width");
    near(preview.max[2] - preview.min[2], 16, "geometry depth");
    near(preview.max[1] - preview.min[1], 72, "geometry height");
  },
);

const failed = records.filter((record) => !record.passed).length;
console.log(
  JSON.stringify({
    summary: {
      passed: records.length - failed,
      failed,
      cases: records.map(
        ({ name, passed, skipped, elapsedMs, error, httpStatus }) => ({
          name,
          passed,
          skipped,
          elapsedMs,
          error,
          httpStatus,
        }),
      ),
    },
  }),
);
if (failed) process.exitCode = 1;
