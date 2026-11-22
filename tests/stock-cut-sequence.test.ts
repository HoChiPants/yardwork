import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildFixtureIds,
  createBuildFixture,
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { resizeByCuts } from "../src/cutPlan";
import { bom, cutPiece, guideMarkdown, projectPricingCoverage, shoppingCsv } from "../src/engine";
import {
  applyCommand,
  blank,
  material,
  part,
  projectSchema,
  step,
  uid,
  type MaterialId,
  type V3,
} from "../src/model";
import { stockCutSequences } from "../src/stockCutSequence";
import { planBoardCutGroups, planDedicatedBoardCuts, planStockCutLayouts, recordStockCutLayout, recordStockCutLayouts } from "../src/recordStockCutLayout";
import { inspectCutStock, pieceCutKerf, setCutSourceOnHand, setPlannedWoodKerf } from "../src/cutStock";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { reviewedOfferForMaterial } from "../src/retailerCatalog";
import { cutStockLayout } from "../src/cutStockLayout";
import { owensCorningWallBatt } from "../src/saunaWallReference";
import { saunaWallCoverage } from "../src/saunaWallCoverage";
import { stockAxes } from "../src/stockAxes";
import { toolChecklist } from "../src/tools";
import { addMeasuredOffcut } from "../src/measuredOffcuts";
import { assignOffcutToPart, boardBlankAtLength, fittingBoardOffcuts, fittingOffcuts } from "../src/offcutAssignment";
import { materialFamilyVariants } from "../src/materialGroups";
import { cutSourceRegion } from "../src/cutSourceAxes";
import { partLabel } from "../src/partLabels";
import { planOffcutReuse } from "../src/offcutReusePlan";
import { offcutCutRows } from "../src/offcutCutGuide";
import { planOffcutRelease } from "../src/offcutReleasePlan";
import { generateBuildGuide } from "../src/guide";
import { makeLabeledCutPreview } from "../src/CutStudio";
import { drywallStock } from "../src/drywallReference";

function cutProject(material: MaterialId, ...sizes: V3[]) {
  const project = blank("Cut sequence");
  project.pieces = sizes.map((size, i) =>
    part(
      `Blank ${i + 1}`,
      material,
      size,
      [i * 100, 0, 0],
      project.steps[0].id,
      "Test",
    ),
  );
  return project;
}

test("a drywall score-and-snap offcut supplies the second strip from one purchased sheet", () => {
  const stock = drywallStock[0];
  const project = cutProject(stock.id, [48, 0.5, 96], [24, 0.5, 96]);
  const [sheet, target] = project.pieces;
  assert.equal(bom(project)[0].quantity, 2);
  assert.throws(() => cutPiece(project, sheet.id, 0.25, 1), /sheet thickness stays fixed/);
  const preview = makeLabeledCutPreview(project, sheet.id, 96, 24);
  const scrap = preview.project.pieces.find(({ offcut }) => offcut)!;
  assert.deepEqual(scrap.size, [24, 0.5, 96]);
  assert.equal(pieceCutKerf(scrap), 0);

  const reuse = planOffcutReuse(preview.project, preview.offcutIds);
  assert.equal(reuse.assignments[0].partId, target.id);
  assert.equal(bom(reuse.project)[0].quantity, 1);
  assert.equal(reuse.project.pieces.length, 2);
  assert.ok(inspectCutStock(reuse.project).valid.has(scrap.cutStock!.id));
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(reuse.project)));
  assert.match(guideMarkdown(reopened), /Score and snap width to 2 ft/i);
  assert.equal(homeDepotShoppingList(reopened).items.find(({ productId }) => productId === stock.internet)?.quantity, 1);
  const { requirements } = toolChecklist(reopened);
  assert.ok(requirements.some(({ capability }) => capability === "score-drywall"));
  assert.ok(!requirements.some(({ capability }) => capability === "plastic-cut"));
});

test("proposed drywall layouts use score-and-snap coordinates and reject a changed thickness", () => {
  const stock = drywallStock[1];
  const project = cutProject(stock.id, [48, 0.5, 72], [48, 0.5, 72]);
  const rows = bom(project);
  assert.equal(rows[0].quantity, 1);
  const [sequence] = stockCutSequences(project, rows).get(stock.id)!;
  assert.equal(sequence.review, undefined);
  assert.match(sequence.steps[0], /Score and snap Strip 1 at 6 ft/);
  const { project: recorded } = planStockCutLayouts(project, [sequence.layout]);
  const source = recorded.pieces[0].cutStock!;
  assert.ok(inspectCutStock(recorded).valid.has(source.id));
  const corrupted = structuredClone(recorded);
  corrupted.pieces[0].size[1] = 0.45;
  assert.match(inspectCutStock(corrupted).invalid[0].detail, /full panel thickness/);
  assert.throws(() => addMeasuredOffcut(project, project.steps[0].id, stock.id, [30, 10, 0.45]), /exact drywall thickness/);
});

