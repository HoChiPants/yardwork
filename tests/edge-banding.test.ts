import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import {
  addMissingEdgeBanding,
  bandingKey,
  bandingStatus,
  edgeBandingEdges,
  removeEdgeBanding,
  reviewEdgeBanding,
  saveEdgeBanding,
} from "../src/edgeBanding";
import { bom, guideMarkdown } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import {
  addHomeDepotPurchaseNeed,
  homeDepotPurchaseNeeds,
} from "../src/handoffPurchases";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, part, projectSchema } from "../src/model";
import { addSupply, recordSupplyInventory } from "../src/supplies";
import { selectedToolsForProject } from "../src/toolGuide";
import { edgeTrimmer } from "../src/edgeBandingReference";
import { toolChecklist } from "../src/tools";

const narrow = "edgemate-5032270",
  wide = "pureedge-902028";

test("the three interior studies turn clear front edges into labeled roll cuts without changing plywood or fasteners", () => {
  for (const [family, count, rolls] of [
    ["storage-banquette", 6, 1],
    ["shelves", 7, 2],
    ["closet-insert", 10, 2],
  ] as const) {
    const { project: initial } = createBuildStudy(family);
    const project = generateBuildGuide(initial);
    const edges = edgeBandingEdges(project);
    const clearFronts = edges.filter(
      (edge) =>
        edge.normal[2] > 0.9999 && bandingStatus(edge, narrow, 0.5) === "ready",
    );
    assert.equal(clearFronts.length, count, family);
    const plan = saveEdgeBanding(
      project,
      new Set(clearFronts.map(bandingKey)),
      narrow,
      0.5,
    );
    assert.equal(guideIsCurrent(plan), false);
    const regenerated = generateBuildGuide(plan);
    const reopened = projectSchema.parse(
      JSON.parse(JSON.stringify(regenerated)),
    );
    assert.equal(guideIsCurrent(reopened), true);
    assert.deepEqual(
      reopened.pieces.map(({ id, size }) => ({ id, size })),
      project.pieces.map(({ id, size }) => ({ id, size })),
    );
    assert.deepEqual(bom(reopened), bom(project));
    assert.deepEqual(reopened.joints, project.joints);
    const [review] = reviewEdgeBanding(reopened);
    assert.equal(review.required, rolls, family);
    assert.equal(review.rolls.flatMap(({ runs }) => runs).length, count);
    assert.equal(
      review.rolls
        .flatMap(({ runs }) => runs)
        .every(({ length, edge }) => length === edge.length + 0.5),
      true,
    );
    assert.match(
      guideMarkdown(reopened),
      /## Panel edge banding[\s\S]*314095455[\s\S]*Roll 1 .* left/,
    );
    assert.match(reopened.steps[0].notes, /edge-banding cut order/);
    assert.deepEqual(reopened.supplies, []);
    assert.ok(
      toolChecklist(reopened).requirements.some(
        ({ capability }) => capability === "trim-edge-banding",
      ),
    );
  }
});

