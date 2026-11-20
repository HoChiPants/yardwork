import assert from "node:assert/strict";
import test from "node:test";
import { blank, part, projectSchema, uid } from "../src/model";
import { blankProjectCode } from "../src/projectCodeSchema";
import { reviewProjectCode, saveProjectCode } from "../src/projectCode";
import {
  addMissingRoofBundles,
  addMissingRoofEdgeBundles,
  reviewShingleRoof,
} from "../src/shingleRoof";
import {
  gafRoofShingle,
  shingleEdgeProducts,
} from "../src/shingleRoofReference";
import { findRetailerProduct } from "../src/retailerCatalog";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { homeDepotShoppingList } from "../src/handoff";
import { guideMarkdown, validate } from "../src/engine";
import type { ShingleRoof, ShingleRoofEdge } from "../src/shingleRoofSchema";

function roofContext(plan: ShingleRoof) {
  return {
    ...blankProjectCode(),
    region: "utah" as const,
    projectDate: "2026-11-20",
    codePath: "irc" as const,
    work: "new" as const,
    trades: ["roofing" as const],
    buildingAuthority: "Synthetic site authority",
    authorityBasis: "Synthetic fixture for the reviewed date",
    shingleRoof: plan,
  };
}
function fixture() {
  const project = { ...blank("Shingle review"), store: "4409" };
  const deck = part(
    "South deck",
    "plywood",
    [96, 0.75, 48],
    [0, 48, 0],
    project.steps[0].id,
    "Roof",
  );
  deck.rotation = [Math.atan(3 / 12), 0, 0];
  project.pieces.push(deck);
  const plan: ShingleRoof = {
    productId: gafRoofShingle.id,
    planes: [
      {
        id: uid(),
        label: "South roof",
        basis: { kind: "panel", pieceId: deck.id },
        underlayment: "single",
      },
    ],
    coveragePerBundle: 20,
    wastePercent: 10,
    coverageBasis: "Synthetic bundle coverage for testing only",
  };
  return { project, deck, plan };
}

test("roof geometry follows a live cut deck and withholds estimates below the shingle pitch", () => {
  const { project, deck, plan } = fixture();
  const saved = saveProjectCode(project, roofContext(plan));
  const geometry = () => reviewShingleRoof(saved, plan);
  const pitch = () => geometry().planes[0].pitch!;
  assert.ok(Math.abs(pitch() - 3) < 1e-7);
  assert.ok(Math.abs(geometry().area! - 32) < 1e-7);
  assert.equal(geometry().bundles, 2);
  const rows = () => reviewProjectCode(saved.projectCode!, saved).rows;
  assert.equal(
    rows().find(({ id }) => id.endsWith("-underlayment"))?.state,
    "discrepancy",
  );
  const marker = validate(saved).find(
    ({ area }) => area?.kind === "roof-plane",
  )!;
  assert.equal(marker.pieceId, deck.id);
  assert.equal(marker.area?.outlines.length, 1);

  const currentDeck = saved.pieces[0];
  currentDeck.rotation = [Math.atan(3 / 12), 0.75, 0];
  assert.ok(Math.abs(pitch() - 3) < 1e-7);
  currentDeck.rectangularOpenings = [
    { axis: 1, center: [0, 0], spans: [24, 24] },
  ];
  assert.ok(Math.abs(geometry().area! - 28) < 1e-7);
  currentDeck.rotation = [Math.atan(1.5 / 12), 0, 0];
  assert.equal(geometry().bundles, null);
  assert.equal(
    rows().find(({ id }) => id.endsWith("-pitch"))?.state,
    "discrepancy",
  );
  assert.match(
    guideMarkdown(saved),
    /South roof · Shingle pitch · Difference to review/,
  );
});

test("field pitch reviews without area and overlapping model surfaces cannot generate a bundle estimate", () => {
  const { project, deck, plan } = fixture();
  const field: ShingleRoof = {
    ...plan,
    planes: [
      {
        id: uid(),
        label: "Porch",
        basis: { kind: "field", rise: 24, run: 144, width: null },
        underlayment: "double",
      },
    ],
  };
  const measured = reviewShingleRoof(project, field);
  assert.equal(measured.planes[0].pitch, 2);
  assert.equal(measured.area, null);
  const scoped = roofContext(field);
  assert.equal(
    reviewProjectCode(scoped).rows.find(({ id }) => id.endsWith("-pitch"))
      ?.state,
    "measured-match",
  );
  for (const patch of [
    { codePath: "ibc" as const },
    { projectDate: "2026-11-21" },
    { buildingAuthority: "" },
    { region: "other" as const },
  ]) {
    assert.equal(
      reviewProjectCode({ ...scoped, ...patch }).rows.some(({ id }) =>
        id.endsWith("-pitch"),
      ),
      false,
    );
  }

  const copy = { ...deck, id: uid(), name: "South deck overlap" };
  project.pieces.push(copy);
  const overlapping: ShingleRoof = {
    ...plan,
    planes: [
      ...plan.planes,
      {
        id: uid(),
        label: "Overlap",
        basis: { kind: "panel", pieceId: copy.id },
        underlayment: "unknown",
      },
    ],
  };
  assert.equal(reviewShingleRoof(project, overlapping).overlaps, true);
  assert.equal(reviewShingleRoof(project, overlapping).bundles, null);
  assert.throws(
    () =>
      saveProjectCode(
        project,
        roofContext({
          ...overlapping,
          planes: [
            plan.planes[0],
            {
              ...overlapping.planes[1],
              basis: { kind: "panel", pieceId: deck.id },
            },
          ],
        }),
      ),
    /Count each modeled deck panel once/,
  );
});

