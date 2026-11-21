import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { validate } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part } from "../src/model";

test("workspace questions leave layout and edit requests to the planner", () => {
  assert.equal(buildQuestion("Add a cabinet door that opens outward"), null);
  assert.equal(buildQuestion("Make the drawer two inches deeper"), null);
  assert.equal(buildQuestion("Plan new shelves using my scraps"), null);
  assert.deepEqual(buildQuestion("Can you review the weak spots?"), {
    kind: "checks",
  });
  assert.deepEqual(buildQuestion("Could I reuse offcut o7?"), {
    kind: "offcuts",
    label: "O007",
  });
  assert.deepEqual(buildQuestion("Will the cabinet door hit anything?"), {
    kind: "motion",
    subject: "the cabinet door",
  });
});

test("the support answer surfaces the current model check and ignores shopping warnings", () => {
  const project = blank("Unsupported frame");
  project.pieces.push(
    part(
      "Floating rail",
      "stud",
      [3.5, 1.5, 18],
      [0, 6, 0],
      project.steps[0].id,
      "Frame",
    ),
  );
  const checks = validate(project);
  const before = structuredClone(project);
  const answer = answerBuildQuestion(project, { kind: "checks" }, checks);
  const row = answer.rows?.find(({ id }) => id === "floating");
  assert.match(row?.detail ?? "", /Floating rail/);
  assert.deepEqual(row?.link?.action, { kind: "finding", id: "floating" });
  assert.ok(!answer.rows?.some(({ id }) => id === "unpriced-products"));
  assert.deepEqual(project, before);
});

test("generic storage-lid questions request a section name when there are multiple lids", () => {
  const { project } = createBuildStudy("storage-banquette");
  const ambiguous = answerBuildQuestion(
    project,
    { kind: "motion", subject: "the lid" },
    [],
  );
  assert.match(ambiguous.detail, /Several motions match/);
  assert.equal(ambiguous.rows, undefined);
  const section = project.sections.find(({ recipe }) => recipe?.openingLid)!;
  const exact = answerBuildQuestion(
    project,
    { kind: "motion", subject: section.name },
    [],
  );
  assert.ok(exact.rows?.length);
  const action = exact.rows[0].link?.action;
  assert.equal(action?.kind, "lid");
  assert.equal(action.sectionId, section.id);
});

test("a labeled scrap answer plans cuts only from its recorded source and leaves the current project intact", () => {
  const start = blank("Cut pool");
  const step = start.steps[0].id;
  const target = part(
    "Filler",
    "stud",
    [3.5, 1.5, 12],
    [0, 0.75, 0],
    step,
    "Casework",
  );
  let project = addMeasuredOffcut(
    { ...start, pieces: [target] },
    step,
    "stud",
    [6, 3.5, 1.5],
    "Short scrap",
  );
  project = addMeasuredOffcut(
    project,
    step,
    "stud",
    [24, 3.5, 1.5],
    "Longer scrap",
  );
  const before = structuredClone(project);
  const shorter = answerBuildQuestion(
    project,
    { kind: "offcuts", label: "O001" },
    [],
  );
  assert.match(shorter.detail, /No current unassigned part fits/);
  const longer = answerBuildQuestion(
    project,
    { kind: "offcuts", label: "O002" },
    [],
  );
  assert.match(longer.rows?.[0].detail ?? "", /O002.*Longer scrap/);
  assert.equal(longer.link?.action.kind, "offcut-reuse");
  assert.equal(longer.link.action.plan.assignments[0].partId, target.id);
  assert.equal(longer.link.action.plan.source, project);
  assert.match(
    answerBuildQuestion(project, { kind: "offcuts", label: "O003" }, []).detail,
    /missing/,
  );
  assert.deepEqual(project, before);
});
