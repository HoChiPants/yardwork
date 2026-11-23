import { applyCommand, blank } from "../../src/model";
import { saveOpeningFlashing } from "../../src/openingFlashing";
import { transformSection } from "../../src/sections";
import { previewWallDrywall } from "../../src/wallDrywall";
import { generatedWindowMembers } from "../../src/windowWall";

export function windowSealOrderStudy(placeCover = true, yaw = 0) {
  const framed = applyCommand(blank("Window flashing and drywall"), {
    type: "wall", width: 96, height: 96, depth: 48, spacing: 16, wallStock: "two-six",
    windowOpening: { width: 36, height: 48, sill: 32, upperBacking: true, stock: "two-six" },
  });
  const placed = yaw ? transformSection(framed, framed.sections[0].id, [20, 0, 30], [0, yaw, 0]) : framed;
  const wall = placed.sections[0];
  const members = generatedWindowMembers(placed, wall)!;
  const flashed = saveOpeningFlashing(placed, members, {
    unit: "window", exterior: "positive", sheathing: 0.5, frameDepth: 4.5,
    faceLap: 2.5, jambReturn: 6, tapeWidth: 9,
    pan: { kind: "back-dam", rise: 0.5 }, drainage: { kind: "gaps", centers: [3, 13, 23, 33] },
    jambHead: {
      tapeWidth: 4, left: { inset: 0.25, flange: 1.25 }, right: { inset: 0.25, flange: 1.25 },
      head: { inset: 0.25, flange: 1.25 }, pastApron: 1, pastJambs: 1,
    },
    airSeal: { method: "foam", left: 0.5, right: 0.5, head: 0.5, sill: 0.5, availableDepth: 1, sealDepth: 0.5 },
  });
  const options = { wallId: wall.id, stockId: "hd-usg-drywall-half-8", floorGap: 0.5 } as const;
  const interior = previewWallDrywall(flashed, { ...options, side: "back" });
  const exterior = previewWallDrywall(interior.project, { ...options, side: "front" });
  const target = exterior.project.pieces.find(({ id, rectangularOpenings }) =>
    interior.section.pieceIds.includes(id) && rectangularOpenings?.length)!;
  const project = placeCover ? {
    ...exterior.project,
    pieces: exterior.project.pieces.map((piece) => piece.id === target.id ? {
      ...piece,
      rectangularOpenings: piece.rectangularOpenings?.map((opening) => ({
        ...opening, spans: [opening.spans[0] - 0.75, opening.spans[1] - 0.75] as [number, number],
      })),
    } : piece),
  } : exterior.project;
  return { project, members, interior: interior.section, exterior: exterior.section, target };
}
