import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blank, projectSchema } from "../src/model";
import { guideMarkdown } from "../src/engine";
import { localIdeaPlan, previewIdeaPlan, type IdeaPlan } from "../src/planning";

const seats = () =>
  localIdeaPlan({
    prompt:
      "Three-section storage banquette 72 inches wide, 24 inches deep, 18 inches seat height with opening lids and no back",
  });
const revise = (previousPlan: IdeaPlan, prompt: string) =>
  localIdeaPlan({ prompt, previousPlan });

test("relative width uses the whole run by default and respects explicit per-section scope", () => {
  const original = seats();
  const wider = revise(original, "Make the banquette 1 foot 2 inches wider");
  assert.deepEqual(
    wider.modules.map(({ width }) => Number(width.toFixed(6))),
    Array(3).fill(28.666667),
  );
  const preview = previewIdeaPlan(blank(), wider);
  assert.ok(Math.abs(preview.max[0] - preview.min[0] - 86) < 1e-7);
  assert.deepEqual(original, seats());
  assert.deepEqual(
    revise(wider, "Make each section 1 1/2 inches narrower").modules.map(
      ({ width }) => Number(width.toFixed(6)),
    ),
    Array(3).fill(27.166667),
  );
});

test("a relative section edit preserves the other sections and the selected materials and lid details", () => {
  const original = seats();
  original.modules[1].panelMaterial = "plytanium-703";
  original.modules[1].height = 21;
  const next = revise(
    original,
    "Make section 2 two inches taller, and keep everything else the same.",
  );
  assert.deepEqual(next.modules, [
    original.modules[0],
    { ...original.modules[1], height: 23 },
    original.modules[2],
  ]);
  const narrow = revise(next, "Reduce section 2 width by 2 inches");
  assert.deepEqual(
    narrow.modules.map(({ width, position }) => [width, position[0]]),
    [
      [24, -23],
      [22, 0],
      [24, 23],
    ],
  );
  const placed = revise(
    narrow,
    "Make section 2 1 inch shallower and move the whole design 3 inches along +Z",
  );
  assert.deepEqual(
    placed.modules.map(({ depth, position }) => [depth, position[2]]),
    [
      [24, 3],
      [23, 3],
      [24, 3],
    ],
  );
  const reordered = { ...original, modules: [...original.modules].reverse() };
  const byName = revise(reordered, "Make Banquette section 1 two inches taller");
  assert.deepEqual(byName.modules.map(({ height }) => height), [18, 21, 20]);
});

test("coordinated changes inherit a specific section or honor a different explicit section", () => {
  const original = seats();
  original.modules[1].panelMaterial = "plytanium-703";
  const requests = [
    "Make section 2 two inches taller and one inch deeper.",
    "Make section 2 two inches taller. Make it one inch deeper.",
    "Increase the height of section 2 by two inches, and its depth by one inch.",
    "Make Banquette section 2 two inches taller and one inch deeper, and keep everything else the same.",
  ];
  for (const prompt of requests) {
    const result = revise(original, prompt);
    assert.deepEqual(result.questions, [], prompt);
    assert.deepEqual(result.modules, [
      original.modules[0],
      { ...original.modules[1], height: 20, depth: 25 },
      original.modules[2],
    ], prompt);
  }
  const customName = structuredClone(original);
  customName.modules[1].name = "Bay B.2";
  assert.deepEqual(revise(customName, "Make Bay B.2 2 inches taller and it 1 inch deeper").modules, [
    customName.modules[0],
    { ...customName.modules[1], height: 20, depth: 25 },
    customName.modules[2],
  ]);
  const twoSeats = revise(original, "Make section 2 two inches taller and make section 3 one inch deeper.");
  assert.deepEqual(twoSeats.modules.map(({ height, depth }) => [height, depth]), [[18, 24], [20, 24], [18, 25]]);
  const feetAndInches = revise(original, "Make section 2 one foot and two inches taller, one inch deeper, and two inches wider.");
  assert.deepEqual(feetAndInches.modules.map(({ height, depth, width }) => [height, depth, width]),
    [[18, 24, 24], [32, 25, 26], [18, 24, 24]]);
  const structure = localIdeaPlan({ prompt: "Build a greenhouse 72 inches wide" });
  const updated = revise(structure, "Increase the roof rise by 6 inches and the door width by 2 inches.");
  assert.deepEqual(updated.structures[0].parameters, {
    ...structure.structures[0].parameters,
    roofRise: 30,
    doorWidth: 32,
  });
});

