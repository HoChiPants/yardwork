import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectSchema, type Project } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { connectorReviews, makeConnectorPlan, saveConnectorPlan, refreshConnectorPlan } from "../src/connectors";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { connectorScheduleCsv } from "../src/connectorCsv";
import { connectorGuideText } from "../src/connectorGuide";
import { connectionCoverage } from "../src/connectionCoverage";
import { connectionCoverageMarkdown } from "../src/connectionGuide";
import { connectorPurchaseSummary } from "../src/connectorPurchases";
import { guideMarkdown, bom, connect } from "../src/engine";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { ProjectStore, ConflictError } from "../server/storage";

function fixture(): Project {
  const raw = JSON.parse(readFileSync(new URL("../public/examples/builds/storage-banquette.yardwork.json", import.meta.url), "utf8"));
  let p = projectSchema.parse(raw);
  const rear = p.pieces.find((piece) => piece.assembly === "Banquette section 1" && piece.name.includes("storage rear"))!;
  const post = p.pieces.find((piece) => piece.assembly === "Banquette section 1" && piece.name.endsWith("leg"))!;
  p = saveFastenerPlan(p, makeFastenerPlan(p, rear.id, post.id));
  return generateBuildGuide(p);
}
function addConnector(p: Project) {
  const base = p.pieces.find((piece) => piece.assembly === "Banquette section 1" && piece.name.includes("top rail"))!;
  const post = p.pieces.find((piece) => piece.assembly === "Banquette section 1" && piece.name.endsWith("leg"))!;
  return saveConnectorPlan(p, makeConnectorPlan(p, base.id, post.id, { name: "SYNTHETIC A21Z software test; mounting fit unknown" }));
}
function enterWoodPaths(p: Project) {
  const plan = structuredClone(p.connectorPlans[0]);
  plan.entries.forEach((entry, index) => {
    const member = p.pieces.find((piece) => piece.id === plan[entry.role].pieceId)!;
    entry.entranceLocal = entry.role === "base" ? [index === 0 ? -.25 : .25, 0, member.size[2] / 2] : [0, index === 2 ? -.25 : .25, member.size[2] / 2];
    entry.driveLocal = [0, 0, -1];
    entry.measurements = { woodEntryToTipDepth: .5, pilotDiameter: .0625, pilotDepth: .25,
      basis: "SYNTHETIC software wood-path inputs only; no actual mounting, hole pattern or installation", measuredAt: new Date().toISOString() };
  });
  return saveConnectorPlan(p, plan);
}

test("actual banquette connector intent preserves W/H geometry and purchases, and distinguishes reference slots from entered paths", () => {
  const p = fixture(), original = JSON.stringify(p), next = addConnector(p), coverage = connectionCoverage(next);
  assert.equal(JSON.stringify(p), original);
  for (const key of ["pieces", "fastenerPlans", "lidHingePlans", "hingeStockSources", "supplies", "inventory", "supplyInventory"] as const) assert.deepEqual(next[key], p[key]);
  assert.deepEqual(bom(next), bom(p));
  const intents = coverage.intents.filter((intent) => intent.kind === "angle-connector");
  assert.equal(intents.length, 4);
  assert.ok(intents.every((intent) => intent.state === "started" && !intent.current && intent.explicitLocationCount === 0));
  assert.equal(connectorPurchaseSummary(next).plannedConnectors, 1);
  assert.equal(connectorPurchaseSummary(next).plannedFasteners, 4);
  const pending = homeDepotPurchaseNeeds(next).find(({ id }) => id === "simpson-a21z");
  assert.equal(pending?.canAdd, false);
  assert.match(pending?.issue ?? "", /Review the connector entries/);
  const guide = generateBuildGuide(next);
  assert.ok(guideIsCurrent(guide));
  assert.ok(guide.steps.some((phase) => phase.generated?.kind === "connector-preparation"));
  assert.match(guideMarkdown(guide), /A21Z connector plans/);
  assert.match(connectionCoverageMarkdown(guide), /C001/);
  assert.match(connectorGuideText(guide), /manufactured hole pattern/);
});

