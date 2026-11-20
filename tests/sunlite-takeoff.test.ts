import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { endCutPlane } from "../src/cutProfiles";
import { bom, guideMarkdown, shoppingCsv, validate } from "../src/engine";
import {
  blank,
  part,
  projectSchema,
  type Project,
  type V3,
} from "../src/model";
import {
  addEstimatedSunlitePurchases,
  sunliteTakeoff,
} from "../src/sunliteTakeoff";
import {
  addMeasuredSunlitePurchases,
  removeSunliteCut,
  reviewSunliteProfiles,
  saveSunliteCut,
  saveSunliteSetup,
  sunliteProfileLines,
  sunliteProfileMarkdown,
} from "../src/sunliteProfiles";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { toolChecklist } from "../src/tools";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { homeDepotShoppingList } from "../src/handoff";
import {
  addSunliteTapeKits,
  fillSunliteTapeAllowances,
  removeSunliteTapeCut,
  reviewSunliteTape,
  saveSunliteTapeCut,
} from "../src/sunliteTapePlan";
import { sunliteTapeProductId } from "../src/sunliteTapeSchema";
import { recordSupplyInventory, supplyRows } from "../src/supplies";
import {
  saveSunliteTemperatures,
  saveSunliteTravel,
  sunliteThermalReview,
} from "../src/sunliteThermal";

test("temperature movement uses retained panel dimensions and rechecks travel after a move", () => {
  const project = blank("SUNLITE thermal study");
  const panel = part("Gable glazing", "sunlite-8mm", [48, 96, 8 / 25.4], [0, 48, 0], project.steps[0].id, "Gable");
  panel.stockLengthAxis = 1;
  panel.cutPlanes = [{ normal: [0, 1, 0], constant: 24 }];
  project.pieces = [panel];
  assert.equal(sunliteThermalReview(project), null);
  assert.throws(() => saveSunliteTemperatures(project, { cold: 0, installation: 80, hot: 50 }), /between the low and high/);
  const pending = saveSunliteTemperatures(project, { cold: -10, installation: 70, hot: 170 });
  const [estimated] = sunliteThermalReview(pending)!.rows;
  assert.ok(Math.abs(estimated.along.growth - 0.26) < 1e-10);
  assert.ok(Math.abs(estimated.along.shrinkage - 0.208) < 1e-10);
  assert.ok(Math.abs(estimated.across.growth - (0.26 * 48) / 72) < 1e-10);
  assert.equal(estimated.along.shortage, null);

  const compared = saveSunliteTravel(pending, panel.id, { along: 0.2, across: 0.18 });
  const legacy = projectSchema.parse(JSON.parse(JSON.stringify({ ...compared, schemaVersion: 36 })));
  assert.equal(sunliteThermalReview(legacy)!.rows[0].along.retention, null);
  assert.equal(legacy.sunliteThermal?.panels[0].travel.along, 0.2);
  const measuredCold = saveSunliteTravel(legacy, panel.id, {
    along: 0.2,
    across: 0.18,
    retention: {
      along: { overlap: 0.12, minimum: 0.0625 },
      across: { overlap: 0.5, minimum: 0.15 },
    },
  });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(measuredCold)));
  const [measured] = sunliteThermalReview(reopened)!.rows;
  assert.ok(Math.abs(measured.along.shortage! - 0.06) < 1e-10);
  assert.equal(measured.across.shortage, 0);
  assert.ok(Math.abs(measured.along.retention!.remaining + 0.088) < 1e-10);
  assert.ok(Math.abs(measured.along.retention!.shortage - 0.1505) < 1e-10);
  assert.equal(measured.across.retention?.shortage, 0);
  assert.match(guideMarkdown(reopened), /SUNLITE temperature movement[\s\S]+short 0\.06 in/);
  assert.match(guideMarkdown(reopened), /projected to lose capture by 0\.088 in/);
  assert.ok(validate(reopened).some((finding) => finding.id === `sunlite-thermal-${panel.id}`));
  assert.ok(validate(reopened).some((finding) => finding.id === `sunlite-cold-${panel.id}`));
  const moved = structuredClone(reopened);
  moved.pieces[0].position[2] = 1;
  const [stale] = sunliteThermalReview(moved)!.rows;
  assert.equal(stale.stale, true);
  assert.equal(stale.along.shortage, null);
  assert.equal(stale.along.retention, null);
  assert.ok(!validate(moved).some((finding) => finding.id === `sunlite-cold-${panel.id}`));
  assert.match(guideMarkdown(moved), /Remeasure travel and overlap after the panel or installation temperature changed/);
  const differentInstallation = saveSunliteTemperatures(reopened, { cold: -10, installation: 75, hot: 170 });
  assert.equal(sunliteThermalReview(differentInstallation)!.rows[0].stale, true);
});

