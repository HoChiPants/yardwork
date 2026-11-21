import { bounds } from "./engine";
import type { Piece, Project } from "./model";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";

const tolerance = 1e-7;

export function clearFittedPart(project: Project, candidate: Piece) {
  const solid = prepareCollisionSolid(candidate);
  if (!solid) return false;
  const zone = project.workZone;
  if (
    zone &&
    solid.vertices.some(
      ([x, y, z]) =>
        Math.abs(x) > zone.width / 2 + tolerance ||
        Math.abs(z) > zone.depth / 2 + tolerance ||
        y < -tolerance ||
        y > zone.height + tolerance,
    )
  )
    return false;
  return project.pieces.every((other) => {
    if (other.offcut) return true;
    const box = bounds(other);
    if (
      solid.bounds.min.some(
        (low, axis) =>
          Math.min(solid.bounds.max[axis], box.max[axis]) -
            Math.max(low, box.min[axis]) <=
          tolerance,
      )
    )
      return true;
    const obstruction = prepareCollisionSolid(other);
    return obstruction !== null && !solidOverlap(solid, obstruction, tolerance);
  });
}
