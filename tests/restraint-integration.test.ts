import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, uid, projectSchema, type V3 } from "../src/model";
import {
  addMeasuredStudyScrew,
  restraintScrewStudy,
} from "./fixtures/restraint-screw-study";
import { emptyFastenerMeasurements } from "../src/fasteningSchema";
import { removeFastenerPlan, saveFastenerPlan } from "../src/fastenings";
import { connectionCoverage } from "../src/connectionCoverage";
import { homeDepotHandoff } from "../src/handoff";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import {
  makeRestraintPlan,
  addRestraintLocation,
  saveRestraintPlan,
  selectRestraintReceiver,
  restraintReviews,
} from "../src/restraints";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { connect, guideMarkdown, validate } from "../src/engine";
import { toolChecklist } from "../src/tools";
function planned() {
  const p = blank("Furniture restraint"),
    s = p.steps[0].id;
  p.pieces.push(
    part("Receiver", "stud", [1.5, 36, 3.5], [0, 18, 0], s, "Frame"),
  );
  return saveRestraintPlan(
    p,
    selectRestraintReceiver(
      p,
      addRestraintLocation(makeRestraintPlan(p)),
      p.pieces[0].id,
    ),
  );
}
test("restraint preparation has a stable source phase and retains surrounding custom notes/history on regeneration", () => {
  let p = generateBuildGuide(planned());
  const phase = p.steps.find(
    (s) => s.generated?.kind === "restraint-preparation",
  )!;
  assert.ok(phase);
  assert.ok(phase.notes.length <= 4500);
  assert.equal(p.steps.indexOf(phase), 1);
  assert.ok(guideIsCurrent(p));
  phase.notes =
    "Check actual baseboard first.\n" +
    phase.notes +
    "\nKeep the wall services drawing.";
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: phase.id,
    message: "Measured baseboard",
  });
  const again = generateBuildGuide(p),
    source = again.steps.find(
      (s) => s.generated?.kind === "restraint-preparation",
    )!;
  assert.equal(source.id, phase.id);
  assert.equal(again.history[0].stepId, source.id);
  assert.match(source.notes, /Check actual baseboard first/);
  assert.match(source.notes, /wall services drawing/);
  assert.ok(
    guideIsCurrent(projectSchema.parse(JSON.parse(JSON.stringify(again)))),
  );
  assert.match(guideMarkdown(again), /Furniture restraint review/);
  assert.ok(
    validate(again).some(
      (f) => f.restraintPlanId === again.restraintPlans[0].id,
    ),
  );
  p = { ...again, restraintPlans: [] };
  assert.equal(guideIsCurrent(p), false);
  const removed = generateBuildGuide(p),
    notes = removed.steps.map((s) => s.notes).join("\n");
  assert.match(notes, /Check actual baseboard first/);
  assert.ok(!notes.includes("provisional included kits:"));
});
test("restraint tool requirements retain provenance and conditional setup without inventing stud-location capabilities", () => {
  const p = planned(),
    before = JSON.stringify(p),
    check = toolChecklist(p),
    id = p.restraintPlans[0].id;
  for (const cap of [
    "measure",
    "drill-pilot",
    "drive-screw",
    "connector-install",
    "ppe-eye",
  ] as const) {
    const requirement = check.requirements.find((r) => r.capability === cap)!;
    assert.ok(
      requirement.sources.some(
        (s) => s.kind === "restraint-plan" && s.id === id,
      ),
    );
    if (
      cap !== "measure" &&
      requirement.sources.every((s) => s.kind === "restraint-plan")
    )
      assert.equal(requirement.necessity, "conditional");
  }
  assert.ok(check.warnings.some((w) => /concealed-service/.test(w)));
  assert.equal(JSON.stringify(p), before);
  const conflict = structuredClone(p);
  conflict.restraintPlans[0].locations[0].wallSubstrate = "drywall-only";
  assert.equal(restraintReviews(conflict)[0].state, "conflict");
  assert.ok(
    toolChecklist(conflict).requirements.every((r) =>
      r.sources.every((s) => s.kind !== "restraint-plan"),
    ),
  );
});

