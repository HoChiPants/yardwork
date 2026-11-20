import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
  type BuildStudyParameters,
} from "../src/buildFixtures";
import {
  bom,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
  validate,
} from "../src/engine";
import { generateBuildGuide } from "../src/guide";
import { retailerHandoff } from "../src/handoff";
import { blank, material, projectSchema, type V3 } from "../src/model";
import { reviewedOfferForMaterial } from "../src/retailerCatalog";
import { saunaBenchReviews } from "../src/saunaBenches";
import {
  cedarbrookBenches,
  saunaPedestalRole,
} from "../src/saunaBenchReference";
import {
  saunaHeaterReview,
  saunaRooms,
  saveSaunaHeater,
} from "../src/saunaHeaters";
import { composeRotation, rotate } from "../src/spatial";
import { structureMaterialChoices } from "../src/structures";

const makeStudy = (index = 1, changes: Partial<BuildStudyParameters> = {}) => {
  const bench = cedarbrookBenches[index];
  return createBuildStudy(
    "sauna",
    { ...defaultBuildStudyParameters("sauna"), ...changes },
    blank(),
    {
      saunaBench: {
        materialId: bench.materialId,
        productRegistryRef: bench.productId,
      },
    },
  );
};

test("each sourced lower bench uses its assembled footprint and purchases one kit", () => {
  for (const [index, source] of cedarbrookBenches.entries()) {
    const { project, structure } = makeStudy(index, {
      benchOffsetX: 4,
      benchRearGap: 2,
    });
    const bench = project.pieces.find(
      (piece) => piece.material === source.materialId,
    )!;
    assert.deepEqual(bench.size, [source.length, 18, 18]);
    assert.deepEqual(bench.position, [4, 9, -25]);
    assert.deepEqual(structure?.geometryRoles[saunaPedestalRole], [bench.id]);
    assert.ok(
      !structure?.referenceVolumes.some(
        (volume) => volume.role === "bench-reservation",
      ),
    );
    assert.ok(
      !structure?.cutRequirements.some((cut) => cut.partId === bench.id),
    );
    assert.throws(() => cutPiece(project, bench.id, 24, 0));
    const resized = {
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === bench.id ? { ...piece, size: [32, 18, 18] } : piece,
      ),
    };
    assert.equal(projectSchema.safeParse(resized).success, false);
    const counts = bom(project).find((row) => row.id === bench.material)!;
    assert.equal(counts.quantity, 1);
    assert.equal(counts.unpriced, true);
    assert.equal(counts.supplier?.productCode, source.productCode);
    for (const retailer of ["home-depot", "lowes"] as const) {
      assert.equal(
        reviewedOfferForMaterial(material(bench.material), retailer),
        null,
      );
      assert.match(
        shoppingCsv({ ...project, retailer }),
        /"","1","kit","UNPRICED"/,
      );
      assert.ok(
        retailerHandoff({ ...project, retailer }).includes(
          `1 kit — Cedarbrook ${source.productCode}`,
        ),
      );
    }
    const guide = guideMarkdown(generateBuildGuide(project));
    assert.match(guide, /Assemble and place the cedar pedestal bench/);
    assert.match(guide, /pedestal-bench-instructions\.pdf/);
    assert.match(guide, /leaves the immediate doorway approach open/);
    const restored = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    assert.deepEqual(restored.ideaBindings, project.ideaBindings);
  }
  assert.equal(structureMaterialChoices("saunaBench").length, 2);
  assert.throws(
    () => makeStudy(1, { width: 48 }),
    /extends outside the clear sauna/,
  );
  assert.doesNotThrow(() => makeStudy(0, { width: 48 }));
});

test("the heater uses the actual seat position and rejects overlapping or missing selected kits", () => {
  const source = makeStudy(1, { height: 88 }).project;
  const room = saunaRooms(source)[0];
  const project = saveSaunaHeater(source, room.entry.id, {
    x: 0,
    z: -6.5,
    supply: "240",
    uninsulatedWallArea: 6,
    notes: "Synthetic review",
  });
  const bench = saunaBenchReviews(project)[0].piece!;
  assert.equal(saunaHeaterReview(project, room.entry.id)?.ready, true);
  const variant = (z: number) => {
    const position: V3 = [bench.position[0], bench.position[1], z];
    return {
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === bench.id ? { ...piece, position } : piece,
      ),
    };
  };
  const moved = variant(bench.position[2] + 10);
  const hot = saunaHeaterReview(moved, room.entry.id)!;
  assert.equal(hot.ready, false);
  assert.ok(!hot.checks.some((item) => item.label === "Reserved bench"));
  assert.match(
    hot.checks.find((item) => item.label === "Other modeled parts")!.detail,
    /Sauna pedestal bench.*envelope/,
  );
  const removed = {
    ...project,
    pieces: project.pieces.filter((piece) => piece.id !== bench.id),
  };
  assert.ok(
    saunaHeaterReview(removed, room.entry.id)?.checks.some(
      (item) =>
        item.label === "Sauna bench placement" && item.state === "needs-review",
    ),
  );
  const doorway = variant(18);
  assert.ok(
    validate(doorway).some(
      (finding) => finding.title === "Sauna bench overlaps the door approach",
    ),
  );
  const outside = variant(31);
  assert.ok(
    saunaBenchReviews(outside)[0].findings.some(
      (finding) => finding.kind === "fit",
    ),
  );
});

test("the modeled bench fit follows a moved and rotated room", () => {
  const original = makeStudy().project;
  const yaw: V3 = [0, Math.PI / 4, 0];
  const origin = [6, 2, 4];
  const move = (point: V3) =>
    rotate(point, yaw).map((v, i) => v + origin[i]) as V3;
  const project = {
    ...original,
    pieces: original.pieces.map((piece) => ({
      ...piece,
      position: move(piece.position),
      rotation: composeRotation(yaw, piece.rotation),
    })),
    ideaBindings: original.ideaBindings.map((binding) => ({
      ...binding,
      entries: binding.entries.map((entry) => ({
        ...entry,
        pose: {
          origin: move(entry.pose.origin),
          rotation: composeRotation(yaw, entry.pose.rotation),
        },
      })),
    })),
  };
  assert.deepEqual(saunaBenchReviews(project)[0].findings, []);
  const old = createBuildStudy("sauna").project;
  assert.deepEqual(projectSchema.parse({ ...old, schemaVersion: 24 }), old);
});
