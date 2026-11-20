import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { connectionCoverage } from "../src/connectionCoverage";
import { cutStockLayout } from "../src/cutStockLayout";
import {
  bom,
  bounds,
  connect,
  cutPiece,
  guideMarkdown,
  inspectCutStock,
  validate,
} from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { blank, material, part, projectSchema, type V3 } from "../src/model";
import { reviewedOfferForMaterial } from "../src/retailerCatalog";
import { saunaWallCoverage } from "../src/saunaWallCoverage";
import { owensCorningWallBatt } from "../src/saunaWallReference";
import { prepareCollisionSolid, solidOverlap } from "../src/solidCollision";
import { composeRotation, rotate } from "../src/spatial";
import { toolChecklist } from "../src/tools";
import { selectedToolsForProject } from "../src/toolGuide";

const stock = "jm-u1330-batt";
const selections = {
  saunaInsulation: {
    materialId: stock,
    productRegistryRef: "johns-manville-u1330",
  },
} as const;
const study = () =>
  createBuildStudy(
    "sauna",
    defaultBuildStudyParameters("sauna"),
    blank(),
    selections,
  );

test("the editable sauna's wall-only batts fill cavities without intersecting framing or blocking the door", () => {
  const { project, structure } = study();
  const batts = project.pieces.filter((p) => p.material === stock);
  assert.equal(batts.length, 23);
  assert.equal(project.pieces.length, 71);
  assert.deepEqual(
    structure?.geometryRoles["wall-insulation"],
    batts.map((p) => p.id),
  );
  for (const [index, p] of batts.entries()) {
    const solid = prepareCollisionSolid(p)!;
    assert.equal(p.size[2], 3.5);
    const others = [
      ...project.pieces.filter((x) => x.material !== stock),
      ...batts.slice(0, index),
    ];
    for (const other of others)
      assert.ok(
        !solidOverlap(solid, prepareCollisionSolid(other)!),
        `${p.name} · ${other.name}`,
      );
    const box = bounds(p);
    assert.ok(box.min[1] >= 0 && box.max[1] <= 85.5);
    if (box.min[2] >= 36)
      assert.ok(box.max[0] <= -14 || box.min[0] >= 14 || box.min[1] >= 72);
  }
  const row = bom(project).find((r) => r.id === stock)!;
  assert.equal(row.physicalStockUnits, 18);
  assert.equal(row.quantity, 2);
  assert.equal(row.surplusStockUnits, 4);
  assert.equal(row.oversize, 0);
  assert.equal(connectionCoverage(project).summary.activeParts, 48);
  const guide = generateBuildGuide(project);
  assert.match(guideMarkdown(guide), /Measure and fit the wall batts/);
  assert.ok(
    guide.steps.some((s) =>
      /Unbuilt systems.*ceiling insulation/.test(s.notes),
    ),
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(project))).ideaBindings,
    project.ideaBindings,
  );
});

test("knife trims retain and account for the offcut with zero modeled kerf", () => {
  const project = blank();
  const p = part(
    "Wall batt",
    stock,
    [...material(stock).size],
    [0, 2, 0],
    project.steps[0].id,
    "Wall",
  );
  project.pieces = [p];
  const cut = cutPiece(project, p.id, 64, 2);
  const [kept, scrap] = cut.pieces;
  assert.equal(kept.size[2], 64);
  assert.equal(scrap.size[2], 29);
  assert.equal(scrap.cutStock?.offset[2], 64);
  assert.ok(inspectCutStock(cut).valid.has(kept.cutStock!.id));
  assert.equal(cutStockLayout(cut, kept.cutStock!.id).modeledKerf, 0);
  assert.equal(bom(cut)[0].physicalStockUnits, 1);
  assert.throws(() => cutPiece(project, p.id, 2, 1), /correct thickness/);
  assert.throws(
    () => connect(cut, p.id, scrap.id, project.steps[0].id),
    /offcut/,
  );
  assert.throws(
    () =>
      connect(
        { ...cut, pieces: [kept, { ...scrap, offcut: false }] },
        p.id,
        scrap.id,
        project.steps[0].id,
      ),
    /framing members/,
  );
  const checkedAt = "2026-11-19T05:12:00.000Z";
  cut.toolSelections = [{ productId: "milwaukee-48-22-1921", checkedAt }];
  const now = Date.parse(checkedAt);
  const result = toolChecklist(
    cut,
    selectedToolsForProject(cut, now).tools,
    now,
  );
  assert.equal(
    result.requirements.find((r) => r.capability === "cut-insulation")?.status,
    "supported",
  );
  assert.ok(
    !result.requirements.some(
      (r) => r.capability === "plastic-cut" || r.capability === "wood-crosscut",
    ),
  );
});

