import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSchema } from "../src/model";
import { ProjectReadError, ProjectStore } from "../server/storage";
import {
  PROJECT_FORMAT_VERSION,
  migrateLegacyProject,
  projectFormatProblem,
} from "../src/projectVersion";

test("connector data has a distinct format and accepts versions 1 through 7 in memory", () => {
  assert.ok(PROJECT_FORMAT_VERSION >= 8);
  for (let version = 1; version <= 7; version++) {
    const earlier = { schemaVersion: version, retained: { value: "original" } };
    const before = structuredClone(earlier);
    assert.equal(projectFormatProblem(earlier), null);
    assert.deepEqual(migrateLegacyProject(earlier), { ...earlier, schemaVersion: PROJECT_FORMAT_VERSION });
    assert.deepEqual(earlier, before);
  }
  assert.equal(projectFormatProblem({ schemaVersion: 8 }), null);
  assert.match(projectFormatProblem({ schemaVersion: PROJECT_FORMAT_VERSION + 1 })!, /newer Yardwork format/);
});

test("the actual format7 study retains every preexisting field during format-only migration", () => {
  const path = new URL("./fixtures/format7-storage-banquette.yardwork.json", import.meta.url);
  const original = readFileSync(path);
  const project = JSON.parse(original.toString());
  assert.equal(project.schemaVersion, 7);
  const upgraded = migrateLegacyProject(project) as Record<string, unknown>;
  assert.equal(upgraded.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual({ ...upgraded, schemaVersion: 7 }, project);
  assert.deepEqual(readFileSync(path), original);
  assert.equal(project.schemaVersion, 7);
  const normalized = projectSchema.parse(project);
  assert.deepEqual(normalized.connectorPlans, []);
  assert.deepEqual(normalized.connectorPlanLabels, []);
  assert.deepEqual({ ...normalized, schemaVersion: 7, connectorPlans: undefined, connectorPlanLabels: undefined }, { ...project, connectorPlans: undefined, connectorPlanLabels: undefined });
});

test("the original future8 wrapper remains byte-protected for its unknown field after format8 becomes supported", async () => {
  const file = new URL("./fixtures/format8-original-unknown-recovery.json", import.meta.url), bytes = readFileSync(file);
  const provenance = JSON.parse(readFileSync(new URL("./fixtures/format8-original-unknown-recovery.provenance.json", import.meta.url), "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sha256);
  const original = JSON.parse(bytes.toString()), directory = await mkdtemp(path.join(tmpdir(), "yardwork-original-future8-"));
  const { syntheticFutureGuard: retainedUnknown, ...known } = original.project;
  assert.ok(retainedUnknown);
  assert.equal(projectSchema.safeParse(original.project).success, false);
  const candidate = projectSchema.parse(known);
  assert.equal(candidate.schemaVersion, PROJECT_FORMAT_VERSION);
  try {
    const stored = path.join(directory, `${original.project.id}.json`), store = new ProjectStore(directory);
    await writeFile(stored, bytes);
    await assert.rejects(() => store.get(original.project.id), ProjectReadError);
    await assert.rejects(() => store.save(candidate, original.revision), ProjectReadError);
    assert.deepEqual(await store.getOriginal(original.project.id), bytes);
    assert.deepEqual(await readFile(stored), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
