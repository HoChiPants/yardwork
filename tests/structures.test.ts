import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part, projectSchema, type V3 } from "../src/model";
import { bounds } from "../src/engine";
import { clipBox } from "../src/cutProfiles";
import { rotate } from "../src/spatial";
import {
  buildClosetInsert,
  buildGreenhouse,
  buildSaunaCabin,
  type StructureMaterials,
} from "../src/structures";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);
const greenhouse = {
  width: 72,
  depth: 96,
  eaveHeight: 84,
  roofRise: 24,
  doorWidth: 30,
  doorHeight: 68,
};
const volumeOverlap = (a: { min: V3; max: V3 }, b: { min: V3; max: V3 }) =>
  [0, 1, 2].reduce(
    (n, i) =>
      n *
      Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])),
    1,
  );

test("greenhouse has actual base, wall, door leaf/opening and clipped pitched roof framing", () => {
  const result = buildGreenhouse(blank(), greenhouse),
    p = result.project;
  for (const role of [
    "base-framing",
    "wall-framing",
    "door-opening-framing",
    "door-leaf",
    "roof-framing",
    "gable-framing",
  ])
    assert.ok(result.geometryRoles[role].length, role);
  const roof = p.pieces.filter((x) =>
      result.geometryRoles["roof-framing"].includes(x.id),
    ),
    rafters = roof.filter((x) => x.name.endsWith("plumb-cut rafter"));
  assert.ok(rafters.length >= 8);
  assert.ok(rafters.every((x) => x.cutPlanes.length === 2));
  const bs = p.pieces.map(bounds);
  near(
    Math.max(...bs.map((b) => b.max[0])) - Math.min(...bs.map((b) => b.min[0])),
    72,
  );
  near(
    Math.max(...bs.map((b) => b.max[2])) - Math.min(...bs.map((b) => b.min[2])),
    96,
  );
  near(Math.max(...bs.map((b) => b.max[1])), 108);
  const opening = result.referenceVolumes.find(
    (v) => v.role === "door-clear-opening",
  )!;
  for (const piece of p.pieces.filter(
    (x) => !result.geometryRoles["door-leaf"].includes(x.id),
  ))
    assert.ok(
      volumeOverlap(bounds(piece), opening) < 0.001,
      `${piece.name} fills the door opening`,
    );
  for (const piece of p.pieces) {
    const m = material(piece.material),
      size = [...piece.size].sort((a, b) => a - b),
      stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b);
    assert.ok(
      size.every((n, i) => n <= stock[i] + 0.001),
      `${piece.name} silently changes cross-section or exceeds stock`,
    );
  }
  assert.equal(result.qualifiedForConstruction, false);
  assert.ok(
    result.missingMaterials.some((x) => x.id === "material.greenhouseGlazing"),
  );
  assert.ok(result.unresolved.some((x) => x.id === "roof-bearing"));
  assert.ok(
    !p.pieces.some((x) => x.material === "roof"),
    "Metal roofing must never stand in for unavailable glazing.",
  );
});

