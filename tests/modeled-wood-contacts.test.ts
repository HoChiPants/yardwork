import assert from "node:assert/strict";
import { test } from "node:test";
import { bearingConnections } from "../src/bearingConnections";
import { saveBearingDecision } from "../src/bearingDecisions";
import { connectionCoverage } from "../src/connectionCoverage";
import { guideMarkdown } from "../src/engine";
import { saveFastenerPlan, suggestCenteredFastener } from "../src/fastenings";
import { reviewModeledWoodContacts } from "../src/modeledWoodContacts";
import { blank, part, type Project } from "../src/model";
import { reviewWoodSupport } from "../src/woodSupport";

function review(project: Project) {
  const coverage = connectionCoverage(project);
  return reviewModeledWoodContacts(project, coverage,
    bearingConnections(project, reviewWoodSupport(project), coverage));
}

test("a reviewed screw on one contact leaves the other exact pair in the checklist", () => {
  const project = blank();
  const step = project.steps[0].id;
  const panel = part("Face panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const left = part("Left rail", "stud", [1.5, 4, 2], [-3, 4, -1.3515], step, "Casework");
  const right = part("Right rail", "stud", [1.5, 4, 2], [3, 4, -1.3515], step, "Casework");
  project.pieces.push(panel, left, right);
  const { plan } = suggestCenteredFastener(project, panel.id, left.id);
  const pending = saveFastenerPlan(project, plan);
  assert.deepEqual(review(pending).pairs.map((row) => row.state), ["pending", "unplanned"]);
  const measured = saveFastenerPlan(project, {
    ...plan,
    measurements: {
      ...plan.measurements,
      surfaceToTipDepth: 1.25,
      basis: "Synthetic modeled entry fixture",
      measuredAt: "2026-01-01T00:00:00.000Z",
    },
  });
  const before = structuredClone(measured);
  const contacts = review(measured);
  assert.deepEqual(contacts.pairs.map((row) => row.state), ["unplanned", "reviewed"]);
  assert.deepEqual(contacts.needsReview[0].memberIds, [panel.id, right.id]);
  const guide = guideMarkdown(measured);
  const section = guide.split("### Modeled wood contacts")[1].split("### Shopping and availability")[0];
  assert.match(section, /P001 · Face panel ↔ P003 · Right rail/);
  assert.doesNotMatch(section, /Left rail/);
  assert.deepEqual(measured, before);
});

test("a removable bearing decision drops from the review queue until the contact shifts", () => {
  const project = blank();
  const step = project.steps[0].id;
  const base = part("Base", "stud", [1.5, 2, 3], [0, 1, 0], step, "Frame");
  const top = part("Resting member", "stud", [1.5, 2, 3], [0, 3, 0], step, "Frame");
  project.pieces.push(base, top);
  const noted = saveBearingDecision(project, top.id, base.id, "Lift off for access");
  assert.equal(review(noted).pairs[0].state, "removable");
  assert.deepEqual(review(noted).needsReview, []);
  const shifted: Project = {
    ...noted,
    pieces: [base, { ...top, position: [0.25, 3, 0] }],
  };
  assert.equal(review(shifted).needsReview[0].state, "pending");
  const movedAway: Project = { ...shifted, pieces: [base, { ...top, position: [0.25, 3.0625, 0] }] };
  assert.deepEqual(review(movedAway).pairs, []);
});
