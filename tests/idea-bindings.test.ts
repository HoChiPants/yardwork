import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  part,
  projectSchema,
  step,
  uid,
  type Project,
} from "../src/model";
import { applyIdeaPlan, localIdeaPlan, previewIdeaPlan } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingReview,
  bindingToken,
  previewIdeaRevision,
  detachIdeaBinding,
  adoptLegacyRecipe,
} from "../src/ideaBindings";
import { currentBindingFingerprint } from "../src/ideaBindingState";
import { cutPiece, connect } from "../src/engine";
import {
  reconcileSections,
  removeSection,
  transformSection,
  duplicateSection,
  resizeRecipeSection,
} from "../src/sections";
import { generateBuildGuide } from "../src/guide";
import { createBuildStudy, buildFixtureIds } from "../src/buildFixtures";
import { addSupply } from "../src/supplies";
const seatPrompt =
  "A banquette 72 inches wide, 24 inches deep, 18 inches seat height, three sections, storage, opening lids and no back";
const seats = () =>
  applyIdeaPlan(blank(), localIdeaPlan({ prompt: seatPrompt }));
const house = () =>
  applyIdeaPlan(
    blank(),
    localIdeaPlan({
      prompt:
        "A greenhouse 72 inches wide, 96 inches deep, 84 inches eave height, roof rise 24 inches",
    }),
  );
const changedHeight = (p: Project, h = 20) => {
  const id = p.ideaBindings[0].id,
    plan = bindingPlan(p, id);
  plan.modules = plan.modules.map((m) => ({ ...m, height: h }));
  return { id, plan, token: bindingToken(p, id) };
};
function sectionParts(p: Project, id: string) {
  return p.pieces.filter((piece) =>
    p.sections.find((s) => s.id === id)?.pieceIds.includes(piece.id),
  );
}
function cutFirst(p: Project) {
  const s = p.sections[0],
    lid = sectionParts(p, s.id).find((p) => p.name.endsWith("seat lid"))!;
  return reconcileSections(cutPiece(p, lid.id, 12, 0));
}

test("initial apply binds stable entries, old project JSON defaults empty, and reopening reconstructs editable recipes", () => {
  const p = seats(),
    b = p.ideaBindings[0];
  assert.equal(p.ideaBindings.length, 1);
  assert.equal(b.entries.length, 3);
  assert.equal(new Set(b.entries.map((e) => e.id)).size, 3);
  assert.equal(bindingReview(p, b.id).manualEdits, 0);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(bindingPlan(reopened, b.id), bindingPlan(p, b.id));
  const legacy = JSON.parse(JSON.stringify(blank()));
  delete legacy.ideaBindings;
  assert.deepEqual(projectSchema.parse(legacy).ideaBindings, []);
  const r = changedHeight(reopened),
    next = applyIdeaRevision(reopened, r.id, r.plan, r.token);
  assert.equal(next.sections.length, 3);
  assert.equal(next.ideaBindings[0].id, b.id);
  assert.deepEqual(
    next.sections.map((s) => s.id),
    p.sections.map((s) => s.id),
  );
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
});

