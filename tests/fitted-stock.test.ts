import test from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  part,
  material,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import {
  fittedStockFaces,
  pickFittedStockFace,
  resolveFittedStockFace,
  fittedStockMaterials,
  previewFittedStock,
  commitFittedStock,
  type FittedStockSpec,
} from "../src/fittedStock";
import { rotate, composeRotation } from "../src/spatial";
import { KERF, bom, cutPiece, inspectCutStock } from "../src/engine";
import { stockAxes } from "../src/stockAxes";
import { createSection } from "../src/sections";
import { localIdeaPlan } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingToken,
  previewIdeaRevision,
} from "../src/ideaBindings";
import { applyNewIdea } from "../src/ideaBindings";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const vectorNear = (a: V3, b: V3) => a.forEach((v, i) => near(v, b[i]));
function fixture(span = 12) {
  const p = blank("SYNTHETIC fitted-stock geometry");
  p.pieces = [
    part(
      "First actual panel",
      "plywood",
      [0.75, 12, 12],
      [0, 6, 0],
      p.steps[0].id,
      "Faces",
    ),
    part(
      "Second actual panel",
      "plywood",
      [0.75, 12, 12],
      [span + 0.75, 6, 0],
      p.steps[0].id,
      "Faces",
    ),
  ];
  return p;
}
function spec(p: Project): FittedStockSpec {
  return {
    first: pickFittedStockFace(p, p.pieces[0].id, [0.375, 0, 0], [1, 0, 0]),
    second: pickFittedStockFace(p, p.pieces[1].id, [-0.375, 0, 0], [-1, 0, 0]),
    datumLocal: [0.375, 0, 0],
    material: "hd-pine-1x4",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: null,
    stepId: p.steps[0].id,
    name: "SYNTHETIC fitted block",
  };
}

test("actual retained faces expose immutable local/world polygons and preserve the exact clicked datum", () => {
  const p = fixture(),
    raw = JSON.stringify(p),
    faces = fittedStockFaces(p, p.pieces[0].id);
  assert.equal(faces.length, 6);
  const face = faces.find((f) => f.normalLocal[0] === 1)!;
  assert.equal(face.label, "Local X+ face");
  vectorNear(face.centerLocal, [0.375, 0, 0]);
  vectorNear(face.centerWorld, [0.375, 6, 0]);
  assert.equal(face.verticesLocal.length, 4);
  const point: V3 = [0.375, 1.123456789, 0.25],
    ref = pickFittedStockFace(p, p.pieces[0].id, point, [1, 0, 0]);
  assert.deepEqual(ref.pointLocal, point);
  assert.deepEqual(resolveFittedStockFace(p, ref).ref, ref);
  ref.pointLocal[1] = 2;
  faces[0].verticesLocal[0][0] = 300;
  assert.equal(JSON.stringify(p), raw);
  assert.throws(
    () => pickFittedStockFace(p, p.pieces[0].id, [0, 0, 0], [1, 0, 0]),
    /selected face/,
  );
  assert.throws(
    () => pickFittedStockFace(p, p.pieces[0].id, [0.375, 0, 0], [2, 0, 0]),
    /normalized/,
  );
});