test("a cut receiver attaches to the bookcase frame through an explicitly reviewed screw plan", () => {
  const { project, screw, restraint, railId, targetId } = restraintScrewStudy();
  const saved = saveRestraintPlan(project, {
    ...restraint,
    receiverFastenerPlanIds: [screw.id],
  });
  const [review] = restraintReviews(saved);
  assert.equal(review.state, "needs-review");
  assert.equal(review.activeKitCount, 1);
  assert.equal(review.screwLinks[0].state, "current");
  assert.equal(review.screwLinks[0].paths.length, 1);
  assert.ok(
    !review.issues.some(
      ({ code }) =>
        code === "receiver-connections" || code === "receiver-disconnected",
    ),
  );
  const intent = connectionCoverage(saved).intents.find(
    ({ planId }) => planId === restraint.id,
  )!;
  assert.ok(intent.pieceIds.includes(railId));
  assert.ok(intent.pieceIds.includes(targetId));
  assert.match(
    guideMarkdown(saved),
    /W001 · P\d+ ↔ P\d+ · 1 entered screw path/,
  );
  assert.match(homeDepotHandoff(saved), /Furniture restraint locations/);
  assert.deepEqual(saved.joints, project.joints);
  assert.ok(
    saved.pieces.some(
      (piece) =>
        piece.offcut &&
        piece.cutStock?.id ===
          saved.pieces.find(({ id }) => id === railId)?.cutStock?.id,
    ),
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.equal(restraintReviews(reopened)[0].screwLinks[0].state, "current");
  assert.equal(
    projectSchema.parse({ ...project, schemaVersion: 59 }).schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
  const selectedAgain = selectRestraintReceiver(
    saved,
    saved.restraintPlans[0],
    railId,
  );
  assert.deepEqual(selectedAgain.receiverFastenerPlanIds, []);
});

test("pending, moved, or removed screws suspend the modeled restraint chain", () => {
  const { project, screw, restraint, railId } = restraintScrewStudy();
  const saved = saveRestraintPlan(project, {
    ...restraint,
    receiverFastenerPlanIds: [screw.id],
  });
  const pending = saveFastenerPlan(saved, {
    ...screw,
    measurements: emptyFastenerMeasurements(),
  });
  assert.equal(restraintReviews(pending)[0].screwLinks[0].state, "pending");
  assert.equal(restraintReviews(pending)[0].activeKitCount, 0);
  const moved = {
    ...saved,
    pieces: saved.pieces.map((piece) =>
      piece.id === railId
        ? {
            ...piece,
            position: [
              piece.position[0],
              piece.position[1] + 0.125,
              piece.position[2],
            ] as V3,
          }
        : piece,
    ),
  };
  for (const stale of [moved, removeFastenerPlan(saved, screw.id)]) {
    const [review] = restraintReviews(stale);
    assert.equal(review.state, "stale");
    assert.equal(review.activeKitCount, 0);
    assert.deepEqual(review.screwLinks[0].paths, []);
    assert.ok(
      review.issues.some(({ code }) => code === "receiver-screw-stale"),
    );
  }
});

test("a screw into an adjustable shelf needs a further connection into the bookcase frame", () => {
  const { project, screw, restraint, targetId } = restraintScrewStudy(true);
  const detached = saveRestraintPlan(project, {
    ...restraint,
    receiverFastenerPlanIds: [screw.id],
  });
  const [review] = restraintReviews(detached);
  assert.equal(review.screwLinks[0].state, "current");
  assert.equal(review.activeKitCount, 0);
  assert.ok(review.issues.some(({ code }) => code === "receiver-disconnected"));
  const side = project.pieces.find(({ assembly }) => assembly === "Left side")!;
  const unmeasured = connect(
    detached,
    side.id,
    targetId,
    detached.steps[0].id,
    1,
    1.25,
    "screw",
    "screw-short",
  );
  const quantityOnly = saveRestraintPlan(unmeasured, {
    ...restraint,
    receiverFastenerPlanIds: [screw.id],
    receiverJointIds: [unmeasured.joints[0].id],
  });
  assert.equal(restraintReviews(quantityOnly)[0].activeKitCount, 0);
  const joined = addMeasuredStudyScrew(detached, side.id, targetId);
  const complete = saveRestraintPlan(joined.project, {
    ...restraint,
    receiverFastenerPlanIds: [screw.id, joined.screw.id],
  });
  assert.equal(restraintReviews(complete)[0].activeKitCount, 1);
  assert.equal(restraintReviews(complete)[0].screwLinks.length, 2);
});
