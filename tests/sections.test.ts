import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  blank,
  coop,
  parsePrompt,
  part,
  projectSchema,
  type Command,
  type Project,
} from "../src/model";
import { bom, bounds, connect, cutPiece, guideMarkdown, recordChanges, validate } from "../src/engine";
import { connectionCoverage } from "../src/connectionCoverage";
import { floorBaseConnections, floorBaseJointFit } from "../src/floorBaseConnections";
import { floorHangerFit, floorHangerPlanReviews, floorHangerPurchases, saveFloorHangerPlan } from "../src/floorHangerPlans";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { toolChecklist } from "../src/tools";
import { fittingBaseBoards } from "../src/homeDepotTreatedLumber";
import { compareFloorBaseStock } from "../src/floorBaseStock";
import { homeDepotShoppingList } from "../src/handoff";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import {
  createSection,
  duplicateSection,
  previewSectionCommand,
  reconcileSections,
  removeSection,
  sectionModified,
  transformSection,
  snapSectionOrigin,
  sectionContext,
  ungroupSection,
} from "../src/sections";
const wall: Command = {
  type: "wall",
  width: 96,
  height: 72,
  depth: 48,
  spacing: 16,
};
const base: Command = {
  type: "foundation",
  width: 72,
  height: 48,
  depth: 48,
  spacing: 16,
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function twoSections() {
  return applyCommand(applyCommand(blank("Section study"), wall), base);
}
test("a floor base sizes its rims and joists against independent whole-board purchases", () => {
  const initial = blank("Exterior base");
  const dimensions = { ...base, width: 108, depth: 48 };
  const baseStock = fittingBaseBoards(dimensions);
  assert.deepEqual(baseStock, { rim: "hd-treated-2x6-10", joist: "hd-treated-2x6-8" });
  const command = { ...dimensions, baseStock };
  const preview = previewSectionCommand(initial, command);
  assert.equal(initial.pieces.length, 0);
  assert.equal(preview.added, 10);
  assert.deepEqual(preview.basePurchase.map(({ id, quantity }) => [id, quantity]).sort(), [
    ["hd-treated-2x6-10", 2], ["hd-treated-2x6-8", 4],
  ]);
  const committed = projectSchema.parse(JSON.parse(JSON.stringify(applyCommand(initial, command))));
  assert.deepEqual(committed.sections[0].generator, command);
  assert.deepEqual(committed.pieces.filter(({ material }) => material === baseStock.rim).map(({ size }) => size), [
    [108, 5.5, 1.5], [108, 5.5, 1.5],
  ]);
  assert.ok(committed.pieces.filter(({ material }) => material === baseStock.joist).every(({ size }) => size[2] === 45));
  assert.deepEqual(homeDepotShoppingList(committed).items.map(({ productId, quantity }) => [productId, quantity]).sort(), [
    ["206952301", 4], ["206967800", 2],
  ]);
  assert.throws(
    () => applyCommand(initial, { ...command, baseStock: { ...baseStock, rim: "hd-treated-2x6-8" } }),
    /rim needs/,
  );
  assert.throws(() => applyCommand(initial, { ...wall, baseStock }), /only be assigned/);
  const s = committed.sections[0];
  const promptContext = sectionContext(s)!.command;
  assert.deepEqual(promptContext, dimensions);
  const edited = applyCommand(committed, parsePrompt("Make this base 60 inches deep", promptContext), s.id);
  assert.deepEqual(edited.sections[0].generator?.baseStock, baseStock);
  assert.equal(edited.sections[0].generator?.depth, 60);
  assert.equal(sectionModified(edited, edited.sections[0]), false);
  assert.deepEqual(homeDepotShoppingList(edited).items.map(({ productId, quantity }) => [productId, quantity]).sort(), [
    ["206952301", 8], ["206967800", 2],
  ]);
  const legacy = projectSchema.parse({ ...applyCommand(initial, base), schemaVersion: 77 });
  assert.equal(legacy.sections[0].generator?.baseStock, undefined);
  assert.ok(legacy.pieces.every(({ material }) => material === "treated"));
});

test("floor-stock comparisons use cut capacity, saw kerf, purchased footage and board count", () => {
  const command = { ...base, width: 108, depth: 60 };
  const { options, leastLumber, fewestBoards } = compareFloorBaseStock(command);
  const shortest = options.find(({ stock }) => stock.rim === "hd-treated-2x6-10" && stock.joist === "hd-treated-2x6-8")!;
  assert.equal(shortest.boards, 10);
  assert.equal(shortest.purchasedLength, 84 * 12);
  assert.ok(leastLumber);
  assert.deepEqual(leastLumber, {
    stock: { rim: "hd-treated-2x6-10", joist: "hd-treated-2x6-10" },
    boards: 6,
    purchasedLength: 60 * 12,
    remnantLength: 46.75,
  });
  assert.equal(fewestBoards, leastLumber);
  const estimated = previewSectionCommand(blank(), { ...command, baseStock: leastLumber.stock });
  assert.deepEqual(estimated.basePurchase, [{ id: "hd-treated-2x6-10", quantity: 6, oversize: 0 }]);

  const tradeoff = compareFloorBaseStock({ ...base, width: 30, depth: 96 });
  assert.equal(tradeoff.leastLumber?.boards, 4);
  assert.equal(tradeoff.leastLumber?.purchasedLength, 32 * 12);
  assert.equal(tradeoff.fewestBoards?.boards, 3);
  assert.equal(tradeoff.fewestBoards?.purchasedLength, 36 * 12);
  const thinTrim = compareFloorBaseStock({ ...base, width: 95.95 });
  assert.ok(thinTrim.options.length > 0);
  assert.ok(thinTrim.options.every(({ stock }) => stock.rim !== "hd-treated-2x6-8"));
  assert.deepEqual(compareFloorBaseStock({ ...base, width: 192 }).options, []);
});

test("actual 7½ in treated 2 × 8 parts share a floor plane and remain bound to their exact purchases", () => {
  const dimensions = { ...base, width: 108, depth: 48 };
  const stock = fittingBaseBoards(dimensions, 7.5);
  assert.deepEqual(stock, { rim: "hd-treated-2x8-10", joist: "hd-treated-2x8-8" });
  const initial = blank();
  const command = { ...dimensions, baseStock: stock };
  const p = applyCommand(initial, command);
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(saved.sections[0].generator, command);
  assert.equal(saved.pieces.length, 10);
  for (const piece of saved.pieces) {
    const box = bounds(piece);
    near(box.min[1], 0);
    near(box.max[1], 7.5);
    assert.equal(piece.size[1], 7.5);
  }
  assert.deepEqual(homeDepotShoppingList(saved).items.map(({ productId, quantity }) => [productId, quantity]).sort(),
    [["206937440", 2], ["206937455", 4]]);
  const [rim] = saved.pieces;
  const checked = new Date().toISOString();
  saved.store = "4409";
  saved.inventory = [{
    retailer: "home-depot", material: rim.material, internetNumber: "206937455", checkedAt: checked,
    name: "Test check for a different length", price: 6, available: 10, store: saved.store,
    zip: saved.zip, url: "https://www.homedepot.com/p/206937455",
  }];
  assert.equal(bom(saved).find(({ id }) => id === rim.material)?.inventory, undefined);
  saved.inventory[0] = { ...saved.inventory[0], internetNumber: "206937440", url: "https://www.homedepot.com/p/206937440" };
  assert.equal(bom(saved).find(({ id }) => id === rim.material)?.quantity, 2);
  assert.equal(bom(saved).find(({ id }) => id === rim.material)?.total, 12);
  const mixed = { ...command, baseStock: { ...stock, joist: "hd-treated-2x6-8" as const } };
  assert.throws(() => applyCommand(initial, mixed), /same actual board depth/);
  const enlarged = { ...command, width: 132 };
  assert.throws(() => applyCommand(initial, enlarged), /rim needs/);
  assert.deepEqual(compareFloorBaseStock(enlarged, 7.5).options, []);
  const comparison = compareFloorBaseStock({ ...command, depth: 60 }, 7.5);
  assert.deepEqual(comparison.leastLumber?.stock, { rim: stock.rim, joist: stock.rim });
  assert.equal(comparison.leastLumber?.boards, 6);
  const legacy = projectSchema.parse({ ...applyCommand(initial, { ...dimensions, baseStock: fittingBaseBoards(dimensions) }), schemaVersion: 78 });
  assert.ok(legacy.pieces.every(({ size }) => size[1] === 5.5));
});

test("floor-base joint review follows owned parts, retained end cuts and world section rotation", () => {
  const layout = { ...base, width: 108, depth: 48 };
  const original = applyCommand(blank(), { ...layout, baseStock: fittingBaseBoards(layout, 7.5) });
  const section = original.sections[0];
  const initial = floorBaseConnections(original, [])[0];
  assert.equal(initial.expected, 8);
  assert.equal(initial.rows.length, 16);
  assert.ok(initial.rows.every(({ fullFace }) => fullFace));
  assert.equal(initial.rows.filter(({ room }) => room === 0).length, 4);
  const { joist, rim } = initial.rows[2];
  const marked = connect(original, joist.id, rim!.id, joist.stepId);
  const after = transformSection(marked, section.id, [30, 8, -13], [0.2, 0.7, -0.1]);
  after.pieces.find(({ id }) => id === joist.id)!.name = "Renamed cross member";
  const reviewed = floorBaseConnections(after, connectionCoverage(after).intents)[0];
  assert.ok(reviewed.rows.every(({ fullFace }) => fullFace));
  assert.equal(reviewed.rows.find((entry) => entry.rim?.id === rim?.id && entry.joist.id === joist.id)?.plans.length, 1);
  const legacy = { ...original, pieces: original.pieces.map((piece) => ({ ...piece, designRole: undefined })) };
  assert.ok(floorBaseConnections(legacy, [])[0].rows.every(({ fullFace }) => fullFace));

  const sawCut = cutPiece(original, joist.id, joist.size[2] - 0.5, 2);
  const sawEnds = floorBaseConnections(sawCut, [])[0];
  assert.equal(sawCut.pieces.filter(({ offcut }) => offcut).length, 1);
  assert.equal(sawEnds.rows.length, 16);
  assert.equal(sawEnds.rows.find((row) => row.joist.id === joist.id && row.side === "front")?.fit?.gap, 0.5);

  const cut = structuredClone(original);
  const shortened = cut.pieces.find(({ id }) => id === joist.id)!;
  shortened.size[2] -= 0.5;
  shortened.position[2] += 0.25;
  const [back, front] = floorBaseConnections(cut, [])[0].rows.filter((row) => row.joist.id === joist.id);
  assert.equal(back.fit?.gap, 0.5);
  assert.equal(front.fullFace, true);
  assert.match(guideMarkdown(cut), /## Floor base joist ends[\s\S]*0\.5 in gap at the joist end/);
  shortened.position[1] += 0.25;
  const partial = floorBaseConnections(cut, [])[0].rows.find((row) => row.joist.id === joist.id && row.side === "front")!;
  assert.equal(floorBaseJointFit(partial), "Partial joist-end contact.");
  const missingRim = floorBaseConnections({ ...cut, pieces: cut.pieces.filter(({ id }) => id !== rim?.id) }, [])[0];
  assert.ok(missingRim.rows.filter(({ side }) => side === "back").every(({ fit }) => fit === null));
  const removedJoist = floorBaseConnections({ ...cut, pieces: cut.pieces.filter(({ id }) => id !== joist.id) }, [])[0];
  assert.equal(removedJoist.joists, 7);
  assert.equal(removedJoist.expected, 8);
  assert.equal(original.joints.length, 0);
});

test("hanger estimates use measured clearance, preserve member identity and round each exact screw pack separately", () => {
  const layout = { ...base, width: 108, depth: 48 };
  const p = applyCommand(blank(), { ...layout, baseStock: fittingBaseBoards(layout, 7.5) });
  const section = p.sections[0];
  const model = floorBaseConnections(p, [])[0];
  const productId = "simpson-lus28z";
  const flangeReach = 1.25;
  const chosen = model.rows.filter((row) => !floorHangerFit(model, row, productId, flangeReach));
  assert.equal(chosen.length, 12);
  assert.match(floorHangerFit(model, model.rows[0], productId, flangeReach)!, /rim-end room/);
  assert.match(floorHangerFit(model, chosen[0], "simpson-lus26z", flangeReach)!, /member dimensions/);
  const plan = {
    productId, flangeReach, checkedAt: "2026-11-20T19:00:00.000Z",
    ends: chosen.map(({ rim, joist }) => ({ rimId: rim!.id, joistId: joist.id })),
  } as const;
  const { rim, joist } = chosen[0];
  const existing = connect(p, rim!.id, joist.id, joist.stepId);
  assert.throws(() => saveFloorHangerPlan(existing, section.id, plan), /already on this pair/);
  const saved = projectSchema.parse(saveFloorHangerPlan(p, section.id, plan));
  assert.deepEqual(saved.pieces, p.pieces);
  assert.equal(saved.supplies.length, 0);
  assert.ok(toolChecklist(saved).requirements.find(({ capability }) => capability === "drive-quarter-hex")
    ?.sources.some(({ kind, id }) => kind === "floor-hanger-plan" && id === section.id));
  assert.deepEqual(floorHangerPurchases(saved), [
    { productId: "simpson-lus28z", units: 12, required: 12 },
    { productId: "simpson-sd9112r100", units: 72, required: 1 },
    { productId: "simpson-sd9212r100-r", units: 48, required: 1 },
  ]);
  const copy = duplicateSection(saved, section.id).project;
  assert.ok(copy.sections[1].floorHangerPlan?.ends.every(({ joistId, rimId }) =>
    copy.sections[1].pieceIds.includes(joistId) && copy.sections[1].pieceIds.includes(rimId)));
  assert.deepEqual(floorHangerPurchases(copy).map(({ required }) => required), [24, 2, 1]);
  const buy = homeDepotPurchaseNeeds(saved).filter(({ basis }) => basis === "Floor base hanger plan");
  assert.ok(buy.every(({ canAdd }) => canAdd));
  const purchased = buy.reduce((next, { id }) => addHomeDepotPurchaseNeed(next, id), saved);
  assert.deepEqual(purchased.supplies.map(({ quantity }) => quantity), [12, 1, 1]);
  assert.equal(homeDepotPurchaseNeeds(purchased).filter(({ basis }) => basis === "Floor base hanger plan").length, 0);
  const trimmed = cutPiece(purchased, joist.id, joist.size[2] - 0.5, 2);
  const review = floorHangerPlanReviews(trimmed)[0];
  assert.equal(review.rows.filter(({ issue }) => issue).length, 1);
  assert.equal(floorHangerPurchases(trimmed)[0].required, 11);
  assert.deepEqual(trimmed.supplies, purchased.supplies);
  assert.match(guideMarkdown(trimmed), /Floor base hanger plan[\s\S]*11 of 12 saved ends match/);

  const shallower = applyCommand(blank(), { ...layout, baseStock: fittingBaseBoards(layout) });
  const shallowModel = floorBaseConnections(shallower, [])[0];
  const shallowEnds = shallowModel.rows.filter((row) => !floorHangerFit(shallowModel, row, "simpson-lus26z", flangeReach))
    .map(({ rim, joist }) => ({ rimId: rim!.id, joistId: joist.id }));
  const shallowPlan = saveFloorHangerPlan(shallower, shallower.sections[0].id, {
    ...plan, productId: "simpson-lus26z", ends: shallowEnds,
  });
  assert.deepEqual(floorHangerPurchases(shallowPlan), [
    { productId: "simpson-lus26z", units: 12, required: 12 },
    { productId: "simpson-sd9112r100", units: 48, required: 1 },
    { productId: "simpson-sd9212r100-r", units: 48, required: 1 },
  ]);
});

test("generated sections own their parts and all coop wall frames match their parameters", () => {
  for (const project of [twoSections(), coop()]) {
    projectSchema.parse(project);
    const owned = project.sections.flatMap((s) => s.pieceIds);
    assert.equal(new Set(owned).size, project.pieces.length);
    for (const section of project.sections)
      assert.equal(sectionModified(project, section), false, section.name);
  }
  const p = applyCommand(twoSections(), base);
  assert.equal(new Set(p.sections.map((s) => s.name)).size, 3);
});
test("old version 1 plans import with no invented generator metadata", () => {
  const p = twoSections();
  const legacy = { ...p } as Partial<Project>;
  delete legacy.sections;
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(imported.sections, []);
  assert.deepEqual(imported.pieces, p.pieces);
});
test("section membership rejects duplicate, shared, and orphaned references", () => {
  const p = twoSections();
  const duplicate = structuredClone(p);
  duplicate.sections[0].pieceIds.push(duplicate.sections[0].pieceIds[0]);
  assert.throws(() => projectSchema.parse(duplicate));
  const shared = structuredClone(p);
  shared.sections[0].pieceIds.push(shared.sections[1].pieceIds[0]);
  assert.throws(() => projectSchema.parse(shared));
  const orphaned = structuredClone(p);
  orphaned.sections[0].pieceIds.push(crypto.randomUUID());
  assert.throws(() => projectSchema.parse(orphaned));
  const offcut = structuredClone(p);
  offcut.pieces[0].offcut = true;
  assert.throws(() => projectSchema.parse(offcut));
});
test("section translation preserves relative positions, unrelated parts, and connection records", () => {
  const p = twoSections(),
    s = p.sections[0];
  const [plate, , stud] = p.pieces;
  p.joints = connect(p, plate.id, stud.id, plate.stepId).joints;
  const moved = transformSection(p, s.id, [24, 12, -36], [0, 0, 0]);
  for (const old of p.pieces) {
    const actual = moved.pieces.find((a) => a.id === old.id)!;
    if (s.pieceIds.includes(old.id))
      old.position.forEach((v, i) =>
        near(actual.position[i], v + [24, 12, -36][i]),
      );
    else assert.deepEqual(actual, old);
  }
  assert.deepEqual(moved.joints, p.joints);
  assert.equal(sectionModified(moved, moved.sections[0]), false);
  assert.notDeepEqual(p.sections[0].origin, moved.sections[0].origin);
});

test("translating an already turned section preserves exact member rotations", () => {
  const project = twoSections();
  const id = project.sections[0].id;
  const turned = transformSection(project, id, [0, 15, 0], [0.16, 0.73, -0.22]);
  const section = turned.sections[0];
  const moved = transformSection(turned, id, [3, 21, -4], section.rotation);
  for (const piece of turned.pieces.filter((part) =>
    section.pieceIds.includes(part.id),
  )) {
    const next = moved.pieces.find((part) => part.id === piece.id)!;
    assert.deepEqual(next.rotation, piece.rotation);
    assert.deepEqual(next.position, [
      piece.position[0] + 3,
      piece.position[1] + 6,
      piece.position[2] - 4,
    ]);
  }
});
test("rotation composes around the section anchor and repeated moves do not double-rotate parts", () => {
  const p = twoSections(),
    s = p.sections[0];
  const rotated = transformSection(p, s.id, [20, 8, 10], [0, Math.PI / 2, 0]);
  for (const old of p.pieces.filter((a) => s.pieceIds.includes(a.id))) {
    const actual = rotated.pieces.find((a) => a.id === old.id)!;
    near(actual.position[0], 20 + old.position[2]);
    near(actual.position[1], 8 + old.position[1]);
    near(actual.position[2], 10 - old.position[0]);
  }
  const back = transformSection(rotated, s.id, [0, 0, 0], [0, 0, 0]);
  p.pieces.forEach((old) =>
    old.position.forEach((v, i) =>
      near(back.pieces.find((a) => a.id === old.id)!.position[i], v),
    ),
  );
  assert.equal(sectionModified(rotated, rotated.sections[0]), false);
});
test("targeted regeneration preserves identity, transform, step, unrelated parts, and unrelated connections", () => {
  let p = twoSections();
  const s = p.sections[0],
    oldIds = new Set(s.pieceIds);
  const sectionParts = p.pieces.filter((a) => oldIds.has(a.id));
  p = connect(
    p,
    sectionParts[0].id,
    sectionParts[2].id,
    sectionParts[0].stepId,
  );
  const baseParts = p.pieces.filter((a) =>
    p.sections[1].pieceIds.includes(a.id),
  );
  p = connect(p, baseParts[0].id, baseParts[2].id, baseParts[0].stepId);
  p = transformSection(p, s.id, [20, 5, 10], [0, 0.5, 0]);
  const before = structuredClone(p);
  const next = applyCommand(p, { ...wall, width: 120 }, s.id);
  assert.equal(next.id, p.id);
  assert.equal(next.steps.length, p.steps.length);
  assert.equal(next.sections[0].id, s.id);
  assert.deepEqual(next.sections[0].origin, p.sections[0].origin);
  assert.deepEqual(next.sections[0].rotation, p.sections[0].rotation);
  assert.ok(next.sections[0].pieceIds.every((id) => !oldIds.has(id)));
  assert.ok(
    next.pieces
      .filter((a) => next.sections[0].pieceIds.includes(a.id))
      .every((a) => a.stepId === sectionParts[0].stepId),
  );
  assert.deepEqual(
    next.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)),
    p.pieces.filter((a) => p.sections[1].pieceIds.includes(a.id)),
  );
  assert.equal(next.joints.length, 1);
  assert.equal(next.joints[0].id, p.joints[1].id);
  assert.equal(sectionModified(next, next.sections[0]), false);
  assert.deepEqual(p, before);
  projectSchema.parse(next);
  assert.throws(() => applyCommand(p, base, s.id), /section type/);
  assert.throws(
    () => applyCommand(p, wall, crypto.randomUUID()),
    /Choose a generated/,
  );
});
test("targeted local prompts preserve unspecified dimensions and reject ambiguous nonnumeric edits", () => {
  assert.deepEqual(parsePrompt("make it 10 ft wide", wall), {
    ...wall,
    width: 120,
  });
  assert.deepEqual(parsePrompt("make this wall 7 ft tall", wall), {
    ...wall,
    height: 84,
  });
  assert.deepEqual(parsePrompt("24 inches on center", wall), {
    ...wall,
    spacing: 24,
  });
  assert.deepEqual(parsePrompt("make it 5 ft deep", base), {
    ...base,
    depth: 60,
  });
  assert.throws(
    () => parsePrompt("make this wall stronger", wall),
    /Include a new dimension/,
  );
  assert.throws(() => parsePrompt("make it 30 ft wide", wall));
});
test("manual part edits are identified and cuts leave the spare outside the movable section", () => {
  const p = twoSections(),
    s = p.sections[0];
  const stud = p.pieces.find(
    (a) => s.pieceIds.includes(a.id) && a.name.includes("stud"),
  )!;
  const cut = reconcileSections(cutPiece(p, stud.id, 24));
  assert.equal(sectionModified(cut, cut.sections[0]), true);
  assert.equal(cut.sections[0].pieceIds.length, s.pieceIds.length);
  const offcut = cut.pieces.find((a) => a.offcut)!;
  assert.ok(!cut.sections[0].pieceIds.includes(offcut.id));
  const moved = transformSection(cut, s.id, [12, 0, 0], [0, 0, 0]);
  assert.deepEqual(
    moved.pieces.find((a) => a.id === offcut.id),
    offcut,
  );
  projectSchema.parse(moved);
});
test("preview describes changed parts, removed connections, and incomplete stock estimates without changing the project", () => {
  let p = twoSections();
  const s = p.sections[0],
    members = p.pieces.filter((a) => s.pieceIds.includes(a.id));
  p = connect(p, members[0].id, members[2].id, members[0].stepId);
  const original = structuredClone(p);
  const preview = previewSectionCommand(p, { ...wall, width: 120 }, s.id);
  assert.equal(preview.removed, s.pieceIds.length);
  assert.equal(preview.removedConnections, 1);
  assert.ok(preview.added > preview.removed);
  assert.equal(preview.incompleteEstimate, true);
  assert.ok(preview.findings.some((f) => f.id === "stock-stud"));
  assert.deepEqual(p, original);
});