test("rafter cut planes are genuinely plumb in world space and meet ridge faces without bounding-box penetration", () => {
  const r = buildGreenhouse(blank(), greenhouse),
    p = r.project,
    roof = p.pieces.filter((x) =>
      r.geometryRoles["roof-framing"].includes(x.id),
    ),
    ridge = roof.find((x) => x.name.endsWith("ridge"))!,
    ridgeBounds = bounds(ridge);
  for (const piece of roof.filter((x) => x.cutPlanes.length === 2)) {
    const clipped = clipBox(piece.size, piece.cutPlanes),
      cutFaces = clipped.faces.filter((f) => f.kind === "cut");
    assert.equal(cutFaces.length, 2);
    const faceX: number[] = [];
    for (const face of cutFaces) {
      const normal = rotate(face.normal, piece.rotation);
      near(Math.abs(normal[0]), 1);
      near(normal[1], 0);
      near(normal[2], 0);
      const vertices = face.indices.map((i) =>
        rotate(clipped.vertices[i], piece.rotation).map(
          (v, j) => v + piece.position[j],
        ),
      );
      vertices.forEach((v) => near(v[0], vertices[0][0]));
      faceX.push(Math.abs(vertices[0][0]));
    }
    faceX.sort((a, b) => a - b);
    near(faceX[0], ridge.size[0] / 2);
    near(faceX[1], greenhouse.width / 2);
    assert.ok(
      volumeOverlap(bounds(piece), ridgeBounds) < 0.001,
      "Rafters should meet the ridge face, not cross its solid envelope.",
    );
  }
  const raw = JSON.stringify(p),
    restored = projectSchema.parse(JSON.parse(raw));
  for (const piece of p.pieces.filter((x) => x.cutPlanes.length))
    assert.deepEqual(
      restored.pieces.find((x) => x.id === piece.id)!.cutPlanes,
      piece.cutPlanes,
    );
  assert.ok(
    r.cutRequirements
      .filter((c) => c.operation === "profile-cut")
      .every((c) => p.pieces.find((x) => x.id === c.partId)?.cutPlanes.length),
  );
});

test("greenhouse door swing is a real outward pivot preview and preserves unresolved installation requirements", () => {
  const closed = buildGreenhouse(blank(), greenhouse),
    open = buildGreenhouse(blank(), { ...greenhouse, doorSwing: 60 });
  const closedLeaf = closed.project.pieces
      .filter((x) => closed.geometryRoles["door-leaf"].includes(x.id))
      .map(bounds),
    openLeaf = open.project.pieces
      .filter((x) => open.geometryRoles["door-leaf"].includes(x.id))
      .map(bounds);
  near(Math.max(...closedLeaf.map((b) => b.max[2])), 48);
  assert.ok(Math.max(...openLeaf.map((b) => b.max[2])) > 60);
  assert.ok(open.unresolved.some((x) => x.id === "door-hardware"));
  assert.throws(
    () =>
      buildGreenhouse(blank(), {
        ...greenhouse,
        eaveHeight: 72,
        doorHeight: 68,
      }),
    /door does not fit/,
  );
});

test("sauna exterior framing preserves its entire reserved clear volume without inventing lining or equipment", () => {
  const r = buildSaunaCabin(blank(), {
      clearWidth: 72,
      clearDepth: 72,
      clearHeight: 84,
    }),
    p = r.project;
  assert.ok(r.geometryRoles["wall-framing"].length > 20);
  assert.ok(r.geometryRoles["ceiling-framing"].length > 3);
  assert.ok(r.geometryRoles["door-opening-framing"].length > 4);
  const clear = r.referenceVolumes.find((v) => v.role === "clear-interior")!;
  near(clear.max[0] - clear.min[0], 72);
  near(clear.max[2] - clear.min[2], 72);
  near(clear.max[1] - clear.min[1], 84);
  for (const piece of p.pieces)
    assert.ok(
      volumeOverlap(bounds(piece), clear) < 0.001,
      `${piece.name} occupies the clear sauna interior`,
    );
  assert.ok(
    p.pieces.every((x) => x.material === "stud"),
    "No ordinary plywood lining or treated interior stock is substituted.",
  );
  for (const role of [
    "saunaInterior",
    "saunaBenchFrame",
    "saunaInsulation",
    "saunaVaporBarrier",
    "saunaDoor",
  ])
    assert.ok(r.missingMaterials.some((x) => x.id === `material.${role}`));
  assert.ok(r.unresolved.some((x) => x.id === "sauna-equipment"));
  assert.ok(r.unresolved.some((x) => x.id === "sauna-bench-geometry"));
  assert.equal(r.qualifiedForConstruction, false);
});

