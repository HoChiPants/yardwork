import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  packRectangles,
  type RectangleCut,
  type StockPlan,
} from "../src/packing";
import {
  bom,
  cutPiece,
  guideMarkdown,
  shoppingCsv,
  usableInventory,
  validate,
} from "../src/engine";
import { homeDepotHandoff, homeDepotShoppingList } from "../src/handoff";
import {
  blank,
  material,
  part,
  projectSchema,
  type Inventory,
  type Project,
} from "../src/model";
import { migrateLegacyProject } from "../src/projectVersion";
function meshProject(sizes: [number, number][]): Project {
  const p = blank("Predator mesh study");
  sizes.forEach(([w, l], i) =>
    p.pieces.push(
      part(
        `Mesh ${i + 1}`,
        "mesh",
        [w, l, 0.04],
        [i * 30, l / 2, 0],
        p.steps[0].id,
        "Wire",
      ),
    ),
  );
  return p;
}
function checkFeasibility(plans: StockPlan[], source: RectangleCut[]) {
  const seen = new Set<string>();
  for (const plan of plans) {
    assert.ok(plan.usedLength <= plan.length + 1e-8);
    for (const a of plan.placements) {
      assert.ok(!seen.has(a.id), "every cut appears exactly once");
      seen.add(a.id);
      const original = source.find((c) => c.id === a.id)!;
      assert.ok(
        a.rotated
          ? a.width === original.length && a.length === original.width
          : a.width === original.width && a.length === original.length,
      );
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.x + a.width <= plan.width + 1e-8 &&
          a.y + a.length <= plan.length + 1e-8,
        "all cuts fit within stock",
      );
    }
    for (let i = 0; i < plan.placements.length; i++)
      for (let j = i + 1; j < plan.placements.length; j++) {
        const a = plan.placements[i],
          b = plan.placements[j];
        assert.ok(
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1e-8 ||
            Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y) <=
              1e-8,
          "cuts never overlap",
        );
      }
  }
  assert.equal(seen.size, source.length);
}
test("roll packing fixes area-only undercounts and yields a feasible cut plan", () => {
  const p = meshProject([
      [13, 200],
      [13, 200],
    ]),
    row = bom(p)[0];
  assert.equal(row.quantity, 2);
  assert.equal(row.rolls.length, 2);
  assert.equal(row.total, 2 * material("mesh").price);
  checkFeasibility(
    row.rolls,
    p.pieces.map((a) => ({
      id: a.id,
      name: a.name,
      width: a.size[0],
      length: a.size[1],
    })),
  );
});
test("strips that fit across the roll share stock, and end-to-end cuts can fill a roll", () => {
  const side = bom(
    meshProject([
      [12, 200],
      [12, 200],
    ]),
  )[0];
  assert.equal(side.quantity, 1);
  assert.equal(side.rolls[0].usedLength, 200);
  const end = bom(
    meshProject([
      [24, 200],
      [24, 100],
    ]),
  )[0];
  assert.equal(end.quantity, 1);
  assert.equal(end.rolls[0].usedLength, 300);
  checkFeasibility(
    end.rolls,
    end.rolls.flatMap((p) =>
      p.placements.map((c) => ({
        id: c.id,
        name: c.name,
        width: c.width,
        length: c.length,
      })),
    ),
  );
});
test("oversized mesh and inappropriate thickness are excluded from quantities and price", () => {
  const p = meshProject([
    [25, 200],
    [12, 120],
  ]);
  p.pieces.push(
    part(
      "Too thick",
      "mesh",
      [12, 12, 0.25],
      [80, 6, 0],
      p.steps[0].id,
      "Wire",
    ),
  );
  const row = bom(p)[0];
  assert.equal(row.oversize, 2);
  assert.equal(row.oversizedParts.length, 2);
  assert.equal(row.quantity, 1);
  assert.equal(row.total, material("mesh").price);
  assert.equal(row.rolls.flatMap((p) => p.placements).length, 1);
  assert.ok(validate(p).some((f) => f.id === "stock-mesh"));
  const bad = meshProject([[25, 200]]);
  assert.equal(bom(bad)[0].total, 0);
  assert.equal(bom(bad)[0].quantity, 0);
});
test("rectangle rotations stay feasible and rejected dimensions never enter stock plans", () => {
  const cuts: RectangleCut[] = [
    { id: "a", name: "Rotated", width: 200, length: 12 },
    { id: "b", name: "Another", width: 12, length: 200 },
  ];
  const result = packRectangles(cuts, 24, 300);
  assert.equal(result.plans.length, 1);
  checkFeasibility(result.plans, cuts);
  const invalid = [
    { id: "too-wide", name: "Wide", width: 25, length: 200 },
    { id: "negative", name: "Negative", width: -1, length: 3 },
    { id: "nan", name: "NaN", width: NaN, length: 3 },
  ];
  assert.equal(packRectangles(invalid, 24, 300).rejected.length, 3);
  assert.throws(() => packRectangles(cuts, 0, 300));
  assert.throws(() => packRectangles(cuts, 24, Infinity));
});
test("varied cuts all receive in-bounds non-overlapping placements without mutating input", () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const cuts = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    name: `Mesh ${i}`,
    width: 1 + Math.floor(random() * 24),
    length: 1 + Math.floor(random() * 240),
  }));
  const before = structuredClone(cuts);
  const packed = packRectangles(cuts, 24, 300);
  assert.equal(packed.rejected.length, 0);
  checkFeasibility(packed.plans, cuts);
  assert.deepEqual(cuts, before);
  assert.deepEqual(packRectangles(cuts, 24, 300), packed);
});
test("inventory chooses the most recent matching observation, including zero stock", () => {
  const p = meshProject([
    [13, 200],
    [13, 200],
  ]);
  p.store = "4409";
  const make = (ago: number, available: number, price: number): Inventory => ({
    material: "mesh",
    internetNumber: "123456789",
    name: "Checked mesh",
    price,
    available,
    store: "4409",
    zip: "84121",
    checkedAt: new Date(Date.now() - ago).toISOString(),
    url: "https://www.homedepot.com/p/example/123456789",
  });
  p.inventory = [make(3600000, 100, 10), make(60000, 0, 42)];
  assert.equal(usableInventory(p, "mesh")?.available, 0);
  assert.equal(bom(p)[0].price, 42);
  assert.ok(
    validate(p).some((f) => f.id === "short-mesh" && f.title.includes("2")),
  );
  p.zip = "84101";
  assert.equal(usableInventory(p, "mesh"), undefined);
});
test("retailer handoff uses purchase units once, retains exact product references, and omits stale stock claims", () => {
  const p = meshProject([
    [13, 200],
    [13, 200],
  ]);
  p.store = "4409";
  p.inventory = [
    {
      material: "mesh",
      internetNumber: "123456789",
      name: "My matched roll",
      price: 39,
      available: 3,
      store: "4409",
      zip: "84121",
      checkedAt: new Date().toISOString(),
      url: "https://www.homedepot.com/p/example/123456789",
    },
  ];
  const text = homeDepotHandoff(p);
  assert.match(text, /- 2 rolls — ½ in hardware cloth/);
  assert.match(text, /Internet number: 123456789/);
  assert.match(text, /User-recorded snapshot: 3 available/);
  assert.match(text, /PROJECT PHASES/);
  assert.match(text, /does not synchronize/);
  const list = homeDepotShoppingList(p);
  assert.equal(list.text, "2 rolls — My matched roll — Internet #123456789");
  assert.equal(list.items[0].snapshot?.available, 3);
  assert.deepEqual(list.reviews, []);
  const conflict = homeDepotShoppingList({
    ...p,
    pieces: [
      ...p.pieces,
      part("Board", "stud", [1.5, 96, 3.5], [0, 48, 0], p.steps[0].id, "Frame"),
    ],
    inventory: [...p.inventory, { ...p.inventory[0], material: "stud" }],
  });
  assert.equal(conflict.text, "");
  assert.equal(
    conflict.reviews.filter(
      (row) => row.reason === "Possible double count · 123456789",
    ).length,
    2,
  );
  p.inventory[0].url = "https://www.homedepot.com/p/example/123456780";
  assert.equal(homeDepotShoppingList(p).text, "");
  p.inventory[0].url = "https://www.homedepot.com/p/example/123456789";
  p.inventory[0].checkedAt = "2020-01-01T00:00:00.000Z";
  const stale = homeDepotHandoff(p);
  assert.ok(!stale.includes("123456789"));
  assert.ok(!stale.includes("3 available"));
  assert.match(stale, /availability are unverified/);
  assert.equal(homeDepotShoppingList(p).text, "");
  assert.equal(
    homeDepotShoppingList(p).reviews[0].reason,
    "Exact product match needed",
  );
});
test("handoff counts cut boards and retained offcuts as stock and makes excluded dimensions explicit", () => {
  let p = blank("Framing");
  p.pieces = [
    part(
      "One board",
      "stud",
      [1.5, 96, 3.5],
      [0, 48, 0],
      p.steps[0].id,
      "Wall",
    ),
  ];
  p = cutPiece(p, p.pieces[0].id, 48);
  assert.match(homeDepotHandoff(p), /- 1 board — 2 × 4 framing lumber/);
  p.pieces.push(
    part(
      "Too long\ncheck this",
      "stud",
      [1.5, 120, 3.5],
      [30, 60, 0],
      p.steps[0].id,
      "Wall",
    ),
  );
  const text = homeDepotHandoff(p);
  assert.match(text, /INCOMPLETE MATERIAL LIST/);
  assert.match(text, /UNRESOLVED PARTS/);
  assert.match(text, /Too long check this: 1.5″ × 10′ × 3.5″/);
  assert.match(text, /- 1 board — 2 × 4 framing lumber/);
  assert.ok(!text.includes("Too long\ncheck this"));
  assert.match(homeDepotHandoff(blank()), /No fitting stock units/);
});