test("a dedicated finished-board cut preserves other blanks and the measured blade allowance", () => {
  const project = setPlannedWoodKerf(cutProject("stud", [1.5, 24, 3.5], [1.5, 48, 3.5]), "stud", 0.09375);
  const [other, target] = project.pieces;
  const planned = planDedicatedBoardCuts(project, [target.id]);
  const [plan] = planned.plannedCutSources!;
  const [unchanged, kept, offcut] = planned.pieces;

  assert.deepEqual(unchanged, other);
  assert.deepEqual(kept.position, target.position);
  assert.equal(kept.cutStock!.id, plan.sourceId);
  assert.equal(pieceCutKerf(kept), 0.09375);
  assert.equal(offcut.cutStock!.id, plan.sourceId);
  assert.equal(cutSourceRegion(offcut).size[2], 47.90625);
  assert.equal(bom(project).find(({ id }) => id === "stud")?.quantity, 1);
  assert.equal(bom(planned).find(({ id }) => id === "stud")?.quantity, 2);
  const guide = guideMarkdown(planned);
  assert.match(guide, /^1\. Crosscut 4 ft from the current end for P002/m);
  assert.match(guide, /## Planned stock cuts[\s\S]+Blade allowance · 0.09375 in per cut\./);
  assert.throws(() => planDedicatedBoardCuts(planned, [target.id]), /unassigned board/);
});

test("board placement prefers verified on-hand family stock and preserves its actual grain axis", () => {
  const project = cutProject("stud-12", [1.5, 144, 3.5]);
  const cut = cutPiece(project, project.pieces[0].id, 72, 1);
  const stepId = project.steps[0].id;
  const withScrap = addMeasuredOffcut(cut, stepId, "stud-10", [80, 3.5, 1.5], "Stored remnant");
  const withTreated = addMeasuredOffcut(withScrap, stepId, "hd-treated-2x4-8", [50, 3.5, 1.5]);
  const family = materialFamilyVariants("stud");
  const [chosen] = fittingBoardOffcuts(withTreated, family, 48, inspectCutStock(withTreated));
  assert.equal(chosen.piece.id, withScrap.pieces.at(-1)?.id);
  assert.equal(chosen.piece.material, "stud-10");
  assert.equal(chosen.onHand, true);
  assert.equal(fittingBoardOffcuts(cut, family, 48, inspectCutStock(cut))[0]?.stockLengthAxis, null);
  assert.deepEqual(fittingBoardOffcuts(cut, family, 71.8, inspectCutStock(cut)), []);

  const blank = boardBlankAtLength(chosen.piece.material, 2)!;
  assert.deepEqual(blank, { size: [1.5, 2, 3.5], stockLengthAxis: 1 });
  const target = { ...part("Short block", chosen.piece.material, blank.size, [18, 1, 0], stepId, "Test"),
    stockLengthAxis: blank.stockLengthAxis };
  const next = assignOffcutToPart({ ...withTreated, pieces: [...withTreated.pieces, target] }, target.id, chosen.piece.id);
  const placed = next.pieces.find(({ id }) => id === target.id)!;
  assert.equal(placed.cutStock?.id, chosen.piece.cutStock?.id);
  assert.equal(stockAxes(placed).length, 1);
  assert.equal(bom(next).find(({ id }) => id === "stud-10")?.quantity, 0);
});

test("a saved cut plan is pending even when its parent stock is owned, and a measured remnant takes priority", () => {
  const project = cutProject("stud", [1.5, 36, 3.5]);
  const [board] = stockCutSequences(project, bom(project)).get("stud")!;
  const { project: planned, sourceIds: [sourceId] } = planStockCutLayouts(project, [board.layout]);
  const owned = setCutSourceOnHand(planned, sourceId, true);
  const family = materialFamilyVariants("stud");
  const [expected] = fittingBoardOffcuts(owned, family, 48, inspectCutStock(owned));
  assert.equal(expected.onHand, true);
  assert.equal(expected.sourceCutPending, true);

  const stocked = addMeasuredOffcut(owned, project.steps[0].id, "stud", [64, 3.5, 1.5]);
  const [available, waiting] = fittingBoardOffcuts(stocked, family, 48, inspectCutStock(stocked));
  assert.equal(available.piece.id, stocked.pieces.at(-1)?.id);
  assert.equal(available.sourceCutPending, false);
  assert.equal(waiting.piece.id, expected.piece.id);
  assert.equal(waiting.sourceCutPending, true);
});

test("a shared board uses the factory end for an exact final length and rounds only whole feet", () => {
  const project = cutProject("stud", [1.5, 60, 3.5], [1.5, 35.875, 3.5]);
  const before = structuredClone(project);
  const [board] = stockCutSequences(project, bom(project)).get("stud")!;
  assert.deepEqual(board.steps, [
    "Crosscut 5 ft from the current end for P001 · Blank 1.",
    "Use the remaining 35.875 in for P002 · Blank 2.",
  ]);
  assert.deepEqual(board.remnants, []);
  assert.equal(board.review, undefined);
  assert.deepEqual(project, before);
});

test("a floor base can record a batch of ready stock units without repacking or changing the assembled parts", () => {
  const initial = applyCommand(blank("Exterior base"), {
    type: "foundation",
    width: 108,
    depth: 48,
    height: 48,
    spacing: 16,
    baseStock: { rim: "hd-treated-2x6-10", joist: "hd-treated-2x6-8" },
  });
  const stock = bom(initial);
  const cuts = stockCutSequences(initial, stock);
  const joists = cuts.get("hd-treated-2x6-8")!.map(({ layout }) => layout);
  const rims = cuts.get("hd-treated-2x6-10")!.map(({ layout }) => layout);
  assert.equal(joists.length, 4);
  assert.equal(rims.length, 2);
  const before = structuredClone(initial);
  const invalid = structuredClone(joists);
  invalid[1].kept[0].length += 1;
  assert.throws(() => recordStockCutLayouts(initial, invalid), /cut layout changed/);
  assert.throws(() => recordStockCutLayouts(initial, [joists[0], joists[0]]), /already has a source/);
  assert.deepEqual(initial, before);
  const marked = recordStockCutLayouts(initial, joists, true);
  const inspection = inspectCutStock(marked.project);
  assert.equal(marked.offcuts, 4);
  assert.deepEqual(new Set(marked.sourceIds), inspection.valid);
  assert.deepEqual(marked.project.onHandCutSources, marked.sourceIds);
  assert.deepEqual(marked.project.pieces.filter(({ offcut }) => offcut).map(({ size }) => size), Array.from({ length: 4 }, () => [1.5, 5.5, 5.75]));
  for (const id of marked.sourceIds) {
    const group = inspection.groups.get(id)!;
    assert.equal(group.filter(({ offcut }) => !offcut).length, 2);
    assert.equal(group.filter(({ offcut }) => offcut).length, 1);
  }
  assert.deepEqual(marked.project.pieces.filter(({ offcut }) => !offcut).map((piece) => ({ ...piece, cutStock: null })), initial.pieces);
  assert.deepEqual(stockCutSequences(marked.project, bom(marked.project)).get("hd-treated-2x6-10")!.map(({ layout }) => layout), rims);
  assert.deepEqual(homeDepotShoppingList(marked.project).items.map(({ productId, quantity }) => [productId, quantity]), [["206967800", 2]]);

  const recorded = recordStockCutLayouts(marked.project, rims);
  assert.deepEqual(recorded.project.onHandCutSources, marked.sourceIds);
  assert.equal(inspectCutStock(recorded.project).valid.size, 6);
  assert.equal(stockCutSequences(recorded.project, bom(recorded.project)).size, 0);
  assert.match(guideMarkdown(recorded.project), /Stock cut order for P\d+.*Crosscut 45 in/);
  assert.throws(() => recordStockCutLayouts(recorded.project, rims), /cut layout changed/);
  assert.deepEqual(initial, before);
});

test("a sheet is split into strips before ripping and trimming labeled blanks", () => {
  const project = cutProject(
    "plywood",
    [20, 0.75, 36],
    [16, 0.75, 30],
    [28, 0.75, 24],
  );
  project.pieces[2].stockLengthAxis = 2;
  const [sheet] = stockCutSequences(project, bom(project)).get("plywood")!;
  assert.deepEqual(
    sheet.partIds,
    project.pieces.map(({ id }) => id),
  );
  assert.deepEqual(sheet.steps, [
    "Crosscut Strip 1 at 3 ft from the current end of the sheet.",
    "Rip 20 in from the current edge of Strip 1 for P001 · Blank 1.",
    "Rip 16 in from the current edge of Strip 1 for P002 · Blank 2.",
    "Crosscut the P002 · Blank 2 blank to 30 in from its end.",
    "Crosscut Strip 2 at 2 ft from the current end of the sheet.",
    "Rip 28 in from the current edge of Strip 2 for P003 · Blank 3.",
  ]);
  assert.deepEqual(sheet.remnants, [
    "16 in × 5.875 in",
    "11.75 in × 3 ft",
    "19.875 in × 2 ft",
    "4 ft × 35.75 in",
  ]);
});

test("saved cut sources stay out of new stock schedules and thin edge trims require review", () => {
  const sheet = cutProject("plywood", [48, 0.75, 96]);
  const recorded = resizeByCuts(sheet, sheet.pieces[0].id, 60, 24);
  assert.equal(stockCutSequences(recorded, bom(recorded)).size, 0);
  assert.doesNotMatch(guideMarkdown(recorded), /## Stock cut order/);
  assert.match(guideMarkdown(recorded), /## Recorded offcuts/);

  const awkward = cutProject("stud", [1.5, 95.96, 3.5]);
  const [board] = stockCutSequences(awkward, bom(awkward)).get("stud")!;
  assert.deepEqual(board.partIds, [awkward.pieces[0].id]);
  assert.deepEqual(board.layout.kept, []);
  assert.match(board.review!, /only 0.04 in to the edge with a 0.125 in kerf/);
  const guide = guideMarkdown(awkward).split("## Stock cut order")[1];
  assert.match(guide, /Check this edge trim/);
  assert.doesNotMatch(guide, /Crosscut 95.96 in|Expected leftovers/);
});

test("thin trims can exchange a cut between otherwise occupied boards without increasing purchases", () => {
  const project = cutProject(
    "stud",
    [1.5, 60, 3.5],
    [1.5, 59.8, 3.5],
    [1.5, 35.8, 3.5],
    [1.5, 35.5, 3.5],
  );
  const row = bom(project)[0];
  assert.equal(row.quantity, 2);
  const boards = stockCutSequences(project, [row]).get("stud")!;
  assert.deepEqual(
    boards.map(({ layout }) => layout.kept.map(({ length }) => length)),
    [
      [59.8, 35.8],
      [60, 35.5],
    ],
  );
  assert.ok(boards.every(({ review }) => !review));
  assert.deepEqual(
    boards.map(({ remnants }) => remnants),
    [["0.15 in"], ["0.25 in"]],
  );
});

test("all greenhouse wood stock units can be recorded after balancing the thin last crosscut", () => {
  let { project } = createBuildFixture("greenhouse");
  const stockCounts = (p: typeof project) =>
    bom(p).map(({ id, physicalStockUnits }) => [id, physicalStockUnits]);
  const before = stockCounts(project);
  const wood = [...stockCutSequences(project, bom(project)).values()].flat();
  assert.equal(wood.length, 48);
  for (let i = 0; i < wood.length; i++) {
    const next = [
      ...stockCutSequences(project, bom(project)).values(),
    ].flat()[0];
    assert.ok(next && !next.review, next?.review);
    project = recordStockCutLayout(project, next.layout).project;
  }
  assert.equal(stockCutSequences(project, bom(project)).size, 0);
  assert.deepEqual(stockCounts(project), before);
  assert.equal(inspectCutStock(project).invalid.length, 0);
});

test("recording a board joins differently oriented parts without changing their shape, pose or purchase count", () => {
  const original = cutProject("stud", [1.5, 60, 3.5], [35, 3.5, 1.5]);
  const [a, b] = original.pieces;
  b.rotation = [0, Math.PI / 4, 0];
  const snapshot = structuredClone(original);
  const rows = bom(original);
  const [board] = stockCutSequences(original, rows).get("stud")!;
  const result = recordStockCutLayout(original, board.layout);
  assert.deepEqual(original, snapshot);
  assert.equal(result.offcuts, 1);
  assert.equal(bom(result.project)[0].quantity, 1);
  const [first, second, remnant] = result.project.pieces;
  assert.deepEqual({ ...first, cutStock: null }, a);
  assert.deepEqual({ ...second, cutStock: null }, b);
  assert.equal(remnant.offcut, true);
  assert.equal(second.cutStock?.id, remnant.cutStock?.id);
  assert.match(
    guideMarkdown(result.project),
    /Recorded one .*board for 2 parts starting with P001/,
  );
  assert.match(
    guideMarkdown(result.project),
    /Stock cut order for P001 · 1. Crosscut 5 ft/,
  );
  assert.equal(stockCutSequences(result.project, bom(result.project)).size, 0);
  const layout = cutStockLayout(result.project, result.sourceId);
  assert.equal(layout.state, "planar");
  assert.deepEqual(
    layout.regions.map(({ y, length, offcut }) => [y, length, offcut]),
    [
      [0, 60, false],
      [60.125, 35, false],
      [95.25, 0.75, true],
    ],
  );
  assert.throws(
    () => recordStockCutLayout(result.project, board.layout),
    /cut layout changed/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(result.project))),
    result.project,
  );
});

test("recorded sheet leftovers use exact cut coordinates and support further cuts on a differently oriented member", () => {
  const original = cutProject("plywood", [20, 0.75, 36], [0.75, 16, 30]);
  const [sheet] = stockCutSequences(original, bom(original)).get("plywood")!;
  const result = recordStockCutLayout(original, sheet.layout);
  const layout = cutStockLayout(result.project, result.sourceId);
  assert.equal(layout.state, "planar");
  assert.deepEqual(
    layout.regions
      .filter(({ offcut }) => offcut)
      .map(({ x, y, width, length }) => [x, y, width, length]),
    [
      [36.25, 0, 11.75, 36],
      [20.125, 30.125, 16, 5.875],
      [0, 36.125, 48, 59.875],
    ],
  );
  const second = result.project.pieces[1];
  const recut = cutPiece(result.project, second.id, 21);
  assert.ok(inspectCutStock(recut).valid.has(result.sourceId));
  assert.equal(bom(recut)[0].quantity, 1);
  assert.equal(recut.pieces.find(({ id }) => id === second.id)?.size[2], 21);
  const { invalid } = inspectCutStock({
    ...result.project,
    pieces: result.project.pieces.map((piece) =>
      piece.id === second.id
        ? { ...piece, cutStock: { ...second.cutStock!, offset: [0, 0, 0] } }
        : piece,
    ),
  });
  assert.match(invalid[0].detail, /overlapping regions/);
});

test("formats before packed sources keep their existing local coordinates", () => {
  const initial = cutProject("stud", [1.5, 96, 3.5]);
  const cut = cutPiece(initial, initial.pieces[0].id, 40);
  const upgraded = projectSchema.parse({ ...cut, schemaVersion: 31 });
  assert.deepEqual(upgraded.pieces, cut.pieces);
  const sourceId = upgraded.pieces[0].cutStock!.id;
  assert.ok(inspectCutStock(upgraded).valid.has(sourceId));
  assert.deepEqual(cutStockLayout(upgraded, sourceId).axes, {
    length: 1,
    width: 2,
    thickness: 0,
  });
});

test("SUNLITE cutting requires the explicit flute axis and the full sheet thickness", () => {
  const id = "sunlite-8mm";
  const [w, t, l] = material(id).size;
  const project = cutProject(id, [w, t, l]);
  const getSequence = () =>
    stockCutSequences(project, bom(project)).get(id)![0];
  assert.match(getSequence().review!, /stock length axis along the flutes/);
  project.pieces[0].stockLengthAxis = 2;
  project.pieces[0].size[1] = t / 2;
  assert.match(getSequence().review!, /full source thickness/);
  project.pieces[0].size[1] = t;
  const sequence = getSequence();
  assert.equal(sequence.review, undefined);
  assert.equal(sequence.layout.leftovers.length, 0);
  const recorded = recordStockCutLayout(project, sequence.layout);
  assert.equal(recorded.offcuts, 0);
  assert.equal(
    toolChecklist(recorded.project, []).requirements.some(
      ({ capability }) => capability === "plastic-cut",
    ),
    false,
  );
});

test("the glazed greenhouse records every panel without changing shapes, flutes or purchases", () => {
  const id = "sunlite-8mm";
  const { project } = createBuildStudy(
    "greenhouse",
    defaultBuildStudyParameters("greenhouse"),
    blank(),
    {
      greenhouseGlazing: {
        materialId: id,
        productRegistryRef: "sunlite-132506",
      },
    },
  );
  const row = bom(project).find(({ id: stock }) => stock === id)!;
  const first = stockCutSequences(project, [row]).get(id)!;
  assert.equal(first.length, row.quantity);
  assert.ok(
    first.some(({ steps }) =>
      steps.some((step) => step.includes("along the flutes")),
    ),
  );
  assert.ok(
    first.some(({ followUp }) =>
      followUp.some((step) => step.includes("profile cuts")),
    ),
  );
  assert.match(guideMarkdown(project), /Palram SUNLITE cutting guidance/);
  let recorded = project;
  for (let index = 0; index < first.length; index++) {
    const sequence = stockCutSequences(recorded, bom(recorded)).get(id)![0];
    assert.equal(sequence.review, undefined);
    const result = recordStockCutLayout(recorded, sequence.layout);
    assert.ok(inspectCutStock(result.project).valid.has(result.sourceId));
    assert.equal(
      cutStockLayout(result.project, result.sourceId).modeledKerf,
      0.125,
    );
    recorded = result.project;
  }
  assert.equal(stockCutSequences(recorded, bom(recorded)).get(id), undefined);
  assert.equal(
    bom(recorded).find(({ id: stock }) => stock === id)?.quantity,
    row.quantity,
  );
  for (const original of project.pieces) {
    const actual = recorded.pieces.find(({ id }) => id === original.id)!;
    assert.deepEqual({ ...actual, cutStock: original.cutStock }, original);
    if (original.material === id) assert.ok(actual.cutStock?.sourceAxes);
  }
  const offcuts = recorded.pieces.filter(
    (piece) => piece.material === id && piece.offcut,
  );
  assert.ok(offcuts.length > 0);
  for (const offcut of offcuts) {
    assert.equal(offcut.stockLengthAxis, stockAxes(offcut).length);
    assert.equal(
      offcut.size[stockAxes(offcut).thickness],
      material(id).size[1],
    );
  }
  assert.match(
    guideMarkdown(recorded),
    /Stock cut order for.*across the flutes/,
  );
});

test("recording sauna batt cuts keeps assembly coverage and counts the original purchase packs", () => {
  const { materialId: id, productId } = owensCorningWallBatt;
  const { project } = createBuildStudy(
    "sauna",
    defaultBuildStudyParameters("sauna"),
    blank(),
    {
      saunaInsulation: { materialId: id, productRegistryRef: productId },
    },
  );
  const row = bom(project).find(({ id: stock }) => stock === id)!;
  const [sequence] = stockCutSequences(project, [row]).get(id)!;
  assert.ok(sequence.steps.some((step) => step.startsWith("Knife-trim")));
  assert.ok(sequence.layout.kept.length > 1);
  const result = recordStockCutLayout(project, sequence.layout);
  const layout = cutStockLayout(result.project, result.sourceId);
  assert.equal(layout.modeledKerf, 0);
  assert.ok(result.offcuts > 0);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(result.project)));
  assert.deepEqual(saunaWallCoverage(saved)[0].gaps, []);
  const after = bom(saved).find(({ id: stock }) => stock === id)!;
  assert.equal(after.physicalStockUnits, 18);
  assert.equal(after.quantity, 3);
  assert.equal(after.purchasedStockUnits, 24);

  const remainders = stockCutSequences(saved, [after]).get(id)!;
  const withSecond = recordStockCutLayout(saved, remainders[0].layout, true);
  const stocked = setCutSourceOnHand(withSecond.project, result.sourceId, true);
  const owned = bom(stocked).find((entry) => entry.id === id)!;
  assert.equal(owned.physicalStockUnits, 18);
  assert.equal(owned.onHandStockUnits, 2);
  assert.equal(owned.quantity, 2);
  assert.equal(owned.surplusStockUnits, 0);
  assert.equal(owned.purchasedStockUnits, 16);
});

