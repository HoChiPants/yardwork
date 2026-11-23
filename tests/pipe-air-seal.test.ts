import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewAssemblyOrder } from "../src/assemblyOrder";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { applyCommand, blank, projectSchema } from "../src/model";
import { openingSilicone } from "../src/openingAirSealReference";
import { pipeAirSealOptions, previewPipeAirSeal, reviewPipeAirSeals, savePipeAirSeal } from "../src/pipeAirSeal";
import { recordBackerRodCuts, trimBackerRodCutPlan } from "../src/woodJointDecisions";
import { backerRodAllocationKey } from "../src/trimBackerRodOffcuts";
import { editRoundOpening } from "../src/throughOpeningCuts";
import { previewWallDrywall } from "../src/wallDrywall";

const fixture = new URL("../public/examples/interior/pipe-air-seal.yardwork.json", import.meta.url);
const load = () => projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));

test("an eccentric pipe leaves different clearances, and backing is allocated as a reusable cut", () => {
  const project = load();
  const { plan, preview } = reviewPipeAirSeals(project)[0];
  assert.ok(preview);
  assert.equal(preview.narrow, 0.28125);
  assert.equal(preview.wide, 0.34375);
  assert.equal(preview.marker.segments.length, 2);
  assert.deepEqual(preview.marker.segments[0].points.at(0), preview.marker.segments[0].points.at(-1));
  assert.equal(homeDepotPurchaseNeeds(project).find(({ id }) => id === openingSilicone.id)?.missing, 1);

  const [{ rolls, offcuts: [allocation] }] = trimBackerRodCutPlan(project);
  assert.equal(rolls.length, 0);
  assert.equal(allocation.runs[0].length, 3 * Math.PI);
  const completed = recordBackerRodCuts(project, allocation.source.id, backerRodAllocationKey(allocation.source, allocation.runs),
    { label: "Pipe seal rod tail", length: 8 });
  assert.equal(trimBackerRodCutPlan(completed)[0].completed[0].changed, 0);
  assert.match(guideMarkdown(completed), /Measured remainder Pipe seal rod tail/);
  assert.match(guideMarkdown(completed), /Seal a pipe opening with a 10.1 fl oz cartridge gun/);
  assert.throws(() => savePipeAirSeal(project, { ...plan, id: crypto.randomUUID(), side: "negative" }), /already has a seal/);
});

test("contact, excessive gaps, and missing backing hold the estimate", () => {
  const project = load();
  const { plan } = reviewPipeAirSeals(project)[0];
  assert.match(previewPipeAirSeal(project, { ...plan, offset: [0.3125, 0] }).issues.join(" "), /touches or crosses/);
  assert.match(previewPipeAirSeal(project, { ...plan, offset: [0.2, 0] }).issues.join(" "), /widest gap exceeds/);
  assert.match(previewPipeAirSeal(project, { ...plan, rodRecess: undefined }).issues.join(" "), /Enter a backer rod recess/);
  assert.match(previewPipeAirSeal(project, { ...plan, dryFit: false }).issues.join(" "), /Dry-fit/);
  assert.deepEqual(previewPipeAirSeal(project, { ...plan, cavityDepth: 0.375, rodRecess: undefined, dryFit: false }).issues, []);

  const [part] = project.pieces;
  const resized = editRoundOpening(project, part.id, 0, { axis: 1, fromEdges: [18, 12], diameter: 3.0625 });
  assert.match(reviewPipeAirSeals(resized)[0].issue ?? "", /cut or its backing changed/);
  assert.ok(validate(resized).some(({ pipeAirSealId }) => pipeAirSealId === plan.id));
  assert.equal(homeDepotPurchaseNeeds(resized).find(({ id }) => id === openingSilicone.id)?.canAdd, false);
  assert.equal(trimBackerRodCutPlan(resized).length, 0);
  const moved = editRoundOpening(project, part.id, 0, { axis: 1, fromEdges: [20, 12], diameter: 3 });
  assert.match(reviewPipeAirSeals(moved)[0].issue ?? "", /round cut moved or was removed/);
  assert.equal(pipeAirSealOptions(moved).length, 1);
  const notched = editRoundOpening(project, part.id, 0, { axis: 1, fromEdges: [1, 12], diameter: 3 });
  const notch = pipeAirSealOptions(notched)[0];
  assert.match(previewPipeAirSeal(notched, { ...plan, openingKey: notch.key }).issues.join(" "), /cut reaches a part edge/);
});

test("the saved pipe seal gets a step between the opening's framing and the drywall", () => {
  const framed = applyCommand(blank("Pipe seal build order"), {
    type: "wall", width: 96, height: 96, depth: 48, spacing: 16, wallStock: "stud",
  });
  const wall = framed.sections[0];
  const { project, section: lining } = previewWallDrywall(framed, {
    wallId: wall.id, side: "front", stockId: "hd-usg-drywall-half-8", floorGap: 0.5,
  });
  const plate = framed.pieces.find(({ designRole }) => designRole === "wall-bottom-plate")!;
  const cut = editRoundOpening(project, plate.id, null, { axis: 1, fromEdges: [1.75, 15], diameter: 3 });
  const target = pipeAirSealOptions(cut).find(({ part }) => part.id === plate.id)!;
  const { plan } = reviewPipeAirSeals(load())[0];
  const sealed = savePipeAirSeal(cut, { ...plan, partId: plate.id, openingKey: target.key });
  const guided = generateBuildGuide(sealed);
  const stepFor = (id: string) =>
    guided.steps.findIndex((step) => step.id === guided.pieces.find((piece) => piece.id === id)?.stepId);
  const phase = guided.steps.findIndex(({ generated }) =>
    generated?.kind === "pipe-air-seal" && generated.planId === plan.id);
  assert.ok(stepFor(plate.id) >= 0 && stepFor(plate.id) < phase);
  assert.ok(lining.pieceIds.every((id) => stepFor(id) > phase));
  assert.match(guided.steps[phase].notes, /fitted and supported[\s\S]*DAP Silicone Max[\s\S]*3\/8 in/);
  assert.deepEqual(reviewAssemblyOrder(guided), []);
  const reversed = structuredClone(guided);
  reversed.steps.push(...reversed.steps.splice(phase, 1));
  assert.ok(reviewAssemblyOrder(reversed).some(({ current, prerequisites }) =>
    current.step.id === guided.steps[stepFor(lining.pieceIds[0])].id &&
    prerequisites.some(({ step }) => step.id === guided.steps[phase].id)));
  const old = projectSchema.parse({
    ...guided, schemaVersion: 164,
    steps: guided.steps.filter(({ generated }) => generated?.kind !== "pipe-air-seal"),
  });
  assert.ok(!guideIsCurrent(old));
  assert.ok(guideIsCurrent(generateBuildGuide(old)));

  const changed = editRoundOpening(guided, plate.id, 0, { axis: 1, fromEdges: [1.75, 16], diameter: 3 });
  const revised = generateBuildGuide(changed).steps.find(({ generated }) => generated?.kind === "pipe-air-seal")!;
  assert.match(revised.title, /^Review pipe seal/);
  assert.match(revised.notes, /Keep the opening accessible/);
  assert.doesNotMatch(revised.notes, /apply and tool/);
});
