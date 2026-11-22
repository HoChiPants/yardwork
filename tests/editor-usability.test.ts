import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { addMaterial, bom, bounds, cutPiece, guideMarkdown, recordChanges } from "../src/engine";
import {
  partStockOptions, previewGroupStockReplacement, previewPartStockReplacement, stockReplacementGroup,
} from "../src/partStockReplacement";
import { homeDepotShoppingList } from "../src/handoff";
import { recordStockCutLayout } from "../src/recordStockCutLayout";
import { stockCutSequences } from "../src/stockCutSequence";
import {
  createWoodGroupSlide,
  createWoodSlide,
  placeWood,
  separateWood,
} from "../src/placement";
import { pieceOverlap } from "../src/solidCollision";
import { snapPlacement } from "../src/editing";
import { copyObjects, pasteObjects } from "../src/editorClipboard";
import { catalog } from "../src/model";
import { groupedMaterials, materialPlacementOptions, materialStockDisplayName } from "../src/materialGroups";
import { formatStockLength, preferredLengthUnit } from "../src/measurement";
import { liftDistanceInches } from "../src/editorMotion";

function fixture() {
  const p = blank("Placement fixture");
  p.pieces = [
    part(
      "Fixed wood",
      "stud",
      [10, 10, 10],
      [0, 5, 0],
      p.steps[0].id,
      "Loose parts",
    ),
    part(
      "Moving wood",
      "stud",
      [10, 10, 10],
      [20, 5, 0],
      p.steps[0].id,
      "Loose parts",
    ),
  ];
  return p;
}
test("deep penetration, containment and exact coincident stock move to clear faces without mutating inputs", () => {
  for (const size of [
    [10, 10, 10],
    [2, 2, 2],
    [30, 30, 30],
  ] as V3[]) {
    const p = fixture();
    p.pieces[1].size = size;
    const before = JSON.stringify(p);
    const result = placeWood(p, p.pieces[1], [0, 5, 0]);
    assert.equal(result.blocked, false);
    assert.equal(result.adjusted, true);
    assert.equal(
      pieceOverlap(
        { ...p.pieces[1], position: result.position },
        p.pieces[0],
        1e-6,
      ),
      false,
    );
    assert.ok(
      bounds({ ...p.pieces[1], position: result.position }).min[1] >= -1e-6,
    );
    assert.equal(JSON.stringify(p), before);
  }
});
test("vertical moves land wood on wood and keep X/Z locked rather than pushing it sideways", () => {
  const p = fixture(),
    result = placeWood(p, p.pieces[1], [0, 13, 0], undefined, 1);
  assert.deepEqual(result.position, [0, 15, 0]);
  assert.equal(
    pieceOverlap(
      { ...p.pieces[1], position: result.position },
      p.pieces[0],
      1e-6,
    ),
    false,
  );
});

test("a long lift or side drag stops at the first wood face even if the cursor passes the whole piece", () => {
  const p = fixture();
  const fixed = p.pieces[0];
  const moving = p.pieces[1];
  const fromRight = createWoodSlide(p, moving)!;
  assert.deepEqual(fromRight([-20, 5, 0]), {
    position: [10, 5, 0],
    stop: { kind: "wood", pieceId: fixed.id },
  });
  // A distant obstacle can come first in storage. The nearer contact still wins.
  p.pieces.unshift({ ...fixed, id: crypto.randomUUID(), position: [0, 25, 0] });
  moving.position = [0, 50, 0];
  const down = createWoodSlide(p, moving)!;
  assert.deepEqual(down([0, -20, 0]), {
    position: [0, 35, 0],
    stop: { kind: "wood", pieceId: p.pieces[0].id },
  });
  assert.deepEqual(down([0, 52, 0]), { position: [0, 52, 0], stop: null });
});

