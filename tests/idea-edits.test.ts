import test from "node:test";
import assert from "node:assert/strict";
import { blank, material, projectSchema, type V3 } from "../src/model";
import {
  localIdeaPlan,
  previewIdeaPlan,
  ideaPlanSchema,
  type IdeaPlan,
} from "../src/planning";
import { mentionedFamily, namedMeasurement } from "../src/ideaEdits";
import { rotate } from "../src/spatial";
import { wireIntentToPlan } from "../server/intentPlanner";
const seed = () =>
  localIdeaPlan({
    prompt:
      "A storage banquette, three sections, 72 inches wide, 24 inches deep, 18 inches seat height, no back and opening lids",
  });
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`);
function width(plan: IdeaPlan) {
  const p = previewIdeaPlan(blank(), plan);
  return p.max[0] - p.min[0];
}

test("overall run width distributes dimensions and reflows to the requested actual envelope", () => {
  const previous = seed(),
    next = localIdeaPlan({
      prompt: "Make the overall width 96 inches",
      previousPlan: previous,
    });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [32, 32, 32],
  );
  assert.deepEqual(
    next.modules.map((m) => m.position[0]),
    [-32, 0, 32],
  );
  near(width(next), 96);
  assert.deepEqual(previous, seed());
  const p = blank();
  p.workZone = { width: 96, depth: 24, height: 84 };
  assert.equal(previewIdeaPlan(p, next).workZoneFits, true);
});
test("each after a section count specifies per-section stock dimensions in both planner paths", () => {
  const prompt = "Build a straight banquette with three sections, each 36 inches wide, seat depth 24 inches, seat height 18 inches, lift-up lids and no back.";
  for (const plan of [localIdeaPlan({ prompt }), wireIntentToPlan({ prompt }, { family: "banquette", operation: "create", width: 36, sectionCount: 3 })]) {
    assert.deepEqual(plan.modules.map(({ width }) => width), [36, 36, 36]);
    near(width(plan), 108);
    assert.ok(plan.modules.every(({ openingLid, storage, backHeight }) => openingLid && storage && backHeight === 0));
  }
});

test("each-member width reflows without overlapping neighboring compartments", () => {
  const next = localIdeaPlan({
    prompt: "Make each section 30 inches wide",
    previousPlan: seed(),
  });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [30, 30, 30],
  );
  assert.deepEqual(
    next.modules.map((m) => m.position[0]),
    [-30, 0, 30],
  );
  near(width(next), 90);
});
test("named section changes only its width and keeps neighboring dimensions, products and features", () => {
  const old = seed();
  old.modules[0].panelMaterial = "plytanium-703";
  const next = localIdeaPlan({
    prompt: "Make Banquette section 2 30 inches wide",
    previousPlan: old,
  });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [24, 30, 24],
  );
  near(width(next), 78);
  for (const i of [0, 2])
    assert.deepEqual(
      { ...next.modules[i], position: old.modules[i].position },
      old.modules[i],
    );
  assert.equal(next.modules[1].openingLid, true);
});
test("rotated translated run preserves pose while width changes in its own local axis", () => {
  const old = seed(),
    yaw = 35,
    origin: V3 = [80, 6, -20];
  old.modules = old.modules.map((m) => ({
    ...m,
    yaw,
    position: rotate(m.position, [0, (yaw * Math.PI) / 180, 0]).map(
      (v, i) => v + origin[i],
    ) as V3,
  }));
  const next = localIdeaPlan({
    prompt: "Make overall width 96 inches",
    previousPlan: old,
  });
  next.modules.forEach((m, i) => {
    const expected = rotate(
      [[-32, 0, 32][i], 0, 0],
      [0, (yaw * Math.PI) / 180, 0],
    ).map((n, j) => n + origin[j]);
    m.position.forEach((n, j) => near(n, expected[j]));
    assert.equal(m.yaw, 35);
  });
});
test("unequal compartment proportions survive a total width edit", () => {
  const old = seed();
  old.modules[0].width = 18;
  old.modules[1].width = 24;
  old.modules[2].width = 30;
  old.modules[0].position[0] = -27;
  old.modules[1].position[0] = -6;
  old.modules[2].position[0] = 21;
  const next = localIdeaPlan({
    prompt: "Overall width 96 inches",
    previousPlan: old,
  });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [24, 32, 40],
  );
  near(width(next), 96);
});
test("a separate cabinet is appended after unchanged benches and placed beside their occupied bounds", () => {
  const old = seed(),
    next = localIdeaPlan({
      prompt:
        "Add a cabinet 36 inches wide, 20 inches deep and 60 inches high next to the seats",
      previousPlan: old,
    });
  assert.equal(next.modules.length, 4);
  assert.deepEqual(next.modules.slice(0, 3), old.modules);
  const cabinet = next.modules[3];
  assert.equal(cabinet.kind, "cabinet");
  assert.deepEqual(
    [cabinet.width, cabinet.depth, cabinet.height],
    [36, 20, 60],
  );
  assert.ok(cabinet.position[0] - cabinet.width / 2 >= 38);
});
test("repartition of different product choices asks a question and preserves the proposal", () => {
  const old = seed();
  old.modules[1].panelMaterial = "plytanium-703";
  const next = localIdeaPlan({ prompt: "four sections", previousPlan: old });
  assert.deepEqual(next.modules, old.modules);
  assert.ok(next.questions.some((q) => /different materials/.test(q)));
});
test("uniform repartition preserves the run envelope and actual .703 panel stock", () => {
  const old = seed();
  old.modules.forEach((m) => (m.panelMaterial = "plytanium-703"));
  const next = localIdeaPlan({ prompt: "four sections", previousPlan: old });
  assert.equal(next.modules.length, 4);
  near(width(next), 72);
  assert.ok(next.modules.every((m) => m.panelMaterial === "plytanium-703"));
  const p = previewIdeaPlan(blank(), next).project;
  assert.ok(
    p.pieces
      .filter((p) => p.material === "plytanium-703")
      .every(
        (p) =>
          Math.min(...p.size) === Math.min(...material("plytanium-703").size),
      ),
  );
});
test("targeted structure edit preserves all furniture, unrelated structures and selected source products", () => {
  const old = ideaPlanSchema.parse({
    ...seed(),
    structures: [
      ...localIdeaPlan({ prompt: "Greenhouse" }).structures,
      ...localIdeaPlan({ prompt: "Sauna" }).structures,
    ],
  });
  old.structures[0].selections.greenhouseGlazing = {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  };
  const next = localIdeaPlan({
    prompt: "Make greenhouse width 84 inches",
    previousPlan: old,
  });
  assert.equal(next.structures.length, 2);
  assert.deepEqual(next.modules, old.modules);
  assert.deepEqual(next.structures[1], old.structures[1]);
  assert.equal((next.structures[0].parameters as { width: number }).width, 84);
  assert.deepEqual(next.structures[0].selections, old.structures[0].selections);
});
test("bare measurements ask for units and retain all previous geometry", () => {
  const old = seed(),
    next = localIdeaPlan({ prompt: "Make the depth 18", previousPlan: old });
  assert.deepEqual(next.modules, old.modules);
  assert.ok(next.questions.some((q) => /inches or feet/.test(q)));
  assert.equal(localIdeaPlan({ prompt: "Bench 8 by 4" }).modules.length, 0);
});
test("mixed feet/inches, number words and fractions preserve exact inch dimensions", () => {
  assert.equal(
    namedMeasurement("eight feet six inches wide", "wide")?.inches,
    102,
  );
  assert.equal(namedMeasurement("width 30 1/2 inches", "width")?.inches, 30.5);
  const next = localIdeaPlan({
    prompt: "Make the overall width eight feet six inches",
    previousPlan: seed(),
  });
  near(width(next), 102);
});
test("shared seat height leaves an unrelated cabinet unchanged", () => {
  const old = seed();
  old.modules.push(
    localIdeaPlan({ prompt: "Cabinet 36 inches wide, 60 inches high" })
      .modules[0],
  );
  const next = localIdeaPlan({
    prompt: "Make seats 20 inches high",
    previousPlan: old,
  });
  assert.ok(next.modules.slice(0, 3).every((m) => m.height === 20));
  assert.deepEqual(next.modules[3], old.modules[3]);
});
test("ambiguous corner width and missing section target preserve the entire proposal", () => {
  const old = localIdeaPlan({ prompt: "L-shaped banquette 7 by 5 feet" }),
    next = localIdeaPlan({
      prompt: "Make overall width 96 inches",
      previousPlan: old,
    });
  assert.deepEqual(next.modules, old.modules);
  assert.ok(next.questions.some((q) => /back run or the return/.test(q)));
  const missing = localIdeaPlan({
    prompt: "Make section 9 30 inches wide",
    previousPlan: seed(),
  });
  assert.equal(missing.modules.length, 3);
  assert.ok(missing.questions.length);
});
test("additions retain mixed structures and all selected data through project JSON round-trip", () => {
  const old = localIdeaPlan({ prompt: "Greenhouse" });
  old.structures[0].selections.greenhouseGlazing = {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  };
  const next = localIdeaPlan({
    prompt: "Add a bench 36 inches wide, 20 inches deep, 18 inches high",
    previousPlan: old,
  });
  assert.deepEqual(next.structures, old.structures);
  assert.equal(next.modules.length, 1);
  const p = previewIdeaPlan(blank(), next).project;
  assert.deepEqual(
    projectSchema.parse(JSON.parse(JSON.stringify(p))).pieces,
    p.pieces,
  );
});

test("hyphenated number words and an overall return retain the requested L-shaped footprint", () => {
  const next = localIdeaPlan({
    prompt:
      "Plan an L-shaped kitchenette banquette, seven feet along the back with a five-foot overall return, seats twenty-four inches deep and eighteen inches high",
  });
  assert.equal(next.modules[0].width, 84);
  assert.equal(next.modules[1].width, 36);
  const p = previewIdeaPlan(blank(), next);
  near(p.max[2] - p.min[2], 60);
});
test("fresh sauna defaults reserve a bench that fits a small clear room without shrinking an explicit bench", () => {
  const next = localIdeaPlan({
    prompt: "Sauna four feet wide, four feet deep, seven feet high",
  });
  assert.equal(
    (next.structures[0].parameters as { benchWidth: number }).benchWidth,
    48,
  );
  assert.doesNotThrow(() => previewIdeaPlan(blank(), next));
  const explicit = localIdeaPlan({
    prompt:
      "Sauna four feet wide, four feet deep, seven feet high, bench width sixty inches",
  });
  assert.equal(
    (explicit.structures[0].parameters as { benchWidth: number }).benchWidth,
    60,
  );
  assert.throws(() => previewIdeaPlan(blank(), explicit));
});

test("explicit raw measurements take precedence over conflicting model-appended dimension suffixes", () => {
  const next = localIdeaPlan({
    prompt:
      "L-shaped banquette seven feet along the back with a five-foot overall return, seats twenty-four inches deep and eighteen inches high. 48 inches return",
  });
  const p = previewIdeaPlan(blank(), next);
  near(p.max[2] - p.min[2], 60);
});

test("Each in an unrelated sentence does not change total-run width semantics", () => {
  const old = seed(),
    next = localIdeaPlan({
      prompt:
        "Make total width 96 inches. Each section must retain storage and an opening lid.",
      previousPlan: old,
    });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [32, 32, 32],
  );
  near(width(next), 96);
});

test("family targeting skips negated coordinated mentions and recognizes bookshelves", () => {
  assert.equal(
    mentionedFamily("No bench or seating. I want bookshelves 36 inches wide."),
    "shelf",
  );
  assert.equal(
    mentionedFamily("No bench, cabinet or seating; build a greenhouse."),
    "greenhouse",
  );
  assert.equal(mentionedFamily("Not a bench; a bookshelf instead."), "shelf");
  assert.equal(mentionedFamily("A sauna with no bench selected"), "sauna");
  assert.equal(mentionedFamily("No bench or seating."), undefined);
  const plan = localIdeaPlan({
    prompt:
      "No bench or seating. I want bookshelves 36 inches wide, 16 inches deep, 72 inches high",
  });
  assert.equal(plan.modules[0].kind, "shelf");
});

test("section ordinal before a width label is not mistaken for the dimension value", () => {
  assert.equal(
    namedMeasurement("Make section 2 width 36 inches", "width")?.inches,
    36,
  );
  const next = localIdeaPlan({
    prompt: "Make section 2 width 36 inches",
    previousPlan: seed(),
  });
  assert.deepEqual(
    next.modules.map((m) => m.width),
    [24, 36, 24],
  );
  near(width(next), 84);
});
