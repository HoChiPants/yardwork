import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  catalog,
  material,
  part,
  projectSchema,
  uid,
} from "../src/model";
import {
  addMaterial,
  bom,
  bounds,
  connect,
  cutPiece,
  guideMarkdown,
  hardwareForJoint,
  validate,
  KERF,
} from "../src/engine";

function touchingBoards() {
  const p = blank("Joinery study");
  p.pieces = [
    part("A", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
    part("B", "stud", [1.5, 36, 3.5], [1.5, 18, 0], p.steps[0].id, "Frame"),
  ];
  return p;
}

test("expanded stock retains actual dimensions and distinct purchase lengths", () => {
  assert.ok(catalog.length >= 20);
  assert.deepEqual(material("two-eight").size, [1.5, 96, 7.25]);
  assert.deepEqual(material("one-four").size, [0.75, 96, 3.5]);
  assert.equal(material("stud-12").size[1], 144);
  for (const m of catalog) {
    const base = blank(m.name);
    const p = addMaterial(base, m.id, [0, 0, 0], base.steps[0].id);
    assert.equal(
      bom(p)[0].quantity,
      m.orderRollWidth ? Math.ceil(m.size[0] / 12) : 1,
      `one default ${m.id} uses the matching purchase unit`,
    );
    if (m.stockKind === "linear") {
      const cut = cutPiece(p, p.pieces[0].id, 30);
      assert.equal(
        bom(cut)[0].quantity,
        1,
        `cut/offcut share stock for ${m.id}`,
      );
    }
  }
});

test("nails, brackets, and different screw sizes use separate purchase rows", () => {
  let p = touchingBoards();
  const [a, b] = p.pieces;
  p = connect(p, a.id, b.id, p.steps[0].id, 60, 3, "nail", "nail");
  p = connect(p, a.id, b.id, p.steps[0].id, 41, 3, "nail", "nail");
  p = connect(p, a.id, b.id, p.steps[0].id, 3, 3, "bracket", "bracket");
  p = connect(p, a.id, b.id, p.steps[0].id, 4, 1.25, "screw", "screw-short");
  p = connect(p, a.id, b.id, p.steps[0].id, 4, 3);
  const rows = bom(p);
  assert.equal(rows.find((r) => r.id === "nail")?.quantity, 2);
  assert.equal(rows.find((r) => r.id === "bracket")?.quantity, 3);
  assert.equal(rows.find((r) => r.id === "screw-short")?.quantity, 1);
  assert.equal(rows.find((r) => r.id === "screw")?.quantity, 1);
  assert.match(
    guideMarkdown(p),
    /60 × 3 in framing nails: P001 · A → P002 · B/,
  );
  assert.match(guideMarkdown(p), /3 × 2 in angle bracket: P001 · A → P002 · B/);
  assert.doesNotThrow(() => projectSchema.parse(p));
  assert.throws(
    () => connect(p, a.id, b.id, p.steps[0].id, 2, 2, "screw", "screw"),
    /matching catalog/,
  );
  assert.throws(
    () => connect(p, a.id, b.id, p.steps[0].id, 2, 3, "nail", "screw"),
    /matching catalog/,
  );
});

test("legacy joints retain exact hardware sizing and unmatched lengths are unresolved", () => {
  let p = touchingBoards();
  const [a, b] = p.pieces;
  p = connect(p, a.id, b.id, p.steps[0].id);
  delete p.joints[0].material;
  assert.equal(hardwareForJoint(p.joints[0])?.id, "screw");
  assert.equal(bom(p).find((r) => r.id === "screw")?.quantity, 1);
  p.joints[0].length = 2;
  assert.equal(hardwareForJoint(p.joints[0]), undefined);
  assert.equal(bom(p).find((r) => r.id === "screw")?.quantity, undefined);
  assert.ok(validate(p).some((f) => f.id === `hardware-${p.joints[0].id}`));
});

test("straight cuts can use local panel width and retain rotated offcuts and kerf", () => {
  const p = blank();
  const panel = part(
    "Seat",
    "plywood-half",
    [48, 15 / 32, 96],
    [0, 30, 0],
    p.steps[0].id,
    "Seat",
    [0, Math.PI / 2, 0],
  );
  p.pieces = [panel];
  const next = cutPiece(p, panel.id, 18, 0);
  const cut = next.pieces[0],
    offcut = next.pieces[1];
  assert.equal(cut.size[0], 18);
  assert.equal(offcut.size[0], 48 - 18 - KERF);
  assert.equal(cut.size[2], 96);
  assert.ok(
    Math.abs(bounds(cut).min[2] - bounds(panel).min[2]) < 1e-8 ||
      Math.abs(bounds(cut).max[2] - bounds(panel).max[2]) < 1e-8,
  );
  assert.ok(Math.abs(cut.position[0]) < 1e-8);
  assert.ok(offcut.offcut);
  assert.throws(() => cutPiece(p, panel.id, 18, 4), /local X/);
  const hardware = addMaterial(blank(), "bracket", [0, 0, 0], p.steps[0].id);
  assert.throws(
    () => cutPiece(hardware, hardware.pieces[0].id, 1),
    /Hardware cannot be cut/,
  );
});

test("hardware does not create false support paths or solid collision warnings", () => {
  const p = blank();
  p.pieces = [
    part(
      "Floating wood",
      "stud",
      [1.5, 10, 3.5],
      [0, 8, 0],
      p.steps[0].id,
      "Frame",
    ),
    part(
      "Ground nail",
      "nail",
      [0.13, 3, 0.13],
      [0, 1.5, 0],
      p.steps[0].id,
      "Hardware",
    ),
    part(
      "Bracket sketch",
      "bracket",
      [2, 2, 1.5],
      [0, 5, 0],
      p.steps[0].id,
      "Hardware",
    ),
  ];
  const findings = validate(p);
  assert.ok(
    findings.some((f) => f.id === "floating" && f.pieceId === p.pieces[0].id),
  );
  assert.ok(!findings.some((f) => f.id === "collision"));
});

test("work zone defaults preserve older projects and rotated extents are checked", () => {
  const p = blank();
  const legacy = { ...p } as Record<string, unknown>;
  delete legacy.workZone;
  delete legacy.guideFingerprint;
  const migrated = projectSchema.parse(legacy);
  assert.equal(migrated.workZone, null);
  assert.equal(migrated.guideFingerprint, null);
  p.workZone = { width: 48, depth: 48, height: 48 };
  p.pieces = [
    part("Beam", "stud", [1.5, 36, 3.5], [20, 20, 0], p.steps[0].id, "Frame", [
      0,
      0,
      Math.PI / 2,
    ]),
  ];
  assert.ok(validate(p).some((f) => f.id === "work-zone"));
  p.pieces[0].position = [0, 20, 0];
  assert.ok(!validate(p).some((f) => f.id === "work-zone"));
});

test("brackets still require a manufacturer-specific fastening schedule", () => {
  let p = touchingBoards();
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    2,
    3,
    "bracket",
    "bracket",
  );
  assert.ok(
    validate(p).some((f) => f.title === "Specify bracket fasteners separately"),
  );
});

