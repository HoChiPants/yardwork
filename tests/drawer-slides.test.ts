import assert from "node:assert/strict";
import test from "node:test";
import { accuride3732 as reference, drawerSlideReference } from "../src/drawerSlideReference";
import {
  addMissingDrawerSlides,
  compareDrawerSlideLengths,
  drawerSlideDemand,
  drawerSlidePurchaseReview,
  reviewDrawerSlide,
} from "../src/drawerSlides";
import { guideMarkdown, shoppingCsv, validate } from "../src/engine";
import { homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import { reviewMotion, saveMotionPlan } from "../src/mechanismMotion";
import { blank, part, projectSchema, type V3 } from "../src/model";
import type { MotionPlanInput } from "../src/motionPlanSchema";
import { rotate } from "../src/spatial";
import { recordSupplyInventory, supplyRows } from "../src/supplies";

function drawerFixture(yaw = 0) {
  const base = blank("Frameless cabinet drawer");
  const orientation: V3 = [0, yaw, 0];
  const panel = (name: string, size: V3, position: V3) =>
    part(
      name,
      "plywood",
      size,
      rotate(position, orientation),
      base.steps[0].id,
      "Drawer",
      orientation,
    );
  const cabinetLeft = panel(
    "Left cabinet panel",
    [0.75, 24, 23],
    [-8.385, 12, 0],
  );
  const cabinetRight = panel(
    "Right cabinet panel",
    [0.75, 24, 23],
    [8.385, 12, 0],
  );
  const drawerLeft = panel("Left drawer panel", [0.5, 4, 22], [-7.25, 12, 0]);
  const drawerRight = panel("Right drawer panel", [0.5, 4, 22], [7.25, 12, 0]);
  const front = panel("Drawer front", [15, 4, 0.75], [0, 12, 11.375]);
  const input = {
    label: "Top drawer",
    memberIds: [drawerLeft.id, drawerRight.id, front.id],
    mechanism: {
      kind: "slide",
      axis: rotate([0, 0, 1], orientation),
      travel: reference.travel,
      drawerSlide: {
        productId: reference.productId,
        cabinetLeft: cabinetLeft.id,
        drawerLeft: drawerLeft.id,
        drawerRight: drawerRight.id,
        cabinetRight: cabinetRight.id,
      },
    },
  } satisfies MotionPlanInput;
  const baseProject = {
    ...base,
    pieces: [cabinetLeft, drawerLeft, drawerRight, cabinetRight, front],
  };
  return {
    ...saveMotionPlan(baseProject, input),
    baseProject,
    input,
    cabinetRight,
    drawerRight,
  };
}

test("a real slide uses its own travel and measures both mounted gaps in the rotated drawer frame", () => {
  for (const yaw of [0, Math.PI / 2, Math.PI / 3]) {
    const { project, plan, drawerRight } = drawerFixture(yaw);
    const fit = reviewDrawerSlide(project, plan)!;
    assert.equal(fit.ready, true);
    assert.equal(
      fit.rows.filter((row) => row.label.endsWith("side gap")).length,
      2,
    );
    assert.ok(
      fit.rows
        .filter((row) => row.label.endsWith("side gap"))
        .every((row) => /0\.51 in/.test(row.detail)),
    );
    assert.match(
      fit.rows.find((row) => row.label === "Shared mounting run")!.detail,
      /22 in.*21\.65 in/,
    );
    const movement = reviewMotion(project, plan);
    assert.deepEqual(movement.hits, []);
    const open = movement.preview(99);
    assert.equal(open.travel, 22);
    const at = open.pieces.find((p) => p.id === drawerRight.id)!;
    assert.ok(
      Math.abs(
        Math.hypot(
          ...at.position.map(
            (component, i) => component - drawerRight.position[i],
          ),
        ) - 22,
      ) < 1e-7,
    );
  }
});

test("an off-center drawer and a shortened cabinet side flag the exact failed measurements", () => {
  const { project, plan, cabinetRight } = drawerFixture();
  const changed = {
    ...project,
    pieces: project.pieces.map((piece) =>
      piece.id === cabinetRight.id
        ? {
            ...piece,
            position: [8.3, 12, 0] as V3,
            size: [0.75, 24, 21] as V3,
          }
        : piece,
    ),
  };
  const fit = reviewDrawerSlide(changed, plan)!;
  assert.deepEqual(
    fit.rows.filter((row) => !row.matches).map((row) => row.label),
    ["Right side gap", "Shared mounting run"],
  );
  assert.equal(drawerSlideDemand(changed).missing, 0);
  assert.ok(
    validate(changed).some(
      (finding) => finding.id === `drawer-slide-fit-${plan.id}`,
    ),
  );
  assert.match(guideMarkdown(changed), /Right side gap · Review/);
  assert.equal(
    reviewDrawerSlide(
      {
        ...project,
        pieces: project.pieces.filter((p) => p.id !== cabinetRight.id),
      },
      plan,
    )!.ready,
    false,
  );
});

test("only one left/right pair is purchased per drawer, with exact retailer snapshots and a preserved guide", () => {
  const { project, plan, input } = drawerFixture();
  const sameDrawer = saveMotionPlan(project, {
    ...input,
    label: "Alternative opening preview",
  }).project;
  assert.deepEqual(drawerSlideDemand(sameDrawer), {
    needed: 1,
    selected: 0,
    missing: 1,
  });
  const withPair = addMissingDrawerSlides(sameDrawer);
  assert.equal(withPair.supplies[0].quantity, 1);
  assert.deepEqual(withPair.pieces, sameDrawer.pieces);
  assert.equal(addMissingDrawerSlides(withPair), withPair);

  const checkedAt = "2026-11-19T19:00:00.000Z";
  for (const [retailer, retailerProductId, url] of [
    ["home-depot", "202214919", reference.homeDepot],
    ["lowes", "1000770534", reference.lowes],
  ] as const) {
    const observed = recordSupplyInventory(
      { ...withPair, retailer, store: "Synthetic QA" },
      {
        productId: reference.productId,
        retailer,
        retailerProductId,
        url,
        checkedAt,
        zip: "84121",
        store: "Synthetic QA",
        price: 30,
        available: 2,
      },
    );
    const row = supplyRows(observed, Date.parse(checkedAt))[0];
    assert.equal(row.total, 30);
    assert.equal(row.offer?.productId, retailerProductId);
    assert.deepEqual(
      row.contents.map((item) => item.quantity),
      [1, 1],
    );
    assert.match(
      shoppingCsv(observed),
      new RegExp(`"${retailerProductId}","1","left/right slide pair"`),
    );
    assert.match(
      guideMarkdown(observed),
      /T46322G22.*Modeled dimensions match/s,
    );
    assert.equal(
      projectSchema.parse(JSON.parse(JSON.stringify(observed))).motionPlans![0]
        .id,
      plan.id,
    );
  }
});

test("a legacy custom slide keeps its extension and a fitted slide rejects forged hardware or excess travel", () => {
  const { baseProject, input } = drawerFixture();
  const plain = saveMotionPlan(baseProject, {
    ...input,
    mechanism: { kind: "slide", travel: 28, axis: [0, 0, 1] },
  });
  const migrated = projectSchema.parse({ ...plain.project, schemaVersion: 19 });
  assert.deepEqual(migrated.motionPlans, plain.project.motionPlans);
  assert.equal(reviewDrawerSlide(migrated, plain.plan), null);
  assert.throws(
    () =>
      saveMotionPlan(baseProject, {
        ...input,
        mechanism: { ...input.mechanism, travel: 23 },
      }),
    /documented drawer slide travel/,
  );
  assert.throws(() =>
    saveMotionPlan(baseProject, {
      ...input,
      mechanism: {
        ...input.mechanism,
        drawerSlide: { ...input.mechanism.drawerSlide, productId: "forged" },
      },
    }),
  );
});

test("short drawer panels fit only the documented closed lengths and use the chosen product travel and listing", () => {
  const yaw = Math.PI / 3;
  const { baseProject, input } = drawerFixture(yaw);
  const { drawerSlide: sides } = input.mechanism;
  const project = {
    ...baseProject,
    pieces: baseProject.pieces.map((piece) =>
      piece.id === input.memberIds[2]
        ? { ...piece, position: rotate([0, 12, 9.5], [0, yaw, 0]) }
        : { ...piece, size: [piece.size[0], piece.size[1], 18.25] as V3 },
    ),
  };
  const comparison = compareDrawerSlideLengths(project, input.memberIds, [0, 0, 1], sides);
  assert.deepEqual(comparison.map((option) => [option.reference.travel, option.ready]), [
    [14, true], [16, true], [18, true], [20, false], [22, false], [24, false],
  ]);
  assert.match(comparison[3].rows.find((row) => !row.matches)!.detail, /18\.25 in.*19\.69 in/);
  assert.deepEqual(compareDrawerSlideLengths(project, input.memberIds, [0, 0, 1], {
    ...sides, cabinetRight: sides.cabinetLeft,
  }), []);

  const productId = "accuride-t46322g18";
  const mechanism = { ...input.mechanism, travel: 18, drawerSlide: { ...sides, productId } } as const;
  assert.throws(() => saveMotionPlan(project, {
    ...input, mechanism: { ...mechanism, travel: 18.01 },
  }), /documented drawer slide travel/);
  const direct = saveMotionPlan(project, { ...input, mechanism });
  assert.equal(reviewDrawerSlide(direct.project, direct.plan)?.ready, true);
  const moved = reviewMotion(direct.project, direct.plan).preview(40);
  assert.equal(moved.travel, 18);
  const purchase = homeDepotPurchaseNeeds(direct.project).find(({ id }) => id === productId);
  assert.equal(purchase?.canAdd, true);
  assert.equal(purchase?.missing, 1);
  const selected = addMissingDrawerSlides(direct.project, productId);
  const checkedAt = "2026-11-19T19:00:00.000Z";
  const observed = recordSupplyInventory({ ...selected, store: "Synthetic QA" }, {
    productId,
    retailer: "home-depot",
    retailerProductId: "202214904",
    url: drawerSlideReference(productId).homeDepot,
    checkedAt,
    zip: "84121",
    store: "Synthetic QA",
    price: 25,
    available: 2,
  });
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(observed)));
  assert.deepEqual(reopened.motionPlans, observed.motionPlans);
  assert.equal(supplyRows(reopened, Date.parse(checkedAt))[0].total, 25);
  assert.match(shoppingCsv(reopened), /"202214904","1","left\/right slide pair"/);
  assert.match(guideMarkdown(reopened), /T46322G18.*Modeled dimensions match/s);
});