test("section cost preview remains incomplete when fitting stock has no price", () => {
  const p = blank("Unpriced existing sheet"),
    sheet = part(
      "Existing exact panel",
      "plytanium-703",
      [0.703, 24, 24],
      [0, 12, 0],
      p.steps[0].id,
      "Manual panel",
    );
  p.pieces.push(sheet);
  const before = structuredClone(p),
    preview = previewSectionCommand(p, {
      type: "wall",
      width: 48,
      height: 48,
      depth: 24,
      spacing: 16,
    });
  assert.equal(preview.incompleteEstimate, true);
  assert.deepEqual(p, before);
});
test("duplicates have independent IDs, internal connections, and their own build step", () => {
  let p = twoSections();
  const s = p.sections[0],
    members = p.pieces.filter((a) => s.pieceIds.includes(a.id));
  p = connect(p, members[0].id, members[2].id, members[0].stepId);
  const { project: copy, sectionId } = duplicateSection(p, s.id);
  const cloned = copy.sections.find((s) => s.id === sectionId)!;
  assert.ok(cloned.pieceIds.every((id) => !p.pieces.some((a) => a.id === id)));
  assert.equal(copy.steps.length, p.steps.length + 1);
  assert.equal(copy.joints.length, 2);
  assert.ok(
    cloned.pieceIds.includes(copy.joints[1].a) &&
      cloned.pieceIds.includes(copy.joints[1].b),
  );
  assert.equal(sectionModified(copy, cloned), false);
  const removed = removeSection(copy, sectionId);
  assert.deepEqual(removed.pieces, p.pieces);
  assert.deepEqual(removed.joints, p.joints);
  projectSchema.parse(removed);
});
test("legacy grouping prevents double ownership and empty groups are removed on part deletion", () => {
  const p = twoSections();
  p.sections = [];
  const result = createSection(
    p,
    p.pieces.map((a) => a.id),
    "Handmade",
  );
  assert.equal(result.project.sections.length, 1);
  assert.throws(
    () =>
      createSection(
        result.project,
        p.pieces.map((a) => a.id),
        "Second group",
      ),
    /ungrouped/,
  );
  assert.equal(
    reconcileSections({ ...result.project, pieces: [] }).sections.length,
    0,
  );
});
test("ungrouping preserves labeled cut parts, offcuts and connections", () => {
  const generated = twoSections();
  const plate = generated.pieces[0];
  const stud = generated.pieces.find((piece) =>
    generated.sections[0].pieceIds.includes(piece.id) && piece.name.includes("stud"))!;
  const cut = cutPiece({ ...generated, sections: [] }, stud.id, 24);
  const connected = connect(cut, plate.id, stud.id, stud.stepId);
  const { project, sectionId } = createSection(connected, [plate.id, stud.id], "Handmade");
  const positioned = transformSection(project, sectionId, [0, 20, 0], [0, 0, 0]);
  assert.ok(positioned.pieces.some((piece) => piece.offcut));
  assert.ok(positioned.pieces.find((piece) => piece.id === stud.id)?.cutStock);
  assert.ok(positioned.joints.some(({ a, b }) => a === plate.id && b === stud.id));
  const withGuide = generateBuildGuide(positioned);
  assert.ok(guideIsCurrent(withGuide));
  assert.ok(withGuide.partLabels.some(({ partId }) => partId === stud.id));
  const released = ungroupSection(withGuide, sectionId);
  assert.deepEqual(released, { ...withGuide, sections: [] });
  assert.ok(!guideIsCurrent(released));
  const updated = generateBuildGuide(released);
  assert.ok(guideIsCurrent(updated));
  assert.ok(updated.steps.every(({ generated }) => generated?.planId !== sectionId));
  assert.equal(updated.pieces.find(({ id }) => id === stud.id)?.cutStock?.id,
    withGuide.pieces.find(({ id }) => id === stud.id)?.cutStock?.id);

  const assigned = {
    ...positioned,
    pieces: positioned.pieces.map((piece) => piece.id === plate.id
      ? { ...piece, guidePlacement: { ownerId: sectionId, stageKey: "assemble" } }
      : piece),
  };
  assert.throws(() => ungroupSection(assigned, sectionId), /Move the linked parts/);
  assert.throws(() => ungroupSection(generated, generated.sections[0].id), /fitted assembly or a recipe/);
});
test("recorded regeneration operations remain assigned to the original guide step", () => {
  const p = twoSections(),
    s = p.sections[0];
  const next = recordChanges(p, applyCommand(p, { ...wall, width: 84 }, s.id));
  const stepId = p.pieces.find((a) => s.pieceIds.includes(a.id))!.stepId;
  assert.ok(next.history.length > 0);
  assert.ok(next.history.every((h) => h.stepId === stepId));
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(next))), next);
});

