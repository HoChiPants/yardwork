import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectSchema, type Project } from "../src/model";
import { removeSection, setSectionLidOpen } from "../src/sections";
import {
  applyHingeRemap,
  lidHingeReviews,
  previewHingeRemap,
  removeLidHingePlan,
} from "../src/hinges";
import { hingeIntentSnapshot } from "../src/hingeSchema";

const basis =
  "SYNTHETIC explicit orphan recovery to chosen actual section/member IDs; no manufactured mounting facts.";
function fixture() {
  return projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}
function orphanFixture() {
  const project = fixture(),
    old = project.lidHingePlans.find((plan) => plan.selectedForMotion)!;
  const orphan = removeSection(project, old.sectionId),
    target = orphan.sections.find((section) => section.recipe?.openingLid)!;
  const moving = orphan.pieces.find(
      (piece) =>
        target.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
    )!,
    fixed = orphan.pieces.find(
      (piece) =>
        target.pieceIds.includes(piece.id) &&
        piece.designRole === "storage-rear",
    )!;
  return { project, old, orphan, target, moving, fixed };
}
const retainedTables = (p: Project) => ({
  supplies: p.supplies,
  inventory: p.inventory,
  supplyInventory: p.supplyInventory,
  hingeStockSources: p.hingeStockSources,
  hingePlanLabels: p.hingePlanLabels,
  fastenerPlans: p.fastenerPlans,
  fastenerPlanLabels: p.fastenerPlanLabels,
  partLabels: p.partLabels,
  notes: p.notes,
  history: p.history,
});

test("section deletion preserves stale intent; deliberate orphan removal preserves every other plan and reservation", () => {
  const { project, old, orphan } = orphanFixture();
  assert.deepEqual(orphan.lidHingePlans, project.lidHingePlans);
  assert.equal(
    lidHingeReviews(orphan).find((review) => review.plan.id === old.id)!.state,
    "stale",
  );
  const removed = removeLidHingePlan(orphan, old.id);
  assert.deepEqual(
    removed.lidHingePlans,
    orphan.lidHingePlans.filter((plan) => plan.id !== old.id),
  );
  assert.deepEqual(retainedTables(removed), retainedTables(orphan));
  assert.deepEqual(removed.pieces, orphan.pieces);
  assert.deepEqual(removed.sections, orphan.sections);
  assert.ok(
    removed.hingePlanLabels.some(
      (row) => row.planId === old.id && row.label === old.label,
    ),
  );
});
test("explicit orphan mapping archives missing old refs, resets datums and disables the newly mapped mechanism", () => {
  const { old, orphan, target, moving, fixed } = orphanFixture(),
    before = JSON.stringify(orphan);
  const preview = previewHingeRemap(orphan, old.id, {
    sectionId: target.id,
    movingId: moving.id,
    fixedId: fixed.id,
    mode: "clear",
    basis,
  });
  assert.equal(
    JSON.stringify(orphan),
    before,
    "Preview must not change source intent",
  );
  const next = applyHingeRemap(orphan, preview),
    mapped = next.lidHingePlans.find((plan) => plan.id === old.id)!;
  assert.equal(mapped.sectionId, target.id);
  assert.equal(mapped.moving.pieceId, moving.id);
  assert.equal(mapped.fixed.pieceId, fixed.id);
  assert.equal(mapped.selectedForMotion, false);
  assert.equal(mapped.id, old.id);
  assert.equal(mapped.label, old.label);
  assert.equal(mapped.axis.movingA, null);
  assert.equal(mapped.axis.fixedB, null);
  assert.deepEqual(
    mapped.locations.map((location) => ({
      id: location.id,
      label: location.label,
    })),
    old.locations.map((location) => ({
      id: location.id,
      label: location.label,
    })),
  );
  assert.ok(
    mapped.locations.every(
      (location) =>
        location.entranceLocal === null &&
        location.driveLocal === null &&
        location.measurements.surfaceToTipDepth === null &&
        location.measurements.pilotDepth === null,
    ),
  );
  assert.deepEqual(
    mapped.referenceHistory.slice(0, old.referenceHistory.length),
    old.referenceHistory,
  );
  assert.deepEqual(
    mapped.referenceHistory.at(-1)!.previous,
    hingeIntentSnapshot(old),
  );
  assert.equal(mapped.referenceHistory.at(-1)!.next.selectedForMotion, false);
  assert.deepEqual(
    next.lidHingePlans.filter((plan) => plan.id !== old.id),
    orphan.lidHingePlans.filter((plan) => plan.id !== old.id),
  );
  assert.deepEqual(retainedTables(next), retainedTables(orphan));
  assert.deepEqual(next.pieces, orphan.pieces);
  assert.equal(
    lidHingeReviews(next).find((review) => review.plan.id === old.id)!.state,
    "needs-measurements",
  );
});
test("orphan recovery never guesses a target, still blocks open owners/targets, and rejects a stale preview", () => {
  const { project, old, orphan, target, moving, fixed } = orphanFixture();
  assert.throws(
    () =>
      previewHingeRemap(orphan, old.id, {
        movingId: moving.id,
        fixedId: fixed.id,
        mode: "clear",
        basis,
      }),
    /existing section/,
  );
  const oldOpen = setSectionLidOpen(project, old.sectionId, true);
  assert.throws(
    () => removeLidHingePlan(oldOpen, old.id),
    /Close the saved lid/,
  );
  assert.throws(
    () =>
      previewHingeRemap(oldOpen, old.id, {
        sectionId: target.id,
        movingId: moving.id,
        fixedId: fixed.id,
        mode: "clear",
        basis,
      }),
    /Close the saved lid/,
  );
  const targetOpen = setSectionLidOpen(orphan, target.id, true);
  assert.throws(
    () =>
      previewHingeRemap(targetOpen, old.id, {
        sectionId: target.id,
        movingId: moving.id,
        fixedId: fixed.id,
        mode: "clear",
        basis,
      }),
    /Close the saved lid/,
  );
  const preview = previewHingeRemap(orphan, old.id, {
    sectionId: target.id,
    movingId: moving.id,
    fixedId: fixed.id,
    mode: "retain-local",
    basis,
  });
  assert.deepEqual(
    preview.plan.locations.map((location) => location.entranceLocal),
    old.locations.map((location) => location.entranceLocal),
  );
  assert.ok(
    preview.plan.locations.every(
      (location) => location.measurements.surfaceToTipDepth === null,
    ),
  );
  assert.throws(
    () =>
      applyHingeRemap(
        { ...orphan, workZone: { width: 120, depth: 120, height: 96 } },
        preview,
      ),
    /project changed|Preview again/,
  );
});
test("all owners can be removed without deleting intents, and one remaining orphan can be removed deliberately", () => {
  let project = fixture();
  const plans = structuredClone(project.lidHingePlans);
  for (const section of [...project.sections])
    project = removeSection(project, section.id);
  assert.deepEqual(project.sections, []);
  assert.deepEqual(project.lidHingePlans, plans);
  const next = removeLidHingePlan(project, plans[0].id);
  assert.deepEqual(next.lidHingePlans, plans.slice(1));
  assert.deepEqual(retainedTables(next), retainedTables(project));
});

