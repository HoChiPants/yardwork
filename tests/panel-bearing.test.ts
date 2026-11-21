import assert from "node:assert/strict";
import test from "node:test";
import { makeShelfPinPlan, saveShelfPinPlan } from "../src/attachments";
import { createBuildStudy } from "../src/buildFixtures";
import { guideMarkdown, validate } from "../src/engine";
import { blank, part, type Project, type V3 } from "../src/model";
import { reviewPanelBearing } from "../src/panelBearing";
import { composeRotation, rotate } from "../src/spatial";
import { formatStockLength } from "../src/measurement";

test("a grounded route cannot hide a broken branch beneath a seat contact", () => {
  const project = blank("Seat support trace");
  const makeWood = (name: string, size: V3, position: V3) =>
    part(name, "stud", size, position, project.steps[0].id, "Supports");
  const seat = {
    ...part("Seat", "plytanium-703", [24, 0.703, 12], [0, 6.3515, 0], project.steps[0].id, "Seat"),
    designRole: "seat-lid",
  };
  const rail = makeWood("Rail", [18, 2, 3], [0, 5, 0]);
  const left = makeWood("Left support", [3, 4, 3], [-7, 2, 0]);
  const right = makeWood("Right support", [3, 2, 3], [7, 3, 0]);
  const base = makeWood("Right base", [3, 2, 3], [7, 1, 0]);
  const savedScrap = { ...base, offcut: true };
  project.pieces = [seat, rail, left, right, savedScrap];

  const finding = () => validate(project).find(({ id }) => id === `panel-floor-bearing-${seat.id}`)!;
  assert.equal(finding().severity, "warning");
  assert.match(finding().detail, /interrupted contact trace.*Right support/);
  assert.doesNotMatch(finding().detail, /Left support|Right base/);
  assert.equal(finding().area!.outlines.length, 1);

  // Putting the offcut into the build closes the gap exactly.
  savedScrap.offcut = false;
  assert.equal(finding().severity, "info");
  assert.match(guideMarkdown(project), /Shelf and seat bearing[\s\S]+continuous contact trace to the modeled floor/);
  savedScrap.position[1] -= 0.03125;
  assert.equal(finding().severity, "warning");

  // An open seat has no horizontal underside to review.
  seat.rotation[2] = Math.PI / 2;
  assert.equal(finding(), undefined);
});

const pinMeasurements = () => ({
  pinInsertionDepth: 0.2,
  bearingReach: 0.25,
  bearingOffset: 0.05,
  fullDiameterBoreDepth: 0.25,
  deepestDrillTipDepth: 0.3,
  basis: "Test caliper measurements",
  measuredAt: new Date(Date.now() - 60_000).toISOString(),
});

test("bookcase shelves distinguish side touch, an offcut, a small gap and actual cleats", () => {
  const project = createBuildStudy("shelves").project;
  const [first] = reviewPanelBearing(project);
  assert.ok(
    reviewPanelBearing(project).every((row) => row.contacts.length === 0),
  );
  const { piece: shelf } = first;
  const [x, y, z] = shelf.position;
  const underside = y - shelf.size[1] / 2;
  const cleat = (sign: number, gap = 0) =>
    part(
      "Shelf cleat",
      "stud",
      [1.5, 1.5, 10],
      [x + sign * (shelf.size[0] / 2 - 0.75), underside - 0.75 - gap, z],
      project.steps[0].id,
      "Cleats",
    );
  const left = cleat(-1),
    right = cleat(1, 0.02);
  const scrap = { ...cleat(1), offcut: true };
  project.pieces.push(left, right, scrap);
  const row = (current: Project) =>
    reviewPanelBearing(current).find(({ piece }) => piece.id === shelf.id)!;
  const finding = (current: Project) =>
    validate(current).find(({ id }) => id === `panel-bearing-${shelf.id}`)!;
  assert.deepEqual(
    row(project).contacts.map(({ pieceId }) => pieceId),
    [left.id],
  );
  assert.equal(row(project).centerBetweenContacts, false);
  assert.equal(finding(project).severity, "warning");

  right.position[1] += 0.02;
  const original = JSON.stringify(project);
  assert.equal(row(project).contacts.length, 2);
  assert.ok(
    row(project).contacts.every(({ area }) => Math.abs(area - 15) < 1e-6),
  );
  assert.equal(row(project).centerBetweenContacts, true);
  assert.equal(finding(project).severity, "info");
  const spans = row(project).shelfSpans!.wood!;
  const width = spans.find(
    (span) => span.direction === "width" && span.kind === "between",
  )!;
  assert.ok(Math.abs(width.length - (shelf.size[0] - 3)) < 1e-7);
  assert.ok(
    spans.some(
      (span) => span.direction === "depth" && span.kind === "unsupported",
    ),
  );
  assert.match(
    guideMarkdown(project),
    /Shelf and seat bearing[\s\S]+2 wood contacts underneath/,
  );
  assert.equal(JSON.stringify(project), original);

  const rotation: V3 = [0, 0.63, 0];
  const moved = {
    ...project,
    pieces: project.pieces.map((piece) => ({
      ...piece,
      rotation: composeRotation(rotation, piece.rotation),
      position: rotate(piece.position, rotation).map(
        (value, i) => value + [71, 14, -103][i],
      ) as V3,
    })),
  };
  assert.equal(row(moved).contacts.length, 2);
  assert.equal(row(moved).centerBetweenContacts, true);

  right.cutPlanes = [{ normal: [0, 1, 0], constant: 0.5 }];
  assert.equal(row(project).contacts.length, 1);
  assert.equal(finding(project).severity, "warning");
});

