import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { bom, cutPiece, guideMarkdown } from "../src/engine";
import { recordOpeningCutout } from "../src/openingCutouts";
import { planOffcutReuse } from "../src/offcutReusePlan";
import { inspectCutStock } from "../src/cutStock";
import { surfacePlacement } from "../src/editing";
import { reviewWoodSupport } from "../src/woodSupport";
import { cutInstructions, cutInstructionsText } from "../src/cutInstructions";
import {
  pieceThroughOpenings,
  throughOpeningTriangles,
} from "../src/throughOpenings";
import {
  editRoundOpening,
  editThroughOpening,
  rectangularOpeningMarks,
  type RectangularOpeningMarks,
} from "../src/throughOpeningCuts";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";

test("a measured rectangular cutout can supply another part without counting the same opening twice", () => {
  const fixture = new URL("../public/examples/cut-pool/cabinet-access-cutout.yardwork.json", import.meta.url);
  const project = projectSchema.parse(JSON.parse(readFileSync(fixture, "utf8")));
  const [panel, testBlank] = project.pieces;
  assert.throws(() => recordOpeningCutout(project, panel.id, 0, 14.125, 11), /within the saved opening/);
  const recorded = recordOpeningCutout(project, panel.id, 0, 12.5, 10.5);
  const [entry] = recorded.openingCutoutRecords!;
  assert.deepEqual(recorded.pieces[0], panel);
  assert.notEqual(entry.sourceId, panel.cutStock?.id);
  assert.ok(recorded.onHandCutSources?.includes(entry.sourceId));
  const stock = planOffcutReuse(recorded, [entry.offcutId]);
  assert.deepEqual(stock.assignments.map(({ partId }) => partId), [testBlank.id]);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(stock.project)));
  assert.equal(bom(reopened).find(({ id }) => id === panel.material)?.quantity, 0);
  assert.equal(inspectCutStock(reopened).invalid.length, 0);
  assert.match(guideMarkdown(reopened), /Complete the opening and confirm the measured cutout before using this blank\. Origin · P001/);

  const changed = editThroughOpening(reopened, panel.id, "rectangularOpenings", 0, {
    axis: 1, fromEdges: [9, 6], spans: [14, 12],
  });
  assert.throws(() => recordOpeningCutout(changed, panel.id, 0, 12, 10), /already supplied a recorded cutout/);
  assert.match(guideMarkdown(changed), /Use the previously measured cutout stock\. Earlier opening · P001/);
});

const shape = "rectangularOpenings";
function panelProject(size: V3, position: V3, name = "Panel") {
  const base = blank();
  const panel = part(
    name,
    "plywood",
    size,
    position,
    base.steps[0].id,
    "Casework",
  );
  return { project: { ...base, pieces: [panel] }, panel };
}

test("an edge notch has an open mouth and exact side walls, and reports its marks on the actual blank", () => {
  const { project, panel } = panelProject([12, 8, 0.75], [0, 5, 0]);
  const cut = editThroughOpening(project, panel.id, shape, null, {
    axis: 2,
    fromEdges: [-2, 2],
    spans: [6, 3],
  }).pieces[0];
  assert.equal(project.pieces[0].rectangularOpenings, undefined);
  const geometry = new BufferGeometry();
  const { positions, normals } = throughOpeningTriangles(
    cut.size,
    pieceThroughOpenings(cut),
  );
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  const cast = (from: V3, direction: V3) =>
    new Raycaster(
      new Vector3(...from),
      new Vector3(...direction),
    ).intersectObject(mesh);
  assert.equal(cast([-3, 0, 4], [0, 0, -1]).length, 0);
  assert.equal(cast([-3, 2, 4], [0, 0, -1])[0].distance, 3.625);
  assert.equal(cast([-10, 0, 0], [1, 0, 0])[0].distance, 8);
  geometry.dispose();
  material.dispose();
  assert.match(
    cutInstructionsText(cutInstructions(cut)),
    /Rectangular edge notch · through local Z · 0 in to 4 in from local −X edge, 2 in to 5 in from local −Y edge/,
  );
});

test("a cutout removes false shelf bearing and top hits, preserving contact on the remaining panel", () => {
  const { project, panel } = panelProject(
    [12, 0.75, 8],
    [0, 8.375, 0],
    "Shelf",
  );
  const cut = editThroughOpening(project, panel.id, shape, null, {
    axis: 1,
    fromEdges: [2, 4],
    spans: [4, 4],
  });
  assert.deepEqual(surfacePlacement(cut, [0, 20, 0], [0, -1, 0]), [0, 0, 0]);
  assert.deepEqual(surfacePlacement(cut, [3, 20, 0], [0, -1, 0]), [3, 8.75, 0]);
  const makeSupport = (x: number) =>
    part(
      "Support",
      "plywood",
      [1, 1, 1],
      [x, 7.5, 0],
      panel.stepId,
      "Casework",
    );
  const solid = makeSupport(3),
    removed = makeSupport(0);
  const verdict = reviewWoodSupport({
    ...cut,
    pieces: [...cut.pieces, solid, removed],
  });
  assert.deepEqual(verdict.get(panel.id)?.supports, [
    { pieceId: solid.id, area: 1 },
  ]);
});

