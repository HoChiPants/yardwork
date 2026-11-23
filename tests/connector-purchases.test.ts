import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, type Project } from "../src/model";
import {
  connectorReviews,
  makeConnectorPlan,
  saveConnectorPlan,
} from "../src/connectors";
import { connectorPurchaseSummary } from "../src/connectorPurchases";
import { addSupply, supplyRows } from "../src/supplies";
import { bom, connect } from "../src/engine";
import { toolChecklist } from "../src/tools";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";

const now = Date.parse("2026-11-18T12:00:00Z"),
  checkedAt = "2026-11-17T13:00:00Z";
function fixture(): Project {
  const p = blank("SYNTHETIC A21Z frame reference");
  p.pieces = [
    part(
      "Base frame member",
      "stud",
      [3.5, 1.5, 24],
      [0, 0.75, 0],
      p.steps[0].id,
      "Frame",
    ),
    part(
      "Post frame member",
      "stud",
      [1.5, 12, 3.5],
      [0, 7.5, 0],
      p.steps[0].id,
      "Frame",
    ),
  ];
  return p;
}
function addPlan(p: Project, scheduleId: "sd9112" | "n10dhdg" = "sd9112") {
  return saveConnectorPlan(
    p,
    makeConnectorPlan(p, p.pieces[0].id, p.pieces[1].id, { scheduleId }),
  );
}
function product(p: Project, id: string) {
  return connectorPurchaseSummary(p, now).products.find(
    (row) => row.productId === id,
  )!;
}
function requirements(p: Project, selected: string[] = []) {
  const withTools = {
    ...p,
    toolSelections: selected.map((productId) => ({ productId, checkedAt })),
  };
  return toolChecklist(
    withTools,
    selectedToolsForProject(withTools, now).tools,
    now,
  ).requirements;
}

test("one pending C intent budgets one angle and four complete reference fasteners without creating paid rows", () => {
  const before = fixture(),
    p = addPlan(before),
    raw = JSON.stringify(p),
    summary = connectorPurchaseSummary(p, now);
  assert.equal(connectorReviews(p, now)[0].activeConnectorCount, 1);
  assert.equal(summary.plannedConnectors, 1);
  assert.equal(summary.plannedFasteners, 4);
  assert.equal(summary.provisional, true);
  assert.equal(summary.incomplete, true);
  assert.equal(product(p, "simpson-a21z").requiredPacks, 1);
  assert.equal(product(p, "simpson-sd9112r100").requiredUnits, 4);
  assert.equal(product(p, "simpson-sd9112r100").requiredPacks, 1);
  assert.equal(product(p, "simpson-n10dhdg-r").requiredUnits, 0);
  assert.equal(p.supplies.length, 0);
  assert.deepEqual(p.pieces, before.pieces);
  assert.deepEqual(p.joints, before.joints);
  assert.deepEqual(bom(p), bom(before));
  assert.equal(JSON.stringify(p), raw);
  assert.match(
    summary.warnings.join(" "),
    /Manual supplies are the only paid rows/,
  );
});

test("counts aggregate by exact alternative across plans and pack rounding happens once", () => {
  let p = fixture();
  for (let i = 0; i < 26; i++) p = addPlan(p, "sd9112");
  for (let i = 0; i < 31; i++) p = addPlan(p, "n10dhdg");
  p = addSupply(p, "simpson-a21z", 2, "SYNTHETIC selected angles");
  p = addSupply(p, "simpson-sd9112r100", 1, "SYNTHETIC selected screw box");
  p = addSupply(p, "simpson-n10dhdg-r", 1, "SYNTHETIC selected nail box");
  const summary = connectorPurchaseSummary(p, now),
    sd = product(p, "simpson-sd9112r100"),
    nails = product(p, "simpson-n10dhdg-r");
  assert.equal(summary.plannedConnectors, 57);
  assert.equal(product(p, "simpson-a21z").requiredPacks, 57);
  assert.equal(product(p, "simpson-a21z").shortfallPacks, 55);
  assert.equal(sd.requiredUnits, 104);
  assert.equal(sd.requiredPacks, 2);
  assert.equal(sd.selectedUnits, 100);
  assert.equal(sd.shortfallPacks, 1);
  assert.equal(nails.requiredUnits, 124);
  assert.equal(nails.requiredPacks, 2);
  assert.equal(nails.selectedUnits, 120);
  assert.equal(nails.shortfallPacks, 1);
  assert.equal(supplyRows(p, now).length, 3);
  assert.ok(supplyRows(p, now).every((row) => row.total === null));
  const restored = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(connectorPurchaseSummary(restored, now), summary);
});