function greenhouse() {
  return createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    blank(),
    {
      greenhouseGlazing: {
        materialId: "sunlite-8mm",
        productRegistryRef: "sunlite-132506",
      },
    },
  ).project;
}

function panel(project: Project, position: V3, size: V3 = [24, 36, 8 / 25.4]) {
  const piece = part(
    "Glazing",
    "sunlite-8mm",
    size,
    position,
    project.steps[0].id,
    "Glazing",
  );
  piece.stockLengthAxis = 1;
  return piece;
}

const tapeEvidence = {
  basis: "Synthetic edge and trim measurements for testing the cut planner",
  measuredAt: "2026-11-19T05:00:00.000Z",
};

test("SUNLITE tape cut allowances allocate each tape separately and buy whole paired kits once", () => {
  const initial = blank("Glazing tape cut order");
  initial.pieces = Array.from({ length: 8 }, (_, index) =>
    panel(initial, [index * 48, 18, 0], [47.75, 36, 8 / 25.4]),
  );
  const guided = generateBuildGuide(initial);
  assert.equal(sunliteTakeoff(guided)!.quantities.find(({ id }) => id === sunliteTapeProductId)?.packs, 1);
  const first = reviewSunliteTape(guided)!.rows[0].run;
  const open = saveSunliteTapeCut(guided, first.id, { ...tapeEvidence, length: 49.5 });
  assert.equal(guideIsCurrent(open), false);
  assert.equal(reviewSunliteTape(open)!.readyCount, 1);
  assert.ok(!addEstimatedSunlitePurchases(open).supplies.some(({ productId }) => productId === sunliteTapeProductId));
  const need = (project: Project) => homeDepotPurchaseNeeds(project).find(({ id }) => id === sunliteTapeProductId)!;
  assert.equal(need(open).missing, null);
  assert.equal(need(open).canAdd, false);
  assert.throws(() => addHomeDepotPurchaseNeed(open, sunliteTapeProductId), /unmeasured or changed edges/);
  assert.throws(() => addSunliteTapeKits(open), /unmeasured or changed edges/);

  const ready = fillSunliteTapeAllowances(open, { ...tapeEvidence, upper: 1, lower: 0.125 });
  const order = reviewSunliteTape(ready)!;
  assert.equal(order.readyCount, 16);
  assert.equal(order.required, 2);
  assert.equal(order.rows.find(({ run }) => run.id === first.id)?.measurement?.length, 49.5);
  assert.deepEqual(order.groups.map(({ rolls }) => rolls.map(({ left }) => left)), [[42, 335.25], [1]]);
  assert.equal(need(ready).missing, 2);
  assert.equal(need(ready).canAdd, true);
  const purchased = addHomeDepotPurchaseNeed(ready, sunliteTapeProductId);
  assert.equal(addSunliteTapeKits(purchased), purchased);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(purchased)));
  assert.deepEqual(reopened.pieces, ready.pieces);
  assert.deepEqual(reopened.sunliteTapeCuts, ready.sunliteTapeCuts);
  assert.deepEqual(reopened.supplies.map(({ productId, quantity }) => [productId, quantity]), [[sunliteTapeProductId, 2]]);
  assert.match(shoppingCsv(reopened), /205713443/);
  assert.match(guideMarkdown(reopened), /## Glazing tape cut plan[\s\S]*2 paired tape kits needed · 2 selected[\s\S]*### Upper nonvented tape[\s\S]*49\.5 in · entered length[\s\S]*### Lower vented tape[\s\S]*47\.875 in · layout plus trim/);
  const observed = recordSupplyInventory({ ...reopened, store: "tape-qa" }, {
    checkedAt: new Date().toISOString(),
    retailer: "home-depot",
    retailerProductId: "205713443",
    productId: sunliteTapeProductId,
    store: "tape-qa",
    zip: "84121",
    url: "https://www.homedepot.com/p/205713443",
    price: 20,
    available: 1,
  });
  const item = homeDepotShoppingList(observed).items.find(({ productId }) => productId === "205713443");
  assert.deepEqual([item?.quantity, item?.snapshot?.available], [2, 1]);
});