test("entered single-member wood paths stay pending for connector fit, stale numerics are withheld and explicit refresh preserves history/custom guide notes", () => {
  const p = enterWoodPaths(addConnector(fixture())), review = connectorReviews(p)[0];
  assert.equal(review.state, "paths-reviewed");
  assert.equal(review.activeEntryCount, 4);
  assert.equal(review.scheduledFastenerCount, 4);
  assert.ok(review.entries.every((entry) => entry.measurementsCurrent));
  const angle = "simpson-a21z";
  const selected = addHomeDepotPurchaseNeed(p, angle);
  assert.equal(selected.supplies.find(({ productId }) => productId === angle)?.quantity, 1);
  assert.deepEqual(selected.connectorPlans, p.connectorPlans);
  const { base, post } = review.plan;
  const overlapping = connect(p, base.pieceId, post.pieceId, p.steps[0].id, 4, 3, "screw");
  assert.throws(() => addHomeDepotPurchaseNeed(overlapping, angle), /Recorded connections/);
  assert.match(connectorScheduleCsv(p), /,"yes",0.5,0.0625,0.25,/);
  assert.ok(connectionCoverage(p).intents.filter((intent) => intent.kind === "angle-connector").every((intent) => intent.state === "pending"));
  let guide = generateBuildGuide(p);
  const phase = guide.steps.find((step) => step.generated?.kind === "connector-preparation")!;
  phase.complete = true;
  phase.notes += "\n\nKeep the custom dry-fit access review.";
  const oldPlan = structuredClone(guide.connectorPlans[0]);
  guide = { ...guide, pieces: guide.pieces.map((piece) => piece.id === oldPlan.base.pieceId ? { ...piece, position: [piece.position[0] + 1, piece.position[1], piece.position[2]] } : piece) };
  assert.equal(connectorReviews(guide)[0].state, "stale");
  assert.equal(guideIsCurrent(guide), false);
  assert.ok(!connectorScheduleCsv(guide).includes("0.0625"));
  const refreshed = refreshConnectorPlan(guide, oldPlan);
  assert.deepEqual(refreshed.referenceHistory.at(-1)!.previous.entries, oldPlan.entries);
  assert.ok(refreshed.entries.every((entry) => entry.entranceLocal === null && entry.driveLocal === null && entry.measurements.woodEntryToTipDepth === null));
  const saved = saveConnectorPlan(guide, refreshed), regenerated = generateBuildGuide(saved);
  const nextPhase = regenerated.steps.find((step) => step.id === phase.id)!;
  assert.equal(nextPhase.complete, false);
  assert.match(nextPhase.notes, /Keep the custom dry-fit access review/);
  assert.ok(guideIsCurrent(regenerated));
  assert.deepEqual(regenerated.fastenerPlans, guide.fastenerPlans);
  assert.deepEqual(regenerated.lidHingePlans, guide.lidHingePlans);
});

test("explicit format8 saves retain connector history and reject same-revision truncation/rewrite without touching stored bytes", async () => {
  let p = enterWoodPaths(addConnector(fixture()));
  const originalPlan = p.connectorPlans[0];
  p = { ...p, pieces: p.pieces.map((piece) => piece.id === originalPlan.base.pieceId ? { ...piece, position: [piece.position[0] + 1, piece.position[1], piece.position[2]] } : piece) };
  p = saveConnectorPlan(p, refreshConnectorPlan(p, originalPlan));
  const directory = await mkdtemp(path.join(tmpdir(), "yardwork-connector-store-"));
  try {
    const store = new ProjectStore(directory), saved = await store.save(p, 0), file = path.join(directory, `${p.id}.json`), bytes = await readFile(file);
    assert.equal(saved.project.schemaVersion, PROJECT_FORMAT_VERSION);
    assert.deepEqual((await new ProjectStore(directory).get(p.id))!.project, saved.project);
    for (const mutate of [(next: Project) => { next.connectorPlans[0].referenceHistory = []; }, (next: Project) => { next.connectorPlans[0].referenceHistory[0].basis = "rewritten"; }]) {
      const candidate = structuredClone(saved.project); mutate(candidate);
      await assert.rejects(() => store.save(candidate, 1), ConflictError);
      assert.deepEqual(await readFile(file), bytes);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("future measurement provenance withholds raw depths in guide/CSV while preserving current entrance geometry and saved intent", () => {
  let p = enterWoodPaths(addConnector(fixture()));
  const plan = structuredClone(p.connectorPlans[0]), entry = plan.entries[0];
  entry.measurements = { woodEntryToTipDepth: .812345, pilotDiameter: .061234, pilotDepth: .312345,
    basis: "SYNTHETIC future provenance regression only", measuredAt: new Date(Date.now() + 86400000).toISOString() };
  p = saveConnectorPlan(p, plan);
  const raw = JSON.stringify(p), review = connectorReviews(p)[0], point = review.entries[0];
  assert.equal(review.activeConnectorCount, 1);
  assert.equal(review.scheduledFastenerCount, 4);
  assert.equal(point.state, "needs-measurements");
  assert.equal(point.measurementsCurrent, false);
  assert.ok(point.entranceWorld && point.driveWorld);
  assert.equal(point.tipWorld, null);
  const csv = connectorScheduleCsv(p), guide = connectorGuideText(p);
  for (const value of ["0.812345", "0.061234", "0.312345"]) {
    assert.ok(!csv.includes(value), `future value leaked to CSV: ${value}`);
    assert.ok(!guide.includes(value), `future value leaked to guide: ${value}`);
  }
  assert.match(guide, /Saved basis \(not current\)/);
  assert.equal(connectorReviews(p, Date.now() + 172800000)[0].entries[0].measurementsCurrent, true);
  assert.equal(JSON.stringify(p), raw);
});