test("exact Home Depot shingle bundles require entered coverage and use an explicit snapshot purchase", () => {
  const { project, plan } = fixture();
  assert.equal(
    findRetailerProduct(gafRoofShingle.id)?.offers[0].productId,
    "314168668",
  );
  const noCoverage = saveProjectCode(
    project,
    roofContext({ ...plan, coverageBasis: "" }),
  );
  assert.equal(addMissingRoofBundles(noCoverage), noCoverage);
  const saved = saveProjectCode(project, roofContext(plan));
  assert.equal(saved.supplies.length, 0);
  const selected = addMissingRoofBundles(saved);
  assert.equal(selected.supplies[0].quantity, 2);
  assert.equal(addMissingRoofBundles(selected), selected);
  assert.deepEqual(selected.pieces, saved.pieces);
  const checkedAt = new Date(Date.now() - 1000).toISOString();
  const priced = recordSupplyInventory(selected, {
    productId: gafRoofShingle.id,
    retailer: "home-depot",
    retailerProductId: gafRoofShingle.internetNumber,
    price: 10,
    available: 3,
    store: selected.store,
    zip: selected.zip,
    checkedAt,
    url: gafRoofShingle.listing,
  });
  const row = supplyRows(priced)[0];
  assert.equal(row.purchaseUnit, "shingle bundle");
  assert.equal(row.total, 20);
  assert.match(
    homeDepotShoppingList(priced).text,
    /2 shingle bundles.*#314168668/,
  );
  assert.match(
    guideMarkdown(priced),
    /2 field-shingle bundles estimated · 2 on the shopping list/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(priced))).projectCode,
    priced.projectCode,
  );
  const legacy = projectSchema.parse({ ...project, schemaVersion: 52 });
  assert.equal(legacy.projectCode, undefined);
  assert.deepEqual(legacy.pieces, project.pieces);
});

test("roof edge estimates group the right runs and reserve one cap per independent hip or ridge", () => {
  const { project, deck, plan } = fixture();
  const edge = (
    kind: ShingleRoofEdge["kind"],
    length: number,
    extra: number | null,
  ): ShingleRoofEdge => ({
    id: uid(),
    label: `South ${kind}`,
    kind,
    length,
    extra,
  });
  plan.edges = [
    edge("eave", 1416, 12),
    edge("rake", 12, null),
    edge("hip", 48, 0),
    edge("ridge", 240, 0),
  ];
  const review = () => reviewShingleRoof(project, plan).edges;
  assert.deepEqual(
    review().map(({ kind, estimated }) => [kind, estimated]),
    [
      ["starter", null],
      ["cap", 2],
    ],
  );
  assert.equal(review()[1].capPieces, 46);
  assert.match(review()[0].pending, /Enter each run length/);
  plan.edges[1].extra = 0;
  assert.deepEqual(
    review().map(({ total, estimated }) => [total, estimated]),
    [
      [1440, 1],
      [288, 2],
    ],
  );
  plan.edges[1].extra = 1;
  assert.equal(review()[0].estimated, 2);
  deck.rotation = [Math.atan(1.5 / 12), 0, 0];
  assert.deepEqual(
    review().map(({ estimated }) => estimated),
    [null, null],
  );
  deck.rotation = [Math.atan(3 / 12), 0, 0];
  plan.productId = null;
  assert.match(review()[0].pending, /Choose the compatible field shingle/);
  plan.productId = gafRoofShingle.id;
  plan.coveragePerBundle = null;
  const saved = saveProjectCode(project, roofContext(plan));
  assert.equal(reviewShingleRoof(saved, plan).bundles, null);
  assert.throws(
    () =>
      saveProjectCode(
        project,
        roofContext({ ...plan, edges: [plan.edges![0], plan.edges![0]] }),
      ),
    /Retain distinct roof edges/,
  );
  const existing = addSupply(saved, shingleEdgeProducts.starter.id, 1);
  const starter = addMissingRoofEdgeBundles(existing, "starter");
  const ordered = addMissingRoofEdgeBundles(starter, "cap");
  assert.equal(starter.supplies.at(-1)?.quantity, 1);
  assert.equal(addMissingRoofEdgeBundles(ordered, "starter"), ordered);
  assert.equal(addMissingRoofEdgeBundles(ordered, "cap"), ordered);
  assert.deepEqual(ordered.pieces, saved.pieces);
  assert.match(
    homeDepotShoppingList(ordered).text,
    /2 starter bundles.*#202052408/,
  );
  assert.match(
    homeDepotShoppingList(ordered).text,
    /2 cap bundles.*#206593176/,
  );
  assert.match(
    guideMarkdown(ordered),
    /South ridge · Ridge · 20 ft · 0 in cut allowance/,
  );
  assert.match(
    guideMarkdown(ordered),
    /46 cap pieces including one starter per run/,
  );

  const priced = recordSupplyInventory(ordered, {
    productId: shingleEdgeProducts.cap.id,
    retailer: "home-depot",
    retailerProductId: shingleEdgeProducts.cap.internetNumber,
    price: 10,
    available: 2,
    store: ordered.store,
    zip: ordered.zip,
    checkedAt: new Date(Date.now() - 1000).toISOString(),
    url: shingleEdgeProducts.cap.listing,
  });
  assert.equal(
    supplyRows(priced).find(
      (row) => row.productId === shingleEdgeProducts.cap.id,
    )?.total,
    20,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(priced))).projectCode,
    priced.projectCode,
  );
  const old = projectSchema.parse({
    ...saved,
    schemaVersion: 53,
    projectCode: roofContext({ ...plan, edges: undefined }),
  });
  assert.equal(old.projectCode?.shingleRoof?.edges, undefined);
  assert.deepEqual(old.projectCode?.shingleRoof?.planes, plan.planes);
});
