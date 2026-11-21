import assert from "node:assert/strict";
import test from "node:test";
import { inspectCutStock, setCutSourceOnHand } from "../src/cutStock";
import { bom, guideMarkdown } from "../src/engine";
import { acceptIdeaRevisionPreview, bindingPlan, bindingReview, bindingToken, previewIdeaRevision } from "../src/ideaBindings";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema } from "../src/model";
import { assignOffcutToPart, fittingOffcuts } from "../src/offcutAssignment";
import { planOffcutRelease } from "../src/offcutReleasePlan";
import { completePlannedCutSource, releasePlannedCutSources } from "../src/plannedCutSources";
import { localIdeaPlan, previewIdeaPlan } from "../src/planning";
import { previewProposalStock, proposalStockRequest } from "../src/proposalStock";
import { planStockCutLayouts, recordStockCutLayouts } from "../src/recordStockCutLayout";

const prompt = "Build a workbench 48 inches wide, 20 inches deep and 36 inches tall";

function shop() {
  const base = blank("Workbench stock");
  const existing = part("Existing blank", "stud", [3.5, 1.5, 10], [90, 0.75, 0], base.steps[0].id, "Existing");
  base.pieces.push(existing);
  const stocked = addMeasuredOffcut(base, base.steps[0].id, "stud", [88, 3.5, 1.5], "Long shop scrap");
  const project = addMeasuredOffcut(stocked, base.steps[0].id, "stud", [12, 3.5, 1.5], "Small shop scrap");
  return { project, existing };
}

test("a proposed workbench shows stock sequences and reuses only the selected scrap on its new parts", () => {
  const { project, existing } = shop();
  const candidate = previewIdeaPlan(project, localIdeaPlan({ prompt })).project;
  const sourceBefore = JSON.stringify(project);
  const plain = previewProposalStock(project, candidate, null);
  assert.equal(plain.project, candidate);
  assert.ok(plain.materials.some(({ sequences }) => sequences.some(({ remnants }) => remnants.length)));
  assert.deepEqual(proposalStockRequest("Show cuts for this proposal."), { kind: "cuts" });
  assert.deepEqual(proposalStockRequest("Please use O0001 and O002 for this layout"), { kind: "reuse", labels: ["O001", "O002"] });
  assert.equal(proposalStockRequest("Make the bench 6 inches wider"), null);
  assert.throws(() => previewProposalStock(project, candidate, ["O999"]), /O999 is missing/);
  const proposed = previewProposalStock(project, candidate, ["O001"]);
  const plan = proposed.plan!;
  assert.deepEqual(plan.purchases.map(({ id, before, after }) => ({ id, before, after })), [{ id: "stud", before: 4, after: 3 }]);
  assert.deepEqual(plan.assignments.map(({ from, fromEarlierCut }) => [from.split(" ")[0], fromEarlierCut]), [["O001", false], ["O003", true]]);
  assert.deepEqual(plan.remnants.map(({ label, size }) => ({ label, size })), [{ label: "O004", size: [1.5, 3.5, 8] }]);
  assert.deepEqual(plan.project.pieces.find(({ id }) => id === existing.id), existing);
  assert.ok(plan.project.pieces.some(({ offcut, name }) => offcut && name.includes("Small shop scrap")));
  assert.ok(plan.assignments.every(({ partId }) => candidate.pieces.some(({ id }) => id === partId) &&
    !project.pieces.some(({ id }) => id === partId)));
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(plan.project)));
  assert.match(guideMarkdown(reopened), /## Recorded offcut cut order[\s\S]+O004/);
  assert.equal(JSON.stringify(project), sourceBefore);
});

test("an approved saved-design revision retains its preview IDs and leaves other workshop parts alone", () => {
  const { project, existing } = shop();
  const applied = previewIdeaPlan(project, localIdeaPlan({ prompt })).project;
  const id = applied.ideaBindings[0].id;
  const previous = bindingPlan(applied, id);
  const plan = localIdeaPlan({ previousPlan: previous, prompt: "Make the workbench 42 inches wide" });
  const revision = previewIdeaRevision(applied, id, plan, bindingToken(applied, id));
  assert.equal(acceptIdeaRevisionPreview(revision, true), revision.project);
  const stock = previewProposalStock(applied, revision.project, ["O001"]);
  assert.ok(stock.plan!.assignments.length > 0);
  assert.equal(stock.project.sections[0].recipe?.width, 42);
  assert.deepEqual(stock.project.sections.map(({ id }) => id), revision.project.sections.map(({ id }) => id));
  assert.deepEqual(stock.project.pieces.find(({ id }) => id === existing.id), existing);
  for (const { partId } of stock.plan!.assignments)
    assert.ok(revision.project.pieces.some(({ id }) => id === partId));
});

