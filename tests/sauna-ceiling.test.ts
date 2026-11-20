import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  cutKerf,
  cutPiece,
  bom,
  bounds,
  guideMarkdown,
  inspectCutStock,
  shoppingCsv,
} from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { blank, inventorySchema, material, projectSchema } from "../src/model";
import { reviewedOfferForMaterial } from "../src/retailerCatalog";
import {
  saunaCeilingBatt as batt,
  saunaCeilingBattRole,
  saunaCeilingJoists,
} from "../src/saunaCeilingReference";
import { prepareCollisionSolid, solidOverlap } from "../src/solidCollision";
import { orientedStockSize, stockAxes } from "../src/stockAxes";
import { toolChecklist } from "../src/tools";
import { structureMaterialChoices } from "../src/structures";
import { groupedMaterials } from "../src/materialGroups";
import { saunaCeilingCoverage } from "../src/saunaCeilingCoverage";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { composeRotation, rotate } from "../src/spatial";
import { validate } from "../src/engine";
import type { V3 } from "../src/model";

const defaults = defaultBuildStudyParameters("sauna");
const selection = (stock: {
  materialId:
    typeof batt.materialId | (typeof saunaCeilingJoists)[number]["materialId"];
  productId: string;
}) => ({
  materialId: stock.materialId,
  productRegistryRef: stock.productId,
});
const battSelection = { saunaCeilingInsulation: selection(batt) };
const study = (
  joist = saunaCeilingJoists[0] as (typeof saunaCeilingJoists)[number],
  depth = defaults.depth,
) =>
  createBuildStudy("sauna", { ...defaults, depth }, blank(), {
    ...battSelection,
    saunaCeilingJoists: selection(joist),
  });

test("ceiling batt selection in shallow framing keeps the geometry and excludes its purchase", () => {
  const base = createBuildStudy("sauna", defaults, blank());
  const { project, structure } = createBuildStudy(
    "sauna",
    defaults,
    blank(),
    battSelection,
  );
  assert.equal(structure?.dimensions.ceilingCavityDepth, 3.5);
  assert.equal(
    structure?.dimensions.outsideFramingHeight,
    base.structure?.dimensions.outsideFramingHeight,
  );
  const message = structure?.missingMaterials.find(
    (row) => row.id === "material.saunaCeilingInsulation",
  );
  assert.match(
    message!.reason,
    /9.5 in batt exceeds the 3.5 in modeled ceiling cavity/,
  );
  assert.equal(structure?.geometryRoles[saunaCeilingBattRole], undefined);
  assert.equal(
    bom(project).find(({ id }) => id === batt.materialId),
    undefined,
  );
  assert.doesNotMatch(
    guideMarkdown(generateBuildGuide(project)),
    /Measure and fit the ceiling batts/,
  );
  assert.deepEqual(project.pieces.map(bounds), base.project.pieces.map(bounds));
});

test("deeper ceiling geometry fits full uncompressed batts, holds the clear room and generates cuts and guide steps", () => {
  const { project, structure } = study();
  const batts = project.pieces.filter(
    (piece) => piece.material === batt.materialId,
  );
  const framing = project.pieces.filter((piece) =>
    structure?.geometryRoles["ceiling-framing"].includes(piece.id),
  );
  assert.equal(framing.length, 9);
  assert.equal(
    framing.filter((piece) => piece.name.endsWith("ceiling rim")).length,
    2,
  );
  assert.deepEqual(structure?.referenceVolumes[0].min, [-36, 0, -36]);
  assert.deepEqual(structure?.referenceVolumes[0].max, [36, 84, 36]);
  assert.equal(structure?.dimensions.outsideFramingHeight, 96.75);
  assert.equal(structure?.dimensions.ceilingCavityRemaining, 1.75);
  assert.equal(structure?.qualifiedForConstruction, false);
  assert.equal(batts.length, 10);
  assert.deepEqual(
    batts.map((piece) => piece.id),
    structure?.geometryRoles[saunaCeilingBattRole],
  );
  for (const piece of [...batts, ...framing]) {
    const solid = prepareCollisionSolid(piece)!;
    for (const other of project.pieces.filter(({ id }) => id !== piece.id)) {
      assert.equal(
        solidOverlap(solid, prepareCollisionSolid(other)!),
        false,
        `${piece.name} overlaps ${other.name}`,
      );
    }
  }
  const area = batts.reduce((sum, p) => sum + p.size[0] * p.size[1], 0);
  assert.equal(area, (82 - (framing.length - 2) * 1.5) * (82 - 2 * 1.5));
  assert.ok(batts.every((p) => p.size[2] === 9.5 && bounds(p).min[1] > 84));
  assert.deepEqual(
    structure?.cutRequirements
      .filter((cut) => cut.materialId === batt.materialId)
      .map((cut) => cut.blankSize),
    batts.map((p) => p.size),
  );
  const takeoff = bom(project).find((row) => row.id === batt.materialId)!;
  assert.deepEqual(
    [
      takeoff.physicalStockUnits,
      takeoff.packCount,
      takeoff.quantity,
      takeoff.oversize,
    ],
    [10, 10, 1, 0],
  );
  const guide = generateBuildGuide(project);
  const ceilingPhase = guide.steps.findIndex((step) =>
    step.title.includes("Dry-fit the ceiling framing"),
  );
  const battPhase = guide.steps.findIndex((step) =>
    step.title.includes("Measure and fit the ceiling batts"),
  );
  assert.ok(ceilingPhase >= 0 && battPhase > ceilingPhase);
  assert.doesNotMatch(
    guideMarkdown(guide),
    /Unbuilt systems:.*ceiling insulation/,
  );
  assert.match(guideMarkdown(guide), /Measure and fit the ceiling batts/);
  assert.ok(
    toolChecklist(guide)
      .requirements.find(({ capability }) => capability === "cut-insulation")
      ?.referenceUrls.includes(batt.instructions),
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(guide))),
    guide,
  );
});

