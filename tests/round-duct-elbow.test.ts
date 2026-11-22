import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { addHomeDepotPurchaseNeed } from "../src/handoffPurchases";
import { part, projectSchema } from "../src/model";
import { addRoundDuctOffcut, reserveRoundDuctOffcut, roundDuctPurchaseCount, roundDuctTakeoff, saveRoundDuct } from "../src/roundDuct";
import { previewRoundDuctElbow, roundDuctElbowCount, saveRoundDuctElbow } from "../src/roundDuctElbow";
import type { RoundDuctElbowInput } from "../src/roundDuctElbowSchema";
import { roundDuctElbowStock } from "../src/roundDuctReference";

function practice() {
  const project = projectSchema.parse(JSON.parse(readFileSync(new URL("../public/examples/hvac/round-elbow.yardwork.json", import.meta.url), "utf8")));
  const [first, second] = project.roundDuctRuns!;
  const input: RoundDuctElbowInput = {
    first: { runId: first.id, tip: "end" }, second: { runId: second.id, tip: "start" },
    firstSetback: 6, secondSetback: 6, envelopeWidth: 8, crimpedTip: "first",
  };
  return { project, input, first, second };
}

test("a dry-fitted elbow carries the measured seats, mating ends and exact purchase to the guide", () => {
  const { project, input } = practice();
  const audited = previewRoundDuctElbow(project, input);
  assert.deepEqual(audited.issues, []);
  assert.deepEqual(audited.geometry?.points, [[-6, 10, 0], [0, 10, 0], [0, 10, 6]]);
  assert.deepEqual(audited.required, ["plain", "crimped"]);
  assert.match(previewRoundDuctElbow(project, { ...input, firstSetback: 5 }).issues.join(" "), /miss the same turn by 1 in/);
  assert.match(previewRoundDuctElbow(project, { ...input, first: { ...input.first, tip: "start" } }).issues.join(" "), /miss the same turn/);
  const saved = saveRoundDuctElbow(project, input);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(saved))), saved);
  assert.throws(() => saveRoundDuctElbow(saved, input), /already uses/);
  assert.equal(roundDuctElbowCount(saved), 1);
  assert.match(guideMarkdown(saved), /Supply through bay \(end\) needs a plain pipe end/);
  const bought = addHomeDepotPurchaseNeed(saved, roundDuctElbowStock.id);
  assert.equal(homeDepotShoppingList(bought).items.find(({ productId }) => productId === "100062966")?.quantity, 1);
  const moved = { ...bought, pieces: [...bought.pieces,
    part("Moved brace", "stud", [1.5, 3.5, 3], [2, 10, -1], bought.steps[0].id, "Floor"),
  ] };
  assert.equal(roundDuctElbowCount(moved), null);
  assert.ok(validate(moved).some(({ title, detail }) => title === "Review measured duct elbow" && detail.includes("Moved brace")));
  assert.equal(homeDepotShoppingList(moved).items.some(({ productId }) => productId === "100062966"), false);
  assert.match(homeDepotHandoff(moved), /LINKED PURCHASES TO REVIEW[\s\S]*Master Flow 6 in round adjustable elbow/);
});

test("changed axes and an incompatible reserved duct end send the elbow back to review", () => {
  const { project, input, first, second } = practice();
  const saved = saveRoundDuctElbow(project, input);
  const changed = saveRoundDuct(saved, { ...second.input, end: [4, 10, 44] }, second.id);
  assert.equal(roundDuctElbowCount(changed), null);
  assert.match(guideMarkdown(changed), /axes must meet at a right angle/);
  const measured = addRoundDuctOffcut(saved, {label: "Wrong terminal end", length: 40, ends: ["plain", "crimped"]});
  const cut = roundDuctTakeoff(measured).targets.find(({ run }) => run.id === first.id)!;
  assert.equal(cut.requiredEnds[1], "plain");
  assert.throws(() => reserveRoundDuctOffcut(measured, measured.roundDuctOffcuts![0].id, cut.revisionKey, ["plain", "crimped"]), /saved elbow/);
  const offcutWithoutElbow = { ...measured, roundDuctElbows: [] };
  const imported = reserveRoundDuctOffcut(offcutWithoutElbow, measured.roundDuctOffcuts![0].id, cut.revisionKey, ["plain", "crimped"]);
  const conflicting = { ...imported, roundDuctElbows: saved.roundDuctElbows };
  assert.equal(roundDuctElbowCount(conflicting), null);
  assert.match(guideMarkdown(conflicting), /needs a plain pipe end at the elbow/);
});

test("the cut schedule keeps one plain and one crimped end at an internal pipe lap", () => {
  const { project, input, second } = practice();
  const joined = saveRoundDuctElbow(saveRoundDuct(project, { ...second.input, end: [0, 10, 94] }, second.id), input);
  const schedule = roundDuctTakeoff(joined).endSchedules.get(second.id)!;
  assert.deepEqual(schedule.cuts.map(({ ends, trim }) => [ends, trim]), [
    [["crimped", "plain"], undefined],
    [["crimped", "plain"], "end"],
  ]);
  assert.match(guideMarkdown(joined), /Cut to 31 in\. Start crimped · finish plain\. Trim the plain end and keep the factory crimp/);
  const measured = addRoundDuctOffcut(joined, {label: "Reversed lap", length: 31, ends: ["plain", "plain"]});
  const cut = roundDuctTakeoff(measured).targets.find(({ run, index }) => run.id === second.id && index === 1)!;
  assert.throws(() => reserveRoundDuctOffcut(measured, measured.roundDuctOffcuts![0].id, cut.revisionKey, ["plain", "plain"]),
    /available pipe ends cannot mate/);
});

test("two elbows demanding matching forms hold purchases until the cut can supply both", () => {
  const { project, input, second } = practice();
  const thirdRun = saveRoundDuct(project, { ...second.input, name: "Third branch", start: [6, 10, 50], end: [44, 10, 50] });
  const third = thirdRun.roundDuctRuns!.at(-1)!;
  const last: RoundDuctElbowInput = {
    ...input, first: { runId: second.id, tip: "end" }, second: { runId: third.id, tip: "start" },
  };
  const startCrimped = saveRoundDuctElbow(thirdRun, input);
  assert.throws(() => saveRoundDuctElbow(startCrimped, { ...last, crimpedTip: "second" }), /available pipe ends cannot mate/);
  const startPlain = saveRoundDuctElbow(thirdRun, { ...input, crimpedTip: "second" });
  assert.throws(() => saveRoundDuctElbow(startPlain, last), /measured factory crimp length/);
  const measured = saveRoundDuct(startPlain, { ...second.input, factoryCrimpLength: 2 }, second.id);
  const both = saveRoundDuctElbow(measured, last);
  assert.equal(roundDuctElbowCount(both), 2);
  assert.equal(roundDuctPurchaseCount(both), 3);
  assert.match(guideMarkdown(both), /Start plain · finish plain\. Trim off the measured factory crimp at the end/);
  const lostMeasurement = saveRoundDuct(both, second.input, second.id);
  assert.equal(roundDuctPurchaseCount(lostMeasurement), null);
  assert.equal(roundDuctElbowCount(lostMeasurement), null);
  assert.ok(validate(lostMeasurement).some(({ title }) => title === "Review duct mating ends · Cross branch"));
});
