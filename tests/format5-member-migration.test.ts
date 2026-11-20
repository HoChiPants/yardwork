import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { projectSchema } from "../src/model";
import { guideIsCurrent, generateBuildGuide } from "../src/guide";
import { fastenerReviews } from "../src/fastenings";
import { ProjectStore } from "../server/storage";

async function fixture() {
  const bytes = await readFile(new URL("./fixtures/format5-storage-fasteners.yardwork.json", import.meta.url)),
    provenance = JSON.parse(await readFile(new URL("./fixtures/format5-storage-fasteners.provenance.json", import.meta.url), "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sourceSha256);
  assert.equal(provenance.nativeAIQualified, false);
  return { bytes, old: JSON.parse(bytes.toString()) };
}

test("actual format5 locations migrate without inventing earlier member geometry or resetting valid guide checks", async () => {
  const { old } = await fixture(),
    original = JSON.stringify(old),
    migrated = projectSchema.parse(old);
  assert.equal(old.schemaVersion, 5);
  assert.equal(migrated.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(z.literal(5).safeParse(migrated.schemaVersion).success, false);
  assert.equal(old.fastenerPlans.length, 2);
  for (const plan of old.fastenerPlans) {
    assert.equal(plan.head.baseline, undefined);
    assert.equal(plan.receiver.baseline, undefined);
    assert.equal(plan.referenceHistory, undefined);
  }
  assert.deepEqual(migrated, {
    ...old,
    schemaVersion: PROJECT_FORMAT_VERSION,
    lidHingePlans: [], hingeStockSources: [], hingePlanLabels: [], connectorPlans: [], connectorPlanLabels: [],
    fastenerPlans: old.fastenerPlans.map((plan: Record<string, unknown>) => ({
      ...plan,
      head: { ...(plan.head as object), baseline: null },
      receiver: { ...(plan.receiver as object), baseline: null },
      referenceHistory: [],
    })),
  });
  assert.equal(JSON.stringify(old), original);
  assert.equal(guideIsCurrent(migrated), true);
  assert.deepEqual(generateBuildGuide(migrated).steps, old.steps);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(migrated))), migrated);
  const reviews = fastenerReviews(migrated);
  assert.equal(reviews.find((r) => r.plan.label === "W001")?.state, "path-reviewed");
  assert.equal(reviews.find((r) => r.plan.label === "W002")?.state, "stale");
  assert.equal(reviews.find((r) => r.plan.label === "W002")?.activePointCount, 0);
});

test("actual format5 stored originals remain exact until explicit current-format save, including missing target and measured neighbor", async () => {
  const { bytes, old } = await fixture(),
    dir = await mkdtemp(path.join(tmpdir(), "yardwork-format5-member-"));
  try {
    const file = path.join(dir, `${old.id}.json`),
      wrapper = Buffer.concat([Buffer.from('{"project":'), bytes, Buffer.from(',"revision":2}\n')]),
      store = new ProjectStore(dir);
    await writeFile(file, wrapper);
    const loaded = (await store.get(old.id))!;
    assert.equal(loaded.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(await readFile(file), wrapper);
    assert.deepEqual(await store.getOriginal(old.id), wrapper);
    const saved = await store.save(loaded.project, 2);
    assert.equal(saved.revision, 3);
    assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
    for (const plan of saved.project.fastenerPlans) {
      assert.equal(plan.head.baseline, null);
      assert.equal(plan.receiver.baseline, null);
      assert.deepEqual(plan.referenceHistory, []);
      assert.deepEqual(plan.measurements, old.fastenerPlans.find((p: { id: string }) => p.id === plan.id).measurements);
    }
    assert.deepEqual((await store.get(old.id))?.project, saved.project);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