test("a shared sheet on hand reduces purchases once across reuse, snapshots and exports", () => {
  const id = "plytanium-703";
  const project = cutProject(id, [30, 0.703, 60], [30, 0.703, 60]);
  project.store = "4409";
  const offer = reviewedOfferForMaterial(material(id), "home-depot")!;
  project.inventory = [{
    material: id, retailer: "home-depot", internetNumber: offer.productId,
    name: material(id).name, url: offer.url, zip: project.zip, store: project.store,
    price: 40, available: 1, checkedAt: new Date().toISOString(),
  }];
  assert.equal(bom(project)[0].quantity, 2);
  const [sheet] = stockCutSequences(project, bom(project)).get(id)!;
  const { project: stocked, sourceId } = recordStockCutLayout(project, sheet.layout, true);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(stocked)));
  assert.deepEqual(reopened.onHandCutSources, [sourceId]);
  const row = bom(reopened)[0];
  assert.equal(row.physicalStockUnits, 2);
  assert.equal(row.onHandStockUnits, 1);
  assert.equal(row.quantity, 1);
  assert.equal(projectPricingCoverage(reopened).pricedSubtotal, 40);
  assert.equal(homeDepotShoppingList(reopened).items[0].quantity, 1);
  assert.equal(homeDepotShoppingList(reopened).items[0].snapshot?.available, 1);
  assert.match(homeDepotHandoff(reopened), /STOCK ON HAND/);
  assert.match(guideMarkdown(reopened), /## Stock on hand/);
  assert.match(shoppingCsv(reopened).split("\r\n")[0], /Individual stock units on hand/);
  const [remaining] = stockCutSequences(reopened, bom(reopened)).get(id)!;
  const allOnHand = recordStockCutLayout(reopened, remaining.layout, true).project;
  assert.equal(bom(allOnHand)[0].quantity, 0);
  assert.equal(projectPricingCoverage(allOnHand).materials.lineCount, 0);
  assert.equal(homeDepotShoppingList(allOnHand).text, "");
  assert.match(homeDepotHandoff(allOnHand), /No additional stock units to buy/);

  const remnant = reopened.pieces.find(({ offcut }) => offcut)!;
  const reused = { ...reopened, pieces: reopened.pieces.map((piece) =>
    piece.id === remnant.id ? { ...piece, offcut: false } : piece
  ) };
  assert.equal(bom(reused)[0].quantity, 1);
  const unmarked = setCutSourceOnHand(reused, sourceId, false);
  assert.equal(bom(unmarked)[0].quantity, 2);
  assert.equal(unmarked.onHandCutSources, undefined);
  const broken = { ...reused, pieces: [...reused.pieces, { ...remnant, id: uid() }] };
  assert.equal(bom(broken)[0].onHandStockUnits, 0);
  assert.throws(() => setCutSourceOnHand(broken, sourceId, true), /Review the recorded cut source/);
  const detached = { ...reopened, pieces: reopened.pieces.filter(({ cutStock }) => cutStock?.id !== sourceId) };
  assert.equal(bom(detached)[0].onHandStockUnits, 0);
  assert.equal(bom(detached)[0].quantity, 1);
});