test("wood can slide across a touching face or through a removed corner and stops at the ground", () => {
  const p = fixture();
  const moving = p.pieces[1];
  const slide = createWoodSlide(p, moving)!;
  const raised = slide([20, 15, 0]);
  assert.deepEqual(slide([0, 15, 0], raised.position), {
    position: [0, 15, 0],
    stop: null,
  });
  assert.deepEqual(slide([20, -10, 0]), {
    position: [20, 5, 0],
    stop: { kind: "floor" },
  });

  p.pieces[0].cutPlanes = [
    { normal: [Math.SQRT1_2, 0, Math.SQRT1_2], constant: 0 },
  ];
  moving.size = [1, 1, 1];
  moving.position = [20, 5, 3];
  assert.deepEqual(createWoodSlide(p, moving)!([3, 5, 3]), {
    position: [3, 5, 3],
    stop: null,
  });
  moving.position = [-2, 5, -2];
  assert.equal(createWoodSlide(p, moving), null);
});
test("snapping no longer exempts wood that was already overlapping", () => {
  const p = fixture();
  p.pieces[1].position = [0, 5, 0];
  const result = snapPlacement(p, p.pieces[1], p.pieces[1].position, [0, 0, 0]);
  assert.equal(
    pieceOverlap(
      { ...p.pieces[1], position: result.position },
      p.pieces[0],
      1e-6,
    ),
    false,
  );
  assert.equal(result.snapped, true);
});
test("rotated and profiled retained shapes are respected; empty cut corners are not filled back in", () => {
  const p = fixture();
  p.pieces[0].rotation = [0, 0.61, 0];
  p.pieces[1].rotation = [0, -0.23, 0];
  const result = placeWood(p, p.pieces[1], [0, 5, 0]);
  assert.equal(
    pieceOverlap(
      { ...p.pieces[1], position: result.position },
      p.pieces[0],
      1e-6,
    ),
    false,
  );
  p.pieces[0].rotation = [0, 0, 0];
  p.pieces[0].cutPlanes = [
    { normal: [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)], constant: 0 },
  ];
  p.pieces[1].size = [1, 1, 1];
  const empty = placeWood(p, p.pieces[1], [3, 5, 3]);
  assert.deepEqual(empty.position, [3, 5, 3]);
  assert.equal(empty.adjusted, false);
});
test("multiple obstacles resolve all current intersections; face contact stays exact", () => {
  const p = fixture();
  p.pieces.push({
    ...p.pieces[0],
    id: crypto.randomUUID(),
    position: [10, 5, 0],
  });
  const result = placeWood(p, p.pieces[1], [5, 5, 0]);
  assert.equal(result.blocked, false);
  for (const fixed of [p.pieces[0], p.pieces[2]])
    assert.equal(
      pieceOverlap({ ...p.pieces[1], position: result.position }, fixed, 1e-6),
      false,
    );
  assert.deepEqual(placeWood(p, p.pieces[1], [20, 5, 0]).position, [20, 5, 0]);
});
test("virtual scraps and screws are excluded from solid wood placement", () => {
  const p = fixture();
  p.pieces[0].offcut = true;
  assert.deepEqual(placeWood(p, p.pieces[1], [0, 5, 0]).position, [0, 5, 0]);
  p.pieces[0].offcut = false;
  p.pieces[0].material = "screw";
  assert.deepEqual(placeWood(p, p.pieces[1], [0, 5, 0]).position, [0, 5, 0]);
});
test("rigid groups keep their internal distances while separating from external wood", () => {
  const p = fixture();
  const moving = [
    { ...p.pieces[1], position: [0, 5, 0] as V3 },
    { ...p.pieces[1], id: crypto.randomUUID(), position: [0, 15, 0] as V3 },
  ];
  const result = separateWood(p, moving);
  assert.equal(result.blocked, false);
  for (const piece of moving) {
    const position = piece.position.map((n, i) => n + result.offset[i]) as V3;
    assert.equal(
      pieceOverlap({ ...piece, position }, p.pieces[0], 1e-6),
      false,
    );
  }
  assert.ok(result.offset.every(Number.isFinite));
});

