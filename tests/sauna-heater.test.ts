import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { guideMarkdown, shoppingCsv, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { blank, part, projectSchema, type Project } from "../src/model";
import {
  findRetailerProduct,
  retailerProductSchema,
} from "../src/retailerCatalog";
import { harviaKit, steel6 } from "../src/saunaHeaterReference";
import {
  addMissingSaunaHeaters,
  removeSaunaHeater,
  saunaHeaterPurchases,
  saunaHeaterReview,
  saunaRooms,
  saveSaunaHeater,
} from "../src/saunaHeaters";
import { recordSupplyInventory, supplyRows } from "../src/supplies";

const study = (height: number): Project => ({
  ...createBuildStudy(
    "sauna",
    { ...defaultBuildStudyParameters("sauna"), height },
    blank(),
  ).project,
  retailer: "lowes",
});
const input = {
  x: 26,
  z: 24,
  supply: "240",
  uninsulatedWallArea: 6,
  notes: "QA only. Simulated room data.",
};
const defaultSave = (project: Project, overrides: unknown = {}) => {
  const roomId = saunaRooms(project)[0].entry.id;
  return {
    roomId,
    saved: saveSaunaHeater(project, roomId, { ...input, ...Object(overrides) }),
  };
};

test("the default cabin flags overhead and room height before it offers a heater purchase", () => {
  const { saved, roomId } = defaultSave(study(84));
  const review = saunaHeaterReview(saved, roomId)!;
  const failed = review.checks.filter((check) => check.state === "short");
  assert.deepEqual(
    failed.map((check) => check.label),
    ["Above the heater", "Finished room height", "Other modeled parts"],
  );
  assert.match(failed[0].detail, /47\.3 in · Short by/);
  assert.match(failed[2].detail, /ceiling joist/);
  assert.equal(review.layout?.body.size[1], 975 / 25.4);
  assert.equal(review.ready, false);
  assert.equal(addMissingSaunaHeaters(saved), saved);
  assert.ok(
    validate(saved).some((row) => row.id === `sauna-heater-review-${roomId}`),
  );
});

test("adjusted room volume uses entered wall area and the exact voltage-specific manufacturer range", () => {
  const project = study(88);
  const { saved, roomId } = defaultSave(project);
  const review = saunaHeaterReview(saved, roomId)!;
  assert.equal(review.ready, true);
  assert.match(
    review.checks.at(-1)!.detail,
    /283\.8 ft³ adjusted from 264 ft³/,
  );
  const replace = (values: Partial<typeof input>) =>
    saunaHeaterReview(defaultSave(project, values).saved, roomId)!;
  assert.match(replace({ supply: "208" }).checks.at(-1)!.detail, /142–248/);
  assert.equal(replace({ supply: "208" }).checks.at(-1)!.state, "short");
  assert.equal(
    replace({ supply: "unknown" }).checks.at(-1)!.state,
    "needs-review",
  );
  assert.equal(
    replace({ uninsulatedWallArea: 9999 }).checks.at(-1)!.state,
    "needs-review",
  );
  assert.equal(
    saunaHeaterReview(
      saveSaunaHeater(project, roomId, { ...input, uninsulatedWallArea: null }),
      roomId,
    )!.ready,
    false,
  );
});

test("bench reservation and outside obstructions use the actual modeled layout", () => {
  const project = study(88);
  const obstructed = defaultSave(project, { x: 0, z: -25 });
  const back = saunaHeaterReview(obstructed.saved, obstructed.roomId)!;
  assert.ok(back.checks.some((check) => check.label === "Reserved bench"));
  const right = defaultSave(project, { x: 33 });
  assert.equal(
    saunaHeaterReview(right.saved, right.roomId)!.checks.find(
      (check) => check.label === "Right wall",
    )?.state,
    "short",
  );
  const shield = part(
    "Added timber",
    "stud",
    [2, 3.5, 3.5],
    [26, 45, 24],
    project.steps[0].id,
    "Added",
  );
  const withTimber = defaultSave({
    ...project,
    pieces: [...project.pieces, shield],
  });
  const collision = saunaHeaterReview(withTimber.saved, withTimber.roomId)!;
  assert.ok(
    collision.checks.some((check) =>
      /envelope overlaps .*Added timber/.test(check.detail),
    ),
  );
  assert.equal(collision.ready, false);
});

test("an exact marketplace package exports once and stays outside direct store snapshots", () => {
  const base = generateBuildGuide(study(88));
  const { saved, roomId } = defaultSave(base);
  const selected = addMissingSaunaHeaters(saved);
  assert.notEqual(selected, saved);
  assert.equal(selected.pieces, saved.pieces);
  assert.deepEqual(saunaHeaterPurchases(selected), {
    needed: 1,
    selected: 1,
    missing: 0,
  });
  assert.equal(addMissingSaunaHeaters(selected), selected);
  assert.match(shoppingCsv(selected), /105999158/);
  const row = supplyRows(selected)[0];
  assert.equal(row.offer?.seller, "Bathing Brands (Lowe’s marketplace)");
  assert.equal(row.storeSnapshotEligible, false);
  assert.equal(
    retailerProductSchema.safeParse(findRetailerProduct(steel6.productId))
      .success,
    true,
  );
  assert.throws(
    () =>
      recordSupplyInventory(selected, {
        productId: steel6.productId,
        retailer: "lowes",
        retailerProductId: steel6.retailerProductId,
        price: 100,
        available: 1,
        store: "QA only",
        zip: "84121",
        checkedAt: "2026-11-19T20:00:00.000Z",
        url: steel6.listing,
      }),
    /marketplace reference/,
  );
  assert.equal(guideIsCurrent(saved), false);
  const guide = guideMarkdown(selected);
  assert.match(
    guide,
    /Sauna heater layout review[\s\S]*283\.8 ft³ adjusted[\s\S]*H1006L03_v9/,
  );
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(selected)));
  assert.deepEqual(reopened.saunaHeaterPlans, selected.saunaHeaterPlans);
  assert.equal(saunaHeaterReview(reopened, roomId)!.ready, true);
  const stale = {
    ...reopened,
    saunaHeaterPlans: reopened.saunaHeaterPlans!.map((plan) => ({
      ...plan,
      reference: "unreviewed-doc",
    })),
  };
  assert.equal(saunaHeaterReview(stale, roomId)!.layout, null);
  assert.equal(saunaHeaterPurchases(stale).needed, 0);
  assert.equal(removeSaunaHeater(stale, roomId).saunaHeaterPlans?.length, 0);
  assert.equal(
    projectSchema.parse({ ...base, schemaVersion: 17 }).saunaHeaterPlans,
    undefined,
  );
});