test("closed nonopening or null previous owners can release intent without relaxing target validation", () => {
  for (const variant of ["nonopening", "null"] as const) {
    const original = fixture(),
      old = original.lidHingePlans.find((plan) => plan.selectedForMotion)!;
    const project = projectSchema.parse({
      ...original,
      sections: original.sections.map((section) =>
        section.id === old.sectionId
          ? {
              ...section,
              recipe:
                variant === "null"
                  ? null
                  : {
                      ...section.recipe!,
                      kind: "panel",
                      storage: false,
                      openingLid: false,
                      lidOpen: false,
                    },
            }
          : section,
      ),
    });
    const target = project.sections.find(
        (section) => section.id !== old.sectionId && section.recipe?.openingLid,
      )!,
      moving = project.pieces.find(
        (piece) =>
          target.pieceIds.includes(piece.id) && piece.designRole === "seat-lid",
      )!,
      fixed = project.pieces.find(
        (piece) =>
          target.pieceIds.includes(piece.id) &&
          piece.designRole === "storage-rear",
      )!;
    const removed = removeLidHingePlan(project, old.id);
    assert.deepEqual(removed.pieces, project.pieces);
    assert.deepEqual(removed.sections, project.sections);
    assert.deepEqual(
      removed.lidHingePlans,
      project.lidHingePlans.filter((plan) => plan.id !== old.id),
    );
    const preview = previewHingeRemap(project, old.id, {
      sectionId: target.id,
      movingId: moving.id,
      fixedId: fixed.id,
      mode: "clear",
      basis,
    });
    const next = applyHingeRemap(project, preview),
      mapped = next.lidHingePlans.find((plan) => plan.id === old.id)!;
    assert.equal(mapped.sectionId, target.id);
    assert.equal(mapped.selectedForMotion, false);
    assert.deepEqual(
      mapped.referenceHistory.at(-1)!.previous,
      hingeIntentSnapshot(old),
    );
    assert.deepEqual(next.pieces, project.pieces);
    assert.deepEqual(retainedTables(next), retainedTables(project));
  }
});
