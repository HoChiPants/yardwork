import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBuildStudy, buildFixtureIds } from "../src/buildFixtures";
import { assemblyStages, baseAssemblyStages } from "../src/assemblyStages";
import {
  assignGuidePlacement,
  guidePlacementIssues,
  guidePlacementTargets,
  rekeyGuidePlacements,
} from "../src/guidePlacement";
import {
  guidePlacementSchema,
  type GuidePlacement,
} from "../src/guidePlacementSchema";
import {
  resolveGuidePlacements,
  unresolvedGuidePlacementKey,
} from "../src/guidePlacementResolution";
import {
  designFingerprint,
  generateBuildGuide,
  guideIsCurrent,
} from "../src/guide";
import {
  blank,
  part,
  projectSchema,
  step,
  uid,
  type Piece,
  type Project,
} from "../src/model";
import { cutPiece } from "../src/engine";
import { transformSection } from "../src/sections";

const choice = (target: {
  ownerId: string;
  stageKey: string;
}): GuidePlacement => ({ ownerId: target.ownerId, stageKey: target.stageKey });
const stages = (p: Project) =>
  p.steps.filter((phase) => phase.generated?.kind === "assembly-stage");
function coversOnce(p: Project) {
  const ids = assemblyStages(p).flatMap((stage) => stage.memberIds),
    actual = p.pieces.filter((piece) => !piece.offcut).map((piece) => piece.id);
  assert.deepEqual([...ids].sort(), actual.sort());
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(assemblyStages(p).every((stage) => stage.memberIds.length > 0));
}
function physical(piece: Piece) {
  const { stepId: _step, guidePlacement: _placement, ...rest } = piece;
  return rest;
}
function addCustom(p: Project, sectionId?: string) {
  const extra = part(
    "Explicit custom blocking",
    "hd-pine-1x4",
    [0.75, 19.594, 3.5],
    [0, 7, 0],
    p.steps[0].id,
    "Loose parts",
  );
  return {
    pieceId: extra.id,
    project: projectSchema.parse({
      ...p,
      pieces: [...p.pieces, extra],
      sections: p.sections.map((section) =>
        section.id === sectionId
          ? { ...section, pieceIds: [...section.pieceIds, extra.id] }
          : section,
      ),
    }),
  };
}
function completeAssemblies(p: Project) {
  return {
    ...p,
    steps: p.steps.map((phase) =>
      phase.generated?.kind === "assembly-stage"
        ? { ...phase, complete: true }
        : phase,
    ),
  };
}