test("save-cut requests stay on the current proposal and require a cut or leftover action", () => {
  assert.deepEqual(proposalStockRequest("Please save the cut order with this proposal!"), { kind: "save-cuts" });
  assert.deepEqual(proposalStockRequest("Keep scraps from this design"), { kind: "save-cuts" });
  assert.deepEqual(proposalStockRequest("Show cuts for this proposal"), { kind: "cuts" });
  assert.deepEqual(proposalStockRequest("Use O002 for this proposal"), { kind: "reuse", labels: ["O002"] });
  assert.equal(proposalStockRequest("Build a cabinet with a board to keep scraps"), null);
});

test("saving proposal wood orders uses the previewed sources and makes labeled offcuts reusable", () => {
  const current = blank("More shop storage");
  const step = current.steps[0].id;
  const existing = part("Existing cleat", "stud", [3.5, 1.5, 14], [100, 0.75, 0], step, "Existing");
  current.pieces.push(existing);
  const additions = [
    part("Long frame rail", "stud", [3.5, 1.5, 60], [0, 0.75, 0], step, "New"),
    part("Short frame rail", "stud", [3.5, 1.5, 40], [15, 0.75, 0], step, "New"),
    part("Shelf", "plywood", [30, 0.75, 36], [0, 12, 0], step, "New"),
  ];
  const candidate = { ...current, pieces: [...current.pieces, ...additions] };
  const preview = previewProposalStock(current, candidate, null);
  const [shared] = preview.recordable.filter(({ existingPartIds }) => existingPartIds.length);
  assert.deepEqual(shared.existingPartIds, [existing.id]);
  const exclusive = preview.recordable.filter(({ existingPartIds }) => !existingPartIds.length);
  assert.deepEqual(exclusive.map(({ layout }) => layout.kind), ["board", "sheet"]);
  const recorded = recordStockCutLayouts(preview.project, exclusive.map(({ layout }) => layout));
  assert.equal(recorded.sourceIds.length, 2);
  assert.deepEqual(recorded.project.pieces[0], existing);
  assert.deepEqual(recorded.project.onHandCutSources, current.onHandCutSources);
  assert.equal(candidate.pieces.every(({ cutStock }) => !cutStock), true);

  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(recorded.project)));
  const demand = (project: typeof current) => bom(project).map(({ id, quantity }) => [id, quantity]);
  assert.deepEqual(demand(reopened), demand(candidate));
  assert.match(guideMarkdown(reopened), /Stock cut order for P\d+ · 1\. Crosscut/);
  const [match] = fittingOffcuts(reopened, existing);
  assert.ok(match);
  const reused = assignOffcutToPart(reopened, existing.id, match.piece.id);
  const installed = reused.pieces.find(({ id }) => id === existing.id)!;
  assert.deepEqual({ ...installed, cutStock: null }, existing);
  assert.equal(installed.cutStock?.id, match.piece.cutStock?.id);
  assert.ok(inspectCutStock(reused).valid.has(installed.cutStock!.id));
  assert.deepEqual(demand(reused), demand(candidate));

  const sharedPlan = recordStockCutLayouts(preview.project, preview.recordable.map(({ layout }) => layout));
  assert.deepEqual({ ...sharedPlan.project.pieces[0], cutStock: null }, existing);
  assert.equal(inspectCutStock(sharedPlan.project).valid.size, 3);
});

test("a revision releases its untouched planned stock and retains purchased blanks and confirmed cuts", () => {
  const { project, existing } = shop();
  const draft = previewIdeaPlan(project, localIdeaPlan({ prompt })).project;
  const stock = previewProposalStock(project, draft, null);
  const exclusive = stock.recordable.filter(({ existingPartIds }) => !existingPartIds.length);
  const planned = planStockCutLayouts(stock.project, exclusive.map(({ layout }) => layout));
  const [purchased, cut, pending] = planned.sourceIds;
  assert.ok(pending);
  assert.equal(bindingReview(planned.project, planned.project.ideaBindings[0].id).manualEdits, 0);
  const originalPurchase = setCutSourceOnHand(planned.project, purchased, true);
  const completed = completePlannedCutSource(originalPurchase, cut);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(completed)));
  assert.ok(!reopened.plannedCutSources?.some(({ sourceId }) => sourceId === cut));
  assert.ok(reopened.onHandCutSources?.includes(cut));

  const id = reopened.ideaBindings[0].id;
  const next = localIdeaPlan({ previousPlan: bindingPlan(reopened, id), prompt: "Make the workbench 42 inches wide" });
  const revision = previewIdeaRevision(reopened, id, next, bindingToken(reopened, id));
  assert.equal(revision.impact.releasedStockUnits, planned.sourceIds.length - 1);
  assert.equal(revision.project.plannedCutSources, undefined);
  assert.deepEqual(revision.project.pieces.find(({ id }) => id === existing.id), existing);
  assert.ok(reopened.pieces.some(({ cutStock }) => cutStock?.id === pending));
  assert.ok(!revision.project.pieces.some(({ cutStock }) => cutStock?.id === pending));
  const { groups, valid } = inspectCutStock(revision.project);
  assert.ok(valid.has(purchased) && valid.has(cut));
  assert.equal(groups.get(purchased)?.length, 1);
  const full = groups.get(purchased)![0];
  assert.equal(full.offcut, true);
  assert.deepEqual(full.size, full.cutStock?.size);
  const reuse = previewProposalStock(reopened, revision.project,
    [revision.project.partLabels.find(({ partId }) => partId === full.id)!.label]);
  assert.ok(reuse.plan?.assignments.length);
  assert.ok(reuse.project.pieces.some(({ cutStock, offcut }) => cutStock?.id === purchased && !offcut));
  assert.ok(groups.get(cut)?.every(({ offcut }) => offcut));
  const removedHistory = new Set(reopened.plannedCutSources?.flatMap(({ historyIds }) => historyIds));
  assert.ok(!revision.project.history.some(({ id }) => removedHistory.has(id)));
  assert.match(guideMarkdown(revision.project), /Released uncut stock plan/);
});

