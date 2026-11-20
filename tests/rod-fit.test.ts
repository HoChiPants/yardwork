import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import {
  bom,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
  validate,
} from "../src/engine";
import { blank, part, projectSchema, type Project, type V3 } from "../src/model";
import { PROJECT_FORMAT_VERSION } from "../src/projectVersion";
import { reviewRodBracketMount, rodBracketBackingChoices, saveRodBracketMount } from "../src/rodBracketMounts";
import { openingAxes } from "../src/throughOpenings";
import {
  reviewSocketPlateFace,
  rodEndCrossesCut,
  socketBoreProblems,
  socketFaceAxes,
} from "../src/rodMountGeometry";
import {
  reviewRodSocketPlates,
  saveRodSocketHoles,
  saveRodSocketPlate,
} from "../src/rodSocketPlates";
import {
  addMissingEverbiltRodBrackets,
  addMissingRodBrackets,
  addMissingRodFlanges,
  addMissingRodSockets,
  applyRodFit,
  closetRods,
  everbiltRodBracketPurchases,
  reviewRodFit,
  rodBay,
  rodBracketPurchases,
  rodFlangePurchases,
  rodSocketPurchases,
  saveRodFit,
} from "../src/rodFits";
import {
  reviewRodSupports,
  saveRodSupport,
  removeRodSupport,
} from "../src/rodSupports";
import { toolChecklist } from "../src/tools";
import { composeRotation, rotate } from "../src/spatial";
import {
  everbiltClosetRod,
  everbiltRodBracket,
} from "../src/closetRodReference";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { stockCutSequences } from "../src/stockCutSequence";
import {
  recordStockCutLayout,
  saveTubeCutLoss,
} from "../src/recordStockCutLayout";
import { cutSourceRegion } from "../src/cutSourceAxes";
import { cutKerf, inspectCutStock } from "../src/cutStock";
import { cutStockLayout } from "../src/cutStockLayout";
import { resizeByCuts } from "../src/cutPlan";

const study = (width?: number) => {
  const options = defaultBuildStudyParameters("closet-insert");
  return createBuildStudy(
    "closet-insert",
    { ...options, width: width ?? options.width },
    blank(),
    {
      closetRod: {
        materialId: "closet-rod-72",
        productRegistryRef: "project-source-27773pholg",
      },
    },
  ).project;
};
const measurements = {
  measuredSpan: 26,
  startSetback: 0.25,
  endSetback: 0.125,
  clearance: 0.125,
  closedEnd: "start",
  basis: "Synthetic test: measured at the centerline with sample flanges.",
  measuredAt: "2026-11-19T05:00:00Z",
};
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8);

function everbiltStudy(width = 80) {
  return createBuildStudy(
    "closet-insert",
    {
      ...defaultBuildStudyParameters("closet-insert"),
      width,
    },
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
      closetRod: {
        materialId: everbiltClosetRod.materialId,
        productRegistryRef: everbiltClosetRod.productId,
      },
    },
  ).project;
}

