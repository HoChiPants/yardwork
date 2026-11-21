import test from "node:test";
import assert from "node:assert/strict";
import { blank, projectSchema } from "../src/model";
import {
  localIdeaPlan,
  applyIdeaPlan,
  previewIdeaPlan,
  ideaPlanSchema,
} from "../src/planning";
import { bounds } from "../src/engine";
import { generateBuildGuide, guideIsCurrent } from "../src/guide";

test("whole-family ideas produce real matching geometry without an unrelated furniture fallback", () => {
  for (const kind of ["greenhouse", "sauna", "closet insert"]) {
    const plan = localIdeaPlan({
      prompt: `${kind} six feet wide, 6 ft 2 in deep, seven feet high`,
    });
    assert.equal(plan.structures.length, 1);
    assert.equal(plan.modules.length, 0);
    const p = applyIdeaPlan(blank(), plan);
    assert.ok(p.pieces.length >= 10);
    assert.ok(p.notes.includes("Unresolved:"));
    if (kind === "greenhouse")
      assert.ok(p.pieces.some((p) => p.cutPlanes.length === 2));
    if (kind === "sauna") {
      assert.equal(plan.structures[0].kind, "sauna");
      const parts = p.pieces.map(bounds);
      assert.ok(
        parts.every(
          (b) =>
            b.min[0] >= 36 - 1e-6 ||
            b.max[0] <= -36 + 1e-6 ||
            b.min[2] >= 37 - 1e-6 ||
            b.max[2] <= -37 + 1e-6 ||
            b.min[1] >= 84 - 1e-6,
        ),
      );
    }
    const guide = generateBuildGuide(
      projectSchema.parse(JSON.parse(JSON.stringify(p))),
    );
    assert.equal(guideIsCurrent(guide), true);
  }
});

test("structure refinements preserve unrelated measurements and selected product identity", () => {
  const old = localIdeaPlan({
    prompt:
      "Greenhouse 6 ft wide, 8 ft deep, 7 ft eave height, door height 65 inches",
  });
  assert.equal(old.structures[0].kind, "greenhouse");
  if (old.structures[0].kind !== "greenhouse") throw Error();
  assert.equal(old.structures[0].parameters.eaveHeight, 84);
  assert.equal(old.structures[0].parameters.doorHeight, 65);
  old.structures[0].selections.greenhouseGlazing = {
    materialId: "sunlite-8mm",
    productRegistryRef: "sunlite-132506",
  };
  const next = localIdeaPlan({
    prompt: "make it 8 ft wide",
    previousPlan: old,
  });
  if (next.structures[0].kind !== "greenhouse") throw Error();
  assert.equal(next.structures[0].parameters.width, 96);
  assert.equal(next.structures[0].parameters.depth, 96);
  assert.equal(next.structures[0].parameters.doorHeight, 65);
  assert.deepEqual(next.structures[0].selections, old.structures[0].selections);
});

test("whole proposals append beside existing geometry and report work-zone violations", () => {
  const p = blank();
  p.workZone = { width: 72, depth: 96, height: 108 };
  const plan = localIdeaPlan({
    prompt: "greenhouse",
    existingSections: [{ name: "Old", min: [-20, 0, -20], max: [20, 60, 20] }],
  });
  const preview = previewIdeaPlan(p, plan);
  assert.ok(preview.min[0] >= 32 - 1e-6);
  assert.equal(preview.workZoneFits, false);
});

test("wood furniture recipes reject metal frames and glazing seats rather than treating every linear/sheet product as interchangeable", () => {
  const plan = localIdeaPlan({ prompt: "storage bench" });
  plan.modules[0].frameMaterial = "closet-rod-72";
  assert.equal(ideaPlanSchema.safeParse(plan).success, false);
  plan.modules[0].frameMaterial = "stud";
  plan.modules[0].panelMaterial = "sunlite-8mm";
  assert.equal(ideaPlanSchema.safeParse(plan).success, false);
});


test("a fresh short greenhouse fits a provisional opening and explicit door measurements are preserved", () => {
  const prompt = "Gabled greenhouse six feet wide, 7 feet deep and 6 feet eave height";
  const plan = localIdeaPlan({ prompt });
  const [greenhouse] = plan.structures;
  assert.equal(greenhouse.kind, "greenhouse");
  if (greenhouse.kind !== "greenhouse") throw Error("Expected a greenhouse");
  assert.equal(greenhouse.parameters.eaveHeight, 72);
  assert.equal(greenhouse.parameters.doorHeight, 59);
  assert.match(plan.assumptions.join(" "), /Provisional greenhouse door opening: 59 in high/);
  assert.ok(previewIdeaPlan(blank(), plan).addedParts > 5);

  const explicit = localIdeaPlan({ prompt: `${prompt}, door height 64 inches` });
  const [requested] = explicit.structures;
  assert.equal(requested.kind, "greenhouse");
  if (requested.kind !== "greenhouse") throw Error("Expected a greenhouse");
  assert.equal(requested.parameters.doorHeight, 64);
  assert.throws(() => previewIdeaPlan(blank(), explicit), /requested door does not fit/);

  const taller = localIdeaPlan({ prompt: "Increase the eave height to 84 inches", previousPlan: plan });
  const [revised] = taller.structures;
  if (revised.kind !== "greenhouse") throw Error("Expected a greenhouse");
  assert.equal(revised.parameters.eaveHeight, 84);
  assert.equal(revised.parameters.doorHeight, 59);
});