test("a measured offcut keeps its entered grain axis, actual source and ownership after two trims", () => {
  const blankProject = blank("Offcut reuse");
  const stepId = blankProject.steps[0].id;
  const stocked = addMeasuredOffcut(blankProject, stepId, "plytanium-703", [17, 30, 0.703], "Birch cabinet remnant");
  assert.deepEqual(blankProject.pieces, []);
  const [offcut] = stocked.pieces;
  const sourceId = offcut.cutStock!.id;
  assert.deepEqual(stocked.onHandCutSources, [sourceId]);
  assert.equal(offcut.offcut, true);
  assert.equal(stockAxes(offcut).length, 2);
  assert.deepEqual(cutStockLayout(stocked, sourceId).sourceSize, [0.703, 30, 17]);
  const trimmed = resizeByCuts(stocked, offcut.id, 12, 11);
  const placed = {
    ...trimmed,
    pieces: trimmed.pieces.map((piece) => piece.id === offcut.id ? { ...piece, offcut: false } : piece),
  };
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(placed)));
  assert.deepEqual(saved.pieces[0].size, [11, 0.703, 12]);
  assert.equal(saved.pieces.filter(({ offcut }) => offcut).length, 2);
  assert.ok(saved.pieces.every(({ cutStock }) => cutStock?.id === sourceId));
  assert.ok(inspectCutStock(saved).valid.has(sourceId));
  assert.equal(bom(saved)[0].onHandStockUnits, 1);
  assert.equal(bom(saved)[0].quantity, 0);
  assert.deepEqual(homeDepotShoppingList(saved).items, []);
  assert.throws(() => addMeasuredOffcut(blankProject, stepId, "stud", [12, 4, 1.5]), /width exceeds 3.5 in/);
  assert.throws(() => addMeasuredOffcut(blankProject, stepId, "stud", [NaN, 3.5, 1.5]), /measured length/);
});

