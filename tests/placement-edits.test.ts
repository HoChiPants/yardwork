import test from "node:test";
import assert from "node:assert/strict";
import { blank } from "../src/model";
import { applyIdeaPlan, localIdeaPlan, previewIdeaPlan } from "../src/planning";
import {
  applyIdeaRevision,
  bindingPlan,
  bindingReview,
} from "../src/ideaBindings";

const seating = () =>
  localIdeaPlan({
    prompt:
      "A kitchenette banquette with three sections and an openable lid, no back since the wall will be the back with enclosed storage underneath.",
  });
const refine = (previousPlan: ReturnType<typeof seating>, prompt: string) =>
  localIdeaPlan({ previousPlan, prompt });

test("resize a selected seat and move the whole storage banquette together", () => {
  const original = seating();
  const updated = refine(
    original,
    "Make section 2 seat height 20 inches and move the whole banquette 3 inches toward workspace +Z.",
  );
  assert.equal(updated.pendingPlacement?.length, 0);
  assert.equal(updated.placementChanges?.length, 1);
  assert.equal(original.modules.length, 3);
  assert.deepEqual(
    updated.modules,
    original.modules.map((m, i) => ({
      ...m,
      height: i === 1 ? 20 : m.height,
      position: [m.position[0], m.position[1], m.position[2] + 3],
    })),
  );
  for (const m of updated.modules) {
    assert.ok(m.storage && m.openingLid);
    assert.equal(m.backHeight, 0);
  }
});

test("a mixed height and skirting clearance requires a decision and survives another refinement", () => {
  const original = seating();
  const mixed = refine(
    original,
    "Make the seat height 20 inches and leave 3 inches behind it for the skirting board.",
  );
  assert.equal(
    mixed.pendingPlacement?.[0].request,
    "leave 3 inches behind it for the skirting board",
  );
  assert.ok(mixed.modules.every((m) => m.height === 20));
  assert.deepEqual(
    mixed.modules.map((m) => m.position),
    original.modules.map((m) => m.position),
  );
  const next = refine(mixed, "Make the seat height 21 inches");
  assert.deepEqual(next.pendingPlacement, mixed.pendingPlacement);
  assert.ok(next.modules.every((m) => m.height === 21));
  assert.ok(previewIdeaPlan(blank(), next).project.pieces.length);
  assert.throws(() => applyIdeaPlan(blank(), next), /Resolve or set aside/);
  const saved = applyIdeaPlan(blank(), original);
  const binding = saved.ideaBindings[0];
  const revision = refine(
    bindingPlan(saved, binding.id),
    "Make seat height 20 inches and keep a 3 inch gap behind the seat",
  );
  assert.throws(
    () =>
      applyIdeaRevision(
        saved,
        binding.id,
        revision,
        bindingReview(saved, binding.id).token,
      ),
    /Resolve or set aside/,
  );
});

for (const [prompt, target] of [
  ["greenhouse 72 inches wide", "greenhouse"],
  ["sauna 72 inches wide", "sauna"],
  ["closet insert 72 inches wide", "closet insert"],
  ["panel bookcase 36 inches wide", "panel bookcase"],
] as const) {
  test(`move ${target} without regenerating actual parts`, () => {
    const plan = localIdeaPlan({ prompt });
    const saved = applyIdeaPlan(blank(), plan),
      id = saved.ideaBindings[0].id;
    const original = bindingPlan(saved, id);
    const moved = refine(original, `Move the ${target} 0.5 feet along -X`);
    assert.equal(moved.pendingPlacement?.length, 0);
    const old = original.structures[0],
      next = moved.structures[0];
    assert.deepEqual(next, {
      ...old,
      parameters: {
        ...old.parameters,
        origin: [
          old.parameters.origin[0] - 6,
          ...old.parameters.origin.slice(1),
        ],
      },
    });
    const result = applyIdeaRevision(
      saved,
      id,
      moved,
      bindingReview(saved, id).token,
    );
    assert.equal(result.pieces.length, saved.pieces.length);
    for (const piece of saved.pieces) {
      const actual = result.pieces.find((p) => p.id === piece.id)!;
      assert.ok(actual);
      assert.equal(actual.position[0], piece.position[0] - 6);
      assert.deepEqual(actual.cutPlanes, piece.cutPlanes);
      assert.deepEqual(actual.cutStock, piece.cutStock);
    }
  });
}

test("one explicit pivot rotates the complete assembly and ambiguous movement retains existing geometry", () => {
  const original = seating();
  const rotated = refine(
    original,
    "Rotate the whole banquette 90 degrees around the workspace origin",
  );
  assert.equal(rotated.pendingPlacement?.length, 0);
  for (const [i, m] of rotated.modules.entries()) {
    const [x, y, z] = original.modules[i].position;
    assert.ok(Math.abs(m.position[0] - z) < 1e-8);
    assert.equal(m.position[1], y);
    assert.ok(Math.abs(m.position[2] + x) < 1e-8);
    assert.equal(m.yaw, 90);
  }
  for (const prompt of [
    "Move it forward a little",
    "Rotate the whole banquette 90 degrees",
    "Move the whole banquette and shelves 3 inches +Z",
    "Lower section 2 by 2 inches",
    "Move the banquette 2 inches +X",
  ]) {
    const unresolved = refine(original, prompt);
    assert.deepEqual(unresolved.modules, original.modules);
    assert.equal(unresolved.pendingPlacement?.length, 1, prompt);
  }
  const lifted = refine(original, "Move section 2 up 2 inches");
  assert.deepEqual(
    lifted.modules.map((m) => m.position[1]),
    [0, 2, 0],
  );
});