test("preview creates a real exact cross-section block and genuine source-backed remnant without changing existing data", () => {
  const p = fixture(),
    raw = JSON.stringify(p),
    s = spec(p),
    preview = previewFittedStock(p, s),
    block = preview.project.pieces.find((x) => x.id === preview.blockId)!,
    offcut = preview.project.pieces.find((x) => x.id === preview.offcutIds[0])!;
  near(preview.span, 12);
  near(preview.cutLength, 12);
  assert.equal(preview.sourceLength, 96);
  assert.equal(preview.stockLengthAxis, 1);
  assert.equal(preview.kerfLoss, KERF);
  assert.deepEqual(block.size, [0.75, 12, 3.5]);
  vectorNear(rotate([0, 1, 0], block.rotation), [1, 0, 0]);
  vectorNear(block.position, [6.375, 6, 0]);
  assert.equal(block.designRole, undefined);
  assert.equal(block.assembly, "Loose parts");
  assert.deepEqual(block.cutStock, {
    id: preview.sourceId,
    size: [0.75, 96, 3.5],
    offset: [0, 0, 0],
  });
  assert.ok(offcut.offcut);
  assert.deepEqual(offcut.cutStock, {
    id: preview.sourceId,
    size: [0.75, 96, 3.5],
    offset: [0, 12.125, 0],
  });
  near(offcut.size[1], 83.875);
  assert.equal(inspectCutStock(preview.project).invalid.length, 0);
  assert.ok(inspectCutStock(preview.project).valid.has(preview.sourceId!));
  const row = bom(preview.project).find((row) => row.id === "hd-pine-1x4")!;
  assert.equal(row.quantity, 1);
  assert.deepEqual(commitFittedStock(p, s, preview), preview.project);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(preview.project))),
    preview.project,
  );
  assert.equal(JSON.stringify(p), raw);
});

test("normal fit uses exactly the existing cutPiece source-region and offcut placement convention", () => {
  const p = fixture(),
    s = spec(p),
    preview = previewFittedStock(p, s),
    block = preview.project.pieces.find((x) => x.id === preview.blockId)!;
  const n = preview.firstFace.normalWorld,
    source = part(
      s.name,
      s.material,
      [...material(s.material).size],
      block.position.map(
        (v, i) => v + (n[i] * (preview.sourceLength - preview.cutLength)) / 2,
      ) as V3,
      s.stepId,
      "Loose parts",
      block.rotation,
    );
  source.stockLengthAxis = preview.stockLengthAxis;
  const ordinary = cutPiece(
      { ...p, pieces: [...p.pieces, source] },
      source.id,
      preview.cutLength,
      preview.stockLengthAxis,
    ),
    kept = ordinary.pieces.find((piece) => piece.id === source.id)!,
    offcut = ordinary.pieces.at(-1)!,
    fittedOffcut = preview.project.pieces.at(-1)!;
  assert.deepEqual(kept.size, block.size);
  vectorNear(kept.position, block.position);
  assert.deepEqual(kept.rotation, block.rotation);
  assert.deepEqual(kept.cutStock!.size, block.cutStock!.size);
  assert.deepEqual(kept.cutStock!.offset, block.cutStock!.offset);
  assert.deepEqual(offcut.size, fittedOffcut.size);
  vectorNear(offcut.position, fittedOffcut.position);
  assert.deepEqual(offcut.cutStock!.offset, fittedOffcut.cutStock!.offset);
  assert.equal(offcut.stockLengthAxis, fittedOffcut.stockLengthAxis);
});

test("full-length use has no invented cut and near-full trims have no phantom remnant", () => {
  for (const loss of [0, 0.05, KERF, KERF + 0.01]) {
    const p = fixture(96 - loss),
      preview = previewFittedStock(p, spec(p)),
      block = preview.project.pieces.find((x) => x.id === preview.blockId)!;
    near(preview.cutLength, 96 - loss);
    near(preview.kerfLoss, Math.min(loss, KERF));
    assert.equal(preview.offcutIds.length, loss > KERF ? 1 : 0);
    assert.equal(preview.sourceId === null, loss === 0);
    assert.equal(block.cutStock === null, loss === 0);
    assert.equal(inspectCutStock(preview.project).invalid.length, 0);
    assert.equal(
      bom(preview.project).find((row) => row.id === "hd-pine-1x4")!.quantity,
      1,
    );
  }
});

test("short cut length retains original stock length axis even when it is shorter than the cross-section", () => {
  const p = fixture(1),
    preview = previewFittedStock(p, spec(p)),
    block = preview.project.pieces.find((p) => p.id === preview.blockId)!;
  assert.deepEqual(block.size, [0.75, 1, 3.5]);
  assert.equal(block.stockLengthAxis, 1);
  assert.equal(stockAxes(block).length, 1);
  assert.equal(inspectCutStock(preview.project).invalid.length, 0);
});

