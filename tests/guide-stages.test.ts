import test from "node:test";
import assert from "node:assert/strict";
import { createBuildStudy, buildFixtureIds } from "../src/buildFixtures";
import {
  generateBuildGuide,
  guideIsCurrent,
  designFingerprint,
  guideConnections,
} from "../src/guide";
import { projectSchema, uid, blank, part } from "../src/model";
import { connect } from "../src/engine";
import { reconcileIdeaBindings } from "../src/ideaBindingState";
const stages = (p: ReturnType<typeof blank>) =>
  p.steps.filter((s) => s.generated?.kind === "assembly-stage");
for (const family of buildFixtureIds)
  test(`${family} generated stages cover every actual part once and survive JSON/schema/binding normalization`, () => {
    const source = createBuildStudy(family).project,
      original = source.pieces.map(
        ({ stepId: _step, ...physical }) => physical,
      );
    const p = generateBuildGuide(source),
      owned = stages(p).flatMap((s) =>
        s.generated?.kind === "assembly-stage" ? s.generated.memberIds : [],
      );
    assert.equal(
      new Set(owned).size,
      source.pieces.filter((p) => !p.offcut).length,
    );
    assert.equal(owned.length, new Set(owned).size);
    assert.deepEqual(
      p.pieces.map(({ stepId: _step, ...physical }) => physical),
      original,
    );
    assert.ok(guideIsCurrent(p));
    assert.ok(guideIsCurrent(reconcileIdeaBindings(p)));
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    assert.ok(guideIsCurrent(reopened));
    assert.deepEqual(stages(reopened), stages(p));
    const again = generateBuildGuide(reopened);
    assert.deepEqual(
      stages(again).map((s) => s.id),
      stages(p).map((s) => s.id),
    );
  });
