import assert from "node:assert/strict";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { blank, part, projectSchema, uid, type V3 } from "../src/model";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { sunliteFastener } from "../src/sunliteFastenerReference";
import {
  reviewSunliteMounts,
  saveSunliteMount,
  sunliteMountPurchase,
} from "../src/sunliteMounts";
import { saveSunliteTemperatures } from "../src/sunliteThermal";
import { rotate } from "../src/spatial";
import { saveMotionPlan } from "../src/mechanismMotion";
import {
  addHomeDepotPurchaseNeed,
  homeDepotPurchaseNeeds,
} from "../src/handoffPurchases";
import { toolChecklist } from "../src/tools";
import type { SunliteMountDetail } from "../src/sunliteMountSchema";

const detail: SunliteMountDetail = {
  face: 1,
  neutral: [0, 0],
  basis: "Software detail A1",
  shank: 0.24,
  washer: 0.65,
  minimumCoverage: 0.06,
};

function sample() {
  const draft = blank();
  const step = draft.steps[0].id;
  const glazing = part(
    "Glazed panel",
    "sunlite-8mm",
    [24, 48, 8 / 25.4],
    [0, 24, 0],
    step,
    "Glazing",
  );
  glazing.stockLengthAxis = 1;
  const backing = part(
    "Receiver",
    "stud",
    [1.5, 48, 3.5],
    [6, 24, -(8 / 25.4 + 3.5) / 2],
    step,
    "Glazing",
  );
  draft.pieces = [glazing, backing];
  const hole = {
    id: uid(),
    backingId: backing.id,
    center: [6, 10] as [number, number],
    diameter: 0.3125,
  };
  const range = { cold: 32, installation: 68, hot: 120 };
  const project = saveSunliteMount(
    saveSunliteTemperatures(draft, range),
    glazing.id,
    { detail, holes: [hole] },
  );
  return { project, glazing, backing, hole };
}

test("review uses the measured hole, thermal displacement, gasket and actual receiving face", () => {
  const { project, glazing, backing, hole } = sample();
  const review = (p = project) => reviewSunliteMounts(p)[0].rows[0];
  const row = review();
  assert.ok(
    Math.abs(row.movement! - ((Math.hypot(6, 10) * 52 * 5) / 9) * 0.000065) <
      1e-8,
  );
  assert.deepEqual(row.issues, []);
  assert.ok(
    row.bitRange!.minimum < hole.diameter &&
      row.bitRange!.maximum > hole.diameter,
  );
  assert.equal(row.outline.length, 24);
  assert.match(
    guideMarkdown(project),
    /SUNLITE fastener hole layout[\s\S]*0\.3125 in bit[\s\S]*remaining gasket cover/,
  );
  const small = saveSunliteMount(project, glazing.id, {
    detail,
    holes: [{ ...hole, diameter: 0.25 }],
  });
  assert.match(review(small).issues.join(" "), /more radial clearance/);
  const gasket = saveSunliteMount(project, glazing.id, {
    detail: { ...detail, washer: 0.3 },
    holes: [hole],
  });
  assert.match(review(gasket).issues.join(" "), /No round bore meets both/);
  assert.match(
    review({ ...project, sunliteThermal: undefined }).issues.join(" "),
    /Save the sheet temperature/,
  );

  backing.position[2] -= 0.25;
  assert.match(review().issues.join(" "), /lacks confirmed contact/);
  assert.match(
    validate(project).find(({ id }) => id === `sunlite-mount-${glazing.id}`)
      ?.detail ?? "",
    /0 of 1 holes/,
  );
  backing.position[2] += 0.25;
  backing.rectangularOpenings = [{ axis: 2, center: [0, 10], spans: [0.5, 1] }];
  assert.match(review().issues.join(" "), /lacks confirmed contact/);
});

