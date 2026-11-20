import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ConflictError,
  ProjectReadError,
  ProjectStore,
  SavedRevisionError,
} from "../server/storage";
import { cutPiece } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { blank, part } from "../src/model";
import { copySavedRevision } from "../src/recoverSavedRevision";
import { addSupply } from "../src/supplies";

function fixture() {
  const project = blank("Saved cut stock and guide");
  project.pieces.push(
    part(
      "Board",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      project.steps[0].id,
      "Frame",
    ),
  );
  project.store = "4409";
  project.inventory.push({
    material: "stud",
    internetNumber: "123456789",
    name: "Synthetic board",
    price: 3.2,
    available: 10,
    store: "4409",
    zip: "84121",
    url: "https://www.homedepot.com/p/123456789",
    checkedAt: new Date().toISOString(),
  });
  const cut = cutPiece(project, project.pieces[0].id, 48);
  const plan = generateBuildGuide(addSupply(cut, "grk-cabinet-114069", 1));
  plan.steps[0].complete = true;
  plan.steps[0].notes += "\n\nPreserve this assembly note.";
  return plan;
}

test("saving keeps three earlier files and preserves the exact bytes of each supported revision", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-previous-save-"),
  );
  try {
    const store = new ProjectStore(directory);
    const project = fixture();
    const primary = path.join(directory, `${project.id}.json`);
    const archive = path.join(directory, ".revisions", project.id);
    const legacy = Buffer.from(
      JSON.stringify(
        { project: { ...project, schemaVersion: 31 }, revision: 1 },
        null,
        2,
      ) + "\n",
    );
    await writeFile(primary, legacy);
    const before = await store.get(project.id);
    await assert.rejects(store.save(project, 0), ConflictError);
    await assert.rejects(readdir(archive), { code: "ENOENT" });
    const second = await store.save({ ...project, notes: "Second save" }, 1);
    assert.deepEqual(await readFile(path.join(archive, "1.json")), legacy);
    assert.deepEqual(await store.getRevision(project.id, 1), before);
    assert.deepEqual((await store.list())[0].earlierRevisions, [1]);
    const recovered = copySavedRevision(before!.project, 1);
    assert.notEqual(recovered.id, project.id);
    assert.deepEqual(recovered.pieces, before!.project.pieces);
    assert.deepEqual(recovered.inventory, before!.project.inventory);
    assert.deepEqual(recovered.supplies, before!.project.supplies);
    assert.equal(recovered.steps[0].generated?.planId, recovered.id);
    assert.equal(recovered.steps[0].complete, true);
    assert.match(recovered.steps[0].notes, /Preserve this assembly note/);
    assert.ok(guideIsCurrent(recovered));
    const regenerated = generateBuildGuide(recovered);
    assert.deepEqual(
      regenerated.steps.map(({ id }) => id),
      recovered.steps.map(({ id }) => id),
    );
    assert.equal(regenerated.steps[0].complete, true);
    assert.equal((await store.get(project.id))?.revision, second.revision);
    await store.save({ ...project, notes: "Third save" }, 2);
    await store.save({ ...project, notes: "Fourth save" }, 3);
    await store.save({ ...project, notes: "Fifth save" }, 4);
    assert.deepEqual((await store.list())[0].earlierRevisions, [4, 3, 2]);
    assert.deepEqual((await readdir(archive)).sort(), [
      "2.json",
      "3.json",
      "4.json",
    ]);
    assert.equal(await store.getRevision(project.id, 1), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a damaged or missing latest file leaves a readable earlier save and refuses an overwrite", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-recover-save-"),
  );
  try {
    const originalStore = new ProjectStore(directory);
    const project = fixture();
    const first = await originalStore.save(project, 0);
    await originalStore.save({ ...project, notes: "Later version" }, 1);
    await originalStore.save({ ...project, notes: "Latest version" }, 2);
    const primary = path.join(directory, `${project.id}.json`);
    const damaged = Buffer.from([0xff, 0xfe, 0x00, 0x7b]);
    await writeFile(primary, damaged);
    await writeFile(
      path.join(directory, ".revisions", project.id, "2.json"),
      damaged,
    );
    const store = new ProjectStore(directory);
    await assert.rejects(store.get(project.id), ProjectReadError);
    await assert.rejects(store.getRevision(project.id, 2), SavedRevisionError);
    assert.deepEqual((await store.list())[0].earlierRevisions, [1]);
    assert.deepEqual(await store.getRevision(project.id, 1), first);
    await assert.rejects(store.save(project, 3), ProjectReadError);
    assert.deepEqual(await readFile(primary), damaged);
    await unlink(primary);
    const [missing] = await store.list();
    assert.equal(missing.name, project.name);
    assert.equal(missing.originalAvailable, false);
    assert.deepEqual(missing.earlierRevisions, [1]);
    await assert.rejects(store.save(project, 0), ConflictError);
    assert.equal(await store.get(project.id), null);
    assert.deepEqual(await store.getRevision(project.id, 1), first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a conflicting archive leaves the current project and earlier backup bytes intact", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-save-archive-conflict-"),
  );
  try {
    const store = new ProjectStore(directory);
    const project = fixture();
    await store.save(project, 0);
    await store.save({ ...project, notes: "Second" }, 1);
    await store.save({ ...project, notes: "Third" }, 2);
    const primary = path.join(directory, `${project.id}.json`);
    const current = await readFile(primary);
    const archive = path.join(directory, ".revisions", project.id);
    const conflict = path.join(archive, "3.json");
    const different = Buffer.from(current.toString().replace("Third", "Other"));
    await writeFile(conflict, different);
    await assert.rejects(
      store.save({ ...project, notes: "Fourth" }, 3),
      ConflictError,
    );
    assert.deepEqual(await readFile(primary), current);
    assert.deepEqual(await readFile(conflict), different);
    assert.deepEqual((await store.list())[0].earlierRevisions, [2, 1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
