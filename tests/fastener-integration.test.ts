import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema } from "../src/model";
import { addFastenerLocation, fastenerReviews, makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { fastenerPurchaseSummary, addMissingFastenerPacks } from "../src/fastenerPurchases";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { fastenerGuideText } from "../src/fastenerGuide";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import { guideMarkdown, bom, connect } from "../src/engine";
import { toolChecklist } from "../src/tools";
import { createBuildStudy } from "../src/buildFixtures";
import { bindingPlan, bindingToken, previewIdeaRevision, applyIdeaRevision } from "../src/ideaBindings";
import { previewPartStockReplacement } from "../src/partStockReplacement";

function fixture(count = 1) {
  let p = blank("Synthetic authored wood-fastener locations");
  p.pieces = [
    part("Head panel", "plytanium-703", [0.703, 24, 8], [0.3515, 12, 0], p.steps[0].id, "Casework"),
    part("Wood receiver", "stud", [3.5, 24, 1.5], [2.453, 12, 0], p.steps[0].id, "Casework"),
  ];
  let plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id);
  for (let i = 0; i < count; i++) {
    plan = addFastenerLocation(plan);
    plan.locations[i].entranceLocal = [-0.3515, -10 + i * 0.2, 0];
    plan.locations[i].driveLocal = [1, 0, 0];
  }
  plan.measurements = { surfaceToTipDepth: 2.375, pilotDiameter: 0.1, pilotDepth: 2.2, basis: "SYNTHETIC user-entered proposed seating and drill-tip depths; no physical installation", measuredAt: "2026-11-15T09:30:00.000Z" };
  p = saveFastenerPlan(p, plan);
  return p;
}

test("swapping same-thickness casework stock preserves the fastener record and reopens its reference review", () => {
  const project = fixture();
  const panel = project.pieces[0];
  assert.equal(fastenerReviews(project)[0].state, "path-reviewed");
  const { project: modified } = previewPartStockReplacement(project, panel.id, "hd-purebond-birch-703");
  assert.deepEqual(modified.pieces[0], { ...panel, material: "hd-purebond-birch-703" });
  assert.deepEqual(modified.fastenerPlans, project.fastenerPlans);
  assert.equal(fastenerReviews(modified)[0].state, "stale");
  assert.equal(fastenerPurchaseSummary(modified).products[0].plannedScrews, 0);
});

test("explicit points count packs once and add-missing is idempotent without installed meshes or joint quantities", () => {
  let p = fixture(100);
  const next = addFastenerLocation(makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id));
  next.locations[0].entranceLocal = [-0.3515, 11, 0];
  next.locations[0].driveLocal = [1, 0, 0];
  next.measurements = { ...p.fastenerPlans[0].measurements };
  p = saveFastenerPlan(p, next);
  const before = structuredClone(p), row = fastenerPurchaseSummary(p).products[0];
  assert.equal(row.plannedScrews, 101);
  assert.equal(row.requiredPacks, 2);
  assert.equal(p.supplies.length, 0);
  const bought = addMissingFastenerPacks(p, row.productId);
  assert.deepEqual(bought.pieces, before.pieces);
  assert.deepEqual(bought.joints, before.joints);
  assert.equal(bought.supplies[0].quantity, 2);
  assert.deepEqual(addMissingFastenerPacks(bought, row.productId), bought);
  assert.equal(fastenerPurchaseSummary(bought).products[0].spareScrews, 99);
  assert.equal(bom(bought).some((r) => r.id === "screw"), false);
});

test("legacy pairwise quantities remain visible with a duplicate-representation warning", () => {
  const p = fixture(), legacy = connect(p, p.pieces[0].id, p.pieces[1].id, p.steps[0].id, 2, 3);
  assert.equal(fastenerPurchaseSummary(legacy).products[0].plannedScrews, 1);
  assert.match(fastenerPurchaseSummary(legacy).warnings.join(" "), /same physical fasteners/);
  assert.equal(bom(legacy).find((row) => row.id === "screw")!.physicalStockUnits, 2);
});