test("independent end clearances change only the physical length and start/end, not stock thickness", () => {
  const p = fixture(),
    s = { ...spec(p), clearanceA: 0.25, clearanceB: 0.5 },
    preview = previewFittedStock(p, s),
    block = preview.project.pieces.find((x) => x.id === preview.blockId)!;
  near(preview.cutLength, 11.25);
  vectorNear(block.position, [6.25, 6, 0]);
  assert.deepEqual(block.size, [0.75, 11.25, 3.5]);
  assert.ok(
    preview.endFootprintsWorld.first.every(
      (point) => Math.abs(point[0] - 0.375) < 1e-7,
    ),
  );
  assert.ok(
    preview.endFootprintsWorld.second.every(
      (point) => Math.abs(point[0] - 12.375) < 1e-7,
    ),
  );
  assert.throws(
    () => previewFittedStock(p, { ...s, clearanceA: -0.1 }),
    /nonnegative/,
  );
  assert.throws(
    () => previewFittedStock(p, { ...s, clearanceA: 12 }),
    /no positive/,
  );
});

test("full-Euler assembly transforms preserve spans, cross-section placement and explicit roll", () => {
  const p = fixture(),
    s = { ...spec(p), rollDegrees: 27 },
    preview = previewFittedStock(p, s),
    block = preview.project.pieces.find((x) => x.id === preview.blockId)!,
    rotation: V3 = [0.3, -0.7, 0.41],
    translation: V3 = [18, 11, -4];
  const moved = {
      ...p,
      pieces: p.pieces.map((piece) => ({
        ...piece,
        position: rotate(piece.position, rotation).map(
          (n, i) => n + translation[i],
        ) as V3,
        rotation: composeRotation(rotation, piece.rotation),
      })),
    },
    next = previewFittedStock(moved, s),
    actual = next.project.pieces.find((x) => x.id === next.blockId)!;
  near(next.span, preview.span);
  near(next.cutLength, preview.cutLength);
  vectorNear(
    actual.position,
    rotate(block.position, rotation).map((n, i) => n + translation[i]) as V3,
  );
  for (const axis of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as V3[])
    vectorNear(
      rotate(axis, actual.rotation),
      rotate(rotate(axis, block.rotation), rotation),
    );
  for (const key of ["first", "second"] as const)
    next.endFootprintsWorld[key].forEach((point, i) =>
      vectorNear(
        point,
        rotate(preview.endFootprintsWorld[key][i], rotation).map(
          (n, j) => n + translation[j],
        ) as V3,
      ),
    );
});

test("whole cross-section containment rejects an overhanging datum even when its center is on the face", () => {
  const p = fixture(),
    s = spec(p);
  assert.throws(
    () => previewFittedStock(p, { ...s, datumLocal: [0.375, 5, 0] }),
    /complete stock cross-section.*first/,
  );
  p.pieces[1].size[1] = 2;
  assert.throws(
    () => previewFittedStock(p, s),
    /complete stock cross-section.*second/,
  );
});

test("roll selects a real orientation and cannot shrink the cross-section to squeeze through", () => {
  const p = fixture(),
    s = spec(p);
  p.pieces[0].size = [0.75, 2, 5];
  p.pieces[1].size = [0.75, 2, 5];
  assert.throws(() => previewFittedStock(p, s), /cross-section/);
  const preview = previewFittedStock(p, { ...s, rollDegrees: 90 });
  assert.deepEqual(
    preview.project.pieces.find((x) => x.id === preview.blockId)!.size,
    [0.75, 12, 3.5],
  );
});

