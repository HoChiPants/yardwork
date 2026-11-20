import assert from "node:assert/strict";
import test from "node:test";
import { cutDiagram } from "../src/cutDiagram";
import { cutInstructions } from "../src/cutInstructions";
import { cutAngledEnd, resizeByCuts } from "../src/cutPlan";
import { clipBox, solidVolume } from "../src/cutProfiles";
import { cutStockLayout, cutStockLayoutMarkdown } from "../src/cutStockLayout";
import { bom, guideMarkdown, inspectCutStock, KERF } from "../src/engine";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { rotate } from "../src/spatial";
import { toolChecklist } from "../src/tools";

function stock(material: "stud" | "plywood", size: V3) {
  const project = blank();
  const piece = part(
    "Test stock",
    material,
    size,
    [32, 18, -44],
    project.steps[0].id,
    "Test",
    [0.27, 0.85, 0.21],
  );
  project.pieces = [piece];
  return { project, piece };
}

const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

test("miter keeps physical kerf between rotated fragments, retains one source and generates guide and tool needs", () => {
  const { project, piece } = stock("stud", [1.5, 3.5, 96]);
  const immutable = JSON.stringify(project);
  const cut = cutAngledEnd(project, piece.id, "width", [36, 39.5], "start");
  assert.equal(JSON.stringify(project), immutable);
  const [kept, offcut] = cut.pieces;
  assert.equal(kept.id, piece.id);
  assert.equal(offcut.offcut, true);
  assert.equal(kept.cutStock?.id, offcut.cutStock?.id);
  const sourceId = kept.cutStock!.id;
  assert.deepEqual(inspectCutStock(cut).invalid, []);
  const halfRunOfKerf = (KERF * Math.SQRT2) / 2;
  near(kept.size[2], 39.5 - halfRunOfKerf);
  near(offcut.cutStock!.offset[2], 36 + halfRunOfKerf);
  const firstEnd = rotate([0, 0, -piece.size[2] / 2], piece.rotation);
  const newEnd = rotate([0, 0, -kept.size[2] / 2], kept.rotation);
  firstEnd.forEach((value, axis) =>
    near(value + piece.position[axis], newEnd[axis] + kept.position[axis]),
  );
  near(
    cut.pieces.reduce(
      (volume, p) => volume + solidVolume(clipBox(p.size, p.cutPlanes)),
      0,
    ),
    1.5 * 3.5 * (96 - KERF * Math.SQRT2),
  );
  const reused = projectSchema.parse({
    ...cut,
    pieces: [
      kept,
      { ...offcut, offcut: false, position: [48, 14, -7], rotation: [0, 0, 0] },
    ],
  });
  assert.equal(
    bom(reused).find((row) => row.id === "stud")?.physicalStockUnits,
    1,
  );
  const layout = cutStockLayout(reused, sourceId);
  assert.equal(layout.state, "profile-review");
  assert.equal(layout.gapsComplete, false);
  assert.equal(layout.profiles?.length, 2);
  assert.ok(layout.profiles?.every(({ regions }) => regions.length === 2));
  assert.match(guideMarkdown(reused), /Angled end face[^\n]+45° from square/);
  assert.match(
    cutStockLayoutMarkdown(reused, sourceId),
    /retained solids leave the modeled saw gap/,
  );
  assert.ok(
    toolChecklist(reused).requirements.some(
      (row) => row.capability === "wood-angle-crosscut",
    ),
  );

  const forged = structuredClone(reused);
  // Shift the second source reservation toward the kept part, preserving its measured assembly pose.
  forged.pieces[1].cutStock!.offset[2] -= KERF / 2;
  assert.equal(inspectCutStock(forged).invalid.length, 1);
});

