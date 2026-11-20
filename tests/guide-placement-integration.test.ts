import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  projectSchema,
  part,
  uid,
  type Piece,
  type Project,
  type V3,
} from "../src/model";
import { baseAssemblyStages, assemblyStages } from "../src/assemblyStages";
import {
  assignGuidePlacement,
  guidePlacementIssues,
  guidePlacementTargets,
  rekeyGuidePlacements,
} from "../src/guidePlacement";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { bom, cutPiece, inspectCutStock, KERF } from "../src/engine";
import { rotate, composeRotation } from "../src/spatial";
import { makeConnectorPlan, saveConnectorPlan } from "../src/connectors";
import {
  commitFittedStock,
  fittedStockFaces,
  previewFittedStock,
  type FittedStockSpec,
} from "../src/fittedStock";

type Family =
  "storage-banquette" | "shelves" | "closet-insert" | "greenhouse" | "sauna";
function study(family: Family): Project {
  return projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../public/examples/builds/${family}.yardwork.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}
const stageSteps = (project: Project) =>
  project.steps.filter((step) => step.generated?.kind === "assembly-stage");
const physical = ({
  stepId: _step,
  guidePlacement: _placement,
  ...piece
}: Piece) => piece;
function assertPhysicalAndPlans(before: Project, after: Project) {
  assert.deepEqual(after.pieces.map(physical), before.pieces.map(physical));
  assert.deepEqual(after.sections, before.sections);
  for (const key of [
    "fastenerPlans",
    "fastenerPlanLabels",
    "lidHingePlans",
    "hingeStockSources",
    "hingePlanLabels",
    "connectorPlans",
    "connectorPlanLabels",
    "attachmentPlans",
    "restraintPlans",
    "supplies",
    "supplyInventory",
    "inventory",
    "toolSelections",
  ] as const)
    assert.deepEqual(after[key], before[key], key);
  assert.deepEqual(
    after.joints.map(({ stepId: _step, ...joint }) => joint),
    before.joints.map(({ stepId: _step, ...joint }) => joint),
  );
  assert.deepEqual(bom(after), bom(before));
}
function assertExactlyOnce(project: Project) {
  const ids = assemblyStages(project).flatMap((stage) => stage.memberIds);
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(
    [...ids].sort(),
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => piece.id)
      .sort(),
  );
  const generated = stageSteps(project).flatMap((step) =>
    step.generated?.kind === "assembly-stage" ? step.generated.memberIds : [],
  );
  assert.deepEqual([...generated].sort(), [...ids].sort());
  for (const piece of project.pieces.filter((piece) => !piece.offcut)) {
    const step = project.steps.find((step) => step.id === piece.stepId)!;
    assert.ok(
      step.generated?.kind === "assembly-stage" &&
        step.generated.memberIds.includes(piece.id),
    );
  }
  assert.ok(guideIsCurrent(project));
}
const sourceStageKeys: Record<Family, string> = {
  "storage-banquette": "shell",
  shelves: "shelves",
  "closet-insert": "tower-shelves",
  greenhouse: "walls",
  sauna: "opening",
};
for (const family of [
  "storage-banquette",
  "shelves",
  "closet-insert",
  "greenhouse",
  "sauna",
] as const)
  test(`${family}: explicit actual-member placement changes workflow only and appears exactly once after JSON/repeated generation`, () => {
    let project = study(family);
    if (family === "greenhouse" || family === "sauna") {
      const rotation: V3 = [0.11, 0.37, -0.09];
      project = {
        ...project,
        pieces: project.pieces.map((piece) => ({
          ...piece,
          position: rotate(piece.position, rotation),
          rotation: composeRotation(rotation, piece.rotation),
        })),
      };
    }
    project = generateBuildGuide(project);
    const stages = baseAssemblyStages(project),
      source = stages.find((stage) => stage.key === sourceStageKeys[family])!,
      target = stages.find(
        (stage) => stage.ownerId === source.ownerId && stage.key !== source.key,
      )!;
    assert.ok(source && target);
    const member = project.pieces.find(
      (piece) => piece.id === source.memberIds[0],
    )!;
    if (family === "shelves" || family === "closet-insert")
      assert.equal(Math.min(...member.size), 0.703);
    const original = structuredClone(project),
      placement = { ownerId: target.ownerId, stageKey: target.key };
    assert.ok(
      guidePlacementTargets(project).some(
        (choice) =>
          choice.ownerId === target.ownerId && choice.stageKey === target.key,
      ),
    );
    const assigned = assignGuidePlacement(project, member.id, placement);
    assert.deepEqual(
      project,
      original,
      "Assignment must leave the source project unchanged",
    );
    assert.deepEqual(
      assigned.pieces.find((piece) => piece.id === member.id)!.guidePlacement,
      placement,
    );
    assertPhysicalAndPlans(project, assigned);
    const generated = generateBuildGuide(assigned),
      stage = assemblyStages(generated).find(
        (stage) => stage.ownerId === target.ownerId && stage.key === target.key,
      )!;
    assert.ok(stage.memberIds.includes(member.id));
    assert.ok(
      !assemblyStages(generated)
        .find(
          (stage) =>
            stage.ownerId === source.ownerId && stage.key === source.key,
        )!
        .memberIds.includes(member.id),
    );
    assertPhysicalAndPlans(project, generated);
    assertExactlyOnce(generated);
    assert.deepEqual(guidePlacementIssues(generated), []);
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(generated)));
    assert.deepEqual(reopened, generated);
    assert.deepEqual(generateBuildGuide(reopened), reopened);
    const cleared = generateBuildGuide(
      assignGuidePlacement(reopened, member.id, null),
    );
    assert.equal(
      Object.hasOwn(
        cleared.pieces.find((piece) => piece.id === member.id)!,
        "guidePlacement",
      ),
      false,
    );
    assert.ok(
      assemblyStages(cleared)
        .find(
          (stage) =>
            stage.ownerId === source.ownerId && stage.key === source.key,
        )!
        .memberIds.includes(member.id),
    );
    assertExactlyOnce(cleared);
  });