test("different fitting slide models for a physical drawer are a purchase decision, while repeated previews use a single pair", () => {
  const { project, input, plan } = drawerFixture();
  const productId = "accuride-t46322g18";
  const alternative = saveMotionPlan(project, {
    ...input,
    label: "Different size for the same drawer",
    mechanism: {
      ...input.mechanism,
      travel: 18,
      drawerSlide: { ...input.mechanism.drawerSlide, productId },
    },
  });
  assert.equal(reviewDrawerSlide(alternative.project, alternative.plan)?.ready, true);
  assert.equal(drawerSlidePurchaseReview(alternative.project).conflicts.length, 1);
  for (const id of [reference.productId, productId] as const) {
    assert.equal(drawerSlideDemand(alternative.project, id).needed, 0);
    assert.equal(addMissingDrawerSlides(alternative.project, id), alternative.project);
    const row = homeDepotPurchaseNeeds(alternative.project).find((need) => need.id === id);
    assert.equal(row?.canAdd, false);
    assert.match(row?.issue ?? "", /Choose one slide size/);
  }
  assert.match(guideMarkdown(alternative.project), /different fitted slide choices/);
  const resolved = {
    ...alternative.project,
    motionPlans: alternative.project.motionPlans!.filter((motion) => motion.id !== plan.id),
  };
  assert.equal(drawerSlideDemand(resolved, productId).needed, 1);
  assert.equal(drawerSlideDemand(resolved).needed, 0);
});