test("Home Depot closet rods share counted stock and add exact socket pairs once", () => {
  const p = everbiltStudy();
  const [first, second] = closetRods(p);
  assert.equal(first.size[0], 1.31);
  assert.equal(second.material, first.material);
  const stock = bom(p).find((row) => row.id === everbiltClosetRod.materialId)!;
  assert.equal(stock.quantity, 1);
  assert.equal(stock.bins[0].cuts.length, 2);
  assert.deepEqual(rodSocketPurchases(p), {
    needed: 2,
    selected: 0,
    missing: 2,
  });
  assert.ok(
    homeDepotShoppingList(p).reviews.some((row) => row.name.includes("311V")),
  );
  const updated = addMissingRodSockets(p);
  assert.deepEqual(updated.pieces, p.pieces);
  assert.deepEqual(rodSocketPurchases(updated), {
    needed: 2,
    selected: 2,
    missing: 0,
  });
  assert.strictEqual(addMissingRodSockets(updated), updated);
  assert.match(homeDepotShoppingList(updated).text, /1 rod .*#334188606/);
  assert.match(
    homeDepotShoppingList(updated).text,
    /2 socket pairs .*#334188235/,
  );
  assert.match(
    homeDepotHandoff(updated),
    /2 end-socket pairs planned · 2 selected · 0 missing/,
  );
  assert.equal(
    homeDepotShoppingList(updated).items.find(
      (item) => item.productId === "334188606",
    )?.snapshot,
    undefined,
  );
});

test("a measured Everbilt cut sequence records two installed rods and one tube offcut as a single source", () => {
  const stockSequence = (p: ReturnType<typeof everbiltStudy>) =>
    stockCutSequences(p, bom(p)).get(everbiltClosetRod.materialId)?.[0];
  const source = everbiltStudy();
  const rods = closetRods(source);
  assert.match(
    stockSequence(source)?.review ?? "",
    /Measure the actual opening/,
  );
  let fitted = source;
  for (const rod of rods) {
    fitted = saveRodFit(fitted, rod.id, {
      ...measurements,
      measuredSpan: rodBay(fitted, rod.id).span,
    });
    assert.equal(reviewRodFit(fitted, rod.id).matchesModel, false);
    fitted = applyRodFit(fitted, rod.id);
    assert.equal(reviewRodFit(fitted, rod.id).matchesModel, true);
  }
  const sequence = stockSequence(fitted)!;
  assert.equal(sequence.review, undefined);
  assert.equal(sequence.layout.kind, "tube");
  assert.equal(sequence.steps.length, 2);
  assert.match(
    guideMarkdown(fitted),
    /Tube 1[\s\S]+modeled kerf[\s\S]+Crosscut/,
  );

  const { project, sourceId, offcuts } = recordStockCutLayout(
    fitted,
    sequence.layout,
  );
  assert.equal(offcuts, 1);
  const [first, second] = closetRods(project);
  assert.deepEqual({ ...first, cutStock: null }, closetRods(fitted)[0]);
  assert.deepEqual({ ...second, cutStock: null }, closetRods(fitted)[1]);
  assert.equal(first.cutStock?.id, sourceId);
  assert.equal(second.cutStock?.id, sourceId);
  const remainder = project.pieces.find(
    (part) => part.offcut && part.cutStock?.id === sourceId,
  )!;
  const kerf = cutKerf(first.material);
  near(cutSourceRegion(second).offset[2], first.size[1] + kerf);
  near(first.size[1] + second.size[1] + remainder.size[1] + 2 * kerf, 96);
  assert.equal(remainder.size[0], 1.31);
  assert.equal(remainder.size[2], 1.31);
  assert.ok(inspectCutStock(project).valid.has(sourceId));
  assert.equal(stockSequence(project), undefined);
  assert.equal(
    bom(project).find((row) => row.id === first.material)?.physicalStockUnits,
    1,
  );
  assert.equal(rodSocketPurchases(project).needed, 2);
  assert.match(guideMarkdown(project), /Recorded one .* tube for 2 parts/);
  assert.throws(
    () => recordStockCutLayout(project, sequence.layout),
    /cut layout changed/,
  );

  const changed = structuredClone(fitted);
  changed.pieces.find(
    ({ id }) => id === changed.rodFitPlans![0].start.pieceId,
  )!.position[0] += 1;
  assert.match(stockSequence(changed)?.review ?? "", /mounting geometry/);
  assert.throws(
    () => recordStockCutLayout(changed, sequence.layout),
    /cut layout changed/,
  );

  const [preview] = stockCutSequences(fitted, bom(fitted), 0.03).get(
    everbiltClosetRod.materialId,
  )!;
  const saved = saveTubeCutLoss(fitted, preview.layout);
  const regrouped = {
    ...saved,
    pieces: saved.pieces.filter(({ id }) => id !== second.id),
  };
  const newGroup = stockSequence(regrouped);
  assert.equal(newGroup?.layout.tubeKerf, undefined);
  assert.match(
    newGroup?.followUp.join("\n") ?? "",
    /assigned to this tube changed/,
  );
});

test("recorded tube loss survives reopening and is used for later trims of that source", () => {
  let fitted = everbiltStudy();
  for (const rod of closetRods(fitted))
    fitted = applyRodFit(
      saveRodFit(fitted, rod.id, {
        ...measurements,
        measuredSpan: rodBay(fitted, rod.id).span,
      }),
      rod.id,
    );
  const rows = bom(fitted);
  const at = (loss?: number) =>
    stockCutSequences(fitted, rows, loss).get(everbiltClosetRod.materialId)![0];
  const modeled = at();
  assert.equal(modeled.layout.tubeKerf, undefined);
  assert.ok(at(95).review);
  assert.throws(
    () => recordStockCutLayout(fitted, { ...modeled.layout, tubeKerf: 0.032 }),
    /cut layout changed/,
  );

  for (const loss of [0, 1 / 32]) {
    const { layout } = at(loss);
    const { project, sourceId } = recordStockCutLayout(fitted, layout);
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    const members = reopened.pieces.filter(
      (piece) => piece.cutStock?.id === sourceId,
    );
    assert.ok(members.every((piece) => piece.cutStock?.tubeKerf === loss));
    const kept = members.filter((piece) => !piece.offcut);
    const leftover = members.find((piece) => piece.offcut)!;
    assert.equal(cutStockLayout(reopened, sourceId).measuredTubeKerf, loss);
    near(
      kept.reduce((sum, rod) => sum + rod.size[1] + loss, 0) + leftover.size[1],
      96,
    );
    assert.match(
      guideMarkdown(reopened),
      new RegExp(`Recorded tube cutting loss: ${loss} in per cut`),
    );
    const trimmed = resizeByCuts(reopened, leftover.id, 20, 1.31);
    const newest = trimmed.pieces.at(-1)!;
    near(newest.size[1], leftover.size[1] - 20 - loss);
    assert.equal(newest.cutStock?.id, sourceId);
    assert.equal(newest.cutStock?.tubeKerf, loss);
    assert.ok(inspectCutStock(trimmed).valid.has(sourceId));
    assert.equal(
      bom(trimmed).find((row) => row.id === everbiltClosetRod.materialId)!
        .quantity,
      1,
    );

    const mismatched = structuredClone(trimmed);
    mismatched.pieces.at(-1)!.cutStock!.tubeKerf = loss + 0.01;
    assert.match(inspectCutStock(mismatched).invalid[0].detail, /disagree/);
  }
});

test("each tube saves its loss before cutting and the guide follows the saved plan", () => {
  let fitted = everbiltStudy(190);
  for (const rod of closetRods(fitted)) {
    fitted = saveRodFit(fitted, rod.id, {
      ...measurements,
      measuredSpan: rodBay(fitted, rod.id).span,
    });
    fitted = applyRodFit(fitted, rod.id);
  }
  const at = (p: typeof fitted, loss?: number | null) =>
    stockCutSequences(p, bom(p), loss).get(everbiltClosetRod.materialId)!;
  const first = at(fitted, 0)[0];
  const planned = saveTubeCutLoss(fitted, first.layout);
  const second = at(planned, 0.032)[1];
  const both = saveTubeCutLoss(planned, second.layout);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(both)));
  assert.deepEqual(reopened.pieces, fitted.pieces);
  assert.equal(
    reopened.pieces.some((p) => p.offcut || p.cutStock),
    false,
  );
  assert.deepEqual(
    at(reopened).map((unit) => unit.layout.tubeKerf),
    [0, 0.032],
  );
  assert.match(guideMarkdown(reopened), /Tube 1\n\n[^\n]+0 in measured loss/);
  assert.match(
    guideMarkdown(reopened),
    /Tube 2\n\n[^\n]+0\.032 in measured loss/,
  );

  const recorded = recordStockCutLayout(
    reopened,
    at(reopened)[0].layout,
  ).project;
  assert.equal(recorded.tubeCutPlans?.length, 1);
  assert.equal(at(recorded)[0].layout.tubeKerf, 0.032);
  assert.equal(recorded.pieces.find((p) => p.offcut)?.cutStock?.tubeKerf, 0);
  const cleared = saveTubeCutLoss(recorded, at(recorded, null)[0].layout);
  assert.equal(cleared.tubeCutPlans, undefined);
  assert.equal(at(cleared)[0].layout.tubeKerf, undefined);
  assert.match(guideMarkdown(cleared), /0\.125 in modeled kerf/);
  assert.throws(
    () => saveTubeCutLoss(recorded, first.layout),
    /cut layout changed/,
  );
});