test("a narrow ceiling bay keeps its stock axes as successive knife trims create reusable offcuts", () => {
  const { project } = study(saunaCeilingJoists[1], 62);
  const piece = project.pieces.find(
    (p) => p.material === batt.materialId && p.size[0] < batt.thickness,
  )!;
  assert.ok(piece);
  assert.deepEqual(stockAxes(piece), { width: 0, length: 1, thickness: 2 });
  assert.equal(cutKerf(piece.material), 0);
  assert.throws(() => cutPiece(project, piece.id, 5, 2), /correct thickness/);
  assert.equal(
    bom(project).find((row) => row.id === piece.material)?.oversize,
    0,
  );
  const first = cutPiece(project, piece.id, 4, 0);
  const second = cutPiece(first, piece.id, 2, 0);
  const kept = second.pieces.find(({ id }) => id === piece.id)!;
  assert.deepEqual(orientedStockSize(kept), [batt.thickness, 2, piece.size[1]]);
  const sourceId = kept.cutStock!.id;
  assert.ok(inspectCutStock(second).valid.has(sourceId));
  assert.equal(
    second.pieces.filter((row) => row.cutStock?.id === sourceId && row.offcut)
      .length,
    2,
  );
});

test("the shared batt SKU uses individual bags at both retailers and board offers stay tied to their variants", () => {
  const { project } = study();
  const date = new Date().toISOString();
  for (const [retailer, productId] of [
    ["home-depot", "100320350"],
    ["lowes", "3363024"],
  ] as const) {
    const offer = reviewedOfferForMaterial(
      material(batt.materialId),
      retailer,
    )!;
    assert.equal(offer.productId, productId);
    const observation = inventorySchema.parse({
      retailer,
      material: batt.materialId,
      internetNumber: offer.productId,
      name: "Synthetic C84A snapshot",
      price: 40,
      available: 2,
      zip: "84121",
      store: "TEST-CEILING",
      checkedAt: date,
      url: offer.url,
    });
    const priced = {
      ...project,
      retailer,
      store: observation.store,
      inventory: [observation],
    };
    assert.equal(
      bom(priced).find((row) => row.id === batt.materialId)?.total,
      40,
    );
    assert.ok(
      shoppingCsv(priced).includes(
        `"${productId}","1","bag","40.00","40.00","84121","TEST-CEILING"`,
      ),
    );
    assert.equal(
      bom({ ...priced, store: "OTHER" }).find(
        (row) => row.id === batt.materialId,
      )?.verified,
      false,
    );
  }
  for (const joist of saunaCeilingJoists) {
    assert.equal(
      reviewedOfferForMaterial(material(joist.materialId), joist.retailer)
        ?.productId,
      joist.listing,
    );
    assert.equal(
      reviewedOfferForMaterial(
        material(joist.materialId),
        joist.retailer === "lowes" ? "home-depot" : "lowes",
      ),
      null,
    );
  }
  assert.deepEqual(
    structureMaterialChoices("saunaCeilingJoists").map((s) => s.materialId),
    saunaCeilingJoists.map((s) => s.materialId),
  );
  assert.deepEqual(
    groupedMaterials("Lumber")
      .find((group) => group.id === "framing-2x12")
      ?.variants.map(({ id }) => id),
    saunaCeilingJoists.map((s) => s.materialId),
  );
  const old = {
    ...createBuildStudy("sauna", defaults, blank()).project,
    schemaVersion: 26,
  };
  assert.deepEqual(projectSchema.parse(old), { ...old, schemaVersion: PROJECT_FORMAT_VERSION });
});