for (const family of buildFixtureIds)
  test(`${family}: an explicit actual-member override preserves all physical facts and covers once`, () => {
    let p = generateBuildGuide(createBuildStudy(family).project);
    const targets = guidePlacementTargets(p),
      source = p.pieces.find((piece) =>
        targets[0].memberIds.includes(piece.id),
      )!,
      destination = targets.find(
        (target) => !target.memberIds.includes(source.id),
      )!,
      before = structuredClone(p),
      ownSection = p.sections.find((section) =>
        section.pieceIds.includes(source.id),
      )?.id;
    assert.ok(destination);
    p = assignGuidePlacement(p, source.id, choice(destination));
    assert.equal(p.guideFingerprint, null);
    assert.deepEqual(p.pieces.map(physical), before.pieces.map(physical));
    assert.deepEqual(p.sections, before.sections);
    assert.deepEqual(p.joints, before.joints);
    assert.deepEqual(p.fastenerPlans, before.fastenerPlans);
    assert.deepEqual(p.lidHingePlans, before.lidHingePlans);
    assert.deepEqual(p.hingeStockSources, before.hingeStockSources);
    assert.deepEqual(p.connectorPlans, before.connectorPlans);
    assert.deepEqual(p.supplies, before.supplies);
    coversOnce(p);
    const expected = assemblyStages(p).find(
      (stage) =>
        stage.ownerId === destination.ownerId &&
        stage.key === destination.stageKey,
    )!;
    assert.ok(expected.memberIds.includes(source.id));
    assert.match(expected.notes, /Explicit guide placement/);
    p = generateBuildGuide(p);
    const assigned = p.steps.find(
      (phase) =>
        phase.id === p.pieces.find((piece) => piece.id === source.id)!.stepId,
    )!;
    assert.equal(assigned.generated?.planId, destination.ownerId);
    assert.equal(
      assigned.generated?.kind === "assembly-stage" &&
        assigned.generated.stageKey,
      destination.stageKey,
    );
    assert.equal(
      p.sections.find((section) => section.pieceIds.includes(source.id))?.id,
      ownSection,
    );
    assert.equal(
      p.pieces.find((piece) => piece.id === source.id)!.designRole,
      source.designRole,
    );
    assert.ok(guideIsCurrent(p));
    p = projectSchema.parse(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(generateBuildGuide(p), p);
  });

test("targets are actual assembly identities with current custom titles; prep/finish/absent targets and offcuts reject", () => {
  const p = generateBuildGuide(createBuildStudy("shelves").project),
    stage = stages(p)[0],
    target = guidePlacementTargets(p)[0];
  stage.title = "My actual carcass sequence";
  assert.equal(
    guidePlacementTargets(p).find(
      (row) =>
        row.ownerId === target.ownerId && row.stageKey === target.stageKey,
    )!.title,
    stage.title,
  );
  assert.equal(guidePlacementTargets(p).length, baseAssemblyStages(p).length);
  const id = p.pieces[0].id;
  assert.throws(
    () =>
      assignGuidePlacement(p, id, {
        ownerId: p.id,
        stageKey: "project-preparation",
      }),
    /unavailable/,
  );
  assert.throws(
    () =>
      assignGuidePlacement(p, id, {
        ownerId: uid(),
        stageKey: target.stageKey,
      }),
    /unavailable/,
  );
  assert.throws(
    () => assignGuidePlacement(p, uid(), choice(target)),
    /active actual part/,
  );
  const offcut = {
    ...p,
    pieces: p.pieces.map((piece) =>
      piece.id === id ? { ...piece, offcut: true } : piece,
    ),
  };
  assert.throws(
    () => assignGuidePlacement(offcut, id, choice(target)),
    /active actual part/,
  );
  assert.equal(
    guidePlacementSchema.safeParse({ ...choice(target), guessedRole: "leg" })
      .success,
    false,
  );
});

test("fitted custom member is placed before shell/lid, stable across repeated generation with title, notes, checks and history", () => {
  let p = generateBuildGuide(createBuildStudy("storage-banquette").project),
    target = guidePlacementTargets(p).find(
      (row) => row.stageKey === "bottom-frame",
    )!,
    section = p.ideaBindings[0].entries[0].sections[0].sectionId;
  const added = addCustom(p, section);
  p = assignGuidePlacement(added.project, added.pieceId, choice(target));
  p = generateBuildGuide(p);
  const phase = p.steps.find(
    (row) =>
      row.id === p.pieces.find((piece) => piece.id === added.pieceId)!.stepId,
  )!;
  phase.title = "Block before closing the storage shell";
  phase.notes =
    "Check outlet access.\n" + phase.notes + "\nPreserve clamp access.";
  phase.complete = true;
  const operation = {
    id: uid(),
    at: new Date().toISOString(),
    stepId: phase.id,
    message: "Measured the actual blocking span.",
  };
  p.history.push(operation);
  // Existing guide custom text gets its canonical wrapper once, then stays exact.
  p = generateBuildGuide(p);
  assert.equal(p.steps.find((row) => row.id === phase.id)!.complete, true);
  const expected = structuredClone(p);
  for (let i = 0; i < 4; i++)
    p = generateBuildGuide(projectSchema.parse(JSON.parse(JSON.stringify(p))));
  assert.deepEqual(p, expected);
  const phases = stages(p),
    own = phases.filter((row) => row.generated?.planId === target.ownerId);
  assert.equal(own[0].id, phase.id);
  assert.ok(
    own.findIndex(
      (row) =>
        row.generated?.kind === "assembly-stage" &&
        row.generated.stageKey === "shell",
    ) > 0,
  );
  assert.equal(
    p.steps
      .find((row) => row.id === phase.id)!
      .notes.match(/Check outlet access/g)?.length,
    1,
  );
  assert.deepEqual(p.history.at(-1), operation);
  coversOnce(p);
});

test("loose cross-owner member geometry is included in target scope while unrelated stages retain their checks", () => {
  let p = generateBuildGuide(createBuildStudy("storage-banquette").project),
    target = guidePlacementTargets(p).find(
      (row) => row.stageKey === "bottom-frame",
    )!;
  const extra = addCustom(p);
  p = generateBuildGuide(
    assignGuidePlacement(extra.project, extra.pieceId, choice(target)),
  );
  p = completeAssemblies(p);
  assert.ok(
    !p.sections.some((section) => section.pieceIds.includes(extra.pieceId)),
  );
  p.pieces.find((piece) => piece.id === extra.pieceId)!.position[0] += 0.25;
  const next = generateBuildGuide(p);
  for (const phase of stages(next)) {
    const targetPhase =
      phase.generated?.planId === target.ownerId &&
      phase.generated.kind === "assembly-stage" &&
      phase.generated.stageKey === target.stageKey;
    assert.equal(phase.complete, !targetPhase);
  }
  assert.ok(guideIsCurrent(next));
  coversOnce(next);
});

test("current membership, relative pose and source edits keep explicit intent; full-Euler section movement does not reparent it", () => {
  let p = generateBuildGuide(createBuildStudy("storage-banquette").project),
    target = guidePlacementTargets(p).find(
      (row) => row.stageKey === "bottom-frame",
    )!,
    section = p.ideaBindings[0].entries[0].sections[0].sectionId;
  const added = addCustom(p, section);
  p = generateBuildGuide(
    assignGuidePlacement(added.project, added.pieceId, choice(target)),
  );
  p = transformSection(p, section, [5, 3, -8], [0.4, -0.7, 0.2]);
  assert.deepEqual(
    p.pieces.find((piece) => piece.id === added.pieceId)!.guidePlacement,
    choice(target),
  );
  coversOnce(p);
  p = completeAssemblies(generateBuildGuide(p));
  const member = p.pieces.find((piece) => piece.id === added.pieceId)!;
  member.material = "lowes-pine-1x4";
  const next = generateBuildGuide(p);
  assert.deepEqual(
    next.pieces.find((piece) => piece.id === added.pieceId)!.guidePlacement,
    choice(target),
  );
  assert.equal(
    next.steps.find((phase) => phase.id === member.stepId)!.complete,
    false,
  );
});

test("cuts keep actual retained-ID placement and clear all new remnant placement", () => {
  let p = generateBuildGuide(createBuildStudy("storage-banquette").project),
    target = guidePlacementTargets(p).find(
      (row) => row.stageKey === "bottom-frame",
    )!;
  const added = addCustom(p);
  p = generateBuildGuide(
    assignGuidePlacement(added.project, added.pieceId, choice(target)),
  );
  const original = structuredClone(p);
  p = cutPiece(p, added.pieceId, 10, 1);
  const kept = p.pieces.find((piece) => piece.id === added.pieceId)!,
    remnant = p.pieces.find(
      (piece) => !original.pieces.some((old) => old.id === piece.id),
    )!;
  assert.deepEqual(kept.guidePlacement, choice(target));
  assert.ok(remnant.offcut);
  assert.ok(!("guidePlacement" in remnant));
  p = generateBuildGuide(p);
  coversOnce(p);
  assert.equal(
    assemblyStages(p).some((stage) => stage.memberIds.includes(remnant.id)),
    false,
  );
  assert.equal(
    p.pieces.find((piece) => piece.id === kept.id)!.stepId,
    kept.stepId,
  );
});

test("missing exact target retains intent and actual member once; a same-title stage is never a replacement", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project);
  const originalTarget = guidePlacementTargets(p)[0],
    member = p.pieces[0],
    unavailable = { ownerId: uid(), stageKey: originalTarget.stageKey };
  p.steps[0].title = originalTarget.title;
  member.guidePlacement = unavailable;
  const before = JSON.stringify(p);
  const issues = guidePlacementIssues(p);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].pieceId, member.id);
  assert.deepEqual(issues[0].placement, unavailable);
  assert.equal(issues[0].code, "target-unavailable");
  const unresolved = assemblyStages(p).find(
    (stage) => stage.key === unresolvedGuidePlacementKey,
  )!;
  assert.deepEqual(unresolved.memberIds, [member.id]);
  assert.equal(JSON.stringify(p), before);
  p = generateBuildGuide(p);
  assert.deepEqual(
    p.pieces.find((piece) => piece.id === member.id)!.guidePlacement,
    unavailable,
  );
  coversOnce(p);
  p = assignGuidePlacement(p, member.id, null);
  assert.ok(
    !("guidePlacement" in p.pieces.find((piece) => piece.id === member.id)!),
  );
  assert.deepEqual(guidePlacementIssues(p), []);
  assert.equal(
    assemblyStages(p).some(
      (stage) => stage.key === unresolvedGuidePlacementKey,
    ),
    false,
  );
});

