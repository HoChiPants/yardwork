import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  bom,
  bounds,
  guideMarkdown,
  shoppingCsv,
  validate,
} from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { retailerHandoff } from "../src/handoff";
import { saveMotionPlan, reviewMotion } from "../src/mechanismMotion";
import { blank, material, projectSchema } from "../src/model";
import {
  checkProductBinding,
  findRetailerProduct,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";
import { cedarbrookDoor as door } from "../src/saunaDoorReference";
import { saunaDoorChoices, saunaDoorMotionInput } from "../src/saunaDoors";
import { cedarbrookFoil as foil } from "../src/saunaFoilReference";
import { foilBlankSize, saunaFoilLayoutChanges } from "../src/saunaFoil";
import { cedarbrookLining as lining } from "../src/saunaLiningReference";
import { toolChecklist } from "../src/tools";

const selections = {
  saunaVaporBarrier: {
    materialId: foil.materialId,
    productRegistryRef: foil.productId,
  },
  saunaDoor: {
    materialId: door.materialId,
    productRegistryRef: door.productId,
  },
  saunaInterior: {
    materialId: lining.materialId,
    productRegistryRef: lining.productId,
  },
};
const makeStudy = () =>
  createBuildStudy(
    "sauna",
    { ...defaultBuildStudyParameters("sauna"), doorWidth: 24, doorHeight: 76 },
    blank(),
    selections,
  );

test("foil runs cover the wall and ceiling planes with 4 inch laps, an open door and explicit folded stock", () => {
  const { project, structure } = makeStudy();
  const panels = project.pieces.filter((p) => p.material === foil.materialId);
  assert.equal(panels.length, 13);
  const left = panels
    .filter((p) => p.name.includes("left band") && !p.name.includes("front"))
    .map(bounds);
  assert.equal(left[0].max[1] - left[1].min[1], 4);
  assert.equal(left[0].min[1], 0);
  assert.equal(left[1].max[1], 85.5);
  const ceiling = panels.filter((p) => p.name.includes("ceiling"));
  assert.deepEqual(ceiling.map(foilBlankSize), [
    [81, 54, foil.modelThickness],
    [81, 31, foil.modelThickness],
  ]);
  assert.ok(
    Math.abs(bounds(ceiling[0]).max[2] - bounds(ceiling[1]).min[2] - 4) <
      0.000001,
  );
  for (const panel of panels.filter(
    (p) => p.name.includes("front") || p.name.includes("header"),
  )) {
    const box = bounds(panel);
    assert.ok(box.max[0] <= -12 || box.min[0] >= 12 || box.min[1] >= 76);
  }
  assert.ok(panels.every((panel) => panel.stockLengthAxis === 0));
  const cuts = structure!.cutRequirements.filter(
    (item) => item.materialId === foil.materialId,
  );
  assert.equal(cuts.length, 13);
  for (const cut of cuts)
    assert.deepEqual(
      cut.blankSize,
      foilBlankSize(panels.find((panel) => panel.id === cut.partId)!),
    );

  const { entry } = saunaDoorChoices(project)[0];
  const doorMove = saveMotionPlan(
    project,
    saunaDoorMotionInput(
      project,
      { entryId: entry.id, side: "left", outset: 0, sideOffset: 0 },
      90,
    ),
  );
  assert.deepEqual(reviewMotion(doorMove.project, doorMove.plan).hits, []);
});

test("the continuous roll is quoted by a feasible flat cut layout, without manufacturing a pack length or store observation", () => {
  const { project } = makeStudy();
  const row = bom(project).find((r) => r.id === foil.materialId)!;
  assert.equal(row.oversize, 0);
  assert.equal(row.quantity, 63);
  assert.equal(row.supplier?.url, foil.url);
  assert.equal(row.verified, false);
  assert.equal(row.unpriced, true);
  const [roll] = row.rolls;
  assert.equal(roll.width, 54);
  assert.equal(roll.length, row.quantity * 12);
  assert.equal(roll.placements.length, 13);
  for (const [i, cut] of roll.placements.entries()) {
    assert.ok(
      cut.x + cut.width <= roll.width && cut.y + cut.length <= roll.usedLength,
    );
    assert.ok(
      roll.placements
        .slice(i + 1)
        .every(
          (other) =>
            cut.x + cut.width <= other.x ||
            other.x + other.width <= cut.x ||
            cut.y + cut.length <= other.y ||
            other.y + other.length <= cut.y,
        ),
    );
  }
  const product = findRetailerProduct(foil.productId)!;
  assert.equal(product.profile.stockSize, null);
  assert.equal(product.profile.packCount, null);
  assert.ok(checkProductBinding(material(foil.materialId), product).compatible);
  for (const retailer of ["home-depot", "lowes"] as const) {
    const check = { ...project, retailer };
    assert.equal(
      reviewedOfferForMaterial(material(foil.materialId), retailer),
      null,
    );
    assert.match(
      retailerHandoff(check),
      /63 linear ft — Cedarbrook FOIL-VAPOR/,
    );
    assert.match(
      shoppingCsv(check),
      /"","63","linear ft","UNPRICED","UNPRICED","","","SUPPLIER QUOTE"/,
    );
  }
  assert.ok(
    toolChecklist(project).requirements.some(
      (r) => r.capability === "cut-foil",
    ),
  );
  assert.ok(
    toolChecklist(project).requirements.some(
      (r) => r.capability === "staple-foil",
    ),
  );
  const guide = guideMarkdown(generateBuildGuide(project));
  assert.ok(
    guide.indexOf("Cut and fit the ceiling foil") <
      guide.indexOf("Fit the wall foil and check its laps"),
  );
  assert.match(guide, /Request 63 linear ft at 54 in wide/);
});

test("edited folds retain their stock demand, flag coverage review and stale the guide", () => {
  const project = generateBuildGuide(makeStudy().project);
  assert.deepEqual(saunaFoilLayoutChanges(project), []);
  const panel = project.pieces.find((p) => p.material === foil.materialId)!;
  const changed = {
    ...project,
    pieces: project.pieces.map((p) =>
      p.id === panel.id
        ? {
            ...p,
            foilReturns: {
              ...p.foilReturns!,
              xStart: 12,
              xEnd: 12,
              yStart: 12,
            },
          }
        : p,
    ),
  };
  assert.equal(guideIsCurrent(changed), false);
  assert.equal(bom(changed).find((r) => r.id === foil.materialId)!.oversize, 1);
  assert.ok(
    validate(changed).some(
      (finding) => finding.title === "Review edited sauna foil coverage",
    ),
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(changed)));
  assert.deepEqual(reopened.pieces, changed.pieces);
  const old = createBuildStudy("sauna").project;
  assert.deepEqual(projectSchema.parse({ ...old, schemaVersion: 25 }), old);
});
