import { openingDrainageNote, openingFlashingInstructions, reviewOpeningFlashings } from "./openingFlashing";
import { isDrywall } from "./drywallReference";
import { prepareCollisionSolid, solidSegmentRanges } from "./solidCollision";
import { generatedWindowMembers } from "./windowWall";
import { rotate } from "./spatial";
import type { Project, V3 } from "./model";

export const windowFlashingPhaseKinds = [
  "window-sill-pan", "window-unit-flashing", "window-interior-air-seal",
] as const;

const dot = (a: V3, b: V3) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const distance = (a: V3, b: V3) => Math.hypot(...a.map((value, i) => value - b[i]));

export function windowFlashingSchedule(project: Project) {
  if (!project.openingFlashings?.some(({ measurements }) => measurements.unit === "window")) return [];
  const active = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const windows = project.sections.flatMap((wall) => {
    const members = generatedWindowMembers(project, wall);
    return members ? [{ wall, ids: new Set(Object.values(members)), sillId: members.sill }] : [];
  });
  return reviewOpeningFlashings(project).rows.filter(({ plan }) => plan.measurements.unit === "window").map((row) => {
    const { plan, result, issues } = row;
    const memberIds = Object.values(plan.members);
    const wall = windows.find(({ sillId, ids }) => sillId === plan.members.sill && memberIds.every((id) => ids.has(id)))?.wall;
    const covers = result && plan.measurements.airSeal && wall
      ? project.sections.flatMap(({ id, name, pieceIds, wallDrywall }) => {
        if (wallDrywall?.wallId !== wall.id) return [];
        const direction = result.interiorDirection;
        const interiorSide = dot(rotate([0, 0, 1], wall.rotation), direction) > 0 ? "front" : "back";
        if (wallDrywall.side !== interiorSide) return [];
        const line = result.preview.interiorSeal;
        const coveringIds = pieceIds.filter((pieceId) => {
          const piece = active.get(pieceId);
          if (!piece || !isDrywall(piece.material) || dot(piece.position, direction) <= dot(line[0], direction)) return false;
          const solid = prepareCollisionSolid(piece);
          if (!solid) return false;
          const plane = dot(piece.position, direction);
          const projected = line.map((point) => {
            const shift = plane - dot(point, direction);
            return point.map((value, i) => value + shift * direction[i]) as V3;
          });
          return projected.slice(1).some((finish, index) => {
            const start = projected[index];
            return solidSegmentRanges(solid, start, finish).some(([a, b]) => (b - a) * distance(start, finish) > 0.01);
          });
        });
        return coveringIds.length ? [{ id, name, pieceIds: coveringIds }] : [];
      }) : [];
    const instructions = result && !issues.length ? openingFlashingInstructions(plan, result) : undefined;
    const review = issues.length ? `Recheck the saved opening. ${issues.join(" ").slice(0, 1400)}` : "";
    const label = wall?.name ?? row.title;
    const names = covers.slice(0, 6).map(({ name }) => name);
    if (covers.length > names.length) names.push(`${covers.length - names.length} more linings`);
    const hold = names.length ? ` Keep access at the marked perimeter before installing ${names.join(", ")}.` : "";
    return {
      ...row, memberIds, wall, covers,
      phases: [
        {
          kind: windowFlashingPhaseKinds[0], title: `Flash window sill · ${label}`,
          notes: review || `Prepare the sill pan before setting the window. ${instructions?.pan.join(" ") ?? ""} Dry-fit the corners and check the lap to the exterior drainage plane.`,
        },
        {
          kind: windowFlashingPhaseKinds[1], title: `Set and flash window · ${label}`,
          notes: review || [
            "Apply the specified sealant at the head and jambs. Set and fasten the window according to its installation instructions.",
            openingDrainageNote(plan.measurements),
            ...(instructions?.exterior.length ? instructions.exterior
              : ["Confirm the window-specific jamb and head flashing dimensions. Lap the jambs over the pan and the head over the jambs."]),
          ].join(" "),
        },
        {
          kind: windowFlashingPhaseKinds[2], title: `Air-seal window perimeter · ${label}`,
          notes: (review || [
            "Seal the four sides at the installed window’s interior edge and visually inspect the seal before fitting trim. Leave the exterior sill outlets open.",
            ...(instructions?.interior.length ? instructions.interior
              : ["Measure the four gaps before choosing the seal and its backing."]),
          ].join(" ")) + hold,
        },
      ],
    };
  });
}
