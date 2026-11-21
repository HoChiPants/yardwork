import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { blank, projectSchema } from "../src/model";
import { guideIsCurrent, generateBuildGuide } from "../src/guide";
import { fastenerReviews } from "../src/fastenings";
import {
  CURRENT_DRAFT_KEY,
  readInitialBrowserDrafts,
  writeBrowserDraft,
} from "../src/drafts";
import { ProjectReadError, ProjectStore } from "../server/storage";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function archivedFormat6() {
  const bytes = await readFile(
    new URL(
      "./fixtures/format6-remapped-storage.yardwork.json",
      import.meta.url,
    ),
  );
  const provenance = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/format6-remapped-storage.provenance.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(sha(bytes), provenance.sha256);
  assert.equal(bytes.length, provenance.bytes);
  assert.equal(provenance.schemaVersion, 6);
  assert.equal(provenance.nativeInference, 0);
  return { bytes, old: JSON.parse(bytes.toString("utf8")) };
}

test("actual format6 geometry, guide, W/F reservations and remapping history migrate only to the current version plus empty new collections", async () => {
  const { bytes, old } = await archivedFormat6(),
    snapshot = JSON.stringify(old),
    migrated = projectSchema.parse(old);
  assert.equal(old.schemaVersion, 6);
  assert.equal(old.lidHingePlans, undefined);
  assert.equal(old.hingeStockSources, undefined);
  assert.equal(old.hingePlanLabels, undefined);
  assert.deepEqual(migrated, {
    ...old,
    schemaVersion: PROJECT_FORMAT_VERSION,
    lidHingePlans: [],
    hingeStockSources: [],
    hingePlanLabels: [],
    connectorPlans: [], connectorPlanLabels: [],
  });
  assert.equal(JSON.stringify(old), snapshot);
  assert.equal(
    sha(bytes),
    "b76a74b8590565818630966ea5abb346f64537dce22b89c7954bc2f6eb4083e7",
  );
  assert.ok(
    migrated.fastenerPlans.some((plan) => plan.referenceHistory.length > 0),
  );
  assert.deepEqual(migrated.fastenerPlans, old.fastenerPlans);
  assert.deepEqual(migrated.fastenerPlanLabels, old.fastenerPlanLabels);
  assert.deepEqual(migrated.pieces, old.pieces);
  assert.deepEqual(migrated.steps, old.steps);
  assert.deepEqual(migrated.history, old.history);
  assert.equal(guideIsCurrent(migrated), true);
  assert.deepEqual(generateBuildGuide(migrated).steps, old.steps);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(migrated))),
    migrated,
  );
  const reviews = fastenerReviews(migrated);
  assert.equal(
    reviews.find((review) => review.plan.label === "W001")?.state,
    "path-reviewed",
  );
  assert.equal(
    reviews.find((review) => review.plan.label === "W002")?.state,
    "needs-measurements",
  );
  assert.ok(
    migrated.sections.every(
      (section) => section.recordedLidMotion === undefined,
    ),
  );
});

