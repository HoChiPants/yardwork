import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  blank,
  catalog,
  material,
  part,
  projectSchema,
  type Project,
} from "../src/model";
import {
  fastenerProductIds,
  fastenerPlanSchema,
  type FastenerPlan,
} from "../src/fasteningSchema";
import {
  getWoodFastenerProduct,
  woodFastenerProducts,
} from "../src/fastenerProducts";
import {
  addFastenerLocation,
  changeFastenerProduct,
  fastenerReviews,
  makeFastenerPlan,
  saveFastenerPlan,
} from "../src/fastenings";
import {
  addMissingFastenerPacks,
  fastenerPurchaseSummary,
} from "../src/fastenerPurchases";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import {
  findRetailerProduct,
  referenceOffersForProduct,
} from "../src/retailerCatalog";
import { toolChecklist } from "../src/tools";
import { fastenerGuideText } from "../src/fastenerGuide";
import { fastenerScheduleCsv } from "../src/fastenerCsv";
import {
  designFingerprint,
  generateBuildGuide,
  guideIsCurrent,
} from "../src/guide";
import { bom, shoppingCsv } from "../src/engine";
import { buildFixtureIds, createBuildStudy } from "../src/buildFixtures";
import {
  getConnectorProduct,
  getConnectorSchedule,
} from "../src/connectorProducts";
import { makeConnectorPlan, saveConnectorPlan } from "../src/connectors";
import { connectorPurchaseSummary } from "../src/connectorPurchases";
import { connectorPlanSchema } from "../src/connectorSchema";
import { fastenerDistanceStudy } from "./helpers/fastenerDistanceStudy";
import { compareFastenerReceiverDistances } from "../src/fastenerEntryDistances";

const ids = ["simpson-csvz3r70", "simpson-dsvt3r70"] as const;
const productRows = [
  { id: ids[0], mpn: "CSVZ3R70", hd: "321563361", lowes: "1002623380" },
  { id: ids[1], mpn: "DSVT3R70", hd: "321563400", lowes: "1002623434" },
] as const;

test("Simpson SDWS compares receiver edge and end distance even when the screw path fits", () => {
  const { project } = fastenerDistanceStudy();
  const [location] = fastenerReviews(project)[0].locations;
  assert.equal(location.state, "path-reviewed");
  assert.ok(location.includedInDemand);
  assert.ok(location.issues.some(({ code }) => code === "receiver-distance-short"));
  assert.deepEqual(location.entryDistances?.head, { edge: 0.25, end: 1 });
  assert.deepEqual(location.entryDistances?.receiver, { edge: 0.25, end: 1 });
  assert.deepEqual(location.entryDistances?.receiverCases?.map(({ short }) => short), Array(3).fill(["edge", "end"]));
  assert.match(fastenerGuideText(project), /Receiver center to nearest edge 0\.25 in · nearest end 1 in/);
  assert.match(fastenerScheduleCsv(project), /Receiver center-to-end \(in\)/);

  const passingSome = fastenerDistanceStudy([6, 0.75, 0]);
  const [different] = fastenerReviews(passingSome.project)[0].locations;
  assert.deepEqual(different.entryDistances?.receiverCases?.map(({ short }) => short), [[], ["end"], []]);
  const shortened = fastenerDistanceStudy([8, 0.75, 1.5], true);
  const [trimmed] = fastenerReviews(shortened.project)[0].locations;
  assert.deepEqual(trimmed.entryDistances?.receiver, { edge: 0.25, end: 0.5 });
  assert.equal(trimmed.entryDistances?.receiverCases, undefined);
  assert.deepEqual(compareFastenerReceiverDistances("simpson-sdws16212qr50", { edge: 0.5, end: 2 })
    .map(({ short }) => short), [[], ["edge", "end"], ["edge", "end"]]);
});
function fixture(): Project {
  const p = blank("SYNTHETIC three-inch screw software test");
  p.store = "SYNTHETIC-store";
  p.pieces = [
    part(
      "Actual head-side sheet",
      "plytanium-703",
      [0.703, 90, 8],
      [0.3515, 45, 0],
      p.steps[0].id,
      "SYNTHETIC pair",
    ),
    part(
      "Actual wood receiver",
      "stud",
      [3.5, 90, 1.5],
      [2.453, 45, 0],
      p.steps[0].id,
      "SYNTHETIC pair",
    ),
  ];
  return p;
}
function addPoints(
  p: Project,
  productId: FastenerPlan["productId"],
  count: number,
  offset = 0,
  depth: number | null = null,
) {
  let plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id, { productId });
  for (let i = 0; i < count; i++) {
    plan = addFastenerLocation(plan);
    plan.locations[i].entranceLocal = [-0.3515, -40 + (offset + i) * 0.8, 0];
    plan.locations[i].driveLocal = [1, 0, 0];
  }
  if (depth !== null)
    plan.measurements = {
      surfaceToTipDepth: depth,
      pilotDiameter: 0.125,
      pilotDepth: depth + 0.1,
      basis:
        "SYNTHETIC user-entered surface-to-tip after proposed seating; no real installation",
      measuredAt: "2026-11-17T15:00:00.000Z",
    };
  return saveFastenerPlan(p, plan);
}
function summary(p: Project, productId: string) {
  return fastenerPurchaseSummary(p).products.find(
    (row) => row.productId === productId,
  )!;
}

