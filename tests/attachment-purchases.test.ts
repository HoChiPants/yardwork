import assert from "node:assert/strict";
import test from "node:test";
import { blank, projectSchema, type Project } from "../src/model";
import { bom } from "../src/engine";
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
import {
  addMissingAttachmentPinPacks,
  attachmentPinProductId,
  attachmentPurchaseSummaries,
  attachmentPurchaseSummary,
} from "../src/attachmentPurchases";
import {
  attachmentGuideMarkdown,
  attachmentGuideText,
} from "../src/attachmentGuide";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { selectedToolsForProject } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { everbiltAngleShelfPins, everbiltShelfPin } from "../src/shelfPinReference";
import { attachmentScheduleCsv } from "../src/attachmentCsv";
import { homeDepotShoppingList } from "../src/handoff";
import { previewStudyShelfSupports } from "../src/studyShelfSupports";
import { migrateLegacyProject, PROJECT_FORMAT_VERSION } from "../src/projectVersion";

const checkedAt = "2026-11-16T22:50:00Z",
  now = Date.parse("2026-11-17T00:00:00Z");
function initial(shelfCount = 3): Project {
  return {
    ...createBuildStudy("shelves", {
      ...defaultBuildStudyParameters("shelves"),
      shelfCount,
    }).project,
    retailer: "lowes",
    store: "synthetic-test-store",
  };
}
function withPlan(
  project: Project,
  roles?: string[],
  measurements?: ShelfPinMeasurements,
): Project {
  const entry = shelfSupportEntries(project)[0];
  return saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, entry.entryId, {
      name: "Chosen 5 mm supports",
      shelfRoles: roles ?? entry.shelves.map((shelf) => shelf.role),
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
    bearingOffset: 0.05,
    fullDiameterBoreDepth: 0.25,
    deepestDrillTipDepth: 0.3,
    basis: "User caliper and same-stock test-bore measurements",
    measuredAt: checkedAt,
  };
}

test("empty and unplanned casework create no pin demand, purchase or pin-tool operation", () => {
  for (const project of [blank(), initial()]) {
    const saved = JSON.stringify(project),
      summary = attachmentPurchaseSummary(project);
    assert.equal(summary.plannedPins, 0);
    assert.equal(summary.requiredPacks, 0);
    assert.equal(summary.canAddMissing, false);
    assert.equal(addMissingAttachmentPinPacks(project), project);
    assert.equal(attachmentGuideMarkdown(project), "");
    assert.ok(
      !toolChecklist(project).requirements.some((row) =>
        row.capability.startsWith("shelf-pin-"),
      ),
    );
    assert.equal(JSON.stringify(project), saved);
  }
});

test("explicit pending support points round once across shelves without buying or crediting jig contents", () => {
  const project = withPlan(initial(6)),
    before = JSON.stringify(project),
    shopping = bom(project);
  project.toolSelections = [{ productId: "kreg-kma3232", checkedAt }];
  const summary = attachmentPurchaseSummary(project);
  assert.equal(attachmentReviews(project)[0].state, "needs-measurements");
  assert.equal(summary.plannedPins, 24);
  assert.equal(summary.requiredPacks, 2);
  assert.equal(summary.selectedPacks, 0);
  assert.equal(summary.shortfallPacks, 2);
  assert.equal(summary.selectedPins, 0);
  assert.equal(summary.fitPending, true);
  assert.equal(summary.provisional, true);
  assert.equal(summary.planRows[0].shelves.length, 6);
  assert.ok(summary.planRows[0].shelves.every((shelf) => shelf.pinCount === 4));
  assert.deepEqual(project.supplies, []);
  assert.deepEqual(bom(project), shopping);
  assert.deepEqual(project.pieces, JSON.parse(before).pieces);
  assert.match(summary.warnings.join(" "), /provisional.*not installed/i);
  assert.equal(
    attachmentPurchaseSummary(
      projectSchema.parse(JSON.parse(JSON.stringify(project))),
    ).plannedPins,
    24,
  );
});

