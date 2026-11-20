import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { projectSchema, part, uid } from "../src/model";
import {
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
  attachmentReviews,
} from "../src/attachments";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { guideMarkdown, validate } from "../src/engine";
import {
  bindingPlan,
  bindingToken,
  applyIdeaRevision,
} from "../src/ideaBindings";
import { addMissingAttachmentPinPacks } from "../src/attachmentPurchases";
import { retailerHandoff } from "../src/handoff";

function planned() {
  let p = createBuildStudy(
    "shelves",
    { ...defaultBuildStudyParameters("shelves"), width: 36 },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  p.retailer = "lowes";
  const entry = shelfSupportEntries(p)[0];
  return saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.entryId, {
      shelfRoles: entry.shelves.map((s) => s.role),
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
}
test("drilling review becomes a real generated phase before assembly without duplicate phases on regeneration", () => {
  let p = generateBuildGuide(planned());
  const source = p.steps.find(
    (s) => s.generated?.kind === "shelf-pin-preparation",
  )!;
  assert.ok(source);
  assert.equal(p.steps.indexOf(source), 1);
  assert.match(source.notes, /PENDING|UNRESOLVED/);
  assert.match(source.notes, /not a released drilling schedule/i);
  assert.ok(source.notes.length <= 4500);
  source.notes += "\n\nUse the same marked reference edge on both side panels.";
  const count = p.steps.length;
  for (let i = 0; i < 6; i++) p = generateBuildGuide(p);
  assert.equal(p.steps.length, count);
  assert.equal(
    p.steps.filter((s) => s.generated?.kind === "shelf-pin-preparation").length,
    1,
  );
  assert.equal(
    p.steps.find((s) => s.generated?.kind === "shelf-pin-preparation")?.id,
    source.id,
  );
  assert.equal(
    p.steps
      .find((s) => s.generated?.kind === "shelf-pin-preparation")!
      .notes.match(/same marked reference edge/g)?.length,
    1,
  );
  assert.equal(guideIsCurrent(p), true);
  assert.match(guideMarkdown(p), /Planned shelf attachments/);
  assert.match(guideMarkdown(p), /same marked reference edge/);
});

test("removing a plan removes only generated drilling prose and retains custom preparation instructions", () => {
  const p = generateBuildGuide(planned()),
    phase = p.steps.find((s) => s.generated?.kind === "shelf-pin-preparation")!;
  phase.notes += "\n\nKeep the measured obstruction note.";
  p.attachmentPlans = [];
  assert.equal(guideIsCurrent(p), false);
  const next = generateBuildGuide(p);
  assert.ok(
    !next.steps.some((s) => s.generated?.kind === "shelf-pin-preparation"),
  );
  assert.equal(
    next.steps.filter((s) => s.notes.includes("measured obstruction note"))
      .length,
    1,
  );
  assert.ok(
    !next.steps.some((s) =>
      s.notes.includes("not a released drilling schedule"),
    ),
  );
});

test("whole saved-design movement retains attachment intent and a rebuild keeps it stale until explicitly reviewed", () => {
  let p = addMissingAttachmentPinPacks(planned());
  const binding = p.ideaBindings[0],
    oldPlan = structuredClone(p.attachmentPlans[0]),
    oldReview = attachmentReviews(p)[0];
  const move = bindingPlan(p, binding.id),
    idea = move.structures[0];
  assert.equal(idea.kind, "casework-shelves");
  idea.parameters.origin = [12, 4, -9];
  idea.parameters.yaw = 30;
  p = applyIdeaRevision(p, binding.id, move, bindingToken(p, binding.id));
  assert.equal(attachmentReviews(p)[0].state, "needs-measurements");
  assert.deepEqual(p.attachmentPlans[0], oldPlan);
  assert.notDeepEqual(
    attachmentReviews(p)[0].points[0].bearingTargetWorld,
    oldReview.points[0].bearingTargetWorld,
  );
  const resize = bindingPlan(p, binding.id);
  const target = resize.structures[0];
  if (target.kind !== "casework-shelves") throw Error("Missing casework");
  target.parameters.width = 42;
  const before = structuredClone(p.supplies);
  p = applyIdeaRevision(p, binding.id, resize, bindingToken(p, binding.id));
  assert.deepEqual(p.attachmentPlans[0], oldPlan);
  assert.equal(attachmentReviews(p)[0].state, "stale");
  assert.equal(attachmentReviews(p)[0].activePinCount, 0);
  assert.deepEqual(p.supplies, before);
  assert.ok(validate(p).some((f) => f.attachmentPlanId === oldPlan.id));
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))), p);
});

