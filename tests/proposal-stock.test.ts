import assert from "node:assert/strict";
import test from "node:test";
import { inspectCutStock } from "../src/cutStock";
import { bom, guideMarkdown } from "../src/engine";
import { acceptIdeaRevisionPreview, bindingPlan, bindingToken, previewIdeaRevision } from "../src/ideaBindings";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part, projectSchema } from "../src/model";
import { assignOffcutToPart, fittingOffcuts } from "../src/offcutAssignment";
import { localIdeaPlan, previewIdeaPlan } from "../src/planning";
import { previewProposalStock, proposalStockRequest } from "../src/proposalStock";
import { recordStockCutLayouts } from "../src/recordStockCutLayout";

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
