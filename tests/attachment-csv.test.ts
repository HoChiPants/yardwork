import assert from "node:assert/strict";
import test from "node:test";
import { blank, type Project } from "../src/model";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  attachmentReviews,
  makeShelfPinPlan,
  saveShelfPinPlan,
  shelfSupportEntries,
} from "../src/attachments";
import {
  emptyShelfPinMeasurements,
  type ShelfPinMeasurements,
} from "../src/attachmentSchema";
import { attachmentScheduleCsv } from "../src/attachmentCsv";
import { bom } from "../src/engine";

const measuredAt = "2026-11-16T22:50:00Z";
function project(
  measurements?: ShelfPinMeasurements,
  name = "Planned shelf supports",
) {
  const initial = createBuildStudy(
      "shelves",
      defaultBuildStudyParameters("shelves"),
    ).project,
    entry = shelfSupportEntries(initial)[0];
  return saveShelfPinPlan(
    initial,
    makeShelfPinPlan(initial, entry.entryId, {
      name,
      shelfRoles: entry.shelves.map((shelf) => shelf.role),
      layout: {
        system: "custom",
        frontInset: 2,
        rearInset: 2,
        datumHeight: null,
      },
      measurements,
    }),
  );
}
function measured(): ShelfPinMeasurements {
  return {
    pinInsertionDepth: 0.2,
    bearingReach: 0.25,
    bearingOffset: 0.05123456789,
    fullDiameterBoreDepth: 0.25,
    deepestDrillTipDepth: 0.3,
    basis: "User caliper and same-stock test-bore measurements",
    measuredAt,
  };
}
/** Independent RFC-style field reader, including escaped quotes and multiline fields. */
function records(csv: string): {
  header: string[];
  rows: Record<string, string>[];
} {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  row.push(value);
  rows.push(row);
  assert.equal(quoted, false);
  const [header, ...body] = rows;
  for (const cells of body) assert.equal(cells.length, header.length);
  return {
    header,
    rows: body.map((cells) =>
      Object.fromEntries(header.map((key, index) => [key, cells[index]])),
    ),
  };
}
const holeColumns = [
  "Computed hole mount-local X (in)",
  "Computed hole mount-local Y (in)",
  "Computed hole mount-local Z (in)",
  "Computed hole world X (in)",
  "Computed hole world Y (in)",
  "Computed hole world Z (in)",
];
const drillColumns = [
  "Inward drill axis world X (unitless)",
  "Inward drill axis world Y (unitless)",
  "Inward drill axis world Z (unitless)",
];

test("empty attachment CSV has only schedule headers and never adds procurement data", () => {
  const p = blank(),
    saved = JSON.stringify(p),
    parsed = records(attachmentScheduleCsv(p));
  assert.equal(parsed.rows.length, 0);
  for (const column of [
    "Plan ID",
    "Point ID",
    "Nominal 5 mm bore (in)",
    "User measurement basis",
    "Issues",
    ...holeColumns,
  ])
    assert.ok(parsed.header.includes(column));
  assert.ok(
    parsed.header.every(
      (column) => !/price|buy|purchase|pack|stock units/i.test(column),
    ),
  );
  assert.equal(JSON.stringify(p), saved);
});

test("pending points retain exact shelf/mount references and nominal bore without invented hole centers", () => {
  const p = project(),
    saved = JSON.stringify(p),
    shopping = bom(p),
    plan = p.attachmentPlans[0],
    { rows } = records(attachmentScheduleCsv(p));
  assert.equal(rows.length, 12);
  for (const row of rows) {
    const point = plan.points.find((point) => point.id === row["Point ID"])!;
    assert.equal(row["Plan ID"], plan.id);
    assert.equal(row["Product ID"], "kreg-kma-5mpin");
    assert.equal(row["Plan state"], "needs-measurements");
    assert.equal(row["Coordinate status"], "PENDING");
    assert.equal(row["Shelf role"], point.shelf.role);
    assert.equal(row["Shelf part ID"], point.shelf.pieceId);
    assert.equal(row["Shelf section ID"], point.shelf.sectionId);
    assert.equal(row["Mount role"], point.mount.role);
    assert.equal(row["Mount part ID"], point.mount.pieceId);
    assert.equal(row["Mount section ID"], point.mount.sectionId);
    assert.equal(row["Side"], point.side);
    assert.equal(row["Row"], point.row);
    assert.equal(row["Mount face"], `X${point.mountFace.sign > 0 ? "+" : "-"}`);
    assert.equal(row["Nominal 5 mm bore (in)"], (5 / 25.4).toFixed(6));
    for (const column of [...holeColumns, ...drillColumns])
      assert.equal(row[column], "PENDING");
    assert.equal(row["User pin insertion depth (in)"], "PENDING");
    assert.equal(row["User measured at"], "PENDING");
    assert.match(row["Issues"], /missing|unknown|measurement/i);
    assert.match(row["Scope"], /not proof.*load capacity/i);
  }
  assert.deepEqual(bom(p), shopping);
  assert.equal(JSON.stringify(p), saved);
  assert.equal(p.supplies.length, 0);
});