test("stale, short, missing and oversized tape strips stay out of the current kit order", () => {
  const draft = blank("Tape recovery");
  draft.pieces = [panel(draft, [0, 18, 0]), panel(draft, [35, 18, 0])];
  const first = reviewSunliteTape(draft)!.rows[0].run;
  const short = saveSunliteTapeCut(draft, first.id, { ...tapeEvidence, length: 23.5 });
  assert.equal(reviewSunliteTape(short)!.rows[0].state, "short");
  const long = saveSunliteTapeCut(short, first.id, { ...tapeEvidence, length: 384.125 });
  assert.equal(reviewSunliteTape(long)!.rows[0].state, "oversize");
  assert.equal(reviewSunliteTape(long)!.groups[0].rolls.length, 0);
  const reset = removeSunliteTapeCut(long, first.id);
  assert.equal(reset.sunliteTapeCuts, undefined);
  const ready = fillSunliteTapeAllowances(reset, { ...tapeEvidence, upper: 1, lower: 0 });
  const changed = structuredClone(ready);
  changed.pieces[0].rotation[2] = Math.PI;
  const stale = reviewSunliteTape(changed)!;
  assert.equal(stale.rows.filter(({ state }) => state === "stale").length, 2);
  assert.equal(stale.required, null);
  assert.equal(fillSunliteTapeAllowances(changed, { ...tapeEvidence, upper: 1, lower: 0 }), changed);
  changed.pieces.shift();
  assert.equal(reviewSunliteTape(changed)!.removed.length, 2);
  assert.equal(reviewSunliteTape(changed)!.required, null);
  const restored = stale.rows.filter(({ state }) => state === "stale")
    .reduce((project, { run }) => removeSunliteTapeCut(project, run.id), changed);
  assert.equal(reviewSunliteTape(restored)!.required, 1);
  assert.match(guideMarkdown(changed), /Edge no longer in the layout/);
  assert.equal(homeDepotPurchaseNeeds(changed).find(({ id }) => id === sunliteTapeProductId)?.canAdd, false);
});

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);

test("actual glazed greenhouse estimates 31 panels, 20 full seams and both tape rolls separately", () => {
  const project = greenhouse();
  const estimate = sunliteTakeoff(project)!;
  assert.equal(project.pieces.length, 101);
  assert.equal(estimate.panels.length, 31);
  assert.equal(estimate.fullSeams, 20);
  assert.equal(estimate.unresolvedSeams.length, 2);
  assert.ok(
    estimate.unresolvedSeams.every((run) => /Partial overlap/.test(run.issue!)),
  );
  assert.deepEqual(
    estimate.quantities.map((r) => r.packs),
    [13, 16, 2],
  );
  assert.ok(
    estimate.upperInches > estimate.lowerInches,
    "Sloping gables need actual edge length.",
  );
  assert.equal(estimate.upperTape.bins.length, 2);
  assert.equal(estimate.lowerTape.bins.length, 2);
  for (const bin of [...estimate.snapCap.bins, ...estimate.uChannel.bins]) {
    near(bin.runs.reduce((sum, run) => sum + run.length, 0) + bin.left, 96);
  }
  assert.equal(project.supplies.length, 0);
  assert.match(
    guideMarkdown(project),
    /## SUNLITE panel accessory estimate[\s\S]+20 full shared flute-side seams[\s\S]+Nominal profile cuts/,
  );
});

