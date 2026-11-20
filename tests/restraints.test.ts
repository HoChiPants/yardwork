import assert from "node:assert/strict";
import test from "node:test";
import {
  blank,
  material,
  part,
  projectSchema,
  uid,
  type Project,
  type V3,
} from "../src/model";
import { createBuildStudy } from "../src/buildFixtures";
import { bom, connect } from "../src/engine";
import { cutAngledEnd } from "../src/cutPlan";
import { rotate, composeRotation } from "../src/spatial";
import {
  restraintProductId,
  restraintPlanSchema,
  type RestraintPlan,
} from "../src/restraintSchema";
import {
  makeRestraintPlan,
  saveRestraintPlan,
  removeRestraintPlan,
  selectRestraintReceiver,
  addRestraintLocation,
  restraintReviews,
} from "../src/restraints";
import {
  restraintPurchaseSummary,
  addMissingRestraintKits,
} from "../src/restraintPurchases";
import {
  restraintGuideMarkdown,
  restraintGuideText,
  restraintPreparationNotes,
} from "../src/restraintGuide";
import {
  findRetailerProduct,
  checkProductBinding,
  retailerProductSchema,
} from "../src/retailerCatalog";
import {
  addSupply,
  supplyDefinitions,
  supplyRows,
  recordSupplyInventory,
} from "../src/supplies";

