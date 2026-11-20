import assert from "node:assert/strict";
import test from "node:test";
import { getHingeProduct, hingeProductId } from "../src/hingeProducts";
import {
  hingeStockSourceSchema,
  type HingeStockSource,
} from "../src/hingeStockSchema";
import {
  makeHingeStockSource,
  makeHingeStockCut,
  reviewHingeStock,
  sourceFingerprint,
  updateHingeStockSource,
  assertHingeStockHistoryPrefix,
  retainHingeStockHistory,
} from "../src/hingeStock";
import { blank, projectSchema } from "../src/model";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import {
  hingePurchaseSummary,
  addMissingHingePacks,
  type HingePurchaseAllocation,
} from "../src/hingePurchases";

const date = "2026-11-16T18:00:00Z";
function measured(): HingeStockSource {
  return {
    ...makeHingeStockSource(),
    usableLength: 48,
    basis: "SYNTHETIC actual-unit measurement fixture",
    measuredAt: date,
  };
}
function cut(position: number | null, kerf: number | null) {
  return {
    ...makeHingeStockCut(),
    position,
    kerf,
    basis: "SYNTHETIC metal saw measurement",
    measuredAt: date,
  };
}

test("reference identifies the existing one-hinge HD product without manufacturing installation facts", () => {
  const p = getHingeProduct(hingeProductId)!;
  assert.equal(p.packCount, 1);
  assert.equal(p.nominalLength, 48);
  assert.equal(p.referencePilotDiameter, 1 / 16);
  assert.equal(p.actualUsableLength, null);
  assert.equal(p.cutKerf, null);
  assert.equal(p.holePattern, null);
  assert.equal(p.suppliedScrewCount, null);
  assert.ok(
    p.sources.some((s) => s.url === "https://www.homedepot.com/p/314150989"),
  );
  assert.ok(!p.sources.some((s) => s.url.includes("lowes.com")));
  assert.equal(getHingeProduct("national-v570"), undefined);
});

test("a new physical source and cut preserve unknown measurements rather than defaulting48/wood kerf", () => {
  const s = makeHingeStockSource();
  assert.equal(s.usableLength, null);
  assert.equal(s.measuredAt, null);
  assert.equal(s.purchaseSelectionId, null);
  assert.deepEqual(s.referenceHistory, []);
  assert.equal(makeHingeStockCut().kerf, null);
  const review = reviewHingeStock(s);
  assert.equal(review.state, "needs-measurements");
  assert.deepEqual(review.segments, []);
});

test("one measured uncut source yields one interval with physical start/end identity", () => {
  const s = measured(),
    before = JSON.stringify(s),
    r = reviewHingeStock(s);
  assert.equal(r.state, "geometry-reviewed");
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].start, 0);
  assert.equal(r.segments[0].length, 48);
  assert.equal(r.segments[0].startEnd.kind, "source-start");
  assert.equal(r.segments[0].endEnd.kind, "source-end");
  assert.equal(JSON.stringify(s), before);
});

test("cuts derive retained segments, remnant lengths and stable original/cut end identities", () => {
  const a = cut(22.75, 1 / 16),
    s = { ...measured(), cuts: [a] },
    r = reviewHingeStock(s);
  assert.equal(r.state, "geometry-reviewed");
  assert.deepEqual(
    r.segments.map((x) => [x.start, x.length]),
    [
      [0, 22.75],
      [22.8125, 25.1875],
    ],
  );
  assert.deepEqual(r.segments[0].endEnd, { kind: "cut-before", cutId: a.id });
  assert.deepEqual(r.segments[1].startEnd, { kind: "cut-after", cutId: a.id });
  const b = cut(35, 0.1),
    two = reviewHingeStock({ ...s, cuts: [b, a] });
  assert.equal(
    two.segments[0].id,
    r.segments[0].id,
    "unaffected physical segment keeps its identity",
  );
  assert.deepEqual(
    two.segments,
    reviewHingeStock({ ...s, cuts: [a, b] }).segments,
  );
  assert.ok(two.segments.every((segment) => segment.id.length <= 160));
});

