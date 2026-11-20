import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  material,
  projectSchema,
  type Project,
  type V3,
} from "../src/model";
import { bounds, bom, connect, cutPiece } from "../src/engine";
import {
  buildCaseworkShelves,
  type StructureMaterials,
} from "../src/structures";
import { caseworkShelvesParamsSchema } from "../src/recipeSchemas";
import { applyIdeaPlan, ideaPlanSchema } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingReview,
  bindingToken,
  previewIdeaRevision,
} from "../src/ideaBindings";
import { reconcileSections } from "../src/sections";
import { generateBuildGuide } from "../src/guide";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
const defaults = { width: 36, depth: 16, height: 72, shelfCount: 3 };
const exact: StructureMaterials = {
  caseworkPanels: {
    materialId: "plytanium-703",
    productRegistryRef: "plytanium-bc-201428",
  },
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function open(selections: StructureMaterials = {}) {
  return createBuildStudy(
    "shelves",
    defaultBuildStudyParameters("shelves"),
    undefined,
    selections,
  ).project;
}
function resize(
  project: Project,
  patch: Partial<{
    width: number;
    depth: number;
    height: number;
    shelfCount: number;
    shelfClearance: number;
  }>,
) {
  const b = project.ideaBindings[0],
    plan = bindingPlan(project, b.id),
    idea = plan.structures[0];
  assert.equal(idea.kind, "casework-shelves");
  if (idea.kind !== "casework-shelves") throw Error("Missing saved family");
  Object.assign(idea.parameters, patch);
  return { id: b.id, plan, token: bindingToken(project, b.id) };
}
function pieceForRole(p: Project, role: string) {
  const entry = p.ideaBindings[0].entries[0],
    sectionId = entry.sections.find((m) => m.role === role)?.sectionId;
  return p.pieces.find((x) =>
    p.sections.find((s) => s.id === sectionId)?.pieceIds.includes(x.id),
  )!;
}
function noOverlap(project: Project) {
  for (let i = 0; i < project.pieces.length; i++)
    for (let j = i + 1; j < project.pieces.length; j++) {
      const a = bounds(project.pieces[i]),
        b = bounds(project.pieces[j]),
        overlap = [0, 1, 2].reduce(
          (n, k) =>
            n *
            Math.max(
              0,
              Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]),
            ),
          1,
        );
      assert.ok(
        overlap < 1e-8,
        `${project.pieces[i].name} intersects ${project.pieces[j].name}`,
      );
    }
}

test("the default whole casework study has eight physical panels in one typed family with individually editable roles", () => {
  const result = buildCaseworkShelves(blank(), defaults),
    p = result.project;
  assert.equal(p.pieces.length, 8);
  assert.equal(p.sections.length, 8);
  assert.deepEqual(Object.keys(result.geometryRoles), [
    "side-left",
    "side-right",
    "back",
    "top",
    "bottom",
    "shelf-1",
    "shelf-2",
    "shelf-3",
  ]);
  const expected: [string, V3, V3][] = [
    ["Left side", [0.75, 72, 15.25], [-17.625, 36, 0.375]],
    ["Right side", [0.75, 72, 15.25], [17.625, 36, 0.375]],
    ["Back", [36, 72, 0.75], [0, 36, -7.625]],
    ["Top", [34.5, 0.75, 15.25], [0, 71.625, 0.375]],
    ["Bottom", [34.5, 0.75, 15.25], [0, 0.375, 0.375]],
    ["Adjustable shelf 1", [34.5, 0.75, 15], [0, 18.1875, 0.25]],
    ["Adjustable shelf 2", [34.5, 0.75, 15], [0, 36, 0.25]],
    ["Adjustable shelf 3", [34.5, 0.75, 15], [0, 53.8125, 0.25]],
  ];
  for (const [name, size, position] of expected) {
    const part = p.pieces.find((x) => x.assembly === name)!;
    assert.deepEqual(part.size, size);
    assert.deepEqual(part.position, position);
  }
  noOverlap(p);
  assert.equal(result.qualifiedForConstruction, false);
  assert.equal(result.cutRequirements.length, 8);
  assert.equal(p.joints.length, 0);
  assert.ok(result.unresolved.some((x) => x.id === "casework-shelf-supports"));
  assert.ok(result.unresolved.some((x) => x.id === "casework-joinery"));
  const study = open();
  assert.equal(study.ideaBindings.length, 1);
  assert.equal(study.ideaBindings[0].entries.length, 1);
  assert.equal(study.ideaBindings[0].entries[0].spec.type, "structure");
  assert.equal(
    bindingPlan(study, study.ideaBindings[0].id).structures[0].kind,
    "casework-shelves",
  );
  assert.equal(bindingReview(study, study.ideaBindings[0].id).manualEdits, 0);
});

