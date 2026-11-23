import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blank, projectSchema } from "../src/model";
import { guideMarkdown } from "../src/engine";
import { localIdeaPlan, previewIdeaPlan, workspacePlanningResult, type IdeaPlan } from "../src/planning";

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

test("a revision checks every exact and relative dimension against its own target", () => {
  const original = seats();
  original.modules[1].panelMaterial = "plytanium-703";
  const snapshot = structuredClone(original);
  const prompt = "Set the seat height of section 2 to 21 inches and seat depth to 19 inches; set section 3 seat height to 22 inches and make it one inch deeper.";
  const result = workspacePlanningResult({ prompt, previousPlan: original });
  assert.equal(result?.provider, "Workspace dimensions");
  assert.deepEqual(result?.plan.questions, []);
  assert.deepEqual(result?.plan.modules, [
    original.modules[0],
    { ...original.modules[1], height: 21, depth: 19 },
    { ...original.modules[2], height: 22, depth: 25 },
  ]);
  assert.deepEqual(original, snapshot);
  const described = revise(original, "Make section 2 21 inches tall and section 3 22 inches high.");
  assert.deepEqual(described.modules.map(({ height }) => height), [18, 21, 22]);
  const width = revise(original, "Set the whole run width to 6 feet and 3 inches");
  assert.deepEqual(width.modules.map(({ width }) => width), [25, 25, 25]);
  for (const last of ["set section 9 seat height to 21 inches", "set section 3 depth to 20", "set section 3 depth to 300 inches"]) {
    const refused = revise(original, `Set section 2 height to 21 inches and ${last}`);
    assert.deepEqual(refused.modules, original.modules);
    assert.equal(refused.questions.length, 1);
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
    ["Make the fifth seat two inches taller", /existing design/],
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

test("distinct seat references scope compound edits by the facing direction of the run", () => {
  const original = seats();
  original.modules = original.modules.map((module): IdeaPlan["modules"][number] => ({
    ...module,
    position: [0, 0, -module.position[0]],
    yaw: 90,
  })).reverse();
  original.modules[1].panelMaterial = "plytanium-703";
  const request = {
    prompt: "Make the left seat 2 inches taller and the middle seat 1 inch deeper. Leave everything else unchanged.",
    previousPlan: original,
  };
  const result = workspacePlanningResult(request);
  assert.equal(result?.provider, "Workspace dimensions");
  assert.deepEqual(result?.plan.modules, [
    original.modules[0], { ...original.modules[1], depth: 25 }, { ...original.modules[2], height: 20 },
  ]);
  assert.deepEqual(revise(original, "Set the right-hand seat to 20 in tall and leave the others unchanged.").modules, [
    { ...original.modules[0], height: 20 }, original.modules[1], original.modules[2],
  ]);
  assert.deepEqual(revise(original, "Set the seat on the right to 20 in tall.").modules, [
    { ...original.modules[0], height: 20 }, original.modules[1], original.modules[2],
  ]);
  const corner = structuredClone(original);
  corner.modules[2].yaw = 0;
  const unclear = revise(corner, "Set the right-hand seat height to 20 inches.");
  assert.deepEqual(unclear.modules, corner.modules);
  assert.match(unclear.questions[0], /single straight run/);
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

test("a fixed-edge edit preserves an installed run's local alignment and the measured module gaps", () => {
  const original = seats();
  original.modules.forEach((module, index) => {
    module.position = [100, 0, 40 - module.position[0] - (index - 1)];
    module.yaw = 90;
  });
  original.modules[1].panelMaterial = "plytanium-703";
  const baseline = structuredClone(original);
  const result = workspacePlanningResult({
    prompt: "Make the banquette 96 inches wide and two inches deeper, keep the left end fixed and the rear edge against the wall.",
    previousPlan: original,
  });
  assert.equal(result?.provider, "Workspace dimensions");
  const next = result!.plan;
  assert.deepEqual(next.questions, []);
  const [left, middle, right] = next.modules;
  assert.ok(Math.abs(left.position[2] + left.width / 2 - 77) < 1e-7);
  assert.ok(Math.abs(right.position[2] - right.width / 2 - (77 - 96)) < 1e-7);
  assert.ok(Math.abs(left.position[2] - left.width / 2 - middle.position[2] - middle.width / 2 - 1) < 1e-7);
  for (const module of next.modules) {
    assert.equal(module.position[0] - module.depth / 2, 88);
    assert.equal(module.depth, 26);
    assert.equal(module.yaw, 90);
    assert.ok(module.storage && module.openingLid);
  }
  assert.equal(middle.panelMaterial, "plytanium-703");
  assert.deepEqual(original, baseline);
  const narrower = revise(next, "Make the whole banquette 4 inches narrower and keep the right end fixed");
  const [newLeft, , newRight] = narrower.modules;
  assert.ok(Math.abs(newRight.position[2] - newRight.width / 2 - (77 - 96)) < 1e-7);
  assert.ok(Math.abs(newLeft.position[2] + newLeft.width / 2 - 73) < 1e-7);
});

test("conflicting and incompatible fixed edges preserve the saved geometry", () => {
  const original = seats();
  const wider = revise(original, "Make section 2 width 30 inches and hold the right end in place");
  assert.deepEqual(wider.modules.map(({ width, position }) => [width, position[0]]), [[24, -30], [30, -3], [24, 24]]);
  for (const [prompt, reason] of [
    ["Make the banquette two inches wider and keep the left end fixed and the right end fixed", /choose one fixed edge/i],
    ["Make the banquette two inches deeper and keep the left edge fixed", /name the width change/i],
    ["Make the banquette two inches wider and keep both ends fixed", /name one fixed edge/i],
  ] as const) {
    const next = revise(original, prompt);
    assert.deepEqual(next.modules, original.modules);
    assert.match(next.questions[0], reason);
  }
});
