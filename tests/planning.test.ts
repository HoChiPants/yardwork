import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema } from "../src/model";
import { bounds, distance } from "../src/engine";
import {
  applyIdeaPlan,
  ideaPlanSchema,
  localIdeaPlan,
  previewIdeaPlan,
} from "../src/planning";

test("a general banquette idea produces disclosed provisional dimensions and editable geometry without wall fallback", () => {
  const plan = localIdeaPlan({
    prompt: "A kitchenette banquette seating area with storage",
  });
  assert.equal(plan.modules[0].kind, "bench");
  assert.ok(plan.assumptions.some((a) => /Provisional width/.test(a)));
  assert.ok(plan.suggestions.some((a) => /Storage lids/.test(a)));
  const p = applyIdeaPlan(blank(), plan);
  assert.equal(p.sections.length, 1);
  assert.ok(p.pieces.length > 8);
  assert.ok(p.pieces.some((a) => a.name.endsWith("seat")));
  assert.ok(p.pieces.some((a) => a.name.endsWith("back panel")));
  assert.equal(
    p.joints.length,
    0,
    "Unspecified screw connections must not be invented.",
  );
  const rails = p.pieces.filter((a) => a.name.endsWith("top rail")),
    legs = p.pieces.filter((a) => a.name.endsWith("leg"));
  for (const leg of legs) {
    assert.ok(Math.abs(bounds(leg).min[1] - 0.75) < 0.001);
    assert.ok(rails.some((rail) => distance(leg, rail) < 0.001));
  }
  projectSchema.parse(p);
});

test("L-shaped banquette dimensions use one corner and fit the work zone", () => {
  const workZone = { width: 72, depth: 48, height: 84 };
  const plan = localIdeaPlan({
    prompt: "L-shaped kitchenette banquette, 6 by 4 ft",
    workZone,
  });
  assert.equal(plan.modules.length, 2);
  assert.equal(plan.modules[0].width, 72);
  assert.equal(plan.modules[1].width, 24);
  const p = blank();
  (p as typeof p & { workZone: typeof workZone }).workZone = workZone;
  const preview = previewIdeaPlan(p, plan);
  assert.equal(preview.workZoneFits, true);
  assert.ok(Math.abs(preview.max[0] - preview.min[0] - 72) < 0.001);
  assert.ok(Math.abs(preview.max[2] - preview.min[2] - 48) < 0.001);
  const seats = preview.project.pieces
    .filter((a) => a.name.endsWith("seat"))
    .map(bounds);
  const overlap = [0, 2].map(
    (i) =>
      Math.min(seats[0].max[i], seats[1].max[i]) -
      Math.max(seats[0].min[i], seats[1].min[i]),
  );
  assert.ok(
    overlap.some((v) => v <= 0.001),
    "The two seats must not double the corner.",
  );
});

test("explicit units and work-zone constraints are reviewed before adding a plan", () => {
  const plan = localIdeaPlan({
    prompt: "Workbench seven feet wide, 24 inches deep, 36 inches high",
  });
  assert.deepEqual(
    [plan.modules[0].width, plan.modules[0].depth, plan.modules[0].height],
    [84, 24, 36],
  );
  const p = blank();
  (
    p as typeof p & {
      workZone: { width: number; depth: number; height: number };
    }
  ).workZone = { width: 72, depth: 48, height: 84 };
  assert.equal(previewIdeaPlan(p, plan).workZoneFits, false);
  const unconstrained = previewIdeaPlan(blank(), plan);
  assert.equal(unconstrained.workZoneFits, true);
});

test("applying an idea preserves unrelated parts, notes, snapshots and linework", () => {
  const p = blank("Existing work");
  p.notes = "Keep my notes";
  p.planLines = [{ a: [0, 0, 0], b: [36, 0, 0] }];
  p.store = "4409";
  p.pieces.push(
    part(
      "Unrelated board",
      "stud",
      [1.5, 36, 3.5],
      [200, 18, 0],
      p.steps[0].id,
      "Existing",
    ),
  );
  const original = structuredClone(p),
    next = applyIdeaPlan(
      p,
      localIdeaPlan({
        prompt: "Bench 5 ft wide, 20 inches deep, 18 inches high",
      }),
    );
  assert.deepEqual(p, original, "Input project must not be mutated.");
  assert.deepEqual(next.pieces[0], p.pieces[0]);
  assert.equal(next.name, p.name);
  assert.equal(next.store, p.store);
  assert.ok(next.notes.startsWith(p.notes + "\n\n"));
  assert.ok(next.notes.includes("Planning review"));
  assert.ok(
    next.notes.includes("Provisional") || next.notes.includes("Joinery"),
  );
  assert.deepEqual(next.planLines, p.planLines);
  assert.deepEqual(next.inventory, p.inventory);
});

test("unsupported ideas return questions; invalid or oversized module payloads cannot slip through", () => {
  const plan = localIdeaPlan({
    prompt: "Put a pool and all its plumbing in my backyard",
  });
  assert.deepEqual(plan.modules, []);
  assert.ok(plan.questions.length);
  assert.throws(() => applyIdeaPlan(blank(), plan), /planning questions/);
  const valid = localIdeaPlan({ prompt: "A storage cabinet" });
  assert.equal(valid.modules[0].kind, "cabinet");
  for (const mutation of [
    { width: NaN },
    { width: 1000 },
    { frameMaterial: "invented-stock" },
    { frameMaterial: "screw" },
    { panelMaterial: "stud" },
    { yaw: Infinity },
  ])
    assert.throws(() =>
      ideaPlanSchema.parse({
        ...valid,
        modules: [{ ...valid.modules[0], ...mutation }],
      }),
    );
  assert.throws(() =>
    ideaPlanSchema.parse({
      ...valid,
      modules: Array(13).fill(valid.modules[0]),
    }),
  );
  const oversize = localIdeaPlan({
    prompt: "Workbench 12 feet wide, 2 feet deep, 36 inches high",
  });
  assert.equal(previewIdeaPlan(blank(), oversize).incompleteEstimate, true);
});

