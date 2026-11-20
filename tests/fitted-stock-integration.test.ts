import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyCommand,
  blank,
  material,
  projectSchema,
  type Piece,
  type Project,
  type V3,
} from "../src/model";
import {
  commitFittedStock,
  fittedStockFaces,
  previewFittedStock,
  type FittedStockSpec,
  type FittedStockPreview,
} from "../src/fittedStock";
import {
  bom,
  cutPiece,
  guideMarkdown,
  inspectCutStock,
  KERF,
  recordChanges,
} from "../src/engine";
import { cuttingAxes } from "../src/cutPlan";
import { cutInstructions } from "../src/cutInstructions";
import { composeRotation, rotate } from "../src/spatial";
import { ensurePartLabels, retainPartLabelHistory } from "../src/partLabels";
import {
  recipeModified,
  reconcileSections,
  sectionModified,
} from "../src/sections";
import {
  bindingPlan,
  bindingReview,
  bindingToken,
  previewIdeaRevision,
  applyIdeaRevision,
} from "../src/ideaBindings";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { makeConnectorPlan, saveConnectorPlan } from "../src/connectors";
import { ProjectStore } from "../server/storage";

type Family =
  "storage-banquette" | "shelves" | "closet-insert" | "greenhouse" | "sauna";
const stockId = "hd-pine-1x4" as const;
const near = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const subtract = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
function readStudy(id: Family): Project {
  return projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../public/examples/builds/${id}.yardwork.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
}
function structuralEntry(p: Project) {
  const entry = p.ideaBindings
    .flatMap((binding) => binding.entries)
    .find((entry) => entry.spec.type === "structure");
  assert.ok(entry);
  return entry;
}
function membersForRole(p: Project, role: string) {
  const ref = structuralEntry(p).sections.find(
    (section) => section.role === role,
  );
  assert.ok(ref, role);
  const section = p.sections.find((section) => section.id === ref.sectionId)!;
  return {
    section,
    pieces: p.pieces.filter((piece) => section.pieceIds.includes(piece.id)),
  };
}
function actualPair(
  p: Project,
  id: Family,
): {
  first: Piece;
  second: Piece;
  sectionId: string;
  localHeight: number;
  expectedSpan: number;
} {
  if (id === "storage-banquette") {
    const section = p.sections.find((section) => section.recipe?.storage)!;
    const legs = p.pieces.filter(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "leg",
    );
    const front = Math.max(...legs.map((piece) => piece.position[2]));
    const pair = legs
      .filter((piece) => Math.abs(piece.position[2] - front) < 1e-8)
      .sort((a, b) => a.position[0] - b.position[0]);
    assert.equal(pair.length, 2);
    return {
      first: pair[0],
      second: pair[1],
      sectionId: section.id,
      localHeight: 0,
      expectedSpan: 19.594,
    };
  }
  if (id === "shelves") {
    const a = membersForRole(p, "side-left"),
      b = membersForRole(p, "side-right");
    assert.equal(a.pieces[0].size[0], 0.703);
    assert.equal(b.pieces[0].size[0], 0.703);
    return {
      first: a.pieces[0],
      second: b.pieces[0],
      sectionId: a.section.id,
      localHeight: 60 - a.pieces[0].position[1],
      expectedSpan: 47.75 - 2 * 0.703,
    };
  }
  if (id === "closet-insert") {
    const { section, pieces } = membersForRole(p, "casework-panels");
    const first = pieces.find((piece) => piece.designRole === "tower-left")!,
      second = pieces.find((piece) => piece.designRole === "tower-right")!;
    assert.equal(first.size[0], 0.703);
    return {
      first,
      second,
      sectionId: section.id,
      localHeight: 74 - first.position[1],
      expectedSpan: 25,
    };
  }
  const { section, pieces } = membersForRole(p, "wall-framing");
  const uprights = pieces.filter(
    (piece) =>
      piece.size[1] > 60 &&
      piece.size[0] === 1.5 &&
      piece.size[2] === 3.5 &&
      piece.rotation.every((n) => Math.abs(n) < 1e-10),
  );
  const rear = Math.min(...uprights.map((piece) => piece.position[2]));
  const pair = uprights
    .filter((piece) => Math.abs(piece.position[2] - rear) < 1e-8)
    .sort((a, b) => a.position[0] - b.position[0]);
  assert.ok(pair.length > 2);
  return {
    first: pair[0],
    second: pair[1],
    sectionId: section.id,
    localHeight: 0,
    expectedSpan: 13.75,
  };
}
function specFor(
  p: Project,
  pair: ReturnType<typeof actualPair>,
): FittedStockSpec {
  const a = fittedStockFaces(p, pair.first.id).find(
      (face) => dot(face.normalLocal, [1, 0, 0]) > 1 - 1e-9,
    ),
    b = fittedStockFaces(p, pair.second.id).find(
      (face) => dot(face.normalLocal, [-1, 0, 0]) > 1 - 1e-9,
    );
  assert.ok(a && b);
  // Deliberately enter this center/height; selecting a face alone supplies no datum.
  const datum = [...a.centerLocal] as V3;
  datum[1] = pair.localHeight;
  return {
    first: a.ref,
    second: b.ref,
    datumLocal: datum,
    material: stockId,
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: pair.sectionId,
    stepId: pair.first.stepId,
    name: "SYNTHETIC fitted stock · geometry only",
  };
}
function ordinaryAdd(
  p: Project,
  spec: FittedStockSpec,
  preview: FittedStockPreview,
): Project {
  const exact = commitFittedStock(p, spec, preview);
  assert.deepEqual(exact, preview.project);
  return projectSchema.parse(
    ensurePartLabels(recordChanges(p, reconcileSections(exact))),
  );
}
function assertOldPartsAndIntent(before: Project, after: Project) {
  for (const piece of before.pieces)
    assert.deepEqual(
      after.pieces.find((current) => current.id === piece.id),
      piece,
    );
  for (const key of [
    "joints",
    "fastenerPlans",
    "fastenerPlanLabels",
    "connectorPlans",
    "connectorPlanLabels",
    "lidHingePlans",
    "hingeStockSources",
    "hingePlanLabels",
    "attachmentPlans",
    "restraintPlans",
    "supplies",
    "supplyInventory",
    "inventory",
    "toolSelections",
  ] as const)
    assert.deepEqual(after[key], before[key], key);
}
function assertSource(p: Project, preview: FittedStockPreview) {
  const block = p.pieces.find((piece) => piece.id === preview.blockId)!;
  const row = bom(p).find((row) => row.id === stockId)!;
  assert.equal(block.stockLengthAxis, 1);
  assert.equal(cuttingAxes(block)[0], 1);
  assert.equal(block.size[0], 0.75);
  assert.equal(block.size[2], 3.5);
  near(block.size[1], preview.cutLength);
  assert.deepEqual(block.cutPlanes, []);
  assert.equal(block.designRole, undefined);
  assert.equal(row.physicalStockUnits, 1);
  assert.equal(row.quantity, 1);
  assert.equal(row.oversize, 0);
  assert.equal(row.unpriced, true);
  assert.equal(row.inventory, undefined);
  const lineage = inspectCutStock(p);
  assert.equal(lineage.invalid.length, 0);
  const instructions = cutInstructions(block, {
    kerf: KERF,
    lineageStatus: preview.sourceId ? "validated" : "unverified",
  });
  assert.equal(instructions.stockAxes.length, "Y");
  near(instructions.centerline!.length, preview.cutLength);
  if (preview.sourceId) {
    assert.ok(lineage.valid.has(preview.sourceId));
    assert.equal(block.cutStock?.id, preview.sourceId);
    assert.deepEqual(block.cutStock?.size, material(stockId).size);
    assert.deepEqual(block.cutStock?.offset, [0, 0, 0]);
    assert.equal(row.bins[0].sourceId, preview.sourceId);
    assert.equal(instructions.source?.id, preview.sourceId);
    assert.equal(instructions.source?.status, "validated");
    assert.deepEqual(instructions.source?.size, material(stockId).size);
  } else {
    assert.equal(block.cutStock, null);
    assert.equal(instructions.source, null);
  }
  for (const axis of [0, 2])
    near(block.size[axis], material(stockId).size[axis]);
  return block;
}
function rigidCopy(p: Project): Project {
  const rotation: V3 = [0.23, 0.41, -0.19],
    offset: V3 = [19, 8, -11];
  const point = (v: V3) =>
    rotate(v, rotation).map((n, i) => n + offset[i]) as V3;
  return projectSchema.parse({
    ...p,
    pieces: p.pieces.map((piece) => ({
      ...piece,
      position: point(piece.position),
      rotation: composeRotation(rotation, piece.rotation),
    })),
    sections: p.sections.map((section) => ({
      ...section,
      origin: point(section.origin),
      rotation: composeRotation(rotation, section.rotation),
    })),
    ideaBindings: p.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) => ({
        ...entry,
        pose: {
          origin: point(entry.pose.origin),
          rotation: composeRotation(rotation, entry.pose.rotation),
        },
      })),
    })),
    guideFingerprint: null,
  });
}