test("attachment edits make guides stale and handoffs compare rather than double-charge planned pin demand", () => {
  let p = generateBuildGuide(planned());
  p = addMissingAttachmentPinPacks(p);
  const text = retailerHandoff(p);
  assert.match(text, /12 included planned pins; 1 × 20-pin packs/);
  assert.match(text, /1 packs already selected; 0 missing packs/);
  assert.match(text, /comparison only/);
  assert.match(text, /provisional/);
  assert.equal(p.supplies.length, 1);
  p.attachmentPlans[0].measurements = {
    ...p.attachmentPlans[0].measurements,
    bearingOffset: 0.05,
    basis: "User test piece",
    measuredAt: new Date().toISOString(),
  };
  assert.equal(guideIsCurrent(p), false);
  assert.equal(guideIsCurrent(generateBuildGuide(p)), true);
});

test("a later board cannot resurrect generated drilling prose from a removed plan", () => {
  const p = generateBuildGuide(planned()),
    phase = p.steps.find((s) => s.generated?.kind === "shelf-pin-preparation")!;
  phase.notes += "\n\nKeep the independently measured obstruction.";
  p.pieces.push(
    part(
      "Later board",
      "stud",
      [1.5, 24, 3.5],
      [90, 12, 0],
      phase.id,
      "Later work",
    ),
  );
  p.attachmentPlans = [];
  const next = generateBuildGuide(p),
    later = next.steps.find((s) => s.title === "Assemble Later work")!;
  assert.match(
    next.steps.find((s) => s.id === phase.id)!.notes,
    /independently measured obstruction/,
  );
  assert.match(
    next.steps.find((s) => s.id === phase.id)!.title,
    /Review retained instructions/,
  );
  assert.doesNotMatch(
    later.notes,
    /not a released drilling schedule|Derived hole centers|attachment plan/,
  );
  assert.equal(
    next.steps.filter((s) =>
      s.notes.includes("independently measured obstruction"),
    ).length,
    1,
  );
});

test("history on a retained generated attachment step keeps that step identity", () => {
  const p = generateBuildGuide(planned()),
    phase = p.steps.find((s) => s.generated?.kind === "shelf-pin-preparation")!;
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: phase.id,
    message: "Recorded test-drilling review",
  });
  const next = generateBuildGuide(p);
  assert.equal(next.history.at(-1)!.stepId, phase.id);
  assert.equal(
    next.steps.find((s) => s.generated?.kind === "shelf-pin-preparation")!.id,
    phase.id,
  );
});

test("global checks expose planned pin purchase shortfalls without duplicating selected supplies", () => {
  let p = planned();
  const finding = validate(p).find((f) => f.id === "attachment-pin-purchases")!;
  assert.match(
    finding.detail,
    /12 planned pins require 1 purchase packs; 0 packs are selected/,
  );
  assert.equal(finding.attachmentPlanId, p.attachmentPlans[0].id);
  p = addMissingAttachmentPinPacks(p);
  assert.ok(!validate(p).some((f) => f.id === "attachment-pin-purchases"));
  assert.equal(p.supplies.length, 1);
  assert.equal(p.supplies[0].quantity, 1);
});

test("prepended and appended custom guide notes survive removal without resurrecting obsolete generated drilling prose", () => {
  let p = generateBuildGuide(planned());
  const phase = p.steps.find(
    (s) => s.generated?.kind === "shelf-pin-preparation",
  )!;
  phase.notes =
    "Measure the outlet first.\n\n" +
    phase.notes +
    "\n\nKeep the floor vent clear.";
  p = { ...p, attachmentPlans: [] };
  const next = generateBuildGuide(p);
  const notes = next.steps.map((s) => s.notes).join("\n");
  assert.match(notes, /Measure the outlet first/);
  assert.match(notes, /Keep the floor vent clear/);
  assert.ok(!notes.includes("Derived hole centers currently known"));
  assert.ok(!notes.includes("not a released drilling schedule"));
});