test("closet casework contains actual bays and shelves; missing metal rods/supports are not replaced by wood boxes", () => {
  const r = buildClosetInsert(blank(), {
      width: 80,
      depth: 24,
      height: 84,
      towerWidth: 25,
      shelfCount: 4,
    }),
    p = r.project;
  assert.equal(p.pieces.length, 10);
  near(r.dimensions.leftClearBay, 26);
  near(r.dimensions.rightClearBay, 26);
  near(r.dimensions.actualPanelThickness, 0.75);
  for (let i = 0; i < p.pieces.length; i++)
    for (let j = i + 1; j < p.pieces.length; j++)
      assert.ok(
        volumeOverlap(bounds(p.pieces[i]), bounds(p.pieces[j])) < 0.001,
      );
  assert.ok(r.missingMaterials.some((x) => x.id === "material.closetRod"));
  assert.ok(
    r.missingMaterials.some((x) => x.id === "material.closetRodSupport"),
  );
  assert.ok(r.unresolved.some((x) => x.id === "closet-rod-geometry"));
  assert.ok(p.pieces.every((x) => x.material === "plywood"));
  assert.throws(
    () =>
      buildClosetInsert(blank(), {
        width: 30,
        depth: 24,
        height: 84,
        towerWidth: 29,
      }),
    /leave no valid hanging bays/,
  );
});

test("structure additions preserve prior design/settings, and role proofs cannot be supplied as forged flags", () => {
  const p = blank("Existing design");
  p.notes = "Keep notes";
  p.planLines = [{ a: [0, 0, 0], b: [12, 0, 0] }];
  p.store = "fixture-store";
  p.pieces.push(
    part(
      "Existing board",
      "stud",
      [1.5, 24, 3.5],
      [300, 12, 0],
      p.steps[0].id,
      "Existing",
    ),
  );
  const before = structuredClone(p);
  const r = buildGreenhouse(p, {
    ...greenhouse,
    origin: [20, 0, -12],
    yaw: 30,
  });
  assert.deepEqual(p, before);
  assert.deepEqual(r.project.pieces[0], p.pieces[0]);
  assert.equal(r.project.store, p.store);
  assert.deepEqual(r.project.planLines, p.planLines);
  assert.ok(r.project.notes.startsWith(p.notes));
  assert.equal(r.project.guideFingerprint, null);
  const forged = {
    greenhouseGlazing: {
      materialId: "roof",
      productRegistryRef: "simpson-sd9112r100",
      verifiedRole: "greenhouseGlazing",
      qualified: true,
    },
  } as unknown as StructureMaterials;
  const blocked = buildGreenhouse(blank(), greenhouse, forged);
  assert.ok(
    blocked.missingMaterials.some((x) => x.id === "material.greenhouseGlazing"),
  );
  assert.ok(!blocked.project.pieces.some((x) => x.material === "roof"));
  assert.throws(
    () =>
      buildGreenhouse(blank(), greenhouse, {
        frameLumber: { materialId: "roof", productRegistryRef: "missing" },
      }),
    /incompatible material is not substituted/,
  );
});

test("stock and work-zone failures remain explicit and persist in project notes", () => {
  const p = blank();
  p.workZone = { width: 60, depth: 60, height: 80 };
  const result = buildGreenhouse(p, { ...greenhouse, width: 192 });
  assert.ok(result.unresolved.some((x) => x.id === "stock-fit"));
  assert.ok(result.unresolved.some((x) => x.id === "work-zone-fit"));
  assert.ok(result.project.notes.includes("Unresolved: stock-fit"));
  assert.ok(result.project.notes.includes("Unresolved: work-zone-fit"));
  assert.equal(result.qualifiedForConstruction, false);
});