test("cross-owner assignment keeps the actual section/role and invalidates the destination phase when the borrowed member physically changes", () => {
  let project = generateBuildGuide(study("storage-banquette"));
  const all = baseAssemblyStages(project),
    source = all.find((stage) => stage.key === "shell")!,
    target = all.find(
      (stage) =>
        stage.ownerId !== source.ownerId && stage.key === "bottom-frame",
    )!;
  const member = project.pieces.find(
      (piece) => piece.id === source.memberIds[0],
    )!,
    original = structuredClone(project);
  for (const step of stageSteps(project)) step.complete = true;
  const targetStep = stageSteps(project).find(
    (step) =>
      step.generated?.kind === "assembly-stage" &&
      step.generated.planId === target.ownerId &&
      step.generated.stageKey === target.key,
  )!;
  targetStep.notes +=
    "\nSYNTHETIC custom access check: keep the service opening clear.";
  const savedOrder = [...project.steps].reverse();
  project = { ...project, steps: savedOrder };
  const assigned = generateBuildGuide(
    assignGuidePlacement(project, member.id, {
      ownerId: target.ownerId,
      stageKey: target.key,
    }),
  );
  assertPhysicalAndPlans(original, assigned);
  assertExactlyOnce(assigned);
  const savedIds = project.steps.map((step) => step.id),
    survivors = new Set(assigned.steps.map((step) => step.id));
  assert.deepEqual(
    assigned.steps
      .filter((step) => savedIds.includes(step.id))
      .map((step) => step.id),
    savedIds.filter((id) => survivors.has(id)),
    "Saved surviving step order is workflow intent",
  );
  const currentTarget = assigned.steps.find(
    (step) => step.id === targetStep.id,
  )!;
  assert.equal(currentTarget.complete, false);
  assert.match(currentTarget.notes, /keep the service opening clear/);
  currentTarget.complete = true;
  const beforeFingerprint = currentTarget.generated!.fingerprint;
  const moved = {
    ...assigned,
    pieces: assigned.pieces.map((piece) =>
      piece.id === member.id
        ? {
            ...piece,
            position: [
              piece.position[0] + 0.125,
              piece.position[1],
              piece.position[2],
            ] as V3,
          }
        : piece,
    ),
  };
  const changed = generateBuildGuide(moved),
    changedTarget = changed.steps.find((step) => step.id === targetStep.id)!;
  assert.notEqual(
    changedTarget.generated!.fingerprint,
    beforeFingerprint,
    "Destination scope includes the borrowed physical member",
  );
  assert.equal(changedTarget.complete, false);
  assert.match(changedTarget.notes, /keep the service opening clear/);
  assertExactlyOnce(changed);
});

test("unknown owner/stage intent survives import and is shown once unresolved without name-based rebinding", () => {
  const project = generateBuildGuide(study("shelves")),
    shelfStage = baseAssemblyStages(project).find(
      (stage) => stage.key === "shelves",
    )!,
    member = project.pieces.find(
      (piece) => piece.id === shelfStage.memberIds[0],
    )!;
  const target = baseAssemblyStages(project).find(
    (stage) => stage.key === "carcass",
  )!;
  for (const placement of [
    { ownerId: uid(), stageKey: target.key },
    { ownerId: target.ownerId, stageKey: "not-an-actual-stage" },
  ]) {
    const pending = projectSchema.parse({
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === member.id
          ? { ...piece, name: target.title, guidePlacement: placement }
          : piece,
      ),
    });
    const generated = generateBuildGuide(pending),
      unresolved = assemblyStages(generated).find(
        (stage) => stage.key === "review-unresolved-guide-placement",
      )!;
    assert.ok(unresolved.memberIds.includes(member.id));
    assert.deepEqual(
      generated.pieces.find((piece) => piece.id === member.id)!.guidePlacement,
      placement,
    );
    assert.ok(guidePlacementIssues(generated).length > 0);
    assertExactlyOnce(generated);
    assert.deepEqual(
      generateBuildGuide(
        projectSchema.parse(JSON.parse(JSON.stringify(generated))),
      ),
      generated,
    );
  }
});