test("stored pin intents are reported separately and only a checked set resolves the support warning", () => {
  const project = createBuildStudy("shelves").project;
  const entry = project.ideaBindings[0].entries[0];
  const plan = makeShelfPinPlan(project, entry.id, {
    shelfRoles: ["shelf-1"],
    layout: {
      system: "custom",
      frontInset: 2,
      rearInset: 2,
      datumHeight: null,
    },
  });
  const shelfId = plan.points[0].shelf.pieceId;
  const pending = saveShelfPinPlan(project, plan);
  const checked = saveShelfPinPlan(project, {
    ...plan,
    measurements: pinMeasurements(),
  });
  const [a, b] = [pending, checked].map((p) =>
    reviewPanelBearing(p).find(({ piece }) => piece.id === shelfId)!,
  );
  assert.equal(a.pinCount, 4);
  assert.equal(a.checkedPins, 0);
  assert.equal(a.reviewedPinSet, false);
  assert.equal(a.shelfSpans, null);
  assert.equal(b.contacts.length, 0);
  assert.equal(b.checkedPins, 4);
  assert.equal(b.reviewedPinSet, true);
  assert.equal(b.shelfSpans?.pinRows.length, 2);
  assert.ok(b.shelfSpans?.pinRows.every((row) => row.reaches.length === 2));
  const id = `panel-bearing-${shelfId}`;
  assert.equal(validate(pending).find((f) => f.id === id)?.severity, "warning");
  assert.equal(validate(checked).find((f) => f.id === id)?.severity, "info");
  checked.pieces.find((piece) => piece.id === shelfId)!.position[1] += 1;
  assert.equal(validate(checked).find((f) => f.id === id)?.severity, "warning");
  assert.equal(
    validate(checked).some(({ id }) => id === `shelf-span-${shelfId}`),
    false,
  );
});