test("Everbilt bracket demand follows explicit matching field reach on the current measured rod", () => {
  const project = everbiltStudy();
  const rod = closetRods(project)[0];
  const opening = rodBay(project, rod.id);
  const measured = applyRodFit(
    saveRodFit(project, rod.id, {
      ...measurements,
      measuredSpan: opening.span,
    }),
    rod.id,
  );
  const fit = reviewRodFit(measured, rod.id);
  const input = {
    fromStart: opening.span / 2,
    wallToRod: 11,
    bracketReach: 11,
    backing: "Test fixture measurements and site notes.",
  };
  const legacy = saveRodSupport(measured, fit, input);
  assert.equal(
    everbiltRodBracketPurchases(
      projectSchema.parse({ ...legacy, schemaVersion: 37 }),
    ).needed,
    0,
  );
  const identity = { bracketProductId: everbiltRodBracket.productId };
  for (const bracketReach of [null, 9]) {
    const unfinished = saveRodSupport(measured, fit, {
      ...input,
      ...identity,
      bracketReach,
    });
    assert.equal(everbiltRodBracketPurchases(unfinished).needed, 0);
    assert.strictEqual(addMissingEverbiltRodBrackets(unfinished), unfinished);
  }
  const ready = saveRodSupport(measured, fit, { ...input, ...identity });
  assert.deepEqual(everbiltRodBracketPurchases(ready), {
    needed: 1,
    selected: 0,
    missing: 1,
  });
  const need = homeDepotPurchaseNeeds(ready).find(
    ({ id }) => id === everbiltRodBracket.productId,
  );
  assert.equal(need?.canAdd, true);
  assert.equal(need?.required, 1);
  const purchased = addMissingEverbiltRodBrackets(ready);
  assert.deepEqual(purchased.pieces, ready.pieces);
  assert.deepEqual(everbiltRodBracketPurchases(purchased), {
    needed: 1,
    selected: 1,
    missing: 0,
  });
  assert.strictEqual(addMissingEverbiltRodBrackets(purchased), purchased);
  assert.match(
    homeDepotShoppingList(purchased).text,
    /1 intermediate bracket .*#206086899/,
  );
  assert.match(
    guideMarkdown(purchased),
    /Everbilt 14317 intermediate brackets · Measured positions 1 · Selected 1/,
  );
  const shortened = cutPiece(purchased, rod.id, 20);
  assert.deepEqual(everbiltRodBracketPurchases(shortened), {
    needed: 0,
    selected: 1,
    missing: 0,
  });
});

function mountedBracketFixture() {
  const base = everbiltStudy();
  const rod = closetRods(base)[0];
  const bay = rodBay(base, rod.id);
  const fitted = applyRodFit(saveRodFit(base, rod.id, {
    ...measurements, measuredSpan: bay.span,
  }), rod.id);
  const fromStart = bay.span / 2;
  const supportInput = {
    fromStart,
    wallToRod: 11,
    bracketReach: 11,
    bracketProductId: everbiltRodBracket.productId,
    backing: "Synthetic test mount on vertical wood.",
  };
  const plan = saveRodSupport(fitted, reviewRodFit(fitted, rod.id), supportInput);
  const support = plan.rodFitPlans![0].intermediateSupports![0];
  const [x, y, z] = support.centerWorld;
  const backing = part("Bracket backing", "stud", [3.5, 10, 1.5], [x, y - 2, z - 11.75], base.steps[0].id, "Wall");
  const project = { ...plan, pieces: [...plan.pieces, backing] };
  const input = {
    pieceId: backing.id,
    width: 1.25,
    height: 5,
    alongOffset: 0,
    heightOffset: -2,
    centers: [[0, -1], [0, 1]],
    pilotDiameter: 0.125,
    pilotDepth: 1,
    screwDiameter: 0.2,
    screwDepth: 1,
    basis: "Synthetic measured geometry for backing test.",
  };
  const save = (raw: unknown = input) => saveRodBracketMount(project, rod.id, support.id, raw);
  const review = (current: Project = project) => {
    const fit = reviewRodFit(current, rod.id);
    return reviewRodBracketMount(current, fit, fit.plan!.intermediateSupports![0]);
  };
  return { project, fitted, rodId: rod.id, support, supportInput, backing, input, save, review };
}