for (const family of [
  "storage-banquette",
  "shelves",
  "closet-insert",
  "greenhouse",
  "sauna",
] as const) {
  test(`${family}: actual face fit adds one real source, loose remnant and custom section member; old geometry/intent stay exact`, () => {
    const original = readStudy(family),
      selected = actualPair(original, family),
      p =
        family === "greenhouse" || family === "sauna"
          ? rigidCopy(original)
          : original,
      pair = {
        ...selected,
        first: p.pieces.find((piece) => piece.id === selected.first.id)!,
        second: p.pieces.find((piece) => piece.id === selected.second.id)!,
      },
      spec = specFor(p, pair),
      raw = JSON.stringify(p),
      preview = previewFittedStock(p, spec);
    near(preview.span, selected.expectedSpan);
    near(preview.cutLength, selected.expectedSpan);
    near(preview.sourceLength, 96);
    near(preview.kerfLoss, KERF);
    assert.equal(preview.offcutIds.length, 1);
    assert.equal(
      JSON.stringify(p),
      raw,
      "Canceled private preview must leave every input byte unchanged",
    );
    const added = ordinaryAdd(p, spec, preview),
      block = assertSource(added, preview),
      offcut = added.pieces.find((piece) => piece.id === preview.offcutIds[0])!;
    assertOldPartsAndIntent(p, added);
    assert.equal(added.pieces.length, p.pieces.length + 2);
    assert.equal(offcut.offcut, true);
    assert.equal(offcut.cutStock?.id, block.cutStock?.id);
    near(offcut.size[1] + block.size[1] + KERF, 96);
    near(offcut.cutStock!.offset[1], block.size[1] + KERF);
    const section = added.sections.find(
      (section) => section.id === spec.sectionId,
    )!;
    assert.deepEqual(section.pieceIds, [
      ...p.sections.find((section) => section.id === spec.sectionId)!.pieceIds,
      block.id,
    ]);
    assert.ok(
      !added.sections.some((section) => section.pieceIds.includes(offcut.id)),
    );
    assert.deepEqual(
      section.recipe,
      p.sections.find((original) => original.id === section.id)!.recipe,
    );
    assert.deepEqual(
      section.generator,
      p.sections.find((original) => original.id === section.id)!.generator,
    );
    const owner = added.ideaBindings.find((binding) =>
      binding.entries.some((entry) =>
        entry.sections.some((ref) => ref.sectionId === section.id),
      ),
    )!;
    assert.ok(bindingReview(added, owner.id).manualPartIds.includes(block.id));
    if (section.recipe) assert.equal(recipeModified(added, section), true);
    const regenerated = generateBuildGuide(added);
    assert.ok(guideIsCurrent(regenerated));
    assertOldPartsAndIntent(p, regenerated);
    assert.match(guideMarkdown(regenerated), /SYNTHETIC fitted stock/);
    assert.match(guideMarkdown(regenerated), /Recorded offcuts/);
    const imported = projectSchema.parse(
      JSON.parse(JSON.stringify(regenerated)),
    );
    assert.deepEqual(imported, regenerated);
    assertSource(imported, preview);
  });
}

