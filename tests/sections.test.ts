import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  blank,
  coop,
  parsePrompt,
  projectSchema,
  type Command,
  type Project,
} from "../src/model";
import { connect, cutPiece, recordChanges, validate } from "../src/engine";
import {
  createSection,
  duplicateSection,
  previewSectionCommand,
  reconcileSections,
  removeSection,
  sectionModified,
  transformSection,
  snapSectionOrigin,
} from "../src/sections";
const wall: Command = {
  type: "wall",
  width: 96,
  height: 72,
  depth: 48,
  spacing: 16,
};
const base: Command = {
  type: "foundation",
  width: 72,
  height: 48,
  depth: 48,
  spacing: 16,
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function twoSections() {
  return applyCommand(applyCommand(blank("Section study"), wall), base);
}
test("generated sections own their parts and all coop wall frames match their parameters", () => {
  for (const project of [twoSections(), coop()]) {
    projectSchema.parse(project);
    const owned = project.sections.flatMap((s) => s.pieceIds);
    assert.equal(new Set(owned).size, project.pieces.length);
    for (const section of project.sections)
      assert.equal(sectionModified(project, section), false, section.name);
  }
  const p = applyCommand(twoSections(), base);
  assert.equal(new Set(p.sections.map((s) => s.name)).size, 3);
});
test("old version 1 plans import with no invented generator metadata", () => {
  const p = twoSections();
  const legacy = { ...p } as Partial<Project>;
  delete legacy.sections;
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(imported.sections, []);
  assert.deepEqual(imported.pieces, p.pieces);
});
test("section membership rejects duplicate, shared, and orphaned references", () => {
  const p = twoSections();
  const duplicate = structuredClone(p);
  duplicate.sections[0].pieceIds.push(duplicate.sections[0].pieceIds[0]);
  assert.throws(() => projectSchema.parse(duplicate));
  const shared = structuredClone(p);
  shared.sections[0].pieceIds.push(shared.sections[1].pieceIds[0]);
  assert.throws(() => projectSchema.parse(shared));
  const orphaned = structuredClone(p);
  orphaned.sections[0].pieceIds.push(crypto.randomUUID());
  assert.throws(() => projectSchema.parse(orphaned));
  const offcut = structuredClone(p);
  offcut.pieces[0].offcut = true;
  assert.throws(() => projectSchema.parse(offcut));
});
test("section translation preserves relative positions, unrelated parts, and connection records", () => {
  const p = twoSections(),
    s = p.sections[0];
  const [plate, , stud] = p.pieces;
  p.joints = connect(p, plate.id, stud.id, plate.stepId).joints;
  const moved = transformSection(p, s.id, [24, 12, -36], [0, 0, 0]);
  for (const old of p.pieces) {
    const actual = moved.pieces.find((a) => a.id === old.id)!;
    if (s.pieceIds.includes(old.id))
      old.position.forEach((v, i) =>
        near(actual.position[i], v + [24, 12, -36][i]),
      );
    else assert.deepEqual(actual, old);
  }
  assert.deepEqual(moved.joints, p.joints);
  assert.equal(sectionModified(moved, moved.sections[0]), false);
  assert.notDeepEqual(p.sections[0].origin, moved.sections[0].origin);
});
test("rotation composes around the section anchor and repeated moves do not double-rotate parts", () => {
  const p = twoSections(),
    s = p.sections[0];
  const rotated = transformSection(p, s.id, [20, 8, 10], [0, Math.PI / 2, 0]);
  for (const old of p.pieces.filter((a) => s.pieceIds.includes(a.id))) {
    const actual = rotated.pieces.find((a) => a.id === old.id)!;
    near(actual.position[0], 20 + old.position[2]);
    near(actual.position[1], 8 + old.position[1]);
    near(actual.position[2], 10 - old.position[0]);
  }
  const back = transformSection(rotated, s.id, [0, 0, 0], [0, 0, 0]);
  p.pieces.forEach((old) =>
    old.position.forEach((v, i) =>
      near(back.pieces.find((a) => a.id === old.id)!.position[i], v),
    ),
  );
  assert.equal(sectionModified(rotated, rotated.sections[0]), false);
});
test("targeted regeneration preserves identity, transform, step, unrelated parts, and unrelated connections", () => {
  let p = twoSections();
  const s = p.sections[0],
    oldIds = new Set(s.pieceIds);
  const sectionParts = p.pieces.filter((a) => oldIds.has(a.id));
  p = connect(
    p,
    sectionParts[0].id,
    sectionParts[2].id,
    sectionParts[0].stepId,
  );
  const baseParts = p.pieces.filter((a) =>
    p.sections[1].pieceIds.includes(a.id),
  );
  p = connect(p, baseParts[0].id, baseParts[2].id, baseParts[0].stepId);
  p = transformSection(p, s.id, [20, 5, 10], [0, 0.5, 0]);
  const before = structuredClone(p);
  const next = applyCommand(p, { ...wall, width: 120 }, s.id);
  assert.equal(next.id, p.id);
  assert.equal(next.steps.length, p.steps.length);
  assert.equal(next.sections[0].id, s.id);
  assert.deepEqual(next.sections[0].origin, p.sections[0].origin);
  assert.deepEqual(next.sections[0].rotation, p.sections[0].rotation);
  assert.ok(next.sections[0].pieceIds.every((id) => !oldIds.has(id)));
  assert.ok(
    next.pieces
      .filter((a) => next.sections[0].pieceIds.includes(a.id))
      .every((a) => a.stepId === sectionParts[0].stepId),
  );
  assert.deepEqual(
    next.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)),
    p.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)),
  );
  assert.equal(next.joints.length, 1);
  assert.equal(next.joints[0].id, p.joints[1].id);
  assert.equal(sectionModified(next, next.sections[0]), false);
  assert.deepEqual(p, before);
  projectSchema.parse(next);
  assert.throws(() => applyCommand(p, base, s.id), /section type/);
  assert.throws(
    () => applyCommand(p, wall, crypto.randomUUID()),
    /Choose a generated/,
  );
});
test("targeted local prompts preserve unspecified dimensions and reject ambiguous nonnumeric edits", () => {
  assert.deepEqual(parsePrompt("make it 10 ft wide", wall), {
    ...wall,
    width: 120,
  });
  assert.deepEqual(parsePrompt("make this wall 7 ft tall", wall), {
    ...wall,
    height: 84,
  });
  assert.deepEqual(parsePrompt("24 inches on center", wall), {
    ...wall,
    spacing: 24,
  });
  assert.deepEqual(parsePrompt("make it 5 ft deep", base), {
    ...base,
    depth: 60,
  });
  assert.throws(
    () => parsePrompt("make this wall stronger", wall),
    /Include a new dimension/,
  );
  assert.throws(() => parsePrompt("make it 30 ft wide", wall));
});
test("manual part edits are identified and cuts leave the spare outside the movable section", () => {
  const p = twoSections(),
    s = p.sections[0];
  const stud = p.pieces.find(
    (a) => s.pieceIds.includes(a.id) && a.name.includes("stud"),
  )!;
  const cut = reconcileSections(cutPiece(p, stud.id, 24));
  assert.equal(sectionModified(cut, cut.sections[0]), true);
  assert.equal(cut.sections[0].pieceIds.length, s.pieceIds.length);
  const offcut = cut.pieces.find((a) => a.offcut)!;
  assert.ok(!cut.sections[0].pieceIds.includes(offcut.id));
  const moved = transformSection(cut, s.id, [12, 0, 0], [0, 0, 0]);
  assert.deepEqual(
    moved.pieces.find((a) => a.id === offcut.id),
    offcut,
  );
  projectSchema.parse(moved);
});
test("preview describes changed parts, removed connections, and incomplete stock estimates without changing the project", () => {
  let p = twoSections();
  const s = p.sections[0],
    members = p.pieces.filter((a) => s.pieceIds.includes(a.id));
  p = connect(p, members[0].id, members[2].id, members[0].stepId);
  const original = structuredClone(p);
  const preview = previewSectionCommand(p, { ...wall, width: 120 }, s.id);
  assert.equal(preview.removed, s.pieceIds.length);
  assert.equal(preview.removedConnections, 1);
  assert.ok(preview.added > preview.removed);
  assert.equal(preview.incompleteEstimate, true);
  assert.ok(preview.findings.some((f) => f.id === "stock-stud"));
  assert.deepEqual(p, original);
});
test("duplicates have independent IDs, internal connections, and their own build step", () => {
  let p = twoSections();
  const s = p.sections[0],
    members = p.pieces.filter((a) => s.pieceIds.includes(a.id));
  p = connect(p, members[0].id, members[2].id, members[0].stepId);
  const { project: copy, sectionId } = duplicateSection(p, s.id);
  const cloned = copy.sections.find((s) => s.id === sectionId)!;
  assert.ok(cloned.pieceIds.every((id) => !p.pieces.some((a) => a.id === id)));
  assert.equal(copy.steps.length, p.steps.length + 1);
  assert.equal(copy.joints.length, 2);
  assert.ok(
    cloned.pieceIds.includes(copy.joints[1].a) &&
      cloned.pieceIds.includes(copy.joints[1].b),
  );
  assert.equal(sectionModified(copy, cloned), false);
  const removed = removeSection(copy, sectionId);
  assert.deepEqual(removed.pieces, p.pieces);
  assert.deepEqual(removed.joints, p.joints);
  projectSchema.parse(removed);
});
test("legacy grouping prevents double ownership and empty groups are removed on part deletion", () => {
  const p = twoSections();
  p.sections = [];
  const result = createSection(
    p,
    p.pieces.map((a) => a.id),
    "Handmade",
  );
  assert.equal(result.project.sections.length, 1);
  assert.throws(
    () =>
      createSection(
        result.project,
        p.pieces.map((a) => a.id),
        "Second group",
      ),
    /ungrouped/,
  );
  assert.equal(
    reconcileSections({ ...result.project, pieces: [] }).sections.length,
    0,
  );
});
test("recorded regeneration operations remain assigned to the original guide step", () => {
  const p = twoSections(),
    s = p.sections[0];
  const next = recordChanges(p, applyCommand(p, { ...wall, width: 84 }, s.id));
  const stepId = p.pieces.find((a) => s.pieceIds.includes(a.id))!.stepId;
  assert.ok(next.history.length > 0);
  assert.ok(next.history.every((h) => h.stepId === stepId));
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(next))), next);
});

