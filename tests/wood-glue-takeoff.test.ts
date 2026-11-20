import assert from "node:assert/strict";
import { test } from "node:test";
import { blank } from "../src/model";
import { addSupply, supplyRows } from "../src/supplies";
import { woodGlue } from "../src/woodGlueReference";
import { estimateWoodGlue, isWoodGlueEstimate, saveWoodGlueEstimate } from "../src/woodGlueTakeoff";

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
