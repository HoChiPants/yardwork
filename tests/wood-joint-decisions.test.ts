import assert from "node:assert/strict";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { test } from "node:test";
import { answerConnectionQuestion, connectionQuestion } from "../src/connectionQuestions";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { modeledTrimSeamEdges } from "../src/trimSeamGeometry";
import { trimSealant } from "../src/trimSealantReference";
import { bearingConnections } from "../src/bearingConnections";
import { connectionCoverage } from "../src/connectionCoverage";
import { guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { blank, part, projectSchema, type Project, type V3 } from "../src/model";
import { reviewModeledWoodContacts } from "../src/modeledWoodContacts";
import { composeRotation, rotate } from "../src/spatial";
import { clearWoodJointDecision, saveTrimSeam, saveWoodJointDecision, trimSeamPurchaseSummary, woodJointDecisionEntries } from "../src/woodJointDecisions";
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
  assert.deepEqual(summary, { required: 1, selected: 0, length: "8 in", ready: 2, review: 0 });
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
