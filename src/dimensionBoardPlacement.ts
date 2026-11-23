import { Euler, Matrix4, Vector3 } from "three";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import { material, part, type MaterialId, type Project, type V3 } from "./model";
import { boardBlankAtLength } from "./offcutAssignment";
import { partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { stockAxes } from "./stockAxes";

type DimensionLine = { a: V3; b: V3 };
const epsilon = 1e-6;

export function isFloorDimension({ a, b }: DimensionLine) {
  return Math.abs(a[1]) <= epsilon && Math.abs(b[1]) <= epsilon;
}

export function previewBoardAlongDimension(project: Project, dimension: DimensionLine, materialId: MaterialId, length: number) {
  const blank = boardBlankAtLength(materialId, length);
  if (!blank || material(materialId).shape) throw Error("Choose solid lumber and a finished length.");
  const { a, b } = dimension;
  const start = new Vector3(...a);
  const finish = new Vector3(...b);
  const direction = finish.clone().sub(start);
  const span = direction.length();
  if (length > span + epsilon) throw Error("The finished length extends beyond the saved marks.");
  direction.normalize();

  const { thickness, width, length: lengthAxis } = stockAxes({ ...blank, material: materialId });
  const upward = isFloorDimension(dimension) || Math.abs(direction.y) < 0.99999
    ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const normal = upward.addScaledVector(direction, -upward.dot(direction)).normalize();
  const basis = [new Vector3(), new Vector3(), new Vector3()] as const;
  basis[lengthAxis].copy(direction);
  basis[thickness].copy(normal);
  if ((lengthAxis + 1) % 3 === thickness) basis[width].crossVectors(direction, normal);
  else basis[width].crossVectors(normal, direction);
  const angles = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(...basis));
  const center = start.add(finish).multiplyScalar(0.5);
  if (isFloorDimension(dimension)) center.y = blank.size[thickness] / 2;
  const board = {
    ...part(material(materialId).name, materialId, blank.size, center.toArray(),
      project.steps[0].id, "Loose parts", [angles.x, angles.y, angles.z]),
    stockLengthAxis: lengthAxis,
  };
  const solid = prepareCollisionSolid(board)!;
  const { min, max } = solid.bounds;
  if (min[1] < -epsilon) throw Error("The board would extend below the workspace floor.");
  const zone = project.workZone;
  if (zone && (min[0] < -zone.width / 2 - epsilon || max[0] > zone.width / 2 + epsilon ||
    min[2] < -zone.depth / 2 - epsilon || max[2] > zone.depth / 2 + epsilon || max[1] > zone.height + epsilon))
    throw Error("The board would extend outside the work zone.");
  for (const other of project.pieces) {
    if (other.offcut) continue;
    const shape = prepareCollisionSolid(other) ?? prepareCollisionBox(other.size, other.position, other.rotation);
    if (solidOverlap(solid, shape, epsilon))
      throw Error(`The board would overlap ${partLabel(project, other.id)} · ${other.name}${shape.kind === "envelope" ? " at its modeled clearance envelope" : ""}.`);
  }
  const conflicts = fittedPartMotionConflicts({ ...project, pieces: [...project.pieces, board] }, board.id);
  if (conflicts.length) throw Error(`The board would obstruct ${conflicts.join(", ")}.`);
  return board;
}