test("Everbilt center hardware transfers measured marks from a projected rod station to actual wood", () => {
  const { project, rodId, support, backing, input, save, review } = mountedBracketFixture();
  const fit = reviewRodFit(project, rodId);
  const choices = rodBracketBackingChoices(project, fit, support);
  assert.deepEqual(choices.map(({ piece }) => piece.id), [backing.id]);
  near(choices[0].reach, 11);
  const saved = save();
  const mounted = review(saved);
  assert.equal(mounted?.state, "checked");
  assert.deepEqual(mounted?.holes?.marks.map(({ local }) => local.map((n) => Number(n.toFixed(6)))), [[0, -1, 0.75], [0, 1, 0.75]]);
  assert.equal(mounted?.outline?.length, 4);
  assert.deepEqual(saved.pieces, project.pieces);
  assert.equal(everbiltRodBracketPurchases(saved).needed, 1);
  assert.match(homeDepotShoppingList(addMissingEverbiltRodBrackets(saved)).text, /1 intermediate bracket .*#206086899/);
  assert.match(guideMarkdown(saved), /Bracket hole 2 · local X\/Y\/Z from backing blank center · 0 in, 1 in, 0\.75 in/);
  const imported = projectSchema.parse(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(imported.rodFitPlans, saved.rodFitPlans);
  assert.equal(review(imported)?.state, "checked");
  assert.match(JSON.stringify(toolChecklist(saved).requirements), /2 transferred bracket holes/);
  assert.ok(toolChecklist(save({ ...input, pilotDiameter: 1 / 16 })).requirements.some(({ capability }) => capability === "pilot-bit-1-16"));
  assert.equal(projectSchema.parse({ ...project, schemaVersion: 58 }).schemaVersion, PROJECT_FORMAT_VERSION);
});

test("oversize or duplicate bracket paths pause mount marks and exact hardware demand", () => {
  const { input, save, review, support, rodId } = mountedBracketFixture();
  const saved = save({ ...input, pilotDepth: 1.6, centers: [[0, 0], [0, 0.1]] });
  const result = review(saved);
  assert.equal(result?.state, "conflict");
  assert.equal(result?.holes?.marks.length, 2);
  assert.match(result!.holes!.marks[0].issues.join(" "), /back of the panel.*meets hole 2/);
  assert.equal(everbiltRodBracketPurchases(saved).needed, 0);
  assert.doesNotMatch(guideMarkdown(saved), /Bracket hole \d · local X\/Y\/Z/);
  assert.ok(!toolChecklist(saved).requirements.some(({ capability }) => capability === "pilot-bit-1-16"));
  assert.ok(validate(saved).some(({ id, pieceId }) =>
    id === `rod-bracket-mount-${support.id}` && pieceId === input.pieceId));
  const staleFit = { ...saved, pieces: saved.pieces.filter(({ id }) => id !== rodId) };
  assert.equal(review(staleFit)?.state, "stale");
});

test("moving backing or changing support position stales the transferred bracket marks", () => {
  const { backing, rodId, support, supportInput, save, review } = mountedBracketFixture();
  const original = save();
  const shifted = {
    ...original, pieces: original.pieces.map((piece) => piece.id === backing.id ? {
      ...piece, position: [piece.position[0] + 0.25, piece.position[1], piece.position[2]] as V3,
    } : piece),
  };
  assert.equal(review(shifted)?.state, "stale");
  assert.doesNotMatch(guideMarkdown(shifted), /Bracket hole \d · local X\/Y\/Z/);
  const changed = saveRodSupport(original, reviewRodFit(original, rodId), {
    ...supportInput, fromStart: supportInput.fromStart + 1,
  }, support.id);
  assert.deepEqual(changed.rodFitPlans?.[0].intermediateSupports?.[0].mounting, original.rodFitPlans?.[0].intermediateSupports?.[0].mounting);
  assert.equal(review(changed)?.state, "stale");
});

test("Everbilt site measurements use the actual 96-inch stock and leave intermediate spacing open", () => {
  const project = everbiltStudy(190);
  const rod = closetRods(project)[0];
  const opening = rodBay(project, rod.id);
  assert.ok(opening.span > 72);
  const measured = saveRodFit(project, rod.id, {
    ...measurements,
    measuredSpan: opening.span,
  });
  const current = applyRodFit(measured, rod.id);
  const review = reviewRodFit(current, rod.id);
  assert.equal(review.state, "measured");
  assert.equal(review.plan?.rodMaterial, everbiltClosetRod.materialId);
  near(review.length!, opening.span - 0.5);
  assert.equal(reviewRodSupports(review).spacingReference, null);
  assert.equal(reviewRodSupports(review).suggestion, null);
  assert.equal(rodFlangePurchases(current).needed, 0);
  assert.ok(
    validate(current).some(
      (row) => row.id === `rod-spacing-reference-${rod.id}`,
    ),
  );
  assert.match(guideMarkdown(current), /hacksaw or pole cutter/);
  assert.match(guideMarkdown(current), /Confirm bracket spacing/);
  assert.doesNotMatch(guideMarkdown(current), /the 32 in spacing reference/);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(current))).rodFitPlans,
    current.rodFitPlans,
  );

  const switched = {
    ...current,
    pieces: current.pieces.map((piece) =>
      piece.id === rod.id
        ? {
            ...piece,
            material: "closet-rod-72" as const,
            size: [1.3125, 70, 1.3125] as typeof piece.size,
          }
        : piece,
    ),
  };
  assert.equal(reviewRodFit(switched, rod.id).state, "stale");
});