test("independent end clearances change only the fitted length and endpoints, preserving actual .703-in sides", () => {
  const p = readStudy("shelves"),
    pair = actualPair(p, "shelves"),
    spec = { ...specFor(p, pair), clearanceA: 0.0625, clearanceB: 0.125 },
    preview = previewFittedStock(p, spec),
    added = commitFittedStock(p, spec, preview),
    block = assertSource(added, preview),
    axis: V3 = [0, 1, 0],
    direction = rotate(axis, block.rotation),
    start = block.position.map(
      (n, i) => n - (direction[i] * preview.cutLength) / 2,
    ) as V3,
    end = block.position.map(
      (n, i) => n + (direction[i] * preview.cutLength) / 2,
    ) as V3;
  near(preview.cutLength, pair.expectedSpan - 0.0625 - 0.125);
  near(
    dot(
      subtract(start, preview.firstFace.centerWorld),
      preview.firstFace.normalWorld,
    ),
    0.0625,
  );
  near(
    dot(
      subtract(preview.secondFace.centerWorld, end),
      preview.firstFace.normalWorld,
    ),
    0.125,
  );
  assert.equal(
    added.pieces.find((piece) => piece.id === pair.first.id)!.size[0],
    0.703,
  );
  assert.equal(
    added.pieces.find((piece) => piece.id === pair.second.id)!.size[0],
    0.703,
  );
});

