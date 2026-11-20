import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  part,
  projectSchema,
  type Project,
  type V3,
} from "../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../src/planning";
import { bounds, bom, cutPiece } from "../src/engine";
import { endCutPlane } from "../src/cutProfiles";
import { composeRotation, inverseRotation, rotate } from "../src/spatial";
import {
  duplicateSection,
  previewRecipeResize,
  recipeModified,
  resizeRecipeSection,
  setSectionLidOpen,
  transformSection,
} from "../src/sections";

function storageProject() {
  return applyIdeaPlan(
    blank("Storage seating"),
    localIdeaPlan({
      prompt:
        "A banquette 6 feet wide, 24 inches deep, 18 inches seat height with three sections, opening lids and no back, with storage",
    }),
  );
}
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);
const sameGeometry = (a: Project, b: Project) =>
  a.pieces.every((p, i) => {
    const q = b.pieces[i];
    return (
      p.size.every((v, j) => Math.abs(v - q.size[j]) < 0.001) &&
      p.position.every((v, j) => Math.abs(v - q.position[j]) < 0.001) &&
      rotate([0, 1, 0], p.rotation).every(
        (v, j) => Math.abs(v - rotate([0, 1, 0], q.rotation)[j]) < 0.001,
      )
    );
  });

test("lid access preview rotates around the rear edge and returns to the exact closed geometry", () => {
  const p = storageProject(),
    section = p.sections[0],
    lid = p.pieces.find(
      (x) => section.pieceIds.includes(x.id) && x.name.endsWith("seat lid"),
    )!;
  const opened = setSectionLidOpen(p, section.id, true),
    o = opened.pieces.find((x) => x.id === lid.id)!;
  assert.equal(opened.sections[0].recipe?.lidOpen, true);
  assert.deepEqual(o.size, lid.size);
  assert.ok(bounds(o).max[1] > bounds(lid).max[1] + 12);
  const rearCorner: V3 = [0, -lid.size[1] / 2, -lid.size[2] / 2];
  const before = rotate(rearCorner, lid.rotation).map(
    (v, i) => v + lid.position[i],
  );
  const after = rotate(rearCorner, o.rotation).map((v, i) => v + o.position[i]);
  before.forEach((v, i) => near(v, after[i]));
  assert.deepEqual(opened.sections[1], p.sections[1]);
  assert.deepEqual(opened.sections[2], p.sections[2]);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(opened)));
  assert.equal(restored.sections[0].recipe?.lidOpen, true);
  const closed = setSectionLidOpen(restored, section.id, false);
  assert.ok(sameGeometry(p, closed));
  assert.equal(recipeModified(closed, closed.sections[0]), false);
});

test("lid preview preserves edited stock, profiles, lineage and pose across JSON reopening and closing", () => {
  let p = storageProject();
  const id = p.sections[0].id;
  p = transformSection(p, id, [36, 4, -12], [0.2, 0.7, -0.1]);
  const lidId = p.pieces.find(
    (piece) =>
      p.sections[0].pieceIds.includes(piece.id) &&
      piece.name.endsWith("seat lid"),
  )!.id;
  p = cutPiece(p, lidId, 12, 0);
  p = cutPiece(p, lidId, 20, 2);
  const actual = p.pieces.find((piece) => piece.id === lidId)!;
  actual.cutPlanes = [endCutPlane(actual.size, 2, true, 15, 0)];
  actual.name = "Custom trimmed seat lid";
  actual.position = actual.position.map((v, i) => v + [1, 2, 3][i]) as V3;
  actual.rotation = composeRotation([0.05, 0.1, 0], actual.rotation);
  const before = structuredClone(p),
    quantity = bom(p).find((row) => row.id === "plywood")!.quantity;
  const opened = setSectionLidOpen(p, id, true),
    openLid = opened.pieces.find((piece) => piece.id === lidId)!;
  assert.deepEqual(openLid.size, actual.size);
  assert.deepEqual(openLid.cutPlanes, actual.cutPlanes);
  assert.deepEqual(openLid.cutStock, actual.cutStock);
  assert.equal(openLid.name, actual.name);
  assert.equal(setSectionLidOpen(opened, id, true), opened);
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(opened)));
  const closed = setSectionLidOpen(restored, id, false),
    closedLid = closed.pieces.find((piece) => piece.id === lidId)!;
  assert.deepEqual(closedLid.size, actual.size);
  assert.deepEqual(closedLid.cutPlanes, actual.cutPlanes);
  assert.deepEqual(closedLid.cutStock, actual.cutStock);
  assert.equal(closedLid.name, actual.name);
  closedLid.position.forEach((v, i) => near(v, actual.position[i]));
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as V3[]) {
    const a = rotate(axis, actual.rotation),
      b = rotate(axis, closedLid.rotation);
    a.forEach((v, i) => near(v, b[i]));
  }
  assert.deepEqual(
    closed.pieces.filter((piece) => piece.offcut),
    before.pieces.filter((piece) => piece.offcut),
  );
  assert.equal(
    bom(closed).find((row) => row.id === "plywood")!.quantity,
    quantity,
  );
  assert.deepEqual(p, before);
});

