import { Euler, Matrix4, Vector3 } from "three";
import { clearFittedPart } from "./clearFittedPart";
import { faceContactPatch, retainedWoodFaces } from "./connectionContacts";
import { cutKerf, inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import {
  catalog,
  part,
  projectSchema,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { reviewPanelBearing } from "./panelBearing";
import { reviewShelfSag } from "./shelfSag";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { reviewWoodSupport } from "./woodSupport";

const tolerance = 1e-7;
const vec = (value: V3) => new Vector3(...value);
const rectangular = (piece: Piece) =>
  !piece.cutPlanes?.length &&
  !piece.roundOpenings?.length &&
  !piece.rectangularOpenings?.length;
export const shelfDividerStocks = catalog.filter(
  ({ wood, cuttable, stockKind, shape }) =>
    wood && cuttable && stockKind === "sheet" && !shape,
);

function dividerRotation(
  line: [V3, V3],
  axes: ReturnType<typeof stockAxes>,
): V3 {
  const basis = [new Vector3(), new Vector3(), new Vector3()] as const;
  basis[axes.thickness].copy(vec(line[1]).sub(vec(line[0])).normalize());
  basis[axes.length].set(0, 1, 0);
  basis[axes.width].crossVectors(basis[axes.thickness], basis[axes.length]);
  const matrix = new Matrix4().makeBasis(...basis);
  if (matrix.determinant() < 0) {
    basis[axes.width].negate();
    matrix.makeBasis(...basis);
  }
  const rotation = new Euler().setFromRotationMatrix(matrix);
  return [rotation.x, rotation.y, rotation.z];
}

export function previewShelfDivider(
  project: Project,
  shelfId: string,
  materialId: MaterialId,
  preferOffcut: boolean,
) {
  const plan = project.shelfSagPlans?.find(
    ({ pieceId }) => pieceId === shelfId,
  );
  const row = reviewPanelBearing(project).find(
    ({ piece }) => piece.id === shelfId,
  );
  const previous = plan && row && reviewShelfSag(row, plan);
  if (
    !plan ||
    !previous ||
    "reason" in previous ||
    previous.withinTarget ||
    !row
  )
    throw Error(
      "Save a shelf sag estimate above your target before previewing a divider.",
    );
  const stock = shelfDividerStocks.find(({ id }) => id === materialId);
  if (!stock) throw Error("Choose a rectangular wood sheet for the divider.");

  const shelf = row.piece;
  const section = project.sections.find(({ pieceIds }) =>
    pieceIds.includes(shelfId),
  );
  const geometry = previous.geometry;
  const top = vec(geometry.line[0]).lerp(vec(geometry.line[1]), 0.5);
  const reference = stock.stockSize ?? stock.size;
  const freshAxes = stockAxes({
    size: reference,
    material: stock.id,
    stockLengthAxis: null,
  });
  const thickness = reference[freshAxes.thickness];
  const bearing = reviewWoodSupport(project);
  const bases = [...bearing.values()]
    .flatMap(({ piece, onFloor, next }) =>
      piece.id !== shelfId && (onFloor || next)
        ? retainedWoodFaces(piece).flatMap((face) => {
            const y = face.points[0][1];
            return y > tolerance &&
              y < top.y - tolerance &&
              Math.hypot(face.normal[0], face.normal[1] - 1, face.normal[2]) <=
                tolerance
              ? [{ y, pieceId: piece.id, face }]
              : [];
          })
        : [],
    )
    .sort((a, b) => b.y - a.y);

  const blank = part(
    `Shelf divider · ${shelf.name}`.slice(0, 120),
    stock.id,
    [...reference],
    [top.x, 0, top.z],
    shelf.stepId,
    section?.name ?? shelf.assembly,
  );
  const candidate = (
    source: Piece,
    axes: ReturnType<typeof stockAxes>,
    y: number,
  ) => {
    const size: V3 = [...source.size];
    size[axes.length] = top.y - y;
    size[axes.width] = geometry.depth;
    return {
      ...source,
      size,
      name: blank.name,
      offcut: false,
      position: [top.x, (top.y + y) / 2, top.z] as V3,
      rotation: dividerRotation(geometry.line, axes),
      stepId: blank.stepId,
      assembly: blank.assembly,
      stockLengthAxis: axes.length,
    };
  };
  const fit = [...bases, { y: 0, pieceId: null, face: null }].find(
    ({ y, face }) => {
      if (top.y - y <= tolerance) return false;
      const divider = candidate(blank, freshAxes, y);
      if (face) {
        const bottom = retainedWoodFaces(divider).find(
          ({ normal }) => normal[1] < -1 + tolerance,
        )!;
        const contact = faceContactPatch(bottom, face);
        if ((contact?.area ?? 0) < thickness * geometry.depth - tolerance)
          return false;
      }
      return clearFittedPart(project, divider);
    },
  );
  if (!fit)
    throw Error(
      "There is no unobstructed fit to the floor or to a supported wood face beneath this bay.",
    );

  const need = { length: top.y - fit.y, width: geometry.depth };
  const fits = (
    source: Piece,
    axes: ReturnType<typeof stockAxes>,
    kerf: number,
  ) =>
    (["length", "width"] as const).every((key) => {
      const extra = source.size[axes[key]] - need[key];
      return Math.abs(extra) <= tolerance || extra > kerf + tolerance;
    });
  const inspected = preferOffcut ? inspectCutStock(project) : null;
  const reusable = inspected
    ? project.pieces
        .filter(
          (piece) =>
            piece.offcut &&
            piece.material === stock.id &&
            rectangular(piece) &&
            !!piece.cutStock &&
            inspected.valid.has(piece.cutStock.id),
        )
        .map((piece) => ({
          piece,
          axes: stockAxes(piece, piece.cutStock!.size),
        }))
        .filter(
          ({ piece, axes }) =>
            fits(piece, axes, pieceCutKerf(piece)) &&
            Math.abs(piece.size[axes.thickness] - thickness) <= tolerance,
        )
        .sort(
          (a, b) =>
            a.piece.size[a.axes.length] * a.piece.size[a.axes.width] -
            b.piece.size[b.axes.length] * b.piece.size[b.axes.width],
        )[0]
    : undefined;
  const source = reusable?.piece ?? blank;
  const axes = reusable?.axes ?? freshAxes;
  if (!fits(source, axes, cutKerf(stock.id)))
    throw Error(
      "This sheet has too little usable stock for the divider and trim. Choose a larger sheet or review the bearing location.",
    );

  const fitted = candidate(source, axes, fit.y);
  const trimShift = source.size.map(
    (value, i) => (value - fitted.size[i]) / 2,
  ) as V3;
  const initial: Piece = {
    ...fitted,
    size: [...source.size],
    position: vec(fitted.position)
      .add(vec(rotate(trimShift, fitted.rotation)))
      .toArray(),
  };
  let next: Project = {
    ...project,
    pieces: [...project.pieces.filter(({ id }) => id !== initial.id), initial],
  };
  for (const axis of [axes.length, axes.width])
    if (initial.size[axis] - fitted.size[axis] > tolerance)
      next = cutPiece(next, initial.id, fitted.size[axis], axis);
  next = projectSchema.parse({
    ...next,
    sections: next.sections.map((item) =>
      item.id === section?.id
        ? { ...item, pieceIds: [...item.pieceIds, fitted.id] }
        : item,
    ),
    guideFingerprint: null,
  });
  const divider = next.pieces.find(({ id }) => id === fitted.id)!;
  const supported = reviewPanelBearing(next).find(
    ({ piece }) => piece.id === shelfId,
  );
  const after = supported && reviewShelfSag(supported, plan);
  if (
    !supported ||
    !after ||
    "reason" in after ||
    !supported.contacts.some(({ pieceId }) => pieceId === divider.id)
  )
    throw Error(
      "This divider does not make full-depth contact with the shelf in the modeled pose.",
    );
  const oldIds = new Set(project.pieces.map(({ id }) => id));
  const offcuts = next.pieces.filter(
    ({ id, offcut }) => offcut && !oldIds.has(id),
  );
  return {
    project: next,
    divider,
    materialId,
    shelfId,
    baseId: fit.pieceId,
    reusedId: reusable?.piece.id ?? null,
    height: need.length,
    depth: need.width,
    thickness,
    previous,
    after,
    offcuts,
    outlines: retainedWoodFaces(divider).map(({ points }) => points),
  };
}

export type ShelfDividerPreview = ReturnType<typeof previewShelfDivider>;