test("kept cuts retain placement, genuine offcuts clear it and purchase the same source once; W/H/C/manual supply intent stays exact", () => {
  let project = projectSchema.parse(
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
  const legs = project.pieces.filter((piece) => piece.designRole === "leg");
  project = saveConnectorPlan(
    project,
    makeConnectorPlan(project, legs[0].id, legs[1].id),
  );
  const stock = part(
    "SYNTHETIC manual cut source",
    "hd-pine-1x4",
    [0.75, 96, 3.5],
    [180, 48, 0],
    project.steps[0].id,
    "Loose parts",
  );
  stock.stockLengthAxis = 1;
  project = generateBuildGuide({
    ...project,
    pieces: [...project.pieces, stock],
  });
  assert.equal(
    project.pieces.filter((piece) => piece.id !== stock.id).length,
    42,
  );
  const target = baseAssemblyStages(project).find(
    (stage) => stage.key === "bottom-frame",
  )!;
  project = assignGuidePlacement(project, stock.id, {
    ownerId: target.ownerId,
    stageKey: target.key,
  });
  const before = structuredClone(project),
    cut = cutPiece(project, stock.id, 24, 1),
    kept = cut.pieces.find((piece) => piece.id === stock.id)!,
    offcut = cut.pieces.find(
      (piece) => !project.pieces.some((old) => old.id === piece.id),
    )!;
  assert.deepEqual(project, before);
  assert.deepEqual(kept.guidePlacement, {
    ownerId: target.ownerId,
    stageKey: target.key,
  });
  assert.equal(Object.hasOwn(offcut, "guidePlacement"), false);
  assert.equal(offcut.offcut, true);
  assert.equal(kept.size[1] + offcut.size[1] + KERF, 96);
  assert.equal(kept.cutStock!.id, offcut.cutStock!.id);
  assert.ok(inspectCutStock(cut).valid.has(kept.cutStock!.id));
  const row = bom(cut).find((row) => row.id === "hd-pine-1x4")!;
  assert.equal(row.physicalStockUnits, 1);
  assert.equal(row.quantity, 1);
  for (const key of [
    "fastenerPlans",
    "fastenerPlanLabels",
    "lidHingePlans",
    "hingeStockSources",
    "hingePlanLabels",
    "connectorPlans",
    "connectorPlanLabels",
    "supplies",
    "supplyInventory",
    "inventory",
    "toolSelections",
  ] as const)
    assert.deepEqual(cut[key], project[key], key);
  for (const old of project.pieces.filter((piece) => piece.id !== stock.id))
    assert.deepEqual(
      cut.pieces.find((piece) => piece.id === old.id),
      old,
    );
  const generated = generateBuildGuide(cut);
  assertExactlyOnce(generated);
  assert.equal(
    assemblyStages(generated)
      .flatMap((stage) => stage.memberIds)
      .includes(offcut.id),
    false,
  );
  assert.throws(
    () =>
      assignGuidePlacement(generated, offcut.id, {
        ownerId: target.ownerId,
        stageKey: target.key,
      }),
    /offcut|active/i,
  );
});

test("fresh project identity rekeys only project-owned placement targets, leaving child/source references and external unresolved intent exact", () => {
  let project = generateBuildGuide(study("storage-banquette"));
  const loose = part(
    "SYNTHETIC loose board",
    "hd-pine-1x4",
    [0.75, 12, 3.5],
    [180, 6, 0],
    project.steps[0].id,
    "Loose parts",
  );
  project = { ...project, pieces: [...project.pieces, loose] };
  const target = baseAssemblyStages(project).find(
    (stage) => stage.ownerId === project.id,
  )!;
  project = assignGuidePlacement(project, loose.id, {
    ownerId: project.id,
    stageKey: target.key,
  });
  const owned = baseAssemblyStages(project).find(
      (stage) => stage.ownerId !== project.id,
    )!,
    existing = project.pieces.find((piece) => piece.id === owned.memberIds[0])!;
  project = assignGuidePlacement(project, existing.id, {
    ownerId: owned.ownerId,
    stageKey: owned.key,
  });
  const foreign = project.pieces.find(
      (piece) => piece.id !== loose.id && piece.id !== existing.id,
    )!,
    foreignPlacement = { ownerId: uid(), stageKey: "missing-external-task" };
  project = projectSchema.parse({
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === foreign.id
        ? { ...piece, guidePlacement: foreignPlacement }
        : piece,
    ),
  });
  const before = structuredClone(project),
    newId = uid(),
    copy = rekeyGuidePlacements(project, newId);
  assert.deepEqual(project, before);
  assert.equal(copy.id, newId);
  assert.deepEqual(
    copy.pieces.find((piece) => piece.id === loose.id)!.guidePlacement,
    { ownerId: newId, stageKey: target.key },
  );
  assert.deepEqual(
    copy.pieces.find((piece) => piece.id === existing.id)!.guidePlacement,
    { ownerId: owned.ownerId, stageKey: owned.key },
  );
  assert.deepEqual(
    copy.pieces.find((piece) => piece.id === foreign.id)!.guidePlacement,
    foreignPlacement,
  );
  assertPhysicalAndPlans(project, copy);
});