test("exact batt uses the same identified bag at each retailer and older files reopen", () => {
  assert.equal(
    reviewedOfferForMaterial(material(stock), "home-depot")?.productId,
    "100317868",
  );
  assert.equal(
    reviewedOfferForMaterial(material(stock), "lowes")?.productId,
    "3013301",
  );
  const older = { ...blank("Older empty workspace"), schemaVersion: 12 };
  assert.deepEqual(projectSchema.parse(older), {
    ...older,
    schemaVersion: blank().schemaVersion,
  });
  assert.ok(!older.pieces.length);
});

test("the wall check measures a new gap and closes it only when the offcut is used", () => {
  const { project } = createBuildStudy("sauna", defaultBuildStudyParameters("sauna"), blank(), {
    saunaInsulation: {
      materialId: owensCorningWallBatt.materialId,
      productRegistryRef: owensCorningWallBatt.productId,
    },
  });
  const [initial] = saunaWallCoverage(project);
  assert.deepEqual(initial.gaps, []);
  assert.deepEqual(initial.unseatedPartIds, []);
  const batt = project.pieces.find(({ material }) => material === owensCorningWallBatt.materialId)!;
  const cut = cutPiece(project, batt.id, 6, 0);
  const [gap] = saunaWallCoverage(cut)[0].gaps;
  assert.equal(gap.wall, "Rear wall");
  assert.equal(gap.openArea, (batt.size[0] - 6) * batt.size[1]);
  assert.equal(gap.outlines.length, 1);
  assert.ok(gap.outlines[0].every((point) => point[2] === -41));
  assert.equal(validate(cut).find(({ area }) => area?.kind === "wall-batt-gap")?.area?.label,
    "Rear wall · 4.44 sq ft uncovered");
  assert.match(guideMarkdown(generateBuildGuide(cut)),
    /Sauna wall insulation coverage[\s\S]*Rear wall has 4\.44 sq ft without full-depth batt coverage/);
  const restored = { ...cut, pieces: cut.pieces.map((piece) => ({ ...piece, offcut: false })) };
  assert.deepEqual(saunaWallCoverage(restored)[0].gaps, []);
  assert.equal(bom(restored).find(({ id }) => id === batt.material)?.quantity, 3);
});

test("wall coverage uses the saved room pose and shaped batt profile on a side wall", () => {
  const { project } = study();
  const batt = project.pieces.find((piece) => piece.material === stock && piece.name.includes("left wall"))!;
  const origin: V3 = [37, 14, -41];
  const rotation: V3 = [0.15, 0.45, -0.2];
  const posed = {
    ...project,
    ideaBindings: project.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) => ({ ...entry, pose: { origin, rotation } })),
    })),
    pieces: project.pieces.map((piece) => ({
      ...piece,
      position: rotate(piece.position, rotation).map((value, i) => value + origin[i]) as V3,
      rotation: composeRotation(rotation, piece.rotation),
      cutPlanes: piece.id === batt.id
        ? [{ normal: [Math.SQRT1_2, Math.SQRT1_2, 0] as V3, constant: 0 }]
        : piece.cutPlanes,
    })),
  };
  const review = saunaWallCoverage(posed)[0];
  assert.equal(review.gaps.length, 1);
  const [gap] = review.gaps;
  assert.equal(gap.wall, "Left wall");
  assert.ok(Math.abs(gap.openArea - batt.size[0] * batt.size[1] / 2) < 0.0001);
  assert.deepEqual(review.unseatedPartIds, []);
});

test("a batt shifted out of the wall and a removed insulation section leave real gaps", () => {
  const { project } = study();
  const batt = project.pieces.find(({ material }) => material === stock)!;
  const shifted = {
    ...project,
    pieces: project.pieces.map((piece) => piece.id === batt.id
      ? { ...piece, position: [piece.position[0], piece.position[1], piece.position[2] + 1] as V3 }
      : piece),
  };
  const review = saunaWallCoverage(shifted)[0];
  assert.equal(review.gaps[0].openArea, batt.size[0] * batt.size[1]);
  assert.deepEqual(review.unseatedPartIds, [batt.id]);
  const noBatts = { ...project, pieces: project.pieces.filter((piece) => piece.material !== stock) };
  const gaps = saunaWallCoverage(noBatts)[0].gaps;
  assert.equal(gaps.length, 4);
  const totalFitted = project.pieces.filter((piece) => piece.material === stock)
    .reduce((total, piece) => total + piece.size[0] * piece.size[1], 0);
  assert.equal(gaps.reduce((total, gap) => total + gap.openArea, 0), totalFitted);
});
