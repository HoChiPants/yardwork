import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, part, uid, projectSchema } from "../src/model";
import { bom, hardwareForJoint, shoppingCsv, validate } from "../src/engine";
import { toolChecklist } from "../src/tools";
import { retailerHandoff } from "../src/handoff";
import {
  findRetailerProduct,
  checkProductBinding,
} from "../src/retailerCatalog";
test("reviewed fastener geometry and packs match exact sourced products while legacy approximations do not", () => {
  for (const id of ["sd9112r100", "n10dhdg-r"] as const) {
    const stock = material(id);
    const product = findRetailerProduct(stock.productReference!)!;
    assert.ok(checkProductBinding(stock, product).compatible);
    assert.equal(stock.size[0], product.profile.headDiameter);
    assert.equal(stock.shankDiameter, product.profile.shankDiameter);
    assert.equal(stock.packCount, product.profile.packCount);
  }
  assert.equal(
    checkProductBinding(
      material("connector-screw"),
      findRetailerProduct("simpson-sd9112r100")!,
    ).compatible,
    false,
  );
});
test("connector nails are counted in120packs and unpriced is distinct from free", () => {
  const p = blank();
  p.pieces = [
    part("A", "stud", [1.5, 24, 3.5], [0, 12, 0], p.steps[0].id, "Frame"),
    part("B", "stud", [24, 1.5, 3.5], [0, 24.75, 0], p.steps[0].id, "Frame"),
  ];
  p.joints = [
    {
      id: uid(),
      a: p.pieces[0].id,
      b: p.pieces[1].id,
      kind: "nail",
      material: "n10dhdg-r",
      quantity: 100,
      length: 1.5,
      stepId: p.steps[0].id,
    },
  ];
  assert.equal(hardwareForJoint(p.joints[0])?.id, "n10dhdg-r");
  const row = bom(p).find((row) => row.id === "n10dhdg-r")!;
  assert.equal(row.quantity, 1);
  assert.equal(row.unpriced, true);
  assert.match(shoppingCsv(p), /UNPRICED/);
  assert.ok(validate(p).some((f) => f.id === "unpriced-products"));
  p.pieces.push(
    part(
      "Placed connector nail",
      "n10dhdg-r",
      [0.31, 1.5, 0.31],
      [0, 0, 0],
      p.steps[0].id,
      "Hardware",
    ),
  );
  const tools = toolChecklist(p);
  assert.ok(tools.requirements.some((row) => row.capability === "drive-nail"));
  assert.ok(
    tools.requirements.some((row) => row.capability === "connector-install"),
  );
  assert.ok(
    !tools.requirements.some((row) => row.capability === "drive-screw"),
  );
  assert.match(retailerHandoff(p), /Reviewed product reference: 206101770/);
});

test("exact reference snapshots cannot substitute a different product number for a reviewed pack", async () => {
  const { inventorySchema } = await import("../src/model");
  const base = {
    material: "sd9112r100",
    retailer: "lowes",
    internetNumber: "3242494",
    name: "ObservedSD9112R100",
    price: 15,
    available: 10,
    store: "101",
    zip: "84121",
    checkedAt: new Date().toISOString(),
    url: "https://www.lowes.com/pd/example/3242494",
  };
  assert.ok(inventorySchema.parse(base));
  assert.throws(
    () => inventorySchema.parse({ ...base, internetNumber: "9999999" }),
    /does not match/,
  );
  assert.throws(
    () =>
      inventorySchema.parse({
        ...base,
        url: "https://www.lowes.com/pd/other/9999999",
      }),
    /exact reviewed product/,
  );
  assert.throws(
    () => inventorySchema.parse({ ...base, material: "hd-pine-1x4" }),
    /No current reviewed offer/,
  );
  assert.throws(
    () =>
      inventorySchema.parse({
        ...base,
        url: "https://www.lowes.com/search?searchTerm=3242494",
      }),
    /exact reviewed product/,
  );
});
test("imported exact hardware and tube variants cannot silently change product dimensions", () => {
  const p = blank();
  p.pieces = [
    part(
      "Screw",
      "sd9112r100",
      [0.37, 3, 0.37],
      [0, 0, 0],
      p.steps[0].id,
      "Hardware",
    ),
  ];
  assert.throws(() => projectSchema.parse(p), /fixed dimensions/);
  p.pieces = [
    part(
      "Rod",
      "closet-rod-72",
      [1, 36, 1],
      [0, 0, 0],
      p.steps[0].id,
      "Closet",
    ),
  ];
  assert.throws(() => projectSchema.parse(p), /fixed outside diameter/);
  p.pieces[0].size = [1.3125, 36, 1.3125];
  assert.ok(projectSchema.parse(p));
});
