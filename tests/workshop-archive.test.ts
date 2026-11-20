import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { ProjectStore } from "../server/storage";
import { restoreWorkshopArchive } from "../server/workshopArchive";
import { blank } from "../src/model";

test("a workshop backup records concurrent saves, keeps corrupt originals, and restores a new library", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "yardwork-workshop-test-"));
  try {
    const active = path.join(root, "active");
    const archive = path.join(root, "backup.gz");
    const restored = path.join(root, "restored");
    const store = new ProjectStore(active);
    const project = blank("First");
    const review = blank("Second");
    const damaged = blank("Damaged");
    await store.save(project, 0);
    const previous = await readFile(path.join(active, `${project.id}.json`));
    const raw = Buffer.from([0xff, 0xfe, 0x7b, 0, 0x7d]);
    await writeFile(path.join(active, `${damaged.id}.json`), raw);
    await writeFile(path.join(active, "other-service.json"), "ignore");
    const first = store.save({ ...project, notes: "Before backup" }, 1);
    const independent = store.save(review, 0);
    const snapshot = store.writeBackup(archive);
    const later = store.save({ ...project, notes: "After backup" }, 2);
    const [inBackup, secondary] = await Promise.all([
      first,
      independent,
      snapshot,
      later,
    ]);
    assert.equal(await restoreWorkshopArchive(archive, restored), 4);
    const reopened = new ProjectStore(restored);
    assert.deepEqual(await reopened.get(project.id), inBackup);
    assert.deepEqual(await reopened.get(review.id), secondary);
    assert.deepEqual(
      await readFile(path.join(restored, ".revisions", project.id, "1.json")),
      previous,
    );
    assert.deepEqual(await reopened.getOriginal(damaged.id), raw);
    await assert.rejects(readFile(path.join(restored, "other-service.json")), {
      code: "ENOENT",
    });
    assert.equal((await store.get(project.id))?.project.notes, "After backup");
    await assert.rejects(
      restoreWorkshopArchive(archive, active),
      /destination already exists/,
    );
    assert.equal((await store.get(project.id))?.revision, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a truncated or changed workshop backup never publishes a partial library", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "yardwork-workshop-integrity-"),
  );
  try {
    const archive = path.join(root, "backup.gz");
    const invalid = path.join(root, "invalid.gz");
    const output = path.join(root, "restored");
    const store = new ProjectStore(path.join(root, "active"));
    await store.save(blank("First"), 0);
    await store.save(blank("Second"), 0);
    await store.writeBackup(archive);
    const [header, first, second, footer] = gunzipSync(await readFile(archive))
      .toString()
      .trimEnd()
      .split("\n");
    const altered = JSON.parse(second);
    altered.data = Buffer.from("different data").toString("base64");
    await writeFile(
      invalid,
      gzipSync([header, first, JSON.stringify(altered), footer, ""].join("\n")),
    );
    await assert.rejects(
      restoreWorkshopArchive(invalid, output),
      /mismatched checksum/,
    );
    await assert.rejects(readFile(output), { code: "ENOENT" });
    await writeFile(invalid, gzipSync([header, first, second, ""].join("\n")));
    await assert.rejects(
      restoreWorkshopArchive(invalid, output),
      /ended early/,
    );
    await assert.rejects(readFile(output), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