test("recorded geometry and related drill cuts are rechecked without creating new holes or parts", () => {
  const { project, glazing, hole } = sample();
  const original = generateBuildGuide(project);
  assert.equal(guideIsCurrent(original), true);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(saved.sunliteMounts, original.sunliteMounts);
  assert.deepEqual(saved.pieces, original.pieces);
  assert.equal(
    projectSchema.parse({
      ...project,
      schemaVersion: 48,
      sunliteMounts: undefined,
    }).sunliteMounts,
    undefined,
  );
  glazing.roundOpenings = [
    { axis: 2, center: [6, 10], diameter: hole.diameter },
  ];
  assert.deepEqual(reviewSunliteMounts(project)[0].rows[0].issues, []);
  glazing.roundOpenings[0].center[0] += 0.3;
  assert.match(
    reviewSunliteMounts(project)[0].rows[0].issues.join(" "),
    /existing panel openings/,
  );
  glazing.roundOpenings = [];
  glazing.cutPlanes = [{ normal: [1, 0, 0], constant: 6.25 }];
  assert.match(
    reviewSunliteMounts(project)[0].issue ?? "",
    /Panel cuts or dimensions changed/,
  );
  assert.equal(guideIsCurrent({ ...original, pieces: project.pieces }), false);
  const refreshed = saveSunliteMount(project, glazing.id, {
    detail,
    holes: [hole],
  });
  assert.match(
    reviewSunliteMounts(refreshed)[0].rows[0].issues.join(" "),
    /beyond a retained panel edge/,
  );
});

test("the exact 250-count Home Depot bag and bit checklist use explicit reviewed selections", () => {
  const { project } = sample();
  const reviews = reviewSunliteMounts(project);
  assert.deepEqual(sunliteMountPurchase(project, reviews), {
    ready: 1,
    selected: 0,
    missing: 1,
  });
  const tools = toolChecklist(project).requirements;
  assert.match(
    tools.find(({ capability }) => capability === "drill-polycarbonate")
      ?.sources[0].reason ?? "",
    /0\.3125 in/,
  );
  assert.ok(
    tools.some(({ capability }) => capability === "drive-five-sixteenths-hex"),
  );
  const selected = addSupply(
    { ...project, store: "4401" },
    sunliteFastener.productId,
    1,
    "SUNLITE glazing screws",
  );
  const now = Date.parse("2026-11-21T12:00:00Z");
  const observed = recordSupplyInventory(selected, {
    productId: sunliteFastener.productId,
    retailer: "home-depot",
    retailerProductId: sunliteFastener.internetNumber,
    price: 100,
    available: 2,
    store: "4401",
    zip: "84121",
    checkedAt: new Date(now).toISOString(),
    url: sunliteFastener.listing,
  }, now);
  const [row] = supplyRows(observed, now);
  assert.equal(row.quantity, 1);
  assert.equal(row.contents[0].quantity, 250);
  assert.equal(row.inventory?.available, 2);
  assert.equal(sunliteMountPurchase(observed, reviews).missing, 0);
  assert.deepEqual(observed.pieces, project.pieces);
  assert.deepEqual(observed.joints, project.joints);
});

test("rotated panels can fasten from either face and reject a fixed receiver on a moving panel", () => {
  const { project, glazing, backing, hole } = sample();
  backing.position[2] *= -1;
  const rotation: V3 = [0, 0.6, -0.2];
  for (const piece of project.pieces) {
    piece.rotation = rotation;
    piece.position = rotate(piece.position, rotation).map(
      (coord, i) => coord + [20, 1, -30][i],
    ) as V3;
  }
  const assembled = saveSunliteMount(project, glazing.id, {
    detail: { ...detail, face: -1 },
    holes: [hole],
  });
  assert.deepEqual(reviewSunliteMounts(assembled)[0].rows[0].issues, []);
  const { project: moves } = saveMotionPlan(assembled, {
    label: "Sliding cover",
    memberIds: [glazing.id],
    mechanism: { kind: "slide", axis: [1, 0, 0], travel: 12 },
  });
  assert.match(
    reviewSunliteMounts(moves)[0].rows[0].issues.join(" "),
    /do not move together/,
  );
});

test("the retailer handoff purchases reviewed SUNLITE marks once and preserves a purchase when the plan needs review", () => {
  const { project, glazing, hole } = sample();
  const need = (
    draft: Parameters<typeof homeDepotPurchaseNeeds>[0] = project,
  ) =>
    homeDepotPurchaseNeeds(draft).find(
      ({ id }) => id === sunliteFastener.productId,
    );
  assert.equal(need()?.missing, 1);
  assert.equal(need()?.canAdd, true);
  const purchased = addHomeDepotPurchaseNeed(
    project,
    sunliteFastener.productId,
  );
  assert.equal(need(purchased), undefined);
  assert.equal(
    addHomeDepotPurchaseNeed(purchased, sunliteFastener.productId),
    purchased,
  );
  const impossible = saveSunliteMount(purchased, glazing.id, {
    detail,
    holes: [{ ...hole, diameter: 0.18 }],
  });
  assert.equal(need(impossible), undefined);
  assert.equal(impossible.supplies[0].quantity, 1);
  assert.deepEqual(impossible.pieces, project.pieces);
});
