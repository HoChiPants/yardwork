import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { blank, part, projectSchema, uid, type WorkspaceDimension } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { cutPiece } from "../src/engine";
import { ProjectStore } from "../server/storage";
import { resolveWorkspaceDimension, workspaceDimensionSummary } from "../src/workspaceDimensions";

test("linked dimensions follow a rigid move and flag a surface removed by a through-cut", () => {
  const project = blank();
  const board = part("Shelf", "plywood", [24, 0.75, 12], [0, 3, 0], project.steps[0].id, "Casework");
  const fixed: WorkspaceDimension = { id: uid(), name: "Fixed opening", a: [0, 3.375, 2], b: [24, 3.375, 2] };
  const previous = projectSchema.parse({ ...project, schemaVersion: 167, workspaceDimensions: [fixed] });
  assert.deepEqual(previous.workspaceDimensions, [fixed]);
  const moving: WorkspaceDimension = { ...fixed, id: uid(), anchors: { a: { pieceId: board.id, local: [0, 0.375, 2] } } };
  project.pieces.push(board);
  assert.equal(workspaceDimensionSummary(project, moving).length, "2 ft");
  board.position = [6, 3, 0];
  board.rotation = [0, Math.PI / 2, 0];
  assert.deepEqual(resolveWorkspaceDimension(project, moving), { a: [8, 3.375, 0], b: fixed.b, issues: [] });
  assert.equal(workspaceDimensionSummary(project, moving).length, "16.12452 in");
  assert.equal(workspaceDimensionSummary(project, fixed).length, "2 ft");
  board.rectangularOpenings = [{ axis: 1, center: [2, 0], spans: [2, 2] }];
  assert.equal(workspaceDimensionSummary(project, moving).length, null);
  assert.match(workspaceDimensionSummary(project, moving).detail, /Point A needs a new pick/);
  project.pieces = [];
  assert.equal(workspaceDimensionSummary(project, moving).length, null);
});

function legacy() {
  let project = createBuildStudy(
    "shelves",
    {
      ...defaultBuildStudyParameters("shelves"),
      width: 36,
    },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  project = cutPiece(project, project.pieces[0].id, 70, 1);
  project.notes += "\nKeep the measured wall obstruction.";
  const raw = JSON.parse(JSON.stringify(project));
  raw.schemaVersion = 1;
  delete raw.attachmentPlans;
  return raw;
}

test("version 1 migrates without mutating geometry, source provenance, bindings or the input", () => {
  const old = legacy(),
    snapshot = JSON.stringify(old),
    upgraded = projectSchema.parse(old);
  assert.equal(upgraded.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(upgraded.attachmentPlans, []);
  assert.deepEqual(upgraded, {
    ...old,
    schemaVersion: PROJECT_FORMAT_VERSION,
    attachmentPlans: [],
    restraintPlans: [],
    partLabels: [],
  });
  assert.equal(JSON.stringify(old), snapshot);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(upgraded))),
    upgraded,
  );
  // The old release's literal version gate must refuse the new export.
  assert.equal(z.literal(1).safeParse(upgraded.schemaVersion).success, false);
});

test("unknown project versions and unknown top-level current fields are rejected rather than stripped", () => {
  const p = blank();
  for (const version of [0, PROJECT_FORMAT_VERSION + 1, PROJECT_FORMAT_VERSION + 2, "7", null])
    assert.equal(
      projectSchema.safeParse({ ...p, schemaVersion: version }).success,
      false,
    );
  assert.equal(
    projectSchema.safeParse({
      ...p,
      futureConnectionSystem: { data: "keep me" },
    }).success,
    false,
  );
});