test("two full24-inch segments plus a positive kerf do not fit48 inches", () => {
  const r = reviewHingeStock({ ...measured(), cuts: [cut(24, 0.125)] });
  assert.equal(r.state, "geometry-reviewed");
  assert.deepEqual(
    r.segments.map((segment) => segment.length),
    [24, 23.875],
  );
  assert.equal(r.segments.filter((segment) => segment.length >= 24).length, 1);
});

test("overlapping kerfs, cuts outside stock and zero retained regions fail without phantom segments", () => {
  for (const cuts of [
    [cut(10, 2), cut(11, 1)],
    [cut(47.95, 0.1)],
    [cut(0, 0.1)],
    [cut(47.9, 0.1)],
    [cut(10, 1), cut(11, 1)],
  ]) {
    const r = reviewHingeStock({ ...measured(), cuts });
    assert.equal(r.state, "conflict", JSON.stringify(cuts));
    assert.deepEqual(r.segments, []);
    assert.ok(r.issues.some((issue) => issue.severity === "error"));
  }
});

test("unknown cut measurements/provenance and future evidence remain pending", () => {
  for (const s of [
    { ...measured(), cuts: [cut(24, null)] },
    { ...measured(), basis: "" },
    { ...measured(), measuredAt: "2999-01-01T00:00:00Z" },
    { ...measured(), cuts: [{ ...cut(24, 0.1), measuredAt: null }] },
    { ...measured(), evidenceRevision: "unreviewed-source-revision" },
  ]) {
    const r = reviewHingeStock(s);
    assert.equal(r.state, "needs-measurements");
    assert.deepEqual(r.segments, []);
  }
});

test("physical fingerprints ignore metadata/order while tracking source, cuts and product revision", () => {
  const s = { ...measured(), cuts: [cut(10, 0.1), cut(20, 0.2)] },
    fp = sourceFingerprint(s);
  assert.equal(
    sourceFingerprint({
      ...s,
      notes: "New note",
      measuredAt: date.replace("18:", "17:"),
      cuts: [...s.cuts].reverse(),
    }),
    fp,
  );
  assert.notEqual(sourceFingerprint({ ...s, usableLength: 47.9 }), fp);
  assert.notEqual(
    sourceFingerprint({
      ...s,
      cuts: s.cuts.map((c, i) => (i ? c : { ...c, kerf: 0.11 })),
    }),
    fp,
  );
  assert.notEqual(sourceFingerprint({ ...s, id: crypto.randomUUID() }), fp);
  assert.notEqual(sourceFingerprint({ ...s, evidenceRevision: "other" }), fp);
});

test("explicit stock edit archives exact old and new facts, no-op leaves bytes and immutable receipts intact", () => {
  const s = { ...measured(), cuts: [cut(22.75, 0.0625)] },
    before = JSON.stringify(s);
  const next = updateHingeStockSource(
    s,
    { usableLength: 47.9 },
    "Remeasured actual unit",
    date,
  );
  assert.equal(JSON.stringify(s), before);
  assert.equal(next.referenceHistory.length, 1);
  assert.equal(next.referenceHistory[0].previous.usableLength, 48);
  assert.equal(next.referenceHistory[0].next.usableLength, 47.9);
  assert.deepEqual(next.referenceHistory[0].previous.cuts, s.cuts);
  assert.equal(
    updateHingeStockSource(next, { usableLength: 47.9 }, "No change", date),
    next,
  );
  assert.doesNotThrow(() => assertHingeStockHistoryPrefix([s], [next]));
  assert.throws(() => assertHingeStockHistoryPrefix([next], [s]), /history/i);
  const rewritten = structuredClone(next);
  rewritten.referenceHistory[0].basis = "rewritten";
  assert.throws(
    () => assertHingeStockHistoryPrefix([next], [rewritten]),
    /history/i,
  );
  assert.doesNotThrow(
    () => assertHingeStockHistoryPrefix([next], []),
    "explicit source removal remains allowed",
  );
});

