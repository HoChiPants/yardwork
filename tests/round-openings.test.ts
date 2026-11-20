import assert from "node:assert/strict";
import test from "node:test";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { blank, part, pieceSchema, projectSchema, type V3 } from "../src/model";
import { bounds, cutPiece, validate } from "../src/engine";
import { cutInstructions, cutInstructionsText } from "../src/cutInstructions";
import { pieceOverlap, prepareCollisionSolid } from "../src/solidCollision";
import { throughOpeningTriangles } from "../src/throughOpenings";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { createWoodSlide, placeWood } from "../src/placement";
import { rotate } from "../src/spatial";
import { editRoundOpening, roundOpeningMarks } from "../src/throughOpeningCuts";
import { toolChecklist } from "../src/tools";
import { dewaltJigsaw } from "../src/jigsawReference";
import { selectedToolsForProject } from "../src/toolGuide";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { homeDepotShoppingList } from "../src/handoff";

test("round geometry removes a real through hole and an edge notch from rectangular stock", () => {
  const geometry = new BufferGeometry();
  const size: V3 = [12, 8, 0.75];
  const { positions, normals, outline } = throughOpeningTriangles(size, [
    { axis: 2, center: [0, 0], diameter: 4 },
    { axis: 2, center: [6, 0], diameter: 3 },
  ]);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  const shader = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, shader);
  const hits = (x: number, y: number, side: number) =>
    new Raycaster(
      new Vector3(x, y, 5 * side),
      new Vector3(0, 0, -side),
    ).intersectObject(mesh).length > 0;
  for (const side of [-1, 1]) {
    assert.equal(hits(0, 0, side), false);
    assert.equal(hits(5.5, 0, side), false);
    assert.equal(hits(5.5, 2, side), true);
    assert.equal(hits(3, 0, side), true);
  }
  const boreWall = new Raycaster(
    new Vector3(0, 0, 0),
    new Vector3(1, 0, 0),
  ).intersectObject(mesh);
  assert.ok(Math.abs(boreWall[0].distance - 2) < 1e-6);
  for (let i = 0; i < outline.length; i += 6) {
    const [x, y, , nextX, nextY] = outline.slice(i, i + 6);
    const onBlank =
      (Math.abs(x) === 6 && x === nextX) || (Math.abs(y) === 4 && y === nextY);
    const onRim = [
      [0, 2],
      [6, 1.5],
    ].some(([cx, radius]) =>
      [Math.hypot(x - cx, y), Math.hypot(nextX - cx, nextY)].every(
        (r) => Math.abs(r - radius) < 1e-6,
      ),
    );
    assert.ok(
      onBlank || onRim,
      "draw visible edges without planar subdivision lines",
    );
  }
  geometry.dispose();
  shader.dispose();
});

test("a straight trim through an existing bore preserves the positions in both pieces and records one source", () => {
  const base = blank();
  const original = pieceSchema.parse({
    ...part(
      "Panel",
      "plywood",
      [12, 8, 0.75],
      [0, 4, 0],
      base.steps[0].id,
      "Panel",
    ),
    roundOpenings: [{ axis: 2, center: [0, 0], diameter: 4 }],
  });
  const cut = cutPiece({ ...base, pieces: [original] }, original.id, 6, 0);
  const [kept, remnant] = projectSchema.parse(cut).pieces;
  assert.equal(kept.cutStock?.id, remnant.cutStock?.id);
  for (const piece of [kept, remnant]) {
    assert.equal(piece.position[0] + piece.roundOpenings![0].center[0], 0);
    assert.equal(prepareCollisionSolid(piece)?.kind, "solid");
    assert.ok(prepareCollisionSolid(piece)?.cells?.length);
    assert.match(
      cutInstructionsText(cutInstructions(piece)),
      /Round edge cut · 4 in diameter through local Z/,
    );
  }
  assert.equal(
    pieceSchema.safeParse({
      ...original,
      roundOpenings: [{ axis: 2, center: [0, 0], diameter: 40 }],
    }).success,
    false,
  );
});

