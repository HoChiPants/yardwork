import { Euler, Matrix4, Vector3 } from "three";
import { clearFittedPart } from "./clearFittedPart";
import {
  faceContactPatch,
  retainedWoodFaces,
  type WoodFace,
} from "./connectionContacts";
import { plannedCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { fittedStockMaterials } from "./fittedStock";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import {
  part,
  projectSchema,
  uid,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { stockSplitState } from "./packing";
import { panelFloorBearing, reviewPanelBearing } from "./panelBearing";
import { stockAxes } from "./stockAxes";
import { fittedSupportBlockRole, reviewWoodSupport, woodSupportBreaks, type WoodSupportReview } from "./woodSupport";

const tolerance = 1e-7;
export const panelSupportStocks = fittedStockMaterials();
const flat = (face: WoodFace, sign: -1 | 1) =>
  Math.hypot(face.normal[0], face.normal[1] - sign, face.normal[2]) <=
  tolerance;
const vec = (point: V3) => new Vector3(...point);
export type SupportBlockPosition = { kind: "offset"; x: number; z: number } | { kind: "nearby" };

export function stationarySupportStops(
  project: Project,
  ids: readonly string[],
  support: WoodSupportReview,
) {
  const moving = new Set(
    project.motionPlans?.flatMap(({ memberIds }) => memberIds),
  );
  return ids.flatMap((id) => {
    const row = support.get(id);
    return row?.geometryAvailable &&
      !row.onFloor &&
      !row.supports.length &&
      !moving.has(id) &&
      row.piece.designRole !== "seat-lid"
      ? [row.piece]
      : [];
  });
}

function blockRotations(
  face: WoodFace,
  axes: ReturnType<typeof stockAxes>,
): V3[] {
  const edges = face.points.map((point, index) =>
    vec(face.points[(index + 1) % face.points.length])
      .sub(vec(point))
      .setY(0),
  );
  const width = edges
    .reduce((longest, edge) =>
      edge.lengthSq() > longest.lengthSq() ? edge : longest,
    )
    .normalize();
  const up = new Vector3(0, 1, 0);
  return [width, up.clone().cross(width)].map((direction) => {
    const basis = [new Vector3(), new Vector3(), new Vector3()];
    basis[axes.length].copy(up);
    basis[axes.width].copy(direction);
    basis[axes.thickness].crossVectors(up, direction);
    const matrix = new Matrix4().makeBasis(basis[0], basis[1], basis[2]);
    if (matrix.determinant() < 0) {
      basis[axes.thickness].negate();
      matrix.makeBasis(basis[0], basis[1], basis[2]);
    }
    const { x, y, z } = new Euler().setFromRotationMatrix(matrix);
    return [x, y, z];
  });
}

function supportBases(project: Project, support: WoodSupportReview) {
  const moving = new Set(
    project.motionPlans?.flatMap(({ memberIds }) => memberIds),
  );
  const bases = [...support.values()]
    .flatMap(({ piece, onFloor, next }) =>
      (onFloor || next) &&
      !moving.has(piece.id) &&
      piece.designRole !== "seat-lid"
        ? retainedWoodFaces(piece).flatMap((face) =>
            flat(face, 1) && face.points[0][1] >= -tolerance
              ? [{ pieceId: piece.id, y: face.points[0][1], face }]
              : [],
          )
        : [],
    )
    .sort((a, b) => b.y - a.y);
  return [...bases, { pieceId: null, y: 0, face: null }];
}

function nearbyCenters(face: WoodFace, center: Vector3, blank: Piece, rotation: V3) {
  const axes = stockAxes(blank);
  const direction = (index: number) => new Vector3(Number(index === 0), Number(index === 1), Number(index === 2))
    .applyEuler(new Euler(...rotation));
  const width = direction(axes.width), thickness = direction(axes.thickness);
  const possible = (axis: Vector3, halfSize: number) => {
    const edges = face.points.map((point) => vec(point).sub(center).dot(axis));
    const low = Math.min(...edges) + halfSize, high = Math.max(...edges) - halfSize;
    if (low > high + tolerance) return [];
    return [...new Set([Math.max(low, Math.min(high, 0)), low, (3 * low + high) / 4,
      (low + high) / 2, (low + 3 * high) / 4, high].map((value) => Math.abs(value) < tolerance ? 0 : value))];
  };
  return possible(width, blank.size[axes.width] / 2).flatMap((across) =>
    possible(thickness, blank.size[axes.thickness] / 2).map((depth) =>
      center.clone().addScaledVector(width, across).addScaledVector(thickness, depth)));
}

function fittedBlock(
  project: Project,
  upper: Piece,
  blank: Piece,
  support: WoodSupportReview,
  position?: SupportBlockPosition,
) {
  const axes = stockAxes(blank);
  const area = blank.size[axes.width] * blank.size[axes.thickness];
  const bases = supportBases(project, support);
  type Fit = { candidate: Piece; baseId: string | null; height: number; axis: 0 | 1 | 2; offset: [number, number]; conflicts: string[] };
  let obstructed: Fit | undefined;
  for (const face of retainedWoodFaces(upper)) {
    if (!flat(face, -1)) continue;
    const center = face.points
      .reduce((sum, point) => sum.add(vec(point)), new Vector3())
      .multiplyScalar(1 / face.points.length);
    const positions = blockRotations(face, axes).flatMap((rotation) => {
      const centers = position?.kind === "nearby" ? nearbyCenters(face, center, blank, rotation)
        : [center.clone().add(new Vector3(position?.x ?? 0, 0, position?.z ?? 0))];
      return centers.map((point) => ({ point, rotation }));
    }).sort((a, b) => a.point.distanceToSquared(center) - b.point.distanceToSquared(center));
    for (const base of bases) {
      const height = center.y - base.y;
      if (height <= tolerance) continue;
      for (const { point, rotation } of positions) {
        const size: V3 = [...blank.size];
        size[axes.length] = height;
        const candidate: Piece = {
          ...blank,
          size,
          rotation,
          position: [point.x, (center.y + base.y) / 2, point.z],
          stockLengthAxis: axes.length,
        };
        const faces = retainedWoodFaces(candidate);
        const top = faces.find((partFace) => flat(partFace, 1))!;
        const bottom = faces.find((partFace) => flat(partFace, -1))!;
        if (
          (faceContactPatch(face, top)?.area ?? 0) < area - tolerance ||
          (base.face &&
            (faceContactPatch(base.face, bottom)?.area ?? 0) <
              area - tolerance) ||
          !clearFittedPart(project, candidate)
        )
          continue;
        const fit: Fit = {
          candidate, baseId: base.pieceId, height, axis: axes.length,
          offset: [point.x - center.x, point.z - center.z],
          conflicts: fittedPartMotionConflicts({ ...project, pieces: [...project.pieces, candidate] }, candidate.id),
        };
        if (position?.kind !== "nearby" || !fit.conflicts.length) return fit;
        obstructed ??= fit;
      }
    }
  }
  if (obstructed) return obstructed;
  throw Error(position?.kind === "nearby" ? "No nearby fit found with full bearing at both ends. Try an exact offset or narrower stock."
    : position ? "This offset does not provide a clear fit with full bearing at both ends. Try another offset or find a nearby fit."
      : "No centered fit reaches the floor or a supported wood face with the full selected cross-section. Try finding a nearby fit or using narrower stock.");
}


export type SupportBlockTarget = { kind: "panel" | "part"; id: string };

function supportBreaks(project: Project, target: SupportBlockTarget, wood: WoodSupportReview): string[] {
  if (target.kind === "part") return woodSupportBreaks(wood, target.id);
  const panel = reviewPanelBearing(project).find(({ piece }) => piece.id === target.id);
  return (panel && panelFloorBearing(panel, wood)?.stops) ?? [];
}

export function previewSupportBlock(
  project: Project,
  target: SupportBlockTarget,
  stopId: string,
  materialId: MaterialId,
  preferOffcut: boolean,
  position?: SupportBlockPosition,
) {
  if (position?.kind === "offset" && ![position.x, position.z].every(Number.isFinite))
    throw Error("Enter both offsets in inches or feet.");
  const wood = reviewWoodSupport(project);
  const stops = supportBreaks(project, target, wood);
  const upper = stationarySupportStops(project, stops, wood).find(
    ({ id }) => id === stopId,
  );
  if (!upper)
    throw Error(
      "Choose a stationary wood part at a current break in the support path.",
    );
  const stock = panelSupportStocks.find(({ id }) => id === materialId);
  if (!stock)
    throw Error(
      "Choose rectangular cuttable wood stock for the support block.",
    );
  const section = project.sections.find(({ pieceIds }) =>
    pieceIds.includes(upper.id),
  );
  if (section?.recipe?.lidOpen)
    throw Error("Close the section lid before adding a support block.");
  const size = stock.stockSize ?? stock.size;
  const blank = part(
    `Support block · ${upper.name}`.slice(0, 120),
    stock.id,
    [...size],
    upper.position,
    upper.stepId,
    section?.name ?? upper.assembly,
  );
  blank.designRole = fittedSupportBlockRole;
  const { candidate, baseId, height, axis, offset, conflicts } = fittedBlock(
    project,
    upper,
    blank,
    wood,
    position,
  );
  const stockLength = size[axis];
  let next: Project = { ...project, pieces: [...project.pieces, candidate] };
  const reuse = preferOffcut ? fittingOffcuts(next, candidate)[0] : undefined;
  if (reuse) {
    next = assignOffcutToPart(next, candidate.id, reuse.piece.id);
  } else if (Math.abs(stockLength - height) > tolerance) {
    const kerf = plannedCutKerf(project, stock.id);
    if (stockSplitState(stockLength, height, kerf) !== "cut")
      throw Error(
        "This length leaves too little stock for a square cut and saw kerf. Choose longer stock or a fitting offcut.",
      );
    const source: Piece = {
      ...candidate,
      size: [...size],
      position: [
        candidate.position[0],
        candidate.position[1] + (stockLength - height) / 2,
        candidate.position[2],
      ],
      ...(project.woodKerfs?.[stock.id] !== undefined && {
        cutStock: { id: uid(), size: [...size] as V3, offset: [0, 0, 0] as V3, woodKerf: kerf },
      }),
    };
    next = cutPiece(
      { ...project, pieces: [...project.pieces, source] },
      candidate.id,
      height,
      axis,
      { allowConsumedTail: true },
    );
  }
  next = projectSchema.parse({
    ...next,
    sections: next.sections.map((item) =>
      item.id === section?.id
        ? { ...item, pieceIds: [...item.pieceIds, candidate.id] }
        : item,
    ),
    guideFingerprint: null,
  });
  const nextWood = reviewWoodSupport(next);
  const after = supportBreaks(next, target, nextWood);
  if (
    !nextWood.get(stopId)?.next ||
    after.includes(stopId) ||
    after.some((id) => !stops.includes(id))
  )
    throw Error(
      "The fitted block did not close the chosen contact path. Review the retained faces under this part.",
    );
  const block = next.pieces.find(({ id }) => id === candidate.id)!;
  const top: V3 = [block.position[0], block.position[1] + height / 2, block.position[2]];
  const datum: [V3, V3] = [[top[0] - offset[0], top[1], top[2] - offset[1]], top];
  const originalIds = new Set(project.pieces.map(({ id }) => id));
  return {
    project: next,
    block,
    target,
    stopId,
    baseId,
    height,
    stockLength,
    reusedId: reuse?.piece.id ?? null,
    operations: reuse?.operations.map(({ text }) => text) ?? [],
    offcuts: next.pieces.filter(
      ({ id, offcut }) => offcut && !originalIds.has(id),
    ),
    outlines: retainedWoodFaces(block).map(({ points }) => points),
    remainingStops: after,
    motionConflicts: conflicts,
    offset,
    datum,
  };
}

export function previewPanelSupportBlock(project: Project, panelId: string, stopId: string, materialId: MaterialId, preferOffcut: boolean) {
  return previewSupportBlock(project, { kind: "panel", id: panelId }, stopId, materialId, preferOffcut);
}

export type PanelSupportBlockPreview = ReturnType<
  typeof previewSupportBlock
>;
