import assert from "node:assert/strict";
import { test } from "node:test";
import { answerConnectionQuestion, connectionQuestion } from "../src/connectionQuestions";
import { makeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { blank, part, type Project } from "../src/model";
import { ensurePartLabels } from "../src/partLabels";

function setup() {
  const project = blank();
  const stepId = project.steps[0].id;
  const front = part("Panel to trim", "plytanium-703", [10, 10, 0.703], [0, 6, 0], stepId, "Casework");
  const rail = part("Front rail", "stud", [1.5, 4, 2], [0.5, 4, -1.3515], stepId, "Casework");
  const far = part("Rear rail", "stud", [1.5, 4, 2], [8, 4, -1.3515], stepId, "Casework");
  project.pieces.push(front, rail, far);
  return { project: ensurePartLabels(project), front, rail, far };
}

function ask(project: Project, prompt: string) {
  const question = connectionQuestion(project, prompt);
  assert.ok(question);
  return answerConnectionQuestion(project, question);
}

test("joint questions resolve exact names and labels to actual contact and remain local reads", () => {
  const { project, front, rail } = setup();
  const before = structuredClone(project);
  const answer = ask(project, "How can I attach “Panel to trim” into the Front rail?");
  assert.ok("pairs" in answer);
  assert.equal(answer.pairs.length, 1);
  assert.equal(answer.pairs[0].first.id, front.id);
  assert.equal(answer.pairs[0].second.id, rail.id);
  assert.equal(answer.pairs[0].contact.state, "face-contact");
  assert.equal(answer.pairs[0].contact.gap, 0);
  const reverse = ask(project, "Please screw from p2 into P001.");
  assert.ok("pairs" in reverse);
  assert.equal(reverse.pairs[0].first.id, rail.id);
  assert.deepEqual(project, before);
  assert.equal(connectionQuestion(project, "Build a closet and screw the rails to the sides"), null);
  assert.equal(connectionQuestion(project, "Attach a new shelf to the wall"), null);
});

test("nearby review lists actual neighbors and opens a saved plan from either direction", () => {
  const { project, front, rail, far } = setup();
  const plan = makeFastenerPlan(project, rail.id, front.id);
  const saved = saveFastenerPlan(project, plan);
  const answer = ask(saved, "What can I screw P001 to?");
  assert.ok("pairs" in answer);
  assert.deepEqual(answer.pairs.map(({ second }) => second.id), [rail.id]);
  assert.deepEqual(answer.pairs[0].plans, [{ id: plan.id, label: plan.label }]);
  const apart = ask(saved, "Review screw joint between P001 and P003");
  assert.ok("pairs" in apart);
  assert.equal(apart.pairs[0].second.id, far.id);
  assert.equal(apart.pairs[0].contact.state, "outside-search");
});

test("ambiguous names, removed labels, offcuts and self-pairs stay unresolved", () => {
  const { project, rail, far } = setup();
  far.name = rail.name;
  const ambiguous = ask(project, "Screw P001 to Front rail");
  assert.ok("message" in ambiguous);
  assert.deepEqual(ambiguous.choices, ["P002", "P003"]);
  const offcut = { ...far, offcut: true };
  const changed = { ...project, pieces: [project.pieces[0], offcut] };
  for (const label of ["P002", "P003"]) {
    const missing = ask(changed, `Screw P001 to ${label}`);
    assert.ok("message" in missing);
    assert.match(missing.message, /no longer an active wood part/);
  }
  const same = ask(changed, "Screw P001 into the Panel to trim");
  assert.ok("message" in same);
  assert.match(same.message, /two different/);
});