test("center-plane length uses the clipped sloped edge, and rotating the sheet flips upper and lower", () => {
  const project = blank();
  const piece = panel(project, [0, 24, 0]);
  piece.cutPlanes = [endCutPlane(piece.size, 1, true, 30, 0)];
  project.pieces = [piece];
  const estimate = sunliteTakeoff(project)!;
  near(estimate.upperInches, 24 / Math.cos(Math.PI / 6));
  near(estimate.lowerInches, 24);
  const rotated = sunliteTakeoff({
    ...project,
    pieces: [{ ...piece, rotation: [0, 0, Math.PI] as V3 }],
  })!;
  near(rotated.lowerInches, estimate.upperInches);
  near(rotated.upperInches, estimate.lowerInches);
  assert.equal(
    sunliteTakeoff({ ...project, pieces: [{ ...piece, offcut: true }] }),
    null,
  );
  const flat = sunliteTakeoff({
    ...project,
    pieces: [{ ...piece, rotation: [Math.PI / 2, 0, 0] as V3 }],
  })!;
  assert.equal(flat.upperInches, 0);
  assert.match(flat.panels[0].issue!, /flutes are level/);
});

test("count seams only at the modeled shared edge and flag stagger, competing neighbors and oversized runs", () => {
  const project = blank();
  const a = panel(project, [0, 54, 0], [24, 108, 8 / 25.4]);
  const b = panel(project, [24, 54, 0], [24, 108, 8 / 25.4]);
  project.pieces = [a, b];
  const exact = sunliteTakeoff(project)!;
  assert.equal(exact.fullSeams, 1);
  assert.equal(exact.snapCap.bins.length, 0);
  near(exact.snapCap.oversized[0].length, 108);
  b.position[1] += 12;
  const staggered = sunliteTakeoff(project)!;
  assert.equal(staggered.fullSeams, 0);
  near(staggered.unresolvedSeams[0].length, 96);
  b.position[1] -= 12;
  project.pieces.push(panel(project, [24, 54, 0], [24, 108, 8 / 25.4]));
  const ambiguous = sunliteTakeoff(project)!;
  assert.equal(ambiguous.fullSeams, 0);
  assert.equal(ambiguous.unresolvedSeams.length, 2);
  assert.ok(
    ambiguous.unresolvedSeams.every((run) =>
      /More than one panel/.test(run.issue!),
    ),
  );
});

test("accepting quantities fills only actual deficits and feeds snapshots and shopping export without placement", () => {
  const project = greenhouse();
  project.supplies.push({
    id: "a68844dd-aab0-4f5e-8414-30e1564fcbe1",
    productId: "sunlite-96714",
    quantity: 3,
    purpose: "On the list",
    note: "Keep this row",
  });
  const before = JSON.stringify(project);
  const selected = addEstimatedSunlitePurchases(project);
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(selected.pieces, project.pieces);
  assert.deepEqual(selected.joints, project.joints);
  assert.deepEqual(bom(selected), bom(project));
  assert.deepEqual(selected.supplies[0], project.supplies[0]);
  assert.equal(
    selected.supplies.find(
      (row) =>
        row.productId === "sunlite-96714" && row.id !== project.supplies[0].id,
    )?.quantity,
    10,
  );
  assert.equal(addEstimatedSunlitePurchases(selected), selected);
  const lowes = { ...project, retailer: "lowes" as const };
  assert.equal(addEstimatedSunlitePurchases(lowes), lowes);
  const checkedAt = "2026-11-19T05:00:00.000Z";
  const observed = recordSupplyInventory(
    { ...selected, store: "QA only" },
    {
      productId: "sunlite-92763",
      retailer: "home-depot",
      retailerProductId: "205713443",
      price: 10,
      available: 2,
      store: "QA only",
      zip: "84121",
      checkedAt,
      url: "https://www.homedepot.com/p/205713443",
    },
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(observed)));
  assert.equal(
    supplyRows(reopened, Date.parse(checkedAt)).find(
      (row) => row.productId === "sunlite-92763",
    )?.total,
    20,
  );
  assert.match(shoppingCsv(reopened), /top\/bottom tape kit/);
});

