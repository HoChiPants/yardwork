import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { blank, projectSchema, uid } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import {
  ConflictError,
  ProjectReadError,
  ProjectStore,
} from "../server/storage";
import {
  CURRENT_DRAFT_KEY,
  PREVIOUS_DRAFT_KEY,
  readInitialBrowserDrafts,
  writeBrowserDraft,
  browserDraftRecoveries,
} from "../src/drafts";

const fixture = new URL(
  "./fixtures/format10-catalog-cuts.wrapper.json",
  import.meta.url,
);
const raw = readFileSync(fixture);
const original = JSON.parse(raw.toString());
const upgraded = () => projectSchema.parse(original.project);

function memoryStorage(entries: [string, string][]) {
  const values = new Map(entries);
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("authentic captured10 retains every project field except its version", () => {
  const provenance = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/format10-catalog-cuts.provenance.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    provenance.sha256,
  );
  assert.equal(original.project.schemaVersion, 10);
  assert.ok(PROJECT_FORMAT_VERSION > original.project.schemaVersion);
  assert.equal(original.revision, 1);
  assert.equal(original.project.pieces.length, 46);
  assert.equal(original.project.fastenerPlans.length, 3);
  assert.equal(original.project.lidHingePlans.length, 3);
  assert.equal(original.project.connectorPlans.length, 1);
  assert.equal(original.project.fastenerPlans[0].referenceHistory.length, 2);
  assert.deepEqual(upgraded(), {
    ...original.project,
    schemaVersion: PROJECT_FORMAT_VERSION,
  });
  assert.deepEqual(readFileSync(fixture), raw);
});

test("format10 stored reads preserve raw bytes and revision; explicit current-format save/reopen retains complete data", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-short-screw-v10-"),
  );
  try {
    const file = path.join(directory, `${original.project.id}.json`),
      store = new ProjectStore(directory);
    await writeFile(file, raw);
    const loaded = (await store.get(original.project.id))!;
    assert.deepEqual(loaded, {
      project: upgraded(),
      revision: original.revision,
    });
    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].updatedAt, original.project.updatedAt);
    assert.equal(listed[0].revision, 1);
    assert.deepEqual(await readFile(file), raw);
    assert.deepEqual(await store.getOriginal(original.project.id), raw);
    const saved = await store.save(loaded.project, loaded.revision);
    assert.equal(saved.revision, 2);
    assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(saved.project, {
      ...upgraded(),
      updatedAt: saved.project.updatedAt,
    });
    assert.deepEqual(
      await new ProjectStore(directory).get(original.project.id),
      saved,
    );
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), saved);
    const bytes = await readFile(file),
      changed = structuredClone(saved.project);
    changed.fastenerPlans[0].referenceHistory[0].basis =
      "Synthetic unauthorized rewrite";
    await assert.rejects(store.save(changed, 2), ConflictError);
    assert.deepEqual(await readFile(file), bytes);
    assert.equal((await store.get(original.project.id))!.revision, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("format10 current/previous browser keys remain exact after recovery and explicit current-format write", () => {
  const storage = memoryStorage([
    ["yardwork-draft-v10", raw.toString()],
    ["yardwork-previous-draft-v10", raw.toString()],
  ]);
  const loaded = readInitialBrowserDrafts(storage);
  assert.deepEqual(loaded.resume, { project: upgraded(), revision: 1 });
  assert.deepEqual(loaded.previous, loaded.resume);
  assert.equal(CURRENT_DRAFT_KEY, `yardwork-draft-v${PROJECT_FORMAT_VERSION}`);
  assert.equal(
    PREVIOUS_DRAFT_KEY,
    `yardwork-previous-draft-v${PROJECT_FORMAT_VERSION}`,
  );
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, loaded.resume!);
  writeBrowserDraft(storage, PREVIOUS_DRAFT_KEY, loaded.previous!);
  assert.equal(storage.getItem("yardwork-draft-v10"), raw.toString());
  assert.equal(storage.getItem("yardwork-previous-draft-v10"), raw.toString());
  assert.deepEqual(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!),
    loaded.resume,
  );
});

test("fresh future-version and unknown-field10/11 originals remain downloadable and refuse correct-base overwrites", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-short-screw-future-"),
  );
  try {
    const store = new ProjectStore(directory);
    for (const version of [PROJECT_FORMAT_VERSION + 1, 10, 11]) {
      const candidate = {
        ...blank(`Synthetic protected format${version}`),
        id: uid(),
      };
      const project = {
        ...candidate,
        schemaVersion: version,
        ...(version > PROJECT_FORMAT_VERSION
          ? {}
          : { syntheticUnknownField: { preserve: "exact" } }),
      };
      const bytes = Buffer.from(
        JSON.stringify({ project, revision: 3 }, null, 2) + "\n",
      );
      const file = path.join(directory, `${candidate.id}.json`);
      await writeFile(file, bytes);
      await assert.rejects(
        store.get(candidate.id),
        version > PROJECT_FORMAT_VERSION
          ? new RegExp(`newer Yardwork format ${version}`)
          : /damaged|invalid/,
      );
      await assert.rejects(store.save(candidate, 3), ProjectReadError);
      assert.deepEqual(await store.getOriginal(candidate.id), bytes);
      assert.deepEqual(await readFile(file), bytes);
      const storage = memoryStorage([[CURRENT_DRAFT_KEY, bytes.toString()]]);
      assert.equal(readInitialBrowserDrafts(storage).resume, null);
      assert.equal(browserDraftRecoveries(storage)[0].raw, bytes.toString());
      writeBrowserDraft(storage, CURRENT_DRAFT_KEY, {
        project: candidate,
        revision: 0,
      });
      assert.ok(
        browserDraftRecoveries(storage).some(
          (row) => row.raw === bytes.toString(),
        ),
      );
    }
    assert.equal((await store.list()).filter((row) => row.loadError).length, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
