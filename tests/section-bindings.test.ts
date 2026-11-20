import test from "node:test";
import assert from "node:assert/strict";
import { blank, projectSchema, type Project } from "../src/model";
import { localIdeaPlan } from "../src/planning";
import { applyNewIdea, bindingReview } from "../src/ideaBindings";
import { cutPiece } from "../src/engine";
import {
  duplicateSection,
  reconcileSections,
  removeSection,
  resizeRecipeSection,
  setSectionLidOpen,
  transformSection,
} from "../src/sections";

function furnitureProject() {
  return applyNewIdea(
    blank("Bound seating"),
    localIdeaPlan({
      prompt:
        "A banquette 6 feet wide, 24 inches deep, 18 inches seat height with three sections, opening lids and no back, with storage",
    }),
  );
}
function structureProject() {
  return applyNewIdea(
    blank("Bound greenhouse"),
    localIdeaPlan({
      prompt:
        "A greenhouse 6 feet wide, 8 feet deep, 7 feet eave height with roof rise 24 inches",
    }),
  );
}
function owner(project: Project, sectionId: string) {
  const match = project.ideaBindings.flatMap((binding) =>
    binding.entries
      .filter((entry) => entry.sections.some((s) => s.sectionId === sectionId))
      .map((entry) => ({ binding, entry })),
  )[0];
  assert.ok(match, "Section should retain its applied design entry");
  return match;
}

test("rigid furniture moves preserve full bound pose and remain revisable after JSON reopening", () => {
  const original = furnitureProject(),
    before = structuredClone(original);
  const section = original.sections[0],
    bound = owner(original, section.id);
  const moved = transformSection(
    original,
    section.id,
    [36, 4, -12],
    [0.2, 0.7, -0.1],
  );
  const actual = owner(moved, section.id);
  assert.equal(actual.binding.id, bound.binding.id);
  assert.equal(actual.entry.id, bound.entry.id);
  assert.ok(actual.binding.revision > bound.binding.revision);
  assert.deepEqual(actual.entry.pose, {
    origin: [36, 4, -12],
    rotation: [0.2, 0.7, -0.1],
  });
  assert.ok(actual.entry.spec.type === "furniture");
  assert.deepEqual(actual.entry.spec.recipe.position, [36, 4, -12]);
  assert.ok(
    Math.abs(actual.entry.spec.recipe.yaw - (0.7 * 180) / Math.PI) < 0.001,
  );
  assert.equal(bindingReview(moved, actual.binding.id).manualEdits, 0);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(moved)));
  assert.deepEqual(reopened.ideaBindings, moved.ideaBindings);
  assert.equal(bindingReview(reopened, actual.binding.id).manualEdits, 0);
  assert.deepEqual(original, before);
});

test("copied edited furniture gets independent binding IDs without blessing custom cuts", () => {
  const source = furnitureProject(),
    section = source.sections[0];
  const lid = source.pieces.find(
    (p) => section.pieceIds.includes(p.id) && p.name.endsWith("seat lid"),
  )!;
  const cut = reconcileSections(cutPiece(source, lid.id, 12, 0));
  const original = owner(cut, section.id),
    bindingBefore = structuredClone(original.binding);
  assert.ok(bindingReview(cut, original.binding.id).manualEdits > 0);
  const { project: copied, sectionId } = duplicateSection(cut, section.id);
  const clone = owner(copied, sectionId);
  assert.notEqual(clone.binding.id, original.binding.id);
  assert.notEqual(clone.entry.id, original.entry.id);
  assert.deepEqual(
    copied.ideaBindings.find((b) => b.id === original.binding.id),
    bindingBefore,
  );
  assert.equal(clone.binding.entries.length, 1);
  assert.ok(bindingReview(copied, clone.binding.id).manualEdits > 0);
  const clonedSection = copied.sections.find((s) => s.id === sectionId)!;
  assert.deepEqual(clone.entry.pose.origin, clonedSection.origin);
  assert.ok(
    copied.pieces
      .filter((p) => clonedSection.pieceIds.includes(p.id))
      .every((p) => p.cutStock === null),
  );
  assert.deepEqual(
    copied.pieces.filter((p) => p.offcut),
    cut.pieces.filter((p) => p.offcut),
  );
  projectSchema.parse(copied);
});

test("deleting furniture removes only its entry and removes the application when empty", () => {
  const project = furnitureProject(),
    binding = project.ideaBindings[0];
  assert.equal(binding.entries.length, 3);
  const first = project.sections[0],
    removed = owner(project, first.id).entry.id;
  let next = removeSection(project, first.id);
  assert.equal(next.ideaBindings.length, 1);
  assert.equal(next.ideaBindings[0].entries.length, 2);
  assert.ok(
    next.ideaBindings[0].entries.every((entry) => entry.id !== removed),
  );
  for (const section of next.sections) next = removeSection(next, section.id);
  assert.deepEqual(next.ideaBindings, []);
  projectSchema.parse(next);
});