test("Undo/Redo retains source history receipts while restoring active measurements; conflicting rewrites reject", () => {
  const first = measured(),
    next = updateHingeStockSource(
      first,
      { usableLength: 47.9 },
      "Actual measure",
      date,
    );
  const restored = retainHingeStockHistory([first], [next])[0];
  assert.equal(restored.usableLength, 48);
  assert.deepEqual(restored.referenceHistory, next.referenceHistory);
  assert.doesNotThrow(() => assertHingeStockHistoryPrefix([next], [restored]));
  const bad = structuredClone(restored);
  bad.referenceHistory[0].previous.usableLength = 40;
  assert.throws(() => retainHingeStockHistory([bad], [next]), /history/i);
});

test("source history stops at50 without silently dropping exact earlier evidence", () => {
  let source = measured();
  for (let index = 1; index <= 50; index++)
    source = updateHingeStockSource(
      source,
      { usableLength: 48 - index / 1000 },
      `Synthetic correction${index}`,
      date,
    );
  const before = JSON.stringify(source);
  assert.equal(source.referenceHistory.length, 50);
  assert.equal(source.referenceHistory[0].previous.usableLength, 48);
  assert.throws(
    () =>
      updateHingeStockSource(
        source,
        { usableLength: 47 },
        "History full",
        date,
      ),
    /history is full/i,
  );
  assert.equal(JSON.stringify(source), before);
});

test("neutral persisted source JSON roundtrips and rejects counterfeit cut identities/zero kerf", () => {
  const s = { ...measured(), cuts: [cut(12, 0.1)] };
  assert.deepEqual(
    hingeStockSourceSchema.parse(JSON.parse(JSON.stringify(s))),
    s,
  );
  assert.equal(
    hingeStockSourceSchema.safeParse({ ...s, cuts: [s.cuts[0], s.cuts[0]] })
      .success,
    false,
  );
  assert.equal(
    hingeStockSourceSchema.safeParse({
      ...s,
      cuts: [{ ...s.cuts[0], kerf: 0 }],
    }).success,
    false,
  );
  assert.equal(
    hingeStockSourceSchema.safeParse({ ...s, productId: "national-n148-379" })
      .success,
    false,
  );
});

function allocation(
  sourceId: string,
  segmentId: string,
): HingePurchaseAllocation {
  return {
    planId: crypto.randomUUID(),
    sourceId,
    segmentId,
    included: true,
    reasons: [],
  };
}

test("two distinct retained segments across plans consume one physical source and one explicit supply", () => {
  const source = { ...measured(), cuts: [cut(22.75, 0.0625)] },
    segments = reviewHingeStock(source).segments;
  const p = {
    ...blank("Synthetic hinge purchase"),
    hingeStockSources: [source],
  };
  const allocations = segments.map((segment) =>
      allocation(source.id, segment.id),
    ),
    before = JSON.stringify(p);
  let summary = hingePurchaseSummary(p, allocations);
  assert.equal(summary.requiredHinges, 1);
  assert.equal(summary.shortfallHinges, 1);
  assert.equal(p.supplies.length, 0);
  assert.equal(JSON.stringify(p), before);
  const selected = addMissingHingePacks(p, allocations);
  assert.equal(selected.supplies.length, 1);
  assert.equal(selected.supplies[0].quantity, 1);
  assert.equal(
    selected.pieces.length,
    0,
    "no hinge/remnant/screw geometry created",
  );
  assert.equal(selected.joints.length, 0);
  assert.deepEqual(selected.hingeStockSources, p.hingeStockSources);
  summary = hingePurchaseSummary(selected, allocations);
  assert.equal(summary.shortfallHinges, 0);
  assert.equal(summary.selectedHinges, 1);
  assert.equal(addMissingHingePacks(selected, allocations), selected);
  assert.equal(
    supplyRows(selected).length,
    1,
    "only the manual purchase row is priced",
  );
});

