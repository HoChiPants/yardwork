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
import { rotate } from "../src/spatial";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { previewRoofDeckBlocking, previewRoofDeckBlockingPlan, roofDeckBlockingBays } from "../src/roofDeckBlocking";
import { inspectCutStock } from "../src/cutStock";
import { orientedStockSize } from "../src/stockAxes";
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

test("roof deck spacing measures facing edges in the roof plane and screens only selected rectangular panels", () => {
  const { project, deck, plan } = fixture();
  deck.rotation = [Math.atan(3 / 12), 0.45, 0];
  const neighbor = part("Adjacent deck", "plywood", [96, 0.75, 48], [0, 48, 0], deck.stepId, "Roof");
  neighbor.rotation = [...deck.rotation];
  project.pieces.push(neighbor);
  plan.planes.push({ id: uid(), label: "Adjacent roof", basis: { kind: "panel", pieceId: neighbor.id }, underlayment: "single" });
  const locate = (x: number, normalOffset: number, z: number) => {
    const offset = rotate([x, normalOffset, z], deck.rotation);
    neighbor.position = [deck.position[0] + offset[0], deck.position[1] + offset[1], deck.position[2] + offset[2]];
  };
  const review = () => reviewShingleRoof(project, plan).deckSpacing;
  for (const [gap, state] of [[0.125, "match"], [0, "tight"], [0.25, "wide"], [-0.0625, "overlap"]] as const) {
    locate(96 + gap, 0, 12);
    const { joints } = review();
    assert.equal(joints.length, 1);
    assert.equal(joints[0].state, state);
    assert.ok(Math.abs(joints[0].gap - gap) < 1e-7);
    assert.ok(Math.abs(joints[0].length - 36) < 1e-7);
  }
  locate(96.0625, 0, 12);
  const saved = saveProjectCode(project, roofContext(plan));
  assert.equal(validate(saved).find((finding) => finding.area?.kind === "roof-deck-joint")?.severity, "warning");
  assert.match(guideMarkdown(saved), /Roof deck joint · P001 and P002 · 0\.0625 in gap along 3 ft/);
  locate(96.125, 0.25, 12);
  assert.deepEqual(review().joints, []);
  locate(96.125, 0, 48);
  assert.deepEqual(review().joints, []);
  locate(96.125, 0, 12);
  neighbor.rectangularOpenings = [{ axis: 1, center: [0, 0], spans: [12, 12] }];
  assert.deepEqual(review().skipped, ["Adjacent roof"]);
  assert.deepEqual(review().joints, []);
});

test("roof deck framing reaches only the fastener lines seated over retained wood", () => {
  const { project, deck, plan } = fixture();
  deck.rotation = [Math.atan(3 / 12), 0.45, 0];
  const world = (x: number, y: number, z: number) => {
    const [dx, dy, dz] = rotate([x, y, z], deck.rotation);
    return [deck.position[0] + dx, deck.position[1] + dy, deck.position[2] + dz] as typeof deck.position;
  };
  const neighbor = part("Adjacent deck", "plywood", [96, 0.75, 48], world(96.125, 0, 0), deck.stepId, "Roof");
  const framing = part("Short bearing", "stud", [1.5, 3.5, 30], world(48.0625, -2.125, -9), deck.stepId, "Roof");
  const floating = part("Below the deck", "stud", [1.5, 3.5, 18], world(48.0625, -2.145, 15), deck.stepId, "Roof");
  neighbor.rotation = framing.rotation = floating.rotation = [...deck.rotation];
  project.pieces.push(neighbor, framing, floating);
  plan.planes.push({ id: uid(), label: "Adjacent roof", basis: { kind: "panel", pieceId: neighbor.id }, underlayment: "single" });
  const review = () => reviewShingleRoof(project, plan).deckSpacing.joints[0];
  const gapLengths = () => review().backing?.map(({ gaps }) => gaps.map(({ length }) => Number(length.toFixed(4))));
  assert.deepEqual(gapLengths(), [[18], [18]]);
  const saved = saveProjectCode(project, roofContext(plan));
  assert.equal(validate(saved).find((finding) => finding.area?.kind === "roof-deck-joint")?.area?.lines?.length, 2);
  assert.match(guideMarkdown(saved), /P002 has 18 in of 4 ft without modeled framing under its fastener line/);
  framing.position = world(48.875, -2.125, 0);
  framing.size[2] = 48;
  assert.deepEqual(gapLengths(), [[48], []]);
  framing.position = world(48.0625, -2.125, 0);
  assert.deepEqual(gapLengths(), [[], []]);
});

