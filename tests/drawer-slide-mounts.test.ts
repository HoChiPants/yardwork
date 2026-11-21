import assert from "node:assert/strict";
import test from "node:test";
import { previewDrawerBox } from "../src/drawerBoxes";
import { drawerRailScrewPurchase, reviewDrawerSlideMount, saveDrawerSlideMount } from "../src/drawerSlideMounts";
import { drawerRailScrew } from "../src/drawerRailScrewReference";
import { addHomeDepotPurchaseNeed, homeDepotPurchaseNeeds } from "../src/handoffPurchases";
import type { DrawerSlideMountInput } from "../src/drawerSlideMountSchema";
import { guideMarkdown, validate } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { blank, part, projectSchema, uid, type Project, type V3 } from "../src/model";
import { composeRotation, rotate } from "../src/spatial";
import { editRoundOpening } from "../src/throughOpeningCuts";

const values: DrawerSlideMountInput = {
  centerHeight: 1.5,
  cabinet: {
    length: 17.72, height: 1.46, setback: 0, centerOffset: 0,
    centers: [[1.5, 0], [8, 0], [16, 0]],
    pilotDiameter: 0.09375, pilotDepth: 0.35, screwDiameter: 0.164, screwDepth: 0.625,
  },
  drawer: {
    length: 17.25, height: 0.85, setback: 0.125, centerOffset: 0,
    centers: [[1, 0], [8, 0], [16, 0]],
    rightCenters: [[2, 0], [8, 0], [16, 0]],
    pilotDiameter: 0.09375, pilotDepth: 0.35, screwDiameter: 0.164, screwDepth: 0.625,
  },
};

function cabinet() {
  const base = blank("Drawer with measured rails");
  const panel = (name: string, x: number) =>
    part(name, "plywood", [0.75, 10, 18.25], [x, 5, 0], base.steps[0].id, "Cabinet");
  const left = panel("Cabinet side left", -8.375), right = panel("Cabinet side right", 8.375);
  base.pieces.push(left, right);
  const box = previewDrawerBox(base, {
    panelIds: [left.id, right.id], reverse: false, label: "Kitchen drawer", stockId: "hd-purebond-birch-703",
    bottomOffset: 0.25, height: 4, frontInset: 0, rearGap: 0.125, sideGap: 33 / 64,
    finishFront: false, reveal: 0.125, depth: 18, slideId: "accuride-t46322g18",
  });
  return { ...box, left, right };
}

test("measured screw paths use all four mounting faces and preserve a distinct right-hand pattern in the saved guide", () => {
  const { project, plan } = cabinet();
  const previous = generateBuildGuide(project);
  assert.equal(projectSchema.parse({ ...previous, schemaVersion: 92 }).drawerSlideMounts, undefined);
  const withMount = saveDrawerSlideMount(previous, plan.id, values);
  assert.equal(guideIsCurrent(withMount), false);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(withMount)));
  const mount = reopened.drawerSlideMounts![0];
  const review = reviewDrawerSlideMount(reopened, mount);
  assert.equal(review.state, "checked", review.detail);
  assert.deepEqual(review.rails.map(({ face }) => face), ["+X", "−X", "−X", "+X"]);
  assert.equal(review.rails.flatMap(({ holes }) => holes.marks).length, 12);
  const drawerLeft = review.rails.find(({ key }) => key === "drawerLeft")!;
  const drawerRight = review.rails.find(({ key }) => key === "drawerRight")!;
  assert.ok(Math.abs(drawerLeft.holes.marks[0].line[0][2] - drawerRight.holes.marks[0].line[0][2] - 1) < 1e-7);
  const guide = guideMarkdown(generateBuildGuide(reopened));
  assert.match(guide, /Drawer rail mounting · All four rails/);
  assert.match(guide, /Right drawer side · P\d+ hole 1 · 2\.125 in back/);
  assert.match(guide, /pilot Ø 0\.09375 in.*seated screw Ø 0\.164 in.*0\.625 in into wood/);
  assert.equal(withMount.pieces, previous.pieces);
  assert.equal(JSON.stringify(reopened.pieces), JSON.stringify(previous.pieces));
});

test("a long screw breaks through the thinner drawer and withholds all drilling coordinates from the guide", () => {
  const { project, plan } = cabinet();
  const recorded = saveDrawerSlideMount(project, plan.id, { ...values, drawer: { ...values.drawer, screwDepth: 0.72 } });
  const review = reviewDrawerSlideMount(recorded, recorded.drawerSlideMounts[0]);
  assert.equal(review.state, "conflict");
  assert.ok(review.rails.filter(({ key }) => key.startsWith("drawer")).every(({ holes }) =>
    holes.marks.every(({ issues }) => issues.some((text) => text.includes("passes the back")))));
  const guide = guideMarkdown(generateBuildGuide(recorded));
  assert.match(guide, /Drawer rail mounting · Resolve flagged rail footprints/);
  assert.doesNotMatch(guide, /(?:cabinet|drawer) side · P\d+ hole \d+ · .* back from the panel blank/);
  assert.ok(validate(recorded).some(({ id }) => id === `drawer-slide-mount-${plan.id}`));
});

