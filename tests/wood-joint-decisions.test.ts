import { readFileSync } from "node:fs";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { saveOpeningFlashing } from "../src/openingFlashing";
import { generatedWindowMembers } from "../src/windowWall";
import assert from "node:assert/strict";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { test } from "node:test";
import { answerConnectionQuestion, connectionQuestion } from "../src/connectionQuestions";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { estimateModeledTrimSeam, modeledTrimSeamEdges, trimSeamCovers, trimSeamMarker } from "../src/trimSeamGeometry";
import { trimSealant } from "../src/trimSealantReference";
import { backerRodAllocationKey, removeBackerRodOffcut, saveBackerRodOffcut } from "../src/trimBackerRodOffcuts";
import { bearingConnections } from "../src/bearingConnections";
import { connectionCoverage } from "../src/connectionCoverage";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { applyCommand, parsePrompt, blank, part, projectSchema, uid, type Project, type V3 } from "../src/model";
import { reviewModeledWoodContacts } from "../src/modeledWoodContacts";
import { composeRotation, rotate } from "../src/spatial";
import { clearWoodJointDecision, recordBackerRodCuts, saveTrimSeam, saveWoodJointDecision, trimBackerRodCutPlan, trimSeamPurchaseSummary, woodJointDecisionEntries } from "../src/woodJointDecisions";
import { reviewWoodSupport } from "../src/woodSupport";

