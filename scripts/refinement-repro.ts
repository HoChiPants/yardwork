/** Read-only semantic probes. Normal verification does not run this script.
 * `--assert-desired` exits 1 while the documented refinement defects remain.
 */
import { blank } from "../src/model";
import {
  ideaPlanSchema,
  localIdeaPlan,
  previewIdeaPlan,
  type IdeaPlan,
} from "../src/planning";

const seed = () =>
  localIdeaPlan({
    prompt:
      "A storage banquette, three sections, 72 inches wide, 24 inches deep, 18 inches seat height, no back and opening lids",
  });
function measured(plan: IdeaPlan) {
  const project = blank();
  project.workZone = { width: 96, depth: 24, height: 84 };
  const preview = previewIdeaPlan(project, plan);
  return {
    outsideWidth: Number((preview.max[0] - preview.min[0]).toFixed(6)),
    workZoneFits: preview.workZoneFits,
  };
}
const original = seed(),
  wide = localIdeaPlan({
    prompt: "Make the overall width 96 inches",
    previousPlan: original,
  });
const targeted = localIdeaPlan({
  prompt: "Make Banquette section 2 30 inches wide",
  previousPlan: seed(),
});
const each = localIdeaPlan({
  prompt: "Make each section 30 inches wide",
  previousPlan: seed(),
});
const add = localIdeaPlan({
  prompt:
    "Add a cabinet 36 inches wide, 20 inches deep and 60 inches high next to the seats",
  previousPlan: seed(),
});
const selected = seed();
selected.modules[1].panelMaterial = "plytanium-703";
const repartitioned = localIdeaPlan({
  prompt: "Four sections",
  previousPlan: selected,
});
const mixed = ideaPlanSchema.parse({
  ...seed(),
  structures: [
    ...localIdeaPlan({ prompt: "Greenhouse 6 by 8 feet" }).structures,
    ...localIdeaPlan({ prompt: "Sauna, 6 by 6 feet" }).structures,
  ],
});
const refinedMixed = localIdeaPlan({
  prompt: "Make greenhouse width 84 inches",
  previousPlan: mixed,
});
const noUnit = localIdeaPlan({
  prompt: "Make the depth 18",
  previousPlan: seed(),
});
const probes = [
  {
    id: "overall-width-on-a-run",
    request: "Make the overall width 96 inches",
    expected: {
      sectionWidths: [32, 32, 32],
      centersX: [-32, 0, 32],
      outsideWidth: 96,
      workZoneFits: true,
    },
    actual: {
      sectionWidths: wide.modules.map((m) => m.width),
      centersX: wide.modules.map((m) => m.position[0]),
      ...measured(wide),
    },
    desired:
      wide.modules.every((m) => m.width === 32) &&
      measured(wide).outsideWidth === 96,
  },
  {
    id: "named-section-target",
    request: "Make Banquette section 2 30 inches wide",
    expected: { sectionWidths: [24, 30, 24], unrelatedSectionsPreserved: true },
    actual: {
      sectionWidths: targeted.modules.map((m) => m.width),
      centersX: targeted.modules.map((m) => m.position[0]),
    },
    desired: targeted.modules.map((m) => m.width).join(",") === "24,30,24",
  },
  {
    id: "each-width-needs-reflow",
    request: "Make each section 30 inches wide",
    expected: {
      sectionWidths: [30, 30, 30],
      centersX: [-30, 0, 30],
      outsideWidth: 90,
    },
    actual: {
      sectionWidths: each.modules.map((m) => m.width),
      centersX: each.modules.map((m) => m.position[0]),
      ...measured(each),
    },
    desired:
      each.modules.every((m) => m.width === 30) &&
      measured(each).outsideWidth === 90,
  },
  {
    id: "add-is-not-revise",
    request:
      "Add a cabinet 36 inches wide, 20 inches deep and 60 inches high next to the seats",
    expected: {
      existingBenchCount: 3,
      existingBenchDimensions: [24, 24, 18],
      newCabinetCount: 1,
    },
    actual: {
      moduleKinds: add.modules.map((m) => m.kind),
      dimensions: add.modules.map((m) => [m.width, m.depth, m.height]),
    },
    desired:
      add.modules.filter((m) => m.kind === "bench").length === 3 &&
      add.modules.filter((m) => m.kind === "cabinet").length === 1 &&
      add.modules
        .filter((m) => m.kind === "bench")
        .every((m) => m.width === 24 && m.depth === 24 && m.height === 18),
  },
  {
    id: "repartition-retains-or-asks-about-product-choices",
    request:
      "Four sections (middle section currently uses source-exact .703 in plywood)",
    expected: {
      action:
        "Preserve section-specific selections or ask how to repartition heterogeneous sections; no implicit material substitution",
    },
    actual: {
      previousPanels: selected.modules.map((m) => m.panelMaterial),
      nextPanels: repartitioned.modules.map((m) => m.panelMaterial),
      questions: repartitioned.questions,
    },
    desired:
      repartitioned.modules.some((m) => m.panelMaterial === "plytanium-703") ||
      repartitioned.questions.length > 0,
  },
  {
    id: "mixed-proposal-follow-up-preserves-unrelated-entries",
    request:
      "Make greenhouse width 84 inches (proposal also contains sauna and three bench modules)",
    expected: {
      furnitureModuleCount: 3,
      structureKinds: ["greenhouse", "sauna"],
    },
    actual: {
      furnitureModuleCount: refinedMixed.modules.length,
      structureKinds: refinedMixed.structures.map((s) => s.kind),
    },
    desired:
      refinedMixed.modules.length === 3 && refinedMixed.structures.length === 2,
  },
  {
    id: "bare-unit-needs-clarification",
    request: "Make the depth 18",
    expected: {
      action: "Ask inches or feet, preserve geometry until units are specified",
    },
    actual: {
      sectionDepths: noUnit.modules.map((m) => m.depth),
      questions: noUnit.questions,
    },
    desired:
      noUnit.questions.length > 0 &&
      noUnit.modules.every((m) => m.depth === 24),
  },
].map(({ desired, ...probe }) => ({
  ...probe,
  desiredBehaviorObserved: desired,
  defectReproduced: !desired,
}));
console.log(
  JSON.stringify(
    {
      kind: "read-only refinement semantic probes",
      source: "current local preset implementation; no model-provider claims",
      probes,
    },
    null,
    2,
  ),
);
if (
  process.argv.includes("--assert-desired") &&
  probes.some((p) => !p.desiredBehaviorObserved)
)
  process.exitCode = 1;