test("source-exact .703 panels retain fixed thickness and meet the real back with the requested front setback", () => {
  const result = buildCaseworkShelves(blank(), defaults, exact),
    p = result.project,
    t = 0.703;
  assert.ok(p.pieces.every((x) => x.material === "plytanium-703"));
  assert.equal(result.dimensions.actualPanelThickness, t);
  const shelf = p.pieces.find((x) => x.assembly === "Adjustable shelf 1")!,
    back = p.pieces.find((x) => x.assembly === "Back")!;
  assert.deepEqual(shelf.size, [36 - 2 * t, t, 16 - t - 0.25]);
  near(bounds(shelf).min[2], bounds(back).max[2]);
  near(bounds(shelf).max[2], 16 / 2 - 0.25);
  noOverlap(p);
  assert.ok(
    result.unresolved.some(
      (x) => x.id === "material.caseworkPanels.installation",
    ),
  );
});

test("overall width, height and depth regenerate coherent panel spans without scaling plywood thickness or losing selected source", () => {
  let p = open(exact);
  const before = p.ideaBindings[0],
    roleIds = new Map(
      before.entries[0].sections.map((m) => [m.role, m.sectionId]),
    ),
    stored = projectSchema.parse(JSON.parse(JSON.stringify(p))),
    change = resize(stored, { width: 42, height: 84, depth: 20 });
  p = applyIdeaRevision(stored, change.id, change.plan, change.token);
  assert.equal(p.ideaBindings[0].entries.length, 1);
  assert.equal(p.pieces.length, 8);
  for (const mapping of p.ideaBindings[0].entries[0].sections)
    assert.equal(mapping.sectionId, roleIds.get(mapping.role));
  const sizes = p.pieces.map((x) => x.size),
    t = material("plytanium-703").size[1];
  assert.deepEqual(pieceForRole(p, "side-left").size, [t, 84, 20 - t]);
  assert.deepEqual(pieceForRole(p, "back").size, [42, 84, t]);
  assert.deepEqual(pieceForRole(p, "top").size, [42 - 2 * t, t, 20 - t]);
  assert.ok(sizes.every((size) => size.includes(t)));
  assert.ok(p.pieces.every((x) => x.material === "plytanium-703"));
  assert.deepEqual(bindingPlan(p, change.id).structures[0].selections, exact);
  assert.equal(bindingReview(p, change.id).manualEdits, 0);
  noOverlap(p);
});

test("shelf count changes preserve surviving role identities and restore removed indexed roles without accumulating phases", () => {
  let p = generateBuildGuide(open());
  const initial = p.ideaBindings[0],
    originalIds = new Map(
      initial.entries[0].sections.map((m) => [m.role, m.sectionId]),
    ),
    initialSteps = p.steps.length;
  let change = resize(p, { shelfCount: 5 });
  p = applyIdeaRevision(p, change.id, change.plan, change.token);
  assert.equal(p.pieces.length, 10);
  assert.equal(p.sections.length, 10);
  const fiveIds = new Map(
      p.ideaBindings[0].entries[0].sections.map((m) => [m.role, m.sectionId]),
    ),
    maxSteps = p.steps.length;
  assert.equal(maxSteps, initialSteps + 2);
  for (const [role, id] of originalIds) assert.equal(fiveIds.get(role), id);
  for (const count of [1, 5, 2, 5]) {
    change = resize(p, { shelfCount: count });
    p = applyIdeaRevision(p, change.id, change.plan, change.token);
    assert.equal(p.pieces.length, 5 + count);
    assert.equal(p.steps.length, maxSteps);
    assert.equal(bindingReview(p, change.id).missingRoles, 0);
    for (const m of p.ideaBindings[0].entries[0].sections)
      if (p.sections.some((s) => s.id === m.sectionId))
        assert.equal(m.sectionId, fiveIds.get(m.role));
  }
});