test("empty automatic tasks are removed but explicitly targeted valid base groups remain", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project),
    targets = guidePlacementTargets(p),
    carcass = targets.find((row) => row.stageKey === "carcass")!,
    shelf = targets.find((row) => row.stageKey === "shelves")!;
  for (const id of shelf.memberIds)
    p = assignGuidePlacement(p, id, choice(carcass));
  assert.equal(
    assemblyStages(p).some((stage) => stage.key === "shelves"),
    false,
  );
  assert.ok(
    guidePlacementTargets(p).some((stage) => stage.stageKey === "shelves"),
  );
  p = assignGuidePlacement(p, carcass.memberIds[0], choice(shelf));
  assert.deepEqual(
    assemblyStages(p).find((stage) => stage.key === "shelves")!.memberIds,
    [carcass.memberIds[0]],
  );
  coversOnce(p);
});

test("moving every sauna member out of its owner does not erase the explicit unbuilt-system reservation", () => {
  let p = generateBuildGuide(createBuildStudy("sauna").project);
  const extra = addCustom(p);
  p = extra.project;
  const target = guidePlacementTargets(p).find((row) => row.ownerId === p.id)!;
  for (const piece of [...p.pieces].filter(
    (piece) => piece.id !== extra.pieceId && !piece.offcut,
  ))
    p = assignGuidePlacement(p, piece.id, choice(target));
  const resolved = assemblyStages(p);
  assert.equal(resolved.length, 1);
  assert.match(resolved[0].notes, /Unbuilt systems: foundation, actual door/);
  assert.equal(resolved[0].notes.match(/Unbuilt systems:/g)?.length, 1);
  coversOnce(p);
});