test("partial mechanics export computed centers only as candidate/pending with other fields unresolved", () => {
  const p = project({
      ...emptyShelfPinMeasurements(),
      bearingOffset: 0.123456789,
      basis: "User bearing-axis measurement",
      measuredAt,
    }),
    review = attachmentReviews(p)[0],
    { rows } = records(attachmentScheduleCsv(p));
  assert.equal(review.state, "needs-measurements");
  for (const row of rows) {
    const resolved = review.points.find(
      (point) => point.point.id === row["Point ID"],
    )!;
    assert.equal(row["Coordinate status"], "candidate/pending");
    assert.equal(
      row["Computed hole mount-local Y (in)"],
      resolved.holeCenterLocal![1].toFixed(6),
    );
    assert.equal(row["User signed bearing offset above axis (in)"], "0.123457");
    assert.equal(row["User full-diameter bore depth (in)"], "PENDING");
    assert.equal(row["User deepest drill-tip depth (in)"], "PENDING");
  }
});

test("checked geometry preserves six-decimal local/world coordinates and explicitly denies capacity approval", () => {
  const p = project(measured());
  for (const part of p.pieces) part.position[0] += 7.123456789;
  const review = attachmentReviews(p)[0],
    { rows } = records(attachmentScheduleCsv(p));
  assert.equal(review.state, "geometry-checked");
  for (const row of rows) {
    const resolved = review.points.find(
      (point) => point.point.id === row["Point ID"],
    )!;
    assert.equal(row["Coordinate status"], "geometric-review-only");
    for (const [index, column] of holeColumns.slice(0, 3).entries())
      assert.equal(row[column], resolved.holeCenterLocal![index].toFixed(6));
    for (const [index, column] of holeColumns.slice(3).entries())
      assert.equal(row[column], resolved.holeCenterWorld![index].toFixed(6));
    for (const [index, column] of drillColumns.entries())
      assert.equal(row[column], resolved.drillDirectionWorld[index].toFixed(6));
    assert.equal(row["User pin insertion depth (in)"], "0.200000");
    assert.equal(row["User bearing reach (in)"], "0.250000");
    assert.equal(row["User signed bearing offset above axis (in)"], "0.051235");
    assert.equal(row["User full-diameter bore depth (in)"], "0.250000");
    assert.equal(row["User deepest drill-tip depth (in)"], "0.300000");
    assert.match(row["Scope"], /not proof.*code\/engineering approval/i);
  }
});

test("stale or conflicting plans expose recorded intent but suppress all active drill coordinates", () => {
  const original = project(measured()),
    stale: Project = structuredClone(original);
  const mountId = stale.attachmentPlans[0].points[0].mount.pieceId;
  stale.pieces = stale.pieces.filter((piece) => piece.id !== mountId);
  const conflict = project({ ...measured(), deepestDrillTipDepth: 2 });
  for (const p of [stale, conflict]) {
    const review = attachmentReviews(p)[0],
      { rows } = records(attachmentScheduleCsv(p));
    assert.ok(["stale", "conflict"].includes(review.state));
    for (const row of rows) {
      assert.match(row["Coordinate status"], /^EXCLUDED/);
      for (const column of [...holeColumns, ...drillColumns, "32 mm row index"])
        assert.equal(row[column], "PENDING (excluded)");
      assert.match(row["Bearing target mount-local X (in)"], /^-?\d+\.\d{6}$/);
      assert.ok(row["Issues"].length > 0);
    }
  }
});

test("CSV round-trips multiline quotes/commas in provenance and neutralizes spreadsheet formula text", () => {
  const name = 'Front, "left"\nreview',
    basis = 'Caliper, "A"\r\nSecond measurement line';
  const p = project({ ...measured(), basis }, name),
    saved = JSON.stringify(p),
    csv = attachmentScheduleCsv(p),
    row = records(csv).rows[0];
  assert.equal(row["Plan name"], name);
  assert.equal(row["User measurement basis"], basis);
  assert.equal(row["User measured at"], measuredAt);
  assert.ok(csv.includes('"Caliper, ""A""\r\nSecond measurement line"'));
  assert.equal(JSON.stringify(p), saved);
  const formulas = project(
    { ...measured(), basis: '=HYPERLINK("example","text")' },
    "@SUM(1,2)",
  );
  const guarded = records(attachmentScheduleCsv(formulas)).rows[0];
  assert.equal(guarded["Plan name"], "'@SUM(1,2)");
  assert.equal(
    guarded["User measurement basis"],
    '\'=HYPERLINK("example","text")',
  );
  assert.match(guarded["Scope"], /prefixed with an apostrophe/);
  assert.equal(
    formulas.attachmentPlans[0].measurements.basis,
    '=HYPERLINK("example","text")',
  );
});
