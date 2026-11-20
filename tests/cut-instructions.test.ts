import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { endCutPlane } from "../src/cutProfiles";
import { cutInstructions, cutInstructionsText } from "../src/cutInstructions";
import { cutPiece, guideMarkdown, KERF } from "../src/engine";
import {
  createBuildFixture,
  exportBuildFixture,
  fixtureCutTable,
} from "../src/buildFixtures";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function rafter(rotation: V3 = [0, 0, 0]) {
  const project = blank();
  const piece = part(
    "Plumb-cut rafter",
    "stud",
    [1.5, 30, 3.5],
    [0, 15, 0],
    project.steps[0].id,
    "Roof",
    rotation,
  );
  piece.cutPlanes = [
    endCutPlane(piece.size, 1, false, -30, 2),
    endCutPlane(piece.size, 1, true, -30, 2),
  ];
  project.pieces = [piece];
  return { project, piece };
}

test("parallel end cuts recover signed geometric angles, retained sides and usable edge dimensions", () => {
  const { piece } = rafter();
  const plan = cutInstructions(piece);
  assert.deepEqual(plan.blankSize, [1.5, 30, 3.5]);
  assert.deepEqual(plan.stockAxes, { length: "Y", width: "Z", thickness: "X" });
  assert.deepEqual(
    plan.faces.map((face) => [
      face.kind,
      face.axis,
      face.side,
      face.retainedToward,
    ]),
    [
      ["angled-end", "Y", "start", "+Y"],
      ["angled-end", "Y", "end", "−Y"],
    ],
  );
  for (const face of plan.faces) {
    near(face.angleFromSquare, 30);
    assert.equal(face.tilts.length, 1);
    assert.equal(face.tilts[0].axis, "Z");
    near(face.tilts[0].degrees, -30);
  }
  const inset = 3.5 * Math.tan(Math.PI / 6);
  near(plan.faces[0].edgeMarks!.negativeEdgeFromStart, 0);
  near(plan.faces[0].edgeMarks!.positiveEdgeFromStart, inset);
  near(plan.faces[1].edgeMarks!.negativeEdgeFromStart, 30 - inset);
  near(plan.faces[1].edgeMarks!.positiveEdgeFromStart, 30);
  near(plan.centerline!.length, 30 - inset);
  const text = cutInstructionsText(plan);
  assert.match(text, /Angled end face at −Y: 30° from square/);
  assert.match(text, /Angled end face at \+Y: 30° from square/);
  assert.match(text, /Keep material toward \+Y/);
  assert.match(text, /Keep material toward −Y/);
  assert.match(text, /not dimensions/);
  assert.match(text, /no safe or certified blade setup is established/);
});

test("stock axis and sign recovery work for each length axis, steep cuts and either tilt direction", () => {
  for (const axis of [0, 1, 2] as const)
    for (const angle of [-75, 45]) {
      const tilt = ((axis + 1) % 3) as 0 | 1 | 2;
      const { piece } = rafter();
      piece.size = [1.5, 1.5, 1.5];
      piece.size[axis] = 30;
      piece.size[tilt] = 3.5;
      piece.cutPlanes = [endCutPlane(piece.size, axis, true, angle, tilt)];
      const plan = cutInstructions(piece),
        face = plan.faces[0];
      assert.equal(plan.stockAxes.length, ["X", "Y", "Z"][axis]);
      near(face.angleFromSquare, Math.abs(angle));
      near(face.tilts[0].degrees, angle);
      near(
        plan.centerline!.length,
        30 - 1.75 * Math.abs(Math.tan((angle * Math.PI) / 180)),
      );
    }
});

test("placed stock rotation changes world directions without changing local cut dimensions or angles", () => {
  const first = cutInstructions(rafter().piece);
  const turned = cutInstructions(rafter([0, 0, Math.PI / 2]).piece);
  assert.deepEqual(turned.blankSize, first.blankSize);
  assert.deepEqual(turned.centerline, first.centerline);
  assert.deepEqual(
    turned.orientation.find((axis) => axis.localAxis === "Y")!.worldDirection,
    [-1, 0, 0],
  );
  near(turned.faces[1].worldNormal[0], -Math.cos(Math.PI / 6));
  near(turned.faces[1].worldNormal[1], 0);
  near(turned.faces[1].worldNormal[2], -0.5);
  assert.equal(turned.faces[1].angleFromSquare, first.faces[1].angleFromSquare);
});