test("named section resizing preserves cut neighbors and their stock, offcuts, connections and part IDs", () => {
  let p = cutFirst(seats());
  const first = p.sections[0],
    second = p.sections[1];
  const firstParts = sectionParts(p, first.id),
    pair = firstParts.filter(
      (p) => p.name.endsWith("top rail") || p.name.endsWith("top cross rail"),
    );
  p = reconcileSections(connect(p, pair[0].id, pair[2].id, pair[0].stepId));
  const b = p.ideaBindings[0],
    beforeParts = sectionParts(p, first.id),
    beforeJoints = structuredClone(p.joints),
    offcuts = structuredClone(p.pieces.filter((p) => p.offcut));
  const plan = localIdeaPlan({
    prompt: "Make section 2 width 30 inches",
    previousPlan: bindingPlan(p, b.id),
  });
  assert.equal(plan.modules[1].width, 30);
  const preview = previewIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.equal(preview.requiresRebuild, false);
  assert.equal(preview.impact.manualEdits, 0);
  assert.equal(preview.impact.removedConnections, 0);
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.deepEqual(
    next.sections.map((s) => s.id),
    p.sections.map((s) => s.id),
  );
  const afterParts = sectionParts(next, first.id);
  assert.deepEqual(
    afterParts.map((x) => x.id),
    beforeParts.map((x) => x.id),
  );
  assert.deepEqual(
    afterParts.map((x) => [x.size, x.cutStock, x.cutPlanes]),
    beforeParts.map((x) => [x.size, x.cutStock, x.cutPlanes]),
  );
  assert.deepEqual(next.joints, beforeJoints);
  assert.deepEqual(
    next.pieces.filter((p) => p.offcut),
    offcuts,
  );
  assert.notDeepEqual(
    sectionParts(next, second.id).map((x) => x.id),
    sectionParts(p, second.id).map((x) => x.id),
  );
  assert.ok(bindingReview(next, b.id).manualEdits > 0);
});

test("manual affected parts preview nonmutating impact and backend requires rebuild acknowledgement while retaining physical stock", () => {
  const p = cutFirst(seats()),
    before = structuredClone(p),
    r = changedHeight(p),
    old = sectionParts(p, p.sections[0].id).find((p) => p.cutStock)!,
    loose = p.pieces.filter((p) => p.offcut);
  const preview = previewIdeaRevision(p, r.id, r.plan, r.token);
  assert.deepEqual(p, before);
  assert.ok(preview.impact.manualEdits > 0);
  assert.ok(preview.impact.offcuts > 0);
  assert.equal(preview.requiresRebuild, true);
  assert.throws(
    () => applyIdeaRevision(p, r.id, r.plan, r.token),
    /explicitly allow/,
  );
  const next = applyIdeaRevision(p, r.id, r.plan, r.token, {
    allowRebuild: true,
  });
  assert.equal(next.pieces.find((p) => p.id === old.id)?.offcut, true);
  assert.deepEqual(
    next.pieces.find((p) => p.id === old.id)?.cutStock,
    old.cutStock,
  );
  for (const x of loose)
    assert.deepEqual(
      next.pieces.find((p) => p.id === x.id),
      x,
    );
  assert.equal(bindingReview(next, r.id).manualEdits, 0);
});

test("stale targets reject even without reconciliation, while unrelated workspace and supplies remain preserved", () => {
  const p = seats(),
    r = changedHeight(p),
    member = p.pieces[0];
  const edited = {
    ...p,
    pieces: p.pieces.map((x) =>
      x.id === member.id
        ? { ...x, size: [1.5, 10, 3.5] as [number, number, number] }
        : x,
    ),
  };
  assert.throws(
    () => applyIdeaRevision(edited, r.id, r.plan, r.token),
    /changed while/,
  );
  let other = addSupply(
    p,
    "grk-r4-103101",
    2,
    "Frame screws",
    "Keep this note",
  );
  other = {
    ...other,
    notes: other.notes + "\nMy custom instructions",
    planLines: [{ a: [0, 0, 0], b: [12, 0, 0] }],
    workZone: { width: 240, depth: 240, height: 96 },
  };
  const next = applyIdeaRevision(other, r.id, r.plan, r.token);
  assert.deepEqual(next.supplies, other.supplies);
  assert.deepEqual(next.planLines, other.planLines);
  assert.deepEqual(next.workZone, other.workZone);
  assert.ok(next.notes.includes("My custom instructions"));
});