test("parallel actual retained miter faces can mate a square-ended oriented block; removed original face picks are rejected", () => {
  const p = fixture(),
    normal: V3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  p.pieces[0].size = [2, 12, 12];
  p.pieces[0].cutPlanes = [{ normal, constant: 0 }];
  p.pieces[1].size = [2, 12, 12];
  p.pieces[1].position = normal.map((v, i) => v * 12 + (i === 1 ? 6 : 0)) as V3;
  p.pieces[1].cutPlanes = [
    { normal: normal.map((v) => -v) as V3, constant: 0 },
  ];
  const s = { ...specForMiter(p, normal), datumLocal: [0, 0, 0] as V3 },
    preview = previewFittedStock(p, s);
  near(preview.span, 12);
  assert.ok(preview.firstFace.label.includes("cut"));
  assert.equal(
    preview.project.pieces.find((x) => x.id === preview.blockId)!.cutPlanes
      .length,
    0,
  );
  assert.throws(
    () => pickFittedStockFace(p, p.pieces[0].id, [1, 0, 1], [1, 0, 0]),
    /selected face/,
  );
});
function specForMiter(p: Project, n: V3): FittedStockSpec {
  return {
    first: pickFittedStockFace(p, p.pieces[0].id, [0, 0, 0], n),
    second: pickFittedStockFace(
      p,
      p.pieces[1].id,
      [0, 0, 0],
      n.map((v) => -v) as V3,
    ),
    datumLocal: [0, 0, 0],
    material: "hd-pine-1x4",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: null,
    stepId: p.steps[0].id,
    name: "SYNTHETIC miter-plane fit",
  };
}

test("distinct opposed retained faces and a real datum are mandatory", () => {
  const p = fixture(),
    s = spec(p);
  assert.throws(
    () => previewFittedStock(p, { ...s, second: s.first }),
    /distinct/,
  );
  assert.throws(
    () => previewFittedStock(p, { ...s, datumLocal: [0, 0, 0] }),
    /center datum/,
  );
  const sameNormal = fittedStockFaces(p, p.pieces[1].id).find(
    (f) => f.normalLocal[0] === 1,
  )!.ref;
  assert.throws(
    () => previewFittedStock(p, { ...s, second: sameNormal }),
    /opposed parallel/,
  );
  p.pieces[1].rotation = [0, 0.1, 0];
  assert.throws(() => previewFittedStock(p, s), /opposed parallel/);
  const behind = fixture();
  behind.pieces[1].position[0] = -12;
  assert.throws(
    () => previewFittedStock(behind, spec(behind)),
    /positive distance/,
  );
});

test("real interior obstruction, including less than 0.01in interference, blocks while exact contact remains permitted", () => {
  const p = fixture(),
    s = spec(p),
    obstacle = part(
      "SYNTHETIC tiny intrusion",
      "stud",
      [1, 1, 1],
      [6, 8.245, 0],
      p.steps[0].id,
      "",
    );
  p.pieces.push(obstacle);
  assert.throws(
    () => previewFittedStock(p, s),
    /P003.*tiny intrusion.*obstructs/,
  );
  obstacle.position[1] = 8.25;
  assert.doesNotThrow(() => previewFittedStock(p, s));
  obstacle.position[1] = 6;
  obstacle.offcut = true;
  assert.doesNotThrow(() => previewFittedStock(p, s));
});

test("actual cut-away space is respected for a third solid, without treating its full box as filled", () => {
  const p = fixture(),
    s = spec(p),
    other = part(
      "Retained sliver away from fit",
      "stud",
      [3, 3, 3],
      [6, 6, 0],
      p.steps[0].id,
      "",
    );
  other.cutPlanes = [{ normal: [0, -1, 0], constant: -1.4 }];
  p.pieces.push(other);
  // The fitted stock spans worldY4.25..7.75; this retained sliver starts7.4, so it still intersects.
  assert.throws(() => previewFittedStock(p, s), /obstructs/);
  other.position[1] = 6.4;
  assert.doesNotThrow(() => previewFittedStock(p, s));
});

test("unsupported tube/roll/hardware profiles are conservative envelope blockers, not invented exact solids", () => {
  for (const id of ["closet-rod-72", "mesh", "screw"] as const) {
    const p = fixture(),
      s = spec(p),
      other = part(
        `Unknown ${id} shape`,
        id,
        [...material(id).size],
        [6, 6, 0],
        p.steps[0].id,
        "",
      );
    p.pieces.push(other);
    assert.throws(
      () => previewFittedStock(p, s),
      /Unknown profile envelope P003.*actual profile/,
    );
    other.position[2] = 5;
    assert.doesNotThrow(() => previewFittedStock(p, s));
  }
});