test("a section stops at its earliest member contact and keeps an external opening clear", () => {
  const project = blank("Rigid assembly");
  const stepId = project.steps[0].id;
  const make = (name: string, position: V3) =>
    part(name, "stud", [4, 4, 4], position, stepId, "Frame");
  const lower = make("Low member", [-10, 12, 0]);
  const upper = make("High member", [10, 20, 0]);
  const internal = make("Internal member", [10, 20, 0]);
  const pad = make("Low pad", [-10, 2, 0]);
  const ledge = make("High ledge", [10, 12, 0]);
  const inOpening = make("Inside the opening", [0, 13, 0]);
  const members = [lower, upper, internal];
  project.pieces = [...members, pad, inOpening, ledge];
  const slide = createWoodGroupSlide(project, members, [0, 16, 0])!;
  assert.deepEqual(slide([0, -10, 0]), {
    position: [0, 12, 0],
    stop: { kind: "wood", pieceId: ledge.id },
  });
  assert.deepEqual(slide([0, 23, 0]), { position: [0, 23, 0], stop: null });

  project.pieces = [...members, inOpening];
  const toFloor = createWoodGroupSlide(project, members, [0, 16, 0])!;
  assert.deepEqual(toFloor([0, -10, 0]), {
    position: [0, 6, 0],
    stop: { kind: "floor" },
  });
});
test("copy is a snapshot, paste allocates new identities and never duplicates physical source allocations or connections", () => {
  let p = fixture();
  p = cutPiece(p, p.pieces[1].id, 6, 1);
  const original = p.pieces[1],
    source = copyObjects(p, original.id, null)!;
  const before = JSON.stringify(p);
  const result = pasteObjects(p, source, p.steps[0].id),
    copy = result.project.pieces.find((piece) => piece.id === result.pieceId)!;
  assert.notEqual(copy.id, original.id);
  assert.deepEqual(copy.size, original.size);
  assert.equal(copy.cutStock, null);
  assert.equal(copy.offcut, false);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(result.project.joints, p.joints);
  assert.doesNotThrow(() => projectSchema.parse(result.project));
  for (const other of p.pieces.filter((piece) => !piece.offcut))
    assert.equal(pieceOverlap(copy, other, 1e-6), false);
  original.name = "Changed after copy";
  assert.notEqual(source.pieces[0].name, original.name);
});
test("whole-section copies retain a group and fresh member IDs without inheriting generator or installation references", () => {
  const p = fixture();
  p.sections = [
    {
      id: crypto.randomUUID(),
      name: "My assembly",
      pieceIds: p.pieces.map((p) => p.id),
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      recipe: null,
      generator: null,
    },
  ];
  const clipboard = copyObjects(p, null, p.sections[0].id)!,
    result = pasteObjects(p, clipboard, p.steps[0].id);
  assert.ok(result.sectionId);
  const group = result.project.sections.find(
    (row) => row.id === result.sectionId,
  )!;
  assert.equal(group.pieceIds.length, 2);
  assert.ok(
    group.pieceIds.every((id) => !p.pieces.some((piece) => piece.id === id)),
  );
  assert.equal(group.recipe, null);
  assert.equal(group.generator, null);
  assert.doesNotThrow(() => projectSchema.parse(result.project));
});
test("one palette card per family retains every exact catalog variant and separates treated uses", () => {
  const groups = groupedMaterials(),
    ids = groups.flatMap((row) => row.variants.map((m) => m.id));
  const standalone = catalog.filter((material) => !material.includedComponent);
  assert.deepEqual([...ids].sort(), standalone.map((m) => m.id).sort());
  assert.equal(new Set(ids).size, standalone.length);
  const framing = groups.find((row) => row.id === "framing-2x4")!;
  assert.deepEqual(
    framing.variants.map((m) => m.id).sort(),
    [
      "stud", "stud-10", "stud-12", "lowes-syp-2x4-8",
      "hd-kdht-2x4-8", "hd-spf-2x4-10", "hd-spf-2x4-12",
    ].sort(),
  );
  assert.ok(
    !groups
      .find((row) => row.id === "framing-2x6")!
      .variants.some((m) => m.id === "treated"),
  );
  assert.equal(
    groupedMaterials("All", "144")
      .flatMap((row) => row.variants)
      .every((m) => `${m.name} ${m.subtitle} ${m.search}`.includes("144")),
    true,
  );
  const filteredFraming = groupedMaterials("Lumber", "2 by 4 framing lumber");
  assert.deepEqual(filteredFraming.map(({ name }) => name), ["2 × 4 framing lumber"]);
  assert.deepEqual(materialPlacementOptions(filteredFraming[0]).options.map(({ id, label }) => [id, label]), [
    ["stud", "8 ft"], ["stud-10", "10 ft"], ["stud-12", "12 ft"],
  ]);
  const byLength = groupedMaterials("Lumber", "2x4 12 feet framing");
  assert.deepEqual(byLength.map(({ name }) => name), ["2 × 4 framing lumber"]);
  assert.deepEqual(materialPlacementOptions(byLength[0]).options.map(({ label }) => label), ["8 ft", "10 ft", "12 ft"]);
  assert.equal(materialPlacementOptions(byLength[0]).preferred.id, "stud-12");
  assert.equal(materialStockDisplayName("stud"), "2 × 4 framing lumber · 8 ft");
  assert.equal(materialStockDisplayName("hd-spf-2x4-10"), "2 × 4 framing lumber · 10 ft");
  assert.equal(materialStockDisplayName("hd-treated-4x4-12"), "4 × 4 treated post · 12 ft");
  const rods = groupedMaterials("Rods");
  assert.deepEqual(rods.map(({ name }) => name), ["Closet rod"]);
  assert.deepEqual(materialPlacementOptions(rods[0]).options.map(({ id }) => id), ["closet-rod-72", "hd-everbilt-closet-rod-96"]);
});
test("common fittings group by purpose and use nominal pipe diameters for exact stock choices", () => {
  const groups = groupedMaterials();
  for (const [family, ids] of [
    ["push-coupling", ["hd-sharkbite-ur008a", "hd-sharkbite-ur016a"]],
    ["push-elbow", ["hd-sharkbite-ur248a", "hd-sharkbite-ur256a"]],
    ["push-tee", ["hd-sharkbite-ur362a", "hd-sharkbite-ur370a"]],
    ["pipe-isolator", ["hd-holdrite-161j15", "hd-holdrite-162j15"]],
  ] as const) {
    const choices = materialPlacementOptions(groups.find(({ id }) => id === family)!);
    assert.equal(choices.label, "Pipe size");
    assert.deepEqual(choices.options.map(({ id, label }) => [id, label]), [[ids[0], "½ in"], [ids[1], "¾ in"]]);
  }
  const reducer = materialPlacementOptions(groups.find(({ id }) => id === "push-reducing-tee")!);
  assert.deepEqual(reducer.options.map(({ label }) => label), ["¾ in run × ½ in branch"]);
  for (const search of ["¾ in elbow", "3/4 in elbow", "0.75 in elbow"]) {
    const match = groupedMaterials("All", search);
    assert.deepEqual(match.map(({ id }) => id), ["push-elbow"]);
    assert.equal(materialPlacementOptions(match[0]).preferred.id, "hd-sharkbite-ur256a");
  }
});
test("whole feet display as feet while non-whole feet and exact product dimensions stay in inches", () => {
  assert.equal(formatStockLength(96), "8 ft");
  assert.equal(formatStockLength(72), "6 ft");
  assert.equal(formatStockLength(18), "18 in");
  assert.equal(formatStockLength(95.938), "95.938 in");
  assert.equal(preferredLengthUnit(0), "in");
  assert.equal(preferredLengthUnit(47.938), "in");
});