test("partial structural deletion stays reviewable; explicit revision restores role using its stable section ID", () => {
  const p = house(),
    b = p.ideaBindings[0],
    section = p.sections[0],
    partial = removeSection(p, section.id),
    plan = bindingPlan(partial, b.id);
  assert.ok(bindingReview(partial, b.id).missingRoles > 0);
  const spec = plan.structures[0];
  assert.equal(spec.kind, "greenhouse");
  if (spec.kind !== "greenhouse") return;
  spec.parameters.eaveHeight = 90;
  const preview = previewIdeaRevision(
    partial,
    b.id,
    plan,
    bindingToken(partial, b.id),
  );
  assert.ok(preview.impact.missingRoles > 0);
  assert.equal(preview.requiresRebuild, true);
  assert.throws(
    () => applyIdeaRevision(partial, b.id, plan, bindingToken(partial, b.id)),
    /explicitly allow/,
  );
  const next = applyIdeaRevision(
    partial,
    b.id,
    plan,
    bindingToken(partial, b.id),
    { allowRebuild: true },
  );
  assert.ok(next.sections.some((s) => s.id === section.id));
  assert.equal(bindingReview(next, b.id).missingRoles, 0);
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
});

test("full Euler furniture pose survives dimension regeneration rather than flattening to yaw", () => {
  let p = seats();
  p = transformSection(p, p.sections[0].id, [50, 4, -10], [0.2, 0.6, -0.1]);
  const b = p.ideaBindings[0],
    entry = b.entries[0],
    plan = bindingPlan(p, b.id, [entry.id]);
  plan.modules[0].height = 20;
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id), {
    entryIds: [entry.id],
  });
  assert.deepEqual(
    next.sections.find((s) => s.id === p.sections[0].id)?.rotation,
    [0.2, 0.6, -0.1],
  );
  assert.deepEqual(next.ideaBindings[0].entries[0].pose, entry.pose);
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
});

test("guide regeneration and ten parameter revisions preserve current phase IDs, custom notes and history without growing phases", () => {
  let p = seats();
  const custom = step(
    "Owner instructions",
    "Preserve the measured wall obstruction.",
  );
  p.steps.push(custom);
  p.history.push({
    id: uid(),
    at: new Date().toISOString(),
    stepId: custom.id,
    message: "Measured on site",
  });
  p.steps[1].notes = "Use my measured setback.";
  p = generateBuildGuide(p);
  p = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  const count = p.steps.length,
    history = structuredClone(p.history),
    customTexts = p.steps.map((s) => s.notes).join("\n");
  for (let i = 0; i < 10; i++) {
    const r = changedHeight(p, 19 + i);
    p = applyIdeaRevision(p, r.id, r.plan, r.token);
    assert.equal(p.steps.length, count);
    assert.equal(bindingReview(p, r.id).manualEdits, 0);
    projectSchema.parse(p);
  }
  assert.deepEqual(p.history, history);
  assert.ok(
    p.steps
      .map((s) => s.notes)
      .join("\n")
      .includes("Use my measured setback."),
  );
  assert.ok(customTexts.includes("measured wall obstruction"));
  assert.ok(p.steps.some((s) => s.notes.includes("measured wall obstruction")));
  assert.equal((p.notes.match(/Planning review/g) || []).length, 1);
});

test("three to four seat repartition preserves surviving entry IDs once and creates a fresh fourth identity", () => {
  const p = seats(),
    b = p.ideaBindings[0],
    plan = localIdeaPlan({
      prompt: "Make four sections",
      previousPlan: bindingPlan(p, b.id),
    });
  assert.equal(plan.modules.length, 4);
  assert.equal(
    new Set(plan.modules.filter((m) => m.entryId).map((m) => m.entryId)).size,
    3,
  );
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.equal(next.ideaBindings[0].entries.length, 4);
  assert.deepEqual(
    next.ideaBindings[0].entries.slice(0, 3).map((e) => e.id),
    b.entries.map((e) => e.id),
  );
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
});