test("square trims retain original source coordinates and modeled kerf without inferring a profile setup", () => {
  const project = blank();
  const board = part(
    "Board",
    "stud",
    [1.5, 96, 3.5],
    [0, 48, 0],
    project.steps[0].id,
    "Frame",
  );
  project.pieces = [board];
  const cut = cutPiece(project, board.id, 48),
    kept = cut.pieces[0],
    spare = cut.pieces[1];
  const instructions = cutInstructions(kept, {
    kerf: KERF,
    lineageStatus: "validated",
  });
  assert.deepEqual(instructions.faces, []);
  assert.deepEqual(instructions.source!.size, [1.5, 96, 3.5]);
  assert.deepEqual(instructions.source!.regionEnd, [1.5, 48, 3.5]);
  assert.equal(instructions.source!.kerf, 0.125);
  assert.match(
    cutInstructionsText(instructions),
    /No active profiled faces recorded/,
  );
  const offcut = cutInstructions(spare, {
    kerf: KERF,
    lineageStatus: "validated",
  });
  near(offcut.source!.offset[1], 48.125);
  near(offcut.blankSize[1], 47.875);
  assert.equal(offcut.source!.offcut, true);
  assert.match(
    cutInstructionsText(cutInstructions(spare)),
    /Source lineage is unverified/,
  );
  const guide = guideMarkdown(cut);
  assert.match(guide, /Modeled straight-trim kerf: 0.125 in/);
  assert.match(guide, /## Recorded offcuts/);
  assert.match(guide, /Y 48.125 to 96 in/);
  assert.throws(() => cutInstructions(kept, { kerf: NaN }), /finite/);
});

test("redundant planes are omitted and arbitrary compound geometry is never reduced to a machine setup", () => {
  const { piece } = rafter();
  piece.size = [4, 10, 4];
  piece.cutPlanes = [
    { normal: [0, 1, 0], constant: 5 },
    { normal: [0, 1, 0], constant: 4 },
    { normal: [0, 1, 0], constant: 4 },
  ];
  const square = cutInstructions(piece);
  assert.equal(square.inactivePlaneCount, 2);
  assert.equal(square.faces.length, 1);
  assert.equal(square.faces[0].planeIndex, 1);
  assert.equal(square.faces[0].kind, "square-end");
  near(square.centerline!.length, 9);
  piece.cutPlanes = [
    {
      normal: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
      constant: 4,
    },
  ];
  const compound = cutInstructions(piece);
  assert.equal(compound.faces[0].kind, "compound-profile");
  assert.equal(compound.faces[0].edgeMarks, null);
  assert.equal(compound.faces[0].tilts.length, 2);
  near(
    compound.faces[0].angleFromSquare,
    (Math.acos(1 / Math.sqrt(3)) * 180) / Math.PI,
  );
  assert.match(cutInstructionsText(compound), /Compound profile face/);
  assert.match(
    cutInstructionsText(compound),
    /Machine miter\/bevel settings.*require a separate tool-specific setup review/,
  );
});

test("a short retained block keeps validated source length orientation after crossing its width", () => {
  const project = blank();
  const board = part(
    "Small block",
    "stud",
    [1.5, 96, 3.5],
    [0, 48, 0],
    project.steps[0].id,
    "Frame",
  );
  project.pieces = [board];
  const cut = cutPiece(project, board.id, 2);
  const plan = cutInstructions(cut.pieces[0], {
    lineageStatus: "validated",
    kerf: KERF,
  });
  assert.equal(plan.stockAxes.length, "Y");
  assert.equal(plan.stockAxes.width, "Z");
  assert.equal(plan.stockAxesBasis, "validated-source");
  near(plan.centerline!.length, 2);
  assert.equal(cutInstructions(cut.pieces[0]).stockAxesBasis, "bounding-blank");
});

test("greenhouse JSON, guide and grouped cut-table export preserve intelligible per-part plumb cuts", () => {
  const baseline = createBuildFixture("greenhouse");
  const piece = baseline.project.pieces.find((p) =>
    p.name.endsWith("plumb-cut rafter"),
  )!;
  assert.ok(piece);
  const restored = projectSchema.parse(
    JSON.parse(JSON.stringify(baseline.project)),
  );
  assert.deepEqual(
    cutInstructions(restored.pieces.find((p) => p.id === piece.id)!),
    cutInstructions(piece),
  );
  const row = fixtureCutTable(restored).find((row) =>
    row.partIds.includes(piece.id),
  )!;
  assert.equal(Object.keys(row.perPartCutInstructions).length, row.quantity);
  const exported = JSON.parse(
    exportBuildFixture({ ...baseline, project: restored }),
  );
  const document = exported.assessment.cutRows.find(
    (row: { partIds: string[] }) => row.partIds.includes(piece.id),
  ).perPartCutInstructions[piece.id];
  assert.equal(document.geometry.faces.length, 2);
  assert.deepEqual(document.geometry.blankSize, piece.size);
  assert.match(document.text, /Blank before profiles: X 1.5 in × Y/);
  assert.match(document.text, /Angled end face at −Y/);
  assert.match(document.text, /Angled end face at \+Y/);
  const guide = guideMarkdown(restored);
  assert.match(guide, /signed plane projection tilt -/);
  assert.match(guide, /Face marks:/);
  assert.match(guide, /Geometric plane angles only/);
});