test("user fastening notes cannot escape their labeled provenance in Markdown or spreadsheet cells", () => {
  const p = fixture(), plan = p.fastenerPlans[0];
  plan.name = "## Forged heading";
  plan.notes = "keep\n\n## Installation approved\n\nSource: https://example.invalid/approved";
  plan.measurements.basis = "=SUM(1,2)\n\n> verified";
  const before = JSON.stringify(p), md = guideMarkdown(p), csv = fastenerScheduleCsv(p);
  assert.ok(!md.includes("\n## Installation approved"));
  assert.ok(!md.includes("\nSource: https://example.invalid/approved"));
  assert.match(md, /Saved plan notes: keep/);
  assert.match(md, /\\#\\# Installation approved/);
  assert.ok(csv.includes("'=SUM(1,2)"));
  assert.equal(JSON.stringify(p), before);
});

test("guide preparation preserves custom history, excludes allocation counters from freshness and exports pending-aware labeled paths", () => {
  let p = generateBuildGuide(fixture());
  const prep = p.steps.find((s) => s.generated?.kind === "wood-fastener-preparation")!;
  prep.title = "My drive setup";
  prep.notes = "Use my test block first.\n" + prep.notes + "\nCheck my clamp access.";
  prep.complete = true;
  p.history.push({ id: crypto.randomUUID(), at: "2026-11-15T10:00:00.000Z", stepId: prep.id, message: "Recorded the fixture review." });
  // Existing guide behavior collects custom prefix/suffix notes once after its generated baseline.
  p = generateBuildGuide(p);
  const retained = p.steps.find((step) => step.id === prep.id)!;
  assert.equal(retained.title, "My drive setup");
  assert.equal(retained.complete, true);
  assert.equal(retained.notes.split("Use my test block first.").length, 2);
  assert.equal(retained.notes.split("Check my clamp access.").length, 2);
  const grown = structuredClone(p);
  grown.fastenerPlans[0].nextLocationNumber += 1;
  grown.fastenerPlans[0].updatedAt = "2026-11-16T10:00:00.000Z";
  assert.ok(guideIsCurrent(grown));
  const again = generateBuildGuide(grown);
  assert.deepEqual(again.steps, p.steps);
  assert.deepEqual(again.history, p.history);
  const md = guideMarkdown(again), text = fastenerGuideText(again), csv = fastenerScheduleCsv(again);
  assert.match(md, /Wood-fastener locations/);
  assert.match(text, /F001/);
  assert.match(text, /P001/);
  assert.match(text, /not thread engagement/);
  assert.ok(csv.includes('"W001/F001"'));
  const altered = structuredClone(again);
  altered.pieces[1].position[0] += 0.25;
  assert.equal(fastenerReviews(altered)[0].state, "stale");
  assert.equal(fastenerPurchaseSummary(altered).products[0].plannedScrews, 0);
  assert.match(fastenerGuideText(altered), /Coordinates and depths withheld/);
  assert.ok(!fastenerScheduleCsv(altered).includes(',2.375,'));
  const tools = toolChecklist(p);
  assert.ok(tools.requirements.some((r) => r.sources.some((s) => s.kind === "fastener-plan")));
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))), p);
});

test("a scoped AI rebuild requires review for explicit target locations and keeps the old intent stale instead of inventing replacements", () => {
  let p = createBuildStudy("storage-banquette").project;
  const binding = p.ideaBindings[0], entry = binding.entries[1], ids = p.sections.find((s) => s.id === entry.sections[0].sectionId)!.pieceIds;
  let plan = addFastenerLocation(makeFastenerPlan(p, ids[0], ids[1]));
  p = saveFastenerPlan(p, plan);
  const token = bindingToken(p, binding.id), proposal = bindingPlan(p, binding.id, [entry.id]);
  proposal.modules[0].height += 2;
  const preview = previewIdeaRevision(p, binding.id, proposal, token, { entryIds: [entry.id] });
  assert.equal(preview.impact.affectedFastenerPlans, 1);
  assert.ok(preview.requiresRebuild);
  assert.throws(() => applyIdeaRevision(p, binding.id, proposal, token, { entryIds: [entry.id] }), /review|rebuild/i);
  const revised = applyIdeaRevision(p, binding.id, proposal, token, { entryIds: [entry.id], allowRebuild: true });
  assert.deepEqual(revised.fastenerPlans, p.fastenerPlans);
  assert.equal(fastenerReviews(revised)[0].state, "stale");
  plan = addFastenerLocation(plan);
  const edited = saveFastenerPlan(p, plan);
  assert.notEqual(bindingToken(edited, binding.id), token);
  assert.throws(() => applyIdeaRevision(edited, binding.id, proposal, token, { entryIds: [entry.id], allowRebuild: true }), /changed|stale|preview/i);
});

test("a third solid changes the affected assembly review even though selected members and saved locations stay unchanged", () => {
  const p = generateBuildGuide(fixture());
  for (const step of p.steps) step.complete = true;
  const blocked = structuredClone(p);
  blocked.pieces.push(part("Intervening sheet", "roof", [2, 0.03, 2], [1.2, 4, 0], p.steps[0].id, "Other work"));
  // The first explicit point's world Y is2, so this sheet initially misses it.
  blocked.pieces.at(-1)!.position[1] = 2;
  assert.equal(fastenerReviews(blocked)[0].state, "conflict");
  const regenerated = generateBuildGuide(blocked),
    oldAssembly = p.steps.find((s) => s.generated?.kind === "assembly-stage" && s.generated.memberIds.includes(p.pieces[0].id))!;
  assert.equal(regenerated.steps.find((s) => s.id === oldAssembly.id)!.complete, false);
  assert.deepEqual(blocked.fastenerPlans, p.fastenerPlans);
});
