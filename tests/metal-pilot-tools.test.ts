import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blank, part, projectSchema, uid, type Project } from "../src/model";
import { bom } from "../src/engine";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import { toolCapabilities } from "../src/toolCapabilities";
import { toolChecklist } from "../src/tools";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { lidHingeReviews } from "../src/hinges";
import { hingeIntentSnapshot } from "../src/hingeSchema";
import {
  addFastenerLocation,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";

const now = Date.parse("2026-11-18T12:00:00Z"),
  checkedAt = "2026-11-17T10:30:00Z";
const ids = ["crescent-cthack", "gearwrench-82821h", "milwaukee-48-89-4601"];
function fixture() {
  const p = projectSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../public/examples/hinges/synthetic-measured-banquette.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  const plan = p.lidHingePlans.find((row) => row.label === "H001")!;
  p.lidHingePlans = [plan];
  assert.equal(lidHingeReviews(p)[0].state, "geometry-reviewed");
  return p;
}
function row(p: Project, capability: string, selected: string[] = []) {
  const project = {
    ...p,
    toolSelections: selected.map((productId) => ({ productId, checkedAt })),
  };
  return toolChecklist(
    project,
    selectedToolsForProject(project, now).tools,
    now,
  ).requirements.find((r) => r.capability === capability);
}

test("reviewed metal and small-bit references preserve exact package identities without forced retailer matches", () => {
  const saw = findRetailerProduct(ids[0])!,
    files = findRetailerProduct(ids[1])!,
    bits = findRetailerProduct(ids[2])!;
  assert.ok(saw && files && bits);
  assert.equal(saw.manufacturerPartNumber, "CTHACK");
  assert.deepEqual(
    saw.offers.map((o) => [o.retailer, o.productId]),
    [
      ["home-depot", "329735947"],
      ["lowes", "5015029165"],
    ],
  );
  assert.equal(saw.profile.packCount, 1);
  assert.equal(files.manufacturerPartNumber, "82821H");
  assert.equal(
    files.profile.packCount,
    1,
    "six different files are one reviewed set",
  );
  assert.deepEqual(
    files.offers.map((o) => o.productId),
    ["315994439"],
  );
  assert.equal(bits.manufacturerPartNumber, "48-89-4601");
  assert.equal(
    bits.profile.packCount,
    2,
    "two identical bits in the exact package",
  );
  assert.deepEqual(
    bits.offers.map((o) => o.productId),
    ["205878986"],
  );
  for (const product of [saw, files, bits]) {
    assert.equal(product.category, "tool");
    assert.equal(product.profile.stockSize, null);
    assert.equal(product.profile.dimensionMeaning, "unverified");
    assert.equal(product.status, "reviewed-specs");
    assert.ok(
      product.toolCapabilityEvidence.every((e) =>
        e.sourceRefs.every((url) => product.sources.some((s) => s.url === url)),
      ),
    );
  }
  assert.deepEqual(
    referenceOffersForProduct(files).filter((o) => o.retailer === "lowes"),
    [],
  );
  assert.deepEqual(
    referenceOffersForProduct(bits).filter((o) => o.retailer === "lowes"),
    [],
  );
  assert.match(files.discrepancies.join(" "), /4 in nominal.*3 in working/i);
  assert.match(bits.discrepancies.join(" "), /QUAD EDGE|variable.*helix/i);
});

test("the three checked references cover only their narrow documented function and never supply a motor or purchases", () => {
  const p = fixture(),
    initial = JSON.stringify(p),
    oldBom = bom(p);
  assert.ok(toolCapabilities.includes("pilot-bit-1-16"));
  assert.equal(row(p, "metal-cut", [ids[0]])?.status, "supported");
  assert.equal(row(p, "metal-deburr", [ids[0]])?.status, "unknown");
  assert.equal(row(p, "metal-cut", [ids[1]])?.status, "unknown");
  assert.equal(row(p, "metal-deburr", [ids[1]])?.status, "supported");
  assert.equal(row(p, "pilot-bit-1-16", [ids[2]])?.status, "supported");
  assert.equal(row(p, "drill-pilot", [ids[2]])?.status, "unknown");
  assert.equal(
    row(p, "drill-pilot", [ids[2], "dewalt-dcd771c2"])?.status,
    "supported",
  );
  assert.equal(
    row(p, "pilot-bit-1-16", ["dewalt-dcd771c2"])?.status,
    "unknown",
  );
  assert.equal(JSON.stringify(p), initial);
  assert.deepEqual(bom(p), oldBom);
});

test("a current entered one-sixteenth hinge pilot yields a conditional accessory review separate from drill/setup approval", () => {
  const p = fixture(),
    plan = p.lidHingePlans[0],
    requirement = row(p, "pilot-bit-1-16")!;
  assert.ok(requirement);
  assert.equal(requirement.necessity, "conditional");
  assert.equal(requirement.status, "unknown");
  assert.ok(
    requirement.sources.some(
      (s) => s.kind === "hinge-plan" && s.id === plan.id,
    ),
  );
  assert.match(requirement.review, /powered drill|powered-drill/i);
  assert.match(requirement.review, /deepest.*tip|tip.*depth/i);
});

test("linked reference, unknown/different diameters and missing or future user provenance do not become one-sixteenth bit requirements", () => {
  for (const variant of [
    "unknown",
    "different",
    "missing-basis",
    "missing-date",
    "future",
  ] as const) {
    const p = fixture();
    for (const l of p.lidHingePlans[0].locations) {
      l.measurements.pilotDiameter =
        variant === "unknown" ? null : variant === "different" ? 0.125 : 0.0625;
      if (variant === "missing-basis") l.measurements.basis = "";
      if (variant === "missing-date") l.measurements.measuredAt = null;
      if (variant === "future")
        l.measurements.measuredAt = "2099-01-01T00:00:00Z";
    }
    assert.equal(row(p, "pilot-bit-1-16"), undefined, variant);
    assert.ok(
      row(p, "drill-pilot"),
      "generic drill/setup review remains unresolved",
    );
  }
});

test("stale, conflicted and history-only pilot values never authorize an active accessory row", () => {
  const stale = fixture(),
    oldPlan = stale.lidHingePlans[0];
  stale.pieces.find((p) => p.id === oldPlan.fixed.pieceId)!.size[0] -= 0.1;
  assert.equal(lidHingeReviews(stale)[0].state, "stale");
  assert.equal(row(stale, "pilot-bit-1-16"), undefined);
  const conflict = fixture();
  conflict.lidHingePlans[0].locations[0].driveLocal = [0, 0, -1];
  assert.equal(lidHingeReviews(conflict)[0].state, "conflict");
  assert.equal(row(conflict, "pilot-bit-1-16"), undefined);
  const historical = fixture(),
    plan = historical.lidHingePlans[0],
    previous = hingeIntentSnapshot(plan);
  for (const l of plan.locations) l.measurements.pilotDiameter = null;
  plan.referenceHistory.push({
    id: uid(),
    kind: "refresh",
    at: "2026-11-17T10:00:00Z",
    basis: "SYNTHETIC old bit record retained only as history",
    locationMode: "retain-local",
    previous,
    next: hingeIntentSnapshot(plan),
  });
  assert.ok(projectSchema.safeParse(historical).success);
  assert.ok(
    plan.referenceHistory
      .at(-1)!
      .previous.locations.every((l) => l.measurements.pilotDiameter === 0.0625),
  );
  assert.equal(row(historical, "pilot-bit-1-16"), undefined);
});

test("shortened metal tube stock needs a separate deburring review without extending it to wood or plastic", () => {
  const p = blank();
  p.pieces = [
    part(
      "Short closet rod",
      "closet-rod-72",
      [1.3125, 36, 1.3125],
      [0, 24, 0],
      p.steps[0].id,
      "Rod",
    ),
  ];
  assert.equal(row(p, "metal-cut")?.necessity, "conditional");
  assert.equal(row(p, "metal-deburr")?.necessity, "conditional");
  assert.equal(row(p, "metal-deburr", [ids[1]])?.status, "supported");
  assert.match(
    row(p, "metal-deburr")!.review,
    /actual.*material|actual.*metal|finish/i,
  );
  p.pieces = [
    part("Wood", "stud", [1.5, 36, 3.5], [0, 18, 0], p.steps[0].id, "Frame"),
  ];
  assert.equal(row(p, "metal-deburr"), undefined);
  p.pieces = [
    part(
      "Glazing",
      "sunlite-8mm",
      [24, 8 / 25.4, 36],
      [0, 18, 0],
      p.steps[0].id,
      "Panel",
    ),
  ];
  assert.equal(row(p, "metal-deburr"), undefined);
});

test("wood-screw pilot bit review follows current included locations and user provenance, including mixed-point plans", () => {
  let p = blank("SYNTHETIC current wood-screw pilot accessory");
  p.pieces = [
    part(
      "Head",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, 0],
      p.steps[0].id,
      "",
    ),
    part(
      "Receiver",
      "plytanium-703",
      [10, 10, 0.703],
      [0, 0, -0.953],
      p.steps[0].id,
      "",
    ),
  ];
  let plan = addFastenerLocation(
    makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id),
  );
  plan.locations[0].entranceLocal = [0, 0, 0.3515];
  plan.locations[0].driveLocal = [0, 0, -1];
  plan.measurements = {
    surfaceToTipDepth: 1.2,
    pilotDiameter: 0.0625,
    pilotDepth: 1.1,
    basis: "SYNTHETIC actual user pilot datum",
    measuredAt: "2026-11-16T18:00:00Z",
  };
  p = saveFastenerPlan(p, plan);
  assert.equal(fastenerReviews(p, now)[0].activePointCount, 1);
  assert.ok(
    row(p, "pilot-bit-1-16")?.sources.some(
      (s) => s.kind === "fastener-plan" && s.id === plan.id,
    ),
  );
  assert.equal(row(p, "pilot-bit-1-16", [ids[2]])?.status, "supported");
  assert.equal(row(p, "drill-pilot", [ids[2]])?.status, "unknown");
  plan = addFastenerLocation(p.fastenerPlans[0]);
  plan.locations[1].entranceLocal = [7, 0, 0.3515];
  plan.locations[1].driveLocal = [0, 0, -1];
  p = saveFastenerPlan(p, plan);
  assert.equal(fastenerReviews(p, now)[0].state, "conflict");
  assert.equal(fastenerReviews(p, now)[0].activePointCount, 1);
  assert.ok(
    row(p, "pilot-bit-1-16"),
    "the active nonconflicting point retains its own measured bit intent",
  );
  for (const variant of [
    "unknown",
    "different",
    "future",
    "missing-basis",
  ] as const) {
    const changed = structuredClone(p),
      m = changed.fastenerPlans[0].measurements;
    if (variant === "unknown") m.pilotDiameter = null;
    if (variant === "different") m.pilotDiameter = 0.125;
    if (variant === "future") m.measuredAt = "2099-01-01T00:00:00Z";
    if (variant === "missing-basis") m.basis = "";
    assert.equal(row(changed, "pilot-bit-1-16"), undefined, variant);
  }
  const stale = structuredClone(p);
  stale.pieces[0].size[0] -= 0.1;
  assert.equal(row(stale, "pilot-bit-1-16"), undefined);
  p.fastenerPlans[0].locations[0].driveLocal = [0, 0, 1];
  assert.equal(fastenerReviews(p, now)[0].activePointCount, 0);
  assert.equal(row(p, "pilot-bit-1-16"), undefined);
});

test("tool review selections survive JSON and keep evidence scope and unresolved operation checks in the guide", () => {
  const p = fixture(),
    originalBom = bom(p);
  p.toolSelections = ids.map((productId) => ({ productId, checkedAt }));
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(p))),
    text = toolGuideMarkdown(restored, now);
  assert.deepEqual(restored.toolSelections, p.toolSelections);
  assert.match(text, /CTHACK/);
  assert.match(text, /82821H/);
  assert.match(text, /48-89-4601/);
  assert.match(text, /1\/16.*pilot bit/);
  assert.match(text, /not.*powered drill|no.*powered drill/i);
  assert.match(text, /do not establish ownership/);
  assert.match(text, /no prices here/);
  assert.deepEqual(restored.pieces, p.pieces);
  assert.deepEqual(restored.supplies, p.supplies);
  assert.deepEqual(
    bom(restored),
    originalBom,
    "checked tool references do not become material purchases",
  );
});
