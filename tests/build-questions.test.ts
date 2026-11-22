import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { answerBuildQuestion, buildQuestion } from "../src/buildQuestions";
import { validate } from "../src/engine";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { blank, part } from "../src/model";
import { saveMotionPlan, saveMotionTestScenario } from "../src/mechanismMotion";

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

test("a closest-gap question selects the saved linked path and keeps ambiguous paths explicit", () => {
  const project = blank("Door and drawer");
  const step = project.steps[0].id;
  const door = part("Door", "plywood", [12, 20, 0.75], [0, 12, 6], step, "Cabinet");
  const drawer = part("Drawer", "plywood", [8, 3, 8], [0, 6, 0], step, "Cabinet");
  project.pieces = [door, drawer];
  const hinge = saveMotionPlan(project, {
    label: "Door", memberIds: [door.id],
    mechanism: { kind: "hinge", axis: [0, 1, 0], pivot: [-6, 12, 6], travel: 90 },
  });
  const slide = saveMotionPlan(hinge.project, {
    label: "Drawer", memberIds: [drawer.id], mechanism: { kind: "slide", axis: [0, 0, 1], travel: 10 },
  });
  const question = buildQuestion("What's the closest gap between P1 and p002?")!;
  assert.deepEqual(question, { kind: "motion-gap", labels: ["P001", "P002"] });
  assert.equal(answerBuildQuestion(slide.project, question, []).rows?.length, 2);
  const saved = saveMotionTestScenario(slide.project, slide.plan.id, "Door first", {
    held: [], linkedId: hinge.plan.id, openingOrder: "companion-first",
    sequenceTargets: { selected: { kind: "slide", travel: 5 }, companion: { kind: "hinge", travel: 35 } },
  });
  const expected = {
    kind: "motion-gap", planId: slide.plan.id, scenarioId: saved.scenario.id,
    pair: { movingId: door.id, otherId: drawer.id },
  };
  const preferred = answerBuildQuestion(saved.project, question, []);
  assert.deepEqual(preferred.rows?.[0].link?.action, expected);
  assert.equal(preferred.rows?.length, 3);
  const named = buildQuestion('How close do P1 and P2 get during "Door First"?')!;
  assert.deepEqual(answerBuildQuestion(saved.project, named, []).rows?.[0].link?.action, expected);
  const wrongName = buildQuestion("Find the closest gap between P1 and P2 in Missing test")!;
  assert.equal(answerBuildQuestion(saved.project, wrongName, []).link?.action.kind, "motion-setup");
  const missingPart = buildQuestion("Find the closest gap between P1 and P7")!;
  assert.match(answerBuildQuestion(saved.project, missingPart, []).detail, /Choose two different part labels/);
});

test("an offcut question checks one finished board and links to prefilled placement", () => {
  const project = blank("Scrap check");
  const stock = addMeasuredOffcut(project, project.steps[0].id, "stud-10", [65, 3.5, 1.5]);
  const request = buildQuestion("Do I have scrap for a 4 ft 2x4?")!;
  assert.deepEqual(request, { kind: "board-offcut", length: 48, nominal: "2 × 4", treated: false });
  assert.deepEqual(buildQuestion("Can I make a four-foot two by four from scrap?"), request);
  const answer = answerBuildQuestion(stock, request, []);
  assert.equal(answer.detail, "O001 fits 4 ft of 2 × 4 framing lumber.");
  assert.equal(answer.rows?.[0].detail, "Crosscut to 4 ft");
  assert.deepEqual(answer.link?.action, { kind: "board-placement", groupId: "framing-2x4", length: 48 });

  const treated = buildQuestion("Can I cut a 4 ft 2 in pressure-treated 2x4 from an offcut?")!;
  assert.deepEqual(treated, { kind: "board-offcut", length: 50, nominal: "2 × 4", treated: true });
  assert.match(answerBuildQuestion(stock, treated, []).detail, /No recorded offcut fits 50 in of Ground-contact 2 × 4/);
  assert.equal(buildQuestion("Add two 4 ft 2x4s to the workbench using scraps"), null);
});

test("a named scrap is checked directly, and a general question lists each matching scrap once", () => {
  let project = blank("Choose labeled scrap");
  const step = project.steps[0].id;
  project = addMeasuredOffcut(project, step, "stud-10", [55, 3.5, 1.5]);
  project = addMeasuredOffcut(project, step, "stud-12", [63, 3.5, 1.5]);
  project = addMeasuredOffcut(project, step, "stud", [48.05, 3.5, 1.5]);
  const general = answerBuildQuestion(project, buildQuestion("Do I have scrap for a 4 ft 2x4?")!, []);
  assert.deepEqual(general.rows?.map(({ title }) => title.split(" · ")[0]), ["O001", "O002"]);
  const named = answerBuildQuestion(project, buildQuestion("Can I make a four-foot two by four from offcut o2?")!, []);
  assert.match(named.detail, /^O002 fits 4 ft/);
  assert.equal(named.rows?.length, 1);
  assert.deepEqual(named.link?.action, {
    kind: "board-placement", groupId: "framing-2x4", length: 48, offcutId: project.pieces[1].id,
  });
  const tooShort = answerBuildQuestion(project, buildQuestion("Can I get a 4 ft 2x4 from O003?")!, []);
  assert.match(tooShort.detail, /^O003 cannot supply 4 ft/);
  assert.equal(tooShort.link?.action.kind, "cut-pool");
  assert.doesNotMatch(tooShort.detail, /O001|O002/);
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

test("asking about cut end treatment identifies the affected part from current stock", () => {
  const project = blank();
  project.pieces = [part("Treated brace", "treated", [5.5, 1.5, 36], [0, 0.75, 0], project.steps[0].id, "Base")];
  const question = buildQuestion("Which treated wood cuts need field treatment?");
  assert.deepEqual(question, { kind: "treated-wood" });
  const answer = answerBuildQuestion(project, question!, []);
  assert.match(answer.rows?.[0].detail ?? "", /length to 3 ft/);
  assert.deepEqual(answer.rows?.[0].link?.action, { kind: "part", id: project.pieces[0].id });
  assert.equal(buildQuestion("Build a frame with treated wood"), null);
});