test("both rods find real distinct opposing panels, and measured end offsets update a rod without inventing a stock cut", () => {
  const project = study();
  const [left, right] = closetRods(project);
  const a = rodBay(project, left.id),
    b = rodBay(project, right.id);
  near(a.span, 26);
  near(b.span, 26);
  assert.equal(
    project.pieces.find((p) => p.id === a.start.pieceId)?.designRole,
    "side-left",
  );
  assert.equal(
    project.pieces.find((p) => p.id === b.end.pieceId)?.designRole,
    "side-right",
  );

  const measured = saveRodFit(project, left.id, measurements);
  assert.equal(reviewRodFit(measured, left.id).length, 25.5);
  const moved = applyRodFit(measured, left.id);
  const changed = moved.pieces.find((piece) => piece.id === left.id)!;
  assert.equal(changed.size[1], 25.5);
  near(changed.position[0] - left.position[0], 0.0625);
  assert.equal(changed.cutStock, null);
  assert.deepEqual(
    moved.pieces.find((p) => p.id === right.id),
    right,
  );
  assert.equal(
    reviewRodFit(moved, left.id).note,
    "The model matches this fit.",
  );
  assert.match(
    guideMarkdown(moved),
    /Closet rod fits[\s\S]+Cut length 25\.5 in/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(moved))).rodFitPlans,
    moved.rodFitPlans,
  );
});

test("current relative fit follows a rigid transform and becomes stale when a mounting panel changes", () => {
  const project = study();
  const id = closetRods(project)[0].id;
  const fitted = saveRodFit(project, id, measurements);
  const rotation = [0, Math.PI / 3, 0] as const;
  const allMoved = {
    ...fitted,
    pieces: fitted.pieces.map((p) => {
      const [x, y, z] = rotate(p.position, [...rotation]);
      return {
        ...p,
        position: [x + 14, y + 3, z - 9] as typeof p.position,
        rotation: composeRotation([...rotation], p.rotation),
      };
    }),
  };
  assert.equal(reviewRodFit(allMoved, id).state, "measured");
  const mountId = fitted.rodFitPlans![0].start.pieceId;
  const altered = structuredClone(fitted);
  altered.pieces.find((p) => p.id === mountId)!.position[0] -= 1;
  assert.equal(reviewRodFit(altered, id).state, "stale");
  assert.equal(rodFlangePurchases(altered).needed, 0);
  assert.ok(
    validate(altered).some((finding) => finding.id === `rod-fit-${id}`),
  );
  assert.doesNotMatch(guideMarkdown(altered), /Cut length 25\.5 in/);
});

test("wide spans need intermediate review and model application respects actual measurements and physical cut lineage", () => {
  const wide = study(106);
  const id = closetRods(wide)[0].id;
  assert.equal(reviewRodFit(wide, id).intermediate, 1);
  assert.ok(validate(wide).some((finding) => finding.id === `rod-span-${id}`));

  const project = study();
  const rod = closetRods(project)[0];
  const mismatch = saveRodFit(project, rod.id, {
    ...measurements,
    measuredSpan: 25,
  });
  assert.equal(reviewRodFit(mismatch, rod.id).canApply, false);
  assert.match(reviewRodFit(mismatch, rod.id).note, /differs/);
  const planned = saveRodFit(project, rod.id, measurements);
  const cut = cutPiece(planned, rod.id, 25, 1);
  assert.equal(reviewRodFit(cut, rod.id).canApply, false);
  assert.throws(() => applyRodFit(cut, rod.id), /recorded stock/);
});

test("explicit purchasing adds one exact pair per measured rod and stays idempotent", () => {
  let project = { ...study(), retailer: "lowes" as const };
  for (const rod of closetRods(project))
    project = {
      ...saveRodFit(project, rod.id, measurements),
      retailer: "lowes",
    };
  assert.deepEqual(rodFlangePurchases(project), {
    needed: 2,
    selected: 0,
    missing: 2,
  });
  const selected = addMissingRodFlanges(project);
  assert.equal(selected.supplies[0].quantity, 2);
  assert.equal(selected.supplies[0].productId, "project-source-23723phslg");
  assert.equal(selected.pieces, project.pieces);
  assert.equal(addMissingRodFlanges(selected), selected);
  assert.match(shoppingCsv(selected), /50005274/);
  assert.throws(
    () => addMissingRodFlanges({ ...project, retailer: "home-depot" }),
    /selected retailer/,
  );
  const older = { ...blank(), schemaVersion: 13 };
  assert.deepEqual(projectSchema.parse(older), {
    ...older,
    schemaVersion: blank().schemaVersion,
  });
});

