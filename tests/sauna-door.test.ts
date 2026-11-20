import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  bom,
  connect,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
} from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { retailerHandoff } from "../src/handoff";
import {
  motionSetup,
  reviewMotion,
  saveMotionPlan,
} from "../src/mechanismMotion";
import { blank, material, part, projectSchema, type V3 } from "../src/model";
import { reviewedOfferForMaterial } from "../src/retailerCatalog";
import { cedarbrookDoor as door } from "../src/saunaDoorReference";
import {
  saunaDoorChoices,
  saunaDoorMotionInput,
  saunaDoorReview,
} from "../src/saunaDoors";
import { cedarbrookLining as lining } from "../src/saunaLiningReference";
import { buildSaunaCabin, structureMaterialChoices } from "../src/structures";
import { rotate, composeRotation } from "../src/spatial";

const opening = { doorWidth: door.roughWidth, doorHeight: door.roughHeight };
const selections = {
  saunaDoor: {
    materialId: door.materialId,
    productRegistryRef: door.productId,
  },
  saunaInterior: {
    materialId: lining.materialId,
    productRegistryRef: lining.productId,
  },
};
const build = () =>
  createBuildStudy(
    "sauna",
    { ...defaultBuildStudyParameters("sauna"), ...opening },
    blank(),
    selections,
  );
function setup(
  project: ReturnType<typeof blank>,
  side: "left" | "right" = "left",
) {
  const { entry } = saunaDoorChoices(project)[0];
  const draft = saunaDoorMotionInput(
    project,
    { entryId: entry.id, side, outset: 0, sideOffset: 0 },
    90,
  );
  return saveMotionPlan(project, draft);
}

test("one documented leaf in the framed rough opening generates one direct-supplier kit", () => {
  const { project, structure } = build();
  const leaf = project.pieces.find(
    (member) => member.material === door.materialId,
  )!;
  assert.equal(
    project.pieces.filter((member) => member.material === door.materialId)
      .length,
    1,
  );
  assert.deepEqual(leaf.size, [22, 74.5, 2.625]);
  assert.deepEqual(structure?.geometryRoles["sauna-door-leaf"], [leaf.id]);
  assert.equal(structure?.dimensions.doorRoughWidth, 24);
  assert.equal(structure?.dimensions.doorRoughHeight, 76);
  assert.equal(
    structure?.cutRequirements.some((row) => row.partId === leaf.id),
    false,
  );
  assert.throws(() => cutPiece(project, leaf.id, 18, 0));
  assert.throws(
    () => connect(project, leaf.id, project.pieces[0].id, project.steps[0].id),
    /actual jamb/,
  );
  assert.equal(
    projectSchema.safeParse({
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === leaf.id ? { ...piece, size: [18, 74.5, 2.625] } : piece,
      ),
    }).success,
    false,
  );
  const kit = bom(project).find((row) => row.id === door.materialId)!;
  assert.equal(kit.quantity, 1);
  assert.equal(kit.physicalStockUnits, 1);
  assert.equal(kit.oversize, 0);
  assert.equal(kit.unpriced, true);
  assert.equal(kit.supplier?.productCode, door.productCode);
  for (const retailer of ["home-depot", "lowes"] as const) {
    assert.equal(
      reviewedOfferForMaterial(material(door.materialId), retailer),
      null,
    );
    const csv = shoppingCsv({ ...project, retailer });
    assert.match(
      csv,
      /"Cedarbrook prehung cedar sauna door","","1","kit","UNPRICED"/,
    );
    assert.ok(csv.includes(door.url));
    assert.match(
      retailerHandoff({ ...project, retailer }),
      /1 kit — Cedarbrook CLAD-24X76-NW/,
    );
  }
  assert.match(
    guideMarkdown(generateBuildGuide(project)),
    /Fit and test the prehung sauna door/,
  );
  assert.deepEqual(
    structureMaterialChoices("saunaDoor").map((option) => option.materialId),
    [door.materialId],
  );
  assert.throws(
    () =>
      buildSaunaCabin(
        blank(),
        { clearWidth: 72, clearDepth: 72, clearHeight: 84 },
        selections,
      ),
    /24 × 76 in rough opening/,
  );
});

