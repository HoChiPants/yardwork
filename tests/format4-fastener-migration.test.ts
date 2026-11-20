import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSchema } from "../src/model";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { ProjectStore } from "../server/storage";

test("the actual format4 AI/storage/guide fixture migrates without inventing locations, losing reviews or rewriting original bytes", async () => {
  const bytes = await readFile(new URL("./fixtures/format4-storage-guide.yardwork.json", import.meta.url)),
    provenance = JSON.parse(await readFile(new URL("./fixtures/format4-storage-guide.provenance.json", import.meta.url), "utf8")),
    old = JSON.parse(bytes.toString()),
    snapshot = JSON.stringify(old),
    migrated = projectSchema.parse(old);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sha256);
  assert.equal(old.schemaVersion, 4);
  assert.equal(old.fastenerPlans, undefined);
  assert.ok(old.steps.some((step: { generated?: { kind: string } }) => step.generated?.kind === "assembly-stage"));
  assert.ok(old.pieces.some((piece: { offcut: boolean }) => piece.offcut));
  assert.deepEqual(migrated, { ...old, schemaVersion: PROJECT_FORMAT_VERSION, fastenerPlans: [], fastenerPlanLabels: [], lidHingePlans: [], hingeStockSources: [], hingePlanLabels: [], connectorPlans: [], connectorPlanLabels: [] });
  assert.equal(JSON.stringify(old), snapshot);
  assert.ok(guideIsCurrent(migrated));
  assert.deepEqual(generateBuildGuide(migrated).steps, migrated.steps);
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-v4-guide-"));
  try {
    const file = path.join(dir, `${old.id}.json`),
      wrapper = JSON.stringify({ project: old, revision: 2 }),
      store = new ProjectStore(dir);
    await writeFile(file, wrapper);
    assert.deepEqual((await store.get(old.id))!.project, migrated);
    assert.equal(await readFile(file, "utf8"), wrapper);
    const saved = await store.save(migrated, 2);
    assert.equal(saved.revision, 3);
    assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(saved.project.fastenerPlans, []);
    assert.deepEqual(saved.project.steps, old.steps);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
