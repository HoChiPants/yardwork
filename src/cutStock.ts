import { clipBox } from "./cutProfiles";
import { cutSourceRegion, woodKerfSchema } from "./cutSourceAxes";
import {
  canPlanWoodKerf,
  isBatt,
  material,
  type MaterialId,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { orientedStockSize } from "./stockAxes";
import { isPexPipe } from "./wallWaterReference";
import { isDrywall } from "./drywallReference";

export const KERF = 0.125;
export const cutKerf = (materialId: MaterialId) =>
  isBatt(materialId) || isDrywall(materialId) || isPexPipe(materialId) ? 0 : KERF;
export const plannedCutKerf = (project: Project, id: MaterialId) =>
  project.woodKerfs?.[id] ?? cutKerf(id);

export function setPlannedWoodKerf(project: Project, id: MaterialId, kerf: number | undefined) {
  if (!canPlanWoodKerf(id)) throw Error("Choose cuttable wood board or sheet stock.");
  if (kerf !== undefined && !woodKerfSchema.safeParse(kerf).success)
    throw Error("Enter a positive blade kerf in inches.");
  if (project.woodKerfs?.[id] === kerf) return project;
  const { woodKerfs, ...draft } = project;
  const next = { ...woodKerfs };
  if (kerf === undefined) delete next[id];
  else next[id] = kerf;
  return {
    ...draft,
    ...(Object.keys(next).length ? { woodKerfs: next } : {}),
    guideFingerprint: null,
  };
}

export const pieceCutKerf = (piece: Piece) =>
  piece.cutStock?.woodKerf ?? piece.cutStock?.tubeKerf ?? cutKerf(piece.material);

export function cutSourceVertices(piece: Piece) {
  const region = cutSourceRegion(piece);
  const center = region.offset.map((offset, i) => offset + region.size[i] / 2);
  return clipBox(piece.size, piece.cutPlanes).vertices.map(
    (point) =>
      region
        .toSourceDirection(point)
        .map((value, i) => value + center[i]) as V3,
  );
}

/** Prove that a recorded cut plane leaves a full-width empty slab in source space. */
function hasProfileSawGap(
  a: Piece,
  b: Piece,
  kerf: number,
  cache: Map<Piece, V3[]>,
) {
  if (!a.cutPlanes.length && !b.cutPlanes.length) return false;
  const normals = [a, b].flatMap((piece) => {
    const region = cutSourceRegion(piece);
    return piece.cutPlanes.map(({ normal }) =>
      region.toSourceDirection(normal),
    );
  });
  const vertices = (piece: Piece) => {
    const prepared = cache.get(piece) ?? cutSourceVertices(piece);
    cache.set(piece, prepared);
    return prepared;
  };
  try {
    const av = vertices(a),
      bv = vertices(b);
    return normals.some((normal) => {
      const projection = (point: V3) =>
        point.reduce((total, value, i) => total + value * normal[i], 0);
      const ap = av.map(projection),
        bp = bv.map(projection);
      return (
        Math.max(
          Math.min(...ap) - Math.max(...bp),
          Math.min(...bp) - Math.max(...ap),
        ) >=
        kerf - 0.000001
      );
    });
  } catch {
    return false;
  }
}

/** Validate source-local bounds and saw clearance independently of the current assembly pose. */
export function inspectCutStock(project: Project) {
  const groups = new Map<string, Piece[]>();
  for (const piece of project.pieces)
    if (piece.cutStock)
      groups.set(piece.cutStock.id, [
        ...(groups.get(piece.cutStock.id) ?? []),
        piece,
      ]);
  const valid = new Set<string>();
  const invalid: { sourceId: string; pieceId: string; detail: string }[] = [];
  const vertices = new Map<Piece, V3[]>();
  for (const [sourceId, pieces] of groups) {
    const first = pieces[0],
      source = first.cutStock!,
      m = material(first.material);
    const packed = !!source.sourceAxes;
    const regions = pieces.map(cutSourceRegion);
    const originalSize = regions[0].sourceSize;
    let detail = "";
    if (!m.cuttable || !["linear", "sheet"].includes(m.stockKind))
      detail = "Only cuttable linear or sheet stock can share a cut source.";
    else if (pieces.some((piece) => piece.cutStock!.tubeKerf !== source.tubeKerf))
      detail = "Parts from this tube disagree on the recorded cutting loss.";
    else if (pieces.some((piece) => piece.cutStock!.woodKerf !== source.woodKerf))
      detail = "Parts from this wood source disagree on the recorded cutting loss.";
    else if (
      isDrywall(first.material) &&
      (source.woodKerf !== undefined || source.tubeKerf !== undefined ||
        pieces.some((piece) => {
          const axis = piece.cutStock!.sourceAxes?.[0];
          return piece.cutPlanes.length > 0 ||
            Math.abs((axis === undefined
              ? orientedStockSize(piece)[0] : piece.size[axis]) - 0.5) > 1e-6;
        }))
    )
      detail = "Score-and-snap drywall cuts must keep the full panel thickness and have no recorded saw kerf.";
    else if (
      m.shape === "tube-envelope" &&
      pieces.some((piece, index) => {
        const localLength = piece.cutStock?.sourceAxes?.[2] ?? 1;
        const length = packed ? 2 : 1;
        const { sourceSize, size, offset } = regions[index];
        return (
          localLength !== 1 ||
          (piece.stockLengthAxis !== null && piece.stockLengthAxis !== 1) ||
          piece.cutPlanes.length > 0 ||
          sourceSize.some(
            (value, axis) =>
              axis !== length &&
              (Math.abs(value - m.size[0]) > 1e-6 ||
                Math.abs(size[axis] - value) > 1e-6 ||
                Math.abs(offset[axis]) > 1e-6),
          )
        );
      })
    )
      detail = "Tube cuts must preserve the catalog diameter and run along the tube length.";
    else if (
      pieces.some(
        (piece, i) =>
          piece.material !== first.material ||
          !!piece.cutStock!.sourceAxes !== packed ||
          (!packed && piece.stockLengthAxis !== first.stockLengthAxis) ||
          regions[i].sourceSize.some(
            (v, axis) => Math.abs(v - originalSize[axis]) > 0.000001,
          ),
      )
    )
      detail =
        "The source is shared across different materials or original stock dimensions.";
    else {
      const stock = [...(m.stockSize ?? m.size)].sort((a, b) => a - b),
        original = packed
          ? originalSize
          : orientedStockSize({ ...first, size: source.size });
      if (original.some((v, i) => v > stock[i] + 0.000001))
        detail =
          "The original cut source exceeds the selected catalog stock dimensions.";
      else if (
        regions.some(({ offset, size }) =>
          offset.some(
            (v, i) => v < -0.000001 || v + size[i] > originalSize[i] + 0.000001,
          ),
        )
      )
        detail =
          "A retained part or offcut extends beyond its original source-local stock region.";
      else
        for (let i = 0; i < pieces.length && !detail; i++)
          for (let j = i + 1; j < pieces.length; j++) {
            const a = pieces[i],
              b = pieces[j],
              aa = regions[i],
              bb = regions[j];
            const kerf = pieceCutKerf(first);
            const gaps = [0, 1, 2].map((axis) =>
              Math.max(
                aa.offset[axis] - (bb.offset[axis] + bb.size[axis]),
                bb.offset[axis] - (aa.offset[axis] + aa.size[axis]),
              ),
            );
            if (
              !gaps.some((gap) => gap >= kerf - 0.000001) &&
              !(kerf > 0 && hasProfileSawGap(a, b, kerf, vertices))
            ) {
              detail = gaps.every((gap) => gap < -0.000001)
                ? "Two retained parts or offcuts claim overlapping regions of the same cut source."
                : source.woodKerf !== undefined
                  ? "Retained parts or offcuts do not leave the recorded wood cutting loss between their source-local regions."
                  : source.tubeKerf !== undefined
                    ? "Retained parts or offcuts do not leave the recorded tube cutting loss between their source-local regions."
                    : "Retained parts or offcuts do not leave the modeled ⅛ in saw kerf between their source-local regions.";
              break;
            }
          }
    }
    if (detail) invalid.push({ sourceId, pieceId: first.id, detail });
    else valid.add(sourceId);
  }
  return { groups, valid, invalid };
}

export function invalidCutSources(
  project: Project,
): ReadonlyMap<string, string> {
  return new Map(
    inspectCutStock(project).invalid.map(({ sourceId, detail }) => [
      sourceId,
      detail,
    ]),
  );
}

/** A source is credited only while its saved geometry passes inspection. */
export function setCutSourceOnHand(project: Project, sourceId: string, onHand: boolean): Project {
  return setCutSourcesOnHand(project, [sourceId], onHand);
}

export function setCutSourcesOnHand(project: Project, sourceIds: readonly string[], onHand: boolean): Project {
  const { groups, valid } = inspectCutStock(project);
  const selected = new Set(sourceIds);
  if (onHand && [...selected].some((id) => !valid.has(id)))
    throw Error("Review the recorded cut source before marking its stock on hand.");
  const { onHandCutSources, ...rest } = project;
  const sources = (onHandCutSources ?? []).filter((id) => groups.has(id) && !selected.has(id));
  if (onHand) sources.push(...selected);
  return sources.length ? { ...rest, onHandCutSources: sources } : rest;
}