test("actual banquette fitted Add captures an explicit cross-owner task while retaining physical section and honest loose remnant", () => {
  const project = generateBuildGuide(
    projectSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    ),
  );
  const section = project.sections.find((section) => section.recipe?.storage)!,
    legs = project.pieces.filter(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "leg",
    );
  const frontZ = Math.max(...legs.map((piece) => piece.position[2])),
    pair = legs
      .filter((piece) => Math.abs(piece.position[2] - frontZ) < 1e-8)
      .sort((a, b) => a.position[0] - b.position[0]);
  assert.equal(pair.length, 2);
  const first = fittedStockFaces(project, pair[0].id).find(
      (face) => face.normalLocal[0] > 0.999999,
    )!,
    second = fittedStockFaces(project, pair[1].id).find(
      (face) => face.normalLocal[0] < -0.999999,
    )!;
  const source = baseAssemblyStages(project).find((stage) =>
      stage.memberIds.includes(pair[0].id),
    )!,
    target = baseAssemblyStages(project).find(
      (stage) =>
        stage.ownerId !== source.ownerId && stage.key === "bottom-frame",
    )!;
  const placement = { ownerId: target.ownerId, stageKey: target.key };
  const spec: FittedStockSpec = {
    first: first.ref,
    second: second.ref,
    datumLocal: [...first.centerLocal],
    material: "hd-pine-1x4",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: section.id,
    stepId: pair[0].stepId,
    name: "SYNTHETIC cross-owner fitted member",
    guidePlacement: placement,
  };
  const before = structuredClone(project),
    preview = previewFittedStock(project, spec),
    added = commitFittedStock(project, spec, preview);
  assert.deepEqual(project, before);
  assert.deepEqual(added, preview.project);
  const block = added.pieces.find((piece) => piece.id === preview.blockId)!,
    offcut = added.pieces.find((piece) => piece.id === preview.offcutIds[0])!;
  assert.deepEqual(block.guidePlacement, placement);
  assert.equal(Object.hasOwn(offcut, "guidePlacement"), false);
  assert.deepEqual(
    added.sections.find((current) => current.id === section.id)!.pieceIds,
    [...section.pieceIds, block.id],
  );
  assert.ok(
    !added.sections.some((section) => section.pieceIds.includes(offcut.id)),
  );
  assert.equal(block.cutStock!.id, offcut.cutStock!.id);
  assert.equal(
    bom(added).find((row) => row.id === block.material)!.physicalStockUnits,
    1,
  );
  for (const old of project.pieces)
    assert.deepEqual(
      added.pieces.find((piece) => piece.id === old.id),
      old,
    );
  for (const key of [
    "fastenerPlans",
    "fastenerPlanLabels",
    "lidHingePlans",
    "hingeStockSources",
    "hingePlanLabels",
    "connectorPlans",
    "connectorPlanLabels",
    "supplies",
    "supplyInventory",
    "inventory",
    "toolSelections",
  ] as const)
    assert.deepEqual(added[key], project[key], key);
  assert.throws(
    () =>
      commitFittedStock(
        project,
        {
          ...spec,
          guidePlacement: { ownerId: source.ownerId, stageKey: source.key },
        },
        preview,
      ),
    /changed|preview|stale/i,
  );
  const generated = generateBuildGuide(added);
  assertExactlyOnce(generated);
  assert.ok(
    assemblyStages(generated)
      .find(
        (stage) => stage.ownerId === target.ownerId && stage.key === target.key,
      )!
      .memberIds.includes(block.id),
  );
  assert.deepEqual(
    generated.pieces.find((piece) => piece.id === block.id)!.guidePlacement,
    placement,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(generated))),
    generated,
  );
});