test("wide rod layout measures usable gaps, records backing and buys each exact bracket once", () => {
  const project = { ...study(106), retailer: "lowes" as const };
  const id = closetRods(project)[0].id;
  const input = {
    fromStart: 19.5,
    wallToRod: null,
    bracketReach: null,
    backing: "QA backing note",
  };
  assert.throws(
    () => saveRodSupport(project, reviewRodFit(project, id), input),
    /current field measurements/,
  );
  const measured = saveRodFit(project, id, {
    ...measurements,
    measuredSpan: 39,
  });
  const fit = reviewRodFit(measured, id);
  near(reviewRodSupports(fit).suggestion!, 19.5);
  assert.throws(
    () => saveRodSupport(measured, fit, { ...input, fromStart: 0.2 }),
    /inside both/,
  );
  const pending = saveRodSupport(measured, fit, input);
  const pendingFit = reviewRodFit(pending, id);
  let layout = reviewRodSupports(pendingFit);
  assert.equal(layout.rows[0].state, "pending");
  assert.deepEqual(
    layout.intervals.map(({ length }) => Number(length.toFixed(4))),
    [19.5, 19.5],
  );
  assert.ok(!validate(pending).some((row) => row.id === `rod-span-${id}`));
  assert.ok(validate(pending).some((row) => row.id === `rod-supports-${id}`));
  assert.throws(
    () => saveRodSupport(pending, pendingFit, { ...input, fromStart: 19.51 }),
    /already recorded/,
  );
  const supportId = layout.rows[0].support.id;
  const wrongReach = saveRodSupport(
    pending,
    pendingFit,
    { ...input, wallToRod: 10, bracketReach: 11 },
    supportId,
  );
  layout = reviewRodSupports(reviewRodFit(wrongReach, id));
  assert.equal(layout.rows[0].state, "conflict");
  assert.ok(layout.exceedsReference);
  assert.equal(rodBracketPurchases(wrongReach).needed, 0);
  const matched = saveRodSupport(
    wrongReach,
    reviewRodFit(wrongReach, id),
    { ...input, wallToRod: 10.015625, bracketReach: 10 },
    supportId,
  );
  const modeled = applyRodFit(matched, id);
  layout = reviewRodSupports(reviewRodFit(modeled, id));
  assert.equal(layout.rows[0].state, "reach-reviewed");
  assert.ok(!validate(modeled).some((row) => row.id === `rod-supports-${id}`));
  assert.match(
    guideMarkdown(modeled),
    /19\.5 in from start[\s\S]*QA backing note/,
  );
  assert.match(
    JSON.stringify(toolChecklist(modeled)),
    /Review intermediate bracket position/,
  );
  const selected = addMissingRodBrackets(modeled);
  assert.equal(selected.supplies[0].productId, "project-source-27587phllg");
  assert.deepEqual(rodBracketPurchases(selected), {
    needed: 1,
    selected: 1,
    missing: 0,
  });
  assert.equal(addMissingRodBrackets(selected), selected);
  assert.equal(selected.pieces, modeled.pieces);
  assert.match(shoppingCsv(selected), /50376150/);
  assert.throws(
    () => addMissingRodBrackets({ ...modeled, retailer: "home-depot" }),
    /selected retailer/,
  );
  const portable = projectSchema.parse(JSON.parse(JSON.stringify(selected)));
  assert.deepEqual(portable.rodFitPlans, selected.rodFitPlans);
  const withoutSupport = removeRodSupport(
    portable,
    portable.rodFitPlans![0],
    supportId,
  );
  assert.equal(rodBracketPurchases(withoutSupport).needed, 0);
  assert.equal(rodBracketPurchases(withoutSupport).selected, 1);

  const tampered = structuredClone(portable);
  const supports = tampered.rodFitPlans![0].intermediateSupports!;
  supports.push({ ...supports[0], id: crypto.randomUUID(), fromStart: 19.51 });
  assert.equal(projectSchema.safeParse(tampered).success, false);
});

test("field references retain original positions after a bay moves or allowance changes", () => {
  const project = study(106);
  const id = closetRods(project)[0].id;
  const field = { ...measurements, measuredSpan: 39 };
  const fit14 = { ...saveRodFit(project, id, field), schemaVersion: 14 };
  const measured = projectSchema.parse(fit14);
  assert.equal(measured.schemaVersion, blank().schemaVersion);
  assert.deepEqual(measured.rodFitPlans, fit14.rodFitPlans);
  const planned = saveRodSupport(measured, reviewRodFit(measured, id), {
    fromStart: 19.5,
    wallToRod: 10,
    bracketReach: 10,
    backing: "QA wall framing",
  });
  const moved = {
    ...planned,
    pieces: planned.pieces.map((p) => ({
      ...p,
      position: [
        p.position[0] + 12,
        p.position[1],
        p.position[2],
      ] as typeof p.position,
    })),
  };
  assert.equal(reviewRodFit(moved, id).state, "measured");
  assert.equal(
    reviewRodSupports(reviewRodFit(moved, id)).rows[0].state,
    "stale",
  );
  assert.equal(rodBracketPurchases(moved).needed, 0);
  assert.match(guideMarkdown(moved), /take fresh site measurements/);
  assert.doesNotMatch(guideMarkdown(moved), /19\.5 in from start/);
  const remeasured = saveRodFit(planned, id, { ...field, startSetback: 0.5 });
  const row = reviewRodSupports(reviewRodFit(remeasured, id)).rows[0];
  assert.equal(row.state, "stale");
  assert.deepEqual(
    row.support,
    planned.rodFitPlans![0].intermediateSupports![0],
  );
  const refreshed = saveRodSupport(
    remeasured,
    reviewRodFit(remeasured, id),
    {
      fromStart: row.support.fromStart,
      wallToRod: row.support.wallToRod,
      bracketReach: row.support.bracketReach,
      backing: row.support.backing,
    },
    row.support.id,
  );
  assert.equal(
    reviewRodSupports(reviewRodFit(refreshed, id)).rows[0].state,
    "reach-reviewed",
  );
});