test("shelf presets expose missing fastener and bracing decisions rather than claiming structural validity", () => {
  const plan = localIdeaPlan({
    prompt: "Shelves 4 ft wide, 16 inches deep, 5 ft tall",
  });
  assert.equal(plan.modules[0].kind, "shelf");
  assert.deepEqual(
    [plan.modules[0].width, plan.modules[0].depth, plan.modules[0].height],
    [48, 16, 60],
  );
  const p = applyIdeaPlan(blank(), plan);
  assert.ok(p.pieces.some((a) => a.name.endsWith("shelf 1")));
  assert.ok(plan.suggestions.some((a) => /bracing/.test(a)));
});

test("seat-height labels and mixed feet/inches keep user dimensions instead of silently defaulting", () => {
  const p = localIdeaPlan({
    prompt: "A bench 5 ft 6 inches wide, 24 inches deep, 20 inches seat height",
  });
  assert.deepEqual(
    [p.modules[0].width, p.modules[0].depth, p.modules[0].height],
    [66, 24, 20],
  );
  const q = localIdeaPlan({
    prompt: "A bench width 48 inches, depth 20 inches, seat height 19 inches",
  });
  assert.deepEqual(
    [q.modules[0].width, q.modules[0].depth, q.modules[0].height],
    [48, 20, 19],
  );
});

test("planning assumptions survive guide regeneration through project notes, with no silent note truncation", () => {
  const p = blank();
  p.notes = "Existing measurement notes";
  const plan = localIdeaPlan({ prompt: "A banquette" }),
    next = applyIdeaPlan(p, plan);
  for (const assumption of plan.assumptions)
    assert.ok(next.notes.includes(assumption));
  assert.ok(next.notes.startsWith(p.notes));
  p.notes = "x".repeat(9990);
  assert.throws(() => applyIdeaPlan(p, plan), /assumptions do not fit/);
  assert.equal(p.notes.length, 9990);
});

test("the requested three-section, backless banquette has enclosed storage and independently opening lids", () => {
  const prompt =
    "a kitchenette banquette with three sections and an openable lid, no back since the wall will be the back with storage in the bottom so its closed off but the seats open to create a space underneath";
  const plan = localIdeaPlan({ prompt });
  assert.equal(plan.modules.length, 3);
  for (const m of plan.modules) {
    assert.equal(m.kind, "bench");
    assert.equal(m.backHeight, 0);
    assert.equal(m.storage, true);
    assert.equal(m.openingLid, true);
    assert.equal(m.lidOpen, false);
  }
  const project = applyIdeaPlan(blank(), plan);
  assert.equal(project.sections.length, 3);
  assert.equal(
    project.pieces.filter((p) => p.name.endsWith("seat lid")).length,
    3,
  );
  for (const section of project.sections) {
    const pieces = project.pieces.filter((p) =>
      section.pieceIds.includes(p.id),
    );
    for (const label of [
      "storage bottom",
      "storage front",
      "storage rear",
      "storage left",
      "storage right",
    ])
      assert.ok(pieces.some((p) => p.name.endsWith(label)));
    assert.ok(!pieces.some((p) => p.name.endsWith("back panel")));
    assert.equal(section.recipe?.openingLid, true);
  }
  const seats = project.pieces
    .filter((p) => p.name.endsWith("seat lid"))
    .map(bounds);
  assert.ok(
    Math.abs(
      Math.max(...seats.map((b) => b.max[0])) -
        Math.min(...seats.map((b) => b.min[0])) -
        72,
    ) < 0.001,
  );
});

test("follow-up edits preserve prior layout and dimensions while changing seat height, backs and storage", () => {
  const first = localIdeaPlan({
    prompt:
      "L-shaped banquette, 7 by 5 ft, 24 inches deep, 19 inches seat height",
  });
  const second = localIdeaPlan({
    prompt:
      "make the seats 20 inches high, no back, add storage and opening lids",
    previousPlan: first,
  });
  assert.equal(second.modules.length, 2);
  second.modules.forEach((m, i) => {
    assert.equal(m.height, 20);
    assert.equal(m.width, first.modules[i].width);
    assert.equal(m.depth, first.modules[i].depth);
    assert.deepEqual(m.position, first.modules[i].position);
    assert.equal(m.yaw, first.modules[i].yaw);
    assert.equal(m.backHeight, 0);
    assert.equal(m.storage, true);
    assert.equal(m.openingLid, true);
  });
  const third = localIdeaPlan({
    prompt: "three sections",
    previousPlan: second,
  });
  assert.equal(third.modules.length, 3);
  assert.ok(
    third.modules.every(
      (m) => m.storage && m.openingLid && m.height === 20 && m.backHeight === 0,
    ),
  );
});

test("new additive ideas use free space beside occupied section bounds and expose an out-of-zone result if no side fits", () => {
  const request = {
    prompt: "Bench 2 ft wide, 16 inches deep, 18 inches high",
    existingSections: [
      {
        name: "Existing",
        min: [-12, 0, -8] as [number, number, number],
        max: [12, 18, 8] as [number, number, number],
      },
    ],
  };
  const plan = localIdeaPlan(request);
  assert.ok(plan.modules[0].position[0] > 24);
  const zone = { width: 24, depth: 16, height: 48 };
  const small = localIdeaPlan({ ...request, workZone: zone });
  const p = blank();
  p.workZone = zone;
  assert.equal(previewIdeaPlan(p, small).workZoneFits, false);
});