for (const waste of [0, KERF / 2, KERF]) {
  test(`SYNTHETIC shelf opening variant: ${waste} in end waste preserves source purchases without a fake remnant`, () => {
    const p = readStudy("shelves"),
      pair = actualPair(p, "shelves");
    // Explicit synthetic opening change, not a claim about the unchanged public fixture.
    pair.second.position[0] =
      pair.first.position[0] +
      pair.first.size[0] / 2 +
      96 -
      waste +
      pair.second.size[0] / 2;
    const before = structuredClone(p),
      spec = specFor(p, pair),
      preview = previewFittedStock(p, spec),
      added = ordinaryAdd(p, spec, preview),
      block = assertSource(added, preview);
    near(preview.cutLength, 96 - waste);
    near(preview.kerfLoss, waste);
    assert.deepEqual(preview.offcutIds, []);
    assert.equal(added.pieces.length, p.pieces.length + 1);
    assert.equal(
      added.pieces.filter((piece) => piece.offcut).length,
      p.pieces.filter((piece) => piece.offcut).length,
    );
    assert.equal(preview.sourceId === null, waste === 0);
    assert.equal(block.cutStock === null, waste === 0);
    assertOldPartsAndIntent(before, added);
    assert.equal(
      added.partLabels.filter((row) => row.label.startsWith("O")).length,
      p.partLabels.filter((row) => row.label.startsWith("O")).length,
    );
  });
}

test("recutting the accepted block reuses its exact source, while ordinary Undo retains labels without duplicating purchases", () => {
  const p = readStudy("shelves"),
    spec = specFor(p, actualPair(p, "shelves")),
    preview = previewFittedStock(p, spec),
    added = ordinaryAdd(p, spec, preview),
    recut = cutPiece(
      added,
      preview.blockId,
      preview.cutLength - 1,
      preview.stockLengthAxis,
    );
  assert.equal(inspectCutStock(recut).invalid.length, 0);
  assert.equal(
    bom(recut).find((row) => row.id === stockId)!.physicalStockUnits,
    1,
  );
  assert.equal(
    new Set(
      recut.pieces
        .filter((piece) => piece.material === stockId)
        .map((piece) => piece.cutStock?.id),
    ).size,
    1,
  );
  assert.equal(
    recut.pieces.filter((piece) => piece.material === stockId).length,
    3,
  );
  const undone = retainPartLabelHistory(p, added);
  assert.deepEqual(undone.pieces, p.pieces);
  assert.equal(
    bom(undone).some((row) => row.id === stockId),
    false,
  );
  assert.ok(undone.partLabels.some((row) => row.partId === preview.blockId));
  const redone = retainPartLabelHistory(added, undone);
  assert.deepEqual(redone.pieces, added.pieces);
  assert.equal(
    bom(redone).find((row) => row.id === stockId)!.physicalStockUnits,
    1,
  );
});