test("manual panel cuts and connections survive adoption/reopening until an acknowledged whole-casework rebuild archives their source", () => {
  let p = open(exact);
  const shelf = pieceForRole(p, "shelf-1"),
    back = pieceForRole(p, "back"),
    left = pieceForRole(p, "side-left");
  p = reconcileSections(cutPiece(p, shelf.id, 20, 0));
  p = reconcileSections(connect(p, back.id, left.id, back.stepId));
  p = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  const before = structuredClone(p),
    loose = p.pieces.filter((x) => x.offcut),
    source = p.pieces.find((x) => x.id === shelf.id)!.cutStock,
    change = resize(p, { width: 40 });
  const preview = previewIdeaRevision(p, change.id, change.plan, change.token);
  assert.deepEqual(p, before);
  assert.equal(preview.requiresRebuild, true);
  assert.ok(preview.impact.manualEdits > 0);
  assert.equal(preview.impact.removedConnections, 1);
  assert.throws(
    () => applyIdeaRevision(p, change.id, change.plan, change.token),
    /explicitly allow/,
  );
  const rebuilt = applyIdeaRevision(p, change.id, change.plan, change.token, {
    allowRebuild: true,
  });
  assert.equal(rebuilt.pieces.find((x) => x.id === shelf.id)?.offcut, true);
  assert.deepEqual(
    rebuilt.pieces.find((x) => x.id === shelf.id)?.cutStock,
    source,
  );
  for (const spare of loose)
    assert.deepEqual(
      rebuilt.pieces.find((x) => x.id === spare.id),
      spare,
    );
  assert.equal(bindingReview(rebuilt, change.id).manualEdits, 0);
});

test("whole-family pose moves preserve panel edits and provenance while parameter rebuilds retain the current pose and custom phase notes", () => {
  let p = open(exact);
  const shelf = pieceForRole(p, "shelf-1");
  p = reconcileSections(cutPiece(p, shelf.id, 20, 0));
  const originalStock = structuredClone(
      p.pieces.find((p) => p.id === shelf.id)!.cutStock,
    ),
    originalIds = p.pieces.map((p) => p.id),
    b = p.ideaBindings[0],
    plan = bindingPlan(p, b.id);
  plan.structures[0].parameters.origin = [60, 0, 12];
  plan.structures[0].parameters.yaw = 30;
  const preview = previewIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.equal(preview.requiresRebuild, false);
  p = applyIdeaRevision(p, b.id, plan, bindingToken(p, b.id));
  assert.deepEqual(
    p.pieces.map((x) => x.id),
    originalIds,
  );
  assert.deepEqual(
    p.pieces.find((x) => x.id === shelf.id)?.cutStock,
    originalStock,
  );
  p.steps.find((s) => s.id === pieceForRole(p, "back").stepId)!.notes =
    "Keep the measured baseboard setback.";
  const change = resize(p, { height: 80 });
  p = applyIdeaRevision(p, change.id, change.plan, change.token, {
    allowRebuild: true,
  });
  assert.deepEqual(p.ideaBindings[0].entries[0].pose, {
    origin: [60, 0, 12],
    rotation: [0, Math.PI / 6, 0],
  });
  assert.ok(p.sections.every((s) => s.rotation[1] === Math.PI / 6));
  assert.ok(
    p.steps.some((s) => s.notes === "Keep the measured baseboard setback."),
  );
  assert.equal(bindingReview(p, change.id).manualEdits, 0);
});