test("one invalid entered path excludes the whole angle/four-fastener schedule, retaining explicit exclusions", () => {
  const p = addPlan(fixture()),
    plan = p.connectorPlans[0];
  plan.entries[0].entranceLocal = [100, 0, 0];
  plan.entries[0].driveLocal = [0, 1, 0];
  const summary = connectorPurchaseSummary(p, now);
  assert.equal(connectorReviews(p, now)[0].state, "conflict");
  assert.equal(summary.plannedConnectors, 0);
  assert.equal(summary.plannedFasteners, 0);
  assert.equal(summary.excludedConnectors, 1);
  assert.equal(product(p, "simpson-a21z").excludedUnits, 1);
  assert.equal(product(p, "simpson-sd9112r100").excludedUnits, 4);
  assert.equal(product(p, "simpson-sd9112r100").requiredPacks, 0);
  assert.match(
    summary.warnings.join(" "),
    /one angle and four reference fasteners are excluded as a whole/,
  );
});

test("missing members and stale source evidence exclude demand while retaining manual packs and raw intent", () => {
  for (const variant of ["missing", "source"] as const) {
    let p = addPlan(fixture());
    p = addSupply(p, "simpson-sd9112r100", 1, "SYNTHETIC manual box");
    if (variant === "missing") p.pieces = p.pieces.slice(1);
    else p.connectorPlans[0].evidenceRevision = "obsolete-revision";
    const raw = JSON.stringify(p),
      summary = connectorPurchaseSummary(p, now);
    assert.equal(summary.plannedConnectors, 0);
    assert.equal(product(p, "simpson-sd9112r100").selectedPacks, 1);
    assert.equal(product(p, "simpson-sd9112r100").requiredPacks, 0);
    assert.equal(JSON.stringify(p), raw);
    assert.equal(
      requirements(p).some((row) => row.capability === "drive-quarter-hex"),
      false,
    );
  }
});

test("legacy exact-material quantities and pairwise joints warn without offsetting or buying", () => {
  let p = addPlan(fixture());
  p = connect(
    p,
    p.pieces[0].id,
    p.pieces[1].id,
    p.steps[0].id,
    4,
    1.5,
    "screw",
    "sd9112r100",
  );
  p = addSupply(p, "simpson-sd9112r100", 1, "SYNTHETIC separate box");
  const prior = JSON.stringify(p),
    summary = connectorPurchaseSummary(p, now),
    row = product(p, "simpson-sd9112r100");
  assert.equal(row.hasSeparateMaterialRepresentation, true);
  assert.equal(row.requiredUnits, 4);
  assert.equal(row.selectedPacks, 1);
  assert.equal(row.spareUnits, 96);
  assert.equal(p.joints[0].quantity, 4);
  assert.match(summary.warnings.join(" "), /No legacy offset/);
  assert.match(summary.warnings.join(" "), /legacy pairwise quantities/);
  assert.equal(JSON.stringify(p), prior);
});