test("a rotated opening passes a fitting insert and stops a larger one through the entire continuous slide", () => {
  const base = blank();
  const rotation: V3 = [0.23, 0.45, -0.19];
  const center: V3 = [4, 14, 3];
  const shifted = (local: V3) =>
    rotate(local, rotation).map((v, i) => v + center[i]) as V3;
  const axis = rotate([0, 0, 1], rotation);
  const wall = pieceSchema.parse({
    ...part(
      "Bored wall",
      "plywood",
      [12, 12, 0.75],
      center,
      base.steps[0].id,
      "Test",
    ),
    rotation,
    roundOpenings: [{ axis: 2, center: [0, 0], diameter: 4 }],
  });
  const insert = {
    ...part(
      "Sliding insert",
      "plywood",
      [2, 2, 2],
      shifted([0, 0, -6]),
      base.steps[0].id,
      "Test",
    ),
    rotation,
  };
  const validateInsert = (size: V3, shouldHit: boolean) => {
    const actual = { ...insert, size };
    const placed = { ...actual, position: center };
    const clean = { ...base, pieces: [wall, actual] };
    assert.equal(pieceOverlap(placed, wall), shouldHit);
    const result = placeWood(clean, actual, center, rotation);
    assert.equal(result.adjusted || result.blocked, shouldHit);
    const drag = createWoodSlide(clean, actual)!;
    const through = drag(shifted([0, 0, 6]));
    assert.equal(through.stop?.kind === "wood", shouldHit);
    const { project, plan } = saveMotionPlan(clean, {
      label: "Through panel",
      memberIds: [actual.id],
      mechanism: { kind: "slide", axis, travel: 12 },
    });
    const motion = reviewMotion(project, plan);
    assert.equal(motion.hits.length, shouldHit ? 1 : 0);
    assert.deepEqual(motion.preview(0).interferenceIds, []);
    assert.deepEqual(motion.preview(12).interferenceIds, []);
    for (const [from, to] of [
      [0, 12],
      [12, 0],
    ]) {
      const playback = motion.playbackLimit(from, to);
      if (!shouldHit) assert.equal(playback.travel, to);
      else {
        assert.ok(playback.travel > 0 && playback.travel < 12);
        assert.equal(motion.hits[0].kind, "solid");
        assert.deepEqual(motion.preview(playback.travel).interferenceIds, []);
        assert.deepEqual(
          motion.preview(playback.travel, playback.inspectAt).interferenceIds,
          [actual.id, wall.id],
        );
      }
    }
    const findings = validate({ ...project, pieces: [wall, placed] });
    assert.equal(
      findings.some(({ id }) => id === "collision"),
      shouldHit,
    );
  };
  validateInsert([2, 2, 2], false);
  validateInsert([3, 3, 2], true);
});

test("turning a bored part carries the retained collision cells with its rotation", () => {
  const base = blank();
  const wall = pieceSchema.parse({
    ...part(
      "Bored leaf",
      "plywood",
      [12, 12, 0.75],
      [0, 8, 0],
      base.steps[0].id,
      "Test",
    ),
    roundOpenings: [{ axis: 2, center: [0, 0], diameter: 4 }],
  });
  const pin = part(
    "Fixed insert",
    "plywood",
    [1, 1, 2],
    wall.position,
    base.steps[0].id,
    "Test",
  );
  const design = { ...base, pieces: [wall, pin] };
  const testPivot = (pivot: V3) => {
    const { project, plan } = saveMotionPlan(design, {
      label: "Bored swing",
      memberIds: [wall.id],
      mechanism: { kind: "hinge", axis: [0, 0, 1], pivot, travel: 90 },
    });
    return reviewMotion(project, plan);
  };
  const centered = testPivot(wall.position);
  assert.equal(centered.hits.length, 0);
  assert.equal(centered.playbackLimit(0, 90).travel, 90);
  const offCenter = testPivot([0, 10.5, 0]);
  assert.deepEqual(offCenter.preview(0).interferenceIds, []);
  assert.ok(offCenter.playbackLimit(0, 90).travel < 90);
  assert.equal(offCenter.hits[0].kind, "solid");
});

test("a round edge cut can leave a narrow piece entirely above a site face height band", () => {
  const base = blank();
  const notched = pieceSchema.parse({
    ...part(
      "Notched strip",
      "plywood",
      [1, 8, 0.75],
      [0, 4, 0],
      base.steps[0].id,
      "Test",
    ),
    roundOpenings: [{ axis: 2, center: [0, -4], diameter: 4 }],
  });
  assert.ok(bounds(notched).min[1] > 1);
  const face = {
    id: base.id,
    bindingId: null,
    side: "+Z" as const,
    label: "Low lip",
    coordinate: 4,
    top: 1,
    minimum: 0,
  };
  const { project, plan } = saveMotionPlan(
    { ...base, pieces: [notched], siteClearances: [face] },
    {
      label: "Above lip",
      memberIds: [notched.id],
      mechanism: { kind: "slide", axis: [0, 0, 1], travel: 8 },
    },
  );
  const review = reviewMotion(project, plan);
  assert.equal(review.site[0].status, "outside-height");
  assert.equal(review.playbackLimit(0, 8).travel, 8);
});