const checkedAt = () => new Date(Date.now() - 60000).toISOString();
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const review = (p: Project) => restraintReviews(p)[0];
const codes = (p: Project) => review(p).issues.map((issue) => issue.code);
function withReceiver(cutPlanes: Project["pieces"][number]["cutPlanes"] = []) {
  let project = createBuildStudy("shelves").project;
  const entryId = project.ideaBindings[0].entries[0].id,
    receiver = part(
      "User-designed solid-wood receiver",
      "one-four",
      [10, 3.5, 0.75],
      [0, 68, -8.375],
      project.steps[0].id,
      "Receiver under review",
    );
  receiver.cutPlanes = cutPlanes;
  project = { ...project, pieces: [...project.pieces, receiver] };
  const back = project.pieces.find((piece) => piece.assembly === "Back")!;
  project = connect(
    project,
    receiver.id,
    back.id,
    project.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  let plan = selectRestraintReceiver(
    project,
    makeRestraintPlan(project, entryId),
    receiver.id,
  );
  plan = addRestraintLocation(plan);
  plan.receiverJointIds = [project.joints.at(-1)!.id];
  return {
    project: saveRestraintPlan(project, plan),
    plan,
    receiverId: receiver.id,
  };
}
function measuredPlan(plan: RestraintPlan): RestraintPlan {
  const next = structuredClone(plan),
    date = checkedAt();
  next.receiverSolidWoodBasis =
    "Synthetic user inspection of actual solid pine; not capacity approval";
  next.receiverMeasuredAt = date;
  next.instructionBasis =
    "Synthetic user record of delivered exact kit instructions";
  next.instructionRevision =
    "Identifier copied from delivered card, not independently verified";
  next.instructionReviewedAt = date;
  next.measurements = {
    cableEyeToEyeLength: 6,
    deepestFurnitureTipDepth: 0.5,
    wallFastenerLength: 2,
    studEngagement: 1,
    basis: "Synthetic user fitting/fastener measurements",
    measuredAt: date,
  };
  Object.assign(next.locations[0], {
    receiverMountLocal: [0, 0, -0.375],
    furnitureEyeLocal: [0, 0, -0.5],
    wallEyeWorld: [0, 68, -12],
    wallSubstrate: "wood-stud",
    wallBasis: "Synthetic user stud location/finish inspection",
    wallReviewedAt: date,
  });
  return next;
}
function save(project: Project, plan: RestraintPlan) {
  return saveRestraintPlan(project, plan);
}

test("exact9976524 identity is one complete eleven-part purchase kit with both retailer references and unknown geometry", () => {
  const product = findRetailerProduct(restraintProductId)!;
  assert.equal(retailerProductSchema.safeParse(product).success, true);
  assert.equal(product.status, "reviewed-specs");
  assert.equal(product.manufacturerPartNumber, "9976524");
  assert.deepEqual(
    product.offers.map((offer) => [offer.retailer, offer.productId]),
    [
      ["home-depot", "314365593"],
      ["lowes", "5015754703"],
    ],
  );
  assert.equal(product.profile.packCount, 1);
  assert.equal(product.profile.stockSize, null);
  assert.equal(product.profile.shankDiameter, null);
  assert.equal(
    checkProductBinding(material("bracket"), product).compatible,
    false,
  );
  assert.equal(product.roleQualifications.length, 0);
  assert.equal(
    supplyDefinitions[restraintProductId].contents.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    11,
  );
  assert.match(product.discrepancies.join(" "), /manual|revision/i);
  assert.match(
    product.sources.map((source) => source.note).join(" "),
    /wall assignment.*not|not.*wall assignment/i,
  );
  assert.equal("price" in product, false);
  assert.equal("available" in product, false);
});

test("new plans choose no receiver or locations, save/reopen separately from pins and do not invent kit demand", () => {
  const project = blank(),
    before = JSON.stringify(project),
    plan = makeRestraintPlan(project);
  assert.equal(plan.receiver, null);
  assert.deepEqual(plan.locations, []);
  assert.equal(plan.measurements.wallFastenerLength, null);
  assert.equal(plan.measurements.studEngagement, null);
  const next = save(project, plan),
    reopened = projectSchema.parse(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(reopened.restraintPlans, next.restraintPlans);
  assert.deepEqual(reopened.attachmentPlans, []);
  assert.equal(restraintPurchaseSummary(reopened).plannedKits, 0);
  assert.equal(addMissingRestraintKits(reopened), reopened);
  assert.equal(JSON.stringify(project), before);
  assert.equal(removeRestraintPlan(reopened, plan.id).restraintPlans.length, 0);
  assert.throws(() => makeRestraintPlan(project, uid()), /existing saved/i);
  assert.equal(
    restraintPlanSchema.safeParse({ ...plan, approved: true }).success,
    false,
  );
});

test("the actual plywood bookcase has no qualified receiver; plywood selection is a hard conflict", () => {
  const project = createBuildStudy("shelves").project,
    entry = project.ideaBindings[0].entries[0],
    receiver = project.pieces.find((piece) => piece.assembly === "Back")!;
  let plan = selectRestraintReceiver(
    project,
    makeRestraintPlan(project, entry.id),
    receiver.id,
  );
  plan = addRestraintLocation(plan);
  plan.receiverSolidWoodBasis = "Caller claims plywood is solid wood";
  plan.receiverMeasuredAt = checkedAt();
  const next = save(project, plan);
  assert.equal(review(next).state, "conflict");
  assert.ok(codes(next).includes("receiver-material"));
  assert.equal(review(next).activeKitCount, 0);
  assert.equal(restraintPurchaseSummary(next).plannedKits, 0);
});

test("generic linear wood requires user inspection provenance and remains review-only even with all user inputs", () => {
  const { project, plan } = withReceiver();
  assert.equal(review(project).state, "needs-review");
  assert.ok(codes(project).includes("receiver-basis"));
  assert.equal(review(project).activeKitCount, 1);
  const measured = save(project, measuredPlan(plan));
  assert.equal(review(measured).state, "needs-review");
  assert.ok(!codes(measured).includes("receiver-basis"));
  assert.ok(codes(measured).includes("receiver-source-scope"));
  assert.ok(codes(measured).includes("manufacturer-limits"));
  assert.equal(review(measured).activeKitCount, 1);
  assert.ok(!restraintGuideText(measured).includes("State: approved"));
});

test("missing receiver and selected joint references become stale; unrelated or disconnected schedules conflict", () => {
  const { project, plan, receiverId } = withReceiver();
  const missing = {
    ...project,
    pieces: project.pieces.filter((piece) => piece.id !== receiverId),
  };
  assert.equal(review(missing).state, "stale");
  assert.equal(review(missing).activeKitCount, 0);
  assert.equal(review({ ...project, joints: [] }).state, "stale");
  const unrelated = { ...plan, receiverJointIds: [uid()] };
  assert.equal(review(save(project, unrelated)).state, "stale");
  let other: Project = { ...project, joints: [] };
  other = connect(
    other,
    other.pieces[0].id,
    other.pieces.find((piece) => piece.assembly === "Top")!.id,
    other.steps[0].id,
    2,
    1.25,
    "screw",
    "screw-short",
  );
  const disconnected = save(other, {
    ...plan,
    receiverJointIds: [other.joints[0].id],
  });
  assert.equal(review(disconnected).state, "conflict");
  assert.ok(codes(disconnected).includes("receiver-disconnected"));
  const pending = save(project, { ...plan, receiverJointIds: [] });
  assert.equal(review(pending).state, "needs-review");
  assert.ok(codes(pending).includes("receiver-connections"));
});

test("cuts, material changes, offcut conversion and same-name replacements invalidate the actual receiver reference", () => {
  const { project, receiverId } = withReceiver();
  for (const change of [
    (piece: Project["pieces"][number]) => ({
      ...piece,
      material: "one-six" as const,
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      size: [9, 3.5, 0.75] as V3,
    }),
    (piece: Project["pieces"][number]) => ({
      ...piece,
      cutPlanes: [{ normal: [0, 0, 1] as V3, constant: 0.1 }],
    }),
    (piece: Project["pieces"][number]) => ({ ...piece, offcut: true }),
    (piece: Project["pieces"][number]) => ({ ...piece, id: uid() }),
  ]) {
    const next = {
      ...project,
      pieces: project.pieces.map((piece) =>
        piece.id === receiverId ? change(piece) : piece,
      ),
    };
    assert.equal(review(next).state, "stale");
    assert.equal(review(next).activeKitCount, 0);
  }
});

test("retained convex ray depth catches angled-cut breakthrough before the box thickness", () => {
  const n = Math.SQRT1_2,
    fixture = withReceiver([{ normal: [n, 0, n], constant: 0 }]),
    plan = measuredPlan(fixture.plan);
  plan.measurements.deepestFurnitureTipDepth = 0.4;
  const next = save(fixture.project, plan),
    current = review(next);
  near(current.locations[0].availableReceiverDepth!, 0.375);
  assert.equal(current.state, "conflict");
  assert.ok(codes(next).includes("receiver-breakthrough"));
  assert.equal(current.activeKitCount, 0);
  plan.measurements.deepestFurnitureTipDepth = 0.3;
  assert.equal(review(save(fixture.project, plan)).state, "needs-review");
});

test("mount point must lie on the selected retained face, including a valid axis-aligned cut face", () => {
  const fixture = withReceiver([{ normal: [0, 0, 1], constant: 0.1 }]),
    plan = measuredPlan(fixture.plan);
  plan.locations[0].receiverFace = { axis: 2, sign: 1 };
  plan.locations[0].receiverMountLocal = [0, 0, 0.1];
  plan.measurements.deepestFurnitureTipDepth = 0.3;
  const current = review(save(fixture.project, plan));
  assert.equal(current.state, "needs-review");
  near(current.locations[0].availableReceiverDepth!, 0.475);
  plan.locations[0].receiverMountLocal = [0, 0, 0.375];
  const removed = save(fixture.project, plan);
  assert.equal(review(removed).state, "conflict");
  assert.ok(codes(removed).includes("receiver-mount"));
  plan.locations[0].receiverMountLocal = [0, 0, 0];
  assert.ok(codes(save(fixture.project, plan)).includes("receiver-mount"));
});

test("rigid furniture movement recomputes receiver eye world while the recorded wall eye stays fixed", () => {
  const fixture = withReceiver(),
    measured = save(fixture.project, measuredPlan(fixture.plan)),
    before = review(measured),
    rotation: V3 = [0, 0.2, 0],
    translation: V3 = [3, 0, 1];
  const moved = {
    ...measured,
    pieces: measured.pieces.map((piece) => ({
      ...piece,
      position: rotate(piece.position, rotation).map(
        (value, axis) => value + translation[axis],
      ) as V3,
      rotation: composeRotation(rotation, piece.rotation),
    })),
  };
  const after = review(moved);
  assert.notEqual(after.state, "stale");
  const expected = rotate(before.locations[0].furnitureEyeWorld!, rotation).map(
    (value, axis) => value + translation[axis],
  );
  after.locations[0].furnitureEyeWorld!.forEach((value, axis) =>
    near(value, expected[axis]),
  );
  assert.deepEqual(
    moved.restraintPlans[0].locations[0].wallEyeWorld,
    measured.restraintPlans[0].locations[0].wallEyeWorld,
  );
  assert.notEqual(after.locations[0].span, before.locations[0].span);
});

test("cable overreach, impossible engagement and nonwood wall methods conflict; unknown studs remain pending", () => {
  const fixture = withReceiver(),
    measured = measuredPlan(fixture.plan);
  measured.measurements.cableEyeToEyeLength = 1;
  assert.ok(codes(save(fixture.project, measured)).includes("cable-overreach"));
  measured.measurements.cableEyeToEyeLength = 6;
  measured.measurements.studEngagement = 3;
  assert.ok(codes(save(fixture.project, measured)).includes("stud-engagement"));
  measured.measurements.studEngagement = 1;
  for (const wallSubstrate of [
    "steel-stud",
    "masonry",
    "drywall-only",
    "other",
  ] as const) {
    measured.locations[0].wallSubstrate = wallSubstrate;
    assert.equal(review(save(fixture.project, measured)).state, "conflict");
    assert.ok(
      codes(save(fixture.project, measured)).includes("wall-substrate"),
    );
  }
  measured.locations[0].wallSubstrate = "unknown";
  assert.equal(review(save(fixture.project, measured)).state, "needs-review");
  assert.ok(codes(save(fixture.project, measured)).includes("wall-pending"));
});

test("evidence dates and actual wall/receiver bases stay review questions and never become source certification", () => {
  const fixture = withReceiver(),
    plan = measuredPlan(fixture.plan),
    future = new Date(Date.now() + 86400000).toISOString();
  plan.receiverMeasuredAt = future;
  plan.instructionReviewedAt = future;
  plan.measurements.measuredAt = future;
  plan.locations[0].wallReviewedAt = future;
  const current = save(fixture.project, plan);
  for (const code of [
    "receiver-basis",
    "instructions-pending",
    "measurement-date",
    "wall-evidence",
  ])
    assert.ok(codes(current).includes(code));
  assert.equal(review(current).state, "needs-review");
  assert.equal(
    restraintPlanSchema.safeParse({
      ...plan,
      measurements: { ...plan.measurements, verified: true },
    }).success,
    false,
  );
  assert.equal(
    restraintPlanSchema.safeParse({
      ...plan,
      measurements: { ...plan.measurements, basis: "" },
    }).success,
    false,
  );
});

test("only explicit nonstale/nonconflict locations create provisional demand and selected whole kits cover it once", () => {
  let project = blank(),
    plan = makeRestraintPlan(project);
  plan = addRestraintLocation(addRestraintLocation(plan));
  project = save(project, plan);
  const before = JSON.stringify(project),
    shopping = bom(project);
  assert.equal(restraintPurchaseSummary(project).plannedKits, 2);
  assert.equal(project.supplies.length, 0);
  project = addSupply(project, restraintProductId, 1, "Manual kit purchase");
  const selected = addMissingRestraintKits(project),
    summary = restraintPurchaseSummary(selected);
  assert.equal(summary.plannedKits, 2);
  assert.equal(summary.selectedKits, 2);
  assert.equal(summary.shortfallKits, 0);
  assert.equal(selected.supplies.length, 2);
  assert.equal(selected.supplies[1].quantity, 1);
  assert.equal(addMissingRestraintKits(selected), selected);
  assert.deepEqual(bom(selected), shopping);
  assert.deepEqual(selected.pieces, JSON.parse(before).pieces);
  const row = supplyRows(selected)[0];
  assert.equal(row.quantity, 2);
  assert.equal(
    row.contents.reduce((sum, item) => sum + item.quantity, 0),
    11,
  );
  assert.equal(row.total, null);
  const observed = recordSupplyInventory(
    { ...selected, store: "synthetic-test-store" },
    {
      productId: restraintProductId,
      retailer: "home-depot",
      retailerProductId: "314365593",
      price: 12,
      available: 3,
      store: "synthetic-test-store",
      zip: selected.zip,
      checkedAt: checkedAt(),
      url: "https://www.homedepot.com/p/314365593",
    },
  );
  assert.equal(supplyRows(observed)[0].total, 24);
  assert.equal(
    restraintPurchaseSummary({ ...observed, retailer: "lowes" })
      .retailerSupported,
    true,
  );
  assert.equal(supplyRows({ ...observed, retailer: "lowes" })[0].total, null);
});

test("mixed valid and stale/conflict plans count only explicit included kits with no eleven-part multiplication", () => {
  const fixture = withReceiver(),
    good = measuredPlan(fixture.plan),
    bad = {
      ...measuredPlan(fixture.plan),
      id: uid(),
      locations: measuredPlan(fixture.plan).locations.map((location) => ({
        ...location,
        id: uid(),
        wallSubstrate: "drywall-only" as const,
      })),
    };
  let project = save(save(fixture.project, good), bad);
  assert.equal(restraintPurchaseSummary(project).plannedKits, 1);
  project = addSupply(project, restraintProductId, 3);
  assert.equal(restraintPurchaseSummary(project).spareKits, 2);
  assert.equal(restraintPurchaseSummary(project).selectedKits, 3);
  assert.equal(supplyRows(project)[0].quantity, 3);
});

test("receiver reselection clears invalidated local evidence without moving explicitly recorded wall targets", () => {
  const fixture = withReceiver(),
    measured = measuredPlan(fixture.plan),
    next = selectRestraintReceiver(
      fixture.project,
      measured,
      fixture.receiverId,
    );
  assert.deepEqual(next.receiverJointIds, []);
  assert.equal(next.receiverSolidWoodBasis, "");
  assert.equal(next.measurements.deepestFurnitureTipDepth, null);
  assert.equal(next.locations[0].receiverMountLocal, null);
  assert.equal(next.locations[0].furnitureEyeLocal, null);
  assert.deepEqual(
    next.locations[0].wallEyeWorld,
    measured.locations[0].wallEyeWorld,
  );
  assert.equal(next.locations.length, 1);
});

test("guide uses stable part labels, user provenance and unresolved checks without raw receiver/plan identifiers", () => {
  const fixture = withReceiver(),
    plan = measuredPlan(fixture.plan);
  plan.notes = "User | [claim](javascript:bad)\n# heading <script>";
  const project = save(fixture.project, plan),
    before = JSON.stringify(project),
    markdown = restraintGuideMarkdown(project),
    text = restraintGuideText(project),
    prep = restraintPreparationNotes(project, plan.id);
  assert.match(markdown, /P\d{3}.*solid-wood receiver/i);
  assert.ok(!markdown.includes(plan.id));
  assert.ok(!markdown.includes(fixture.receiverId));
  assert.match(text, /User measurement basis/);
  assert.match(text, /never|no approved|no.*load.capacity state/i);
  assert.match(markdown, /User \\| \\[claim\\]/);
  assert.ok(!markdown.includes("<script>"));
  assert.match(prep, /needs-review/);
  assert.match(prep, /no universal kit count/i);
  assert.ok(prep.length <= 4500);
  assert.ok(!prep.includes(plan.id));
  assert.match(restraintPreparationNotes(project, uid()), /UNRESOLVED/);
  assert.equal(JSON.stringify(project), before);
  assert.equal(restraintGuideMarkdown(blank()), "");
});

test("a moved receiver cannot keep a screw or nail graph connection beyond recorded fastener reach", () => {
  const fixture = withReceiver(),
    plan = measuredPlan(fixture.plan);
  plan.measurements.cableEyeToEyeLength = 20;
  const original = save(fixture.project, plan);
  for (const kind of ["screw", "nail"] as const) {
    const moved = structuredClone(original);
    moved.pieces.find((piece) => piece.id === fixture.receiverId)!.position[1] =
      kind === "screw" ? 76 : 80;
    if (kind === "nail")
      Object.assign(moved.joints[0], {
        kind: "nail",
        material: "nail",
        length: 3,
      });
    const current = review(moved);
    assert.equal(current.state, "conflict");
    assert.equal(current.activeKitCount, 0);
    assert.ok(codes(moved).includes("receiver-connection-reach"));
    assert.ok(!codes(moved).includes("cable-overreach"));
    if (kind === "screw")
      assert.match(
        current.issues.find(
          (issue) => issue.code === "receiver-connection-reach",
        )!.message,
        /gap of 2\.25 in.*1\.25 in/,
      );
  }
  const bracket = structuredClone(original);
  bracket.pieces.find((piece) => piece.id === fixture.receiverId)!.position[1] =
    76;
  Object.assign(bracket.joints[0], {
    kind: "bracket",
    material: "bracket",
    length: 0.25,
  });
  assert.equal(review(bracket).state, "needs-review");
  assert.ok(!codes(bracket).includes("receiver-connection-reach"));
});

test("refreshing manually enlarged one-four geometry cannot manufacture a24-inch receiver cross-section", () => {
  const fixture = withReceiver(),
    scaled = structuredClone(fixture.project),
    oldPlan = measuredPlan(fixture.plan);
  scaled.pieces.find((piece) => piece.id === fixture.receiverId)!.size = [
    10, 3.5, 24,
  ];
  const plan = selectRestraintReceiver(scaled, oldPlan, fixture.receiverId);
  plan.receiverJointIds = oldPlan.receiverJointIds;
  plan.receiverSolidWoodBasis = oldPlan.receiverSolidWoodBasis;
  plan.receiverMeasuredAt = oldPlan.receiverMeasuredAt;
  plan.measurements = { ...oldPlan.measurements, deepestFurnitureTipDepth: 5 };
  Object.assign(plan.locations[0], {
    receiverMountLocal: [0, 0, -12],
    furnitureEyeLocal: [0, 0, -12.25],
    wallEyeWorld: [0, 68, -24],
  });
  const next = save(scaled, plan),
    current = review(next);
  assert.equal(current.state, "conflict");
  assert.equal(current.activeKitCount, 0);
  assert.ok(codes(next).includes("receiver-stock-fit"));
  assert.equal(current.locations[0].availableReceiverDepth, null);
  assert.equal(restraintPurchaseSummary(next).plannedKits, 0);
});

test("source fit permits reduced stock and uses original source axes for short retained cuts", () => {
  const fixture = withReceiver(),
    reduced = structuredClone(fixture.project),
    receiver = reduced.pieces.find((piece) => piece.id === fixture.receiverId)!;
  receiver.size = [1, 2.5, 0.5];
  receiver.cutStock = { id: uid(), size: [10, 3.5, 0.75], offset: [0, 0, 0] };
  const oldPlan = measuredPlan(fixture.plan),
    plan = selectRestraintReceiver(reduced, oldPlan, receiver.id);
  plan.receiverJointIds = oldPlan.receiverJointIds;
  plan.receiverSolidWoodBasis = oldPlan.receiverSolidWoodBasis;
  plan.receiverMeasuredAt = oldPlan.receiverMeasuredAt;
  plan.measurements = {
    ...oldPlan.measurements,
    deepestFurnitureTipDepth: 0.3,
  };
  Object.assign(plan.locations[0], {
    receiverMountLocal: [0, 0, -0.25],
    furnitureEyeLocal: [0, 0, -0.35],
    wallEyeWorld: [0, 68, -12],
  });
  const valid = save(reduced, plan);
  assert.equal(review(valid).state, "needs-review");
  assert.ok(!codes(valid).includes("receiver-stock-fit"));
  near(review(valid).locations[0].availableReceiverDepth!, 0.5);
  const inconsistent = structuredClone(reduced);
  inconsistent.pieces.find(
    (piece) => piece.id === receiver.id,
  )!.stockLengthAxis = 2;
  const refreshed = selectRestraintReceiver(inconsistent, plan, receiver.id);
  assert.ok(
    codes(save(inconsistent, refreshed)).includes("receiver-stock-fit"),
  );
});

test("a valid angled receiver keeps its saved physical source after refresh", () => {
  const fixture = withReceiver();
  const cut = cutAngledEnd(fixture.project, fixture.receiverId, "width", [8, 9], "start");
  const refreshed = selectRestraintReceiver(cut, fixture.plan, fixture.receiverId);
  const result = review(save(cut, refreshed));
  assert.ok(!result.issues.some((issue) => issue.code === "receiver-stock-fit"));
});

test("receiver source validation rejects out-of-source or overlapping retained regions after explicit refresh", () => {
  const fixture = withReceiver();
  for (const overlap of [false, true]) {
    const project = structuredClone(fixture.project),
      receiver = project.pieces.find(
        (piece) => piece.id === fixture.receiverId,
      )!;
    receiver.cutStock = {
      id: uid(),
      size: [10, 3.5, 0.75],
      offset: [overlap ? 0 : 1, 0, 0],
    };
    if (overlap) {
      const other = { ...structuredClone(receiver), id: uid(), offcut: true };
      project.pieces.push(other);
    }
    const plan = selectRestraintReceiver(project, fixture.plan, receiver.id),
      next = save(project, plan);
    assert.equal(review(next).state, "conflict");
    assert.ok(codes(next).includes("receiver-stock-fit"));
    assert.equal(review(next).activeKitCount, 0);
  }
});