test("paired Home Depot pins and an added cleat measure live spans under a closet tower shelf", () => {
  const project = createBuildStudy("closet-insert").project;
  const shelf = project.pieces.find(
    ({ designRole }) => designRole === "tower-shelf-1",
  )!;
  const current = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, project.ideaBindings[0].entries[0].id, {
      productId: "everbilt-802404",
      shelfRoles: [shelf.designRole!],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
      measurements: pinMeasurements(),
    }),
  );
  const read = () =>
    reviewPanelBearing(current).find(({ piece }) => piece.id === shelf.id)!;
  const original = read().shelfSpans!;
  assert.equal(original.reviewedPinSet, true);
  const [front, rear] = original.pinRows;
  assert.deepEqual([front.row, rear.row], ["front", "rear"]);
  const length = front.spans.find(({ kind }) => kind === "between")!.length;
  const [, y, z] = shelf.position;
  assert.ok(Math.abs(length - (shelf.size[0] - 0.5)) < 1e-7);
  assert.ok(
    front.reaches.every(
      ([a, b]) => Math.abs(Math.abs(a[0] - b[0]) - 0.25) < 1e-7,
    ),
  );
  assert.ok(
    front.reaches.every(
      ([a]) => a[2] > z && Math.abs(a[1] - (y - shelf.size[1] / 2)) < 1e-7,
    ),
  );
  assert.ok(rear.reaches.every(([a]) => a[2] < z));
  assert.ok(
    guideMarkdown(current).includes(
      `Front pin row, ${formatStockLength(length)} between contacts`,
    ),
  );

  const cleat = part(
    "Center cleat",
    "stud",
    [1.5, 1.5, shelf.size[2]],
    [shelf.position[0], y - shelf.size[1] / 2 - 0.75, z],
    current.steps[0].id,
    "Cleats",
  );
  current.pieces.push(cleat);
  for (const row of read().shelfSpans!.pinRows) {
    assert.equal(row.spans.length, 2);
    assert.ok(
      row.spans.every(
        (span) =>
          span.kind === "between" &&
          Math.abs(span.length - (length - 1.5) / 2) < 1e-7,
      ),
    );
  }
  cleat.position[1] -= 0.125;
  assert.equal(read().shelfSpans!.pinRows[0].spans[0].length, length);
});

test("a cut interrupts the span and pin reaches on removed stock are excluded", () => {
  const project = createBuildStudy("shelves").project;
  const entry = project.ideaBindings[0].entries[0];
  const shelf = reviewPanelBearing(project)[0].piece;
  const config = {
    shelfRoles: ["shelf-1"],
    layout: {
      system: "custom" as const,
      frontInset: 2,
      rearInset: 2,
      datumHeight: null,
    },
    measurements: { ...pinMeasurements(), bearingReach: 0.5 },
  };
  const setup = makeShelfPinPlan(project, entry.id, config);
  const front = setup.points.find(
    (point) => point.row === "front" && point.side === "left",
  )!;
  const frontZ = front.shelfAnchorLocal[2];
  shelf.rectangularOpenings = [{ axis: 1, center: [frontZ, 0], spans: [1, 4] }];
  const cut = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, entry.id, config),
  );
  const overhangs = reviewPanelBearing(cut)[0].shelfSpans!.pinRows[0].spans;
  assert.deepEqual(
    overhangs.map(({ kind }) => kind),
    ["overhang", "overhang"],
  );

  shelf.rectangularOpenings = [
    {
      axis: 1,
      center: [frontZ, front.shelfAnchorLocal[0] + 0.25],
      spans: [0.25, 0.125],
    },
  ];
  const rechecked = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, entry.id, config),
  );
  const span = reviewPanelBearing(rechecked)[0].shelfSpans!;
  assert.equal(span.pinRows[0].problem, "cut");
  assert.deepEqual(span.pinRows[0].reaches, []);
  assert.equal(span.reviewedPinSet, false);
  const finding = validate(rechecked).find(
    ({ id }) => id === `shelf-span-${shelf.id}`,
  )!;
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /Front pin row crosses removed shelf material/);
});

test("four geometry-checked pins clustered near the front leave the shelf center outside their footprint", () => {
  const project = createBuildStudy("shelves").project;
  const shelf = reviewPanelBearing(project)[0].piece;
  const supported = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, project.ideaBindings[0].entries[0].id, {
      shelfRoles: ["shelf-1"],
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: shelf.size[2] / 2 + 2,
        datumHeight: null,
      },
      measurements: pinMeasurements(),
    }),
  );
  const row = reviewPanelBearing(supported)[0];
  assert.equal(row.checkedPins, 4);
  assert.equal(row.reviewedPinSet, false);
  const finding = validate(supported).find(
    ({ id }) => id === `shelf-span-${shelf.id}`,
  )!;
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /shelf center lies outside/);
});