function aJoint(gap = 0) {
  const project = blank();
  const step = project.steps[0].id;
  const panel = part("Panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const rail = part("Rail", "stud", [1.5, 4, 2], [0.5, 4, -1.3515 - gap], step, "Casework");
  project.pieces.push(panel, rail);
  return { project, panel, rail };
}

function contacts(project: Project) {
  const coverage = connectionCoverage(project);
  return reviewModeledWoodContacts(project, coverage, bearingConnections(project, reviewWoodSupport(project), coverage));
}

test("a named method is saved once for the actual pair and appears in the guide", () => {
  const { project, panel, rail } = aJoint();
  const legacy = projectSchema.parse({ ...project, schemaVersion: 81 });
  assert.equal(legacy.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.equal(legacy.woodJointDecisions, undefined);
  const guided = generateBuildGuide(legacy);
  assert.ok(guideIsCurrent(guided));
  const saved = saveWoodJointDecision(guided, panel.id, rail.id, "glue", "  Dry-fit the rail.  ");
  const edited = saveWoodJointDecision(saved, rail.id, panel.id, "glue", "Dry-fit with the selected clamps.");
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(edited)));
  assert.equal(reopened.woodJointDecisions?.length, 1);
  assert.equal(reopened.woodJointDecisions[0].note, "Dry-fit with the selected clamps.");
  assert.deepEqual(reopened.pieces, guided.pieces);
  assert.deepEqual(reopened.supplies, guided.supplies);
  assert.equal(guideIsCurrent(reopened), false);
  assert.equal(contacts(reopened).pairs[0].state, "documented");
  assert.equal(contacts(reopened).needsReview.length, 0);
  const guide = guideMarkdown(generateBuildGuide(reopened));
  assert.match(guide, /## Recorded wood joint details[\s\S]+Glue joint · Step \d+ · Dry-fit with the selected clamps\./);
  assert.equal(clearWoodJointDecision(reopened, rail.id, panel.id).woodJointDecisions, undefined);
  assert.throws(() => saveWoodJointDecision(reopened, panel.id, rail.id, "glue", " "), /Record the detail/);
});

test("the detail follows a shared rigid move and reopens after separation or removal", () => {
  const { project, panel, rail } = aJoint();
  const sealed = saveWoodJointDecision(project, rail.id, panel.id, "intentional-contact", "Keep the panel removable.");
  const turn: V3 = [0.31, 0.38, 0.17];
  const moved: Project = {
    ...sealed,
    pieces: sealed.pieces.map((piece) => ({
      ...piece, rotation: composeRotation(turn, piece.rotation),
      position: rotate(piece.position, turn).map((n) => n + 20) as V3,
    })),
  };
  assert.equal(woodJointDecisionEntries(moved)[0].status, "current");
  const separated: Project = { ...sealed, pieces: [panel, { ...rail, position: [0.5, 4, -2] }] };
  assert.equal(contacts(separated).touchingCount, 0);
  assert.equal(contacts(separated).needsReview[0].detail?.status, "changed");
  assert.match(guideMarkdown(separated), /Fit changed · review again · Keep the panel removable\./);
  const missing = { ...sealed, pieces: [] };
  assert.equal(contacts(missing).needsReview[0].detail?.status, "unavailable");
  assert.match(guideMarkdown(missing), /Member unavailable · review again/);
});

test("a nearby seam can carry sealant notes while glue still needs touching faces", () => {
  const { project, panel, rail } = aJoint(0.0625);
  assert.throws(() => saveWoodJointDecision(project, panel.id, rail.id, "glue", "Dry-fit first."), /touching faces/);
  const sealed = saveWoodJointDecision(project, panel.id, rail.id, "sealant", "Plan the exposed seam only.");
  assert.equal(woodJointDecisionEntries(sealed)[0].status, "current");
  assert.equal(contacts(sealed).pairs.length, 0);
  assert.match(guideMarkdown(sealed), /Seal exposed seam · Step 1 · Plan the exposed seam only\./);
});

test("chosen dry-trim edges survive a rigid move and feed the joint answer, guide and exact cartridge count", () => {
  const { project, panel, rail } = aJoint(1 / 16);
  const other = part("Second rail", "stud", [1.5, 4, 2], [-2.5, 4, -1.414], project.steps[0].id, "Casework");
  project.pieces.push(other);
  let saved = project;
  for (const member of [rail, other]) {
    saved = saveWoodJointDecision(saved, panel.id, member.id, "sealant", "Treat the chosen exposed edge.");
    const [first, second] = [panel, member].sort((a, b) => a.id.localeCompare(b.id));
    const shape = modeledTrimSeamEdges(first, second)!;
    assert.deepEqual(shape.edges.map(({ length }) => length).sort(), [1.5, 1.5, 4, 4]);
    const edgeIds = [shape.edges.find(({ length }) => length === 4)!.id];
    assert.throws(() => saveTrimSeam(saved, panel.id, member.id, { edgeIds, gapWidth: 0.03, gapDepth: 0.1 }), /smaller than the modeled gap/);
    assert.throws(() => saveTrimSeam(saved, panel.id, member.id, { edgeIds, gapWidth: 0.22, gapDepth: 0.1 }), /coverage from a trial/);
    saved = saveTrimSeam(saved, panel.id, member.id, { edgeIds, gapWidth: 0.125, gapDepth: 0.125 });
  }

  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reopened.woodJointDecisions, saved.woodJointDecisions);
  const turn: V3 = [0.31, 0.38, 0.17];
  const moved: Project = {
    ...reopened,
    pieces: reopened.pieces.map((piece) => ({
      ...piece, rotation: composeRotation(turn, piece.rotation),
      position: rotate(piece.position, turn).map((n) => n + 20) as V3,
    })),
  };
  const summary = trimSeamPurchaseSummary(moved)!;
  const { batches, ...quantities } = summary;
  assert.deepEqual(quantities, { required: 1, selected: 0, length: "8 in", ready: 2, review: 0 });
  assert.deepEqual(batches.map(({ name, cartridges, lengthInches }) => [name, cartridges, lengthInches]), [
    ["Trim work", 1, 8],
  ]);
  assert.match(guideMarkdown(moved), /Trim sealant · Edge \d \(4 in\).*DAP coverage of 55 ft/s);
  const question = connectionQuestion(moved, "Review trim seam between P001 and P002")!;
  const answer = answerConnectionQuestion(moved, question);
  assert.ok("pairs" in answer);
  assert.match(answer.pairs[0].trimSeam ?? "", /Trim sealant · Edge/);
  const need = homeDepotPurchaseNeeds(moved).find(({ id }) => id === trimSealant.id);
  assert.equal(need?.canAdd, true);
  assert.equal(need?.missing, 1);
  const bought = addHomeDepotPurchaseNeed(moved, trimSealant.id);
  assert.equal(bought.supplies[0].quantity, 1);
  assert.equal(addHomeDepotPurchaseNeed(bought, trimSealant.id), bought);

  const changed = { ...saved, pieces: [panel, { ...rail, size: [1.5, 3.5, 2] as V3 }, other] };
  assert.equal(trimSeamPurchaseSummary(changed)?.ready, 1);
  assert.equal(trimSeamPurchaseSummary(changed)?.review, 1);
  const reconfirmedNote = saveWoodJointDecision(changed, panel.id, rail.id, "sealant", "Fit checked again.");
  assert.match(guideMarkdown(reconfirmedNote), /Seam fit changed or a member is unavailable/);
  assert.equal(trimSeamPurchaseSummary(reconfirmedNote)?.review, 1);
  const removed = saveTrimSeam(reconfirmedNote, panel.id, rail.id, null);
  assert.equal(trimSeamPurchaseSummary(removed)?.review, 0);
});