test("SD tools distinguish current quarter-hex accessory, driver function and conditional pilot setup", () => {
  let p = addPlan(fixture());
  p = addSupply(
    p,
    "simpson-sd9112r100",
    1,
    "SYNTHETIC included driver is not a tool review",
  );
  const raw = JSON.stringify(p),
    rows = requirements(p, ["grk-187443-t25-bits"]),
    accessory = rows.find((row) => row.capability === "drive-quarter-hex")!;
  assert.equal(accessory.status, "unknown");
  assert.equal(accessory.necessity, "conditional");
  assert.ok(
    accessory.sources.some((source) => source.kind === "connector-plan"),
  );
  assert.match(accessory.review, /Check whether your screw box includes a matching accessory/);
  assert.equal(
    rows.find((row) => row.capability === "drive-screw")!.status,
    "unknown",
  );
  assert.equal(
    rows.some((row) => row.capability === "drive-t25"),
    false,
  );
  assert.equal(
    rows.some((row) => row.capability === "drive-nail"),
    false,
  );
  assert.equal(
    rows.some((row) => row.capability === "pilot-bit-1-16"),
    false,
  );
  const motor = requirements(p, ["dewalt-dcd771c2"]);
  assert.equal(
    motor.find((row) => row.capability === "drive-screw")!.status,
    "supported",
  );
  assert.equal(
    motor.find((row) => row.capability === "drive-quarter-hex")!.status,
    "unknown",
  );
  const guide = toolGuideMarkdown(p, now);
  assert.match(guide, /C001/);
  assert.match(guide, /¼ in hex connector-screw driver accessory/);
  assert.match(guide, /not manufactured hole positions/);
  assert.equal(
    guide.includes(`connector-plan ${p.connectorPlans[0].id}`),
    false,
  );
  assert.equal(JSON.stringify(p), raw);
});

test("the nail alternative can document hammer function without qualifying connector installation or inventing a drill", () => {
  const p = addPlan(fixture(), "n10dhdg"),
    rows = requirements(p, ["estwing-e3-16s"]),
    nail = rows.find((row) => row.capability === "drive-nail")!;
  assert.equal(nail.status, "supported");
  assert.match(nail.condition!, /not establish Simpson connector fit/);
  assert.equal(
    rows.find((row) => row.capability === "connector-install")!.status,
    "unknown",
  );
  assert.equal(
    rows.some((row) => row.capability === "drive-quarter-hex"),
    false,
  );
  assert.equal(
    rows.some((row) => row.capability === "drive-screw"),
    false,
  );
  assert.equal(
    rows.some((row) => row.capability === "drill-pilot"),
    false,
  );
  assert.equal(p.supplies.length, 0);
});

test("only a current entered pilot diameter produces the narrow bit review, separately from drill function", () => {
  const p = addPlan(fixture()),
    entry = p.connectorPlans[0].entries[0];
  entry.entranceLocal = [0, 0, 12];
  entry.driveLocal = [0, 0, -1];
  entry.measurements = {
    woodEntryToTipDepth: 0.5,
    pilotDiameter: 0.0625,
    pilotDepth: 0.4,
    basis: "SYNTHETIC actual wood-entry measurement, not an A21Z pilot rule",
    measuredAt: checkedAt,
  };
  assert.equal(connectorReviews(p, now)[0].activeConnectorCount, 1);
  const rows = requirements(p, ["milwaukee-48-89-4601"]);
  assert.equal(
    rows.find((row) => row.capability === "pilot-bit-1-16")?.status,
    "supported",
  );
  assert.equal(
    rows.find((row) => row.capability === "drill-pilot")?.status,
    "unknown",
  );
  for (const value of [null, 0.125]) {
    const other = structuredClone(p);
    other.connectorPlans[0].entries[0].measurements.pilotDiameter = value;
    assert.equal(
      requirements(other).some((row) => row.capability === "pilot-bit-1-16"),
      false,
    );
  }
  const stale = structuredClone(p);
  stale.pieces[0].position[0] += 0.25;
  assert.equal(
    requirements(stale).some((row) => row.capability === "pilot-bit-1-16"),
    false,
  );
  const future = structuredClone(p);
  future.connectorPlans[0].entries[0].measurements.measuredAt =
    "2099-01-01T00:00:00Z";
  assert.equal(
    requirements(future).some((row) => row.capability === "pilot-bit-1-16"),
    false,
  );
});
