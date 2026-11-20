import assert from "node:assert/strict";
import test from "node:test";
import { guideMarkdown, validate } from "../src/engine";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { reviewPanelBearing } from "../src/panelBearing";
import { reconcileSections } from "../src/sections";
import { rotate } from "../src/spatial";
import {
  reviewShelfSag,
  saveShelfSagPlan,
  shelfSagGeometry,
} from "../src/shelfSag";

function fixture() {
  const project = blank("Synthetic shelf sag");
  const piece = part(
    "Test shelf",
    "plywood",
    [36, 0.75, 12],
    [0, 30, 0],
    project.steps[0].id,
    "Shelf",
  );
  piece.stockLengthAxis = 0;
  const support = (x: number) =>
    part(
      "Test support",
      "stud",
      [1.5, 1.5, 12],
      [x, 28.875, 0],
      project.steps[0].id,
      "Shelf",
    );
  project.pieces.push(piece, support(-17.25), support(17.25));
  const [row] = reviewPanelBearing(project, undefined, piece.id);
  const geometry = shelfSagGeometry(row)!;
  assert.equal(geometry.longest.length, 34.5);
  return {
    project,
    piece,
    support,
    plan: {
      ...geometry.identity,
      weight: 120,
      stiffness: 200000,
      target: 0.125,
      basis: "Synthetic stiffness for test only",
    },
  };
}

test("saved sheet properties drive a live sag estimate and actual center support reduces its longest bay", () => {
  const { project, piece, support, plan } = fixture();
  const planned = saveShelfSagPlan(project, piece.id, plan);
  const review = () => reviewShelfSag(reviewPanelBearing(planned)[0], plan);
  const result = review();
  assert.ok("deflection" in result);
  const formula = (5 * (120 / 36) * 34.5 ** 4) / (384 * 200000);
  assert.ok(Math.abs(result.deflection - formula) < 1e-10);
  assert.equal(result.withinTarget, false);
  const finding = () =>
    validate(planned).find(({ id }) => id === `shelf-sag-${piece.id}`)!;
  assert.equal(finding().severity, "warning");
  assert.equal(finding().area?.lines?.length, 1);

  planned.pieces.push(support(0));
  const improved = review();
  assert.ok("deflection" in improved);
  assert.equal(improved.geometry.longest.length, 17.25);
  assert.equal(improved.deflection, result.deflection / 16);
  assert.equal(improved.withinTarget, true);
  assert.equal(finding().severity, "info");
  assert.match(
    guideMarkdown(planned),
    /Shelf sag estimates[\s\S]+Within the 0\.125 in target/,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(planned))).shelfSagPlans,
    [plan],
  );
  assert.equal(
    projectSchema.parse({ ...project, schemaVersion: 55 }).shelfSagPlans,
    undefined,
  );
  assert.equal(
    reconcileSections({ ...planned, pieces: planned.pieces.slice(1) })
      .shelfSagPlans?.length,
    0,
  );
});

test("sag follows a quarter-turned assembly and rejects lost support, holes, and stale sheet data", () => {
  const { project, piece, plan } = fixture();
  const rotation: V3 = [0, Math.PI / 2, 0];
  for (const item of project.pieces) {
    item.rotation = rotation;
    item.position = rotate(item.position, rotation);
  }
  const get = () => reviewPanelBearing(project, undefined, piece.id)[0];
  const compare = () => reviewShelfSag(get(), plan);
  assert.equal(shelfSagGeometry(get())?.longest.length, 34.5);
  piece.stockLengthAxis = 2;
  const stale = compare();
  assert.ok("reason" in stale && stale.reason.includes("orientation changed"));
  piece.stockLengthAxis = 0;
  piece.rectangularOpenings = [{ axis: 1, center: [0, 0], spans: [3, 3] }];
  assert.equal(shelfSagGeometry(get()), null);
  piece.rectangularOpenings = undefined;
  project.pieces[1].position[1] -= 0.125;
  assert.equal(shelfSagGeometry(get()), null);
  project.pieces[1].position[1] += 0.125;
  project.pieces[1].size[2] -= 0.125;
  assert.equal(shelfSagGeometry(get()), null);
});