test("selected entry revision cannot mutate siblings and caller entry IDs never approve or replace outside selected scope", () => {
  const p = seats(),
    b = p.ideaBindings[0],
    entry = b.entries[1],
    plan = bindingPlan(p, b.id, [entry.id]);
  plan.modules[0].height = 22;
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id), {
    entryIds: [entry.id],
  });
  assert.deepEqual(
    sectionParts(next, p.sections[0].id),
    sectionParts(p, p.sections[0].id),
  );
  assert.deepEqual(
    sectionParts(next, p.sections[2].id),
    sectionParts(p, p.sections[2].id),
  );
  assert.throws(
    () =>
      previewIdeaRevision(
        p,
        b.id,
        bindingPlan(p, b.id),
        bindingToken(p, b.id),
        { entryIds: [entry.id] },
      ),
    /outside/,
  );
  const forged = structuredClone(plan);
  forged.modules[0].entryId = uid();
  assert.throws(
    () =>
      previewIdeaRevision(p, b.id, forged, bindingToken(p, b.id), {
        entryIds: [entry.id],
      }),
    /outside/,
  );
});

test("manual comparisons regenerate geometry and do not accept a forged imported guard fingerprint as approval", () => {
  const p = cutFirst(seats()),
    b = p.ideaBindings[0];
  b.currentFingerprint = currentBindingFingerprint(p, b);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.ok(bindingReview(reopened, b.id).manualEdits > 0);
  const r = changedHeight(reopened);
  assert.equal(
    previewIdeaRevision(reopened, r.id, r.plan, r.token).requiresRebuild,
    true,
  );
});

test("duplicate unedited furniture and same-kind structures with generated unique names remain clean", () => {
  let p = seats();
  const copied = duplicateSection(p, p.sections[0].id);
  assert.equal(
    bindingReview(copied.project, copied.project.ideaBindings.at(-1)!.id)
      .manualEdits,
    0,
  );
  p = house();
  const proposal = localIdeaPlan({
    prompt:
      "A greenhouse 72 inches wide, 96 inches deep, 84 inches eave height",
  });
  proposal.structures[0].parameters.origin = [150, 0, 0];
  p = applyIdeaPlan(p, proposal);
  assert.equal(p.ideaBindings.length, 2);
  for (const b of p.ideaBindings)
    assert.equal(bindingReview(p, b.id).manualEdits, 0);
});

test("all five study openings record reconstructable recipes with actual product selections", () => {
  for (const id of buildFixtureIds) {
    const p = createBuildStudy(id).project;
    assert.equal(p.ideaBindings.length, 1, id);
    assert.equal(bindingReview(p, p.ideaBindings[0].id).manualEdits, 0, id);
    assert.ok(
      bindingPlan(
        projectSchema.parse(JSON.parse(JSON.stringify(p))),
        p.ideaBindings[0].id,
      ),
    );
  }
});

test("pure pose and lid preview changes preserve edited lid identities and lineage without destructive rebuild", () => {
  const p = cutFirst(seats()),
    b = p.ideaBindings[0],
    first = b.entries[0],
    plan = bindingPlan(p, b.id, [first.id]),
    lid = sectionParts(p, p.sections[0].id).find((p) =>
      p.name.endsWith("seat lid"),
    )!;
  plan.modules[0].lidOpen = true;
  plan.modules[0].position = [100, 0, 0];
  const preview = previewIdeaRevision(p, b.id, plan, bindingToken(p, b.id), {
    entryIds: [first.id],
  });
  assert.equal(preview.requiresRebuild, false);
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id), {
      entryIds: [first.id],
    }),
    actual = next.pieces.find((p) => p.id === lid.id)!;
  assert.deepEqual(actual.size, lid.size);
  assert.deepEqual(actual.cutStock, lid.cutStock);
  assert.deepEqual(actual.cutPlanes, lid.cutPlanes);
  assert.ok(actual.rotation[0] < -1);
  assert.ok(bindingReview(next, b.id).manualEdits > 0);
});