test("a fitted custom banquette member keeps generated-recipe rebuild acknowledgement rather than acquiring a role", () => {
  const p = readStudy("storage-banquette"),
    pair = actualPair(p, "storage-banquette"),
    spec = specFor(p, pair),
    preview = previewFittedStock(p, spec),
    added = ordinaryAdd(p, spec, preview),
    binding = added.ideaBindings[0],
    plan = bindingPlan(added, binding.id);
  plan.modules[0].height += 1;
  const token = bindingToken(added, binding.id),
    revision = previewIdeaRevision(added, binding.id, plan, token);
  assert.equal(revision.requiresRebuild, true);
  assert.ok(revision.impact.manualPartIds.includes(preview.blockId));
  assert.ok(revision.impact.retainedOffcutIds.includes(preview.offcutIds[0]));
  assert.throws(
    () => applyIdeaRevision(added, binding.id, plan, token),
    /explicitly allow.*rebuild/i,
  );
});

test("an ordinary generated wall retains its generator and exposes the fitted member as a manual modification", () => {
  const p = applyCommand(blank("SYNTHETIC generated frame"), {
      type: "wall",
      width: 96,
      height: 72,
      depth: 48,
      spacing: 16,
    }),
    section = p.sections[0],
    vertical = p.pieces
      .filter(
        (piece) =>
          section.pieceIds.includes(piece.id) &&
          piece.size[1] > 60 &&
          piece.size[0] === 1.5,
      )
      .sort((a, b) => a.position[0] - b.position[0]),
    pair = {
      first: vertical[0],
      second: vertical[1],
      sectionId: section.id,
      localHeight: 0,
      expectedSpan: 0,
    };
  assert.equal(sectionModified(p, section), false);
  const spec = specFor(p, pair),
    added = ordinaryAdd(p, spec, previewFittedStock(p, spec)),
    actual = added.sections.find((row) => row.id === section.id)!;
  assert.deepEqual(actual.generator, section.generator);
  assert.equal(sectionModified(added, actual), true);
});

test("the shipped 42-piece measured example retains W/H/C/source and purchase data through fitted Add and explicit save/reopen", async () => {
  let p = projectSchema.parse(
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
  const pair = actualPair(p, "storage-banquette"),
    section = p.sections.find((section) => section.id === pair.sectionId)!,
    members = p.pieces.filter((piece) => section.pieceIds.includes(piece.id)),
    rail = members
      .filter((piece) => piece.designRole === "top-rail")
      .sort((a, b) => a.position[2] - b.position[2])[0],
    post = members
      .filter((piece) => piece.designRole === "leg")
      .sort((a, b) => a.position[2] - b.position[2])[0];
  p = saveConnectorPlan(
    p,
    makeConnectorPlan(p, rail.id, post.id, {
      name: "SYNTHETIC retained pending connector; no installation",
    }),
  );
  assert.equal(p.pieces.length, 42);
  assert.ok(
    p.fastenerPlans.length &&
      p.lidHingePlans.length &&
      p.connectorPlans.length &&
      p.hingeStockSources.length &&
      p.supplies.length,
  );
  const spec = specFor(p, pair),
    preview = previewFittedStock(p, spec),
    next = generateBuildGuide(ordinaryAdd(p, spec, preview));
  assertOldPartsAndIntent(p, next);
  const folder = await mkdtemp(path.join(tmpdir(), "yardwork-fitted-stock-"));
  try {
    const stored = await new ProjectStore(folder).save(next, 0),
      reopened = await new ProjectStore(folder).get(next.id);
    assert.deepEqual(reopened, stored);
    assert.equal(stored.project.schemaVersion, p.schemaVersion);
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(stored.project))),
      stored.project,
    );
    assertSource(stored.project, preview);
    assertOldPartsAndIntent(next, stored.project);
    assert.ok(guideIsCurrent(stored.project));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
