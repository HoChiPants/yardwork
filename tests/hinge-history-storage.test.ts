import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { blank, type Project } from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import {
  makeLidHingePlan,
  saveLidHingePlan,
  saveHingeStockSource,
  removeLidHingePlan,
} from "../src/hinges";
import {
  makeHingeStockSource,
  updateHingeStockSource,
} from "../src/hingeStock";
import { retainHingeLabelHistory } from "../src/hingeHistory";
import { ConflictError, ProjectStore } from "../server/storage";

function historyFixture() {
  let project = applyIdeaPlan(
    blank("SYNTHETIC hinge history persistence"),
    localIdeaPlan({
      prompt:
        "Storage bench 48 inches wide,24 inches deep,18 inches seat height with an opening lid and no back",
    }),
  );
  const section = project.sections.find(
    (section) => section.recipe?.openingLid,
  )!;
  const moving = project.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!,
    fixed = project.pieces.find(
      (piece) =>
        section.pieceIds.includes(piece.id) &&
        piece.designRole === "storage-rear",
    )!;
  assert.ok(moving && fixed);
  project = saveLidHingePlan(
    project,
    makeLidHingePlan(project, section.id, moving.id, fixed.id),
  );
  const source = makeHingeStockSource();
  project = saveHingeStockSource(project, source);
  const before = structuredClone(project),
    plan = project.lidHingePlans[0];
  // Receipt fixtures retain unknown axis/stock lengths; no installation values are invented.
  project = saveLidHingePlan(project, {
    ...plan,
    axis: {
      ...plan.axis,
      basis: "SYNTHETIC recorded pending axis review",
      measuredAt: "2026-11-16T18:00:00Z",
    },
  });
  project = saveHingeStockSource(
    project,
    updateHingeStockSource(
      source,
      { notes: "SYNTHETIC source inspection remains unmeasured" },
      "Explicit synthetic source-note edit",
    ),
  );
  assert.equal(project.lidHingePlans[0].referenceHistory.length, 1);
  assert.equal(project.hingeStockSources[0].referenceHistory.length, 1);
  assert.equal(project.lidHingePlans[0].axis.movingA, null);
  assert.equal(project.hingeStockSources[0].usableLength, null);
  return { before, project, planId: plan.id, sourceId: source.id };
}
const mutations: { name: string; alter: (p: Project) => void }[] = [
  {
    name: "hinge history truncation",
    alter: (p) => {
      p.lidHingePlans[0].referenceHistory = [];
    },
  },
  {
    name: "hinge receipt basis rewrite",
    alter: (p) => {
      p.lidHingePlans[0].referenceHistory[0].basis =
        "Rewritten earlier hinge review";
    },
  },
  {
    name: "hinge previous snapshot rewrite",
    alter: (p) => {
      p.lidHingePlans[0].referenceHistory[0].previous.notes =
        "Forged historical input";
    },
  },
  {
    name: "stock history truncation",
    alter: (p) => {
      p.hingeStockSources[0].referenceHistory = [];
    },
  },
  {
    name: "stock receipt basis rewrite",
    alter: (p) => {
      p.hingeStockSources[0].referenceHistory[0].basis =
        "Rewritten earlier stock review";
    },
  },
  {
    name: "stock previous measurement rewrite",
    alter: (p) => {
      p.hingeStockSources[0].referenceHistory[0].previous.usableLength = 47.5;
    },
  },
];