test("source-qualified SUNLITE produces real bounded glazing cuts with vertical/downslope flute directions and no wall panel over the doorway", () => {
  const result = buildGreenhouse(blank(), greenhouse, {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    }),
    p = result.project;
  const glazing = p.pieces.filter((piece) => piece.material === "sunlite-8mm");
  assert.equal(glazing.length, 31);
  assert.equal(p.pieces.length, 101);
  assert.ok(
    !result.missingMaterials.some((i) => i.id === "material.greenhouseGlazing"),
  );
  for (const role of [
    "glazing-wall-panels",
    "glazing-gable-panels",
    "glazing-roof-panels",
    "glazing-door-panels",
  ])
    assert.ok(result.geometryRoles[role]?.length, role);
  const opening = result.referenceVolumes.find(
    (v) => v.role === "door-clear-opening",
  )!;
  const doorIds = new Set(result.geometryRoles["glazing-door-panels"]);
  for (const piece of glazing) {
    const sorted = [...piece.size].sort((a, b) => a - b);
    near(sorted[0], 8 / 25.4);
    assert.ok(
      sorted[1] <= 24.001 && sorted[2] <= 96.001,
      `Uncut stock bounds: ${piece.name}`,
    );
    if (!doorIds.has(piece.id))
      assert.ok(
        volumeOverlap(bounds(piece), opening) < 0.001,
        `${piece.name} covers the door opening`,
      );
    if (result.geometryRoles["glazing-roof-panels"].includes(piece.id)) {
      assert.equal(piece.cutPlanes.length, 2);
      const axis = rotate([0, 1, 0], piece.rotation);
      near(Math.abs(axis[1] / axis[0]), 24 / 36);
      near(axis[2], 0);
      for (const face of clipBox(piece.size, piece.cutPlanes).faces.filter(
        (f) => f.kind === "cut",
      )) {
        const normal = rotate(face.normal, piece.rotation);
        near(Math.abs(normal[0]), 1);
        near(normal[1], 0);
      }
    } else if (!doorIds.has(piece.id))
      near(Math.abs(rotate([0, 1, 0], piece.rotation)[1]), 1);
  }
  const bs = p.pieces.map(bounds);
  near(Math.min(...bs.map((b) => b.min[0])), -36);
  near(Math.max(...bs.map((b) => b.max[0])), 36);
  near(Math.min(...bs.map((b) => b.min[2])), -48);
  near(Math.max(...bs.map((b) => b.max[2])), 48);
  near(Math.max(...bs.map((b) => b.max[1])), 108);
  assert.ok(
    result.unresolved.some(
      (i) =>
        i.id === "material.greenhouseGlazing.installation" &&
        i.sourceRefs.some((u) => u.includes("sunlite")),
    ),
  );
  assert.match(p.notes, /Thermal gaps/);
  assert.match(p.notes, /no system allowance deductions/);
  assert.equal(result.qualifiedForConstruction, false);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(p))).pieces,
    p.pieces,
  );
});

test("source-qualified closet rods and .703 panels use true dimensions while supports and end allowances remain unresolved", () => {
  const result = buildClosetInsert(
    blank(),
    { width: 80, depth: 24, height: 84, rodHeight: 62 },
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
      closetRod: {
        materialId: "closet-rod-72",
        productRegistryRef: "project-source-27773pholg",
      },
    },
  );
  near(result.dimensions.actualPanelThickness, 0.703);
  near(result.dimensions.leftClearBay, 26.094);
  const rods = result.project.pieces.filter(
    (p) => p.material === "closet-rod-72",
  );
  assert.equal(rods.length, 2);
  for (const rod of rods) {
    assert.deepEqual(rod.size, [1.3125, 26.094, 1.3125]);
    near(rod.position[1], 62);
    near(bounds(rod).max[0] - bounds(rod).min[0], 26.094);
    assert.equal(rod.cutPlanes.length, 0);
  }
  assert.equal(result.project.pieces.length, 12);
  assert.ok(
    result.missingMaterials.some((i) => i.id === "material.closetRodSupport"),
  );
  assert.ok(
    !result.missingMaterials.some(
      (i) =>
        i.id === "material.closetRod" || i.id === "material.caseworkPanels",
    ),
  );
  assert.match(result.project.notes, /Socket engagement/);
  assert.match(result.project.notes, /32 inches/);
  assert.match(result.project.notes, /Dry interior/);
});
