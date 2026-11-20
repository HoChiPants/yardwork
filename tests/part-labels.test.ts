import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, step } from "../src/model";
import { ensurePartLabels, partLabel } from "../src/partLabels";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import {
  assemblyPartLabels,
  findAssemblyPartLabels,
} from "../src/assemblyPartLabels";
test("part labels survive reordering, removal, new parts, offcuts and JSON reopening", () => {
  const p = blank(),
    s = p.steps[0].id;
  p.pieces = [
    part("First", "stud", [1.5, 48, 3.5], [0, 24, 0], s, "Frame"),
    part("Second", "stud", [1.5, 48, 3.5], [5, 24, 0], s, "Frame"),
  ];
  const labeled = ensurePartLabels(p),
    [a, b] = labeled.pieces;
  assert.equal(p.partLabels.length, 0);
  assert.equal(partLabel(labeled, a.id), "P001");
  const added = part("Third", "stud", [1.5, 24, 3.5], [0, 12, 0], s, "Frame");
  const changed = ensurePartLabels({
    ...labeled,
    pieces: [{ ...b, offcut: true }, added],
  });
  assert.equal(partLabel(changed, b.id), "P002");
  assert.equal(partLabel(changed, added.id), "P003");
  assert.equal(
    changed.partLabels.find((row) => row.partId === a.id)?.label,
    "P001",
  );
  const off = part("Offcut", "stud", [1.5, 10, 3.5], [0, 5, 0], s, "Frame");
  off.offcut = true;
  const final = ensurePartLabels({
    ...changed,
    pieces: [...changed.pieces, off],
  });
  assert.equal(partLabel(final, off.id), "O001");
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(final))),
    final,
  );
  assert.equal(ensurePartLabels(final), final);
});
test("guide allocates labels before fingerprinting; duplicate labels or IDs are rejected", () => {
  const p = blank(),
    s = p.steps[0].id;
  p.pieces.push(part("Panel", "plywood", [18, 0.75, 24], [0, 1, 0], s, "Box"));
  const guide = generateBuildGuide(p);
  assert.equal(guide.partLabels[0].label, "P001");
  assert.ok(guideIsCurrent(guide));
  assert.equal(
    projectSchema.safeParse({
      ...guide,
      partLabels: [...guide.partLabels, guide.partLabels[0]],
    }).success,
    false,
  );
});

test("assembly labels use the actual stage, retained dimensions and ledger identity", () => {
  const p = blank(),
    early = p.steps[0],
    later = step("Fit shelves");
  p.steps.push(later);
  const panel = part(
    "Matching panel",
    "plywood",
    [24, 0.703, 18],
    [0, 10, 0],
    later.id,
    "Box",
  );
  panel.cutPlanes = [{ normal: [1, 0, 0], constant: 10 }];
  const first = part(
    panel.name,
    panel.material,
    [...panel.size],
    [0, 1, 0],
    early.id,
    "Box",
  );
  const remnant = {
    ...part("Remnant", "stud", [1.5, 12, 3.5], [0, 6, 0], early.id, "Frame"),
    offcut: true,
  };
  const guide = ensurePartLabels({ ...p, pieces: [panel, remnant, first] });
  const snapshot = structuredClone(guide);
  const labels = assemblyPartLabels(guide);
  assert.deepEqual(
    labels.map(({ label, step }) => [label, step.number]),
    [
      ["P002", 1],
      ["P001", 2],
    ],
  );
  assert.equal(labels[0].dimensions, "2 ft × 18 in × 0.703 in");
  assert.equal(labels[1].dimensions, "22 in × 18 in × 0.703 in");
  assert.equal(labels[1].caption, "Overall");
  assert.ok(labels[1].profile);
  assert.deepEqual(findAssemblyPartLabels(labels, " p001 "), [labels[1]]);
  assert.deepEqual(findAssemblyPartLabels(labels, "matching panel"), labels);
  assert.deepEqual(findAssemblyPartLabels(labels, "O001"), []);
  const usingRemnant = {
    ...guide,
    pieces: guide.pieces.map((piece) =>
      piece.id === remnant.id ? { ...piece, offcut: false } : piece,
    ),
  };
  assert.equal(
    assemblyPartLabels(usingRemnant).find(
      ({ pieceId }) => pieceId === remnant.id,
    )?.label,
    "O001",
  );
  assert.deepEqual(guide, snapshot);
});

test("undo and redo retain printed reservations when a different part is added afterward", async () => {
  const { retainPartLabelHistory } = await import("../src/partLabels");
  const start = blank(),
    a = part(
      "Printed A",
      "stud",
      [1.5, 20, 3.5],
      [0, 10, 0],
      start.steps[0].id,
      "Frame",
    );
  const printed = ensurePartLabels({ ...start, pieces: [a] });
  const undone = retainPartLabelHistory(start, printed);
  const b = part(
    "New B",
    "stud",
    [1.5, 20, 3.5],
    [0, 10, 0],
    start.steps[0].id,
    "Frame",
  );
  const changed = ensurePartLabels({ ...undone, pieces: [b] });
  assert.equal(partLabel(changed, b.id), "P002");
  assert.equal(partLabel(changed, a.id), "P001");
  const redone = retainPartLabelHistory(printed, changed);
  assert.equal(partLabel(redone, a.id), "P001");
  assert.equal(partLabel(redone, b.id), "P002");
});
