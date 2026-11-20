import { blank, type Project } from "../../src/model";
import { applyIdeaPlan, localIdeaPlan } from "../../src/planning";
import {
  makeHingeStockSource,
  makeHingeStockCut,
  reviewHingeStock,
} from "../../src/hingeStock";
import {
  addHingeLocation,
  allocateHingeStock,
  makeLidHingePlan,
  saveHingeStockSource,
  saveLidHingePlan,
} from "../../src/hinges";

export const syntheticBasis =
  "SYNTHETIC test datums, not measured product geometry or an installation specification";
export const datumAt = "2026-11-17T00:00:00.000Z";
/** Deliberately explicit inputs. No nominal product value is a measured default. */
export function measuredHingeFixture(): Project {
  let p = applyIdeaPlan(
    blank("Synthetic measured hinge study"),
    localIdeaPlan({
      prompt:
        "A storage banquette 24 inches wide, 24 inches deep, 18 inches seat height, one section with opening lid and no back",
    }),
  );
  const section = p.sections[0];
  const moving = p.pieces.find((piece) => piece.designRole === "seat-lid")!;
  const fixed = p.pieces.find((piece) => piece.designRole === "storage-rear")!;
  const cut = {
    ...makeHingeStockCut(),
    position: 22.75,
    kerf: 0.0625,
    basis: syntheticBasis,
    measuredAt: datumAt,
  };
  const source = {
    ...makeHingeStockSource(),
    usableLength: 48,
    basis: syntheticBasis,
    measuredAt: datumAt,
    cuts: [cut],
  };
  p = saveHingeStockSource(p, source);
  let plan = makeLidHingePlan(p, section.id, moving.id, fixed.id);
  plan = allocateHingeStock(
    p,
    plan,
    source.id,
    reviewHingeStock(source).segments[0].id,
  );
  // Offset from the recipe pivot: tests must detect a silent recipe fallback.
  plan.axis = {
    movingA: [-11.375, -0.275, -12.1],
    movingB: [11.375, -0.275, -12.1],
    fixedA: [-11.375, 8.35, -0.475],
    fixedB: [11.375, 8.35, -0.475],
    basis: syntheticBasis,
    measuredAt: datumAt,
  };
  plan.hardware = {
    description: "SYNTHETIC observed package screw, no product substitution",
    drive: "Synthetic cross recess",
    suppliedCount: 2,
    included: true,
    leafThickness: null,
    basis: syntheticBasis,
    measuredAt: datumAt,
  };
  for (const leaf of ["moving", "fixed"] as const) {
    plan = addHingeLocation(plan, leaf);
    const hole = plan.locations.at(-1)!;
    hole.entranceLocal =
      leaf === "moving" ? [0, -0.375, -11.5] : [0, 7.75, -0.375];
    hole.driveLocal = leaf === "moving" ? [0, 1, 0] : [0, 0, 1];
    hole.measurements = {
      surfaceToTipDepth: 0.4,
      pilotDiameter: 0.0625,
      pilotDepth: 0.45,
      basis: syntheticBasis,
      measuredAt: datumAt,
    };
  }
  return saveLidHingePlan(p, plan);
}
