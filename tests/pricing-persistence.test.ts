import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { catalog, inventorySchema, part, projectSchema } from "../src/model";
import { bom, projectPricingCoverage, usableInventory } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { bindingToken } from "../src/ideaBindings";
import { ProjectStore } from "../server/storage";

async function archivedProject() {
  const bytes = await readFile(new URL("./fixtures/format6-remapped-storage.yardwork.json", import.meta.url)),
    provenance = JSON.parse(await readFile(new URL("./fixtures/format6-remapped-storage.provenance.json", import.meta.url), "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sha256);
  return JSON.parse(bytes.toString());
}

test("pricing metadata leaves actual format6 geometry, reference receipts, guide reviews and tokens unchanged", async () => {
  const old = await archivedProject(), p = projectSchema.parse(old), bytes = JSON.stringify(p),
    token = bindingToken(p, p.ideaBindings[0].id);
  assert.deepEqual(p, { ...old, schemaVersion: PROJECT_FORMAT_VERSION, lidHingePlans: [], hingeStockSources: [], hingePlanLabels: [], connectorPlans: [], connectorPlanLabels: [] });
  assert.ok(guideIsCurrent(p));
  const coverage = projectPricingCoverage(p);
  assert.ok(coverage.lineCount > 0);
  assert.deepEqual(generateBuildGuide(p).steps, old.steps);
  assert.equal(bindingToken(p, p.ideaBindings[0].id), token);
  assert.equal(JSON.stringify(p), bytes);
  assert.equal(p.schemaVersion, PROJECT_FORMAT_VERSION);
});

test("historical SD retailer observations remain readable and byte-safe without becoming current prices", async () => {
  const old = await archivedProject(), stock = catalog.find((item) => item.productReference === "simpson-sd9112r100")!;
  assert.ok(stock);
  old.retailer = "home-depot";
  old.store = "SYNTHETIC OLD SD SNAPSHOT";
  const observation = { retailer: "home-depot", material: stock.id, internetNumber: "306373352", name: "SYNTHETIC formerly admitted SD observation", price: 987.65, available: 20, store: old.store, zip: old.zip, checkedAt: new Date().toISOString(), url: "https://www.homedepot.com/p/306373352" };
  old.inventory.push(observation);
  old.pieces.push(part("SYNTHETIC retained SD envelope", stock.id, [...stock.size], [100, 4, 0], old.steps[0].id, "Separate manual hardware"));
  assert.equal(inventorySchema.safeParse(observation).success, false);
  const dir = await mkdtemp(path.join(tmpdir(), "yardwork-observation-history-"));
  try {
    const file = path.join(dir, `${old.id}.json`), bytes = Buffer.from(JSON.stringify({ project: old, revision: 4 })), store = new ProjectStore(dir);
    await writeFile(file, bytes);
    const loaded = (await store.get(old.id))!;
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await store.getOriginal(old.id), bytes);
    assert.deepEqual(loaded.project.inventory.at(-1), observation);
    assert.equal(usableInventory(loaded.project, stock.id), undefined);
    const row = bom(loaded.project).find((item) => item.id === stock.id)!;
    assert.equal(row.priceSource, "unknown");
    assert.equal(row.unpriced, true);
    assert.equal(projectPricingCoverage(loaded.project).observedSubtotal, 0);
    const saved = await store.save(loaded.project, 4);
    assert.equal(saved.revision, 5);
    assert.deepEqual(saved.project.inventory.at(-1), observation);
    assert.deepEqual(saved.project.fastenerPlans, old.fastenerPlans);
    assert.deepEqual((await store.get(old.id))?.project, saved.project);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
