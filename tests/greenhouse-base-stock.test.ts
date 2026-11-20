import assert from "node:assert/strict";
import test from "node:test";
import {
  createBuildStudy,
  defaultBuildStudyParameters,
} from "../src/buildFixtures";
import { bom, guideMarkdown, shoppingCsv, validate } from "../src/engine";
import { greenhouseBaseTimber as timber, greenhouseBaseTimber12 } from "../src/greenhouseBaseReference";
import { homeDepotShoppingList } from "../src/handoff";
import { blank, inventorySchema, material, projectSchema } from "../src/model";
import { structureMaterialChoices } from "../src/structures";
import {
  checkProductBinding,
  findRetailerProduct,
} from "../src/retailerCatalog";

const selection = {
  materialId: timber.materialId,
  productRegistryRef: timber.productId,
} as const;
const study = (parameters = defaultBuildStudyParameters("greenhouse")) =>
  createBuildStudy("greenhouse", parameters, undefined, {
    greenhouseBase: selection,
  });

test("the reviewed Home Depot 4x4 models only the four perimeter rails at its actual stock dimensions", () => {
  const { project, structure } = study();
  const stock = material(timber.materialId);
  const product = findRetailerProduct(timber.productId)!;
  assert.equal(checkProductBinding(stock, product).compatible, true);
  assert.deepEqual(stock.size, [3.5, 96, 3.5]);
  assert.deepEqual(
    structureMaterialChoices("greenhouseBase").map(
      ({ materialId }) => materialId,
    ),
    [stock.id, greenhouseBaseTimber12.materialId],
  );
  assert.ok(
    !structureMaterialChoices("frameLumber").some(
      ({ materialId }) => materialId === stock.id,
    ),
  );
  const ids = structure!.geometryRoles["base-framing"];
  const rails = project.pieces.filter((piece) => piece.material === stock.id);
  assert.deepEqual(
    rails.map(({ id }) => id),
    ids,
  );
  assert.deepEqual(
    rails.map(({ size }) => size),
    [
      [72, 3.5, 3.5],
      [72, 3.5, 3.5],
      [3.5, 3.5, 89],
      [3.5, 3.5, 89],
    ],
  );
  assert.ok(rails.every(({ position }) => position[1] === 1.75));
  const original = createBuildStudy("greenhouse");
  const framePose = (p: typeof project, except: string[]) =>
    p.pieces
      .filter(({ id }) => !except.includes(id))
      .map(({ size, position, rotation }) => ({ size, position, rotation }));
  assert.deepEqual(
    framePose(project, ids),
    framePose(
      original.project,
      original.structure!.geometryRoles["base-framing"],
    ),
  );
  assert.equal(structure!.qualifiedForConstruction, false);
  assert.ok(!validate(project).some(({ id }) => id === "collision"));
});

test("the exact timber flows from plan JSON to cuts and shopping, with store availability only from matching observations", () => {
  const { project } = study();
  const reopened = projectSchema.parse(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(reopened.ideaBindings, project.ideaBindings);
  const row = bom(reopened).find(({ id }) => id === timber.materialId)!;
  assert.equal(row.quantity, 4);
  assert.equal(row.physicalStockUnits, 4);
  assert.equal(row.unpriced, true);
  const offer = homeDepotShoppingList(reopened).items.find(
    ({ productId }) => productId === timber.internetNumber,
  )!;
  assert.equal(offer.quantity, 4);
  assert.equal(offer.snapshot, undefined);
  assert.equal(offer.suggested, false);
  assert.match(shoppingCsv(reopened), /205220341/);
  const guide = guideMarkdown(reopened);
  assert.match(guide, /Stock cut order[\s\S]+Ground-contact 4 × 4/);
  assert.match(guide, /Verify the delivered end tag/);

  const observation = {
    material: timber.materialId,
    retailer: "home-depot",
    zip: "84121",
    store: "4409",
    name: "Synthetic test timber",
    url: timber.listing,
    internetNumber: timber.internetNumber,
    price: 10.99,
    available: 3,
    checkedAt: new Date(Date.now() - 1000).toISOString(),
  };
  const parsed = inventorySchema.parse(observation);
  const matched = { ...reopened, store: "4409", inventory: [parsed] };
  assert.equal(
    bom(matched).find(({ id }) => id === timber.materialId)?.total,
    43.96,
  );
  assert.equal(
    homeDepotShoppingList(matched).items.find(
      ({ productId }) => productId === timber.internetNumber,
    )?.snapshot?.available,
    3,
  );
  assert.equal(
    bom({ ...matched, store: "5500" }).find(
      ({ id }) => id === timber.materialId,
    )?.unpriced,
    true,
  );
  assert.equal(
    inventorySchema.safeParse({
      ...observation,
      internetNumber: "202637084",
      url: "https://www.homedepot.com/p/202637084",
    }).success,
    false,
  );
});

test("the base does not silently substitute generic stock, shift to sauna framing or fit a rail beyond eight feet", () => {
  const dimensions = defaultBuildStudyParameters("greenhouse");
  assert.throws(
    () =>
      createBuildStudy("greenhouse", dimensions, blank(), {
        greenhouseBase: { ...selection, materialId: "post" },
      }),
    /exact catalog timber/,
  );
  assert.throws(
    () =>
      createBuildStudy("sauna", undefined, blank(), { frameLumber: selection }),
    /does not cover frameLumber/,
  );
  const oversize = bom(study({ ...dimensions, width: 108 }).project).find(
    ({ id }) => id === timber.materialId,
  )!;
  assert.equal(oversize.oversize, 2);
  assert.equal(oversize.quantity, 2);
});
