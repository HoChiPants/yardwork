import test from "node:test";
import assert from "node:assert/strict";
import { blank, part, projectSchema, uid } from "../src/model";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";
test("guide generated from final layout covers active parts exactly once and retains references", () => {
  const p = blank("Bench");
  const s = p.steps[0].id;
  p.workZone = { width: 96, depth: 48, height: 96 };
  p.pieces = [
    part("Seat", "plywood", [48, 0.75, 18], [0, 18, 0], s, "Seat"),
    part("Leg", "stud", [1.5, 17.625, 3.5], [0, 8.8125, 0], s, "Base"),
    {
      ...part("Spare", "stud", [1.5, 12, 3.5], [30, 6, 0], s, "Loose"),
      offcut: true,
    },
  ];
  p.joints = [
    {
      id: uid(),
      a: p.pieces[0].id,
      b: p.pieces[1].id,
      kind: "screw",
      length: 3,
      quantity: 2,
      stepId: s,
    },
  ];
  p.history = [
    {
      id: uid(),
      at: new Date().toISOString(),
      stepId: s,
      message: "Cut the leg",
    },
  ];
  const next = generateBuildGuide(p);
  projectSchema.parse(next);
  assert.deepEqual(
    next.pieces.map((x) => x.id),
    p.pieces.map((x) => x.id),
  );
  assert.equal(next.steps[1].title, "Assemble Base");
  assert.equal(next.steps[2].title, "Assemble Seat");
  assert.match(next.steps[0].notes, /96 × 48 × 96/);
  assert.equal(next.joints[0].stepId, next.pieces[0].stepId);
  for (const x of [...next.pieces, ...next.joints, ...next.history])
    assert.ok(next.steps.some((s) => s.id === x.stepId));
  assert.ok(guideIsCurrent(next));
  next.steps[0].complete = true;
  assert.ok(guideIsCurrent(next));
  next.pieces[0].position[0] += 1;
  assert.equal(guideIsCurrent(next), false);
  assert.equal(p.steps.length, 1);
});

test("regenerated guide retains legacy custom assembly instructions", () => {
  const p = blank();
  p.steps[0].notes = "Leave access for the outlet behind this panel.";
  p.pieces = [
    part(
      "Side",
      "plywood",
      [24, 36, 0.75],
      [0, 18, 0],
      p.steps[0].id,
      "Cabinet",
    ),
  ];
  const next = generateBuildGuide(p);
  assert.ok(next.steps.some((s) => s.notes.includes(p.steps[0].notes)));
});

test("generated wall guide stays current through schema normalization, recording and persistence", async () => {
  const { applyCommand } = await import("../src/model");
  const { reconcileSections } = await import("../src/sections");
  const { recordChanges } = await import("../src/engine");
  const p = applyCommand(blank(), {
    type: "wall",
    width: 96,
    height: 72,
    depth: 48,
    spacing: 16,
  });
  const generated = generateBuildGuide(p);
  assert.ok(guideIsCurrent(generated));
  const changed = recordChanges(p, reconcileSections(generated));
  assert.ok(guideIsCurrent(changed));
  assert.ok(
    guideIsCurrent(projectSchema.parse(JSON.parse(JSON.stringify(changed)))),
  );
});

test("regenerating twice retains both attached and standalone custom instructions", () => {
  const p = blank();
  p.steps[0].notes = "Leave an outlet access hole behind the panel.";
  p.pieces = [
    part(
      "Side",
      "plywood",
      [24, 36, 0.75],
      [0, 18, 0],
      p.steps[0].id,
      "Cabinet",
    ),
  ];
  const standalone = {
    ...p.steps[0],
    id: uid(),
    title: "Site access",
    notes: "Do not cover the floor vent.",
  };
  p.steps.push(standalone);
  const first = generateBuildGuide(p),
    second = generateBuildGuide(first),
    third = generateBuildGuide(second);
  for (const result of [first, second, third]) {
    assert.ok(result.steps.some((s) => s.notes.includes(p.steps[0].notes)));
    assert.ok(result.steps.some((s) => s.notes.includes(standalone.notes)));
    assert.ok(guideIsCurrent(result));
  }
  assert.equal(second.steps.length, first.steps.length);
  assert.equal(third.steps.length, second.steps.length);
});
