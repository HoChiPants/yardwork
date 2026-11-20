import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSchema } from "../src/model";
import { entryPartIds } from "../src/ideaBindingState";
import { applyFastenerRemap, previewFastenerRemap } from "../src/fastenerRemapping";
import { removeFastenerPlan, retainFastenerLabelHistory } from "../src/fastenings";
import { ConflictError, ProjectStore } from "../server/storage";

async function mappedFixture() {
  const p = projectSchema.parse(JSON.parse(await readFile(new URL("./fixtures/format5-storage-fasteners.yardwork.json", import.meta.url), "utf8"))),
    plan = p.fastenerPlans.find((item) => item.label === "W002")!,
    ids = entryPartIds(p, p.ideaBindings[0].entries[1]),
    heads = p.pieces.filter((piece) => ids.has(piece.id) && piece.designRole === "leg"),
    choice = { headPieceId: heads[0].id, receiverPieceId: plan.receiver.pieceId, locationMode: "clear" as const, basis: "Synthetic explicit selected member" },
    mapped = applyFastenerRemap(p, plan.id, choice, previewFastenerRemap(p, plan.id, choice).token);
  return { p, mapped, plan, heads, choice };
}

test("whole-project saves reject truncation or rewriting of retained reference history without touching stored bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-history-prefix-"));
  try {
    const { mapped, plan } = await mappedFixture(), store = new ProjectStore(dir),
      saved = await store.save(mapped, 0), file = path.join(dir, `${mapped.id}.json`), bytes = await readFile(file);
    for (const mutation of ["truncate", "rewrite-basis", "rewrite-measurement"]) {
      const candidate = structuredClone(saved.project), history = candidate.fastenerPlans.find((item) => item.id === plan.id)!.referenceHistory;
      if (mutation === "truncate") history.splice(0);
      else if (mutation === "rewrite-basis") history[0].basis = "Changed historical review";
      else history[0].previous.measurements.surfaceToTipDepth = 1.25;
      await assert.rejects(store.save(candidate, 1), (error: unknown) => error instanceof ConflictError && /history|earlier|record/i.test(error.message));
      assert.deepEqual(await readFile(file), bytes);
      assert.equal((await store.get(mapped.id))?.revision, 1);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stored history accepts Undo/Redo active references, a reviewed branch and explicit plan removal", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-history-undo-"));
  try {
    const { p, mapped, plan, heads, choice } = await mappedFixture(), store = new ProjectStore(dir);
    await store.save(mapped, 0);
    const undone = retainFastenerLabelHistory(p, mapped),
      redone = retainFastenerLabelHistory(mapped, undone);
    await store.save(undone, 1);
    await store.save(redone, 2);
    await store.save(undone, 3);
    assert.equal(undone.fastenerPlans.find((item) => item.id === plan.id)!.head.pieceId, plan.head.pieceId);
    assert.equal(undone.fastenerPlans.find((item) => item.id === plan.id)!.referenceHistory.length, 1);
    const changed = { ...choice, headPieceId: heads[1].id, basis: "Explicit branch after Undo" },
      branched = applyFastenerRemap(undone, plan.id, changed, previewFastenerRemap(undone, plan.id, changed).token),
      saved = await store.save(branched, 4);
    assert.equal(saved.project.fastenerPlans.find((item) => item.id === plan.id)!.referenceHistory.length, 2);
    const removed = await store.save(removeFastenerPlan(saved.project, plan.id), 5);
    assert.equal(removed.revision, 6);
    assert.ok(!removed.project.fastenerPlans.some((item) => item.id === plan.id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