test("casework guide has a carcass and shelf stage rather than eight single-panel assemblies", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project),
    phases = stages(p);
  assert.deepEqual(
    phases.map((s) =>
      s.generated?.kind === "assembly-stage" ? s.generated.stageKey : null,
    ),
    ["carcass", "shelves"],
  );
  assert.deepEqual(
    phases.map((s) => p.pieces.filter((piece) => piece.stepId === s.id).length),
    [5, 3],
  );
  assert.equal(p.steps.length, 4);
  assert.ok(!p.steps.some((s) => s.title === "Assemble Left side"));
});
test("stage notes, title, history and checked state survive regeneration; changed owner resets only its stages", () => {
  let p = generateBuildGuide(createBuildStudy("storage-banquette").project),
    phase = stages(p)[0];
  phase.title = "My measured base sequence";
  phase.notes =
    "Measure the outlet first.\n" + phase.notes + "\nKeep the wall clearance.";
  phase.complete = true;
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: phase.id,
    message: "User checked actual squareness",
  });
  p = generateBuildGuide(p);
  const same = p.steps.find((s) => s.id === phase.id)!;
  assert.equal(same.complete, true);
  assert.equal(same.title, "My measured base sequence");
  assert.equal(same.notes.match(/Measure the outlet first/g)?.length, 1);
  assert.equal(p.history.at(-1)!.stepId, phase.id);
  for (const s of stages(p)) s.complete = true;
  const owner = phase.generated!.planId,
    entry = p.ideaBindings
      .flatMap((b) => b.entries)
      .find((e) => e.id === owner)!,
    partId = p.sections.find((s) => s.id === entry.sections[0].sectionId)!
      .pieceIds[0];
  p.pieces.find((piece) => piece.id === partId)!.position[0] += 0.25;
  const changed = generateBuildGuide(p);
  for (const s of stages(changed))
    assert.equal(s.complete, s.generated!.planId !== owner);
  assert.match(
    changed.steps.find((s) => s.id === phase.id)!.notes,
    /wall clearance/,
  );
  assert.ok(guideIsCurrent(changed));
});
test("splitting legacy shared instructions keeps one review phase and its original history reference", () => {
  let p = createBuildStudy("storage-banquette").project;
  const first = p.ideaBindings[0].entries[0],
    section = p.sections.find((s) => s.id === first.sections[0].sectionId)!,
    old = p.steps.find(
      (s) =>
        s.id === p.pieces.find((x) => section.pieceIds.includes(x.id))!.stepId,
    )!;
  old.notes = "Keep the shared access panel accessible.";
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: old.id,
    message: "Measured the existing wall",
  });
  p = generateBuildGuide(p);
  assert.equal(
    p.steps.filter((s) => s.notes.includes("shared access panel")).length,
    1,
  );
  assert.equal(p.steps.find((s) => s.id === old.id)!.generated, undefined);
  assert.equal(p.history[0].stepId, old.id);
  for (let i = 0; i < 3; i++) p = generateBuildGuide(p);
  assert.equal(
    p.steps.filter((s) => s.notes.includes("shared access panel")).length,
    1,
  );
  assert.equal(p.history[0].stepId, old.id);
});
test("legacy per-panel generated prose is removed and unambiguous operation history follows the new stage", () => {
  let p = createBuildStudy("shelves").project;
  const side = p.pieces[0],
    oldStep = side.stepId;
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: oldStep,
    message: "Marked this actual side panel",
  });
  p = generateBuildGuide(p);
  assert.equal(p.steps.length, 4);
  assert.ok(
    !p.steps.some((s) => s.notes.includes("Dimensional design study.")),
  );
  assert.equal(
    p.history[0].stepId,
    p.pieces.find((x) => x.id === side.id)!.stepId,
  );
});
test("removed stage custom instructions and history remain once even when none of its parts survives", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project);
  const shelfStage = stages(p).find(
    (s) =>
      s.generated?.kind === "assembly-stage" &&
      s.generated.stageKey === "shelves",
  )!;
  shelfStage.notes += "\nKeep my reviewed shelf finish.";
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: shelfStage.id,
    message: "Reviewed the shelf edges",
  });
  const ids = new Set(
    shelfStage.generated!.kind === "assembly-stage"
      ? shelfStage.generated!.memberIds
      : [],
  );
  p = {
    ...p,
    pieces: p.pieces.filter((piece) => !ids.has(piece.id)),
    sections: p.sections.filter((s) => s.pieceIds.every((id) => !ids.has(id))),
  };
  const next = generateBuildGuide(p),
    retained = next.steps.find((s) => s.id === shelfStage.id)!;
  assert.match(retained.notes, /reviewed shelf finish/);
  assert.ok(!retained.notes.includes("Review support and drilling plans"));
  assert.equal(next.history[0].stepId, retained.id);
  assert.equal(retained.complete, false);
});
test("new-project import identity preserves stages and checklist review through explicit regeneration", () => {
  let original = generateBuildGuide(createBuildStudy("shelves").project);
  for (const s of original.steps) s.complete = true;
  const imported = { ...original, id: uid(), name: "Imported copy" };
  assert.ok(guideIsCurrent(imported));
  const regenerated = generateBuildGuide(imported);
  assert.deepEqual(
    regenerated.steps.map((s) => s.id),
    original.steps.map((s) => s.id),
  );
  assert.ok(regenerated.steps.every((s) => s.complete));
  const loose = blank();
  loose.pieces.push(
    part(
      "Board",
      "stud",
      [1.5, 36, 3.5],
      [0, 18, 0],
      loose.steps[0].id,
      "Frame",
    ),
  );
  original = generateBuildGuide(loose);
  for (const s of original.steps) s.complete = true;
  const looseImported = generateBuildGuide({ ...original, id: uid() });
  assert.deepEqual(
    looseImported.steps.map((s) => s.id),
    original.steps.map((s) => s.id),
  );
  assert.ok(looseImported.steps.every((s) => s.complete));
});
test("actual connection schedule is assigned after its endpoint stages and changes invalidate owner checks", () => {
  let p = createBuildStudy("shelves").project;
  const entry = p.ideaBindings[0].entries[0],
    find = (role: string) =>
      p.pieces.find((piece) =>
        p.sections
          .find(
            (s) =>
              s.id ===
              entry.sections.find((ref) => ref.role === role)!.sectionId,
          )!
          .pieceIds.includes(piece.id),
      )!,
    a = find("side-left"),
    b = find("bottom");
  p = connect(p, a.id, b.id, p.steps[0].id, 2, 1.25, "screw", "screw-short");
  p = generateBuildGuide(p);
  const j = p.joints[0],
    row = guideConnections(p, j.stepId)[0];
  assert.equal(row.quantity, 2);
  assert.match(row.aLabel, /^P/);
  assert.match(row.bLabel, /^P/);
  assert.equal(
    p.steps.find((s) => s.id === j.stepId)!.generated?.kind,
    "assembly-stage",
  );
  for (const s of stages(p)) s.complete = true;
  p.joints[0].quantity = 3;
  assert.equal(guideIsCurrent(p), false);
  const next = generateBuildGuide(p);
  assert.ok(stages(next).every((s) => !s.complete));
});
test("binding role changes stale the guide without depending on reconciliation revision or generated step references", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project),
    before = designFingerprint(p);
  const metadata = structuredClone(p);
  metadata.ideaBindings[0].revision += 1;
  metadata.ideaBindings[0].entries[0].sections[0].stepId = uid();
  assert.equal(designFingerprint(metadata), before);
  metadata.ideaBindings[0].entries[0].sections[0].role = "user-unrecognized";
  assert.notEqual(designFingerprint(metadata), before);
});
test("overlong custom notes refuse generation without altering the original layout or instructions", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project),
    s = stages(p)[0];
  s.notes = "x".repeat(5000);
  const before = JSON.stringify(p);
  assert.throws(
    () => generateBuildGuide(p),
    /note limit|Shorten|separate step/i,
  );
  assert.equal(JSON.stringify(p), before);
});