test("new choices are exact70-count three-inch references with authoritative source boundaries and unknown geometry", () => {
  assert.deepEqual(
    woodFastenerProducts.map((product) => product.productId),
    [...fastenerProductIds],
  );
  for (const row of productRows) {
    const fact = getWoodFastenerProduct(row.id)!,
      registered = findRetailerProduct(row.id)!;
    assert.equal(fact.packCount, 70);
    assert.equal(fact.nominalLength, 3);
    assert.equal(fact.drive, "T25");
    assert.equal(fact.evidenceRevision, `${row.id}-2026-11-17-v1`);
    assert.deepEqual(fact.datums, []);
    assert.equal(fact.surfaceToTipDepth, null);
    assert.equal(fact.tipLength, null);
    assert.equal("pilotDiameter" in fact, false);
    assert.equal("pilotDepth" in fact, false);
    assert.equal("capacity" in fact, false);
    assert.equal(registered.manufacturerPartNumber, row.mpn);
    assert.equal(registered.profile.packCount, 70);
    assert.equal(registered.profile.stockSize, null);
    assert.equal(
      catalog.some((stock) => stock.productReference === row.id),
      false,
    );
    assert.deepEqual(
      referenceOffersForProduct(registered).map((offer) => [
        offer.retailer,
        offer.productId,
      ]),
      [
        ["home-depot", row.hd],
        ["lowes", row.lowes],
      ],
    );
    assert.ok(
      fact.sources.every((source) =>
        registered.sources.some((entry) => entry.url === source.url),
      ),
    );
    assert.ok(
      fact.sources.every(
        (source) => source.reviewedAt === "2026-11-17T15:35:26.215Z",
      ),
    );
    assert.ok(
      fact.sources.some((source) =>
        /expires December 31, 2026/.test(source.revision),
      ),
    );
    assert.match(fact.unknowns.join(" "), /nominal 3 in/i);
    assert.match(fact.unknowns.join(" "), /pilot/i);
    assert.match(fact.unknowns.join(" "), /included T25.bit/i);
    assert.match(
      fact.unknowns.join(" "),
      /not an SD9112 or N10DHDG substitute/i,
    );
    assert.match(fact.conflicts.join(" "), /BIT25T-2.*BIT25T-2-R2/);
    assert.ok(Object.isFrozen(fact));
    assert.ok(Object.isFrozen(fact.sources[0]));
  }
});