test("both hinge sides open outward and stop at an obstruction between clear poses", () => {
  const source = build().project;
  const original = JSON.stringify(source);
  for (const side of ["left", "right"] as const) {
    const { project, plan } = setup(source, side);
    const { mechanism } = motionSetup(project, plan);
    assert.equal(mechanism.kind, "hinge");
    const sign = side === "left" ? 1 : -1;
    assert.equal(mechanism.axis[1], sign);
    assert.equal(mechanism.pivot[0], -11 * sign);
    const free = reviewMotion(project, plan);
    assert.deepEqual(free.hits, []);
    assert.ok(free.preview(90).pieces[0].position[2] > 51);
    const radius = 16 / Math.sqrt(2);
    const obstacle = part(
      "Hall storage panel",
      "plywood",
      [0.75, 4, 0.75],
      [sign * (-11 + radius), 38, 41 + radius],
      source.steps[0].id,
      "Hall",
    );
    const blocked = { ...project, pieces: [...project.pieces, obstacle] };
    const review = reviewMotion(blocked, plan);
    assert.deepEqual(review.preview(0).interferenceIds, []);
    assert.deepEqual(review.preview(90).interferenceIds, []);
    const hit = review.hits.find((entry) => entry.obstacleId === obstacle.id)!;
    assert.equal(hit.kind, "envelope");
    assert.ok(hit.first > 40 && hit.first < 50);
    const limit = review.playbackLimit(0, 90);
    assert.deepEqual(
      review.preview(limit.travel, limit.inspectAt).obstacleNames,
      [obstacle.name],
    );
    assert.ok(review.playbackLimit(90, 0).travel > limit.travel);
    assert.match(
      guideMarkdown(blocked),
      /Possible interference.*part envelope/,
    );
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(project))).motionPlans,
      project.motionPlans,
    );
  }
  assert.equal(JSON.stringify(source), original);
});

test("shared orientation changes preserve travel, while incorrect leaf or opening edits need review", () => {
  const { project, plan } = setup(build().project);
  const yaw: V3 = [0, Math.PI / 3, 0];
  const position = (point: V3) =>
    rotate(point, yaw).map((v, i) => v + [5, 2, -8][i]) as V3;
  const rotated = {
    ...project,
    pieces: project.pieces.map((p) => ({
      ...p,
      rotation: composeRotation(yaw, p.rotation),
      position: position(p.position),
    })),
    sections: project.sections.map((s) => ({
      ...s,
      rotation: composeRotation(yaw, s.rotation),
      origin: position(s.origin),
    })),
  };
  assert.equal(saunaDoorReview(rotated, plan)?.warning, null);
  assert.deepEqual(reviewMotion(rotated, plan).hits, []);
  const closed = project.pieces.find(
    (piece) => piece.id === plan.memberIds[0],
  )!;
  const displaced = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === closed.id
        ? {
            ...piece,
            position: [4, piece.position[1], piece.position[2]] as V3,
          }
        : piece,
    ),
  };
  assert.throws(
    () => reviewMotion(displaced, plan),
    /within the sauna rough opening/,
  );
  const header = project.pieces.find(
    (piece) => piece.name === "Sauna door rough opening · door header",
  )!;
  const changed = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === header.id
        ? {
            ...piece,
            position: [0, piece.position[1] + 1, piece.position[2]] as V3,
          }
        : piece,
    ),
  };
  assert.throws(() => reviewMotion(changed, plan), /rough opening has changed/);
  const old = createBuildStudy("sauna").project;
  assert.deepEqual(projectSchema.parse({ ...old, schemaVersion: 23 }), old);
});
