import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import {
  bom,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
  validate,
} from "../src/engine";
import { inspectCutStock } from "../src/cutStock";
import {
  greenhouseDoorStopReview,
  previewGreenhouseDoorStops,
} from "../src/greenhouseDoorStops";
import {
  addMissingDoorKits,
  doorKitDemand,
  greenhouseDoorChoices,
  greenhouseDoorMotionInput,
  greenhouseDoorReview,
} from "../src/greenhouseDoors";
import {
  greenhouseDoorKits,
  cedarDoorStop,
  isGreenhouseDoorStop,
  type GreenhouseDoorKitId,
} from "../src/greenhouseDoorReference";
import {
  motionPivotPreset,
  motionSetup,
  reviewMotion,
  saveMotionPlan,
} from "../src/mechanismMotion";
import { part, projectSchema, type V3 } from "../src/model";
import { recordSupplyInventory, supplyRows } from "../src/supplies";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import {
  addHomeDepotPurchaseNeed,
  homeDepotPurchaseNeeds,
} from "../src/handoffPurchases";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";

function glazed() {
  return createBuildStudy("greenhouse", undefined, undefined, {
    greenhouseGlazing: {
      materialId: "sunlite-8mm",
      productRegistryRef: "sunlite-132506",
    },
  }).project;
}

function fixture(
  kitId: GreenhouseDoorKitId | null = null,
  side: "left" | "right" = "left",
) {
  const base = glazed();
  const [{ entry }] = greenhouseDoorChoices(base);
  const setup = { entryId: entry.id, side, outset: 0, sideOffset: 0, kitId };
  const draft = greenhouseDoorMotionInput(base, setup, 90);
  return { ...saveMotionPlan(base, draft), base, setup };
}