test("existing same-product manual packs cover demand once and surplus is not on-hand inventory", () => {
  let project = withPlan(initial(6));
  project = addSupply(
    project,
    attachmentPinProductId,
    1,
    "First purchase intent",
  );
  project = addSupply(
    project,
    attachmentPinProductId,
    2,
    "Other explicit pin packs",
  );
  const summary = attachmentPurchaseSummary(project);
  assert.equal(summary.requiredPacks, 2);
  assert.equal(summary.selectedPacks, 3);
  assert.equal(summary.selectedPins, 60);
  assert.equal(summary.shortfallPacks, 0);
  assert.equal(summary.sparePins, 36);
  assert.equal(addMissingAttachmentPinPacks(project), project);
  assert.match(attachmentGuideText(project), /not verified on-hand stock/i);
});

test("explicit missing-pack action adds only shortfall and existing supply snapshot prices it once", () => {
  const original = addSupply(withPlan(initial(6)), attachmentPinProductId, 1),
    shopping = bom(original);
  const project = addMissingAttachmentPinPacks(original);
  assert.equal(original.supplies.length, 1);
  assert.equal(project.supplies.length, 2);
  assert.equal(project.supplies[1].quantity, 1);
  assert.equal(attachmentPurchaseSummary(project).selectedPacks, 2);
  assert.equal(attachmentPurchaseSummary(project).sparePins, 16);
  assert.equal(addMissingAttachmentPinPacks(project), project);
  assert.deepEqual(bom(project), shopping);
  const priced = recordSupplyInventory(project, {
    productId: attachmentPinProductId,
    retailer: "lowes",
    retailerProductId: "5006037921",
    price: 7.5,
    available: 5,
    store: project.store,
    zip: project.zip,
    checkedAt,
    url: "https://www.lowes.com/pd/Kreg/5006037921",
  });
  const rows = supplyRows(priced, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].total, 15);
  assert.deepEqual(priced.toolSelections, []);
});

