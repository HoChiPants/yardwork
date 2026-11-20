/** Explicit opt-in software demonstration. These entered measurements are synthetic, not product facts. */
import { type Project, type V3, projectSchema } from "./model";
import { createBuildStudy, defaultBuildStudyParameters } from "./buildFixtures";
import {
  makeHingeStockCut,
  reviewHingeStock,
  updateHingeStockSource,
} from "./hingeStock";
import {
  addHingeLocation,
  allocateHingeStock,
  saveHingeStockSource,
  saveLidHingePlan,
  selectHingeMotion,
} from "./hinges";
import { addSupply } from "./supplies";
import { hingeProductId } from "./hingeProducts";
import {
  addFastenerLocation,
  makeFastenerPlan,
  saveFastenerPlan,
} from "./fastenings";
import { generateBuildGuide } from "./guide";

const basis =
  "SYNTHETIC SOFTWARE DEMO ONLY: invented fit-test inputs, not real measurements, manufacturer geometry, supplied contents or installation instructions";

/** Creates a separate example; no current project, server, inventory or native AI is accessed. */
export function createMeasuredHingeExample(): Project {
  let project = createBuildStudy(
    "storage-banquette",
    defaultBuildStudyParameters("storage-banquette"),
    undefined,
    {
      caseworkPanels: {
        materialId: "plytanium-703",
        productRegistryRef: "plytanium-bc-201428",
      },
    },
  ).project;
  const measuredAt = new Date().toISOString();
  project.name = "SYNTHETIC measured-hinge software demonstration";
  project.notes +=
    "\n\nSYNTHETIC SOFTWARE DEMONSTRATION — all populated hinge lengths, kerf, axis points, transferred holes, screw observations and depth values below are invented fit-test data. They are not measurements of an Everbilt product or instructions for a real banquette. Only H001 is populated and selected while closed; H002/H003 remain pending. The source’s nominal product reference does not supply its entered usable length. Leaf/knuckle fit, delivered screws, lid supports/stays, hold-open/pinch protection, fastening and closed-seat capacity require separate real review. The explicit one-hinge purchase and pending carcass screw plan are demonstration selections, without price or store-availability observations.";
  project = addSupply(
    project,
    hingeProductId,
    1,
    "SYNTHETIC example physical hinge",
    "SYNTHETIC manual purchase selection only; not real ownership, stock availability, installed hardware or evidence that all three lids are covered.",
  );
  const purchase = project.supplies.at(-1)!;
  const originalSource = project.hingeStockSources[0];
  const cut = {
    ...makeHingeStockCut(),
    position: 22.75,
    kerf: 0.0625,
    basis,
    measuredAt,
  };
  const source = updateHingeStockSource(
    originalSource,
    {
      usableLength: 48,
      basis,
      measuredAt,
      cuts: [cut],
      purchaseSelectionId: purchase.id,
      notes:
        "SYNTHETIC 48 in usable source with one entered 22.75 in cut and .0625 in metal kerf; retained segments are 22.75 and 25.1875 in. No physical stock was measured or cut. The second interval is an unallocated demonstration remnant, not another purchase.",
    },
    basis,
    measuredAt,
  );
  project = saveHingeStockSource(project, source);
  const segment = reviewHingeStock(source).segments.find(
    (segment) => segment.start === 0,
  )!;
  let plan = project.lidHingePlans[0];
  project = saveLidHingePlan(
    project,
    allocateHingeStock(project, plan, source.id, segment.id),
  );
  plan = project.lidHingePlans.find((item) => item.id === plan.id)!;
  const lid = project.pieces.find((piece) => piece.id === plan.moving.pieceId)!;
  const rear = project.pieces.find((piece) => piece.id === plan.fixed.pieceId)!;
  // A chosen demo axis offset from the recipe pivot; actual delivered hinge envelopes remain unknown.
  const movingA: V3 = [-11.375, -0.275, -12.1];
  const movingB: V3 = [11.375, -0.275, -12.1];
  const inRear = (point: V3): V3 =>
    point.map(
      (value, axis) => value + lid.position[axis] - rear.position[axis],
    ) as V3;
  plan = {
    ...plan,
    name: "SYNTHETIC H001 paired-axis demonstration",
    axis: {
      movingA,
      movingB,
      fixedA: inRear(movingA),
      fixedB: inRear(movingB),
      basis,
      measuredAt,
    },
    hardware: {
      description:
        "SYNTHETIC screw-observation placeholder, not actual supplied Everbilt contents or a qualified fastener",
      drive: "SYNTHETIC demo cross recess",
      suppliedCount: 2,
      included: true,
      leafThickness: null,
      basis,
      measuredAt,
    },
    notes:
      "SYNTHETIC paired axis and two explicitly entered toy leaf holes. Their count/pattern and screw observations are not manufacturer facts. Leaf/knuckle dimensions, hardware suitability, access, stays, hold-open, pinch and seat support remain unresolved.",
  };
  for (const leaf of ["moving", "fixed"] as const) {
    plan = addHingeLocation(plan, leaf);
    const location = plan.locations.at(-1)!;
    location.name = `SYNTHETIC ${leaf} leaf point`;
    location.entranceLocal =
      leaf === "moving"
        ? [0, -lid.size[1] / 2, -11.5]
        : [0, rear.size[1] / 2 - 0.875, -rear.size[2] / 2];
    location.driveLocal = leaf === "moving" ? [0, 1, 0] : [0, 0, 1];
    location.measurements = {
      surfaceToTipDepth: 0.4,
      pilotDiameter: 0.0625,
      pilotDepth: 0.45,
      basis,
      measuredAt,
    };
  }
  project = saveLidHingePlan(project, plan);
  project = selectHingeMotion(project, plan.id, true);

  // Explicit actual rear-panel/left-rear-leg IDs. The pending screw depth is never copied from nominal length.
  const section = project.sections.find(
    (section) => section.id === plan.sectionId,
  )!;
  const receiver = project.pieces
    .filter(
      (piece) =>
        section.pieceIds.includes(piece.id) && piece.designRole === "leg",
    )
    .find(
      (piece) =>
        piece.position[0] < rear.position[0] &&
        piece.position[2] < rear.position[2] + rear.size[2] / 2 + piece.size[2],
    );
  if (!receiver)
    throw Error(
      "The synthetic example needs its actual left rear framing leg.",
    );
  let screws = addFastenerLocation(
    makeFastenerPlan(project, rear.id, receiver.id, {
      name: "SYNTHETIC pending rear-panel carcass screw",
      productId: "grk-r4-103101",
      notes:
        "SYNTHETIC selected rear-panel-to-leg centerline only. Actual seating/pilot measurements, screw suitability, count/pattern, joint design and load capacity remain unknown; no screws were purchased by creating this plan.",
    }),
  );
  screws.locations[0].name = "SYNTHETIC rear-panel wood entrance";
  screws.locations[0].entranceLocal = [
    receiver.position[0] - rear.position[0],
    receiver.position[1] - rear.position[1],
    -rear.size[2] / 2,
  ];
  screws.locations[0].driveLocal = [0, 0, 1];
  project = saveFastenerPlan(project, screws);
  project = generateBuildGuide(project);
  const phase = project.steps.find(
    (step) =>
      step.generated?.kind === "lid-hinge-preparation" &&
      step.generated.planId === plan.id,
  );
  if (!phase)
    throw Error("The synthetic example's hinge preparation phase is missing.");
  phase.title = "SYNTHETIC demo checkoff — H001 fit-test inputs";
  phase.notes +=
    "\nSYNTHETIC custom note: this checked software-example phase records no real construction or installation approval.";
  phase.complete = true;
  // Canonicalize the retained custom-instruction wrapper before returning a stable current guide.
  return projectSchema.parse(generateBuildGuide(project));
}
