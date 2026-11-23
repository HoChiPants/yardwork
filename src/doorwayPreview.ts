import { runMotionTest } from "./mechanismMotion";
import { bounds } from "./engine";
import type { Command, Project, SectionCommand } from "./model";
import { previewSectionCommand } from "./sections";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";

export function previewDoorway(project: Project, command: SectionCommand, sectionId?: string, reuse = false) {
  const impact = previewSectionCommand(project, command, sectionId, reuse);
  const { candidate } = impact;
  const section = sectionId ? candidate.sections.find(({ id }) => id === sectionId) : candidate.sections.at(-1);
  if (!section?.generator?.doorOpening) throw Error("Choose a generated wall for the doorway.");
  const up = rotate([0, 1, 0], section.rotation);
  if (Math.abs(up[0]) > 1e-6 || Math.abs(up[1] - 1) > 1e-6 || Math.abs(up[2]) > 1e-6)
    throw Error("Set the wall upright before laying out an interior doorway.");
  const original = new Set(project.pieces.map(({ id }) => id));
  const changed = new Set(section.pieceIds.filter((id) => !original.has(id)));
  const active = candidate.pieces.flatMap((piece) => {
    if (piece.offcut) return [];
    const solid = prepareCollisionSolid(piece);
    return solid ? [{ piece, solid }] : [];
  });
  const blockers = new Set<string>();
  const zone = candidate.workZone;
  if (zone && candidate.pieces.some((piece) => {
    if (!changed.has(piece.id)) return false;
    const { min, max } = bounds(piece);
    return min[0] < -zone.width / 2 - 0.001 || max[0] > zone.width / 2 + 0.001 ||
      min[1] < -0.001 || max[1] > zone.height + 0.001 ||
      min[2] < -zone.depth / 2 - 0.001 || max[2] > zone.depth / 2 + 0.001;
  })) blockers.add("the work-zone boundary");
  for (const { piece, solid } of active) {
    if (!changed.has(piece.id)) continue;
    for (const neighbor of active) {
      if (neighbor.piece.id === piece.id) continue;
      if (solidOverlap(solid, neighbor.solid)) blockers.add(neighbor.piece.name);
    }
  }
  const plan = candidate.motionPlans?.find(({ mechanism }) => mechanism.kind === "hinge" && mechanism.doorway?.sectionId === section.id);
  const swing = plan ? runMotionTest(candidate, plan) : null;
  const limit = plan && swing?.review ? swing.review.playbackLimit(0, plan.mechanism.travel) : null;
  const atLimit = limit && swing?.review ? swing.review.preview(limit.travel, limit.inspectAt, limit.siteFaceId) : null;
  return {
    impact, section, blockers: [...blockers], plan,
    swing: plan && {
      error: swing?.error,
      travel: plan.mechanism.travel,
      limit: limit?.travel,
      uncertain: limit?.uncertain,
      blockers: atLimit ? [...atLimit.obstacleNames, ...atLimit.siteFaceNames, ...atLimit.outsideZoneFaces] : [],
    },
  };
}

export function acceptsDoorway(command?: Command | null) {
  return command?.type === "wall";
}