test("storage shell encloses the bottom and all four sides without interpenetrating its own parts", () => {
  const p = storageProject(),
    s = p.sections[0],
    pieces = p.pieces.filter((x) => s.pieceIds.includes(x.id));
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = bounds(pieces[i]),
        b = bounds(pieces[j]);
      const volume = [0, 1, 2].reduce(
        (n, k) =>
          n *
          Math.max(
            0,
            Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]),
          ),
        1,
      );
      assert.ok(
        volume < 0.001,
        `${pieces[i].name} intersects ${pieces[j].name}: ${volume}`,
      );
    }
  const bottom = pieces.find((x) => x.name.endsWith("storage bottom"))!;
  near(bounds(bottom).min[1], 0);
  assert.ok(pieces.some((x) => x.name.endsWith("storage front")));
  assert.ok(pieces.some((x) => x.name.endsWith("storage rear")));
});

test("resizing a rotated recipe preserves pose and unrelated parts while keeping board and panel cross-sections", () => {
  let p = storageProject(),
    id = p.sections[0].id;
  p = transformSection(p, id, [36, 4, -12], [0.15, 0.7, -0.1]);
  p.notes = "Keep notes";
  p.store = "4409";
  p.planLines = [{ a: [0, 0, 0], b: [12, 0, 0] }];
  const s = p.sections[0],
    otherIds = new Set(p.sections.slice(1).flatMap((x) => x.pieceIds)),
    others = p.pieces.filter((x) => otherIds.has(x.id));
  const next = resizeRecipeSection(p, id, { width: 30, depth: 26, height: 20 });
  assert.deepEqual(next.sections[0].origin, s.origin);
  assert.deepEqual(next.sections[0].rotation, s.rotation);
  assert.equal(next.sections[0].recipe?.width, 30);
  assert.equal(next.sections[0].recipe?.height, 20);
  assert.deepEqual(
    next.pieces.filter((x) => otherIds.has(x.id)),
    others,
  );
  assert.equal(next.notes, p.notes);
  assert.equal(next.store, p.store);
  assert.deepEqual(next.planLines, p.planLines);
  const updated = next.pieces.filter((x) =>
    next.sections[0].pieceIds.includes(x.id),
  );
  for (const piece of updated) {
    const sizes = [...piece.size].sort((a, b) => a - b);
    if (piece.material === "stud") {
      near(sizes[0], 1.5);
      near(sizes[1], 3.5);
    } else near(sizes[0], 0.75);
  }
  const local = updated.map((x) => ({
    ...x,
    position: rotate(
      x.position.map((v, i) => v - s.origin[i]) as V3,
      inverseRotation(s.rotation),
    ),
    rotation: composeRotation(inverseRotation(s.rotation), x.rotation),
  }));
  const bs = local.map(bounds);
  near(
    Math.max(...bs.map((b) => b.max[0])) - Math.min(...bs.map((b) => b.min[0])),
    30,
  );
  near(
    Math.max(...bs.map((b) => b.max[2])) - Math.min(...bs.map((b) => b.min[2])),
    26,
  );
  near(Math.max(...bs.map((b) => b.max[1])), 20);
  assert.equal(next.guideFingerprint, null);
  assert.equal(recipeModified(next, next.sections[0]), false);
});

test("recipe rebuild preview counts affected connections and warns that manual geometry will reset", () => {
  let p = storageProject(),
    s = p.sections[0];
  const member = p.pieces.find((x) => s.pieceIds.includes(x.id))!;
  p.pieces.push(
    part(
      "Unrelated",
      "stud",
      [1.5, 24, 3.5],
      [200, 12, 0],
      p.steps[0].id,
      "Loose",
    ),
  );
  p.joints.push({
    id: crypto.randomUUID(),
    a: member.id,
    b: p.pieces.at(-1)!.id,
    kind: "screw",
    quantity: 2,
    length: 3,
    stepId: member.stepId,
  });
  p.pieces.find((x) => x.id === member.id)!.position[0] += 1;
  assert.equal(recipeModified(p, s), true);
  const preview = previewRecipeResize(p, s.id, {
    width: 30,
    depth: 24,
    height: 18,
  });
  assert.equal(preview.manualEdits, true);
  assert.equal(preview.removedConnections, 1);
  assert.equal(preview.project.joints.length, 0);
  assert.equal(p.joints.length, 1);
  assert.equal(
    recipeModified(preview.project, preview.project.sections[0]),
    false,
  );
});

test("section copies and transforms synchronize their recipes; legacy JSON without recipes remains importable", () => {
  const p = storageProject(),
    id = p.sections[0].id,
    { project: copy, sectionId } = duplicateSection(p, id),
    s = copy.sections.find((x) => x.id === sectionId)!;
  assert.deepEqual(s.recipe?.position, s.origin);
  assert.equal(s.recipe?.name, s.name);
  assert.equal(recipeModified(copy, s), false);
  const moved = transformSection(
      copy,
      sectionId,
      [40, 0, 16],
      [0, Math.PI / 2, 0],
    ),
    m = moved.sections.find((x) => x.id === sectionId)!;
  assert.deepEqual(m.recipe?.position, m.origin);
  near(m.recipe!.yaw, 90);
  assert.equal(recipeModified(moved, m), false);
  const raw = JSON.parse(JSON.stringify(p));
  for (const section of raw.sections) delete section.recipe;
  const old = projectSchema.parse(raw);
  assert.ok(old.sections.every((x) => x.recipe === null));
  assert.throws(
    () => resizeRecipeSection(old, id, { width: 30, depth: 24, height: 18 }),
    /recipe section/,
  );
});