const measuredAt = "2026-11-19T15:00:00.000Z";
const setup = (usableLength: number, kerf = 0.125) => ({
  usableLength,
  kerf,
  measuredAt,
  basis: "Synthetic setup after end prep",
});
const length = (value: number) => ({
  length: value,
  measuredAt,
  basis: "Synthetic dry-fit with allowances",
});

test("measured snap-cap and U-channel runs allocate independently with saw kerf, remainders and exact purchase units", () => {
  let project = greenhouse();
  const estimate = sunliteTakeoff(project)!;
  assert.equal(estimate.profileRuns.length, 84);
  assert.ok(estimate.profileRuns.every((row) => row.points.length === 2));
  const u = estimate.profileRuns.filter(
    (row) => row.productId === "sunlite-96715",
  );
  const [h] = estimate.profileRuns.filter(
    (row) => row.productId === "sunlite-96714",
  );
  project = saveSunliteCut(project, h.id, length(36));
  assert.equal(
    reviewSunliteProfiles(project)!.groups[0].rows[0].state,
    "setup-needed",
  );
  project = saveSunliteSetup(project, "sunlite-96714", setup(96));
  project = saveSunliteSetup(project, "sunlite-96715", setup(96));
  // Four exact two-foot pieces need two lengths of stock when each piece costs kerf.
  for (const run of u.slice(0, 4))
    project = saveSunliteCut(project, run.id, length(24));
  const before = JSON.stringify(project);
  const [snap, channel] = reviewSunliteProfiles(project)!.groups;
  assert.deepEqual(
    [snap.ready, snap.sticks.length, channel.ready, channel.sticks.length],
    [1, 1, 4, 2],
  );
  assert.deepEqual(
    channel.sticks.map((stock) => stock.cuts.length),
    [3, 1],
  );
  near(channel.sticks[0].remaining, 23.625);
  near(channel.sticks[1].remaining, 71.875);
  for (const group of [snap, channel])
    for (const stock of group.sticks) {
      const used = stock.cuts.reduce(
        (n, cut) => n + cut.kerf + cut.measurement.length,
        0,
      );
      near(stock.remaining + used, group.setup!.usableLength);
    }
  const shopping = addMeasuredSunlitePurchases(project);
  assert.equal(JSON.stringify(project), before);
  assert.equal(shopping.pieces, project.pieces);
  assert.deepEqual(
    shopping.supplies.map(({ productId, quantity }) => [productId, quantity]),
    [
      ["sunlite-96714", 1],
      ["sunlite-96715", 2],
    ],
  );
  assert.equal(addMeasuredSunlitePurchases(shopping), shopping);
  const otherStore = { ...project, retailer: "lowes" as const };
  assert.equal(addMeasuredSunlitePurchases(otherStore), otherStore);
  assert.match(shoppingCsv(shopping), /202091948/);
  assert.match(shoppingCsv(shopping), /202091949/);
  assert.match(
    guideMarkdown(shopping),
    /Measured greenhouse profile cuts[\s\S]*0\.125 in saw loss[\s\S]*2 ft finished/,
  );
  const tools = toolChecklist(shopping);
  assert.match(JSON.stringify(tools), /Cut the measured 96715 U-channel/);

  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(shopping)));
  assert.deepEqual(reopened.sunliteProfilePlan, shopping.sunliteProfilePlan);
  assert.deepEqual(
    sunliteProfileLines(reviewSunliteProfiles(reopened)!),
    sunliteProfileLines(reviewSunliteProfiles(shopping)!),
  );
  const withNominalPurchases = addEstimatedSunlitePurchases(greenhouse());
  assert.equal(
    addMeasuredSunlitePurchases({
      ...project,
      supplies: withNominalPurchases.supplies,
    }).supplies.length,
    withNominalPurchases.supplies.length,
  );
});