test("actual format6 store bytes stay exact on reads; explicit current-version save and a fresh store preserve every prior field", async () => {
  const { bytes, old } = await archivedFormat6(),
    directory = await mkdtemp(path.join(tmpdir(), "yardwork-format6-hinge-"));
  try {
    const file = path.join(directory, `${old.id}.json`),
      wrapper = Buffer.concat([
        Buffer.from('{"project":'),
        bytes,
        Buffer.from(',"revision":4}\n'),
      ]);
    await writeFile(file, wrapper);
    const store = new ProjectStore(directory),
      loaded = (await store.get(old.id))!;
    assert.equal(loaded.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.equal(loaded.revision, 4);
    assert.equal((await store.list())[0].id, old.id);
    assert.deepEqual(await store.getOriginal(old.id), wrapper);
    assert.deepEqual(await readFile(file), wrapper);
    assert.deepEqual(
      (await new ProjectStore(directory).get(old.id))!.project,
      loaded.project,
    );
    assert.deepEqual(await readFile(file), wrapper);
    const saved = await store.save(loaded.project, 4);
    assert.equal(saved.revision, 5);
    assert.deepEqual(
      { ...saved.project, updatedAt: loaded.project.updatedAt },
      loaded.project,
    );
    const currentBytes = await readFile(file),
      restarted = (await new ProjectStore(directory).get(old.id))!;
    assert.deepEqual(restarted, saved);
    assert.deepEqual(await readFile(file), currentBytes);
    assert.equal(JSON.parse(currentBytes.toString()).project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(restarted.project.fastenerPlans, old.fastenerPlans);
    assert.deepEqual(restarted.project.steps, old.steps);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("actual format6 draft resumes without changing its original key or inventing hinge measurements", async () => {
  const { old } = await archivedFormat6(),
    original = JSON.stringify({ project: old, revision: 4 }),
    values = new Map<string, string>([["yardwork-draft-v6", original]]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const resumed = readInitialBrowserDrafts(storage).resume!;
  assert.equal(resumed.project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(resumed.project.lidHingePlans, []);
  assert.deepEqual(resumed.project.hingeStockSources, []);
  assert.deepEqual(resumed.project.fastenerPlans, old.fastenerPlans);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, resumed);
  assert.equal(values.get("yardwork-draft-v6"), original);
  assert.equal(CURRENT_DRAFT_KEY, `yardwork-draft-v${PROJECT_FORMAT_VERSION}`);
  assert.deepEqual(JSON.parse(values.get(CURRENT_DRAFT_KEY)!), resumed);
});

// Exact original future-7 recovery wrapper from the prior immutable motion image.
// work/yardwork-lid-motion-20261117074609/cleanup-20261117075112/final-data/9de498b2-963e-42c4-8133-27bff6768879.json
const archivedFuture7 = Buffer.from(
  "ewogICJwcm9qZWN0IjogewogICAgInNjaGVtYVZlcnNpb24iOiA3LAogICAgImlkIjogIjlkZTQ5OGIyLTk2M2UtNDJjNC04MTMzLTI3YmZmNjc2ODg3OSIsCiAgICAibmFtZSI6ICJTWU5USEVUSUNfQllURV9NQVJLRVIiLAogICAgImtpbmQiOiAiY3VzdG9tIiwKICAgICJyZXRhaWxlciI6ICJob21lLWRlcG90IiwKICAgICJ0b29sU2VsZWN0aW9ucyI6IFtdLAogICAgInN1cHBsaWVzIjogW10sCiAgICAiYXR0YWNobWVudFBsYW5zIjogW10sCiAgICAicmVzdHJhaW50UGxhbnMiOiBbXSwKICAgICJmYXN0ZW5lclBsYW5zIjogW10sCiAgICAiZmFzdGVuZXJQbGFuTGFiZWxzIjogW10sCiAgICAicGFydExhYmVscyI6IFtdLAogICAgInN1cHBseUludmVudG9yeSI6IFtdLAogICAgInppcCI6ICI4NDEyMSIsCiAgICAic3RvcmUiOiAiIiwKICAgICJ1cGRhdGVkQXQiOiAiMjAyNi0xMS0xN1QwNjoyMDo1Ni41NTRaIiwKICAgICJwaWVjZXMiOiBbXSwKICAgICJzdGVwcyI6IFsKICAgICAgewogICAgICAgICJpZCI6ICJmY2U5NDNlNS0zODM3LTQzNDItYTQ1MC00ZTE1YzE3NDgwNmUiLAogICAgICAgICJ0aXRsZSI6ICJMYXkgb3V0IHlvdXIgcHJvamVjdCIsCiAgICAgICAgIm5vdGVzIjogIkVzdGFibGlzaCB0aGUgc2l0ZSwgZGltZW5zaW9ucywgYW5kIGNvbnN0cmFpbnRzIGJlZm9yZSBwbGFjaW5nIHBhcnRzLiIsCiAgICAgICAgImNvbXBsZXRlIjogZmFsc2UKICAgICAgfQogICAgXSwKICAgICJqb2ludHMiOiBbXSwKICAgICJpbnZlbnRvcnkiOiBbXSwKICAgICJwbGFuTGluZXMiOiBbXSwKICAgICJub3RlcyI6ICIiLAogICAgImhpc3RvcnkiOiBbXSwKICAgICJzZWN0aW9ucyI6IFtdLAogICAgImlkZWFCaW5kaW5ncyI6IFtdLAogICAgIndvcmtab25lIjogbnVsbCwKICAgICJndWlkZUZpbmdlcnByaW50IjogbnVsbCwKICAgICJmdXR1cmVDb25uZWN0aW9uU3lzdGVtIjogewogICAgICAidW5yZWNvZ25pemVkIjogIlBSRVNFUlZFX1NZTlRIRVRJQ19EQVRBIgogICAgfQogIH0sCiAgInJldmlzaW9uIjogNAp9Cg==",
  "base64",
);

test("the original old future7 archive stays protected for its unknown field, while format7 itself is now supported", async () => {
  assert.equal(archivedFuture7.length, 1033);
  assert.equal(
    sha(archivedFuture7),
    "f382334deef3ebcc00305874cd775e5fc1f2b7f5b36421de119221584e40b3b2",
  );
  const raw = JSON.parse(archivedFuture7.toString()),
    directory = await mkdtemp(path.join(tmpdir(), "yardwork-old-future7-"));
  try {
    const file = path.join(directory, `${raw.project.id}.json`),
      store = new ProjectStore(directory);
    await writeFile(file, archivedFuture7);
    await assert.rejects(
      store.get(raw.project.id),
      (error: unknown) =>
        error instanceof ProjectReadError &&
        /damaged|invalid/.test(error.message) &&
        !/newer/.test(error.message),
    );
    const { futureConnectionSystem: unknownData, ...knownCurrent } =
      raw.project;
    assert.deepEqual(unknownData, { unrecognized: "PRESERVE_SYNTHETIC_DATA" });
    // A distinct synthetic candidate proves the version literal is accepted; the archive is never modified.
    const candidate = projectSchema.parse(knownCurrent);
    assert.equal(candidate.schemaVersion, PROJECT_FORMAT_VERSION);
    await assert.rejects(store.save(candidate, 4), ProjectReadError);
    assert.deepEqual(await readFile(file), archivedFuture7);
    assert.deepEqual(await store.getOriginal(raw.project.id), archivedFuture7);
    assert.ok((await store.list())[0].loadError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fresh synthetic future versions and damaged UTF8/JSON records remain recoverable and cannot be overwritten", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yardwork-v7-recovery-"));
  try {
    const store = new ProjectStore(directory);
    const cases = [PROJECT_FORMAT_VERSION + 1, PROJECT_FORMAT_VERSION + 2].map((version) => {
      const project = blank(`SYNTHETIC future ${version}`);
      return {
        project,
        bytes: Buffer.from(
          JSON.stringify({
            project: { ...project, schemaVersion: version },
            revision: 3,
          }),
        ),
        message: new RegExp(`newer.*${version}`),
      };
    });
    const damaged = blank("SYNTHETIC broken JSON"),
      encoding = blank("SYNTHETIC_UTF8_MARKER"),
      validBytes = Buffer.from(
        JSON.stringify({ project: encoding, revision: 3 }),
      ),
      at = validBytes.indexOf("SYNTHETIC_UTF8_MARKER");
    cases.push({
      project: damaged,
      bytes: Buffer.from('{"project":'),
      message: /damaged|invalid/,
    });
    cases.push({
      project: encoding,
      bytes: Buffer.concat([
        validBytes.subarray(0, at),
        Buffer.from([0xff, 0xfe]),
        validBytes.subarray(at + "SYNTHETIC_UTF8_MARKER".length),
      ]),
      message: /damaged|invalid/,
    });
    for (const item of cases) {
      const file = path.join(directory, `${item.project.id}.json`);
      await writeFile(file, item.bytes);
      await assert.rejects(store.get(item.project.id), item.message);
      await assert.rejects(store.save(item.project, 3), item.message);
      assert.deepEqual(await store.getOriginal(item.project.id), item.bytes);
      assert.deepEqual(await readFile(file), item.bytes);
    }
    const list = await store.list();
    assert.equal(list.length, 4);
    assert.ok(list.every((row) => row.loadError));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
