import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFixtureIds,
  createBuildFixture,
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { bom, cutPiece } from "../src/engine";
import { blank, part, projectSchema, type V3 } from "../src/model";
import { findRetailerProduct } from "../src/retailerCatalog";
import { selectedToolsForProject, toolGuideMarkdown } from "../src/toolGuide";
import { toolChecklist } from "../src/tools";

const checkedAt = "2026-11-19T04:52:00.000Z";
const now = Date.parse(checkedAt);
const productId = "bosch-gcm12sd";

test("the five actual build fixtures derive separate tool requirements for their saved cuts", () => {
  for (const id of buildFixtureIds) {
    const { project } = createBuildFixture(id);
    const required = toolChecklist(project, [], now).requirements;
    assert.ok(required.some((r) => r.capability === "wood-crosscut"), id);
    const angled = required.find((r) => r.capability === "wood-angle-crosscut");
    if (id !== "greenhouse") {
      assert.equal(angled, undefined, id);
      continue;
    }
    assert.equal(angled?.status, "unknown");
    assert.equal(new Set(angled?.sources.map((s) => s.id)).size, 18);
    assert.equal(angled?.sources.length, 28);
    assert.ok(angled?.sources.every((s) => /P\d+.*33\.69° from square/.test(s.reason)));
  }
});

test("a reviewed exact saw carries both listing references and covers only angled lumber crosscuts", () => {
  const product = findRetailerProduct(productId)!;
  assert.equal(product.manufacturerPartNumber, "GCM12SD");
  assert.deepEqual(product.offers.map((offer) => [offer.retailer, offer.productId]), [
    ["home-depot", "202568455"],
    ["lowes", "3502512"],
  ]);
  const { project } = createBuildStudy("greenhouse", defaultBuildStudyParameters("greenhouse"), blank(), {
    greenhouseGlazing: { materialId: "sunlite-8mm", productRegistryRef: "sunlite-132506" },
  });
  const before = bom(project);
  project.toolSelections = [{ productId, checkedAt }];
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  const selection = selectedToolsForProject(reopened, now);
  assert.deepEqual(selection.tools[0].capabilities, ["wood-angle-crosscut"]);
  const statuses = new Map(toolChecklist(reopened, selection.tools, now).requirements.map((r) => [r.capability, r.status]));
  assert.equal(statuses.get("wood-angle-crosscut"), "supported");
  for (const capability of ["wood-rip", "profile-cut", "plastic-cut"] as const)
    assert.equal(statuses.get(capability), "unknown", capability);
  assert.deepEqual(bom(reopened), before);
  assert.match(toolGuideMarkdown(reopened, now), /Crosscut angled ends on lumber[\s\S]*Selected model: Bosch GCM12SD/);
});

test("corner clips remain profile work and inactive planes create no angled operation", () => {
  const p = blank();
  const make = (name: string, constant: number) => ({
    ...part(name, "stud", [1.5, 22, 3.5], [0, 0, 0], p.steps[0].id, "Tests"),
    cutPlanes: [{ normal: [0, Math.SQRT1_2, Math.SQRT1_2] as V3, constant }],
  });
  const corner = make("Corner clip", 12.1 * Math.SQRT1_2);
  const inactive = make("Inactive face", 100);
  p.pieces = [corner, inactive];
  const result = toolChecklist(p);
  assert.equal(result.requirements.find((r) => r.capability === "wood-angle-crosscut"), undefined);
  assert.deepEqual(
    result.requirements.find((r) => r.capability === "profile-cut")?.sources.map((s) => s.id),
    [corner.id],
  );
});

test("recorded source cuts follow specified stock axis even when it is shorter than the sheet width", () => {
  const p = blank();
  const panel = part("Grain-marked panel", "plywood", [24, 0.75, 36], [0, 1, 0], p.steps[0].id, "Tests");
  panel.stockLengthAxis = 0;
  p.pieces = [panel];
  const cut = cutPiece(p, panel.id, 12, 0);
  const result = toolChecklist(cut);
  assert.equal(result.requirements.find((r) => r.capability === "wood-crosscut")?.necessity, "required");
  assert.equal(result.requirements.find((r) => r.capability === "wood-rip"), undefined);
});
