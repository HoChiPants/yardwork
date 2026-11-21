import { Euler, Matrix4, Vector3 } from "three";
import { clearFittedPart } from "./clearFittedPart";
import {
  faceContactPatch,
  retainedWoodFaces,
  type WoodFace,
} from "./connectionContacts";
import { cutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { fittedStockMaterials } from "./fittedStock";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import {
  part,
  projectSchema,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { panelFloorBearing, reviewPanelBearing } from "./panelBearing";
import { stockAxes } from "./stockAxes";
import { reviewWoodSupport, type WoodSupportReview } from "./woodSupport";

const tolerance = 1e-7;
export const panelSupportStocks = fittedStockMaterials();
const flat = (face: WoodFace, sign: -1 | 1) =>
  Math.hypot(face.normal[0], face.normal[1] - sign, face.normal[2]) <=
  tolerance;
const vec = (point: V3) => new Vector3(...point);

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

function fittedBlock(
  project: Project,
  upper: Piece,
  blank: Piece,
  support: WoodSupportReview,
) {
  const axes = stockAxes(blank);
  const area = blank.size[axes.width] * blank.size[axes.thickness];
  const bases = supportBases(project, support);
  for (const face of retainedWoodFaces(upper)) {
    if (!flat(face, -1)) continue;
    const center = face.points
      .reduce((sum, point) => sum.add(vec(point)), new Vector3())
      .multiplyScalar(1 / face.points.length);
    const rotations = blockRotations(face, axes);
    for (const base of bases) {
      const height = center.y - base.y;
      if (height <= tolerance) continue;
      for (const rotation of rotations) {
        const size: V3 = [...blank.size];
        size[axes.length] = height;
        const candidate: Piece = {
          ...blank,
          size,
          rotation,
          position: [center.x, (center.y + base.y) / 2, center.z],
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
        return { candidate, baseId: base.pieceId, height, axis: axes.length };
      }
    }
  }
  throw Error(
    "No centered fit reaches the floor or a supported wood face with the full selected cross-section. Try narrower stock or inspect the space under the support.",
  );
}


export function previewPanelSupportBlock(
  project: Project,
  panelId: string,
  stopId: string,
  materialId: MaterialId,
  preferOffcut: boolean,
) {
  const wood = reviewWoodSupport(project);
  const panel = reviewPanelBearing(project).find(
    ({ piece }) => piece.id === panelId,
  );
  const floor = panel && panelFloorBearing(panel, wood);
  const upper = stationarySupportStops(project, floor?.stops ?? [], wood).find(
    ({ id }) => id === stopId,
  );
  if (!upper)
    throw Error(
      "Choose a stationary wood part at a current break in the panel’s floor support.",
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
  const { candidate, baseId, height, axis } = fittedBlock(
    project,
    upper,
    blank,
    wood,
  );
  const stockLength = size[axis];
  let next: Project = { ...project, pieces: [...project.pieces, candidate] };
  const reuse = preferOffcut ? fittingOffcuts(next, candidate)[0] : undefined;
  if (reuse) {
    next = assignOffcutToPart(next, candidate.id, reuse.piece.id);
  } else if (Math.abs(stockLength - height) > tolerance) {
    if (height + cutKerf(stock.id) >= stockLength - tolerance)
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
    };
    next = cutPiece(
      { ...project, pieces: [...project.pieces, source] },
      candidate.id,
      height,
      axis,
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
  const afterPanel = reviewPanelBearing(next).find(
    ({ piece }) => piece.id === panelId,
  );
  const after =
    afterPanel && panelFloorBearing(afterPanel, reviewWoodSupport(next));
  if (
    !after ||
    after.stops.includes(stopId) ||
    after.stops.some((id) => !floor?.stops.includes(id))
  )
    throw Error(
      "The fitted block did not close the chosen contact path. Review the retained faces under this part.",
    );
  const block = next.pieces.find(({ id }) => id === candidate.id)!;
  const originalIds = new Set(project.pieces.map(({ id }) => id));
  return {
    project: next,
    block,
    panelId,
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
    remainingStops: after.stops,
    motionConflicts: fittedPartMotionConflicts(next, block.id),
  };
}

export type PanelSupportBlockPreview = ReturnType<
  typeof previewPanelSupportBlock
>;