test("untouched exact length and exact remnant avoid a redundant cut while oversize runs are excluded", () => {
  let project = blank();
  project.pieces = [panel(project, [0, 18, 0]), panel(project, [24, 18, 0])];
  const [a, b, c, d] = sunliteTakeoff(project)!.profileRuns.filter(
    (run) => run.productId === "sunlite-96715",
  );
  project = saveSunliteSetup(project, "sunlite-96715", setup(96));
  project = saveSunliteCut(project, a.id, length(96));
  project = saveSunliteCut(project, b.id, length(95.95));
  project = saveSunliteCut(project, c.id, length(60));
  project = saveSunliteCut(project, d.id, length(35.875));
  const [, channel] = reviewSunliteProfiles(project)!.groups;
  assert.equal(
    channel.rows.find((row) => row.run.id === b.id)?.state,
    "oversize",
  );
  assert.equal(channel.ready, 3);
  assert.deepEqual(
    channel.sticks.map((stock) => stock.cuts.map((cut) => cut.kerf)),
    [[0], [0.125, 0]],
  );
  assert.deepEqual(
    channel.sticks.map((stock) => stock.remaining),
    [0, 0],
  );
  assert.ok(
    validate(project).some(
      (finding) => finding.id === "profile-cut-review-sunlite-96715",
    ),
  );
  assert.doesNotMatch(sunliteProfileMarkdown(project), /95\.95 in finished/);
});

test("unchanged runs survive reorder while edits stale a field measurement, and removed reference data remains recoverable", () => {
  const project = blank();
  const a = panel(project, [0, 18, 0]),
    b = panel(project, [24, 18, 0]);
  project.pieces = [a, b];
  const seam = sunliteTakeoff(project)!.profileRuns[0];
  const old = projectSchema.parse({ ...project, schemaVersion: 16 });
  assert.equal(old.schemaVersion, blank().schemaVersion);
  assert.deepEqual(old.pieces, project.pieces);
  assert.equal(old.sunliteProfilePlan, undefined);
  const guided = generateBuildGuide(project);
  let saved = saveSunliteSetup(guided, "sunlite-96714", setup(96));
  saved = saveSunliteCut(saved, seam.id, length(35.25));
  assert.equal(guideIsCurrent(saved), false);
  const reordered = { ...saved, pieces: [b, a] };
  assert.equal(
    reviewSunliteProfiles(reordered)!.groups[0].rows[0].state,
    "ready",
  );
  const bothMoved = {
    ...saved,
    pieces: saved.pieces.map((piece) => ({
      ...piece,
      position: [
        piece.position[0],
        piece.position[1] + 1,
        piece.position[2],
      ] as V3,
    })),
  };
  assert.equal(
    reviewSunliteProfiles(bothMoved)!.groups[0].rows[0].state,
    "stale",
  );
  assert.doesNotMatch(sunliteProfileMarkdown(bothMoved), /35\.25 in finished/);
  const oneMoved = {
    ...saved,
    pieces: [a, { ...b, position: [24, 20, 0] as V3 }],
  };
  const removed = reviewSunliteProfiles(oneMoved)!.groups[0];
  assert.equal(removed.rows.length, 0);
  assert.equal(removed.sticks.length, 0);
  assert.equal(removed.removed[0].runId, seam.id);
  assert.throws(
    () => saveSunliteCut(oneMoved, seam.id, length(36)),
    /no longer available/,
  );
  assert.equal(
    removeSunliteCut(oneMoved, seam.id).sunliteProfilePlan?.cuts.length,
    0,
  );
  assert.match(sunliteProfileMarkdown(oneMoved), /Saved run no longer matches/);
});