test("the Home Depot handoff carries the exact planned door kit without adding or duplicating it", () => {
  const kit = "everbilt-24417-gate-kit";
  const { project, plan } = fixture(kit);
  const before = structuredClone(project);
  const review = homeDepotPurchaseNeeds(project).find((row) => row.id === kit)!;
  assert.equal(review.missing, 1);
  assert.equal(review.canAdd, true);
  assert.match(
    homeDepotHandoff(project),
    /PURCHASES STILL TO SELECT FROM THE PLAN[\s\S]+Greenhouse door hardware\. 1 door hardware kit to select/,
  );
  assert.doesNotMatch(homeDepotShoppingList(project).text, /#327600104/);
  assert.deepEqual(project, before);

  const selected = addHomeDepotPurchaseNeed(project, kit);
  assert.equal(
    selected.supplies.filter(({ productId }) => productId === kit).length,
    1,
  );
  assert.equal(selected.supplies[0].quantity, 1);
  assert.equal(addHomeDepotPurchaseNeed(selected, kit), selected);
  assert.deepEqual(selected.motionPlans, [plan]);
  assert.deepEqual(selected.pieces, project.pieces);
  assert.match(
    homeDepotShoppingList(selected).text,
    /^1 door hardware kit .*#327600104$/m,
  );

  const repeatedSku = {
    ...project,
    store: "4409",
    inventory: [
      {
        material: "stud" as const,
        retailer: "home-depot" as const,
        internetNumber: "327600104",
        name: "Synthetic conflicting match",
        store: "4409",
        zip: "84121",
        price: 15,
        available: 2,
        checkedAt: new Date().toISOString(),
        url: "https://www.homedepot.com/p/327600104",
      },
    ],
  };
  const conflict = homeDepotPurchaseNeeds(repeatedSku).find(
    (row) => row.id === kit,
  )!;
  assert.equal(conflict.missing, null);
  assert.equal(conflict.canAdd, false);
  assert.throws(
    () => addHomeDepotPurchaseNeed(repeatedSku, kit),
    /multiple purchase sources/,
  );
});

test("the bound greenhouse swing moves the actual frame and glazing and clears the original jambs", () => {
  for (const side of ["left", "right"] as const) {
    const { project, plan } = fixture(null, side);
    assert.equal(plan.memberIds.length, 6);
    const review = reviewMotion(project, plan);
    const start = review.preview(0);
    assert.equal(
      start.pieces.filter((piece) => piece.material === "sunlite-8mm").length,
      2,
    );
    assert.equal(review.hits.length, 0);
    assert.equal(review.playbackLimit(0, 90).travel, 90);
    assert.equal(review.playbackLimit(90, 0).travel, 0);
    const opened = review.preview(90);
    assert.ok(opened.pieces.every((piece) => piece.position[2] > 48));
    assert.deepEqual(
      project.pieces.filter((piece) => plan.memberIds.includes(piece.id)),
      start.pieces,
    );
    assert.match(
      greenhouseDoorReview(project, plan)!.lines.join(" "),
      /Left 0\.125 in · Right 0\.125 in/,
    );
  }
});

const stopInputs = { sealGap: 0.125, sillGap: 0.25, reuse: true };

test("the glazed opening fits three cedar stops with live backing and exact shopping, while preserving the travel plan", () => {
  for (const side of ["left", "right"] as const) {
    const { project, plan } = fixture(null, side);
    const result = previewGreenhouseDoorStops(project, plan, stopInputs);
    assert.equal(
      project.pieces.filter((piece) => isGreenhouseDoorStop(piece.designRole))
        .length,
      0,
    );
    const kept = result.project.pieces.filter((piece) =>
      isGreenhouseDoorStop(piece.designRole),
    );
    assert.equal(kept.length, 3);
    assert.deepEqual(
      kept.map(({ size }) => Number(size[1].toFixed(3))),
      [67, 67, 30],
    );
    assert.deepEqual(
      result.rows.map(({ backingDepth }) => Number(backingDepth.toFixed(3))),
      [1.5, 1.5, 0.875],
    );
    assert.ok(
      result.rows.every(
        ({ length, covered, gap }) =>
          Math.abs(length - covered) < 1e-7 && Math.abs(gap - 0.125) < 1e-7,
      ),
    );
    assert.deepEqual(result.project.motionPlans, project.motionPlans);
    assert.equal(reviewMotion(result.project, plan).hits.length, 0);
    assert.equal(
      greenhouseDoorStopReview(result.project, plan).some(
        ({ warning }) => warning,
      ),
      false,
    );
    assert.match(
      guideMarkdown(result.project),
      /Fitted greenhouse door stops[\s\S]*Narrowest backing 0\.875 in/,
    );
    assert.match(
      guideMarkdown(result.project),
      /Lower end 0\.25 in above sill/,
    );
    assert.match(shoppingCsv(result.project), /"206460933","3","board"/);
    assert.equal(
      bom(result.project).find(({ id }) => id === cedarDoorStop.materialId)
        ?.physicalStockUnits,
      3,
    );
    assert.match(
      homeDepotShoppingList(result.project).text,
      /^3 boards .*#206460933$/m,
    );
    assert.equal(
      projectSchema.parse({ ...project, schemaVersion: 57 }).schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
    assert.throws(
      () => previewGreenhouseDoorStops(result.project, plan, stopInputs),
      /already has fitted stops/,
    );
  }
});

test("a hinge pivot that clears the bare opening can bind against a zero-gap stop", () => {
  const { base, setup } = fixture();
  const { project, plan } = saveMotionPlan(
    base,
    greenhouseDoorMotionInput(base, { ...setup, sideOffset: -0.25 }, 45),
  );
  assert.equal(reviewMotion(project, plan).hits.length, 0);
  assert.throws(
    () =>
      previewGreenhouseDoorStops(project, plan, { ...stopInputs, sealGap: 0 }),
    /A stop interferes with the door swing near .*°/,
  );
  const adjusted = previewGreenhouseDoorStops(project, plan, stopInputs);
  assert.equal(reviewMotion(adjusted.project, plan).hits.length, 0);
});

test("a cut-pool cedar remnant becomes the head stop without purchasing its source a second time", () => {
  const { project, plan } = fixture();
  const blank = {
    ...part(
      "Cedar blank",
      cedarDoorStop.materialId,
      [...cedarDoorStop.size],
      [70, 48, 0],
      project.steps[0].id,
      "Prep",
    ),
    stockLengthAxis: 1 as const,
  };
  const cut = cutPiece(
    { ...project, pieces: [...project.pieces, blank] },
    blank.id,
    60,
    1,
  );
  const remnant = cut.pieces.find(
    (piece) =>
      piece.offcut &&
      piece.cutStock?.id ===
        cut.pieces.find(({ id }) => id === blank.id)?.cutStock?.id,
  )!;
  const result = previewGreenhouseDoorStops(cut, plan, stopInputs);
  assert.equal(result.rows[2].reused, remnant.id);
  const head = result.project.pieces.find(({ id }) => id === remnant.id)!;
  assert.equal(head.offcut, false);
  assert.equal(head.cutStock?.id, remnant.cutStock?.id);
  assert.equal(inspectCutStock(result.project).invalid.length, 0);
  assert.equal(
    bom(result.project).find(({ id }) => id === cedarDoorStop.materialId)
      ?.physicalStockUnits,
    3,
  );
  assert.equal(
    result.project.pieces.filter(
      (piece) => piece.offcut && piece.cutStock?.id === head.cutStock?.id,
    ).length,
    1,
  );
});

test("missing backing and a block across an accepted stop position are surfaced instead of committing intersecting stops", () => {
  const { project, plan } = fixture();
  const added = previewGreenhouseDoorStops(project, plan, stopInputs);
  const stop = added.project.pieces.find(({ id }) => id === added.stopIds[0])!;
  const obstacle = part(
    "Existing trim",
    "one-two",
    [0.75, 2, 1.5],
    stop.position,
    project.steps[0].id,
    "Test",
  );
  assert.throws(
    () =>
      previewGreenhouseDoorStops(
        { ...project, pieces: [...project.pieces, obstacle] },
        plan,
        stopInputs,
      ),
    /overlaps a modeled part/,
  );
  const moved = {
    ...added.project,
    pieces: added.project.pieces.map((piece) =>
      piece.id === stop.id
        ? {
            ...piece,
            position: [
              piece.position[0] + 0.25,
              ...piece.position.slice(1),
            ] as V3,
          }
        : piece,
    ),
  };
  assert.equal(greenhouseDoorStopReview(moved, plan)[0].warning, true);
  assert.ok(
    validate(moved).some(({ id }) => id === `greenhouse-door-stops-${plan.id}`),
  );
  assert.equal(greenhouseDoorReview(moved, plan)?.warning, null);
});

test("the original greenhouse glazing collision and an intermediate obstruction remain detectable", () => {
  const { project, plan } = fixture();
  const generic = saveMotionPlan(project, {
    label: "Generic centered hinge",
    memberIds: plan.memberIds,
    mechanism: {
      kind: "hinge",
      axis: [0, 1, 0],
      pivot: motionPivotPreset(project, plan.memberIds, "left"),
      travel: 90,
    },
  });
  assert.ok(
    reviewMotion(generic.project, generic.plan).hits.some(
      (hit) => hit.kind === "envelope",
    ),
  );
  const review = reviewMotion(project, plan);
  const pose = review.preview(45).pieces[1];
  const obstacle = part(
    "Test obstruction",
    "stud",
    [0.5, 2, 0.5],
    pose.position,
    project.steps[0].id,
    "Test",
  );
  const blocked = reviewMotion(
    { ...project, pieces: [...project.pieces, obstacle] },
    plan,
  );
  assert.deepEqual(blocked.preview(0).interferenceIds, []);
  assert.deepEqual(blocked.preview(90).interferenceIds, []);
  const limit = blocked.playbackLimit(0, 90);
  assert.ok(limit.travel > 35 && limit.travel < 48);
  assert.ok(
    blocked
      .preview(limit.travel, limit.inspectAt)
      .interferenceIds.includes(obstacle.id),
  );
});

test("adjusted fitted glazing stales the hinge placement and the updated review preserves the new measured offsets", () => {
  const { project, plan, setup } = fixture("everbilt-24417-gate-kit");
  const panel = project.pieces.find(
    (piece) =>
      plan.memberIds.includes(piece.id) && piece.material === "sunlite-8mm",
  )!;
  const updated = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === panel.id
        ? {
            ...piece,
            position: [
              piece.position[0],
              piece.position[1],
              piece.position[2] + 0.25,
            ] as typeof piece.position,
          }
        : piece,
    ),
  };
  assert.match(
    greenhouseDoorReview(updated, plan)!.warning!,
    /hinge datum changed/,
  );
  assert.throws(() => reviewMotion(updated, plan), /hinge datum changed/);
  assert.equal(doorKitDemand(updated, setup.kitId!).needed, 0);
  assert.ok(
    validate(updated).some(
      (finding) => finding.id === `greenhouse-door-${plan.id}`,
    ),
  );
  const refreshed = saveMotionPlan(
    updated,
    greenhouseDoorMotionInput(
      updated,
      { ...setup, outset: 0.25, sideOffset: 0.125 },
      90,
    ),
    plan.id,
  );
  const motion = motionSetup(refreshed.project, refreshed.plan).mechanism;
  assert.equal(motion.kind, "hinge");
  assert.ok(Math.abs(motion.pivot[2] - 48.5) < 1e-7);
  assert.match(
    guideMarkdown(refreshed.project),
    /Exterior 0\.25 in · Toward jamb 0\.125 in/,
  );
});