test("fit an on-hand 2 × 4 between pitched rafters and keep the cut and remainder", () => {
  const { project, deck, plan } = fixture();
  const world = (x: number, y: number, z: number) => {
    const [a, b, c] = rotate([x, y, z], deck.rotation);
    return [a, b + 48, c] as typeof deck.position;
  };
  const make = (name: string, stock: "plywood" | "stud", size: typeof deck.size, at: typeof deck.position) => {
    const piece = part(name, stock, size, world(...at), deck.stepId, "Roof");
    piece.rotation = [...deck.rotation];
    return piece;
  };
  const adjacent = make("Upper deck", "plywood", [96, 0.75, 48], [0, 0, 48.125]);
  project.pieces.push(adjacent, ...[-24, 0, 24].map((x) => make(`Rafter ${x}`, "stud", [1.5, 3.5, 96], [x, -2.125, 24])));
  plan.planes.push({ id: uid(), label: "Upper roof", basis: { kind: "panel", pieceId: adjacent.id }, underlayment: "single" });
  const saved = addMeasuredOffcut(saveProjectCode(project, roofContext(plan)), deck.stepId, "stud", [28, 3.5, 1.5], "Roof scrap");
  const [joint] = reviewShingleRoof(saved, plan).deckSpacing.joints;
  const bays = roofDeckBlockingBays(saved, joint.id);
  assert.equal(bays.length, 2);
  const fit = previewRoofDeckBlocking(saved, joint.id, bays[0].id, "stud", true);
  assert.ok(Math.abs(fit.cutLength - 22.5) < 1e-7);
  assert.equal(fit.source?.id, saved.pieces.at(-1)?.id);
  assert.deepEqual(fit.reduction.map((length) => Number(length.toFixed(4))), [22.5, 22.5]);
  assert.match(guideMarkdown(fit.project), /Roof deck blocking[\s\S]+Crosscut to 22\.5 in/);
  assert.equal(roofDeckBlockingBays(fit.project, joint.id).length, 1);
  assert.equal(fit.project.pieces.length, saved.pieces.length + 1);
  assert.deepEqual(fit.offcuts.map((piece) => orientedStockSize(piece)[2]), [5.375]);
  const fresh = previewRoofDeckBlocking(saved, joint.id, bays[0].id, "stud", false);
  assert.equal(fresh.source, null);
  assert.match(guideMarkdown(fresh.project), /Roof deck blocking[\s\S]+Crosscut to 22\.5 in/);

  const bayIds = bays.map(({ id }) => id);
  const longScrap = addMeasuredOffcut(saveProjectCode(project, roofContext(plan)), deck.stepId, "stud", [60, 3.5, 1.5], "Long roof scrap");
  const fromScrap = previewRoofDeckBlockingPlan(longScrap, joint.id, bayIds, "stud", true);
  assert.equal(fromScrap.newBoards, 0);
  assert.equal(fromScrap.onHandOffcuts, 1);
  assert.equal(fromScrap.fits[1].fromPlan, true);
  assert.equal(roofDeckBlockingBays(fromScrap.project, joint.id).length, 0);
  assert.deepEqual(fromScrap.offcuts.map((piece) => orientedStockSize(piece)[2]), [14.75]);

  const fromNew = previewRoofDeckBlockingPlan(longScrap, joint.id, bayIds, "stud", false);
  assert.equal(fromNew.newBoards, 1);
  assert.equal(fromNew.onHandOffcuts, 0);
  assert.equal(fromNew.fits[1].fromPlan, true);
  const [sourceId, otherSource] = fromNew.fits.map(({ block }) => block.cutStock?.id);
  assert.ok(sourceId && sourceId === otherSource);
  assert.ok(inspectCutStock(fromNew.project).valid.has(sourceId));
  assert.deepEqual(fromNew.offcuts.map((piece) => orientedStockSize(piece)[2]), [50.75]);
  assert.equal(fromNew.project.history.filter(({ offcutCut }) => offcutCut?.sourceId === sourceId).length, 2);
  assert.ok(fromNew.project.pieces.some(({ id }) => id === longScrap.pieces.at(-1)!.id));

  const obstruction = make("Existing brace", "stud", [1.5, 1.5, 24], [12, -2, 24.0625]);
  const blocked = previewRoofDeckBlockingPlan({ ...longScrap, pieces: [...longScrap.pieces, obstruction] }, joint.id, bayIds, "stud", true);
  assert.equal(blocked.fits.length, 1);
  assert.equal(blocked.skipped.length, 1);
  assert.match(blocked.skipped[0].reason, /overlap|obstruct|collid/i);
  assert.equal(blocked.onHandOffcuts, 1);
  assert.deepEqual(blocked.offcuts.map((piece) => orientedStockSize(piece)[2]), [37.375]);
});

