import { previewBottomPlateSeal } from "../../src/bottomPlateSeal";
import { part } from "../../src/model";
import { topPlateStudy } from "./topPlateStudy";

export function drywallBottomPlateStudy() {
  const { project, stage, panels, plate: top, input: topInput } = topPlateStudy();
  project.name = "Wall-to-floor air-seal practice";
  const bottom = part("Wall bottom plate", "stud", [1.5, 96, 3.5], [0, 0.75, 0], stage, "Wall", [0, 0, -Math.PI / 2]);
  const floor = part("Wood subfloor", "plywood", [48, 0.75, 96], [0, -0.375, 0], stage, "Floor", [0, Math.PI / 2, 0]);
  panels.forEach((panel) => { panel.position[1] += 0.5; });
  project.pieces.unshift(bottom, floor);
  const input = { ...topInput, plateId: bottom.id };
  const underneath = previewBottomPlateSeal(project, {
    plateId: bottom.id, side: input.side, gap: input.gap, depth: input.depth,
    bead: input.bead, session: input.session, dryExposedWood: true,
  });
  return { project, underneath, input, topInput, bottom, top, stage, panels };
}