test("a planned unit stays reserved when a scrap is assigned until that assignment is released", () => {
  const { project, existing } = shop();
  const draft = previewIdeaPlan(project, localIdeaPlan({ prompt })).project;
  const stock = previewProposalStock(project, draft, null);
  const exclusive = stock.recordable.find(({ existingPartIds, layout }) =>
    !existingPartIds.length && layout.materialId === "stud" && layout.leftovers.some(({ length }) => length > 11));
  assert.ok(exclusive);
  const planned = planStockCutLayouts(stock.project, [exclusive.layout]);
  const [sourceId] = planned.sourceIds;
  const [match] = fittingOffcuts(planned.project, existing, undefined,
    new Set(planned.project.pieces.filter(({ offcut, cutStock }) => offcut && cutStock?.id === sourceId).map(({ id }) => id)));
  assert.ok(match);
  const used = assignOffcutToPart(planned.project, existing.id, match.piece.id);
  assert.throws(() => releasePlannedCutSources(used, [sourceId]), /dependent offcut assignments/);
  const guide = guideMarkdown(used);
  assert.match(guide, /## Planned stock cuts[\s\S]+1\. Crosscut/);
  assert.match(guide, /Complete the source stock cut order before using this blank\. Find P\d+ under Planned stock cuts\./);
  assert.ok(guide.indexOf("## Planned stock cuts") < guide.indexOf("## Recorded offcut cut order"));
  assert.doesNotMatch(guide, /Operation: Stock cut order for/);
  const plan = used.plannedCutSources!.find((entry) => entry.sourceId === sourceId)!;
  const missing = used.history.find(({ id, message }) =>
    plan.historyIds.includes(id) && message.startsWith("Stock cut order for "))!;
  const incomplete = guideMarkdown({ ...used, history: used.history.filter(({ id }) => id !== missing.id) });
  assert.match(incomplete, /The saved cut order is incomplete\. Review the layout before cutting\./);
  const completedGuide = guideMarkdown(completePlannedCutSource(used, sourceId));
  assert.doesNotMatch(completedGuide, /## Planned stock cuts/);
  assert.doesNotMatch(completedGuide, /Complete the source stock cut order before using this blank/);
  const receipt = used.history.at(-1)!;
  const returned = planOffcutRelease(used, receipt.id);
  const released = releasePlannedCutSources(returned.project, [sourceId]);
  assert.equal(released.project.plannedCutSources, undefined);
  assert.ok(!released.project.pieces.some(({ cutStock }) => cutStock?.id === sourceId));
  assert.deepEqual(released.project.pieces.find(({ id }) => id === existing.id), existing);
});


test("a revision keeps stock shared with a part outside the design", () => {
  const { project, existing } = shop();
  const draft = previewIdeaPlan(project, localIdeaPlan({ prompt })).project;
  const stock = previewProposalStock(project, draft, null);
  const shared = stock.recordable.find(({ existingPartIds }) => existingPartIds.includes(existing.id))!;
  const pending = planStockCutLayouts(stock.project, [shared.layout]);
  const [sourceId] = pending.sourceIds;
  const before = pending.project.pieces.find(({ id }) => id === existing.id);
  assert.equal(before?.cutStock?.id, sourceId);
  const id = pending.project.ideaBindings[0].id;
  const next = localIdeaPlan({ previousPlan: bindingPlan(pending.project, id), prompt: "Make the workbench 42 inches wide" });
  const review = previewIdeaRevision(pending.project, id, next, bindingToken(pending.project, id));
  assert.equal(review.impact.releasedStockUnits, 0);
  assert.deepEqual(review.project.plannedCutSources, pending.project.plannedCutSources);
  assert.deepEqual(review.project.pieces.find(({ id }) => id === existing.id), before);
  assert.throws(() => acceptIdeaRevisionPreview(review), /explicitly allow the rebuild/);
});