test("stored legacy reads are non-destructive and explicit saves write the new version", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-version-"));
  try {
    const old = legacy(),
      file = path.join(dir, `${old.id}.json`),
      store = new ProjectStore(dir);
    const original =
      JSON.stringify({ project: old, revision: 7 }, null, 2) + "\n";
    await writeFile(file, original);
    const loaded = (await store.get(old.id))!;
    assert.equal(loaded.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.equal(loaded.revision, 7);
    assert.equal((await store.list())[0].id, old.id);
    assert.equal(await readFile(file, "utf8"), original);
    assert.equal((await store.getOriginal(old.id))?.toString(), original);
    const saved = await store.save(loaded.project, 7);
    assert.equal(saved.revision, 8);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).project.schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("future or damaged stored files remain listed and downloadable, and cannot be overwritten", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-future-"));
  try {
    const p = blank("Future design"),
      damaged = blank("Damaged design"),
      store = new ProjectStore(dir);
    const futureVersion = PROJECT_FORMAT_VERSION + 1;
    const future = JSON.stringify({
      project: {
        ...p,
        schemaVersion: futureVersion,
        futureConnectionSystem: { keep: true },
      },
      revision: 4,
    });
    const corrupt = '{"project":';
    await writeFile(path.join(dir, `${p.id}.json`), future);
    await writeFile(path.join(dir, `${damaged.id}.json`), corrupt);
    const versionError = new RegExp(`format ${futureVersion}|version ${futureVersion}`, "i");
    await assert.rejects(store.get(p.id), versionError);
    await assert.rejects(store.save(p, 4), versionError);
    const rows = await store.list();
    assert.equal(rows.length, 2);
    assert.match(
      rows.find((r) => r.id === p.id)!.loadError!,
      /newer|unsupported|upgrade/i,
    );
    assert.match(
      rows.find((r) => r.id === damaged.id)!.loadError!,
      /read|invalid|damaged/i,
    );
    assert.equal((await store.getOriginal(p.id))?.toString(), future);
    assert.equal((await store.getOriginal(damaged.id))?.toString(), corrupt);
    await assert.rejects(store.save(damaged, 0));
    assert.equal(
      await readFile(path.join(dir, `${p.id}.json`), "utf8"),
      future,
    );
    assert.equal(
      await readFile(path.join(dir, `${damaged.id}.json`), "utf8"),
      corrupt,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("original downloads preserve arbitrary damaged bytes instead of decoding replacement characters", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-original-bytes-"));
  try {
    const p = blank(),
      store = new ProjectStore(dir),
      bytes = Buffer.from([
        0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d,
      ]);
    await writeFile(path.join(dir, `${p.id}.json`), bytes);
    const original = await store.getOriginal(p.id);
    assert.ok(Buffer.isBuffer(original));
    assert.deepEqual(original, bytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid UTF-8 inside an otherwise schema-valid project cannot be decoded and saved as changed data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-bad-encoding-"));
  try {
    const p = blank("BYTE_MARKER"),
      store = new ProjectStore(dir),
      source = Buffer.from(JSON.stringify({ project: p, revision: 4 })),
      index = source.indexOf("BYTE_MARKER");
    const bytes = Buffer.concat([
      source.subarray(0, index),
      Buffer.from([0xff, 0xfe]),
      source.subarray(index + "BYTE_MARKER".length),
    ]);
    const file = path.join(dir, `${p.id}.json`);
    await writeFile(file, bytes);
    await assert.rejects(store.get(p.id), /damaged|invalid/i);
    await assert.rejects(store.save(p, 4), /damaged|invalid/i);
    assert.deepEqual(await readFile(file), bytes);
    assert.equal((await store.list())[0].id, p.id);
    assert.ok((await store.list())[0].loadError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("version 2 shelf plans migrate to the current format with every existing reference and original bytes preserved", async () => {
  const { makeShelfPinPlan, saveShelfPinPlan, shelfSupportEntries } =
    await import("../src/attachments");
  let p = createBuildStudy(
    "shelves",
    defaultBuildStudyParameters("shelves"),
  ).project;
  const entry = shelfSupportEntries(p)[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.entryId, {
      shelfRoles: entry.shelves.map((s) => s.role),
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  const old: Record<string, unknown> = { ...p, schemaVersion: 2 };
  delete old.partLabels;
  delete old.restraintPlans;
  const bytes = JSON.stringify(old),
    upgraded = projectSchema.parse(old);
  assert.equal(upgraded.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(upgraded.attachmentPlans, p.attachmentPlans);
  assert.deepEqual(upgraded.partLabels, []);
  assert.deepEqual(upgraded.restraintPlans, []);
  assert.equal(JSON.stringify(old), bytes);
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-v2-"));
  try {
    const file = path.join(dir, `${p.id}.json`),
      raw = JSON.stringify({ project: old, revision: 8 }),
      store = new ProjectStore(dir);
    await writeFile(file, raw);
    assert.deepEqual((await store.get(p.id))!.project, upgraded);
    assert.equal(await readFile(file, "utf8"), raw);
    await store.save(upgraded, 8);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).project.schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("format 3 attachment/label/restraint data remains exact on read into the current format and explicit save", async () => {
  const { makeShelfPinPlan, saveShelfPinPlan, shelfSupportEntries } =
    await import("../src/attachments");
  const { makeRestraintPlan, addRestraintLocation, saveRestraintPlan } =
    await import("../src/restraints");
  const { ensurePartLabels } = await import("../src/partLabels");
  let p = ensurePartLabels(createBuildStudy("shelves").project);
  const entry = shelfSupportEntries(p)[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.entryId, {
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  p = saveRestraintPlan(
    p,
    addRestraintLocation(makeRestraintPlan(p, entry.entryId)),
  );
  const old = { ...p, schemaVersion: 3 },
    snapshot = JSON.stringify(old),
    loaded = projectSchema.parse(old);
  assert.deepEqual(loaded, { ...old, schemaVersion: PROJECT_FORMAT_VERSION });
  assert.equal(JSON.stringify(old), snapshot);
  assert.equal(z.literal(3).safeParse(loaded.schemaVersion).success, false);
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-v3-"));
  try {
    const file = path.join(dir, `${p.id}.json`),
      raw = JSON.stringify({ project: old, revision: 4 }),
      store = new ProjectStore(dir);
    await writeFile(file, raw);
    assert.deepEqual((await store.get(p.id))!.project, loaded);
    assert.equal(await readFile(file, "utf8"), raw);
    await store.save(loaded, 4);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).project.schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("every shipped project version migrates and the saved library preserves original format 65 bytes", async () => {
  const base = createBuildStudy("closet-insert").project;
  const entryId = base.ideaBindings[0].entries[0].id;
  const withInstallCheck = {
    ...base,
    caseworkTipUpPlans: [
      {
        entryId,
        ceilingHeight: 96,
        restingFace: "front" as const,
        stagingOffset: 24,
      },
    ],
  };
  for (
    let schemaVersion = 1;
    schemaVersion <= PROJECT_FORMAT_VERSION;
    schemaVersion++
  )
    assert.equal(
      projectSchema.parse({ ...base, schemaVersion }).schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
  const old = { ...withInstallCheck, schemaVersion: 65 };
  const upgraded = projectSchema.parse(old);
  assert.deepEqual(upgraded, {
    ...withInstallCheck,
    schemaVersion: PROJECT_FORMAT_VERSION,
  });
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-recent-format-"));
  const file = path.join(dir, `${old.id}.json`);
  try {
    const original = JSON.stringify({ project: old, revision: 1 }) + "\n";
    await writeFile(file, original);
    const store = new ProjectStore(dir);
    assert.deepEqual((await store.get(old.id))?.project, upgraded);
    assert.equal(await readFile(file, "utf8"), original);
    await store.save(upgraded, 1);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).project.schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