test("current narrative reflects recipe dimensions/lids after section changes while preserving unknown manufacturer instructions", () => {
  let p = seats();
  p = resizeRecipeSection(p, p.sections[0].id, {
    width: 30,
    depth: 25,
    height: 21,
  });
  const b = p.ideaBindings[0];
  b.assumptions.push(
    "Manufacturer requirement: keep the exact specified fastener pattern.",
  );
  const plan = bindingPlan(p, b.id);
  assert.ok(plan.summary.includes("21"));
  assert.ok(plan.summary.includes("25"));
  assert.ok(
    plan.assumptions.includes(
      "Manufacturer requirement: keep the exact specified fastener pattern.",
    ),
  );
});

test("detaching removes only binding metadata and clean legacy adoption does not regenerate pieces", () => {
  const p = seats(),
    b = p.ideaBindings[0],
    detached = detachIdeaBinding(p, b.id, [b.entries[0].id]);
  assert.deepEqual(detached.pieces, p.pieces);
  assert.equal(detached.ideaBindings[0].entries.length, 2);
  const adopted = adoptLegacyRecipe(detached, p.sections[0].id);
  assert.deepEqual(adopted.pieces, p.pieces);
  assert.equal(adopted.ideaBindings.length, 2);
  assert.throws(() => adoptLegacyRecipe(adopted, p.sections[0].id), /already/);
});

test("preview includes unpriced supplies and exact-stock choices in incomplete estimate", () => {
  const base = { ...blank(), retailer: "lowes" as const },
    p = addSupply(base, "national-n208-637-lid-support", 1, "Support");
  const preview = previewIdeaPlan(
    p,
    localIdeaPlan({
      prompt: "A bench 48 inches wide,24 inches deep,18 inches high",
    }),
  );
  assert.equal(preview.incompleteEstimate, true);
  assert.deepEqual(preview.project.supplies, p.supplies);
});

test("append during saved revision retains untouched originals rather than regenerating them", () => {
  const p = seats(),
    b = p.ideaBindings[0],
    plan = localIdeaPlan({
      prompt: "Add shelves 36 inches wide, 12 inches deep, 48 inches high",
      previousPlan: bindingPlan(p, b.id),
    });
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.equal(next.ideaBindings[0].entries.length, 4);
  for (const s of p.sections)
    assert.deepEqual(sectionParts(next, s.id), sectionParts(p, s.id));
  assert.equal(next.sections.length, 4);
});

test("affected connection removal is explicit and unrelated loose parts and settings survive targeted rebuild", () => {
  let p = seats();
  const s = p.sections[0],
    parts = sectionParts(p, s.id),
    pair = parts.filter(
      (p) => p.name.endsWith("top rail") || p.name.endsWith("top cross rail"),
    );
  p = reconcileSections(connect(p, pair[0].id, pair[2].id, pair[0].stepId));
  const loose = part(
    "Keep loose",
    "stud",
    [1.5, 24, 3.5],
    [200, 12, 0],
    p.steps[0].id,
    "Loose parts",
  );
  p.pieces.push(loose);
  const r = changedHeight(p),
    preview = previewIdeaRevision(p, r.id, r.plan, r.token);
  assert.equal(preview.impact.removedConnections, 1);
  assert.equal(preview.requiresRebuild, true);
  const next = applyIdeaRevision(p, r.id, r.plan, r.token, {
    allowRebuild: true,
  });
  assert.deepEqual(
    next.pieces.find((p) => p.id === loose.id),
    loose,
  );
  assert.equal(next.joints.length, 0);
});

test("selected preview extent and count exclude unrelated bound entries outside the work zone", () => {
  let p = seats();
  p = transformSection(p, p.sections[2].id, [200, 0, 0], [0, 0, 0]);
  p.workZone = { width: 96, depth: 48, height: 48 };
  const b = p.ideaBindings[0],
    selected = b.entries[0],
    plan = bindingPlan(p, b.id, [selected.id]);
  plan.modules[0].height = 20;
  const preview = previewIdeaRevision(p, b.id, plan, bindingToken(p, b.id), {
    entryIds: [selected.id],
  });
  assert.equal(preview.addedParts, 14);
  assert.equal(preview.max[0] - preview.min[0], 24);
  assert.equal(preview.workZoneFits, true);
  assert.deepEqual(
    sectionParts(preview.project, p.sections[2].id),
    sectionParts(p, p.sections[2].id),
  );
});