test("trim interruptions and fitted backing follow the same edge datum through guide, roll cuts and revisions", () => {
  const { project, panel, rail } = aJoint(5 / 16);
  const note = saveWoodJointDecision(project, panel.id, rail.id, "sealant", "Keep the mounting access clear.");
  const detail = note.woodJointDecisions![0];
  const byId = (id: string) => project.pieces.find((piece) => piece.id === id)!;
  const shape = modeledTrimSeamEdges(byId(detail.firstId), byId(detail.secondId))!;
  const edge = shape.edges.find(({ length }) => length === 4)!;
  const input = {
    edgeIds: [edge.id], gapWidth: 5 / 16, gapDepth: 1 / 4, fieldCoverageFeet: 20,
    openSpans: [{ edgeId: edge.id, start: 1, end: 2 }], backerRodId: "frost-king-c21h" as const,
  };
  const old = projectSchema.parse({ ...note, schemaVersion: 96 });
  assert.equal(old.woodJointDecisions?.[0].trimSeam, undefined);
  const saved = saveTrimSeam(old, panel.id, rail.id, input);
  const readback = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(readback.pieces, project.pieces);
  assert.deepEqual(readback.woodJointDecisions?.[0].trimSeam?.openSpans, input.openSpans);
  const review = woodJointDecisionEntries(readback)[0].trimSeam?.estimate;
  assert.equal(review?.lengthInches, 3);
  assert.deepEqual(review?.edges[0].sealedSpans.map(({ length }) => length), [1, 2]);
  assert.equal(trimSeamMarker(edge, "Preview", input.openSpans).segments.filter(({ open }) => open).length, 1);
  const turn: V3 = [0.31, 0.38, 0.17];
  const moved = {
    ...readback,
    pieces: readback.pieces.map((piece) => ({
      ...piece, rotation: composeRotation(turn, piece.rotation),
      position: rotate(piece.position, turn).map((value) => value + 5) as V3,
    })),
  };
  const movedEdge = woodJointDecisionEntries(moved)[0].trimSeam?.estimate?.edges[0];
  assert.deepEqual(movedEdge?.localStart, edge.localStart);
  assert.deepEqual(movedEdge?.sealedSpans, review?.edges[0].sealedSpans);
  const guide = guideMarkdown(moved);
  assert.match(guide, /keep open 1 in to 2 in/);
  assert.match(guide, /Trim backer rod cut plan[\s\S]+Roll 1 · Cut 2 in[\s\S]+Keep 237 in/);
  assert.equal(trimBackerRodCutPlan(moved)[0].rolls[0].left, 237);
  const answer = answerConnectionQuestion(moved, connectionQuestion(moved, "How should I seal the gap between P001 and P002?")!);
  assert.ok("pairs" in answer);
  assert.equal(answer.pairs[0].contact.gap?.toFixed(4), "0.3125");
  assert.match(answer.pairs[0].trimSeam ?? "", /keep open 1 in to 2 in.*C21H/);
  assert.equal(homeDepotPurchaseNeeds(moved).find(({ id }) => id === "frost-king-c21h")?.missing, 1);
  assert.equal(addHomeDepotPurchaseNeed(moved, "frost-king-c21h").supplies[0].quantity, 1);

  const edited = { ...readback, pieces: [panel, { ...rail, position: [0.5, 4, -1.7] as V3 }] };
  assert.equal(trimBackerRodCutPlan(edited).length, 0);
  assert.equal(trimSeamPurchaseSummary(edited)?.review, 1);
  assert.doesNotMatch(guideMarkdown(edited), /Trim backer rod cut plan/);
});