test("roof deck ends check bearing and inset backing independently on a single pitched panel", () => {
  const { project, deck, plan } = fixture();
  deck.rotation = [Math.atan(4 / 12), 0.41, 0];
  const world = (position: typeof deck.position) => {
    const [x, y, z] = rotate(position, deck.rotation);
    return [x, y + 48, z] as typeof deck.position;
  };
  const partial = part("End framing", "stud", [1.5, 3.5, 32], world([-48.625, -2.125, -8]), deck.stepId, "Roof", deck.rotation);
  const insetOnly = part("Inside the edge", "stud", [1.5, 3.5, 48], world([47.125, -2.125, 0]), deck.stepId, "Roof", deck.rotation);
  project.pieces.push(partial, insetOnly);
  const saved = saveProjectCode(project, roofContext(plan));
  const review = () => reviewShingleRoof(saved, plan).deckSpacing;
  const gaps = () => review().ends.map(({ bearingGaps, fastenerGaps }) =>
    [bearingGaps, fastenerGaps].map((runs) => runs.map(({ length }) => Number(length.toFixed(4)))),
  );
  assert.deepEqual(review().joints, []);
  assert.deepEqual(gaps(), [[[16], [48]], [[48], []]]);
  assert.ok(review().ends.every(({ assumedAxis }) => assumedAxis));
  const endChecks = () => validate(saved).filter(({ area }) => area?.kind === "roof-deck-end");
  assert.equal(endChecks()[0].area?.lines?.length, 2);
  assert.match(guideMarkdown(saved), /Roof deck end · P001 · end 1 · 16 in of 4 ft at the end edge lacks modeled bearing/);
  partial.position = world([-48, -2.125, 0]);
  partial.size[2] = 48;
  assert.deepEqual(gaps()[0], [[], []]);
  assert.equal(endChecks().find(({ id }) => id === review().ends[0].id)?.severity, "info");
  insetOnly.position = world([48, -2.145, 0]);
  assert.deepEqual(gaps()[1], [[48], [48]]);
  deck.size[0] = 48;
  assert.deepEqual(review().ambiguousEnds, [deck.id]);
  assert.deepEqual(review().ends, []);
  deck.stockLengthAxis = 2;
  assert.deepEqual(review().ambiguousEnds, []);
  assert.equal(review().ends.length, 2);
  assert.ok(review().ends.every(({ assumedAxis }) => !assumedAxis));
});

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