test("rigid moves preserve mount references while cut changes and nearby obstructions are rechecked", () => {
  const { project, plan, left } = cabinet();
  const recorded = saveDrawerSlideMount(project, plan.id, values);
  const saved = recorded.drawerSlideMounts[0];
  const turn: V3 = [0, Math.PI / 3, 0];
  const moved: Project = {
    ...recorded,
    pieces: recorded.pieces.map((piece) => ({
      ...piece,
      rotation: composeRotation(turn, piece.rotation),
      position: rotate(piece.position, turn).map((n, i) => n + [40, 3, 16][i]) as V3,
    })),
  };
  assert.equal(reviewDrawerSlideMount(moved, saved).state, "checked");

  const blocker = part("Cabinet clip", "plywood", [0.125, 0.5, 1], [-7.8, 2.45, 0], project.steps[0].id, "Cabinet");
  const obstructed = { ...recorded, pieces: [...recorded.pieces, blocker] };
  assert.equal(reviewDrawerSlideMount(obstructed, saved).state, "conflict");
  assert.match(guideMarkdown(obstructed), /Closed rail space meets/);

  const cut = editRoundOpening(recorded, left.id, null, { axis: 0, fromEdges: [2.453, 16.75], diameter: 0.5 });
  assert.equal(reviewDrawerSlideMount(cut, saved).state, "stale");
  const remeasured = saveDrawerSlideMount(cut, plan.id, values);
  const review = reviewDrawerSlideMount(remeasured, remeasured.drawerSlideMounts[0]);
  assert.equal(review.state, "conflict");
  assert.ok(review.rails[0].issues.includes("Rail footprint crosses a through-cut."));
  assert.ok(review.rails[0].holes.marks[0].issues.some((issue) => issue.includes("intersects a through-cut")));

  const misaligned = saveDrawerSlideMount(project, plan.id, {
    ...values, drawer: { ...values.drawer, centerOffset: 2 },
  });
  assert.match(guideMarkdown(misaligned), /rail heights do not overlap/);
});

test("checked rail screw choices survive reopen and count by the physical drawer and exact store pack", () => {
  const { project, plan, left } = cabinet();
  const chosen = {
    ...values,
    cabinet: {
      ...values.cabinet,
      fasteners: { source: "included", available: 4 } as const,
    },
    drawer: {
      ...values.drawer,
      screwDepth: 0.4,
      fasteners: { source: drawerRailScrew.id, seatToWood: 0.09 } as const,
    },
  };
  const recorded = saveDrawerSlideMount(project, plan.id, chosen);
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(recorded)));
  const guide = guideMarkdown(generateBuildGuide(reopened));
  assert.match(guide, /Cabinet rail screws · 6 for both sides · 4 compatible screws from the delivered slide package allocated · 2 still needed/);
  assert.match(guide, /Drawer rail screws · 6 for both sides · Everbilt model 801582/);
  const need = (p: Project) => homeDepotPurchaseNeeds(p).find(({ id }) => id === drawerRailScrew.id);
  assert.equal(need(reopened)?.quantityText, "1 screw pack");
  const supplied = addHomeDepotPurchaseNeed(reopened, drawerRailScrew.id);
  assert.equal(need(supplied), undefined);
  assert.deepEqual(supplied.supplies.map(({ productId, quantity }) => [productId, quantity]), [[drawerRailScrew.id, 1]]);

  const duplicate = { ...plan, id: uid(), label: "Alternate drawer movement" };
  const withDuplicate = { ...reopened, motionPlans: [...reopened.motionPlans!, duplicate] };
  const repeated = saveDrawerSlideMount(withDuplicate, duplicate.id, chosen);
  assert.deepEqual(drawerRailScrewPurchase(repeated), { required: 1, screws: 6 });
  const conflicting = saveDrawerSlideMount(repeated, duplicate.id, {
    ...chosen,
    drawer: { ...chosen.drawer, fasteners: { source: "on-hand", available: 6 } },
  });
  assert.equal(need(conflicting)?.canAdd, false);
  assert.match(need(conflicting)?.issue ?? "", /competing/);

  const changed = editRoundOpening(reopened, left.id, null, { axis: 0, fromEdges: [2.453, 16.75], diameter: 0.5 });
  assert.equal(need(changed)?.canAdd, false);
  assert.match(need(changed)?.issue ?? "", /unchecked/);

  const incompatible = saveDrawerSlideMount(project, plan.id, {
    ...chosen,
    drawer: { ...chosen.drawer, fasteners: { source: drawerRailScrew.id, seatToWood: 0.51 } },
  });
  assert.equal(need(incompatible)?.required, null);
  assert.match(guideMarkdown(incompatible), /does not reach wood/);
  assert.doesNotMatch(guideMarkdown(incompatible), /Everbilt model 801582/);
});