test("original GRK object content and factory default remain exact", () => {
  const expected = {
    "grk-r4-103101":
      "b2ecf5934cd57e960fa62d6027b96f035853b233085830c171c9c3e2a856a9ec",
    "grk-cabinet-113079":
      "ba654ba67f0f4266d26b7f557d45f75f8270555ae6a6e9e03a75a246f73cc10f",
  };
  for (const [id, hash] of Object.entries(expected)) {
    const product = getWoodFastenerProduct(id)!;
    assert.equal(
      createHash("sha256").update(JSON.stringify(product)).digest("hex"),
      hash,
    );
    assert.ok(
      product.sources.every(
        (source) => source.reviewedAt === "2026-11-17T03:55:01.000Z",
      ),
    );
  }
  const p = fixture(),
    plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id);
  assert.equal(plan.productId, "grk-r4-103101");
  assert.equal(
    plan.productEvidenceRevision,
    getWoodFastenerProduct(plan.productId)!.evidenceRevision,
  );
  assert.deepEqual(plan.locations, []);
  assert.deepEqual(plan.measurements, {
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
});

for (const productId of ids)
  test(`${productId}: split71 current locations round once to2boxes, selected packs charge once`, () => {
    let p = addPoints(fixture(), productId, 35);
    p = addPoints(p, productId, 36, 35);
    assert.deepEqual(
      fastenerReviews(p).map((review) => review.activePointCount),
      [35, 36],
    );
    const before = structuredClone(p),
      initial = summary(p, productId);
    assert.equal(initial.plannedScrews, 71);
    assert.equal(initial.packCount, 70);
    assert.equal(initial.requiredPacks, 2);
    assert.equal(initial.shortfallPacks, 2);
    assert.equal(initial.selectedPacks, 0);
    assert.equal(initial.provisional, true);
    assert.deepEqual(p, before);
    p = addSupply(p, productId, 1, "SYNTHETIC explicitly selected box");
    assert.equal(summary(p, productId).selectedScrews, 70);
    assert.equal(summary(p, productId).shortfallPacks, 1);
    const bought = addMissingFastenerPacks(p, productId),
      final = summary(bought, productId);
    assert.equal(final.selectedPacks, 2);
    assert.equal(final.selectedScrews, 140);
    assert.equal(final.spareScrews, 69);
    assert.equal(final.shortfallPacks, 0);
    assert.deepEqual(addMissingFastenerPacks(bought, productId), bought);
    assert.deepEqual(bought.pieces, before.pieces);
    assert.deepEqual(bought.joints, before.joints);
    assert.deepEqual(bom(bought), bom(before));
    assert.equal(
      supplyRows(bought)
        .filter((row) => row.productId === productId)
        .reduce((sum, row) => sum + row.quantity, 0),
      2,
    );
    assert.match(
      fastenerGuideText(bought),
      /71 provisional screws; 70\/pack; required packs 2; selected packs 2/,
    );
    assert.equal(
      JSON.stringify(bought).includes('"surfaceToTipDepth":3'),
      false,
    );
  });

test("exact products retain separate70-box demand; stale/conflicting locations contribute no units", () => {
  let p = addPoints(fixture(), ids[0], 2);
  p = addPoints(p, ids[1], 1, 10);
  const conflict = addFastenerLocation(p.fastenerPlans[0]);
  conflict.locations.at(-1)!.entranceLocal = [-0.3515, 80, 0];
  conflict.locations.at(-1)!.driveLocal = [1, 0, 0];
  p = saveFastenerPlan(p, conflict);
  assert.equal(fastenerReviews(p)[0].locations.at(-1)!.state, "conflict");
  assert.equal(summary(p, ids[0]).plannedScrews, 2);
  assert.equal(summary(p, ids[0]).excludedLocations, 1);
  assert.equal(summary(p, ids[1]).plannedScrews, 1);
  const stale = structuredClone(p);
  stale.pieces[1].position[0] += 0.25;
  assert.ok(fastenerReviews(stale).every((review) => review.state === "stale"));
  assert.equal(summary(stale, ids[0]).plannedScrews, 0);
  assert.equal(summary(stale, ids[0]).excludedLocations, 3);
  assert.equal(summary(stale, ids[1]).plannedScrews, 0);
  p = addSupply(p, ids[0], 1);
  assert.equal(summary(p, ids[0]).shortfallPacks, 0);
  assert.equal(summary(p, ids[1]).shortfallPacks, 1);
});

test("new factories do not place tips or pilots from nominal3in or packaged bit claims", () => {
  for (const productId of ids) {
    const p = fixture(),
      plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id, { productId });
    assert.equal(plan.locations.length, 0);
    assert.equal(plan.measurements.surfaceToTipDepth, null);
    assert.equal(plan.measurements.pilotDiameter, null);
    assert.equal(plan.measurements.pilotDepth, null);
    let pending = addFastenerLocation(plan);
    pending.locations[0].entranceLocal = [-0.3515, 0, 0];
    pending.locations[0].driveLocal = [1, 0, 0];
    const saved = saveFastenerPlan(p, pending),
      review = fastenerReviews(saved)[0];
    assert.equal(review.activePointCount, 1);
    assert.equal(review.locations[0].tipWorld, null);
    assert.equal(review.plan.measurements.pilotDepth, null);
    assert.deepEqual(saved.toolSelections, []);
    assert.deepEqual(saved.supplies, []);
  }
});

test("entered depths remain exact through guide/CSV/JSON despite a different nominal product length", () => {
  const p = generateBuildGuide(addPoints(fixture(), ids[0], 1, 0, 1.375)),
    review = fastenerReviews(p)[0],
    location = review.locations[0];
  assert.equal(review.state, "path-reviewed");
  assert.equal(location.tipWorld![0], 1.375);
  assert.ok(Math.abs(location.penetration! - (1.375 - 0.703)) < 1e-12);
  assert.equal(p.fastenerPlans[0].measurements.surfaceToTipDepth, 1.375);
  const csv = fastenerScheduleCsv(p);
  assert.ok(csv.includes('"simpson-csvz3r70"'));
  assert.ok(csv.includes(",1.375,"));
  assert.match(fastenerGuideText(p), /nominal 3 in/);
  assert.match(fastenerGuideText(p), /surface-to-tip 1.375 in/);
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))), p);
  assert.ok(guideIsCurrent(p));
});

