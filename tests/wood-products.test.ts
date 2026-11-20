import test from "node:test";
import assert from "node:assert/strict";
import { material } from "../src/model";
import {
  checkProductBinding,
  findRetailerProduct,
  retailerProductSchema,
  reviewedOfferForMaterial,
} from "../src/retailerCatalog";

test("commodity boards use separate retailer specification identities without an invented mill MPN", () => {
  const ids = [
    "hd-common-pine-1x4x96-301993221",
    "lowes-reliabilt-lbr-940-1x4x96",
  ];
  for (const id of ids) {
    const product = findRetailerProduct(id)!;
    assert.equal(product.status, "reviewed-specs");
    assert.equal(product.identityBasis, "retailer-specification");
    assert.equal(product.manufacturerPartNumber, null);
    assert.deepEqual(product.profile.stockSize, [0.75, 96, 3.5]);
    assert.equal(product.profile.packCount, 1);
    assert.equal(product.offers.length, 1);
    const stock = {
      ...material("stud"),
      size: [0.75, 96, 3.5] as [number, number, number],
      stockSize: [0.75, 96, 3.5] as [number, number, number],
      productReference: id,
    };
    assert.equal(checkProductBinding(stock, product).compatible, true);
    assert.ok(reviewedOfferForMaterial(stock, product.offers[0].retailer));
    assert.equal(
      reviewedOfferForMaterial(
        stock,
        product.offers[0].retailer === "lowes" ? "home-depot" : "lowes",
      ),
      null,
    );
  }
  assert.notEqual(
    findRetailerProduct(ids[0])!.profile.materialFamily,
    findRetailerProduct(ids[1])!.profile.materialFamily,
  );
});

test("retailer specification identity cannot bypass manufactured identity or unknown wood stock", () => {
  const wood = findRetailerProduct("hd-common-pine-1x4x96-301993221")!;
  const screw = findRetailerProduct("simpson-sd9112r100")!;
  assert.equal(
    retailerProductSchema.safeParse({
      ...wood,
      identityBasis: "manufacturer-part",
    }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...screw,
      identityBasis: "retailer-specification",
      manufacturerPartNumber: null,
    }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...wood,
      profile: { ...wood.profile, packCount: null },
    }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...wood,
      profile: {
        ...wood.profile,
        stockSize: null,
        dimensionMeaning: "unverified",
      },
    }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...wood,
      sources: [
        { ...wood.sources[0], url: "https://www.homedepot.com/p/100375047" },
      ],
    }).success,
    false,
  );
  assert.equal(
    retailerProductSchema.safeParse({
      ...wood,
      sources: [{ ...wood.sources[0], url: "not a url" }],
    }).success,
    false,
  );
});

test("Plytanium actual .703 stock can bind an interior casework choice without reviving a retired offer", () => {
  const panel = findRetailerProduct("plytanium-bc-201428")!;
  const stock = {
    ...material("plywood"),
    size: [47.938, 0.703, 95.938] as [number, number, number],
    stockSize: [47.938, 0.703, 95.938] as [number, number, number],
    productReference: panel.id,
  };
  assert.equal(checkProductBinding(stock, panel).compatible, true);
  assert.equal(
    reviewedOfferForMaterial(stock, "home-depot")?.productId,
    "100061386",
  );
  assert.equal(reviewedOfferForMaterial(stock, "lowes"), null);
  const casework = panel.roleQualifications.find(
    (q) => q.role === "caseworkPanels",
  )!;
  assert.match(casework.scope, /Dry interior/);
  assert.match(casework.requirements.join(" "), /Conflicting exposure/);
  assert.equal(
    panel.roleQualifications.some((q) => q.role === "saunaInterior"),
    false,
  );
  assert.equal(
    checkProductBinding(material("plywood"), panel).compatible,
    false,
    "Generic .75-inch stock does not become .703-inch stock silently",
  );
});

test("retired and sell-unit-unknown framing references remain distinct from purchasable exact stock", () => {
  const retired = findRetailerProduct("lowes-syp-2x4x96-1365777-retired")!;
  const stock = { ...material("stud"), productReference: retired.id };
  assert.equal(retired.offers[0].listingStatus, "retired");
  assert.equal(
    checkProductBinding(stock, retired).compatible,
    true,
    "Historical geometry remains reviewed",
  );
  assert.equal(
    reviewedOfferForMaterial(stock, "lowes"),
    null,
    "Retired offer is never a purchase match",
  );
  const uncertain = findRetailerProduct(
    "lowes-douglas-fir-2x4x96-330568-candidate",
  )!;
  assert.equal(uncertain.profile.packCount, null);
  assert.equal(uncertain.status, "candidate");
  assert.equal(
    checkProductBinding(material("stud"), uncertain).compatible,
    false,
  );
});

test("lid hinge and support references preserve their separate functions and unresolved fit", () => {
  const hinge = findRetailerProduct("everbilt-29256-continuous-hinge")!;
  const support = findRetailerProduct("national-n208-637-lid-support")!;
  assert.equal(hinge.roleQualifications[0].role, "storageLidHinge");
  assert.equal(support.roleQualifications[0].role, "storageLidSupport");
  assert.match(hinge.roleQualifications[0].scope, /does not hold a lid open/);
  assert.match(
    support.roleQualifications[0].requirements.join(" "),
    /mass\/center of gravity/,
  );
  assert.match(support.offers[0].seller, /Max Warehouse/);
  for (const product of [hinge, support]) {
    assert.equal(product.profile.stockSize, null);
    assert.equal(product.profile.packCount, 1);
    assert.equal(
      checkProductBinding(material("bracket"), product).compatible,
      false,
    );
    assert.equal("price" in product, false);
    assert.equal("available" in product, false);
    assert.ok(product.discrepancies.length > 0);
  }
});
