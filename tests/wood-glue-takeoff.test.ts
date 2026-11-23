import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { connectionCoverage } from "../src/connectionCoverage";
import { guideMarkdown } from "../src/engine";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, projectSchema, type V3 } from "../src/model";
import { addSupply, supplyRows } from "../src/supplies";
import { woodGlue } from "../src/woodGlueReference";
import { estimateWoodGlue, isWoodGlueEstimate, saveWoodGlueEstimate } from "../src/woodGlueTakeoff";
import { modeledGluePlan, saveGlueFaces } from "../src/woodGlueFaces";
import { editThroughOpening } from "../src/throughOpeningCuts";
import { saveWoodJointDecision, woodJointDecisionEntries } from "../src/woodJointDecisions";

test("glue takeoff converts published gallon coverage to whole 16 oz bottles", () => {
  assert.equal(estimateWoodGlue(4500, 0).bottles, 1);
  assert.equal(estimateWoodGlue(4501, 0).bottles, 2);
  assert.equal(estimateWoodGlue(4320, 10).bottles, 2);
  assert.match(estimateWoodGlue(4320, 10).note, /4,320 sq in confirmed coated area · 10% extra/);
  assert.throws(() => estimateWoodGlue(0, 10), /positive total area/);
  assert.throws(() => estimateWoodGlue(Infinity, 10), /positive total area/);
  assert.throws(() => estimateWoodGlue(4500, 101), /between 0 and 100/);
  assert.throws(() => estimateWoodGlue(1e12, 0), /Check the measured area/);
});

test("replacing the estimate preserves separately selected bottles and exact purchase evidence", () => {
  const project = addSupply(blank(), woodGlue.id, 3, "Separate job");
  const original = saveWoodGlueEstimate(project, 4501, 0);
  const updated = saveWoodGlueEstimate(original, 4500, 0);

  assert.equal(original.supplies.find(isWoodGlueEstimate)?.quantity, 2);
  assert.deepEqual(updated.supplies.filter((supply) => !isWoodGlueEstimate(supply)), project.supplies);
  assert.equal(updated.supplies.filter(isWoodGlueEstimate).length, 1);
  assert.equal(updated.supplies.find(isWoodGlueEstimate)?.quantity, 1);
  const [row] = supplyRows(updated);
  assert.equal(row.quantity, 4);
  assert.equal(row.purchaseUnit, "bottle");
  assert.equal(row.offer?.productId, woodGlue.internetNumber);
  assert.equal(row.inventory, null);
});

test("glue coverage excludes the opening and needs a fresh selection after its size changes", () => {
  const project = projectSchema.parse(JSON.parse(readFileSync(
    "public/examples/wood-stock/laminated-access-plate.yardwork.json", "utf8",
  )));
  const [entry] = woodJointDecisionEntries(project);
  const plan = modeledGluePlan(project)!;
  assert.equal(plan.area, 92);
  assert.equal(plan.allowanceArea, 101.2);
  assert.equal(plan.ready[0].faces[0].patches.length, 4);
  assert.deepEqual(connectionCoverage(project).intents.map(({ kind, current }) => [kind, current]), [["wood-glue", true]]);
  assert.match(guideMarkdown(project), /Matching scrap for a glue trial · O\d+/);

  const double = saveGlueFaces(project, entry.id, {
    faceIds: [plan.ready[0].faces[0].id], coat: "both", extraPercent: 10,
  });
  assert.equal(modeledGluePlan(double)?.area, 184);
  assert.equal(homeDepotPurchaseNeeds(double).find(({ id }) => id === woodGlue.id)?.missing, 1);

  const [first, second] = entry.memberIds;
  const edited = editThroughOpening(double, first, "rectangularOpenings", 0, {
    axis: 1, fromEdges: [3, 3], spans: [4, 4],
  });
  const reviewed = saveWoodJointDecision(edited, first, second, "glue", "Check the wider cut.");
  assert.equal(modeledGluePlan(reviewed)?.required, null);
  assert.equal(connectionCoverage(reviewed).intents[0].current, false);
  assert.equal(homeDepotPurchaseNeeds(reviewed).find(({ id }) => id === woodGlue.id)?.canAdd, false);

  const moved = {
    ...double, pieces: double.pieces.map((piece) => ({
      ...piece, position: piece.position.map((n) => n + 6) as V3,
    })),
  };
  assert.equal(modeledGluePlan(moved)?.area, 184);
});