test("a rod end cannot reuse a backing face through a saved rectangular or round opening", () => {
  const project = everbiltStudy();
  const rod = closetRods(project)[0];
  const bay = rodBay(project, rod.id);
  const { axis, across } = socketFaceAxes(bay.start.normalLocal)!;
  const center: [number, number] = across.map(
    (coord) => bay.start.pointLocal[coord],
  ) as [number, number];
  for (const shape of [
    { roundOpenings: [{ axis, center, diameter: 0.75 }] },
    { rectangularOpenings: [{ axis, center, spans: [1, 1] }] },
  ]) {
    const cut = projectSchema.parse({
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === bay.start.pieceId ? { ...piece, ...shape } : piece,
      ),
    });
    assert.throws(() => rodBay(cut, rod.id), /through-cut across the rod end/);
    assert.match(reviewRodFit(cut, rod.id).note, /retained backing/);
    assert.ok(
      validate(cut).some((finding) => finding.id === `rod-fit-${rod.id}`),
    );
    assert.ok(
      rodSocketPurchases(cut).needed < rodSocketPurchases(project).needed,
    );
  }
});

test("a socket uses the measured asymmetric envelope and distinguishes a distant cut, a flange conflict and a stale record", () => {
  const project = everbiltStudy();
  const rod = closetRods(project)[0];
  const initial = rodBay(project, rod.id);
  const { axis, across } = socketFaceAxes(initial.start.normalLocal)!;
  const mount = project.pieces.find(
    (piece) => piece.id === initial.start.pieceId,
  )!;
  const [u, v] = across;
  const holeCenter: [number, number] = [
    initial.start.pointLocal[u] + 1.1,
    initial.start.pointLocal[v] + 0.1,
  ];
  const stock = projectSchema.parse({
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === mount.id
        ? {
            ...piece,
            roundOpenings: [{ axis, center: holeCenter, diameter: 0.4 }],
          }
        : piece,
    ),
  });
  const fit = saveRodFit(stock, rod.id, {
    ...measurements,
    measuredSpan: initial.span,
  });
  const tooWide = saveRodSocketPlate(fit, rod.id, "start", {
    extents: [0.7, 1.3, 0.7, 0.7],
    basis: "Synthetic measured backplate; upper wing extends farther.",
  });
  let row = reviewRodSocketPlates(tooWide, reviewRodFit(tooWide, rod.id))[0];
  assert.equal(row.state, "conflict");
  assert.match(row.detail, /crosses a through-cut/);
  assert.ok(
    validate(tooWide).some(
      (finding) => finding.id === `rod-socket-${rod.id}-start`,
    ),
  );
  const narrow = saveRodSocketPlate(tooWide, rod.id, "start", {
    extents: [0.7, 0.7, 0.7, 0.7],
    basis: "Synthetic narrow delivered envelope.",
  });
  row = reviewRodSocketPlates(narrow, reviewRodFit(narrow, rod.id))[0];
  assert.equal(row.state, "backed");
  assert.ok(row.outline);
  const area = guideMarkdown(narrow);
  assert.match(
    area,
    /Start socket backplate[\s\S]*recorded backplate envelope fits/,
  );
  assert.match(area, /Synthetic narrow delivered envelope/);
  assert.deepEqual(narrow.pieces, stock.pieces);
  assert.deepEqual(narrow.supplies, stock.supplies);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(narrow))).rodFitPlans,
    narrow.rodFitPlans,
  );
  assert.equal(
    projectSchema.parse({ ...fit, schemaVersion: 45 }).rodFitPlans?.[0]
      .socketPlates,
    undefined,
  );
  const moved = {
    ...narrow,
    pieces: narrow.pieces.map((piece) => ({
      ...piece,
      position: piece.position.map((v) => v + 10) as V3,
    })),
  };
  assert.equal(
    reviewRodSocketPlates(moved, reviewRodFit(moved, rod.id))[0].state,
    "backed",
  );
  const swapped = saveRodFit(narrow, rod.id, {
    ...measurements,
    measuredSpan: initial.span,
    closedEnd: "end",
  });
  assert.equal(
    reviewRodSocketPlates(swapped, reviewRodFit(swapped, rod.id))[0].state,
    "stale",
  );
});

test("backplate geometry tests angled retained edges and notches that open onto an orthogonal face", () => {
  const project = everbiltStudy();
  const panel = project.pieces.find(
    (piece) => piece.material === "plytanium-703",
  )!;
  const normal: V3 = [1, 0, 0];
  const base = { ...panel, size: [0.703, 10, 10] as V3 };
  const entry: V3 = [base.size[0] / 2, 0, 0];
  const [u, v] = openingAxes(2);
  assert.deepEqual([u, v], [0, 1]);
  const edgeCut = {
    ...base,
    rectangularOpenings: [
      {
        axis: 2 as const,
        center: [entry[0], 1.2] as [number, number],
        spans: [0.6, 0.7] as [number, number],
      },
    ],
  };
  assert.equal(rodEndCrossesCut(edgeCut, entry, normal, 0.655), false);
  assert.equal(rodEndCrossesCut(edgeCut, entry, normal, 1), true);
  assert.equal(
    reviewSocketPlateFace(edgeCut, entry, normal, [1, 1.5, 1, 1])?.crossesVoid,
    true,
  );
  const clipped = {
    ...base,
    cutPlanes: [{ normal: [0, Math.SQRT1_2, Math.SQRT1_2] as V3, constant: 1 }],
  };
  assert.equal(
    reviewSocketPlateFace(clipped, entry, normal, [1, 1.5, 1, 1])?.crossesEdge,
    true,
  );
});