test("framing advice compares actual section quantities and requested layouts without claiming structural approval", () => {
  const p = applyCommand(blank(), { ...wall, spacing: 12 }),
    s = p.sections[0];
  assert.ok(validate(p).some((f) => f.id === `spacing-quantity-${s.id}`));
  const a = p.pieces.find((a) => a.name.includes("stud"))!;
  const copy = { ...structuredClone(a), id: crypto.randomUUID() };
  p.pieces.push(copy);
  s.pieceIds.push(copy.id);
  assert.ok(validate(p).some((f) => f.id === `extra-frame-${s.id}`));
  assert.ok(validate(p).some((f) => f.id === "engineering"));
});

test("whole walls snap to nearby base faces without snapping to their own parts", () => {
  const p = twoSections(),
    wall = p.sections[0],
    base = p.sections[1];
  const origin: [number, number, number] = [
    base.origin[0],
    5.1,
    base.origin[2],
  ];
  const snapped = snapSectionOrigin(p, wall.id, origin, [0, 0, 0]);
  near(snapped[1], 5.5);
  near(snapped[0], origin[0]);
  near(snapped[2], origin[2]);
  const isolated = applyCommand(blank(), { ...wall.generator!, type: "wall" });
  const untouched = snapSectionOrigin(
    isolated,
    isolated.sections[0].id,
    [100, 12, 100],
    [0, 0, 0],
  );
  assert.deepEqual(untouched, [100, 12, 100]);
});
