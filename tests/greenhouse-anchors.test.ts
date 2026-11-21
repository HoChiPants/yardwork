import assert from "node:assert/strict";
import test from "node:test";
import { createBuildStudy } from "../src/buildFixtures";
import { concreteAnchor } from "../src/concreteAnchorReference";
import { guideMarkdown, validate } from "../src/engine";
import { reviewGreenhouseAnchors } from "../src/greenhouseAnchors";
import { greenhouseBaseEntries } from "../src/greenhouseBaseConnections";
import { foundationFromBase } from "../src/greenhouseFoundation";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
import { projectSchema, uid } from "../src/model";
import {
  addHomeDepotPurchaseNeed,
  homeDepotPurchaseNeeds,
} from "../src/handoffPurchases";
import { findRetailerProduct } from "../src/retailerCatalog";
import { addSupply, recordSupplyInventory, supplyRows } from "../src/supplies";
import { toolChecklist } from "../src/tools";
import { treatedWoodCuts } from "../src/treatedWood";

function fixture() {
  const { project } = createBuildStudy("greenhouse");
  const [base] = greenhouseBaseEntries(project);
  const rail = base.rails.get("back")!;
  // The approved test detail uses a horizontal 2 × 4 sill.
  const original = foundationFromBase(base)!;
  rail.size = [rail.size[0], rail.size[2], rail.size[1]];
  rail.position[1] = original.topY + rail.size[1] / 2;
  const mark = {
    id: uid(),
    railId: rail.id,
    x: rail.position[0],
    z: rail.position[2],
  };
  const layout = {
    productId: concreteAnchor.productId,
    thickness: 7,
    embedment: 4,
    anchorLength: 6,
    fixtureStack: 0.5,
    edge: 4,
    spacing: 8,
    detail: "Test detail S1 rev B",
    locations: [mark],
  };
  const site = {
    ...original,
    width: original.width + 12,
    depth: original.depth + 12,
    anchors: layout,
  };
  project.greenhouseFoundations = [site];
  return { project, base, rail, site, layout, mark };
}

test("saved marks use the retained drill cylinder, signed slab distances, spacing and depth", () => {
  const { project, base, rail, site, layout, mark } = fixture();
  const [fitting] = reviewGreenhouseAnchors(site, base)!.rows;
  assert.equal(fitting.bore, 4.5);
  assert.deepEqual(fitting.issues, []);
  assert.equal(fitting.reach, 4);
  layout.fixtureStack = 0.25;
  assert.match(
    reviewGreenhouseAnchors(site, base)!.rows[0].issues.join(" "),
    /leave 4\.25 in into concrete/,
  );
  layout.fixtureStack = 0.5;
  layout.embedment = 3.5;
  assert.match(
    reviewGreenhouseAnchors(site, base)!.rows[0].issues.join(" "),
    /outside the reviewed/,
  );
  layout.embedment = 4;

  layout.locations.push({ ...mark, id: uid(), x: mark.x + 2 });
  layout.thickness = 4.5;
  const tight = reviewGreenhouseAnchors(site, base)!.rows;
  for (const row of tight) {
    assert.equal(row.nearest, 2);
    assert.match(
      row.issues.join(" "),
      /spacing needs 6 in more.*reaches or passes the bottom/,
    );
  }
  layout.thickness = 7;
  layout.locations.pop();
  layout.edge = 10;
  assert.match(
    reviewGreenhouseAnchors(site, base)!.rows[0].issues.join(" "),
    /Center-to-edge needs 5|Center-to-edge needs 3/,
  );
  layout.edge = 4;

  // Leave the drill center in the timber but remove wood within its radius.
  rail.cutPlanes = [{ normal: [1, 0, 0], constant: 0.125 }];
  assert.match(
    reviewGreenhouseAnchors(site, base)!.rows[0].issues.join(" "),
    /drill circle crosses or misses the retained rail/,
  );
  assert.ok(
    validate(project).some(
      ({ id }) => id === `greenhouse-anchor-${site.entryId}-${mark.id}`,
    ),
  );
  assert.match(
    guideMarkdown(project),
    /Anchor 1 .*drill circle crosses or misses the retained rail/,
  );

  rail.cutPlanes = [];
  rail.position[1] += 0.25;
  assert.match(
    reviewGreenhouseAnchors(site, base)!.rows[0].issues.join(" "),
    /does not seat at this mark/,
  );
  assert.match(
    reviewGreenhouseAnchors(site)!.rows[0].issues.join(" "),
    /rail is unavailable/,
  );
});

