import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSchema, uid } from "../src/model";
import {
  PROJECT_FORMAT_VERSION,
  migrateLegacyProject,
  projectFormatProblem,
} from "../src/projectVersion";
import { ProjectReadError, ProjectStore } from "../server/storage";
import { assignGuidePlacement } from "../src/guidePlacement";
import { baseAssemblyStages } from "../src/assemblyStages";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function realHingeStudy() {
  const bytes = readFileSync(
    new URL(
      "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
      import.meta.url,
    ),
  );
  const original = JSON.parse(bytes.toString());
  assert.equal(original.schemaVersion, 7);
  assert.equal(original.pieces.length, 42);
  assert.equal(original.fastenerPlans.length, 1);
  assert.equal(original.lidHingePlans.length, 3);
  assert.equal(original.hingeStockSources.length, 1);
  return { bytes, original };
}

test("placement is a distinct format9 feature; version1–8 declarations migrate in memory without touching their input", () => {
  assert.ok(PROJECT_FORMAT_VERSION >= 9);
  for (let version = 1; version <= 8; version++) {
    const input = { schemaVersion: version, retained: { marker: "original" } },
      before = structuredClone(input);
    assert.equal(projectFormatProblem(input), null);
    assert.deepEqual(migrateLegacyProject(input), {
      ...input,
      schemaVersion: PROJECT_FORMAT_VERSION,
    });
    assert.deepEqual(input, before);
  }
  assert.equal(projectFormatProblem({ schemaVersion: PROJECT_FORMAT_VERSION }), null);
  assert.match(
    projectFormatProblem({ schemaVersion: PROJECT_FORMAT_VERSION + 1 })!,
    new RegExp(`newer Yardwork format ${PROJECT_FORMAT_VERSION + 1}`),
  );
});

