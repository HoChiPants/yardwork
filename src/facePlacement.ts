import { retainedWoodFaces, touchingWoodPatches, type WoodFace } from "./connectionContacts";
import { material, type Piece, type Project, type V3 } from "./model";
import { placeWood } from "./placement";
import { prepareCollisionSolid } from "./solidCollision";

export const woodPlacementFaces = [
  { label: "On top", axis: 1, sign: 1 },
  { label: "Below", axis: 1, sign: -1 },
  { label: "Right", axis: 0, sign: 1 },
  { label: "Left", axis: 0, sign: -1 },
  { label: "In front", axis: 2, sign: 1 },
  { label: "Behind", axis: 2, sign: -1 },
] as const;

const epsilon = 1e-7;

export function canPlaceWoodFace(piece: Piece) {
  const stock = material(piece.material);
  return !piece.offcut && stock.wood && !stock.shape && (stock.stockKind === "linear" || stock.stockKind === "sheet");
}

function centerAlong(faces: readonly WoodFace[], axis: number) {
  const values = faces.flatMap(({ points }) => points.map((point) => point[axis]));
  return (Math.min(...values) + Math.max(...values)) / 2;
}

export function previewWoodFacePlacement(project: Project, movingId: string, targetId: string, side: number, centered: boolean) {
  const moving = project.pieces.find(({ id }) => id === movingId);
  const target = project.pieces.find(({ id }) => id === targetId);
  const direction = woodPlacementFaces[side];
  if (!moving || !target || moving === target || !direction || !canPlaceWoodFace(moving) || !canPlaceWoodFace(target))
    throw Error("Choose two solid wood parts and a placement side.");
  const { axis, sign } = direction;
  const movingSolid = prepareCollisionSolid(moving);
  const targetSolid = prepareCollisionSolid(target);
  if (movingSolid?.kind !== "solid" || targetSolid?.kind !== "solid")
    throw Error("These retained shapes need a separate placement review.");

  const targetPlane = targetSolid.bounds[sign > 0 ? "max" : "min"][axis];
  const movingPlane = movingSolid.bounds[sign > 0 ? "min" : "max"][axis];
  const onPlane = (piece: Piece, outward: number, coordinate: number) =>
    retainedWoodFaces(piece).filter(({ normal, points }) =>
      normal.every((value, i) => Math.abs(value - (i === axis ? outward : 0)) < epsilon) &&
      points.every((point) => Math.abs(point[axis] - coordinate) < epsilon));
  const receivingFaces = onPlane(target, sign, targetPlane);
  const approachingFaces = onPlane(moving, -sign, movingPlane);
  if (!receivingFaces.length || !approachingFaces.length)
    throw Error("Choose a side with two opposing flat faces, or rotate the parts first.");

  const offset = moving.position.map((_, i) =>
    i === axis ? targetPlane - movingPlane : centered ? centerAlong(receivingFaces, i) - centerAlong(approachingFaces, i) : 0) as V3;
  const position = moving.position.map((value, i) => value + offset[i]) as V3;
  const zone = project.workZone;
  const { min, max } = movingSolid.bounds;
  if (min[1] + offset[1] < -epsilon) throw Error("This placement would go below the floor.");
  if (zone && (
    min[0] + offset[0] < -zone.width / 2 - epsilon || max[0] + offset[0] > zone.width / 2 + epsilon ||
    min[2] + offset[2] < -zone.depth / 2 - epsilon || max[2] + offset[2] > zone.depth / 2 + epsilon ||
    max[1] + offset[1] > zone.height + epsilon
  )) throw Error("This placement extends outside the work zone.");
  const clear = placeWood(project, moving, position, moving.rotation);
  if (clear.blocked || clear.adjusted)
    throw Error("This placement intersects solid wood. Clear the space before placing the part.");
  const part = { ...moving, position };
  const area = touchingWoodPatches(part, target).filter(({ normal }) =>
    Math.abs(normal[axis] + sign) < epsilon).reduce((sum, patch) => sum + patch.area, 0);
  if (area <= epsilon) throw Error("The faces miss each other. Center them or adjust the part's position first.");
  return { part, area };
}

export type WoodFacePlacement = ReturnType<typeof previewWoodFacePlacement>;
