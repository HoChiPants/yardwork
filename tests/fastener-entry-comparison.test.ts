import assert from "node:assert/strict";
import { test } from "node:test";
import { compareFastenerEntries, trialFastenerDepth } from "../src/compareFastenerEntries";
import { blank, part } from "../src/model";

test("compare the same trial depth from both sides and keep measurements unset", () => {
  const project = blank();
  const step = project.steps[0].id;
  const panel = part("Panel", "plytanium-703", [10, 10, 0.703], [0, 6, 0], step, "Casework");
  const rail = part("Rail", "stud", [1.5, 4, 2], [0.5, 4, -1.3515], step, "Casework");
  project.pieces.push(panel, rail);
  const [fromPanel, fromRail] = compareFastenerEntries(project, panel.id, rail.id, {});
  assert.ok(fromPanel.proposal && fromRail.proposal);
  assert.equal(trialFastenerDepth(1.25, fromPanel.enter, fromPanel.exit), "Inside receiver · 1.453 in to the far face");
  assert.equal(trialFastenerDepth(1.25, fromRail.enter, fromRail.exit), "Stops at or before the receiver");
  assert.equal(trialFastenerDepth(fromPanel.exit, fromPanel.enter, fromPanel.exit), "Reaches or passes the far face");
  assert.equal(trialFastenerDepth(NaN, fromPanel.enter, fromPanel.exit), null);
  assert.equal(fromPanel.proposal.plan.measurements.surfaceToTipDepth, null);
  assert.deepEqual(project.fastenerPlans, []);
  assert.deepEqual(project.supplies, []);

  project.pieces.push(part("Cover", "stud", [1.5, 4, 1], [0.5, 4, 0.8515], step, "Casework"));
  const [covered, exposed] = compareFastenerEntries(project, panel.id, rail.id, {});
  assert.match(covered.issue ?? "", /Another modeled part covers/);
  assert.ok(exposed.proposal);
});

test("comparison excludes the floor-side entry in the modeled position", () => {
  const project = blank();
  const step = project.steps[0].id;
  const foot = part("Foot", "stud", [1.5, 1, 3], [0, 0.5, 0], step, "Frame");
  const top = part("Top", "stud", [1.5, 2, 3], [0, 2, 0], step, "Frame");
  project.pieces.push(foot, top);
  const [upward, downward] = compareFastenerEntries(project, foot.id, top.id, {});
  assert.match(upward.issue ?? "", /modeled floor blocks/);
  assert.ok(downward.proposal);
});