test("tracked actual format4/5/6 projects keep captured geometry, sources, intent/history and absent placement fields", () => {
  for (const version of [4, 5, 6] as const) {
    const stem =
      version === 4
        ? "format4-storage-guide"
        : version === 5
          ? "format5-storage-fasteners"
          : "format6-remapped-storage";
    const file = new URL(`./fixtures/${stem}.yardwork.json`, import.meta.url),
      bytes = readFileSync(file),
      original = JSON.parse(bytes.toString());
    const provenance = JSON.parse(
      readFileSync(
        new URL(`./fixtures/${stem}.provenance.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(sha(bytes), provenance.sha256 ?? provenance.sourceSha256);
    assert.equal(original.schemaVersion, version);
    const before = structuredClone(original),
      migrated = projectSchema.parse(original);
    assert.equal(migrated.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual(original, before);
    for (const key of [
      "pieces",
      "sections",
      "joints",
      "steps",
      "history",
      "fastenerPlans",
      "fastenerPlanLabels",
      "supplies",
      "supplyInventory",
      "inventory",
      "toolSelections",
    ] as const) {
      if (key in original) {
        // Format6 previously added explicit absent baseline/history defaults to v5 W plans.
        // These known defaults are independent of the new optional piece placement.
        const expected =
          key === "fastenerPlans"
            ? original[key].map((plan: Record<string, unknown>) => {
                const head = plan.head as Record<string, unknown>,
                  receiver = plan.receiver as Record<string, unknown>;
                return {
                  ...plan,
                  head: { ...head, baseline: head.baseline ?? null },
                  receiver: {
                    ...receiver,
                    baseline: receiver.baseline ?? null,
                  },
                  referenceHistory: plan.referenceHistory ?? [],
                };
              })
            : original[key];
        assert.deepEqual(migrated[key], expected, `${stem}:${key}`);
      }
    }
    assert.ok(
      migrated.pieces.every((piece) => !Object.hasOwn(piece, "guidePlacement")),
    );
    assert.deepEqual(readFileSync(file), bytes);
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(migrated))),
      migrated,
    );
  }
});

test("synthetic version1–8 storage envelopes with real42-part study data are read-only; format8 explicit placement saves to the current format and reopens exactly", async () => {
  // Only the envelope version tags are synthetic. These are not claimed to be
  // provenance-backed original v1 files containing the later hinge/W features.
  const { original } = realHingeStudy(),
    directory = await mkdtemp(path.join(tmpdir(), "yardwork-placement-v8-"));
  try {
    const store = new ProjectStore(directory);
    for (let version = 1; version <= 8; version++) {
      const old = {
          ...structuredClone(original),
          schemaVersion: version,
        },
        file = path.join(directory, `${old.id}.json`);
      const bytes = Buffer.from(
        `{\n "project": ${JSON.stringify(old)},\n "revision": 3\n}\n`,
      );
      await writeFile(file, bytes);
      const loaded = (await store.get(old.id))!;
      assert.equal(loaded.revision, 3);
      assert.equal(loaded.project.schemaVersion, PROJECT_FORMAT_VERSION);
      assert.deepEqual(loaded.project.pieces, old.pieces);
      assert.deepEqual(loaded.project.steps, old.steps);
      assert.deepEqual(loaded.project.fastenerPlans, old.fastenerPlans);
      assert.deepEqual(loaded.project.lidHingePlans, old.lidHingePlans);
      assert.deepEqual(loaded.project.hingeStockSources, old.hingeStockSources);
      assert.deepEqual(loaded.project.supplies, old.supplies);
      assert.ok(
        loaded.project.pieces.every(
          (piece) => !Object.hasOwn(piece, "guidePlacement"),
        ),
      );
      assert.ok(guideIsCurrent(loaded.project));
      assert.deepEqual(
        generateBuildGuide(loaded.project).steps,
        loaded.project.steps,
      );
      await store.list();
      assert.deepEqual(await readFile(file), bytes);
      assert.deepEqual(await store.getOriginal(old.id), bytes);
      if (version !== 8) continue;
      const target = baseAssemblyStages(loaded.project).find(
          (stage) => stage.key === "bottom-frame",
        )!,
        source = baseAssemblyStages(loaded.project).find(
          (stage) => stage.ownerId === target.ownerId && stage.key === "shell",
        )!;
      const next = generateBuildGuide(
        assignGuidePlacement(loaded.project, source.memberIds[0], {
          ownerId: target.ownerId,
          stageKey: target.key,
        }),
      );
      const saved = await store.save(next, 3);
      assert.equal(saved.revision, 4);
      assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
      assert.deepEqual(saved.project, {
        ...next,
        updatedAt: saved.project.updatedAt,
      });
      assert.notDeepEqual(await readFile(file), bytes);
      const disk = JSON.parse(await readFile(file, "utf8"));
      assert.deepEqual(disk, saved);
      assert.equal(disk.project.schemaVersion, PROJECT_FORMAT_VERSION);
      assert.ok(guideIsCurrent(saved.project));
      assert.deepEqual(await new ProjectStore(directory).get(old.id), saved);
      assert.deepEqual(
        projectSchema.parse(JSON.parse(JSON.stringify(saved.project))),
        saved.project,
      );
      assert.deepEqual(saved.project.fastenerPlans, old.fastenerPlans);
      assert.deepEqual(saved.project.lidHingePlans, old.lidHingePlans);
      assert.deepEqual(saved.project.hingeStockSources, old.hingeStockSources);
      assert.deepEqual(saved.project.supplies, old.supplies);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("future version and actual unknown-field format8 originals remain protected against same-ID overwrite", async () => {
  const { original } = realHingeStudy(),
    directory = await mkdtemp(
      path.join(tmpdir(), "yardwork-placement-protected-"),
    );
  try {
    const current = projectSchema.parse({ ...original, id: uid() }),
      future = Buffer.from(
        JSON.stringify({
          project: { ...current, schemaVersion: PROJECT_FORMAT_VERSION + 1 },
          revision: 2,
        }),
      );
    const source = new URL(
        "./fixtures/format8-original-unknown-recovery.json",
        import.meta.url,
      ),
      bytes = readFileSync(source),
      captured = JSON.parse(bytes.toString());
    const provenance = JSON.parse(
      readFileSync(
        new URL(
          "./fixtures/format8-original-unknown-recovery.provenance.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(sha(bytes), provenance.sha256);
    assert.ok(captured.project.syntheticFutureGuard);
    const { syntheticFutureGuard: _unknown, ...known } = captured.project;
    const cases = [
      {
        candidate: current,
        revision: 2,
        bytes: future,
        error: new RegExp(`newer Yardwork format ${PROJECT_FORMAT_VERSION + 1}`),
      },
      {
        candidate: projectSchema.parse(known),
        revision: captured.revision,
        bytes,
        error: /damaged|invalid/,
      },
    ];
    const store = new ProjectStore(directory);
    for (const item of cases) {
      const file = path.join(directory, `${item.candidate.id}.json`);
      await writeFile(file, item.bytes);
      await assert.rejects(() => store.get(item.candidate.id), item.error);
      await assert.rejects(
        () => store.save(item.candidate, item.revision),
        ProjectReadError,
      );
      assert.deepEqual(await store.getOriginal(item.candidate.id), item.bytes);
      assert.deepEqual(await readFile(file), item.bytes);
    }
    assert.ok((await store.list()).every((row) => row.loadError));
    assert.deepEqual(readFileSync(source), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