test("a malformed or out-of-range clause retains the whole design revision", () => {
  const original = seats();
  for (const [prompt, reason] of [
    ["Make it two inches taller and 99 inches narrower", /supported dimensions/],
    ["Make section 2 two inches taller and make section 9 one inch deeper", /existing design/],
    ["Make section 2 two inches taller and one deeper", /inches or feet/],
    ["Make section 2 two inches taller and lengthen it two inches", /dimension and an amount/],
  ] as const) {
    const result = revise(original, prompt);
    assert.deepEqual(result.modules, original.modules, prompt);
    assert.match(result.questions[0], reason, prompt);
  }
});

test("relative structural edits use the requested parameter and keep the rest of the recipe", () => {
  const greenhouse = localIdeaPlan({
    prompt: "Build a greenhouse 72 inches wide",
  });
  const wider = revise(
    greenhouse,
    "Make the greenhouse door wider by 3 inches",
  );
  assert.equal(wider.structures[0].kind, "greenhouse");
  assert.deepEqual(wider.structures[0].parameters, {
    ...greenhouse.structures[0].parameters,
    doorWidth: 33,
  });
  const higher = revise(wider, "Increase the roof rise by 6 inches");
  assert.deepEqual(higher.structures[0].parameters, {
    ...wider.structures[0].parameters,
    roofRise: 30,
  });
  assert.deepEqual(
    revise(higher, "Make the greenhouse window 6 inches wider").structures,
    higher.structures,
  );
  const sauna = localIdeaPlan({ prompt: "Build a sauna 72 inches wide" });
  assert.deepEqual(
    revise(sauna, "Increase the clear width by 1 foot").structures[0]
      .parameters,
    { ...sauna.structures[0].parameters, clearWidth: 84 },
  );
  const closet = localIdeaPlan({ prompt: "Build a closet insert" });
  assert.deepEqual(
    revise(closet, "Increase the tower width by 3 inches").structures[0]
      .parameters,
    { ...closet.structures[0].parameters, towerWidth: 28 },
  );
  const bookcase = localIdeaPlan({ prompt: "Build a panel bookcase" });
  assert.deepEqual(
    revise(bookcase, "Make the panel bookcase 4 inches deeper").structures[0]
      .parameters,
    { ...bookcase.structures[0].parameters, depth: 20 },
  );
});

test("missing units, invalid results and ambiguous targets retain the prior design", () => {
  const original = seats();
  for (const [prompt, question] of [
    ["Make it 6 wider", /inches or feet/],
    ["Make it 0 inches wider", /positive resize/],
    ["Make it 1/0 inch wider", /denominator/],
    ["Make it 99 inches narrower", /supported dimensions/],
    ["Make section 7 two inches taller", /existing design/],
    ["Make the left seat two inches taller", /existing design/],
    ["Make the cabinet section 2 two inches taller", /existing design/],
    ["Make the seat back 2 inches taller", /existing seat back/],
    ["Make the banquette lid 2 inches wider", /supported dimension/],
    [
      "Make it 6 inches wider and 2 taller",
      /inches or feet/,
    ],
  ] as const) {
    const result = revise(original, prompt);
    assert.deepEqual(result.modules, original.modules, prompt);
    assert.match(result.questions[0], question, prompt);
  }
  const mixed = revise(original, "Add a separate cabinet 24 inches wide");
  assert.deepEqual(
    revise(mixed, "Make it 2 inches taller").modules,
    mixed.modules,
  );
  assert.match(
    localIdeaPlan({ prompt: "Make it 6 inches wider" }).questions[0],
    /starting dimensions/,
  );
});

test("the editable banquette practice plan includes the revised center and recorded cut orders", () => {
  const asset = (extension: string) => readFileSync(new URL(`../public/examples/wood-stock/banquette-compound-revision${extension}`, import.meta.url), "utf8");
  const project = projectSchema.parse(JSON.parse(asset(".yardwork.json")));
  const entries = project.ideaBindings[0].entries;
  assert.deepEqual(entries.map(({ spec }) => spec.type === "furniture" && [spec.recipe.width, spec.recipe.depth, spec.recipe.height]),
    [[24, 24, 18], [24, 25, 20], [24, 24, 18]]);
  assert.equal(project.plannedCutSources?.length, 6);
  const guide = guideMarkdown(project);
  assert.equal(guide.trimEnd() + "\n", asset("-guide.md"));
  assert.match(guide, /69.75 in/);
});
