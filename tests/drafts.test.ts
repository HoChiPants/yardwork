import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { blank } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import {
  CURRENT_DRAFT_KEY,
  PREVIOUS_DRAFT_KEY,
  readInitialBrowserDrafts,
  writeBrowserDraft,
  browserDraftRecoveries,
} from "../src/drafts";
class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}
test("new drafts use their own versioned keys and legacy migration leaves original bytes intact", () => {
  const storage = new MemoryStorage(),
    p = { ...blank("Legacy browser work"), schemaVersion: 1 };
  const raw = JSON.stringify({ project: p, revision: 5 });
  storage.setItem("yardwork-draft-v1", raw);
  const boot = readInitialBrowserDrafts(storage);
  assert.equal(boot.resume?.project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(boot.resume?.revision, 5);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, boot.resume!);
  assert.equal(storage.getItem("yardwork-draft-v1"), raw);
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
  assert.equal(CURRENT_DRAFT_KEY, `yardwork-draft-v${PROJECT_FORMAT_VERSION}`);
  assert.equal(
    PREVIOUS_DRAFT_KEY,
    `yardwork-previous-draft-v${PROJECT_FORMAT_VERSION}`,
  );
});
test("a future or damaged current draft is preserved byte-for-byte before another draft is written", () => {
  for (const raw of [
    '{"project":{"schemaVersion":99,"irreplaceable":"data"},"revision":8}',
    "broken JSON",
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(CURRENT_DRAFT_KEY, raw);
    assert.equal(readInitialBrowserDrafts(storage).resume, null);
    assert.equal(browserDraftRecoveries(storage)[0].raw, raw);
    writeBrowserDraft(storage, CURRENT_DRAFT_KEY, {
      project: blank(),
      revision: 0,
    });
    const copies = browserDraftRecoveries(storage);
    assert.equal(copies.length, 1);
    assert.equal(copies[0].raw, raw);
    assert.notEqual(copies[0].key, CURRENT_DRAFT_KEY);
  }
});
test("recovery copy failure refuses the overwrite and leaves the original untouched", () => {
  const storage = new MemoryStorage(),
    raw = '{"project":{"schemaVersion":99}}';
  storage.setItem(CURRENT_DRAFT_KEY, raw);
  storage.setItem = () => {
    throw Error("Quota exceeded");
  };
  assert.throws(
    () =>
      writeBrowserDraft(storage, CURRENT_DRAFT_KEY, {
        project: blank(),
        revision: 0,
      }),
    /Quota/,
  );
  assert.equal(storage.getItem(CURRENT_DRAFT_KEY), raw);
});

test("format 2 browser drafts remain exact after current-format resume and explicit write", () => {
  const storage = new MemoryStorage(),
    old = { ...blank("Version two draft"), schemaVersion: 2 };
  const raw = JSON.stringify({ project: old, revision: 9 });
  storage.setItem("yardwork-draft-v2", raw);
  const boot = readInitialBrowserDrafts(storage);
  assert.equal(boot.resume?.project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(boot.resume?.revision, 9);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, boot.resume!);
  assert.equal(storage.getItem("yardwork-draft-v2"), raw);
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
});

test("a readable format 2 previous draft takes precedence over older format 1 current work", () => {
  const storage = new MemoryStorage();
  for (const [key, version, name] of [
    ["yardwork-draft-v1", 1, "Old current"],
    ["yardwork-previous-draft-v2", 2, "Newer previous"],
  ] as const)
    storage.setItem(
      key,
      JSON.stringify({
        project: { ...blank(name), schemaVersion: version },
        revision: 1,
      }),
    );
  assert.equal(
    readInitialBrowserDrafts(storage).resume?.project.name,
    "Newer previous",
  );
});

test("a format 3 draft resumes into the current format without overwriting its source key", () => {
  const storage = new MemoryStorage(),
    raw = JSON.stringify({
      project: { ...blank("V3 shelf supports"), schemaVersion: 3 },
      revision: 7,
    });
  storage.setItem("yardwork-draft-v3", raw);
  const boot = readInitialBrowserDrafts(storage);
  assert.equal(boot.resume?.project.schemaVersion, PROJECT_FORMAT_VERSION);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, boot.resume!);
  assert.equal(storage.getItem("yardwork-draft-v3"), raw);
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
});

test("format4 originals remain intact while the current draft writes the current format with zero invented screw locations", () => {
  const storage = new MemoryStorage(),
    old: Record<string, unknown> = {
      ...blank("V4 reviewed guide"),
      schemaVersion: 4,
    };
  delete old.fastenerPlans;
  const raw = JSON.stringify({ project: old, revision: 7 });
  storage.setItem("yardwork-draft-v4", raw);
  const boot = readInitialBrowserDrafts(storage);
  assert.equal(boot.resume?.project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(boot.resume?.project.fastenerPlans, []);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, boot.resume!);
  assert.equal(storage.getItem("yardwork-draft-v4"), raw);
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
});

test("actual format5 fastening drafts resume with unknown legacy baselines and preserve their original key bytes", async () => {
  const old = JSON.parse(
      await readFile(
        new URL(
          "./fixtures/format5-storage-fasteners.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    raw = JSON.stringify({ project: old, revision: 2 }),
    storage = new MemoryStorage();
  storage.setItem("yardwork-draft-v5", raw);
  const boot = readInitialBrowserDrafts(storage);
  assert.equal(boot.resume?.project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(boot.resume?.project.fastenerPlans.length, 2);
  for (const plan of boot.resume!.project.fastenerPlans) {
    assert.equal(plan.head.baseline, null);
    assert.equal(plan.receiver.baseline, null);
    assert.deepEqual(plan.referenceHistory, []);
  }
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, boot.resume!);
  assert.equal(storage.getItem("yardwork-draft-v5"), raw);
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
  assert.deepEqual(
    readInitialBrowserDrafts(storage).resume?.project,
    boot.resume!.project,
  );
});