test("glazing material envelopes block with honest uncertainty rather than certifying solid contact", () => {
  const p = fixture(),
    s = spec(p);
  p.pieces.push(
    part(
      "Glazing envelope",
      "sunlite-8mm",
      [1, 1, 1],
      [6, 6, 0],
      p.steps[0].id,
      "",
    ),
  );
  assert.throws(
    () => previewFittedStock(p, s),
    /Unknown profile envelope.*Glazing envelope/,
  );
});

test("the block's actual vertices must fit the work zone, while a loose offcut can lie beyond it", () => {
  const p = fixture(),
    s = spec(p);
  p.workZone = { width: 24, depth: 24, height: 24 };
  assert.throws(() => previewFittedStock(p, s), /outside.*work zone/);
  p.workZone.width = 26;
  const preview = previewFittedStock(p, s);
  assert.ok(preview.project.pieces.at(-1)!.position[0] > 13);
  p.workZone.height = 5;
  assert.throws(() => previewFittedStock(p, s), /outside.*work zone/);
});

test("catalog cross-sections are immutable source choices with a unique full-length axis", () => {
  const choices = fittedStockMaterials();
  assert.ok(choices.some((m) => m.id === "hd-pine-1x4"));
  assert.ok(
    choices.every(
      (m) => m.wood && m.cuttable && m.stockKind === "linear" && !m.shape,
    ),
  );
  const before = material("hd-pine-1x4").size[0];
  choices.find((m) => m.id === "hd-pine-1x4")!.size[0] = 300;
  assert.equal(material("hd-pine-1x4").size[0], before);
  const p = fixture(),
    s = spec(p);
  for (const material of ["plywood", "mesh", "screw", "closet-rod-72"] as const)
    assert.throws(
      () => previewFittedStock(p, { ...s, material }),
      /linear wood stock/,
    );
  const wrongIds = fixture(97),
    foreign = spec(fixture());
  foreign.stepId = wrongIds.steps[0].id;
  assert.throws(
    () => previewFittedStock(wrongIds, foreign),
    /actual active rectangular wood member/,
  ); // Wrong actual IDs never become name matches.
  const long = fixture(97);
  assert.throws(
    () => previewFittedStock(long, spec(long)),
    /exceeds.*96 in stock/,
  );
  const stock = material("hd-pine-1x4"),
    original = [...stock.size] as V3;
  try {
    stock.size = [96, 96, 3.5];
    assert.ok(!fittedStockMaterials().some((m) => m.id === stock.id));
    assert.throws(() => previewFittedStock(p, s), /unique catalog length/);
  } finally {
    stock.size = original;
  }
});

test("captured IDs/candidate are exact and any project, specification, source or candidate drift refuses commit", () => {
  const p = fixture(),
    s = spec(p),
    preview = previewFittedStock(p, s),
    raw = JSON.stringify(p);
  for (const change of [
    (p: Project) => {
      p.pieces[1].position[0] += 0.1;
    },
    (p: Project) => {
      p.pieces.push(
        part(
          "New obstruction",
          "stud",
          [1, 1, 1],
          [6, 6, 0],
          p.steps[0].id,
          "",
        ),
      );
    },
    (p: Project) => {
      p.workZone = { width: 24, depth: 24, height: 24 };
    },
    (p: Project) => {
      p.notes += "New user note";
    },
  ]) {
    const changed = structuredClone(p);
    change(changed);
    assert.throws(() => commitFittedStock(changed, s, preview), /changed/);
  }
  assert.throws(
    () => commitFittedStock(p, { ...s, clearanceA: 0.25 }, preview),
    /inputs changed/,
  );
  const tampered = structuredClone(preview);
  tampered.project.pieces.find((x) => x.id === preview.blockId)!.size[0] = 0.5;
  assert.throws(
    () => commitFittedStock(p, s, tampered),
    /captured preview changed/,
  );
  const stock = material(s.material),
    original = stock.productReference;
  try {
    stock.productReference = "SYNTHETIC changed source";
    assert.throws(() => commitFittedStock(p, s, preview), /source.*changed/);
  } finally {
    if (original === undefined) delete stock.productReference;
    else stock.productReference = original;
  }
  const committed = commitFittedStock(p, s, preview);
  assert.deepEqual(committed, preview.project);
  assert.equal(committed.pieces.at(-2)!.id, preview.blockId);
  committed.pieces.at(-2)!.size[0] = 0.1;
  assert.notEqual(preview.project.pieces.at(-2)!.size[0], 0.1);
  assert.equal(JSON.stringify(p), raw);
});

