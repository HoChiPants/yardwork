import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { material, projectSchema, type Project } from "../src/model";
import { fastenerGuideMarkdown, fastenerGuideText } from "../src/fastenerGuide";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import { previewFastenerRemap, applyFastenerRemap } from "../src/fastenerRemapping";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { entryPartIds } from "../src/ideaBindingState";
import { bindingToken } from "../src/ideaBindings";
import { designFingerprint, generateBuildGuide, guideIsCurrent } from "../src/guide";

async function fixture() {
  return projectSchema.parse(JSON.parse(await readFile(new URL("./fixtures/format5-storage-fasteners.yardwork.json", import.meta.url), "utf8")));
}

test("stale measurements remain in JSON but are withheld from the current printed measurement summary", async () => {
  const p = await fixture(), plan = p.fastenerPlans.find((plan) => plan.label === "W002")!;
  plan.measurements = { surfaceToTipDepth: 1.8731, pilotDiameter: .1037, pilotDepth: 1.8169, basis: "Earlier measured setup", measuredAt: "2026-11-15T12:00:00.000Z" };
  const text = fastenerGuideText(p);
  assert.ok(text.includes("Coordinates and depths withheld"));
  assert.doesNotMatch(text, /1\.8731|0\.1037|1\.8169/);
  assert.ok(JSON.stringify(p).includes('"surfaceToTipDepth":1.8731'));
  assert.doesNotMatch(fastenerScheduleCsv(p), /1\.8731|0\.1037|1\.8169/);
});

test("mapped exports retain historical provenance without releasing its old drilling values", async () => {
  const p = await fixture(), before = structuredClone(p), plan = p.fastenerPlans.find((plan) => plan.label === "W002")!,
    owned = entryPartIds(p, p.ideaBindings[0].entries[1]),
    head = p.pieces.find((piece) => owned.has(piece.id) && piece.designRole === "leg")!;
  plan.measurements = { surfaceToTipDepth: 1.8731, pilotDiameter: .1037, pilotDepth: 1.8169, basis: "Earlier measured setup", measuredAt: "2026-11-15T12:00:00.000Z" };
  const basis = "Replacement inspected\n## Approved? No automatic installation finding",
    choice = { headPieceId: head.id, receiverPieceId: plan.receiver.pieceId, locationMode: "clear" as const, basis },
    preview = previewFastenerRemap(p, plan.id, choice),
    mapped = applyFastenerRemap(p, plan.id, choice, preview.token),
    next = mapped.fastenerPlans.find((item) => item.id === plan.id)!;
  assert.equal(next.label, plan.label);
  assert.deepEqual(next.referenceHistory[0].previous.measurements, plan.measurements);
  assert.deepEqual(mapped.fastenerPlans.find((item) => item.label === "W001"), before.fastenerPlans.find((item) => item.label === "W001"));
  assert.deepEqual(mapped.supplies, before.supplies);
  assert.deepEqual(mapped.supplyInventory, before.supplyInventory);
  assert.deepEqual(mapped.pieces, before.pieces);
  const printed = fastenerGuideText(mapped), markdown = fastenerGuideMarkdown(mapped), csv = fastenerScheduleCsv(mapped);
  assert.match(printed, /Historical reference reviews/);
  assert.match(printed, /not current drilling instructions/);
  assert.match(printed, /original geometry was not captured/i);
  for (const output of [printed, markdown, csv]) assert.doesNotMatch(output, /1\.8731|0\.1037|1\.8169/);
  assert.doesNotMatch(markdown, /^## Approved/m);
  assert.match(csv, /Recorded reference reviews/);
  assert.match(csv, /Historical provenance only/);
  const regenerated = generateBuildGuide(mapped), oldNeighbor = p.steps.find((step) => step.generated?.kind === "wood-fastener-preparation" && step.generated.planId === p.fastenerPlans[0].id)!;
  assert.equal(guideIsCurrent(regenerated), true);
  assert.deepEqual(regenerated.steps.find((step) => step.id === oldNeighbor.id), oldNeighbor);
});

test("adding baseline and historical-only metadata preserves existing guide and saved-design physical freshness", async () => {
  const p = await fixture(), plan = p.fastenerPlans.find((item) => item.label === "W001")!,
    id = p.ideaBindings[0].id, fp = designFingerprint(p), token = bindingToken(p, id),
    recorded = makeFastenerPlan(p, plan.head.pieceId, plan.receiver.pieceId),
    changed: Project = structuredClone(p), next = changed.fastenerPlans.find((item) => item.id === plan.id)!;
  next.head.baseline = recorded.head.baseline;
  next.receiver.baseline = recorded.receiver.baseline;
  next.referenceHistory = [{
    id: crypto.randomUUID(), kind: "refresh", at: "2026-11-16T12:00:00.000Z", basis: "Historical-only receipt for freshness regression", locationMode: "retain-local",
    previous: { head: structuredClone(plan.head), receiver: structuredClone(plan.receiver), locations: structuredClone(plan.locations), measurements: structuredClone(plan.measurements), productId: plan.productId, productEvidenceRevision: plan.productEvidenceRevision, nextLocationNumber: plan.nextLocationNumber },
    next: { head: structuredClone(next.head), receiver: structuredClone(next.receiver), productId: next.productId, productEvidenceRevision: next.productEvidenceRevision },
  }];
  assert.equal(designFingerprint(changed), fp);
  assert.equal(bindingToken(changed, id), token);
  assert.equal(guideIsCurrent(changed), true);
  assert.deepEqual(generateBuildGuide(changed).steps, p.steps);
});

test("a changed trusted stock reference invalidates derived guide review without rewriting the saved design", async () => {
  const original = await fixture(), old = original.fastenerPlans.find((plan) => plan.label === "W001")!,
    plan = makeFastenerPlan(original, old.head.pieceId, old.receiver.pieceId),
    p = generateBuildGuide(saveFastenerPlan(original, plan)),
    stock = material(p.pieces.find((piece) => piece.id === plan.head.pieceId)!.material),
    before = stock.productReference, physicalFingerprint = designFingerprint(p), savedPlan = structuredClone(p.fastenerPlans.find((item) => item.id === plan.id));
  assert.equal(guideIsCurrent(p), true);
  try {
    stock.productReference = `${before}-changed-source-regression`;
    assert.equal(designFingerprint(p), physicalFingerprint);
    assert.equal(guideIsCurrent(p), false);
    const updated = generateBuildGuide(p);
    assert.equal(guideIsCurrent(updated), true);
    assert.match(updated.steps.find((step) => step.generated?.kind === "wood-fastener-preparation" && step.generated.planId === plan.id)!.notes, /stale/);
    assert.deepEqual(p.fastenerPlans.find((item) => item.id === plan.id), savedPlan);
  } finally {
    stock.productReference = before;
  }
});
