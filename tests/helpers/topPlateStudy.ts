import { blank, part } from "../../src/model";

export function topPlateStudy() {
  const project = blank("Drywall-to-top-plate practice");
  const stage = project.steps[0].id;
  const plate = part("Wall top plate", "stud", [1.5, 96, 3.5], [0, 95.25, 0], stage, "Wall", [0, 0, -Math.PI / 2]);
  const panels = [-24, 24].map((x, index) =>
    part(`Drywall panel ${index + 1}`, "hd-usg-drywall-half-8", [48, 0.5, 96],
      [x, 48, 2.0625], stage, "Wall", [Math.PI / 2, 0, 0]));
  project.pieces = [plate, ...panels];
  const input = { plateId: plate.id, side: "b", gap: 0.125, depth: 0.125,
    bead: "1/4", session: "Wall air sealing", dryInteriorBeforeDrywall: true } as const;
  return { project, plate, panels, stage, input };
}