test("a cover across a trim seam changes the estimate and the guide as installation order changes", () => {
  const { project, panel, rail } = aJoint(5 / 16);
  const detail = saveWoodJointDecision(project, panel.id, rail.id, "sealant", "Seal before fitting the face trim.");
  const byId = (id: string) => project.pieces.find((piece) => piece.id === id)!;
  const { firstId, secondId } = detail.woodJointDecisions![0];
  const first = byId(firstId), second = byId(secondId);
  const edge = modeledTrimSeamEdges(first, second)!.edges.find(({ length }) => length === 4)!;
  const [a, b] = edge.points;
  const position = a.map((n, i) => n + 1.5 / edge.length * (b[i] - n)) as V3;
  const later = { id: uid(), title: "Fit the face trim", notes: "", complete: false };
  const cover = part("Face trim cover", "plywood", [0.5, 1, 0.125], position, project.steps[0].id, "Trim");
  const input = {
    edgeIds: [edge.id], gapWidth: 5 / 16, gapDepth: 1 / 4,
    fieldCoverageFeet: 20, backerRodId: "frost-king-c21h" as const,
  };
  const clear = saveTrimSeam(detail, firstId, secondId, input);
  const blocked = projectSchema.parse({ ...clear, pieces: [...clear.pieces, cover], steps: [...clear.steps, later] });
  const covers = trimSeamCovers(blocked, first, second, [edge]);
  assert.deepEqual(covers.map(({ start, end, later }) => [Math.round(start), Math.round(end), later]), [[1, 2, false]]);
  assert.equal(trimSeamMarker(edge, "Preview", [], covers).segments.at(-1)?.cover, "blocked");
  assert.throws(() => saveTrimSeam(blocked, firstId, secondId, input), /Face trim cover covers the seam 1 in to 2 in/);
  assert.equal(trimSeamPurchaseSummary(blocked)?.review, 1);
  assert.equal(trimBackerRodCutPlan(blocked).length, 0);

  const access = saveTrimSeam(blocked, firstId, secondId, { ...input, openSpans: [{ edgeId: edge.id, start: 1, end: 2 }] });
  assert.equal(woodJointDecisionEntries(access)[0].trimSeam?.estimate?.lengthInches, 3);
  const scheduled = { ...blocked, pieces: [...clear.pieces, { ...cover, stepId: later.id }] };
  const ready = saveTrimSeam(scheduled, firstId, secondId, input);
  assert.equal(trimSeamPurchaseSummary(ready)?.length, "4 in");
  assert.match(guideMarkdown(ready), /Seal 1 in to 2 in from Start before Step 2 installs Face trim cover/);

  const slotted = { ...cover, rectangularOpenings: [{ axis: 2 as const, center: [0, 0] as [number, number], spans: [0.25, 0.5] as [number, number] }] };
  const slotProject = projectSchema.parse({ ...blocked, pieces: [...clear.pieces, slotted] });
  const aroundSlot = trimSeamCovers(slotProject, first, second, [edge]);
  assert.deepEqual(aroundSlot.map(({ start, end }) => [start, end].map((n) => Number(n.toFixed(3)))), [[1, 1.25], [1.75, 2]]);
});