test("framing advice compares actual section quantities and requested layouts without claiming structural approval", () => {
  const p = applyCommand(blank(), { ...wall, spacing: 12 }),
    s = p.sections[0];
  assert.ok(validate(p).some((f) => f.id === `spacing-quantity-${s.id}`));
  const a = p.pieces.find((a) => a.name.includes("stud"))!;
  const copy = { ...structuredClone(a), id: crypto.randomUUID() };
  p.pieces.push(copy);
  s.pieceIds.push(copy.id);
  assert.ok(validate(p).some((f) => f.id === `extra-frame-${s.id}`));
  assert.ok(validate(p).some((f) => f.id === "engineering"));
});

test("whole walls snap to nearby base faces without snapping to their own parts", () => {
  const p = twoSections(),
    wall = p.sections[0],
    base = p.sections[1];
  const origin: [number, number, number] = [
    base.origin[0],
    5.1,
    base.origin[2],
  ];
  const snapped = snapSectionOrigin(p, wall.id, origin, [0, 0, 0]);
  near(snapped[1], 5.5);
  near(snapped[0], origin[0]);
  near(snapped[2], origin[2]);
  assert.deepEqual(
    snapSectionOrigin(p, wall.id, origin, [0, 0, 0], 0.8, [0, 2]),
    origin,
  );
  const isolated = applyCommand(blank(), { ...wall.generator!, type: "wall" });
  const untouched = snapSectionOrigin(
    isolated,
    isolated.sections[0].id,
    [100, 12, 100],
    [0, 0, 0],
  );
  assert.deepEqual(untouched, [100, 12, 100]);
});