test("assigning an offcut to a planned part transfers stock coordinates across local axes", () => {
  const project = cutProject("plytanium-703", [0.703, 32, 15]);
  const target = project.pieces[0];
  target.rotation = [0, Math.PI / 2, 0];
  const stocked = addMeasuredOffcut(project, target.stepId, target.material, [40, 23, 0.703], "Shop panel");
  const scrap = stocked.pieces[1];
  const sourceId = scrap.cutStock!.id;
  const before = JSON.stringify(stocked);
  assert.equal(bom(stocked)[0].quantity, 1);
  const [candidate] = fittingOffcuts(stocked, target);
  assert.deepEqual(candidate.operations.map(({ text }) => text), ["Crosscut to 32 in", "Rip to 15 in"]);
  const assigned = assignOffcutToPart(stocked, target.id, scrap.id);
  const actual = assigned.pieces.find(({ id }) => id === target.id)!;
  assert.deepEqual({ ...actual, cutStock: null }, target);
  assert.deepEqual(cutSourceRegion(actual).size, [0.703, 15, 32]);
  assert.deepEqual(cutSourceRegion(actual).sourceSize, [0.703, 23, 40]);
  assert.deepEqual(cutSourceRegion(actual).offset, [0, 0, 0]);
  assert.equal(assigned.pieces.filter(({ offcut }) => offcut).length, 2);
  assert.equal(partLabel(assigned, scrap.id), partLabel(stocked, scrap.id));
  assert.ok(assigned.pieces.every(({ id }) => partLabel(assigned, id) !== partLabel(stocked, scrap.id)));
  assert.ok(assigned.pieces.every(({ cutStock }) => cutStock?.id === sourceId));
  assert.ok(inspectCutStock(assigned).valid.has(sourceId));
  assert.equal(bom(assigned)[0].quantity, 0);
  assert.match(guideMarkdown(assigned), /Assigned O\d+.*to P\d+/);
  assert.ok(toolChecklist(assigned).requirements.some(({ capability }) => capability === "wood-rip"));
  assert.ok(toolChecklist(assigned).requirements.some(({ capability }) => capability === "wood-crosscut"));
  assert.equal(JSON.stringify(stocked), before);
  assert.throws(() => assignOffcutToPart(assigned, target.id, scrap.id), /no longer fits/);
});