test("edge planning measures retained rectangular faces, catches adjacent wood, and checks each roll width and length", () => {
  const project = blank("Thick panel edge");
  const sheet = part(
    "Thick panel",
    "plywood",
    [30, 1, 14],
    [0, 10, 0],
    project.steps[0].id,
    "Fixture",
  );
  const blocker = part(
    "Front rail",
    "one-two",
    [6, 1, 1],
    [0, 10, 7.5],
    project.steps[0].id,
    "Fixture",
  );
  sheet.cutPlanes = [
    { normal: [Math.SQRT1_2, 0, Math.SQRT1_2], constant: 17 * Math.SQRT1_2 },
  ];
  project.pieces = [sheet];
  const front = edgeBandingEdges(project).find(({ face }) => face === "+Z")!;
  assert.ok(Math.abs(front.length - 25) < 1e-6);
  const key = bandingKey(front);
  assert.equal(bandingStatus(front, narrow, 0.5), "narrow");
  assert.equal(bandingStatus(front, wide, 72), "long");
  assert.throws(
    () => saveEdgeBanding(project, new Set([key]), narrow, 0.5),
    /narrower/,
  );
  const planned = saveEdgeBanding(project, new Set([key]), wide, 0.5);
  const blocked = { ...planned, pieces: [...planned.pieces, blocker] };
  const [review] = reviewEdgeBanding(blocked);
  assert.equal(review.rows[0].state, "covered");
  assert.equal(review.rows[0].edge?.coveredBy, "Front rail");
  assert.equal(review.required, null);
  assert.throws(
    () => addMissingEdgeBanding(blocked, wide),
    /changed or covered/,
  );
  const changed = structuredClone(planned);
  changed.pieces[0].size[0] = 24;
  assert.equal(reviewEdgeBanding(changed)[0].rows[0].state, "changed");
  assert.equal(
    reviewEdgeBanding({ ...planned, pieces: [] })[0].rows[0].state,
    "missing",
  );
  assert.equal(removeEdgeBanding(changed, key).edgeBanding, undefined);

  const rectangular = { ...sheet, cutPlanes: [] };
  const withOpening = {
    ...rectangular,
    rectangularOpenings: [
      {
        axis: 1 as const,
        center: [0, 0] as [number, number],
        spans: [2, 2] as [number, number],
      },
    ],
  };
  assert.equal(
    edgeBandingEdges({ ...project, pieces: [withOpening] }).length,
    4,
  );
  withOpening.rectangularOpenings[0].center = [6.75, 0];
  assert.ok(
    !edgeBandingEdges({ ...project, pieces: [withOpening] }).some(
      ({ face }) => face === "+Z",
    ),
  );
});

test("exact veneer rolls use Home Depot snapshots and shopping handoff without double counting", () => {
  const { project } = createBuildStudy("closet-insert");
  const fronts = edgeBandingEdges(project).filter(
    (edge) => edge.normal[2] > 0.9999,
  );
  const plan = saveEdgeBanding(
    project,
    new Set(fronts.map(bandingKey)),
    narrow,
    0.5,
  );
  assert.equal(
    homeDepotPurchaseNeeds(plan).find(({ id }) => id === narrow)?.missing,
    2,
  );
  const listed = addHomeDepotPurchaseNeed(plan, narrow);
  assert.equal(addMissingEdgeBanding(listed, narrow), listed);
  const snapshot = {
    productId: narrow,
    retailer: "home-depot",
    retailerProductId: "314095455",
    url: "https://www.homedepot.com/p/314095455",
    store: "synthetic-test-store",
    zip: listed.zip,
    price: 10,
    available: 1,
    checkedAt: new Date().toISOString(),
  };
  assert.throws(
    () =>
      recordSupplyInventory(listed, {
        ...snapshot,
        retailerProductId: "323974629",
        url: "https://www.homedepot.com/p/323974629",
      }),
    /exact|reviewed/i,
  );
  const observed = recordSupplyInventory(
    { ...listed, store: snapshot.store },
    snapshot,
  );
  const item = homeDepotShoppingList(observed).items.find(
    ({ productId }) => productId === "314095455",
  );
  assert.deepEqual([item?.quantity, item?.snapshot?.available], [2, 1]);
  assert.equal(
    homeDepotPurchaseNeeds(observed).find(({ id }) => id === narrow),
    undefined,
  );
  const tools = addSupply(observed, edgeTrimmer.id, 1);
  const trimmer = homeDepotShoppingList(tools).items.find(({ productId }) => productId === edgeTrimmer.internetNumber);
  assert.deepEqual([trimmer?.quantity, trimmer?.isTool], [1, true]);
  const checked = { ...tools, toolSelections: [{ productId: edgeTrimmer.id, checkedAt: snapshot.checkedAt }] };
  const checklist = toolChecklist(checked, selectedToolsForProject(checked).tools);
  assert.equal(checklist.requirements.find(({ capability }) => capability === "trim-edge-banding")?.status, "supported");
  assert.equal(checklist.requirements.find(({ capability }) => capability === "apply-edge-banding")?.status, "unknown");
});
