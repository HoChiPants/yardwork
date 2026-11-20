import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { projectSchema, uid } from "../../src/model";
import { entryPartIds } from "../../src/ideaBindingState";
import { previewFastenerRemap, applyFastenerRemap } from "../../src/fastenerRemapping";
import { removeFastenerPlan } from "../../src/fastenings";

test("project API rejects rewritten reference history byte-for-byte and permits explicit plan removal", async ({ request }) => {
  const p = projectSchema.parse(JSON.parse(await readFile(new URL("../fixtures/format5-storage-fasteners.yardwork.json", import.meta.url), "utf8")));
  p.id = uid();
  p.name = "SYNTHETIC reference-history API guard";
  const plan = p.fastenerPlans.find((item) => item.label === "W002")!,
    owned = entryPartIds(p, p.ideaBindings[0].entries[1]),
    selected = p.pieces.find((piece) => owned.has(piece.id) && piece.designRole === "leg")!,
    choice = { headPieceId: selected.id, receiverPieceId: plan.receiver.pieceId, locationMode: "clear" as const, basis: "Explicit actual-ID API qualification fixture" },
    mapped = applyFastenerRemap(p, plan.id, choice, previewFastenerRemap(p, plan.id, choice).token),
    path = `/api/projects/${p.id}`;
  const created = await request.put(path, { data: { project: mapped, baseRevision: 0 } });
  expect(created.status()).toBe(200);
  const saved = await created.json(), raw = await (await request.get(`${path}/original`)).body();
  for (const mutation of ["truncate", "rewrite"] as const) {
    const changed = structuredClone(saved.project), history = changed.fastenerPlans.find((item: { id: string }) => item.id === plan.id).referenceHistory;
    if (mutation === "truncate") history.splice(0);
    else history[0].basis = "Changed an earlier recorded review";
    const refused = await request.put(path, { data: { project: changed, baseRevision: saved.revision } });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toMatch(/history|earlier|record/i);
    expect(await (await request.get(path)).json()).toEqual(saved);
    expect(await (await request.get(`${path}/original`)).body()).toEqual(raw);
  }
  const removed = await request.put(path, { data: { project: removeFastenerPlan(saved.project, plan.id), baseRevision: saved.revision } });
  expect(removed.status()).toBe(200);
  expect((await removed.json()).revision).toBe(saved.revision + 1);
});