test("coverage follows the retained batt and its offcut only once that offcut is active in the gap", () => {
  const { project } = study();
  const [before] = saunaCeilingCoverage(project);
  assert.equal(before.enoughFramingDepth, true);
  assert.equal(before.openArea, 0);
  const initial = project.pieces.find(
    ({ material }) => material === batt.materialId,
  )!;
  const trimmed = cutPiece(project, initial.id, 6, 0);
  const [review] = saunaCeilingCoverage(trimmed);
  assert.equal(review.openArea, (initial.size[0] - 6) * initial.size[1]);
  assert.equal(review.outlines.length, 1);
  assert.equal(review.outlines[0].length, 4);
  assert.ok(review.outlines[0].every((vertex) => vertex[1] === 95));
  assert.deepEqual(review.overlappingPartIds, []);
  assert.deepEqual(review.unseatedPartIds, []);
  assert.equal(
    validate(trimmed).find((finding) => finding.area)?.area?.label,
    "Uncovered ceiling · 2.58 sq ft",
  );
  assert.match(
    guideMarkdown(trimmed),
    /Sauna ceiling coverage[\s\S]*2\.58 sq ft lacks full-depth batt coverage/,
  );
  const onlyScrapMoved = {
    ...trimmed,
    pieces: trimmed.pieces.map((piece) =>
      piece.offcut ? { ...piece, position: [200, 0, 0] as V3 } : piece,
    ),
  };
  assert.equal(
    saunaCeilingCoverage(onlyScrapMoved)[0].openArea,
    review.openArea,
  );
  const placed = {
    ...trimmed,
    pieces: trimmed.pieces.map((piece) => ({ ...piece, offcut: false })),
  };
  assert.equal(saunaCeilingCoverage(placed)[0].openArea, 0);
  assert.equal(
    bom(placed).find(({ id }) => id === batt.materialId)?.quantity,
    1,
  );
  assert.equal(
    validate(placed).some((finding) => finding.area),
    false,
  );
});

test("depth coverage follows the actual rotated room and clipped batt profile", () => {
  const { project } = study();
  const original = project.pieces.find(
    ({ material }) => material === batt.materialId,
  )!;
  const slope = Math.SQRT1_2;
  const angle: V3 = [0.1, 0.6, -0.07];
  const origin: V3 = [36, 24, -18];
  const rotated = {
    ...project,
    pieces: project.pieces.map((piece) => ({
      ...piece,
      position: rotate(piece.position, angle).map(
        (n, i) => n + origin[i],
      ) as V3,
      rotation: composeRotation(angle, piece.rotation),
      cutPlanes:
        piece.id === original.id
          ? [{ normal: [slope, slope, 0] as V3, constant: 0 }]
          : piece.cutPlanes,
    })),
    ideaBindings: project.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) => ({
        ...entry,
        pose: { origin, rotation: angle },
      })),
    })),
  };
  const [review] = saunaCeilingCoverage(rotated);
  assert.ok(
    Math.abs(review.openArea - (original.size[0] * original.size[1]) / 2) <
      1e-6,
  );
  assert.ok(review.outlines.length);
  assert.deepEqual(review.unseatedPartIds, []);
  assert.deepEqual(review.overlappingPartIds, []);
});

test("checks catch a shifted batt, unsuitable framing depth and complete removal of an insulation section", () => {
  const { project } = study();
  const original = project.pieces.find(
    ({ material }) => material === batt.materialId,
  )!;
  function move(y: number, z: number) {
    return {
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === original.id
          ? {
              ...piece,
              position: [
                piece.position[0],
                piece.position[1] + y,
                piece.position[2] + z,
              ] as V3,
            }
          : piece,
      ),
    };
  }
  const horizontal = saunaCeilingCoverage(move(0, 1))[0];
  assert.deepEqual(horizontal.overlappingPartIds, [original.id]);
  assert.equal(horizontal.openArea, original.size[1]);
  const lifted = saunaCeilingCoverage(move(1, 0))[0];
  assert.deepEqual(lifted.unseatedPartIds, [original.id]);
  assert.equal(lifted.openArea, original.size[0] * original.size[1]);
  const shallow = createBuildStudy(
    "sauna",
    defaults,
    blank(),
    battSelection,
  ).project;
  assert.equal(saunaCeilingCoverage(shallow)[0].enoughFramingDepth, false);
  assert.ok(
    validate(shallow).some(
      (finding) => finding.title === "Review sauna ceiling depth",
    ),
  );
  const bare = {
    ...project,
    pieces: project.pieces.filter(
      (piece) => piece.material !== batt.materialId,
    ),
  };
  assert.equal(saunaCeilingCoverage(bare)[0].openArea, 79 * (82 - 7 * 1.5));
  assert.ok(
    validate(bare).some(
      (finding) => finding.title === "Sauna ceiling insulation gap",
    ),
  );
});

test("a room whose framing exceeds the part size limit reports the member and limit", () => {
  assert.throws(
    () =>
      createBuildStudy(
        "sauna",
        { ...defaults, width: 240 },
        blank(),
        battSelection,
      ),
    /Sauna exterior framing · .* exceeds the 240 in workspace part limit/,
  );
});