test("a rectangular opening allows a fitting slide, and stops an oversized slide in both directions", () => {
  const { project, panel } = panelProject([12, 10, 0.75], [0, 8, 0]);
  const cut = editThroughOpening(project, panel.id, shape, null, {
    axis: 2,
    fromEdges: [4, 4],
    spans: [4, 2],
  });
  for (const [width, hits] of [
    [3.8, false],
    [4.2, true],
  ] as const) {
    const slider = part(
      "Slider",
      "plywood",
      [width, 1.8, 1],
      [0, 8, -6],
      panel.stepId,
      "Casework",
    );
    const saved = saveMotionPlan(
      { ...cut, pieces: [...cut.pieces, slider] },
      {
        label: "Slide through cutout",
        memberIds: [slider.id],
        mechanism: { kind: "slide", axis: [0, 0, 1], travel: 12 },
      },
    );
    const motion = reviewMotion(saved.project, saved.plan);
    assert.equal(motion.hits.length > 0, hits);
    assert.deepEqual(motion.preview(0).interferenceIds, []);
    assert.deepEqual(motion.preview(12).interferenceIds, []);
    assert.equal(motion.playbackLimit(0, 12).travel < 12, hits);
    assert.equal(motion.playbackLimit(12, 0).travel > 0, hits);
  }
});

test("shape edits reject overlaps, mixed axes and severing; trims preserve one source and opening marks", () => {
  const { project, panel } = panelProject([12, 8, 0.75], [0, 5, 0]);
  const circle = editRoundOpening(project, panel.id, null, {
    axis: 2,
    fromEdges: [9, 4],
    diameter: 2,
  });
  const marks: RectangularOpeningMarks = {
    axis: 2,
    fromEdges: [2, 2],
    spans: [4, 3],
  };
  const cut = editThroughOpening(circle, panel.id, shape, null, marks);
  assert.deepEqual(
    rectangularOpeningMarks(
      cut.pieces[0],
      cut.pieces[0].rectangularOpenings![0],
    ),
    marks,
  );
  assert.throws(
    () =>
      editThroughOpening(circle, panel.id, shape, null, {
        ...marks,
        fromEdges: [6, 2],
      }),
    /remain separate/,
  );
  assert.throws(
    () =>
      editThroughOpening(circle, panel.id, shape, null, { ...marks, axis: 0 }),
    /share a through-axis/,
  );
  assert.throws(
    () =>
      editThroughOpening(project, panel.id, shape, null, {
        ...marks,
        fromEdges: [0, 2],
        spans: [12, 1],
      }),
    /split the blank/,
  );
  const [keep, offcut] = projectSchema.parse(
    cutPiece(cut, panel.id, 4, 0),
  ).pieces;
  assert.equal(keep.cutStock?.id, offcut.cutStock?.id);
  assert.equal(keep.rectangularOpenings?.length, 1);
  assert.equal(offcut.rectangularOpenings?.length, 1);
  assert.equal(keep.roundOpenings, undefined);
  assert.equal(offcut.roundOpenings?.length, 1);
  assert.equal(
    keep.position[0] + keep.rectangularOpenings![0].center[0],
    offcut.position[0] + offcut.rectangularOpenings![0].center[0],
  );
  assert.deepEqual(editThroughOpening(cut, panel.id, shape, 0, null), circle);
  const legacy = { ...circle, schemaVersion: 42 };
  assert.equal(
    projectSchema.parse(legacy).schemaVersion,
    PROJECT_FORMAT_VERSION,
  );
  assert.deepEqual(projectSchema.parse(legacy).pieces, circle.pieces);
});

test("the rectangle preview retains the thickness axis and exact corner offset", () => {
  const { project, panel } = panelProject([48, 0.75, 96], [0, 10, 0]);
  const cut = editThroughOpening(project, panel.id, shape, null, {
    axis: 1,
    fromEdges: [-2, 10],
    spans: [8, 5],
  });
  const kept = cut.pieces[0];
  assert.deepEqual(kept.rectangularOpenings, [
    { axis: 1, center: [-46, -11.5], spans: [8, 5] },
  ]);
  assert.match(
    cutInstructionsText(cutInstructions(kept)),
    /0 in to 6 in from local −Z edge, 10 in to 15 in from local −X edge/,
  );
});