test("offcut assignment checks material, grain, thickness, kerf and earlier recorded coordinates", () => {
  const project = cutProject("stud", [1.5, 36, 3.5], [1.5, 96, 3.5]);
  const [target, source] = project.pieces;
  const earlier = cutPiece(project, source.id, 48);
  assert.equal(bom(earlier)[0].quantity, 2);
  const scrap = earlier.pieces.find(({ offcut }) => offcut)!;
  assert.equal(scrap.cutStock?.sourceAxes, undefined);
  const assigned = assignOffcutToPart(earlier, target.id, scrap.id);
  assert.equal(bom(assigned)[0].quantity, 1);
  assert.deepEqual(assigned.pieces[0].cutStock?.offset, [0, 48.125, 0]);
  for (const incompatible of [
    { ...target, material: "plywood" as const },
    { ...target, stockLengthAxis: 2 as const },
    { ...target, size: [1.4, 36, 3.5] as V3 },
    { ...target, size: [1.5, 47.8, 3.5] as V3 },
  ]) {
    assert.deepEqual(fittingOffcuts(earlier, incompatible), []);
  }
});

test("batch reuse follows fresh remnants in order and updates net purchasing without altering the input", () => {
  const id = "plytanium-703";
  const project = cutProject(id, [15, 0.703, 22], [15, 0.703, 36], [40, 0.703, 80]);
  const [small, large, whole] = project.pieces;
  const stocked = addMeasuredOffcut(project, small.stepId, id, [65, 16, 0.703], "Cabinet panel ".repeat(8));
  const snapshot = JSON.stringify(stocked);
  const initialOffcut = stocked.pieces.find(({ offcut }) => offcut)!;
  const plan = planOffcutReuse(stocked);
  assert.deepEqual(plan.assignments.map(({ partId }) => partId), [large.id, small.id]);
  assert.match(plan.assignments[0].from, /^O001/);
  assert.match(plan.assignments[1].from, /^O002/);
  assert.deepEqual(plan.assignments.map(({ fromEarlierCut }) => fromEarlierCut), [false, true]);
  assert.deepEqual(plan.purchases.map(({ id, before, after }) => ({ id, before, after })), [{ id, before: 2, after: 1 }]);
  assert.equal(JSON.stringify(stocked), snapshot);
  const actual = plan.project.pieces.filter(({ offcut }) => !offcut);
  assert.deepEqual(actual.map((piece) => ({ ...piece, cutStock: null })), project.pieces);
  assert.equal(actual.find(({ id }) => id === whole.id)?.cutStock, null);
  assert.ok(inspectCutStock(plan.project).valid.has(initialOffcut.cutStock!.id));
  assert.ok(plan.project.pieces.filter(({ offcut }) => offcut).every(({ name }) =>
    name.length <= 120 && !name.startsWith("Offcut · Offcut ·")));
  assert.deepEqual(planOffcutReuse(plan.project).assignments, []);
});

test("batch reuse compares whole-board purchases before cutting smaller parts from a shared scrap", () => {
  const id = "stud";
  const lengths = [29, 36, 37, 34, 51, 51, 77];
  const project = cutProject(id, ...lengths.map((length): V3 => [1.5, length, 3.5]));
  const stocked = addMeasuredOffcut(project, project.steps[0].id, id, [76, 3.5, 1.5], "Saved board");
  const original = JSON.stringify(stocked);
  const plan = planOffcutReuse(stocked);
  assert.equal(plan.shorterFirst, true);
  assert.deepEqual(plan.assignments.map(({ partId }) => partId), [project.pieces[0].id, project.pieces[3].id]);
  assert.deepEqual(plan.purchases.map(({ id: stockId, before, after }) => [stockId, before, after]), [[id, 4, 3]]);
  assert.deepEqual(plan.remnants.map(({ label, size }) => [label, size[2]]), [["O003", 12.75]]);
  assert.equal(plan.assignments[1].fromEarlierCut, true);
  const claimed = plan.project.pieces.filter(({ cutStock, offcut }) => cutStock && !offcut);
  assert.equal(new Set(claimed.map(({ cutStock }) => cutStock!.id)).size, 1);
  assert.ok(inspectCutStock(plan.project).valid.has(claimed[0].cutStock!.id));
  assert.equal(JSON.stringify(stocked), original);
});

test("the purchase comparison keeps the original cut order for other stock with tied quantities", () => {
  let project = cutProject("stud", ...[29, 36, 37, 34, 51, 51, 77].map((length): V3 => [1.5, length, 3.5]));
  const [long, short] = [43, 20].map((length) => part("Shelf support", "two-six", [1.5, length, 5.5], [0, length / 2, 0], project.steps[0].id, ""));
  project.pieces.push(long, short);
  project = addMeasuredOffcut(project, project.steps[0].id, "stud", [76, 3.5, 1.5]);
  project = addMeasuredOffcut(project, project.steps[0].id, "two-six", [65, 5.5, 1.5]);
  const plan = planOffcutReuse(project);
  assert.equal(plan.shorterFirst, true);
  assert.deepEqual(plan.assignments.filter(({ partId }) => partId === long.id || partId === short.id)
    .map(({ partId }) => partId), [long.id, short.id]);
  assert.equal(bom(plan.project).find(({ id }) => id === "stud")?.quantity, 3);
  assert.equal(bom(plan.project).find(({ id }) => id === "two-six")?.quantity, 0);
});

test("the shop cut order follows remnant dependencies in a regenerated and reopened guide", () => {
  const id = "plytanium-703";
  const project = cutProject(id, [15, 0.703, 22], [15, 0.703, 36]);
  const [short, long] = project.pieces;
  project.steps[0].title = "Fit the short shelf";
  project.steps.push(step("Fit the long shelf"));
  long.stepId = project.steps[1].id;
  const stocked = addMeasuredOffcut(project, short.stepId, id, [65, 16, 0.703], "Cabinet remnant");
  const assigned = planOffcutReuse(stocked).project;
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(generateBuildGuide(assigned))));
  const [first, second] = offcutCutRows(reopened);
  assert.match(first.title, /O001 → P002/);
  assert.match(second.title, /O002 → P001/);
  assert.equal(second.prior, 1);
  assert.deepEqual(first.issues, []);
  assert.deepEqual(second.issues, []);
  assert.match(first.remnants[0], /^O002 · 28.875 in/);
  const guide = guideMarkdown(reopened);
  const cutOrder = guide.indexOf("## Recorded offcut cut order");
  assert.ok(cutOrder >= 0 && cutOrder < guide.indexOf("## 1."));
  assert.match(guide.slice(cutOrder, guide.indexOf("## 1.")), /1\. O001 → P002[\s\S]*2\. O002 → P001[\s\S]*remnant from cut 1/);

  const changed = cutPiece(reopened, long.id, 29, 2);
  assert.ok(inspectCutStock(changed).valid.has(reopened.pieces[0].cutStock!.id));
  const [stale, dependent] = offcutCutRows(changed);
  assert.match(stale.issues[0], /current part and cut source/);
  assert.match(dependent.issues[0], /Review cut 1/);
  const staleGuide = guideMarkdown(changed).split("## Recorded offcut cut order")[1].split("## 1.")[0];
  assert.doesNotMatch(staleGuide, /Crosscut to 36 in|Crosscut to 22 in/);
  assert.throws(() => planOffcutRelease(changed, first.id), /conflicts with the current cut source/);
});