test("bevel chooses either side and remains valid after trimming the reusable panel", () => {
  const { project, piece } = stock("plywood", [48, 0.75, 96]);
  const cut = cutAngledEnd(project, piece.id, "thickness", [51, 51.75], "end");
  const [kept, offcut] = cut.pieces;
  const preview = cutDiagram(project, piece.id, cut, "thickness");
  assert.equal(preview.width, 0.75);
  assert.ok(Math.min(...preview.retained.map(([, y]) => y)) > 51);
  assert.ok(Math.max(...preview.offcuts[0].points.map(([, y]) => y)) < 51.75);
  assert.ok(kept.cutStock!.offset[2] > 51);
  assert.equal(offcut.cutStock!.offset[2], 0);
  const later = resizeByCuts(cut, offcut.id, 42, 24);
  assert.deepEqual(inspectCutStock(later).invalid, []);
  assert.equal(
    bom(later).find((row) => row.id === "plywood")?.physicalStockUnits,
    1,
  );
  assert.equal(later.pieces.length, 4);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(later))).pieces,
    later.pieces,
  );
});

test("three corner marks produce one compound plane and two reusable fragments with the correct gap", () => {
  const { project, piece } = stock("stud", [1.5, 3.5, 96]);
  for (const side of ["start", "end"] as const) {
    const cut = cutAngledEnd(
      project,
      piece.id,
      "compound",
      [36, 39.5, 36.75],
      side,
    );
    const [kept, offcut] = cut.pieces;
    assert.equal(kept.id, piece.id);
    assert.equal(offcut.offcut, true);
    assert.equal(kept.cutStock!.id, offcut.cutStock!.id);
    const sign = side === "start" ? 1 : -1;
    const expected: V3 = [-sign / 3, (-2 * sign) / 3, (2 * sign) / 3];
    kept.cutPlanes[0].normal.forEach((value, axis) =>
      near(value, expected[axis]),
    );
    near(
      cut.pieces.reduce(
        (volume, p) => volume + solidVolume(clipBox(p.size, p.cutPlanes)),
        0,
      ),
      1.5 * 3.5 * (96 - 1.5 * KERF),
    );
    assert.deepEqual(inspectCutStock(cut).invalid, []);
    assert.equal(
      cutStockLayout(cut, kept.cutStock!.id).state,
      "profile-review",
    );
    const face = cutInstructions(kept, { lineageStatus: "validated" }).faces[0];
    assert.equal(face.kind, "compound-profile");
    assert.deepEqual(
      face.cornerMarks?.map(({ width, thickness }) => [width, thickness]),
      [
        ["−Y", "−X"],
        ["+Y", "−X"],
        ["−Y", "+X"],
        ["+Y", "+X"],
      ],
    );
    near(face.cornerMarks![3].fromStart - face.cornerMarks![0].fromStart, 4.25);
    const reused = projectSchema.parse({
      ...cut,
      pieces: [kept, { ...offcut, offcut: false }],
    });
    assert.equal(
      bom(reused).find(({ id }) => id === "stud")?.physicalStockUnits,
      1,
    );
    assert.match(
      guideMarkdown(reused),
      /Compound profile face[\s\S]*Retained face corner marks/,
    );
    assert.ok(
      toolChecklist(reused).requirements.some(
        ({ capability }) => capability === "wood-angle-crosscut",
      ),
    );
  }
});

test("invalid marks leave the project unchanged", () => {
  const { project, piece } = stock("stud", [1.5, 3.5, 96]);
  const before = JSON.stringify(project);
  assert.throws(
    () => cutAngledEnd(project, piece.id, "width", [8, NaN], "start"),
    /both edge marks/,
  );
  assert.throws(
    () => cutAngledEnd(project, piece.id, "width", [8, 8], "start"),
    /different edge marks/,
  );
  assert.throws(
    () => cutAngledEnd(project, piece.id, "width", [0.1, 60], "start"),
    /room for the saw kerf/,
  );
  assert.throws(
    () => cutAngledEnd(project, piece.id, "compound", [80, 91, 87], "start"),
    /all four corner marks/,
  );
  assert.throws(
    () => cutAngledEnd(project, piece.id, "compound", [36, 39], "start"),
    /all four corner marks/,
  );
  assert.equal(JSON.stringify(project), before);
});