test("furniture frame advice remains actionable when seat and back panels are present", () => {
  const p = blank("Banquette frame");
  p.pieces = [
    part(
      "Left leg",
      "stud",
      [1.5, 16, 3.5],
      [-20, 8, 0],
      p.steps[0].id,
      "Bench",
    ),
    part(
      "Right leg",
      "stud",
      [1.5, 16, 3.5],
      [20, 8, 0],
      p.steps[0].id,
      "Bench",
    ),
    part(
      "Front rail",
      "stud",
      [40, 3.5, 1.5],
      [0, 14, 9],
      p.steps[0].id,
      "Bench",
    ),
    part(
      "Back rail",
      "stud",
      [40, 3.5, 1.5],
      [0, 14, -9],
      p.steps[0].id,
      "Bench",
    ),
  ];
  const sectionId = uid();
  p.sections = [
    {
      id: sectionId,
      name: "Banquette frame",
      pieceIds: p.pieces.map((piece) => piece.id),
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      generator: null,
      recipe: null,
    },
  ];
  const before = validate(p).filter(
    (finding) => finding.id === `furniture-frame-${sectionId}`,
  );
  assert.equal(before.length, 1);
  assert.match(before[0].title, /Review lateral bracing and frame joints/);
  assert.match(before[0].detail, /2 upright members and 2 horizontal rails/);
  assert.match(before[0].detail, /designed diagonal brace/);
  assert.equal(before[0].pieceId, p.pieces[0].id);
  p.pieces.push(
    part(
      "Seat",
      "plywood",
      [44, 0.75, 24],
      [0, 16.375, 0],
      p.steps[0].id,
      "Bench",
    ),
    part(
      "Back",
      "plywood",
      [44, 18, 0.75],
      [0, 25, -12],
      p.steps[0].id,
      "Bench",
    ),
  );
  p.sections[0].pieceIds = p.pieces.map((piece) => piece.id);
  const after = validate(p).filter(
    (finding) => finding.id === `furniture-frame-${sectionId}`,
  );
  assert.equal(after.length, 1);
  assert.match(after[0].detail, /2 panel\(s\) are present/);
  assert.match(
    after[0].detail,
    /presence alone does not establish effective bracing/,
  );
  assert.ok(!/safe to build|capacity verified/.test(after[0].detail));
});

test("a few horizontal loose boards are not mislabeled as an upright furniture frame", () => {
  const p = blank();
  p.pieces = [0, 1, 2, 3].map((i) =>
    part(
      `Rail ${i}`,
      "stud",
      [36, 1.5, 3.5],
      [0, 0.75, i * 5],
      p.steps[0].id,
      "Stock",
    ),
  );
  p.sections = [
    {
      id: uid(),
      name: "Stock",
      pieceIds: p.pieces.map((piece) => piece.id),
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      generator: null,
      recipe: null,
    },
  ];
  assert.ok(
    !validate(p).some((finding) => finding.id.startsWith("furniture-frame-")),
  );
});
