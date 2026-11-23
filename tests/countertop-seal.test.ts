import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { countertopSealPurchase, previewCountertopSeal, reviewCountertopSeals } from "../src/countertopSeal";
import { countertopSealant } from "../src/countertopSealReference";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed } from "../src/handoffPurchases";
import { part, projectSchema, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import { backerRodAllocationKey } from "../src/trimBackerRodOffcuts";
import { recordBackerRodCuts, trimBackerRodCutPlan } from "../src/woodJointDecisions";

const fixture = new URL("../public/examples/interior/vanity-countertop-seal.yardwork.json", import.meta.url);
const open = () => projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));

test("a saved taper uses measured coverage and records the backing cut without a second roll", () => {
  const project = open();
  const { plan, preview } = reviewCountertopSeals(project)[0];
  assert.ok(preview);
  assert.equal(preview.plannedLength, 48);
  assert.equal(preview.rows[0].min, 0.125);
  assert.equal(preview.rows[0].max, 0.18611);
  assert.equal(preview.rows.at(-1)!.max, 0.565);
  assert.equal(preview.rows.at(-1)!.spec?.depth, 0.285);
  assert.deepEqual(preview.issues, []);
  assert.equal(countertopSealPurchase(project).count, 1);
  const bought = addHomeDepotPurchaseNeed(project, countertopSealant.id);
  assert.equal(homeDepotShoppingList(bought).items.find(({ productId }) => productId === "317742602")?.quantity, 1);
  assert.equal(homeDepotShoppingList(bought).items.find(({ productId }) => productId === "314316969")?.quantity, 1);

  const [{ offcuts: [allocation], rolls }] = trimBackerRodCutPlan(project).filter(({ hasCountertop }) => hasCountertop);
  assert.equal(rolls.length, 0);
  assert.equal(allocation.runs[0].length, 8);
  const complete = recordBackerRodCuts(project, allocation.source.id, backerRodAllocationKey(allocation.source, allocation.runs),
    { label: "Rod tail", length: 22 });
  assert.equal(complete.backerRodOffcuts?.[0].length, 22);
  assert.equal(trimBackerRodCutPlan(complete).find(({ hasCountertop }) => hasCountertop)?.completed[0].changed, 0);
  assert.match(guideMarkdown(complete), /Measured remainder Rod tail · 22 in/);
  assert.match(guideMarkdown(complete), /## Countertop splash seals/);

  const yaw: V3 = [0, Math.PI / 3, 0];
  const turned = { ...project, pieces: project.pieces.map((piece) => ({
    ...piece, position: rotate(piece.position, yaw), rotation: composeRotation(yaw, piece.rotation),
  })) };
  assert.ok(reviewCountertopSeals(turned)[0].preview);
  const ask = buildQuestion("Plan a countertop seal for P001")!;
  assert.equal(answerBuildQuestion(project, ask, []).link?.action.kind, "countertop-seal");
  assert.equal(plan.edge, "-Z");
});

test("a blocked edge or a changed finish cannot silently remain in the sealant estimate", () => {
  const project = open();
  const { plan } = reviewCountertopSeals(project)[0];
  const sourceRun = plan.spans[0];
  if (sourceRun.kind !== "corner") throw Error("The practice plan needs a reference corner bead.");
  const badWidth = previewCountertopSeal(project, { ...plan, spans: [{ ...sourceRun, width: 0.1 }] });
  assert.match(badWidth.issues[0].issue ?? "", /narrower than the modeled gap/);

  const newTrim = part("Trim over the bead", "plytanium-703", [4, 1, 0.25], [-20, 36.25, -12.62], project.steps[0].id, "");
  const blocked = { ...project, pieces: [...project.pieces, newTrim] };
  assert.match(reviewCountertopSeals(blocked)[0].issue ?? "", /Trim over the bead/);
  assert.equal(countertopSealPurchase(blocked).count, null);
  assert.ok(validate(blocked).some(({ countertopSealId }) => countertopSealId === plan.id));

  const moved = { ...project, pieces: project.pieces.map((piece) => piece.id === plan.wallId
    ? { ...piece, position: [piece.position[0], piece.position[1], piece.position[2] + 0.01] as V3 } : piece) };
  assert.match(reviewCountertopSeals(moved)[0].issue ?? "", /modeled seam changed/);
  assert.equal(countertopSealPurchase(moved).count, null);
  assert.match(guideMarkdown(moved), /Measure and review the saved marks again/);
});