test("connections involving retained offcuts remain in final review rather than an active assembly stage", () => {
  const p = blank(),
    s = p.steps[0].id,
    a = part("Active", "stud", [1.5, 20, 3.5], [0, 10, 0], s, "Frame"),
    b = {
      ...part("Spare", "stud", [1.5, 10, 3.5], [2, 5, 0], s, "Frame"),
      offcut: true,
    };
  p.pieces.push(a, b);
  p.joints.push({
    id: uid(),
    a: a.id,
    b: b.id,
    kind: "screw",
    material: "screw-short",
    quantity: 2,
    length: 1.25,
    stepId: s,
  });
  const next = generateBuildGuide(p),
    phase = next.steps.find((s) => s.id === next.joints[0].stepId)!;
  assert.equal(phase.generated?.kind, "project-finish");
  assert.equal(next.joints.length, 1);
  assert.equal(guideConnections(next, phase.id)[0].bLabel, "O001");
});

test("a legacy format3 preparation custom title survives its first format4 regeneration", async () => {
  const { makeShelfPinPlan, saveShelfPinPlan, shelfSupportEntries } =
    await import("../src/attachments");
  const { attachmentPreparationNotes } = await import("../src/attachmentGuide");
  let p = createBuildStudy("shelves").project;
  const entry = shelfSupportEntries(p)[0];
  p = saveShelfPinPlan(
    p,
    makeShelfPinPlan(p, entry.entryId, {
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
    }),
  );
  const plan = p.attachmentPlans[0],
    baseline = attachmentPreparationNotes(p, plan.id),
    phase = {
      id: uid(),
      title: "My jig setup notes",
      notes: baseline + "\nUse my measured registration edge.",
      complete: true,
      generated: {
        kind: "shelf-pin-preparation" as const,
        planId: plan.id,
        notes: baseline,
      },
    };
  p.steps.push(phase);
  const migrated = projectSchema.parse({ ...p, schemaVersion: 3 }),
    next = generateBuildGuide(migrated),
    kept = next.steps.find((s) => s.id === phase.id)!;
  assert.equal(kept.title, phase.title);
  assert.match(kept.notes, /measured registration edge/);
  assert.equal(kept.complete, false);
});
test("tool or supply edits stale preparation consistently while preserving completed physical stages", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project);
  for (const s of p.steps) s.complete = true;
  p.toolSelections.push({
    productId: "kreg-kma3232",
    checkedAt: new Date().toISOString(),
  });
  assert.equal(guideIsCurrent(p), false);
  const next = generateBuildGuide(p);
  assert.equal(
    next.steps.find((s) => s.generated?.kind === "project-preparation")!
      .complete,
    false,
  );
  assert.ok(stages(next).every((s) => s.complete));
});
test("standalone manual steps retain their before/after anchors and identity through regeneration", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project),
    carcass = stages(p)[0],
    finish = p.steps.find((s) => s.generated?.kind === "project-finish")!;
  const before = {
      id: uid(),
      title: "My preparation before the carcass",
      notes: "Mask the finished wall before starting.",
      complete: false,
    },
    after = {
      id: uid(),
      title: "My final cleanup",
      notes: "Clean the work area after the final review.",
      complete: false,
    };
  p.steps.splice(p.steps.indexOf(carcass), 0, before);
  p.steps.splice(p.steps.indexOf(finish) + 1, 0, after);
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: after.id,
    message: "User retained cleanup instructions",
  });
  for (let i = 0; i < 4; i++) p = generateBuildGuide(p);
  assert.ok(
    p.steps.findIndex((s) => s.id === before.id) <
      p.steps.findIndex((s) => s.id === carcass.id),
  );
  assert.ok(
    p.steps.findIndex((s) => s.id === after.id) >
      p.steps.findIndex((s) => s.id === finish.id),
  );
  assert.equal(p.steps.filter((s) => s.id === before.id).length, 1);
  assert.equal(p.steps.filter((s) => s.id === after.id).length, 1);
  assert.equal(p.history.at(-1)!.stepId, after.id);
});

test("manual part reassignment or removing an assembly stage cannot leave its generated guide current", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project),
    stage = stages(p)[0],
    id =
      stage.generated!.kind === "assembly-stage"
        ? stage.generated!.memberIds[0]
        : "";
  const moved = structuredClone(p);
  moved.pieces.find((piece) => piece.id === id)!.stepId = moved.steps[0].id;
  assert.equal(guideIsCurrent(moved), false);
  const removed = structuredClone(moved);
  removed.steps = removed.steps.filter((s) => s.id !== stage.id);
  for (const piece of removed.pieces)
    if (piece.stepId === stage.id) piece.stepId = removed.steps[0].id;
  assert.equal(guideIsCurrent(removed), false);
  const restored = generateBuildGuide(removed);
  assert.ok(guideIsCurrent(restored));
  assert.equal(
    stages(restored).flatMap((s) =>
      s.generated!.kind === "assembly-stage" ? s.generated!.memberIds : [],
    ).length,
    restored.pieces.filter((p) => !p.offcut).length,
  );
});