test("unsupported retailer keeps the exact reference visible and blocks substitute purchasing", () => {
  const project = { ...withPlan(initial()), retailer: "home-depot" as const },
    summary = attachmentPurchaseSummary(project);
  assert.equal(summary.plannedPins, 12);
  assert.equal(summary.retailerSupported, false);
  assert.equal(summary.canAddMissing, false);
  assert.deepEqual(
    summary.referenceOffers.map((offer) => offer.retailer),
    ["lowes"],
  );
  assert.throws(
    () => addMissingAttachmentPinPacks(project),
    /no reviewed offer at Home Depot/i,
  );
  assert.match(attachmentGuideText(project), /lowes\.com\/pd\//i);
  assert.match(summary.warnings.join(" "), /no retailer substitution/i);
  const handoff = homeDepotPurchaseNeeds(project).find(({ id }) => id === attachmentPinProductId);
  assert.equal(handoff?.missing, 1);
  assert.equal(handoff?.canAdd, false);
  assert.throws(() => addHomeDepotPurchaseNeed(project, attachmentPinProductId), /exact direct Home Depot listing/);
  assert.equal(project.supplies.length, 0);
});

test("Home Depot shelf supports keep exact pack demand, snapshot pricing and guide references separate from older hardware", () => {
  const older = withPlan({ ...initial(), retailer: "home-depot" }, ["shelf-1"], measured());
  const project = projectSchema.parse(migrateLegacyProject({ ...older, schemaVersion: 32 }));
  assert.equal(project.schemaVersion, PROJECT_FORMAT_VERSION);
  assert.deepEqual(project.attachmentPlans, older.attachmentPlans);
  const { productId, internetNumber, url } = everbiltShelfPin;
  const planned = saveShelfPinPlan(
    project,
    makeShelfPinPlan(project, shelfSupportEntries(project)[0].entryId, {
      productId,
      shelfRoles: ["shelf-2", "shelf-3"],
      layout: project.attachmentPlans[0].layout,
    }),
  );
  const [kreg, everbilt] = attachmentPurchaseSummaries(planned);
  assert.deepEqual([kreg.plannedPins, kreg.pinsPerPack, kreg.canAddMissing], [4, 20, false]);
  assert.deepEqual([everbilt.plannedPins, everbilt.pinsPerPack, everbilt.canAddMissing], [8, 48, true]);
  assert.deepEqual(planned.supplies, []);
  assert.equal(homeDepotPurchaseNeeds(planned).find(({ id }) => id === productId)?.missing, 1);
  const purchased = addHomeDepotPurchaseNeed(planned, productId);
  assert.equal(addMissingAttachmentPinPacks(purchased, productId), purchased);
  const priced = recordSupplyInventory(purchased, {
    productId,
    retailer: "home-depot",
    retailerProductId: internetNumber,
    price: 9,
    available: 5,
    store: project.store,
    zip: project.zip,
    checkedAt,
    url,
  });
  const [row] = supplyRows(priced, now);
  assert.equal(row.productId, productId);
  assert.equal(row.quantity, 1);
  assert.equal(row.total, 9);
  assert.equal(row.inventory?.retailerProductId, internetNumber);
  assert.equal(attachmentPurchaseSummary(priced, productId).sparePins, 40);
  const guide = attachmentGuideMarkdown(priced);
  assert.ok(guide.includes(url));
  assert.match(guide, /8; required 48-pin packs: 1; manually selected packs: 1/);
  assert.match(guide, /4; required 20-pin packs: 1; manually selected packs: 0/);
});

test("angled shelf supports keep distinct Home Depot packs, test bores and exact snapshots", () => {
  const eight = "everbilt-802064", twentyFour = "everbilt-802424";
  const base = { ...initial(), retailer: "home-depot" as const };
  const insets = { frontInset: 2, rearInset: 2 };
  const original = previewStudyShelfSupports(base, insets, eight);
  const larger = previewStudyShelfSupports(base, insets, twentyFour);
  assert.deepEqual([original.purchases.plannedPins, original.purchases.requiredPacks], [12, 2]);
  assert.deepEqual([larger.purchases.plannedPins, larger.purchases.requiredPacks], [12, 1]);
  assert.deepEqual(original.project.supplies, []);
  assert.ok(original.review.issues.some(({ code, message }) => code === "pin-test-bore" && /3\/16 in/.test(message)));

  const picked = addHomeDepotPurchaseNeed(original.project, eight);
  assert.equal(addMissingAttachmentPinPacks(picked, eight), picked);
  assert.deepEqual(picked.supplies.map(({ productId, quantity }) => [productId, quantity]), [[eight, 2]]);
  const [plan] = picked.attachmentPlans;
  const measuredWithoutProof = saveShelfPinPlan(picked, { ...plan, measurements: measured() });
  const pending = attachmentReviews(measuredWithoutProof)[0];
  assert.equal(pending.state, "needs-measurements");
  assert.equal(pending.activePinCount, 12);
  assert.ok(pending.points.every(({ holeCenterLocal }) => holeCenterLocal === null));
  assert.match(attachmentScheduleCsv(measuredWithoutProof), /pin-test-bore/);
  const withProof = saveShelfPinPlan(measuredWithoutProof, {
    ...plan,
    measurements: { ...measured(), fitTestConfirmed: true },
  });
  assert.equal(attachmentReviews(withProof)[0].state, "geometry-checked");
  assert.ok(attachmentReviews(withProof)[0].points.every(({ holeCenterLocal }) => holeCenterLocal !== null));
  assert.match(attachmentGuideMarkdown(withProof), /test bore: Confirmed by the project author/);
  assert.throws(() => saveShelfPinPlan(picked, {
    ...plan,
    measurements: { ...emptyShelfPinMeasurements(), fitTestConfirmed: true },
  }), /measurement basis and date/);

  const switched = saveShelfPinPlan(withProof, { ...withProof.attachmentPlans[0], productId: twentyFour });
  assert.deepEqual(switched.attachmentPlans[0].points, plan.points);
  assert.deepEqual(switched.attachmentPlans[0].measurements, emptyShelfPinMeasurements());
  assert.equal(attachmentPurchaseSummary(switched, twentyFour).shortfallPacks, 1);
  assert.equal(attachmentPurchaseSummary(switched, eight).selectedPacks, 2);

  const exact = everbiltAngleShelfPins[eight];
  const other = everbiltAngleShelfPins[twentyFour];
  const snapshot = {
    productId: eight,
    retailer: "home-depot",
    retailerProductId: exact.internetNumber,
    url: exact.url,
    store: base.store,
    zip: base.zip,
    price: 4,
    available: 1,
    checkedAt: new Date().toISOString(),
  };
  assert.throws(() => recordSupplyInventory(picked, {
    ...snapshot, retailerProductId: other.internetNumber, url: other.url,
  }), /exact|reviewed/i);
  const saved = recordSupplyInventory(picked, snapshot);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  const [row] = supplyRows(reopened);
  assert.deepEqual([row.quantity, row.total, row.inventory?.available], [2, 8, 1]);
  assert.ok(homeDepotShoppingList(reopened).items.some((item) =>
    item.productId === exact.internetNumber && item.quantity === 2));
  assert.ok(attachmentGuideMarkdown(reopened).includes(exact.url));
});

test("switching a support plan product clears its old fit measurements and preserves its target IDs", () => {
  const original = withPlan({ ...initial(), retailer: "home-depot" }, ["shelf-1"], measured());
  const saved = original.attachmentPlans[0];
  const updated = saveShelfPinPlan(original, { ...saved, productId: everbiltShelfPin.productId });
  const [review] = attachmentReviews(updated);
  assert.deepEqual(review.plan.measurements, emptyShelfPinMeasurements());
  assert.deepEqual(review.plan.points, saved.points);
  assert.equal(review.state, "needs-measurements");
  assert.equal(review.activePinCount, 4);
  assert.ok(review.points.every((point) => point.holeCenterWorld === null));
  assert.deepEqual(original.attachmentPlans[0].measurements, measured());
});

test("stale references and physical bore conflicts exclude their plan while valid pending intent remains counted", () => {
  const base = initial(),
    entries = shelfSupportEntries(base)[0];
  const first = withPlan(base, [entries.shelves[0].role]);
  const mixed = withPlan(first, [entries.shelves[1].role], {
    ...emptyShelfPinMeasurements(),
    deepestDrillTipDepth: 2,
    basis: "User test-bore measurement",
    measuredAt: checkedAt,
  });
  const reviews = attachmentReviews(mixed);
  assert.equal(reviews[1].state, "conflict");
  assert.equal(reviews[1].activePinCount, 0);
  assert.equal(attachmentPurchaseSummary(mixed).plannedPins, 4);
  assert.equal(attachmentPurchaseSummary(mixed).planRows[1].included, false);
  const stale = structuredClone(first),
    mountId = stale.attachmentPlans[0].points[0].mount.pieceId;
  stale.pieces = stale.pieces.filter((piece) => piece.id !== mountId);
  assert.equal(attachmentReviews(stale)[0].state, "stale");
  assert.equal(attachmentPurchaseSummary(stale).plannedPins, 0);
  assert.equal(attachmentPurchaseSummary(stale).requiredPacks, 0);
  assert.match(attachmentGuideMarkdown(stale), /PENDING — plan excluded/);
  assert.ok(
    toolChecklist(stale).warnings.some((warning) => /stale/.test(warning)),
  );
});

test("human guide uses labeled edge datums while unknown hole geometry stays pending", () => {
  const project = withPlan(initial()),
    plan = project.attachmentPlans[0],
    saved = JSON.stringify(project);
  const guide = attachmentGuideMarkdown(project),
    text = attachmentGuideText(project);
  for (const point of plan.points) {
    assert.ok(!text.includes(point.id));
    assert.ok(!text.includes(point.mount.pieceId));
    assert.ok(
      guide.includes(point.shelf.role.replace(/^(tower-)?shelf-/, "Shelf ")),
    );
  }
  assert.match(guide, /Hole above blank bottom/);
  assert.match(guide, /P00[1-9]/);
  assert.match(guide, /PENDING/);
  assert.match(guide, /User measurement basis: PENDING/);
  assert.match(text, /full-diameter bore.*deepest brad-point/i);
  assert.match(text, /Separate anti-tip attachment review/i);
  assert.match(text, /UNRESOLVED.*restraint kit\/manual/i);
  assert.match(text, /no universal strap count, screw length or penetration/i);
  assert.equal(JSON.stringify(project), saved);
});

test("measured guide labels user provenance, exports computed coordinates and escapes user text", () => {
  const project = withPlan(initial(), undefined, {
    ...measured(),
    basis: "Caliper | [claim](javascript:bad)\n# forged heading <script>",
  });
  const review = attachmentReviews(project)[0];
  assert.equal(review.state, "geometry-checked");
  assert.ok(review.points.every((point) => point.holeCenterLocal !== null));
  const guide = attachmentGuideMarkdown(project),
    text = attachmentGuideText(project);
  assert.match(
    guide,
    /User measurements \(separate from manufacturer specifications\)/,
  );
  assert.match(guide, /do not become author-reviewed manufacturer geometry/);
  assert.ok(guide.includes(checkedAt));
  assert.ok(guide.includes("Caliper \\| \\[claim\\]"));
  assert.ok(!guide.includes("\n# forged heading"));
  assert.ok(!guide.includes("<script>"));
  assert.match(text, /left \/ front.*P00[1-9].*in.*in/);
  assert.match(text, /Measure height from each side/);
  assert.match(text, /geometry-checked/);
  assert.match(text, /not.*shelf load capacity|do not.*shelf load capacity/i);
  assert.equal(project.supplies.length, 0);
});

test("explicit plan tool traces separate jig, optional bit and powered drill without purchases", () => {
  const project = withPlan(initial());
  project.toolSelections = [{ productId: "kreg-kma3232", checkedAt }];
  let rows = toolChecklist(
    project,
    selectedToolsForProject(project, now).tools,
    now,
  ).requirements;
  for (const capability of ["shelf-pin-layout", "shelf-pin-bit"] as const) {
    const row = rows.find((item) => item.capability === capability)!;
    assert.equal(row.status, "supported");
    assert.ok(
      row.sources.some(
        (source) =>
          source.kind === "attachment-plan" &&
          source.id === project.attachmentPlans[0].id,
      ),
    );
  }
  assert.equal(
    rows.find((row) => row.capability === "drill-pilot")?.status,
    "unknown",
  );
  assert.equal(
    rows.find((row) => row.capability === "clamp")?.status,
    "unknown",
  );
  assert.equal(
    rows.find((row) => row.capability === "measure")?.status,
    "unknown",
  );
  project.toolSelections = [{ productId: "kreg-kma3215", checkedAt }];
  rows = toolChecklist(
    project,
    selectedToolsForProject(project, now).tools,
    now,
  ).requirements;
  assert.equal(
    rows.find((row) => row.capability === "shelf-pin-bit")?.status,
    "supported",
  );
  assert.equal(
    rows.find((row) => row.capability === "shelf-pin-layout")?.status,
    "unknown",
  );
  assert.equal(
    rows.find((row) => row.capability === "drill-pilot")?.status,
    "unknown",
  );
  assert.deepEqual(project.supplies, []);
  assert.equal(project.joints.length, 0);
});