test("an explicit destination gets only the ordinary active block, never an offcut or generated role", () => {
  const p = fixture(),
    created = createSection(
      p,
      p.pieces.map((x) => x.id),
      "Actual destination",
    ),
    s = { ...spec(created.project), sectionId: created.sectionId },
    preview = previewFittedStock(created.project, s),
    section = preview.project.sections[0];
  assert.ok(section.pieceIds.includes(preview.blockId));
  assert.ok(preview.offcutIds.every((id) => !section.pieceIds.includes(id)));
  assert.equal(
    preview.project.pieces.find((x) => x.id === preview.blockId)!.designRole,
    undefined,
  );
  assert.equal(
    preview.project.pieces.find((x) => x.id === preview.blockId)!.assembly,
    "Actual destination",
  );
  assert.throws(
    () => previewFittedStock(created.project, { ...s, sectionId: uid() }),
    /section no longer/,
  );
  assert.throws(
    () => previewFittedStock(created.project, { ...s, stepId: uid() }),
    /existing build step/,
  );
});

test("custom fitted additions in a generated casework section remain manual and require rebuild acknowledgement", () => {
  const p = applyNewIdea(
      blank("SYNTHETIC bound bookcase"),
      localIdeaPlan({
        prompt:
          "A plywood bookcase 48 inches wide 12 inches deep 60 inches high with 3 shelves",
      }),
    ),
    binding = p.ideaBindings[0],
    entry = binding.entries[0];
  const left =
    p.pieces.find((piece) => piece.designRole === "side-left") ??
    p.pieces.find((piece) =>
      p.sections
        .find(
          (s) =>
            s.id ===
            entry.sections.find((r) => r.role === "side-left")?.sectionId,
        )
        ?.pieceIds.includes(piece.id),
    );
  const right =
    p.pieces.find((piece) => piece.designRole === "side-right") ??
    p.pieces.find((piece) =>
      p.sections
        .find(
          (s) =>
            s.id ===
            entry.sections.find((r) => r.role === "side-right")?.sectionId,
        )
        ?.pieceIds.includes(piece.id),
    );
  assert.ok(left && right);
  const first = fittedStockFaces(p, left.id).find(
      (f) => f.normalWorld[0] > 0.99,
    )!,
    second = fittedStockFaces(p, right.id).find(
      (f) => f.normalWorld[0] < -0.99,
    )!;
  const s: FittedStockSpec = {
    first: first.ref,
    second: second.ref,
    datumLocal: [left.size[0] / 2, -22, 0],
    material: "hd-pine-1x4",
    rollDegrees: 0,
    clearanceA: 0,
    clearanceB: 0,
    sectionId: entry.sections.find((r) => r.role === "side-left")!.sectionId,
    stepId: left.stepId,
    name: "SYNTHETIC manual stiffener, attachment not specified",
  };
  const preview = previewFittedStock(p, s),
    next = commitFittedStock(p, s, preview),
    plan = bindingPlan(next, binding.id);
  const structure = plan.structures[0];
  if (structure.kind !== "casework-shelves")
    throw Error("Expected actual typed casework fixture");
  structure.parameters.height += 1;
  const review = previewIdeaRevision(
    next,
    binding.id,
    plan,
    bindingToken(next, binding.id),
  );
  assert.ok(review.requiresRebuild);
  assert.throws(
    () =>
      applyIdeaRevision(next, binding.id, plan, bindingToken(next, binding.id)),
    /rebuild|acknowledge|manual/i,
  );
});
