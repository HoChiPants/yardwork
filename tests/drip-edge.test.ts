import assert from "node:assert/strict";
import test from "node:test";
import {
  gibraltarDripEdge as stock,
  wissSnips,
} from "../src/dripEdgeReference";
import { guideMarkdown } from "../src/engine";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, projectSchema, uid } from "../src/model";
import { reviewProjectCode, saveProjectCode } from "../src/projectCode";
import { blankProjectCode } from "../src/projectCodeSchema";
import { addMissingDripEdge, reviewShingleRoof } from "../src/shingleRoof";
import type { ShingleRoof } from "../src/shingleRoofSchema";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { selectedToolsForProject } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";

function fixture() {
  const roof: ShingleRoof = {
    productId: null,
    coveragePerBundle: null,
    wastePercent: null,
    coverageBasis: "",
    planes: [
      {
        id: uid(),
        label: "Test roof",
        underlayment: "single",
        basis: { kind: "field", run: 48, rise: 12, width: 96 },
      },
    ],
    edges: [
      {
        id: uid(),
        label: "West eave",
        kind: "eave",
        length: 130,
        extra: null,
        dripEdgeExtra: 2,
      },
      {
        id: uid(),
        label: "South rake",
        kind: "rake",
        length: 48,
        extra: null,
        dripEdgeExtra: 0,
      },
      { id: uid(), label: "Ridge", kind: "ridge", length: 120, extra: null },
    ],
    dripEdge: {
      productId: stock.id,
      lap: 2,
      deckReach: 2,
      belowSheathing: 0.25,
      fastenerSpacing: 12,
      eaveUnderlayment: "over",
      rakeUnderlayment: "under",
    },
  };
  const context = {
    ...blankProjectCode(),
    region: "utah" as const,
    codePath: "irc" as const,
    work: "new" as const,
    projectDate: "2026-11-20",
    trades: ["roofing" as const],
    buildingAuthority: "Synthetic authority",
    authorityBasis: "Synthetic measurements for testing",
    shingleRoof: roof,
  };
  return { project: { ...blank("Test roof"), store: "4409" }, roof, context };
}

test("lap dimensions round-trip and the purchase credits reused drip edge offcuts and existing stock", () => {
  const { project, roof, context } = fixture();
  const saved = saveProjectCode(project, context);
  const review = reviewShingleRoof(saved, roof).dripEdge!;
  assert.equal(review.sticks, 2);
  assert.deepEqual(
    review.layouts.map(({ full, cuts }) => [full, cuts]),
    [
      [0, [67, 67]],
      [0, [48]],
    ],
  );
  assert.deepEqual(
    review.cuts.map(({ usedLength }) => usedLength),
    [115, 67],
  );
  for (const length of [120, 121, 238, 239, 356, 957.625]) {
    roof.edges![0].length = length;
    roof.edges![0].dripEdgeExtra = 0;
    const first = reviewShingleRoof(saved, roof).dripEdge!.layouts[0];
    const segments = first.full + first.cuts.length;
    assert.ok(
      Math.abs(
        first.full * 120 +
          first.cuts.reduce((sum, cut) => sum + cut, 0) -
          (segments - 1) * 2 -
          length,
      ) < 1e-7,
    );
    assert.ok(first.cuts.every((cut) => cut <= 120));
  }
  const selected = addMissingDripEdge(addSupply(saved, stock.id, 1));
  assert.equal(selected.supplies.length, 2);
  assert.equal(addMissingDripEdge(selected), selected);
  assert.deepEqual(selected.pieces, project.pieces);
  const priced = recordSupplyInventory(selected, {
    productId: stock.id,
    retailer: "home-depot",
    retailerProductId: stock.internetNumber,
    price: 12.5,
    available: 3,
    store: selected.store,
    zip: selected.zip,
    checkedAt: new Date(Date.now() - 1000).toISOString(),
    url: stock.listing,
  });
  assert.equal(supplyRows(priced)[0].total, 25);
  assert.match(
    homeDepotShoppingList(priced).text,
    /2 10 ft drip edge sticks.*#202092840/,
  );
  assert.match(
    guideMarkdown(priced),
    /West eave · piece 1 67 in \+ South rake · piece 1 4 ft · 5 in left/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(priced))).projectCode,
    priced.projectCode,
  );
  const prior = projectSchema.parse({
    ...saved,
    schemaVersion: 54,
    projectCode: {
      ...context,
      shingleRoof: { ...roof, edges: [], dripEdge: undefined },
    },
  });
  assert.equal(prior.projectCode?.shingleRoof?.dripEdge, undefined);
});

test("shallow slopes and unsupported laps prevent takeoff independently of the dated code comparisons", () => {
  const { project, roof, context } = fixture();
  const area = roof.planes[0].basis;
  assert.equal(area.kind, "field");
  area.rise = 10;
  const review = () => reviewShingleRoof(project, roof).dripEdge!;
  const rows = () =>
    reviewProjectCode(context, project).rows.filter(({ id }) =>
      id.startsWith("drip-edge-"),
    );
  assert.match(review().pending, /3:12 or steeper/);
  assert.equal(
    rows().find(({ id }) => id === "drip-edge-spacing")?.state,
    "measured-match",
  );
  area.rise = 12;
  roof.dripEdge!.lap = 1;
  roof.dripEdge!.rakeUnderlayment = "over";
  roof.dripEdge!.belowSheathing = 0.125;
  roof.dripEdge!.deckReach = null;
  roof.dripEdge!.fastenerSpacing = 13;
  assert.match(review().pending, /2–3 in splice overlap/);
  assert.equal(
    addMissingDripEdge(saveProjectCode(project, context)).supplies.length,
    0,
  );
  const byId = Object.fromEntries(rows().map(({ id, state }) => [id, state]));
  assert.equal(byId["drip-edge-lap"], "discrepancy");
  assert.equal(byId["drip-edge-drop"], "discrepancy");
  assert.equal(byId["drip-edge-reach"], "needs-input");
  assert.equal(byId["drip-edge-spacing"], "discrepancy");
  assert.equal(byId["drip-edge-rake"], "discrepancy");
  assert.equal(byId["drip-edge-eave"], "recorded-condition");
  for (const patch of [
    { projectDate: "2026-11-21" },
    { codePath: "ibc" as const },
  ]) {
    assert.deepEqual(
      reviewProjectCode({ ...context, ...patch }, project)
        .rows.filter(({ id }) => id.startsWith("drip-edge-"))
        .map(({ state }) => state),
      ["authority-review"],
    );
  }
  roof.dripEdge!.lap = 2;
  roof.edges![0].dripEdgeExtra = null;
  assert.match(review().pending, /Enter each eave and rake length/);
});

test("an exact reviewed aviation snip supports flashing cuts without satisfying metal rod or hinge cuts", () => {
  const { project, context } = fixture();
  const saved = saveProjectCode(project, context);
  const now = Date.parse("2026-11-20T12:00:00Z");
  const selected = {
    ...saved,
    toolSelections: [
      { productId: wissSnips.id, checkedAt: new Date(now).toISOString() },
    ],
  };
  const tools = selectedToolsForProject(selected, now).tools;
  assert.deepEqual(tools[0].capabilities, ["cut-flashing"]);
  const row = toolChecklist(selected, tools, now).requirements.find(
    (item) => item.capability === "cut-flashing",
  );
  assert.equal(row?.status, "supported");
  assert.deepEqual(row.supportedBy[0].evidenceUrls, [wissSnips.specification]);
  assert.match(
    guideMarkdown(addSupply(saved, wissSnips.id, 1)),
    /Aviation snips/i,
  );
});