test("returning uncut stock preserves edited design geometry and only releases its remnant branch", () => {
  const id = "plytanium-703";
  const design = cutProject(id, [15, 0.703, 22], [15, 0.703, 36], [20, 0.703, 75]);
  const [short, long, unrelated] = design.pieces;
  const firstStock = addMeasuredOffcut(design, short.stepId, id, [65, 16, 0.703], "Cabinet remnant");
  const stocked = addMeasuredOffcut(firstStock, short.stepId, id, [80, 21, 0.703], "Separate remnant");
  const [input, separateInput] = stocked.pieces.filter(({ offcut }) => offcut);
  const separate = assignOffcutToPart(stocked, unrelated.id, separateInput.id);
  const assigned = planOffcutReuse(separate).project;
  const [independent, parent, child] = offcutCutRows(assigned);
  const partial = planOffcutRelease(assigned, child.id);
  assert.deepEqual(partial.targets.map(({ id }) => id), [short.id]);
  assert.deepEqual(offcutCutRows(partial.project).map(({ id }) => id), [independent.id, parent.id]);
  const childInputId = assigned.history.find(({ id }) => id === child.id)!.offcutCut!.inputId;
  assert.ok(partial.offcut.startsWith(`${partLabel(assigned, childInputId)} · Offcut`));
  assert.match(partial.size, /^28\.875 in/);
  assert.equal(partial.project.pieces.find(({ id }) => id === long.id)?.cutStock?.id, input.cutStock!.id);

  const changed = structuredClone(assigned);
  const edited = changed.pieces.find(({ id }) => id === long.id)!;
  edited.size[2] = 35;
  edited.position[1] = 12;
  const snapshot = JSON.stringify(changed);
  const release = planOffcutRelease(changed, parent.id);
  assert.equal(JSON.stringify(changed), snapshot);
  assert.deepEqual(release.targets.map(({ id }) => id), [long.id, short.id]);
  assert.match(release.offcut, /^O001 · Offcut · Cabinet remnant$/);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(release.project)));
  const restored = reopened.pieces.find(({ id }) => id === input.id)!;
  assert.deepEqual(cutSourceRegion(restored).size, [0.703, 16, 65]);
  assert.deepEqual(cutSourceRegion(restored).offset, [0, 0, 0]);
  assert.deepEqual(reopened.pieces.find(({ id }) => id === long.id), { ...edited, cutStock: null });
  assert.equal(reopened.pieces.find(({ id }) => id === short.id)?.cutStock, null);
  assert.ok(reopened.onHandCutSources?.includes(input.cutStock!.id));
  assert.equal(release.purchase?.before, 0);
  assert.equal(release.purchase?.after, 1);
  assert.deepEqual(offcutCutRows(reopened).map(({ id }) => id), [independent.id]);
  assert.equal(reopened.history.filter(({ offcutCut }) => offcutCut?.releasedAt).length, 2);
  assert.equal(planOffcutReuse(reopened).assignments.length, 2);
});

test("a format 70 nonpacked offcut receipt returns the exact source-local stock region", () => {
  const design = cutProject("stud", [1.5, 36, 3.5], [1.5, 96, 3.5]);
  const [target, source] = design.pieces;
  const earlier = cutPiece(design, source.id, 48);
  const original = earlier.pieces.find(({ offcut }) => offcut)!;
  const assigned = assignOffcutToPart(earlier, target.id, original.id);
  delete assigned.history[0].offcutCut!.inputName;
  const old = projectSchema.parse({ ...assigned, schemaVersion: 70 });
  const released = planOffcutRelease(old, old.history[0].id).project;
  const restored = released.pieces.find(({ id }) => id === original.id)!;
  assert.deepEqual(restored.size, original.size);
  assert.deepEqual(restored.cutStock, original.cutStock);
  assert.equal(partLabel(released, restored.id), "O001");
});