test("closed banquette seats and closet tower shelves use actual saved roles", () => {
  const bench = createBuildStudy("storage-banquette").project;
  const rows = reviewPanelBearing(bench);
  assert.equal(rows.length, 3);
  assert.ok(
    rows.every((row) => row.role === "seat" && row.centerBetweenContacts),
  );
  rows[0].piece.rotation[0] += 0.6;
  assert.equal(reviewPanelBearing(bench).length, 2);
  const closet = createBuildStudy("closet-insert").project;
  const tower = reviewPanelBearing(closet);
  assert.deepEqual(
    tower.map(({ piece }) => piece.designRole),
    ["tower-shelf-1", "tower-shelf-2", "tower-shelf-3", "tower-shelf-4"],
  );
  assert.ok(tower.every((row) => row.role === "shelf" && !row.contacts.length));
  assert.deepEqual(
    reviewPanelBearing(createBuildStudy("greenhouse").project),
    [],
  );
});

test("seat span lines meet actual contact edges and update when a rail is cut or moved", () => {
  const project = createBuildStudy("storage-banquette").project;
  const [seat] = reviewPanelBearing(project);
  const result = () =>
    reviewPanelBearing(project).find((row) => row.piece.id === seat.piece.id)!;
  assert.deepEqual(
    seat.seatSpans?.map(({ direction, kind, length }) => [
      direction,
      kind,
      length,
    ]),
    [
      ["width", "between", 19.5],
      ["depth", "between", 19.5],
    ],
  );
  assert.deepEqual(seat.seatSpans?.[0].line, [
    [-33.75, 17.25, 0],
    [-14.25, 17.25, 0],
  ]);
  const front = project.pieces.find(
    (piece) => piece.name === "Banquette section 1 · storage front",
  )!;
  front.cutPlanes = [
    { normal: [0, 1, 0], constant: front.size[1] / 2 - 0.125 },
  ];
  assert.deepEqual(
    result().seatSpans?.find((span) => span.kind === "overhang")?.line,
    [
      [-24, 17.25, 11.25],
      [-24, 17.25, 12],
    ],
  );
  const middleRail = part(
    "Middle test rail",
    "stud",
    [1.5, 1.5, 19.5],
    [-24, 16.5, 0],
    project.steps[0].id,
    "Rails",
  );
  project.pieces.push(middleRail);
  assert.equal(
    result().seatSpans?.find((span) => span.direction === "width")?.length,
    9,
  );
  middleRail.position[1] -= 0.125;
  assert.equal(
    result().seatSpans?.find((span) => span.direction === "width")?.length,
    19.5,
  );
  assert.match(
    guideMarkdown(project),
    /Along the depth, 19\.5 in between contacts, 0\.75 in edge overhang/,
  );
});

test("seat span measurements split retained material at an opening and follow a rotated seat", () => {
  const project = blank("Cut seat");
  const seat = part(
    "Test seat",
    "plywood",
    [24, 0.75, 24],
    [0, 10, 0],
    project.steps[0].id,
    "Seat",
  );
  seat.designRole = "seat";
  seat.rectangularOpenings = [{ axis: 1, center: [0, 0], spans: [6, 14] }];
  project.pieces = [seat];
  const [row] = reviewPanelBearing(project);
  assert.deepEqual(
    row.seatSpans?.map(({ direction, kind, length }) => [
      direction,
      kind,
      length,
    ]),
    [
      ["width", "unsupported", 24],
      ["depth", "unsupported", 9],
    ],
  );
  const finding = validate(project).find(
    ({ id }) => id === `seat-span-${seat.id}`,
  )!;
  assert.equal(finding.severity, "warning");
  assert.match(finding.detail, /2 ft without contact/);
  const angle: V3 = [0, 0.78, 0];
  seat.rotation = angle;
  seat.position = [31, 11, 16];
  const [rotated] = reviewPanelBearing(project);
  assert.ok(
    rotated.seatSpans?.every(
      (span, i) => Math.abs(span.length - row.seatSpans![i].length) < 1e-7,
    ),
  );
  const expected = rotate(
    row.seatSpans![1].line[0].map(
      (value, axis) => value - [0, 10, 0][axis],
    ) as V3,
    angle,
  );
  assert.ok(
    rotated.seatSpans![1].line[0].every(
      (value, i) => Math.abs(value - expected[i] - seat.position[i]) < 1e-7,
    ),
  );
  seat.rotation = [0.3, 0, 0];
  assert.equal(
    validate(project).some(({ id }) => id === `seat-span-${seat.id}`),
    false,
  );
});