test("measured socket holes preserve exact panel datums and withhold conflicting or stale marks", () => {
  const project = everbiltStudy();
  const rod = closetRods(project)[0];
  const bay = rodBay(project, rod.id);
  const fit = saveRodFit(project, rod.id, {
    ...measurements,
    measuredSpan: bay.span,
  });
  assert.throws(
    () => saveRodSocketHoles(fit, rod.id, "start", {}),
    /current backplate/,
  );
  const plate = saveRodSocketPlate(fit, rod.id, "start", {
    extents: [1.2, 1.2, 0.7, 0.7],
    basis: "Synthetic plate.",
  });
  const input = {
    centers: [
      [-0.9, 0.2],
      [0.9, 0.2],
    ],
    pilotDiameter: 0.125,
    pilotDepth: 0.3,
    screwDiameter: 0.18,
    screwDepth: 0.5,
    basis: "Synthetic transferred holes and seated screw check.",
  };
  const write = (base: typeof project, patch: Partial<typeof input> = {}) =>
    saveRodSocketHoles(base, rod.id, "start", { ...input, ...patch });
  const review = (base: typeof project) =>
    reviewRodSocketPlates(base, reviewRodFit(base, rod.id))[0].holes!;
  const checked = write(plate);
  assert.equal(review(checked).state, "checked");
  const frame = socketFaceAxes(bay.start.normalLocal)!;
  const [u, v] = frame.across;
  for (const [i, mark] of review(checked).marks.entries()) {
    assert.equal(mark.local[frame.axis], bay.start.pointLocal[frame.axis]);
    assert.equal(mark.local[u], bay.start.pointLocal[u] + input.centers[i][0]);
    assert.equal(mark.local[v], bay.start.pointLocal[v] + input.centers[i][1]);
    assert.ok(
      Math.abs(
        Math.hypot(...mark.line[1].map((n, i) => n - mark.line[0][i])) - 0.5,
      ) < 1e-7,
    );
  }
  assert.match(guideMarkdown(checked), /Hole 1 · local X\/Y\/Z/);
  assert.deepEqual(checked.supplies, project.supplies);
  assert.deepEqual(checked.pieces, project.pieces);
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(checked))).rodFitPlans,
    checked.rodFitPlans,
  );
  assert.deepEqual(
    projectSchema.parse({ ...plate, schemaVersion: 50 }).rodFitPlans,
    plate.rodFitPlans,
  );

  const deep = write(checked, { pilotDepth: 0.75 });
  assert.equal(review(deep).state, "conflict");
  assert.deepEqual(review(deep).marks[0].issues, [
    "Pilot envelope reaches or passes the back of the panel.",
  ]);
  assert.match(
    guideMarkdown(deep),
    /Hole 1 · Pilot envelope reaches or passes/,
  );
  assert.doesNotMatch(guideMarkdown(deep), /Hole 1 · local X\/Y\/Z/);
  assert.ok(
    validate(deep).some(({ id }) => id === `rod-socket-holes-${rod.id}-start`),
  );
  const duplicate = write(checked, {
    centers: [
      [-0.9, 0.2],
      [-0.8, 0.2],
    ],
  });
  assert.ok(
    review(duplicate).marks[0].issues.some((issue) =>
      issue.includes("meets hole 2"),
    ),
  );

  const swapped = saveRodFit(checked, rod.id, {
    ...measurements,
    measuredSpan: bay.span,
    closedEnd: "end",
  });
  assert.equal(review(swapped).state, "stale");
  assert.deepEqual(review(swapped).marks, []);
  const refreshedPlate = saveRodSocketPlate(swapped, rod.id, "start", {
    extents: [1.2, 1.2, 0.7, 0.7],
    basis: "Synthetic open plate.",
  });
  assert.equal(review(refreshedPlate).state, "stale");
  assert.deepEqual(
    refreshedPlate.rodFitPlans![0].socketPlates!.start!.holeLayout,
    checked.rodFitPlans![0].socketPlates!.start!.holeLayout,
  );
  assert.equal(review(write(refreshedPlate)).state, "checked");
});

test("socket paths find buried orthogonal cuts, bore edges and a clipped panel exit", () => {
  const panel = { ...everbiltStudy().pieces[0], size: [0.703, 10, 10] as V3 };
  const normal: V3 = [1, 0, 0];
  const entry: V3 = [0.3515, 0, 0];
  const bored = {
    ...panel,
    roundOpenings: [
      { axis: 2 as const, center: [0, 0] as [number, number], diameter: 0.15 },
    ],
  };
  assert.deepEqual(socketBoreProblems(bored, entry, normal, 0.125, 0.1), []);
  assert.deepEqual(socketBoreProblems(bored, entry, normal, 0.125, 0.5), [
    "intersects a through-cut",
  ]);
  assert.deepEqual(
    socketBoreProblems(panel, [0.3515, 4.94, 0], normal, 0.125, 0.3),
    ["reaches a panel edge"],
  );
  const trimmed = {
    ...panel,
    cutPlanes: [{ normal: [-1, 0, 0] as V3, constant: 0.125 }],
  };
  assert.deepEqual(socketBoreProblems(trimmed, entry, normal, 0.125, 0.5), [
    "reaches a trimmed panel face",
  ]);
});