test("trim takeoff rejects invalid ranges and backing mismatches while fitting separate cuts onto a roll", () => {
  const { project, panel, rail } = aJoint(5 / 16);
  const shape = modeledTrimSeamEdges(panel, rail)!;
  const edge = shape.edges.find(({ length }) => length === 4)!;
  const input = {
    edgeIds: [edge.id], gapWidth: 5 / 16, gapDepth: 1 / 4, fieldCoverageFeet: 20,
    backerRodId: "frost-king-c21h" as const,
  };
  const open = (start: number, end: number, edgeId = edge.id) => ({ edgeId, start, end });
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, gapWidth: 3 / 8 }), /slightly wider/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, gapDepth: 0.2 }), /above the fitted rod/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, fieldCoverageFeet: undefined }), /coverage from a trial/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, openSpans: [open(1, 2), open(1.5, 3)] }), /no overlap/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, openSpans: [open(2, 5)] }), /inside the edge/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, openSpans: [open(0, 4)] }), /at least one section/);
  assert.throws(() => estimateModeledTrimSeam(shape, { ...input, openSpans: [open(1, 2, "other")] }), /selected edges only/);

  const longPanel = { ...panel, size: [10, 280, 0.703] as V3, position: [0, 140, 0] as V3 };
  const longRail = { ...rail, size: [1.5, 260, 2] as V3, position: [0.5, 131, rail.position[2]] as V3 };
  const long = { ...project, pieces: [longPanel, longRail] };
  const noted = saveWoodJointDecision(long, panel.id, rail.id, "sealant", "Leave the middle access section clear.");
  const { firstId } = noted.woodJointDecisions![0];
  const longShape = firstId === panel.id ? modeledTrimSeamEdges(longPanel, longRail)! : modeledTrimSeamEdges(longRail, longPanel)!;
  const longEdge = longShape.edges.find(({ length }) => length === 260)!;
  assert.throws(() => saveTrimSeam(noted, panel.id, rail.id, { ...input, edgeIds: [longEdge.id] }), /exceeds the 20 ft roll/);
  const backed = saveTrimSeam(noted, panel.id, rail.id, {
    ...input, edgeIds: [longEdge.id], openSpans: [open(100, 125, longEdge.id)], backerRodId: "frost-king-c22h",
  });
  const [{ product, rolls }] = trimBackerRodCutPlan(backed);
  assert.equal(product.internetNumber, "100159362");
  assert.deepEqual(rolls.map(({ left, runs }) => [left, ...runs.map(({ length }) => length)]), [[5, 135, 100]]);
});

test("measured trim and opening backing share the same exact rod roll and purchase", () => {
  const { project, panel, rail } = aJoint(5 / 16);
  const seam = saveWoodJointDecision(project, panel.id, rail.id, "sealant", "Back the trim seam.");
  const detail = seam.woodJointDecisions![0];
  const piece = (id: string) => project.pieces.find((item) => item.id === id)!;
  const edge = modeledTrimSeamEdges(piece(detail.firstId), piece(detail.secondId))!.edges.find(({ length }) => length === 4)!;
  const trimmed = saveTrimSeam(seam, panel.id, rail.id, {
    edgeIds: [edge.id], gapWidth: 5 / 16, gapDepth: 1 / 4, fieldCoverageFeet: 20, backerRodId: "frost-king-c21h",
  });
  const framed = applyCommand(trimmed, parsePrompt("Build a wall 8 ft wide and 8 ft tall with a 36 by 48 in rough window opening, sill 32 in above floor"));
  const saved = saveOpeningFlashing(framed, generatedWindowMembers(framed, framed.sections[0])!, {
    unit: "window", exterior: "positive", sheathing: 0.5, frameDepth: 2.75, tapeWidth: 6, faceLap: 2, jambReturn: 6,
    pan: { kind: "slope" }, drainage: { kind: "open" },
    airSeal: { method: "silicone", left: 0.25, right: 0.25, sill: 0.25, head: 0.25, availableDepth: 1, sealDepth: 0.25 },
  });
  const plan = trimBackerRodCutPlan(saved);
  assert.equal(plan[0].rolls.length, 1);
  assert.equal(plan[0].rolls[0].runs.length, 5);
  assert.equal(plan[0].rolls[0].left, 69);
  const need = homeDepotPurchaseNeeds(saved).find(({ id }) => id === "frost-king-c21h");
  assert.equal(need?.missing, 1);
  assert.ok(need?.canAdd);

  const reused = saveBackerRodOffcut(saved, {
    label: "Window and trim tail", productId: "frost-king-c21h", length: 180,
  });
  const [shared] = trimBackerRodCutPlan(reused);
  assert.deepEqual(shared.rolls, []);
  assert.equal(shared.offcuts[0].runs.length, 5);
  assert.equal(shared.offcuts[0].left, 9);
  assert.equal(homeDepotPurchaseNeeds(reused).some(({ id }) => id === "frost-king-c21h"), false);
  assert.match(guideMarkdown(reused), /Offcut Window and trim tail[\s\S]+Keep 9 in/);
  const picked = shared.offcuts[0];
  const recorded = projectSchema.parse(recordBackerRodCuts(reused, picked.source.id,
    backerRodAllocationKey(picked.source, picked.runs), { length: 8.5, label: "Window backing remainder" }));
  const [after] = trimBackerRodCutPlan(recorded);
  assert.equal(after.hasAirSeal, true);
  assert.equal(after.completed[0].changed, 0);
  assert.equal(after.completed[0].record.cuts.filter(({ kind }) => kind === "opening").length, 4);
  assert.equal(after.offcuts.length + after.rolls.length, 0);
  assert.equal(recorded.backerRodOffcuts?.[0].length, 8.5);
});