test("partial structural moves and missing roles preserve the family spec for explicit rebuild review", () => {
  const original = structureProject(),
    section = original.sections[0];
  const expected = owner(original, section.id),
    before = structuredClone(expected.entry);
  assert.ok(expected.entry.sections.length > 1);
  const moved = transformSection(original, section.id, [12, 0, 0], [0, 0, 0]);
  const changed = owner(moved, section.id);
  assert.deepEqual(changed.entry.spec, before.spec);
  assert.deepEqual(changed.entry.pose, before.pose);
  assert.ok(changed.binding.revision > expected.binding.revision);
  assert.ok(bindingReview(moved, changed.binding.id).manualEdits > 0);
  const deleted = removeSection(moved, section.id);
  assert.equal(deleted.ideaBindings[0].entries[0].id, before.id);
  assert.deepEqual(deleted.ideaBindings[0].entries[0].spec, before.spec);
  assert.ok(bindingReview(deleted, changed.binding.id).missingRoles > 0);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(deleted)));
  assert.ok(bindingReview(reopened, changed.binding.id).missingRoles > 0);
  let empty = deleted;
  for (const role of before.sections)
    if (empty.sections.some((s) => s.id === role.sectionId))
      empty = removeSection(empty, role.sectionId);
  assert.deepEqual(empty.ideaBindings, []);
});

test("copies of one structural role stay independent without changing the original binding", () => {
  const original = structureProject(),
    section = original.sections[0];
  const before = structuredClone(original.ideaBindings);
  const copied = duplicateSection(original, section.id);
  assert.deepEqual(copied.project.ideaBindings, before);
  assert.ok(
    copied.project.ideaBindings.every((b) =>
      b.entries.every((entry) =>
        entry.sections.every((role) => role.sectionId !== copied.sectionId),
      ),
    ),
  );
  projectSchema.parse(copied.project);
});

test("member deletion invalidates a guard once while retaining the expected recipe", () => {
  const original = furnitureProject(),
    section = original.sections[0];
  const before = owner(original, section.id),
    member = section.pieceIds[0];
  const next = reconcileSections({
    ...original,
    pieces: original.pieces.filter((p) => p.id !== member),
  });
  const updated = owner(next, section.id);
  assert.deepEqual(updated.entry.spec, before.entry.spec);
  assert.ok(updated.binding.revision > before.binding.revision);
  assert.ok(bindingReview(next, updated.binding.id).manualEdits > 0);
  assert.deepEqual(reconcileSections(next).ideaBindings, next.ideaBindings);
  projectSchema.parse(next);
});

test("an explicit recipe resize updates only the bound entry while retaining tilted pose", () => {
  let original = furnitureProject();
  const sectionId = original.sections[0].id;
  original = transformSection(
    original,
    sectionId,
    [24, 3, -12],
    [0.1, 0.5, -0.1],
  );
  const bound = owner(original, sectionId);
  const otherEntries = bound.binding.entries.filter(
    (e) => e.id !== bound.entry.id,
  );
  const resized = resizeRecipeSection(original, sectionId, {
    width: 30,
    depth: 25,
    height: 20,
  });
  const updated = owner(resized, sectionId);
  assert.ok(updated.entry.spec.type === "furniture");
  assert.equal(updated.entry.spec.recipe.width, 30);
  assert.equal(updated.entry.spec.recipe.depth, 25);
  assert.equal(updated.entry.spec.recipe.height, 20);
  assert.deepEqual(updated.entry.pose, bound.entry.pose);
  assert.deepEqual(
    updated.binding.entries.filter((e) => e.id !== updated.entry.id),
    otherEntries,
  );
  assert.equal(bindingReview(resized, updated.binding.id).manualEdits, 0);
  assert.ok(updated.binding.revision > bound.binding.revision);
});

test("lid previews update bound lid state without concealing unrelated manual edits", () => {
  const original = furnitureProject(),
    section = original.sections[0];
  const member = original.pieces.find(
    (p) => section.pieceIds.includes(p.id) && !p.name.endsWith("seat lid"),
  )!;
  const edited = reconcileSections({
    ...original,
    pieces: original.pieces.map((p) =>
      p.id === member.id
        ? { ...p, position: [p.position[0] + 1, p.position[1], p.position[2]] }
        : p,
    ),
  });
  const bound = owner(edited, section.id),
    manual = bindingReview(edited, bound.binding.id).manualEdits;
  assert.ok(manual > 0);
  const opened = setSectionLidOpen(edited, section.id, true),
    actual = owner(opened, section.id);
  assert.ok(actual.entry.spec.type === "furniture");
  assert.equal(actual.entry.spec.recipe.lidOpen, true);
  assert.ok(actual.binding.revision > bound.binding.revision);
  assert.equal(bindingReview(opened, actual.binding.id).manualEdits, manual);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(opened)));
  const closed = setSectionLidOpen(restored, section.id, false),
    final = owner(closed, section.id);
  assert.ok(final.entry.spec.type === "furniture");
  assert.equal(final.entry.spec.recipe.lidOpen, false);
  assert.equal(bindingReview(closed, final.binding.id).manualEdits, manual);
  assert.equal(setSectionLidOpen(closed, section.id, false), closed);
});