test("saved greenhouse refinement retains entry identity, selected products and flute direction after a guide roundtrip", () => {
  const study = createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseGlazing: {
      materialId: "sunlite-8mm",
      productRegistryRef: "sunlite-132506",
    },
  });
  let p = generateBuildGuide(study.project);
  p = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  const b = p.ideaBindings[0],
    plan = localIdeaPlan({
      prompt: "Make the greenhouse 90 inches eave height",
      previousPlan: bindingPlan(p, b.id),
    });
  assert.equal(plan.structures[0].entryId, b.entries[0].id);
  const next = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.equal(next.ideaBindings[0].entries.length, 1);
  assert.equal(next.ideaBindings[0].entries[0].id, b.entries[0].id);
  assert.ok(next.pieces.some((p) => p.material === "sunlite-8mm"));
  assert.ok(
    next.pieces
      .filter((p) => p.material === "sunlite-8mm")
      .every((p) => p.stockLengthAxis === 1),
  );
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
});

test("legacy cut adoption binds metadata without changing physical work; reopening still requires acknowledgement for destructive revision", () => {
  let legacy = cutFirst(seats());
  legacy = {
    ...legacy,
    ideaBindings: [],
    sections: legacy.sections.map((section) => {
      const recipe = section.recipe!;
      const { entryId: _oldId, ...stored } = recipe;
      return { ...section, recipe: stored };
    }),
  };
  const first = legacy.sections[0],
    members = sectionParts(legacy, first.id),
    rails = members.filter(
      (p) => p.name.endsWith("top rail") || p.name.endsWith("top cross rail"),
    );
  legacy = projectSchema.parse(
    connect(legacy, rails[0].id, rails[2].id, rails[0].stepId),
  );
  const before = JSON.stringify({ ...legacy, ideaBindings: [] }),
    cut = members.find((p) => p.cutStock)!,
    offcuts = legacy.pieces.filter((p) => p.offcut),
    adopted = adoptLegacyRecipe(legacy, first.id);
  assert.equal(
    JSON.stringify({ ...adopted, ideaBindings: [] }),
    before,
    "Adoption changes only saved-design metadata.",
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(adopted))),
    b = reopened.ideaBindings[0],
    review = bindingReview(reopened, b.id);
  assert.ok(review.manualEdits > 0);
  assert.equal(review.affectedConnections, 1);
  assert.equal(review.offcuts, offcuts.length);
  const plan = bindingPlan(reopened, b.id);
  plan.modules[0].height = 20;
  const token = bindingToken(reopened, b.id),
    preview = previewIdeaRevision(reopened, b.id, plan, token);
  assert.equal(preview.requiresRebuild, true);
  assert.ok(preview.impact.manualEdits > 0);
  assert.equal(preview.impact.removedConnections, 1);
  assert.throws(
    () => applyIdeaRevision(reopened, b.id, plan, token),
    /explicitly allow/,
  );
  const next = applyIdeaRevision(reopened, b.id, plan, token, {
    allowRebuild: true,
  });
  assert.equal(next.pieces.find((p) => p.id === cut.id)?.offcut, true);
  assert.deepEqual(
    next.pieces.find((p) => p.id === cut.id)?.cutStock,
    cut.cutStock,
  );
  for (const offcut of offcuts)
    assert.deepEqual(
      next.pieces.find((p) => p.id === offcut.id),
      offcut,
    );
  assert.equal(next.ideaBindings[0].id, b.id);
  assert.equal(bindingReview(next, b.id).manualEdits, 0);
  assert.deepEqual(
    sectionParts(next, legacy.sections[1].id),
    sectionParts(legacy, legacy.sections[1].id),
  );
});