test("duplicate active segment claims exclude both; a different surviving segment still counts its source once", () => {
  const source = { ...measured(), cuts: [cut(22.75, 0.0625)] },
    [a, b] = reviewHingeStock(source).segments,
    p = { ...blank(), hingeStockSources: [source] };
  const claims = [allocation(source.id, a.id), allocation(source.id, a.id)];
  assert.equal(hingePurchaseSummary(p, claims).requiredHinges, 0);
  assert.ok(
    hingePurchaseSummary(p, claims).allocationRows.every(
      (row) => !row.included,
    ),
  );
  const surviving = hingePurchaseSummary(p, [
    ...claims,
    allocation(source.id, b.id),
  ]);
  assert.equal(surviving.requiredHinges, 1);
  assert.equal(surviving.incomplete, true);
});

test("missing/pending/stale allocations do not invent units or consume a remnant", () => {
  const source = measured(),
    segment = reviewHingeStock(source).segments[0],
    p = { ...blank(), hingeStockSources: [source, makeHingeStockSource()] };
  const rows = [
    {
      ...allocation(source.id, segment.id),
      included: false,
      reasons: ["Captured member is stale"],
    },
    allocation(crypto.randomUUID(), segment.id),
    allocation(source.id, "removed-segment"),
    allocation(p.hingeStockSources[1].id, "not-yet-measured"),
  ];
  const summary = hingePurchaseSummary(p, rows);
  assert.equal(summary.requiredHinges, 0);
  assert.equal(summary.canAddMissing, false);
  assert.ok(summary.warnings.some((warning) => warning.includes("stale")));
  assert.equal(summary.sourceRows[0].segments[0].allocated, false);
});

test("exact Home Depot hinge reference stays visible at Lowe's without a substitute purchase or stock claim", () => {
  const source = measured(),
    p = { ...blank(), retailer: "lowes" as const, hingeStockSources: [source] },
    allocations = [
      allocation(source.id, reviewHingeStock(source).segments[0].id),
    ],
    summary = hingePurchaseSummary(p, allocations);
  assert.equal(summary.requiredHinges, 1);
  assert.equal(summary.retailerSupported, false);
  assert.equal(summary.canAddMissing, false);
  assert.ok(
    summary.referenceOffers.some(
      (offer) =>
        offer.retailer === "home-depot" && offer.productId === "314150989",
    ),
  );
  assert.ok(
    !summary.referenceOffers.some((offer) => offer.retailer === "lowes"),
  );
  assert.throws(() => addMissingHingePacks(p, allocations), /retailer/i);
});

test("manual hinge units cover sources once, while unrelated screws and dangling purchase links give no inferred credit", () => {
  const source = { ...measured(), purchaseSelectionId: crypto.randomUUID() },
    p = addSupply(
      { ...blank(), hingeStockSources: [source] },
      "grk-r4-103101",
      1,
    ),
    allocations = [
      allocation(source.id, reviewHingeStock(source).segments[0].id),
    ],
    summary = hingePurchaseSummary(p, allocations);
  assert.equal(summary.selectedHinges, 0);
  assert.equal(summary.requiredHinges, 1);
  assert.equal(summary.sourceRows[0].linkedPurchaseValid, false);
  assert.ok(
    summary.warnings.some((warning) =>
      warning.includes("linked manual supply"),
    ),
  );
  const selected = addSupply(p, hingeProductId, 2),
    covered = hingePurchaseSummary(selected, allocations);
  assert.equal(covered.selectedHinges, 2);
  assert.equal(covered.spareHinges, 1);
});

test("exact per-hinge synthetic snapshot prices only the existing manual supply row and roundtrips source history", () => {
  const source = measured(),
    next = updateHingeStockSource(
      source,
      { cuts: [cut(22, 0.1)] },
      "Synthetic cut",
      date,
    );
  let p = addSupply(
    { ...blank(), store: "SYNTHETIC-84121", hingeStockSources: [next] },
    hingeProductId,
    2,
  );
  p = recordSupplyInventory(p, {
    productId: hingeProductId,
    retailer: "home-depot",
    retailerProductId: "314150989",
    price: 9.5,
    available: 2,
    store: p.store,
    zip: p.zip,
    checkedAt: new Date().toISOString(),
    url: "https://www.homedepot.com/p/314150989",
  });
  const row = supplyRows(p)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.total, 19);
  assert.equal(row.inventory?.retailerProductId, "314150989");
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(p))).hingeStockSources,
    p.hingeStockSources,
  );
});