test("plain 8 ft post and pine board tiles retain exact products in the Home Depot handoff", () => {
  const lumber = groupedMaterials("Lumber");
  const project = blank("Lumber handoff");
  const withMaterials = ["treated-4x4", "board-1x4"].reduce((current, id, index) => {
    const { preferred } = materialPlacementOptions(lumber.find((group) => group.id === id)!);
    return addMaterial(current, preferred.id, [index * 12, 0, 0], current.steps[0].id);
  }, project);
  assert.deepEqual(
    homeDepotShoppingList(withMaterials).items.map(({ productId, quantity }) => [productId, quantity]).sort(),
    [["205220341", 1], ["301993221", 1]],
  );
});

test("a longer matching blank replaces an oversized estimate while preserving the actual part and source records", () => {
  const p = blank("Existing long framing member");
  const member = part("Nine-foot rail", "stud", [108, 3.5, 1.5], [12, 24, -6], p.steps[0].id, "Framing", [0.2, 0.1, 0.3]);
  member.stockLengthAxis = 0;
  p.pieces = [member];
  p.store = "4409";
  p.inventory = [{
    retailer: "home-depot", material: "stud", internetNumber: "338861827",
    name: "Synthetic observation for earlier stock", price: 4, available: 4,
    zip: p.zip, store: p.store, checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/338861827",
  }];
  const ids = partStockOptions(p, member).map(({ id }) => id);
  assert.deepEqual(ids, ["stud-10", "stud-12", "hd-spf-2x4-10", "hd-spf-2x4-12"]);
  assert.deepEqual(partStockOptions({ ...p, retailer: "lowes" }, member), []);
  const before = structuredClone(p);
  const planned = previewPartStockReplacement(p, member.id, "hd-spf-2x4-12");
  assert.deepEqual(p, before);
  assert.deepEqual(planned.purchase, [{ id: "stud", before: 0, after: 0 }, { id: "hd-spf-2x4-12", before: 0, after: 1 }]);
  assert.deepEqual(planned.project.pieces[0], { ...member, material: "hd-spf-2x4-12" });
  assert.deepEqual(planned.project.inventory, p.inventory);
  const changed = recordChanges(p, planned.project);
  const [shopping] = homeDepotShoppingList(changed).items;
  assert.equal(shopping.productId, "312528815");
  assert.ok(!shopping.snapshot);
  assert.match(guideMarkdown(changed), /Changed stock for Nine-foot rail/);
  const row = bom(changed).find(({ id }) => id === "hd-spf-2x4-12")!;
  const [sequence] = stockCutSequences(changed, [row]).get(row.id)!;
  const recorded = recordStockCutLayout(changed, sequence.layout).project;
  assert.deepEqual(partStockOptions(recorded, recorded.pieces[0]), []);
  assert.throws(() => previewPartStockReplacement(recorded, member.id, "hd-spf-2x4-10"), /Recorded cut sources/);
  assert.throws(() => previewPartStockReplacement(p, member.id, "hd-treated-2x4-12"), /matching stock blank/);
});
test("batch wood replacement packs with existing stock and preserves offcuts and source credits", () => {
  const original = blank("Board length comparison");
  const source = "hd-spf-2x4-10", alternate = "hd-spf-2x4-12";
  const rail = (name: string, length: number, x: number, id: typeof source | typeof alternate = source) =>
    part(name, id, [3.5, 1.5, length], [x, 10, 0], original.steps[0].id, "Framing");
  original.pieces = [rail("Already cut", 38, 0)];
  const sequence = stockCutSequences(original, bom(original)).get(source)![0];
  const recorded = recordStockCutLayout(original, sequence.layout, true);
  const project = recorded.project;
  project.store = "4409";
  project.inventory = [{
    retailer: "home-depot", material: alternate, internetNumber: "312528815",
    name: "Synthetic 12 ft stock count", price: 12, available: 3, zip: project.zip,
    store: project.store, checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/312528815",
  }];
  const uncut = Array.from({ length: 6 }, (_, index) => rail(`Rail ${index + 1}`, 47, (index + 1) * 6));
  const existing = rail("Existing destination part", 94, 66, alternate);
  project.pieces = [...project.pieces, ...uncut, existing];
  const baseline = structuredClone(project);
  const group = stockReplacementGroup(project, source);
  assert.equal(group.recordedCount, 1);
  assert.deepEqual(group.parts.map(({ id }) => id), uncut.map(({ id }) => id));
  assert.ok(group.options.some(({ id }) => id === alternate));
  assert.ok(group.options.every(({ productReference }) => !!productReference));
  const preview = previewGroupStockReplacement(project, source, alternate);
  assert.deepEqual(preview.purchase, [{ id: source, before: 3, after: 0 }, { id: alternate, before: 1, after: 3 }]);
  assert.deepEqual(preview.purchasedLength, { before: 504, after: 432 });
  assert.deepEqual(preview.snapshot, project.inventory[0]);
  assert.deepEqual(preview.observedCost, { before: null, after: 36 });
  assert.deepEqual(project, baseline);
  assert.deepEqual(preview.project.pieces, project.pieces.map((p) => uncut.includes(p) ? { ...p, material: alternate } : p));
  assert.deepEqual(preview.project.onHandCutSources, [recorded.sourceId]);
  assert.deepEqual(homeDepotShoppingList(preview.project).items.map(({ productId, quantity }) => ({ productId, quantity })), [
    { productId: "312528815", quantity: 3 },
  ]);
  const differentStore = { ...project, store: "9999" };
  assert.equal(previewGroupStockReplacement(differentStore, source, alternate).snapshot, undefined);
  const checkedAt = Date.parse(project.inventory[0].checkedAt);
  const priced: typeof project = { ...project, inventory: [...project.inventory, {
    ...project.inventory[0], material: source, internetNumber: "100077951",
    url: "https://www.homedepot.com/p/100077951", price: 6,
  }] };
  const comparison = previewGroupStockReplacement(priced, source, alternate, checkedAt);
  assert.deepEqual(comparison.observedCost, { before: 30, after: 36 });
  const expired = previewGroupStockReplacement(priced, source, alternate, checkedAt + 24 * 60 * 60 * 1000);
  assert.deepEqual(expired.observedCost, { before: null, after: null });
  assert.equal(expired.snapshot, undefined);
});

test("batch stock rejects a candidate that fits all nominal blanks but leaves too little material for a modeled cut", () => {
  const p = blank("Near-kerf rail");
  const source = "hd-spf-2x4-12", alternate = "hd-spf-2x4-10";
  p.pieces = [119.95, 31].map((length, index) =>
    part(`Rail ${index + 1}`, source, [3.5, 1.5, length], [index * 6, 12, 0], p.steps[0].id, "Framing"),
  );
  assert.ok(stockReplacementGroup(p, source).options.some(({ id }) => id === alternate));
  assert.throws(() => previewGroupStockReplacement(p, source, alternate), /cut order|kerf/i);
  assert.ok(p.pieces.every(({ material }) => material === source));
});

test("upward screen motion raises world height at the real perspective scale", () => {
  assert.ok(Math.abs(liftDistanceInches(-100, 10, 1000, 90) - 24) < 1e-10);
  assert.ok(liftDistanceInches(100, 10, 1000, 38) < 0);
  assert.throws(() => liftDistanceInches(1, 10, 0, 38));
});