test("the exact two kits have independent sell units, retailer observations, and a preserved older project", () => {
  for (const id of Object.keys(greenhouseDoorKits) as GreenhouseDoorKitId[]) {
    const kit = greenhouseDoorKits[id];
    const { project, plan, base } = fixture(id);
    assert.equal(
      projectSchema.parse({ ...base, schemaVersion: 20 }).schemaVersion,
      PROJECT_FORMAT_VERSION,
    );
    const withKit = addMissingDoorKits(
      { ...project, retailer: kit.retailer },
      id,
    );
    assert.equal(withKit.supplies[0].quantity, 1);
    assert.equal(addMissingDoorKits(withKit, id), withKit);
    assert.deepEqual(withKit.pieces, base.pieces);
    const checkedAt = "2026-11-19T21:32:00.000Z";
    const observed = recordSupplyInventory(
      { ...withKit, store: "Synthetic QA" },
      {
        productId: id,
        retailer: kit.retailer,
        retailerProductId: kit.retailerId,
        url: kit.listing,
        store: "Synthetic QA",
        zip: "84121",
        price: 32,
        available: 3,
        checkedAt,
      },
    );
    const row = supplyRows(observed, Date.parse(checkedAt))[0];
    assert.equal(row.total, 32);
    assert.equal(row.contents[0].quantity, 2);
    assert.match(
      shoppingCsv(observed),
      new RegExp(`"${kit.retailerId}","1","door hardware kit"`),
    );
    assert.ok(guideMarkdown(observed).includes(kit.instructions));
    assert.deepEqual(
      projectSchema.parse(JSON.parse(JSON.stringify(observed))).motionPlans,
      [plan],
    );
  }
});
