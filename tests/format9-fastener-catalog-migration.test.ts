import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { projectSchema, blank, uid } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { assemblyStages } from "../src/assemblyStages";
import { bom } from "../src/engine";
import { ProjectReadError, ProjectStore } from "../server/storage";
import {
  CURRENT_DRAFT_KEY,
  readInitialBrowserDrafts,
  writeBrowserDraft,
} from "../src/drafts";

const fixture = new URL(
  "./fixtures/format9-guide-placement.wrapper.json",
  import.meta.url,
);
const raw = readFileSync(fixture);
const original = JSON.parse(raw.toString());
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("captured actual format9 placement/order fixture normalizes only its version and retains checked hardware guide inputs", () => {
  const provenance = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/format9-guide-placement.provenance.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(sha(raw), provenance.sha256);
  assert.equal(original.project.schemaVersion, 9);
  assert.equal(original.revision, 1);
  assert.ok(PROJECT_FORMAT_VERSION > original.project.schemaVersion);
  const before = structuredClone(original),
    project = projectSchema.parse(original.project);
  assert.deepEqual(project, {
    ...original.project,
    schemaVersion: PROJECT_FORMAT_VERSION,
  });
  assert.deepEqual(original, before);
  assert.equal(project.pieces.length, 44);
  const block = project.pieces.find((piece) => piece.guidePlacement)!;
  assert.ok(block);
  assert.equal(
    project.partLabels.find((row) => row.partId === block.id)?.label,
    "P043",
  );
  assert.equal(block.guidePlacement?.stageKey, "bottom-frame");
  assert.ok(
    assemblyStages(project)
      .find(
        (stage) =>
          stage.ownerId === block.guidePlacement?.ownerId &&
          stage.key === block.guidePlacement.stageKey,
      )
      ?.memberIds.includes(block.id),
  );
  assert.ok(guideIsCurrent(project));
  assert.deepEqual(generateBuildGuide(project), project);
  assert.equal(project.steps.filter((step) => step.complete).length, 2);
  assert.deepEqual(
    project.steps.map((step) => step.id),
    original.project.steps.map((step: { id: string }) => step.id),
  );
  const row = bom(project).find((row) => row.id === block.material)!;
  assert.equal(row.physicalStockUnits, 1);
  assert.equal(row.quantity, 1);
  assert.equal(z.literal(9).safeParse(project.schemaVersion).success, false);
  assert.deepEqual(readFileSync(fixture), raw);
});

test("authentic9 stored reads leave all raw bytes intact; explicit current save advances only revision/server time and survives reopening", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yardwork-catalog-v9-"));
  try {
    const file = path.join(directory, `${original.project.id}.json`),
      store = new ProjectStore(directory);
    await writeFile(file, raw);
    const loaded = (await store.get(original.project.id))!;
    assert.equal(loaded.revision, 1);
    assert.deepEqual(loaded.project, {
      ...original.project,
      schemaVersion: PROJECT_FORMAT_VERSION,
    });
    await store.list();
    assert.deepEqual(await readFile(file), raw);
    assert.deepEqual(await store.getOriginal(original.project.id), raw);
    const saved = await store.save(loaded.project, 1);
    assert.equal(saved.revision, 2);
    assert.deepEqual(saved.project, {
      ...loaded.project,
      updatedAt: saved.project.updatedAt,
    });
    assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(
      await new ProjectStore(directory).get(original.project.id),
      saved,
    );
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), saved);
    assert.deepEqual(saved.project.pieces, original.project.pieces);
    assert.deepEqual(
      saved.project.fastenerPlans,
      original.project.fastenerPlans,
    );
    assert.deepEqual(
      saved.project.lidHingePlans,
      original.project.lidHingePlans,
    );
    assert.deepEqual(
      saved.project.connectorPlans,
      original.project.connectorPlans,
    );
    assert.deepEqual(
      saved.project.hingeStockSources,
      original.project.hingeStockSources,
    );
    assert.deepEqual(saved.project.steps, original.project.steps);
    assert.deepEqual(readFileSync(fixture), raw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("format9 browser draft recovery preserves the exact legacy key while explicit current write uses the current key", () => {
  const values = new Map<string, string>([
    ["yardwork-draft-v9", raw.toString()],
  ]);
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
  const recovered = readInitialBrowserDrafts(storage);
  assert.equal(recovered.resume?.revision, 1);
  assert.deepEqual(recovered.resume?.project, {
    ...original.project,
    schemaVersion: PROJECT_FORMAT_VERSION,
  });
  assert.equal(CURRENT_DRAFT_KEY, `yardwork-draft-v${PROJECT_FORMAT_VERSION}`);
  writeBrowserDraft(storage, CURRENT_DRAFT_KEY, recovered.resume!);
  assert.equal(storage.getItem("yardwork-draft-v9"), raw.toString());
  assert.equal(
    JSON.parse(storage.getItem(CURRENT_DRAFT_KEY)!).project.schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
  assert.deepEqual(readFileSync(fixture), raw);
});

test("future12 and synthetic unknown-field9 originals reject correct-base saves without changing bytes", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-catalog-future-"),
  );
  try {
    const store = new ProjectStore(directory),
      current = blank("Future catalog data");
    const unknown = {
      ...original.project,
      id: uid(),
      syntheticUnknownCatalogData: { preserve: "exact original" },
    };
    const cases = [
      {
        candidate: current,
        bytes: Buffer.from(
          JSON.stringify({
            project: { ...current, schemaVersion: PROJECT_FORMAT_VERSION + 1 },
            revision: 3,
          }),
        ),
        revision: 3,
        error: new RegExp(
          `newer Yardwork format ${PROJECT_FORMAT_VERSION + 1}`,
        ),
      },
      {
        candidate: projectSchema.parse({ ...original.project, id: unknown.id }),
        bytes: Buffer.from(JSON.stringify({ project: unknown, revision: 4 })),
        revision: 4,
        error: /damaged|invalid/,
      },
    ];
    for (const item of cases) {
      const file = path.join(directory, `${item.candidate.id}.json`);
      await writeFile(file, item.bytes);
      await assert.rejects(store.get(item.candidate.id), item.error);
      await assert.rejects(
        store.save(item.candidate, item.revision),
        ProjectReadError,
      );
      assert.deepEqual(await readFile(file), item.bytes);
      assert.deepEqual(await store.getOriginal(item.candidate.id), item.bytes);
    }
    assert.equal((await store.list()).filter((row) => row.loadError).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