test("framing references add real purchase identities to the five saved build examples without counting store inventory", () => {
  const expected = {
    greenhouse: ["338861827", "334216730"],
    sauna: ["338861827"],
    "storage-banquette": ["338861827"],
    shelves: [],
    "closet-insert": [],
  };
  for (const [name, numbers] of Object.entries(expected)) {
    const raw = readFileSync(
      new URL(
        `../public/examples/builds/${name}.yardwork.json`,
        import.meta.url,
      ),
      "utf8",
    );
    const project = projectSchema.parse(migrateLegacyProject(JSON.parse(raw)));
    const result = homeDepotShoppingList(project);
    const suggestions = result.items.filter((item) => item.suggested);
    assert.deepEqual(
      suggestions.map((item) => item.productId),
      numbers,
      name,
    );
    for (const item of suggestions) {
      const id = item.productId === "338861827" ? "stud" : "two-six";
      assert.equal(
        item.quantity,
        bom(project).find((row) => row.id === id)?.quantity,
      );
      assert.equal(item.snapshot, undefined);
      assert.ok(shoppingCsv(project).includes(item.url));
      assert.ok(
        homeDepotHandoff(project).includes(
          `Suggested regional listing: ${item.productId}`,
        ),
      );
    }
  }
});

test("the build guide exports roll coordinates that can be followed at the workbench", () => {
  const p = meshProject([
    [12, 200],
    [12, 200],
  ]);
  const guide = guideMarkdown(p);
  assert.match(guide, /## Roll cutting layouts/);
  assert.match(guide, /roll 1 \(24 × 300 in\)/);
  assert.match(guide, /start X 0 in, Y 0 in/);
  assert.match(guide, /start X 12 in, Y 0 in/);
  assert.ok(!guide.includes("roll 2"));
});