test("saved GRK→CSV→DSV edits append exact immutable product/reference history and clear current measurements", () => {
  let p = addPoints(fixture(), "grk-r4-103101", 1, 0, 1.375),
    previous = structuredClone(p.fastenerPlans[0]);
  const changed = changeFastenerProduct(p, p.fastenerPlans[0], ids[0]);
  assert.equal(changed.productId, ids[0]);
  assert.deepEqual(changed.head, previous.head);
  assert.deepEqual(changed.receiver, previous.receiver);
  assert.deepEqual(changed.locations, previous.locations);
  assert.deepEqual(changed.measurements, {
    surfaceToTipDepth: null,
    pilotDiameter: null,
    pilotDepth: null,
    basis: "",
    measuredAt: null,
  });
  assert.equal(changed.referenceHistory.length, 1);
  assert.equal(changed.referenceHistory[0].previous.productId, "grk-r4-103101");
  assert.deepEqual(
    changed.referenceHistory[0].previous.measurements,
    previous.measurements,
  );
  p = saveFastenerPlan(p, changed);
  const firstReceipt = structuredClone(p.fastenerPlans[0].referenceHistory[0]);
  const second = changeFastenerProduct(p, p.fastenerPlans[0], ids[1]);
  assert.deepEqual(second.referenceHistory[0], firstReceipt);
  assert.equal(second.referenceHistory.length, 2);
  assert.equal(second.referenceHistory[1].previous.productId, ids[0]);
  assert.equal(second.referenceHistory[1].next.productId, ids[1]);
  p = saveFastenerPlan(p, second);
  assert.equal(
    changeFastenerProduct(p, p.fastenerPlans[0], ids[1]),
    p.fastenerPlans[0],
  );
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))), p);
  assert.deepEqual(previous.productId, "grk-r4-103101");
  const forged = structuredClone(p.fastenerPlans[0]);
  forged.referenceHistory[0].previous.measurements.surfaceToTipDepth = 3;
  assert.throws(() => saveFastenerPlan(p, forged), /history/i);
});

test("T25 accessory requirement remains separate from powered driver and pilot setup, without included-bit ownership", () => {
  for (const productId of ids) {
    const p = addPoints(fixture(), productId, 1),
      requirements = toolChecklist(p).requirements;
    const bit = requirements.find((row) => row.capability === "drive-t25")!,
      driver = requirements.find((row) => row.capability === "drive-screw")!;
    assert.ok(bit && driver);
    assert.equal(bit.status, "unknown");
    assert.equal(driver.status, "unknown");
    assert.deepEqual(bit.supportedBy, []);
    assert.deepEqual(driver.supportedBy, []);
    assert.ok(
      bit.sources.some(
        (source) =>
          source.kind === "fastener-plan" &&
          source.reason.includes(productId === ids[0] ? "CSV" : "DSV"),
      ),
    );
    assert.equal(
      requirements.some((row) => row.capability === "pilot-bit-1-16"),
      false,
    );
    assert.deepEqual(p.toolSelections, []);
  }
});

test("70-count manual purchases and exact store observations price boxes only, including observedzero", () => {
  const now = Date.now();
  for (const [index, productId] of ids.entries()) {
    let p = addMissingFastenerPacks(
      addPoints(fixture(), productId, 71),
      productId,
    );
    const offer = referenceOffersForProduct(
      findRetailerProduct(productId)!,
    ).find((row) => row.retailer === p.retailer)!;
    const observation = {
      productId,
      retailer: p.retailer,
      retailerProductId: offer.productId,
      price: index ? 12.5 : 0,
      available: 3,
      store: p.store,
      zip: p.zip,
      checkedAt: new Date(now).toISOString(),
      url: offer.url,
    };
    p = recordSupplyInventory(p, observation);
    const row = supplyRows(p, now).find(
      (item) => item.productId === productId,
    )!;
    assert.equal(row.quantity, 2);
    assert.equal(row.contents[0].quantity, 70);
    assert.equal(row.total, index ? 25 : 0);
    assert.equal(
      supplyRows({ ...p, store: "SYNTHETIC-other-store" }, now)[0].total,
      null,
    );
    assert.equal(supplyRows(p, now + 86400001)[0].total, null);
    assert.throws(() =>
      recordSupplyInventory(p, {
        ...observation,
        retailerProductId: index ? "321563361" : "321563400",
      }),
    );
    const shopping = shoppingCsv(p);
    assert.ok(shopping.includes(offer.productId));
    assert.ok(shopping.includes(offer.url));
  }
});

