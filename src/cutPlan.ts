import { clipBox, solidBounds, type CutPlane } from "./cutProfiles";
import { cutPiece, inspectCutStock, pieceCutKerf } from "./engine";
import { cutSourceRegion, woodKerfSchema } from "./cutSourceAxes";
import { formatStockLength } from "./measurement";
import {
  isBatt,
  material,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
export function cuttingAxes(piece: Piece) {
  if (
    isBatt(piece.material) ||
    piece.stockLengthAxis != null ||
    piece.cutStock?.sourceAxes ||
    (piece.cutStock && (piece.cutPlanes.length || material(piece.material).wood))
  ) {
    const axes = stockAxes(piece, piece.cutStock?.size ?? piece.size);
    return [axes.length, axes.width];
  }
  if (material(piece.material).shape === "tube-envelope")
    return [1, 0] as (0 | 1 | 2)[];
  return ([0, 1, 2] as (0 | 1 | 2)[])
    .sort((a, b) => piece.size[b] - piece.size[a])
    .slice(0, 2) as (0 | 1 | 2)[];
}

export function canCutAngled(piece: Piece) {
  const stock = material(piece.material);
  return (
    stock.wood &&
    !piece.roundOpenings?.length &&
    !piece.rectangularOpenings?.length &&
    stock.cuttable &&
    ["linear", "sheet"].includes(stock.stockKind)
  );
}

export function canRecordWoodKerf(project: Project, piece: Piece) {
  if (!canCutAngled(piece)) return false;
  const stock = piece.cutStock;
  if (!stock) return !piece.cutPlanes.length;
  if (stock.woodKerf !== undefined || piece.cutPlanes.length) return false;
  const { size, sourceSize, offset } = cutSourceRegion(piece);
  return size.every((span, axis) => span === sourceSize[axis] && offset[axis] === 0) &&
    !project.pieces.some((other) => other.id !== piece.id && other.cutStock?.id === stock.id);
}

function measuredWoodCutSource(project: Project, source: Piece, kerf: number) {
  const measured = woodKerfSchema.safeParse(kerf);
  if (!measured.success)
    throw Error("Enter a positive blade kerf in inches.");
  if (!canRecordWoodKerf(project, source))
    throw Error("Set the blade kerf on a board, sheet or measured offcut before its first cut in Yardwork.");
  return {
    ...(source.cutStock ?? {
      id: uid(),
      size: [...source.size] as V3,
      offset: [0, 0, 0] as V3,
    }),
    woodKerf: measured.data,
  };
}

export function cutAngledEnd(
  project: Project,
  id: string,
  cross: "width" | "thickness" | "compound",
  marks: [firstMark: number, secondMark: number, topLeft?: number],
  keepEnd: "start" | "end",
  woodKerf?: number,
) {
  const source = project.pieces.find((piece) => piece.id === id);
  if (source?.roundOpenings?.length || source?.rectangularOpenings?.length)
    throw Error("Remove through-cuts before adding an angled profile to this part.");
  if (!source || !canCutAngled(source))
    throw Error("Choose a cuttable board or wood panel.");
  if (
    (cross !== "width" && cross !== "thickness" && cross !== "compound") ||
    (keepEnd !== "start" && keepEnd !== "end")
  )
    throw Error("Choose the face and the end to keep.");
  const axes = stockAxes(source, source.cutStock?.size ?? source.size);
  const { length, width, thickness } = axes;
  const span = source.size[length];
  const [firstMark, secondMark, topLeft = NaN] = marks;
  const widthRise = cross === "thickness" ? 0 : secondMark - firstMark;
  const thicknessRise =
    cross === "width"
      ? 0
      : (cross === "compound" ? topLeft : secondMark) - firstMark;
  const corners =
    cross === "compound"
      ? [firstMark, secondMark, topLeft, topLeft + widthRise]
      : [firstMark, secondMark];
  const measuredSource = woodKerf === undefined ? undefined : measuredWoodCutSource(project, source, woodKerf);
  const kerf = measuredSource?.woodKerf ?? pieceCutKerf(source);
  const widthSlope = widthRise / source.size[width];
  const thicknessSlope = thicknessRise / source.size[thickness];
  const scale = Math.hypot(1, widthSlope, thicknessSlope);
  const reach = (kerf * scale) / 2;
  if (
    !corners.every(
      (mark) => Number.isFinite(mark) && mark > reach && mark < span - reach,
    )
  )
    throw Error(
      cross === "compound"
        ? "Place all four corner marks inside the blank with room for the saw kerf."
        : "Place both edge marks inside the blank with room for the saw kerf.",
    );
  if (Math.hypot(widthSlope, thicknessSlope) < 1e-7)
    throw Error("Enter two different edge marks for an angled cut.");
  if (source.cutPlanes.length >= 6)
    throw Error("This part has reached the limit of six profile planes.");

  const normal: V3 = [0, 0, 0];
  normal[length] = 1 / scale;
  normal[width] = widthSlope ? -widthSlope / scale : 0;
  normal[thickness] = thicknessSlope ? -thicknessSlope / scale : 0;
  const center = (firstMark + (widthRise + thicknessRise - span) / 2) / scale;
  const lineage = measuredSource ?? source.cutStock ?? {
    id: uid(),
    size: [...source.size] as V3,
    offset: [0, 0, 0] as V3,
  };
  function fragment(piece: Piece, end: "start" | "end"): Piece {
    const sign = end === "start" ? 1 : -1;
    const plane: CutPlane = {
      normal: normal.map((value) => (value === 0 ? 0 : value * sign)) as V3,
      constant: center * sign - kerf / 2,
    };
    const planes = [...piece.cutPlanes, plane];
    let solid;
    try {
      solid = clipBox(piece.size, planes);
    } catch {
      throw Error(
        "The cut must leave two usable shapes in the remaining stock.",
      );
    }
    if (!solid.faces.some((face) => face.planeIndex === planes.length - 1))
      throw Error("The angled cut must pass through the remaining stock.");
    const { min, max } = solidBounds(solid);
    const shift = (min[length] + max[length]) / 2;
    const localShift: V3 = [0, 0, 0];
    localShift[length] = shift;
    const worldShift = rotate(localShift, piece.rotation);
    const size = [...piece.size] as V3;
    size[length] = max[length] - min[length];
    const offset = [...lineage.offset] as V3;
    offset[length] += Math.max(0, min[length] + span / 2);
    return {
      ...piece,
      size,
      position: piece.position.map((value, i) => value + worldShift[i]) as V3,
      cutPlanes: planes.map((cut) => ({
        normal: cut.normal,
        constant: cut.constant - cut.normal[length] * shift,
      })),
      cutStock: { ...lineage, offset },
    };
  }

  const retained = fragment(source, keepEnd);
  const spare = fragment(source, keepEnd === "start" ? "end" : "start");
  spare.id = uid();
  spare.name = `Offcut · ${source.name.replace(/^Offcut · /, "")}`.slice(
    0,
    120,
  );
  spare.offcut = true;
  delete spare.guidePlacement;
  delete spare.designRole;
  const next = {
    ...project,
    pieces: [
      ...project.pieces.map((piece) => (piece.id === id ? retained : piece)),
      spare,
    ],
  };
  const invalid = inspectCutStock(next).invalid.find(
    ({ sourceId }) => sourceId === lineage.id,
  );
  if (invalid) throw Error(invalid.detail);
  return next;
}
export type TrimOrder = "crosscut-first" | "rip-first";

export function straightTrimTargets(piece: Piece, length: number, width: number, order: TrimOrder) {
  const [long, wide] = cuttingAxes(piece);
  const cuts = [
    { axis: long, kind: "crosscut" as const, size: length },
    { axis: wide, kind: "rip" as const, size: width },
  ];
  return order === "rip-first" ? cuts.reverse() : cuts;
}

export function resizeByCuts(
  project: Project,
  id: string,
  length: number,
  width: number,
  order: TrimOrder = "crosscut-first",
  woodKerf?: number,
) {
  const source = project.pieces.find((p) => p.id === id);
  if (!source || !material(source.material).cuttable)
    throw Error("Choose cuttable lumber or a sheet panel.");
  const measuredSource = woodKerf === undefined ? undefined : measuredWoodCutSource(project, source, woodKerf);
  const kerf = measuredSource?.woodKerf ?? pieceCutKerf(source);
  let next = project;
  for (const { axis, size: target } of straightTrimTargets(source, length, width, order)) {
    const original = source.size[axis];
    if (!Number.isFinite(target) || target <= 0)
      throw Error("Enter a positive measurement for the retained piece.");
    if (target > original + 0.001)
      throw Error(
        "A cut cannot make stock larger. Choose larger stock or reduce the retained size.",
      );
    if (Math.abs(target - original) < 0.001) continue;
    if (target + kerf >= original)
      throw Error(
        kerf
          ? `Leave more than ${formatStockLength(kerf)} for cutting loss and an offcut, or keep this dimension unchanged.`
          : "Leave enough material for an offcut, or keep this dimension unchanged.",
      );
    if (next === project && measuredSource)
      next = {
        ...project,
        pieces: project.pieces.map((piece) => piece.id === id ? { ...piece, cutStock: measuredSource } : piece),
      };
    next = cutPiece(next, id, target, axis);
  }
  return next;
}