test("manual edge marks stage round openings without mutating stock, then edit and remove by part", () => {
  const base = blank();
  const panel = part(
    "Cabinet panel",
    "plywood",
    [12, 8, 0.75],
    [0, 10, 0],
    base.steps[0].id,
    "Cabinet",
  );
  const project = { ...base, pieces: [panel] };
  const first = {
    axis: 2 as const,
    fromEdges: [6, 4] as [number, number],
    diameter: 2,
  };
  const applied = editRoundOpening(project, panel.id, null, first);
  assert.equal(panel.roundOpenings, undefined);
  assert.deepEqual(applied.pieces[0], {
    ...panel,
    roundOpenings: [{ axis: 2, center: [0, 0], diameter: 2 }],
  });
  const changed = { ...first, fromEdges: [-0.25, 4] as [number, number] };
  const moved = editRoundOpening(applied, panel.id, 0, changed);
  assert.deepEqual(
    roundOpeningMarks(moved.pieces[0], moved.pieces[0].roundOpenings![0]),
    changed,
  );
  assert.equal(editRoundOpening(moved, panel.id, 0, changed), moved);
  assert.deepEqual(editRoundOpening(moved, panel.id, 0, null), project);
  assert.throws(
    () => editRoundOpening(applied, panel.id, null, first),
    /remain separate/,
  );
  assert.throws(
    () =>
      editRoundOpening(applied, panel.id, 0, { ...first, fromEdges: [50, 50] }),
    /misses/,
  );
  const managed = {
    ...applied,
    pieces: applied.pieces.map((piece) => ({
      ...piece,
      roundOpenings: piece.roundOpenings?.map((opening) => ({
        ...opening,
        source: { roomId: base.id, kind: "intake" as const },
      })),
    })),
  };
  assert.throws(
    () => editRoundOpening(managed, panel.id, 0, null),
    /sauna ventilation/,
  );
});

test("a reviewed bare jigsaw supports the conditional wood-cut function and a distinct tool snapshot", () => {
  const base = { ...blank(), store: "4409" };
  const panel = part(
    "Cabinet panel",
    "plywood",
    [12, 8, 0.75],
    [0, 10, 0],
    base.steps[0].id,
    "Cabinet",
  );
  const cut = editRoundOpening({ ...base, pieces: [panel] }, panel.id, null, {
    axis: 2,
    fromEdges: [6, 4],
    diameter: 4,
  });
  const now = Date.parse("2026-11-20T08:00:00Z");
  const checkedAt = new Date(now).toISOString();
  const withReview = {
    ...cut,
    toolSelections: [{ productId: dewaltJigsaw.productId, checkedAt }],
  };
  const check = toolChecklist(
    withReview,
    selectedToolsForProject(withReview, now).tools,
    now,
  );
  const method = check.requirements.find(
    ({ capability }) => capability === "wood-pocket-cut",
  )!;
  assert.equal(method.necessity, "conditional");
  assert.equal(method.status, "supported");
  const setup = check.requirements.find(
    ({ capability }) => capability === "round-opening-setup",
  )!;
  assert.equal(setup.status, "unknown");
  assert.match(setup.sources[0].reason, /4 in opening through 0.75 in/);
  assert.doesNotMatch(homeDepotShoppingList(withReview).text, /305966991/);
  const shopping = addSupply(withReview, dewaltJigsaw.productId, 1);
  const priced = recordSupplyInventory(shopping, {
    productId: dewaltJigsaw.productId,
    retailer: "home-depot",
    retailerProductId: dewaltJigsaw.internetNumber,
    price: 149,
    available: 0,
    store: "4409",
    zip: "84121",
    checkedAt,
    url: dewaltJigsaw.listing,
  });
  const tool = supplyRows(priced, now).find(
    (row) => row.productId === dewaltJigsaw.productId,
  )!;
  assert.equal(tool.inventory?.available, 0);
  assert.equal(tool.isTool, true);
  assert.match(homeDepotShoppingList(priced).text, /1 jigsaw .*#305966991/);
  assert.deepEqual(priced.pieces, cut.pieces);
});