test("new wood screws cannot substitute either exact A21Z reference alternative or offset its paid packs", () => {
  let p = blank("SYNTHETIC connector separation");
  p.pieces = [
    part("Base", "stud", [3.5, 1.5, 24], [0, 0.75, 0], p.steps[0].id, "Frame"),
    part("Post", "stud", [1.5, 12, 3.5], [0, 7.5, 0], p.steps[0].id, "Frame"),
  ];
  const connector = makeConnectorPlan(p, p.pieces[0].id, p.pieces[1].id);
  p = saveConnectorPlan(p, connector);
  for (const productId of ids) {
    assert.equal(getConnectorSchedule(productId), undefined);
    assert.equal(
      connectorPlanSchema.safeParse({ ...connector, scheduleId: productId })
        .success,
      false,
    );
    p = addSupply(p, productId, 1, "SYNTHETIC separate manual box");
  }
  assert.deepEqual(
    getConnectorProduct("simpson-a21z")!.schedules.map(
      (schedule) => schedule.fastenerProductId,
    ),
    ["simpson-sd9112r100", "simpson-n10dhdg-r"],
  );
  const sd = connectorPurchaseSummary(p).products.find(
    (row) => row.productId === "simpson-sd9112r100",
  )!;
  assert.equal(sd.requiredUnits, 4);
  assert.equal(sd.selectedPacks, 0);
  assert.equal(sd.requiredPacks, 1);
});

for (const family of buildFixtureIds)
  test(`${family}: explicit new product selection is readable without changing geometry or claiming suitability`, () => {
    const original = createBuildStudy(family).project,
      wood = original.pieces.filter(
        (piece) => !piece.offcut && material(piece.material).wood,
      );
    for (const productId of ids) {
      const plan = makeFastenerPlan(original, wood[0].id, wood[1].id, {
          productId,
        }),
        saved = saveFastenerPlan(original, plan);
      assert.equal(saved.fastenerPlans.at(-1)!.productId, productId);
      assert.deepEqual(saved.pieces, original.pieces);
      assert.deepEqual(saved.sections, original.sections);
      assert.deepEqual(saved.supplies, original.supplies);
      assert.deepEqual(saved.toolSelections, original.toolSelections);
      assert.equal(plan.locations.length, 0);
      assert.equal(
        fastenerReviews(saved).find((review) => review.plan.id === plan.id)!
          .activePointCount,
        0,
      );
      assert.deepEqual(
        projectSchema.parse(JSON.parse(JSON.stringify(saved))),
        saved,
      );
    }
  });

test("real archived GRK geometry/history/checklists retain their physical guide hash and exact old fields", () => {
  const raw = JSON.parse(
      readFileSync(
        new URL(
          "./fixtures/format6-remapped-storage.yardwork.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
    p = projectSchema.parse(raw);
  assert.deepEqual(p.pieces, raw.pieces);
  assert.deepEqual(p.fastenerPlans, raw.fastenerPlans);
  assert.deepEqual(p.steps, raw.steps);
  assert.equal(designFingerprint(p), raw.guideFingerprint);
  assert.ok(guideIsCurrent(p));
  assert.deepEqual(generateBuildGuide(p).steps, p.steps);
});

test("model-number aliases, other pack variants and caller-supplied replacement facts remain rejected", () => {
  for (const id of [
    "CSVZ3R70",
    "DSVT3R70",
    "simpson-csvz3r210",
    "simpson-dsvt3r350",
    "simpson-sd9112r100",
    "__proto__",
  ])
    assert.equal(getWoodFastenerProduct(id), undefined);
  const p = fixture(),
    plan = makeFastenerPlan(p, p.pieces[0].id, p.pieces[1].id, {
      productId: ids[0],
    });
  assert.equal(
    fastenerPlanSchema.safeParse({ ...plan, productId: "CSVZ3R70" }).success,
    false,
  );
  assert.equal(
    fastenerPlanSchema.safeParse({ ...plan, packCount: 100 }).success,
    false,
  );
  assert.equal(
    fastenerPlanSchema.safeParse({ ...plan, nominalLength: 2.5 }).success,
    false,
  );
  assert.throws(() => {
    (
      getWoodFastenerProduct(ids[0])! as unknown as { packCount: number }
    ).packCount = 100;
  }, TypeError);
});
