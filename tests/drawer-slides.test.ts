import assert from "node:assert/strict";
import test from "node:test";
import { accuride3732 as reference } from "../src/drawerSlideReference";
import {
  addMissingDrawerSlides,
  drawerSlideDemand,
  reviewDrawerSlide,
} from "../src/drawerSlides";
import { guideMarkdown, shoppingCsv, validate } from "../src/engine";
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