test("trim sessions reserve separate cartridges while sharing matching work, cuts and trial scraps", () => {
  const sample = (name: string) => readFileSync(new URL(`../public/examples/air-sealing/trim-work-sessions${name}`, import.meta.url), "utf8");
  const project = projectSchema.parse(JSON.parse(sample(".yardwork.json")));
  const purchased = project.supplies.find(({ productId }) => productId === trimSealant.id);
  assert.equal(purchased?.quantity, 2);
  const summary = trimSeamPurchaseSummary(project)!;
  assert.deepEqual(summary.batches.map(({ name, lengthInches, cartridges }) => [name, lengthInches, cartridges]), [
    ["Cabinet trim", 58, 1],
    ["Closet trim", 30, 1],
  ]);
  assert.equal(summary.required, 2);
  assert.equal(summary.selected, 2);
  assert.equal(guideMarkdown(project), sample("-guide.md"));
  assert.match(sample("-guide.md"), /Test the finish on offcuts O00[12], O00[12] from the same stock/);
  assert.match(sample("-guide.md"), /Keep 210 in for a future matching run/);

  const question = buildQuestion("How much sealant do I need for my wood trim?")!;
  assert.deepEqual(question, { kind: "trim-sealant" });
  const answer = answerBuildQuestion(project, question, []);
  assert.match(answer.detail, /2 cartridges for 88 in of reviewed trim seams/);
  assert.deepEqual(answer.rows?.map(({ title }) => title), ["Cabinet trim", "Closet trim"]);
  const closed = project.woodJointDecisions!.find(({ trimSeam }) => trimSeam?.session === "Closet trim")!;
  const { contactSignature: _seal, ...input } = closed.trimSeam!;
  const shared = saveTrimSeam(project, closed.firstId, closed.secondId, { ...input, session: "  CABINET TRIM  " });
  assert.equal(trimSeamPurchaseSummary(shared)?.required, 1);
  assert.equal(shared.woodJointDecisions!.find(({ firstId, secondId }) =>
    firstId === closed.firstId && secondId === closed.secondId)?.trimSeam?.session, "CABINET TRIM");
  const noPurchase = { ...project, supplies: project.supplies.filter((supply) => supply !== purchased) };
  assert.equal(homeDepotPurchaseNeeds(noPurchase).find(({ id }) => id === trimSealant.id)?.missing, 2);
  assert.equal(addHomeDepotPurchaseNeed(noPurchase, trimSealant.id).supplies.at(-1)?.quantity, 2);
  const changed = { ...noPurchase, pieces: noPurchase.pieces.map((p) =>
    p.id === closed.secondId ? { ...p, position: [p.position[0], p.position[1], p.position[2] + 2] as V3 } : p) };
  assert.equal(trimSeamPurchaseSummary(changed)?.required, 1);
  assert.equal(trimSeamPurchaseSummary(changed)?.review, 1);
  assert.equal(homeDepotPurchaseNeeds(changed).find(({ id }) => id === trimSealant.id)?.missing, 1);
  assert.match(answerBuildQuestion(changed, question, []).detail, /1 seam needs a fresh fit review/);
});