for (const id of buildFixtureIds) {
  test(`${id} accounts for each planned wood stock unit in the cut guide`, () => {
    const { project } = createBuildFixture(id);
    const rows = bom(project);
    const groups = stockCutSequences(project, rows);
    const all = [...groups.values()].flat();
    const guide = guideMarkdown(project);
    assert.ok(all.length > 0);
    assert.match(guide, /## Stock cut order/);
    for (const row of rows) {
      if (!material(row.id).wood || !material(row.id).cuttable) continue;
      const sequences = groups.get(row.id) ?? [];
      assert.equal(
        sequences.length,
        row.bins.filter((bin) => !bin.sourceId).length + row.sheets.length,
      );
      for (const stock of sequences)
        assert.ok(stock.steps.length > 0 || stock.review, stock.title);
    }
    const representative = all.find(
      (stock) => !stock.review && stock.layout.leftovers.length > 0,
    )!;
    const recorded = recordStockCutLayout(project, representative.layout);
    assert.ok(inspectCutStock(recorded.project).valid.has(recorded.sourceId));
    if (id === "greenhouse") {
      assert.ok(
        all.some((stock) =>
          stock.followUp.some((step) => step.includes("profile cuts")),
        ),
      );
    }
  });
}

test("a measured board cut width repacks purchases and freezes the recorded source", () => {
  const project = cutProject("stud", [1.5, 48, 3.5], [1.5, 47.941, 3.5]);
  const measured = setPlannedWoodKerf(project, "stud", 0.059);
  assert.equal(bom(project).find(({ id }) => id === "stud")?.quantity, 2);
  assert.equal(bom(measured).find(({ id }) => id === "stud")?.quantity, 1);
  assert.equal(project.woodKerfs, undefined);
  const [sequence] = stockCutSequences(measured, bom(measured)).get("stud")!;
  assert.match(sequence.source, /0\.059 in measured loss per cut/);
  assert.equal(sequence.review, undefined);
  assert.deepEqual(sequence.layout.leftovers, []);
  assert.equal(sequence.layout.kept[1].y, 48.059);
  assert.throws(() => recordStockCutLayout(project, sequence.layout), /layout changed/i);

  const { project: recorded } = recordStockCutLayout(measured, sequence.layout);
  const firstSource = recorded.pieces[0].cutStock!.id;
  assert.ok(recorded.pieces.every((piece) => pieceCutKerf(piece) === 0.059));
  const changed = setPlannedWoodKerf(recorded, "stud", 0.126);
  assert.deepEqual(changed.pieces, recorded.pieces);
  assert.ok(inspectCutStock(changed).valid.has(firstSource));
  assert.equal(projectSchema.parse(JSON.parse(JSON.stringify(changed))).woodKerfs?.stud, 0.126);
  assert.equal(setPlannedWoodKerf(changed, "stud", undefined).woodKerfs, undefined);
});

test("a measured plywood cut width controls both sheet axes and usable remnant layout", () => {
  const project = cutProject("plywood", [24, 0.75, 60], [23.941, 0.75, 60]);
  const measured = setPlannedWoodKerf(project, "plywood", 0.059);
  assert.equal(bom(project).find(({ id }) => id === "plywood")?.quantity, 2);
  const plan = bom(measured);
  assert.equal(plan.find(({ id }) => id === "plywood")?.quantity, 1);
  const [sheet] = stockCutSequences(measured, plan).get("plywood")!;
  assert.equal(sheet.review, undefined);
  assert.equal(sheet.layout.kept[1].x, 24.059);
  assert.deepEqual(sheet.remnants, ["4 ft × 35.941 in"]);
  assert.match(guideMarkdown(measured), /0\.059 in measured loss per cut/);
  const { project: recorded } = recordStockCutLayout(measured, sheet.layout);
  const offcut = recorded.pieces.find(({ offcut }) => offcut)!;
  assert.equal(offcut.cutStock!.woodKerf, 0.059);
  assert.equal(offcut.size[2], 35.941);
  assert.equal(inspectCutStock(recorded).invalid.length, 0);

  const awkward = cutProject("plywood", [24, 0.75, 60], [23.92, 0.75, 60]);
  const adjusted = setPlannedWoodKerf(awkward, "plywood", 0.059);
  const layouts = stockCutSequences(adjusted, bom(adjusted)).get("plywood")!;
  assert.ok(layouts.every(({ review }) => !review), "Avoid a joined layout that needs a sub-kerf edge trim");
  assert.ok(!projectSchema.safeParse({ ...measured, woodKerfs: { [owensCorningWallBatt.materialId]: 0.059 } }).success);
});

test("equal crosscuts share a board with exact kerf, stable source IDs and reusable tails", () => {
  const project = setPlannedWoodKerf(
    cutProject("stud-10", [1.5, 18, 3.5], [1.5, 48, 3.5], [1.5, 48, 3.5]),
    "stud-10", 0.09375,
  );
  const [other, first, second] = project.pieces;
  const planned = planDedicatedBoardCuts(project, [first.id, second.id]);
  const [source] = planned.plannedCutSources!;
  const [unchanged, keptFirst, keptSecond, scrap] = planned.pieces;
  assert.deepEqual(unchanged, other);
  assert.equal(keptFirst.cutStock!.id, source.sourceId);
  assert.equal(keptSecond.cutStock!.id, source.sourceId);
  assert.equal(scrap.cutStock!.id, source.sourceId);
  assert.equal(cutSourceRegion(keptSecond).offset[2], 48.09375);
  assert.equal(cutSourceRegion(scrap).size[2], 23.8125);
  assert.equal(inspectCutStock(planned).valid.size, 1);
  assert.equal(bom(planned).find(({ id }) => id === "stud-10")?.quantity, 2);
  assert.match(guideMarkdown(planned), /^2\. Crosscut 4 ft from the current end for P003/m);
  assert.throws(() => planDedicatedBoardCuts(project, [first.id, first.id]), /unassigned boards/);
  assert.throws(() => planDedicatedBoardCuts(project, [other.id, first.id]), /same stock and finished length/);
});


test("the shareable rail practice guide follows the saved purchase and later offcut cut", () => {
  const planUrl = new URL("../public/examples/wood-stock/repeated-shelf-rail-cuts.yardwork.json", import.meta.url);
  const guideUrl = new URL("../public/examples/wood-stock/repeated-shelf-rail-cuts-guide.md", import.meta.url);
  const project = projectSchema.parse(JSON.parse(readFileSync(planUrl, "utf8")));
  const [row] = bom(project);
  assert.deepEqual([row.id, row.quantity, row.pieces, row.offcuts], ["stud-10", 1, 3, 1]);
  assert.equal(inspectCutStock(project).valid.size, 1);
  assert.equal(guideMarkdown(project), readFileSync(guideUrl, "utf8"));
});


test("different cut lengths retain the specified new sources and older parts", () => {
  const project = cutProject("stud", [1.5, 24, 3.5], [1.5, 48, 3.5], [1.5, 46, 3.5]);
  const [existing, short, mid] = project.pieces;
  const longer = part("Rail", "stud-10", [1.5, 60, 3.5], [12, 30, 0], project.steps[0].id, "Rails");
  const support = part("Stile", "stud-10", [1.5, 40, 3.5], [24, 20, 0], project.steps[0].id, "Rails");
  project.pieces.push(longer, support);
  const next = planBoardCutGroups(project, [[longer.id, support.id], [short.id, mid.id]]);
  assert.deepEqual(next.pieces[0], existing);
  assert.equal(inspectCutStock(next).valid.size, 2);
  assert.deepEqual(bom(next).map(({ id, quantity }) => [id, quantity]), [["stud", 2], ["stud-10", 1]]);
  assert.deepEqual(next.pieces.filter(({ offcut }) => offcut).map((piece) => cutSourceRegion(piece).size[2]), [19.75, 1.75]);
  assert.throws(() => planBoardCutGroups(project, [[longer.id, short.id]]), /one wood stock size/);
  assert.throws(() => planBoardCutGroups(project, [[short.id, mid.id, existing.id]]), /exceeds the/);
});


test("the mixed rail practice keeps exact board purchases and its saved offcut guide", () => {
  const planUrl = new URL("../public/examples/wood-stock/mixed-rail-cuts.yardwork.json", import.meta.url);
  const guideUrl = new URL("../public/examples/wood-stock/mixed-rail-cuts-guide.md", import.meta.url);
  const practice = projectSchema.parse(JSON.parse(readFileSync(planUrl, "utf8")));
  assert.deepEqual(bom(practice).map(({ id, quantity }) => [id, quantity]).sort(),
    [["hd-kdht-2x4-8", 1], ["hd-spf-2x4-10", 1]]);
  assert.equal(inspectCutStock(practice).valid.size, 2);
  assert.equal(guideMarkdown(practice), readFileSync(guideUrl, "utf8"));
});