const harviaInput = {
  productId: harviaKit.productId,
  wall: "right",
  offset: 0,
  bottom: 12,
  supply: "240",
  uninsulatedWallArea: 0,
  notes: "",
};

test("Home Depot sauna heater screening models only the listed body and reports obstructions", () => {
  const original = { ...study(84), retailer: "home-depot" as const };
  const { saved, roomId } = defaultSave(original);
  const place = (overrides = {}) =>
    saveSaunaHeater(saved, roomId, { ...harviaInput, ...overrides });
  const project = place();
  const review = saunaHeaterReview(project, roomId)!;
  assert.equal(project.saunaHeaterPlans?.length, 1);
  assert.equal(project.pieces, original.pieces);
  assert.deepEqual(review.layout?.body, { size: [16, 24, 11], center: [30.5, 24, 0] });
  assert.equal(review.layout?.clearance, null);
  assert.equal(review.ready, false);
  assert.equal(review.checks.find(({ label }) => label === "Room size screening")?.state, "within");
  assert.match(review.checks.at(-1)!.detail, /delivered heater and Xenio nameplates/);
  for (const [overrides, label] of [
    [{ wall: "front" }, "Doorway approach"],
    [{ wall: "back" }, "Reserved bench"],
    [{ offset: -31 }, "Listed heater body"],
    [{ bottom: 70 }, "Listed heater body"],
    [{ supply: "208" }, "Supply screening"],
  ] as const) {
    const blocked = place(overrides);
    assert.ok(saunaHeaterReview(blocked, roomId)!.checks.some((check) => check.label === label && check.state === "short"));
    assert.equal(addMissingSaunaHeaters(blocked, harviaKit.productId), blocked);
  }
  const uninsulated = saunaHeaterReview(place({ uninsulatedWallArea: 8 }), roomId)!;
  assert.match(uninsulated.checks.find(({ label }) => label === "Room size screening")!.detail, /Ask the installer/);
  assert.equal(uninsulated.checks.find(({ label }) => label === "Room size screening")?.state, "needs-review");
  const obstruction = part("Added shelf", "plywood", [8, 3, 8], [29, 24, 0], saved.steps[0].id, "Added");
  assert.ok(saunaHeaterReview({ ...project, pieces: [...project.pieces, obstruction] }, roomId)!.checks.some(
    (check) => check.state === "short" && /listed body overlaps.*Added shelf/.test(check.detail),
  ));
  assert.throws(() => place({ bottom: -1 }));
});

test("Harvia package appears as an exact sourcing candidate and round trips with reviewed snapshot inputs", () => {
  const base = { ...study(84), retailer: "home-depot" as const, store: "QA only" };
  const roomId = saunaRooms(base)[0].entry.id;
  const saved = saveSaunaHeater(base, roomId, harviaInput);
  assert.equal(saunaHeaterPurchases(saved).needed, 0);
  assert.deepEqual(saunaHeaterPurchases(saved, harviaKit.productId), { needed: 1, selected: 0, missing: 1 });
  assert.ok(homeDepotPurchaseNeeds(saved).some((row) => row.id === harviaKit.productId && row.basis.includes("Sauna heater candidate")));
  const added = addMissingSaunaHeaters(saved, harviaKit.productId);
  assert.equal(addMissingSaunaHeaters(added, harviaKit.productId), added);
  assert.equal(supplyRows(added)[0].offer?.retailerItemNumber, "1009456454");
  assert.equal(supplyRows(added)[0].inventory, null);
  const observed = recordSupplyInventory(added, {
    productId: harviaKit.productId,
    retailer: "home-depot",
    retailerProductId: harviaKit.retailerProductId,
    price: 1800,
    available: 1,
    store: added.store,
    zip: "84121",
    checkedAt: "2026-11-20T17:00:00.000Z",
    url: harviaKit.listing,
  });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(observed)));
  assert.deepEqual(reopened.saunaHeaterPlans, saved.saunaHeaterPlans);
  assert.equal(supplyRows(reopened, Date.parse("2026-11-20T17:01:00.000Z"))[0].inventory?.available, 1);
  assert.match(shoppingCsv(reopened), /324830605/);
  assert.match(guideMarkdown(reopened), /Sauna heater layout review[\s\S]*252 ft³[\s\S]*Confirm the delivered heater[\s\S]*homedepot\.com\/p\/324830605/);
  assert.equal(projectSchema.parse({ ...base, schemaVersion: 56 }).schemaVersion, saved.schemaVersion);
});