test("matching backer rod tails supply whole runs after save and reopen", () => {
  const sample = (name: string) => readFileSync(new URL(`../public/examples/air-sealing/trim-rod-offcuts${name}`, import.meta.url), "utf8");
  const saved = projectSchema.parse(JSON.parse(sample(".yardwork.json")));
  const [plan] = trimBackerRodCutPlan(saved);
  assert.deepEqual(plan.rolls, []);
  assert.deepEqual(plan.offcuts.map(({ source, runs, left }) => [source.label, runs.map(({ length }) => length), left]), [
    ["Short closet tail", [6], 8], ["Long closet tail", [24], 4],
  ]);
  assert.ok(saved.backerRodOffcuts?.some(({ productId }) => productId === "frost-king-c22h"));
  assert.equal(homeDepotPurchaseNeeds(saved).some(({ id }) => id === "frost-king-c21h"), false);
  assert.equal(guideMarkdown(saved), sample("-guide.md"));

  const [short, long] = saved.backerRodOffcuts!;
  const trimmed = saveBackerRodOffcut(saved, { label: long.label, productId: long.productId, length: 22 }, long.id);
  assert.equal(trimBackerRodCutPlan(trimmed)[0].rolls[0].runs[0].length, 24);
  const removed = removeBackerRodOffcut(trimmed, short.id);
  assert.equal(removed.backerRodOffcuts?.length, 2);
  assert.throws(() => saveBackerRodOffcut(saved, {
    label: short.label.toUpperCase(), productId: "frost-king-c21h", length: 10,
  }), /own label/);
  const answer = answerBuildQuestion(saved, buildQuestion("Can I reuse my backer rod offcuts?")!, []);
  assert.match(answer.detail, /2 matching offcuts.+0 new rolls/);
  assert.deepEqual(answer.rows?.map(({ title }) => title), ["Short closet tail", "Long closet tail"]);
});

test("recorded backer rod use frees only the measured remainder and holds changed runs for a new cut", () => {
  const practice = (stem: string, extension: string) =>
    readFileSync(new URL(`../public/examples/air-sealing/${stem}${extension}`, import.meta.url), "utf8");
  const base = projectSchema.parse(JSON.parse(practice("trim-rod-offcuts", ".yardwork.json")));
  const allocation = trimBackerRodCutPlan(base)[0].offcuts.find(({ source }) => source.label === "Long closet tail")!;
  const key = backerRodAllocationKey(allocation.source, allocation.runs);
  const record = () => recordBackerRodCuts(base, allocation.source.id, key, { length: 3.75, label: "Measured closet remainder" });
  assert.throws(() => recordBackerRodCuts(base, allocation.source.id, "stale"), /planned cuts changed/);
  assert.throws(() => recordBackerRodCuts(base, allocation.source.id, key, { length: 4.01, label: "Too long" }), /within the unused length/);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(record())));
  assert.ok(!saved.backerRodOffcuts?.some(({ id }) => id === allocation.source.id));
  assert.throws(() => projectSchema.parse({ ...saved, backerRodOffcuts: base.backerRodOffcuts }), /cannot also be available stock/);
  assert.throws(() => recordBackerRodCuts(saved, allocation.source.id, key), /planned cuts changed/);
  assert.equal(saved.backerRodCutRecords?.[0].remnant?.length, 3.75);

  const worked = projectSchema.parse(JSON.parse(practice("trim-rod-recorded", ".yardwork.json")));
  const [plan] = trimBackerRodCutPlan(worked);
  assert.equal(plan.completed[0].changed, 0);
  assert.equal(plan.completed[0].record.cuts[0].length, 24);
  assert.deepEqual(plan.offcuts.map(({ source, runs, left }) => [source.label, runs[0].length, left]), [["Measured closet remainder", 3, 0.75]]);
  assert.equal(guideMarkdown(worked), practice("trim-rod-recorded", "-guide.md"));

  const detail = worked.woodJointDecisions!.find(({ trimSeam }) => trimSeam?.session === "Closet trim")!;
  const { contactSignature: _contact, ...seam } = detail.trimSeam!;
  const changed = saveTrimSeam(worked, detail.firstId, detail.secondId,
    { ...seam, openSpans: [{ ...seam.openSpans![0], end: 9 }] });
  const [revised] = trimBackerRodCutPlan(changed);
  assert.equal(revised.completed[0].changed, 1);
  assert.equal(revised.rolls[0].runs[0].length, 23);
  assert.match(guideMarkdown(changed), /1 run has changed or been removed since this cut was recorded/);
});