test("anchor details and per-site tool requirements survive editable projects and current guides", () => {
  const { project, site } = fixture();
  const next = generateBuildGuide(project);
  assert.equal(guideIsCurrent(next), true);
  assert.match(
    guideMarkdown(next),
    /Detail Test detail S1 rev B.*Concrete bore target 4\.5 in/,
  );
  assert.ok(
    toolChecklist(next).requirements.some(
      ({ capability, necessity }) =>
        capability === "concrete-anchor-bore" && necessity === "conditional",
    ),
  );
  assert.ok(
    toolChecklist(next).requirements.some(
      ({ capability }) => capability === "drive-three-quarter-hex",
    ),
  );
  const older = projectSchema.parse({
    ...project,
    schemaVersion: 47,
    greenhouseFoundations: [{ ...site, anchors: undefined }],
  });
  assert.equal(older.greenhouseFoundations?.[0].anchors, undefined);
  assert.equal(
    guideIsCurrent({
      ...next,
      greenhouseFoundations: older.greenhouseFoundations,
    }),
    false,
  );
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(next))).greenhouseFoundations,
    [site],
  );
  assert.equal(
    projectSchema.safeParse({
      ...project,
      greenhouseFoundations: [
        {
          ...site,
          anchors: {
            ...site.anchors,
            locations: [site.anchors.locations[0], site.anchors.locations[0]],
          },
        },
      ],
    }).success,
    false,
  );
});

test("the exact single Home Depot sell unit accepts exact scoped store snapshots", () => {
  const { project } = fixture();
  const product = findRetailerProduct(concreteAnchor.productId)!;
  assert.equal(
    product.manufacturerPartNumber,
    concreteAnchor.manufacturerModel,
  );
  assert.equal(product.profile.packCount, 1);
  const offered = product.offers.find(
    ({ retailer }) => retailer === "home-depot",
  )!;
  assert.equal(offered.productId, "300690853");
  assert.equal(offered.retailerModel, "THD50600HMGF1");
  assert.equal(offered.retailerItemNumber, "1002236987");

  const now = Date.parse("2026-11-21T12:00:00Z");
  const withSupply = addSupply(
    { ...project, store: "4401" },
    concreteAnchor.productId,
    2,
    "Greenhouse foundation anchors",
  );
  const snapshot = recordSupplyInventory(withSupply, {
    productId: concreteAnchor.productId,
    retailer: "home-depot",
    retailerProductId: concreteAnchor.internetNumber,
    price: 9,
    available: 1,
    store: "4401",
    zip: "84121",
    checkedAt: new Date(now).toISOString(),
    url: concreteAnchor.listing,
  }, now);
  const [row] = supplyRows(snapshot, now);
  assert.equal(row.quantity, 2);
  assert.equal(row.inventory?.available, 1);
  assert.ok(
    row.issues.some((issue) => issue.includes("Snapshot quantity short")),
  );
  assert.deepEqual(snapshot.pieces, project.pieces);
  assert.deepEqual(snapshot.joints, project.joints);
});

test("Home Depot handoff aggregates reviewed sites against the project quantity and leaves flagged layouts pending", () => {
  const first = fixture(),
    second = fixture();
  const project = {
    ...first.project,
    ideaBindings: [
      ...first.project.ideaBindings,
      ...second.project.ideaBindings,
    ],
    sections: [...first.project.sections, ...second.project.sections],
    pieces: [...first.project.pieces, ...second.project.pieces],
    steps: [...first.project.steps, ...second.project.steps],
    greenhouseFoundations: [first.site, second.site],
  };
  const need = (
    draft: Parameters<typeof homeDepotPurchaseNeeds>[0] = project,
  ) =>
    homeDepotPurchaseNeeds(draft).find(
      ({ id }) => id === concreteAnchor.productId,
    );
  assert.equal(need()?.missing, 2);
  second.layout.thickness = 1;
  assert.equal(need()?.missing, 1);
  const ordered = addHomeDepotPurchaseNeed(project, concreteAnchor.productId);
  assert.equal(
    ordered.supplies.find(
      ({ productId }) => productId === concreteAnchor.productId,
    )?.quantity,
    1,
  );
  assert.equal(need(ordered), undefined);
  assert.equal(
    addHomeDepotPurchaseNeed(ordered, concreteAnchor.productId),
    ordered,
  );
});

test("field treatment follows the valid wood bore and withdraws it when the rail no longer seats", () => {
  const { project, rail } = fixture();
  rail.material = "treated";
  assert.match(treatedWoodCuts(project).find(({ piece }) => piece.id === rail.id)!.detail, /1 planned foundation anchor bore through the rail/);
  rail.position[1] += 0.25;
  assert.doesNotMatch(
    treatedWoodCuts(project).find(({ piece }) => piece.id === rail.id)?.detail ?? "",
    /foundation anchor bore/,
  );
});