test("correct-base whole-project hinge/stock history edits are conflicts before any file replacement", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "yardwork-hinge-prefix-"),
  );
  try {
    const { project } = historyFixture(),
      store = new ProjectStore(directory),
      saved = await store.save(project, 0),
      file = path.join(directory, `${project.id}.json`),
      raw = await readFile(file);
    for (const mutation of mutations) {
      const candidate = structuredClone(saved.project);
      mutation.alter(candidate);
      await assert.rejects(
        store.save(candidate, 1),
        (error: unknown) =>
          error instanceof ConflictError &&
          /hinge.*history|stock history/i.test(error.message),
        mutation.name,
      );
      assert.deepEqual(await readFile(file), raw, mutation.name);
      assert.equal((await store.get(project.id))?.revision, 1);
      assert.deepEqual(await readdir(directory), [`${project.id}.json`]);
    }
    const stale = structuredClone(saved.project);
    mutations[0].alter(stale);
    await assert.rejects(
      store.save(stale, 0),
      (error: unknown) =>
        error instanceof ConflictError && /another tab/.test(error.message),
    );
    assert.deepEqual(await readFile(file), raw);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saved hinge and source receipts survive Undo/Redo and a new branch while explicit removal stays allowed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "yardwork-hinge-undo-"));
  try {
    const { before, project, planId } = historyFixture(),
      store = new ProjectStore(directory);
    await store.save(project, 0);
    const undone = retainHingeLabelHistory(before, project),
      redone = retainHingeLabelHistory(project, undone);
    assert.deepEqual(
      undone.lidHingePlans[0].axis,
      before.lidHingePlans[0].axis,
    );
    assert.equal(undone.lidHingePlans[0].referenceHistory.length, 1);
    assert.equal(undone.hingeStockSources[0].referenceHistory.length, 1);
    await store.save(undone, 1);
    await store.save(redone, 2);
    await store.save(undone, 3);
    let branch = saveLidHingePlan(undone, {
      ...undone.lidHingePlans[0],
      axis: {
        ...undone.lidHingePlans[0].axis,
        basis: "SYNTHETIC separate axis-review branch",
        measuredAt: "2026-11-16T18:00:00Z",
      },
    });
    branch = saveHingeStockSource(
      branch,
      updateHingeStockSource(
        branch.hingeStockSources[0],
        { notes: "SYNTHETIC separate source-note branch" },
        "New source branch after Undo",
      ),
    );
    const saved = await store.save(branch, 4);
    assert.equal(saved.project.lidHingePlans[0].referenceHistory.length, 2);
    assert.equal(saved.project.hingeStockSources[0].referenceHistory.length, 2);
    assert.deepEqual(
      saved.project.lidHingePlans[0].referenceHistory[0],
      project.lidHingePlans[0].referenceHistory[0],
    );
    assert.deepEqual(
      saved.project.hingeStockSources[0].referenceHistory[0],
      project.hingeStockSources[0].referenceHistory[0],
    );
    const removed = await store.save(
      { ...removeLidHingePlan(saved.project, planId), hingeStockSources: [] },
      5,
    );
    assert.equal(removed.revision, 6);
    assert.deepEqual(removed.project.lidHingePlans, []);
    assert.deepEqual(removed.project.hingeStockSources, []);
    assert.ok(
      removed.project.hingePlanLabels.some((row) => row.planId === planId),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP saves reject correct-revision hinge and stock history rewrites with409 and byte-identical storage", async () => {
  const directory = await mkdtemp(
      path.join(tmpdir(), "yardwork-hinge-http-prefix-"),
    ),
    fixture = historyFixture(),
    store = new ProjectStore(directory),
    saved = await store.save(fixture.project, 0),
    file = path.join(directory, `${fixture.project.id}.json`),
    original = await readFile(file),
    reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
        DATA_DIR: directory,
        OLLAMA_URL: "",
      },
      stdio: "pipe",
    },
  );
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.stdout.on("data", () => {});
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(ready, output || "Isolated storage test server failed");
    for (const mutation of mutations) {
      const candidate = structuredClone(saved.project);
      mutation.alter(candidate);
      const response = await fetch(`${base}/api/projects/${candidate.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: candidate, baseRevision: 1 }),
        }),
        data = await response.json();
      assert.equal(
        response.status,
        409,
        `${mutation.name}: ${JSON.stringify(data)}`,
      );
      assert.match(data.error, /history/i);
      assert.deepEqual(await readFile(file), original);
      assert.equal(
        (await (await fetch(`${base}/api/projects/${candidate.id}`)).json())
          .revision,
        1,
      );
    }
    assert.deepEqual(await readdir(directory), [`${fixture.project.id}.json`]);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await rm(directory, { recursive: true, force: true });
  }
});