test("impossible envelopes, shelf collisions and unqualified source selections reject without mutating the current project", () => {
  const p = blank(),
    before = structuredClone(p);
  assert.throws(() =>
    buildCaseworkShelves(p, { ...defaults, height: 1, shelfCount: 6 }),
  );
  assert.throws(() =>
    buildCaseworkShelves(p, { ...defaults, depth: 8, shelfClearance: 8 }),
  );
  assert.throws(() =>
    caseworkShelvesParamsSchema.parse({ ...defaults, shelfCount: 0 }),
  );
  assert.throws(
    () =>
      buildCaseworkShelves(p, defaults, {
        caseworkPanels: {
          materialId: "roof",
          productRegistryRef: "nonexistent",
        },
      }),
    /wood sheet/,
  );
  assert.deepEqual(p, before);
  const oversized = buildCaseworkShelves(p, { ...defaults, width: 60 }, exact);
  assert.ok(oversized.unresolved.some((x) => x.id === "stock-fit"));
  assert.ok(bom(oversized.project).some((row) => row.oversize > 0));
  assert.equal(oversized.qualifiedForConstruction, false);
});

test("legacy independently applied panel recipes retain their original bindings and are never automatically recast as whole-casework metadata", () => {
  const modules = Array.from({ length: 8 }, (_, i) => ({
    kind: "panel",
    name: `Legacy panel ${i + 1}`,
    width: 30,
    height: 0.75,
    depth: 15,
    position: [i * 2, 0, 0],
    yaw: 0,
    frameMaterial: "stud",
    panelMaterial: "plywood",
    backHeight: 0,
    levels: 1,
  }));
  const plan = ideaPlanSchema.parse({
      title: "Older eight-panel design",
      summary: "Keep all custom independent dimensions.",
      assumptions: [],
      questions: [],
      suggestions: [],
      modules,
    }),
    p = applyIdeaPlan(blank(), plan),
    before = structuredClone(p),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(reopened.ideaBindings[0].entries.length, 8);
  assert.deepEqual(
    bindingPlan(reopened, reopened.ideaBindings[0].id).structures,
    [],
  );
  assert.deepEqual(reopened, before);
});

function assertEqualOpenings(project: Project) {
  const t = pieceForRole(project, "bottom").size[1],
    top = pieceForRole(project, "top"),
    shelves = project.ideaBindings[0].entries[0].sections
      .filter(
        (m) =>
          /^shelf-\d+$/.test(m.role) &&
          project.sections.some((s) => s.id === m.sectionId),
      )
      .map((m) => pieceForRole(project, m.role))
      .sort((a, b) => a.position[1] - b.position[1]);
  let previous = bounds(pieceForRole(project, "bottom")).max[1];
  const gaps: number[] = [];
  for (const shelf of shelves) {
    gaps.push(bounds(shelf).min[1] - previous);
    previous = bounds(shelf).max[1];
    near(shelf.size[1], t);
  }
  gaps.push(bounds(top).min[1] - previous);
  assert.ok(gaps.every((g) => g > 0));
  for (const gap of gaps) near(gap, gaps[0]);
  return gaps[0];
}

test("clear shelf openings remain equal for both actual stock thicknesses across overall height and shelf-count changes", () => {
  for (const selections of [{}, exact]) {
    let p = open(selections);
    near(
      assertEqualOpenings(p),
      (72 - 5 * pieceForRole(p, "bottom").size[1]) / 4,
    );
    for (const change of [
      { height: 84, shelfCount: 5 },
      { height: 40, shelfCount: 2 },
      { height: 8, shelfCount: 6 },
    ]) {
      const revision = resize(p, change);
      p = applyIdeaRevision(p, revision.id, revision.plan, revision.token);
      assertEqualOpenings(p);
      assert.equal(bindingReview(p, revision.id).manualEdits, 0);
      noOverlap(p);
    }
  }
});

test("an eight-inch envelope with six three-quarter-inch shelves has small positive equal openings and is not falsely rejected", () => {
  const result = buildCaseworkShelves(blank(), {
    ...defaults,
    height: 8,
    shelfCount: 6,
  });
  near(result.dimensions.clearShelfOpeningHeight, 2 / 7);
  const p = createBuildStudy("shelves", {
    ...defaultBuildStudyParameters("shelves"),
    height: 8,
    shelfCount: 6,
  }).project;
  near(assertEqualOpenings(p), 2 / 7);
  assert.equal(p.pieces.length, 11);
  noOverlap(p);
  assert.equal(result.qualifiedForConstruction, false);
});