test("resolver rejects duplicate coverage instead of silently losing active members", () => {
  const p = blank(),
    a = part(
      "A",
      "stud",
      [1.5, 10, 3.5],
      [0, 5, 0],
      p.steps[0].id,
      "Loose parts",
    );
  p.pieces.push(a);
  const base = baseAssemblyStages(p);
  a.guidePlacement = { ownerId: uid(), stageKey: "missing" };
  const invalid = {
    ...p,
    pieces: [...p.pieces, { ...a, id: uid(), guidePlacement: undefined }],
  };
  assert.throws(() => resolveGuidePlacements(invalid, base), /exactly once/);
});

test("assign/clear no-ops preserve object identity; intentional outer import rekeys only exact root targets", () => {
  let p = blank(),
    root = part(
      "Root member",
      "stud",
      [1.5, 10, 3.5],
      [0, 5, 0],
      p.steps[0].id,
      "Loose parts",
    );
  p.pieces.push(root);
  const target = guidePlacementTargets(p)[0];
  assert.equal(assignGuidePlacement(p, root.id, null), p);
  p = assignGuidePlacement(p, root.id, choice(target));
  assert.equal(assignGuidePlacement(p, root.id, choice(target)), p);
  const second = part(
      "Different owner",
      "stud",
      [1.5, 10, 3.5],
      [5, 5, 0],
      p.steps[0].id,
      "Loose parts",
    ),
    child = uid();
  second.guidePlacement = { ownerId: child, stageKey: target.stageKey };
  p.pieces.push(second);
  const old = structuredClone(p),
    importedId = uid(),
    imported = rekeyGuidePlacements(p, importedId);
  assert.equal(imported.id, importedId);
  assert.equal(imported.pieces[0].guidePlacement!.ownerId, importedId);
  assert.equal(imported.pieces[1].guidePlacement!.ownerId, child);
  assert.deepEqual(imported.pieces.map(physical), p.pieces.map(physical));
  assert.deepEqual(p, old);
  assert.equal(rekeyGuidePlacements(p, p.id), p);
  assert.throws(() => rekeyGuidePlacements(p, "not-an-id"));
});

test("saved generated phase ordering and manually anchored steps survive regeneration, notes and history once", () => {
  let p = completeAssemblies(
    generateBuildGuide(createBuildStudy("shelves").project),
  );
  const phases = stages(p),
    first = p.steps.indexOf(phases[0]),
    second = p.steps.indexOf(phases[1]);
  [p.steps[first], p.steps[second]] = [p.steps[second], p.steps[first]];
  const manual = step(
      "My check after shelf staging",
      "Retain this actual user step.",
    ),
    finish = p.steps.find(
      (phase) => phase.generated?.kind === "project-finish",
    )!;
  p.steps.splice(p.steps.indexOf(finish) + 1, 0, manual);
  const history = {
    id: uid(),
    at: new Date().toISOString(),
    stepId: manual.id,
    message: "User supplied order.",
  };
  p.history.push(history);
  phases[0].title = "Custom carcass title";
  phases[0].notes += "\nKeep my clamp setup.";
  const order = p.steps.map((phase) => phase.id);
  for (let i = 0; i < 4; i++)
    p = generateBuildGuide(projectSchema.parse(JSON.parse(JSON.stringify(p))));
  assert.deepEqual(
    p.steps.map((phase) => phase.id),
    order,
  );
  assert.ok(stages(p).every((phase) => phase.complete));
  assert.equal(
    p.steps
      .find((phase) => phase.id === phases[0].id)!
      .notes.match(/Keep my clamp setup/g)?.length,
    1,
  );
  assert.equal(
    p.steps.find((phase) => phase.id === phases[0].id)!.title,
    "Custom carcass title",
  );
  assert.deepEqual(p.history.at(-1), history);
  assert.ok(guideIsCurrent(p));
});

test("a new phase is inserted near canonical neighbors without changing any surviving relative order", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project);
  const phases = stages(p),
    a = p.steps.indexOf(phases[0]),
    b = p.steps.indexOf(phases[1]);
  [p.steps[a], p.steps[b]] = [p.steps[b], p.steps[a]];
  const order = p.steps.map((phase) => phase.id),
    added = addCustom(p);
  p = generateBuildGuide(added.project);
  const surviving = new Set(order);
  assert.deepEqual(
    p.steps.filter((phase) => surviving.has(phase.id)).map((phase) => phase.id),
    order,
  );
  const newPhase = p.steps.find(
    (phase) =>
      phase.id === p.pieces.find((piece) => piece.id === added.pieceId)!.stepId,
  )!;
  const finishIndex = p.steps.findIndex(
    (phase) => phase.generated?.kind === "project-finish",
  );
  assert.equal(p.steps.indexOf(newPhase), finishIndex - 1);
  assert.deepEqual(generateBuildGuide(p), p);
  coversOnce(p);
});

test("optional placement absence preserves historical physical hash and Piece keys", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/format6-remapped-storage.yardwork.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const p = projectSchema.parse(raw);
  assert.ok(p.pieces.every((piece) => !("guidePlacement" in piece)));
  assert.deepEqual(p.pieces, raw.pieces);
  assert.equal(designFingerprint(p), raw.guideFingerprint);
  assert.ok(guideIsCurrent(p));
});

test("unavailable placements of every sauna member retain its unbuilt-system review on the unresolved task", () => {
  const p = generateBuildGuide(createBuildStudy("sauna").project),
    unavailable = { ownerId: uid(), stageKey: "walls" };
  for (const piece of p.pieces.filter((piece) => !piece.offcut))
    piece.guidePlacement = { ...unavailable };
  const resolved = assemblyStages(p);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].key, unresolvedGuidePlacementKey);
  assert.match(resolved[0].notes, /Unbuilt systems: foundation, actual door/);
  assert.equal(
    guidePlacementIssues(p).length,
    p.pieces.filter((piece) => !piece.offcut).length,
  );
  coversOnce(p);
});

test("explicit member notes and phase checks do not depend on raw piece-array order", () => {
  let p = generateBuildGuide(createBuildStudy("shelves").project),
    target = guidePlacementTargets(p).find(
      (row) => row.stageKey === "carcass",
    )!;
  const extra = addCustom(p),
    second = addCustom(extra.project);
  p = assignGuidePlacement(extra.project, extra.pieceId, choice(target));
  p = {
    ...p,
    pieces: [
      ...p.pieces,
      second.project.pieces.find((piece) => piece.id === second.pieceId)!,
    ],
  };
  p = completeAssemblies(
    generateBuildGuide(assignGuidePlacement(p, second.pieceId, choice(target))),
  );
  const before = assemblyStages(p).map((stage) => ({
    ...stage,
    memberIds: [...stage.memberIds],
  }));
  p.pieces.reverse();
  assert.deepEqual(assemblyStages(p), before);
  assert.ok(stages(generateBuildGuide(p)).every((phase) => phase.complete));
});
