import { clipBox } from "./cutProfiles";
import { cuttingAxes } from "./cutPlan";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { openingAxes } from "./throughOpenings";
import type { Piece, Project, V3 } from "./model";
import { convexHull, type Point2 } from "./convexHull";
export { convexHull, type Point2 } from "./convexHull";
export type CutDiagram = {
  width: number;
  length: number;
  axes: { long: number; wide: number };
  source: Point2[];
  retained: Point2[];
  openings?: { center: Point2; diameter: number }[];
  rectangles?: { center: Point2; size: Point2 }[];
  offcuts: { id: string; points: Point2[] }[];
};

/** A piece's actual convex silhouette expressed in the original stock's frame. */
export function stockFootprint(
  piece: Piece,
  frame: Piece,
  long: number,
  wide: number,
): Point2[] {
  if (![long, wide].every((axis) => [0, 1, 2].includes(axis)) || long === wide)
    throw new Error("Choose two different local stock axes.");
  const inverse = inverseRotation(frame.rotation);
  const epsilon = Math.max(...frame.size) * 1e-9;
  const coordinate = (value: number, span: number) =>
    Math.abs(value) < epsilon
      ? 0
      : Math.abs(value - span) < epsilon
        ? span
        : value;
  return convexHull(
    clipBox(piece.size, piece.cutPlanes ?? []).vertices.map((point) => {
      const world = rotate(point, piece.rotation).map(
        (v, i) => v + piece.position[i],
      ) as V3;
      const local = rotate(
        world.map((v, i) => v - frame.position[i]) as V3,
        inverse,
      );
      return [
        coordinate(local[wide] + frame.size[wide] / 2, frame.size[wide]),
        coordinate(local[long] + frame.size[long] / 2, frame.size[long]),
      ];
    }),
  );
}

export function cutDiagram(
  project: Project,
  sourceId: string,
  candidate: Project | null = project,
  face?: "width" | "thickness",
): CutDiagram {
  const source = project.pieces.find((p) => p.id === sourceId);
  if (!source) throw new Error("Choose a stock part for the diagram.");
  const axes = stockAxes(source, source.cutStock?.size ?? source.size);
  const [long, wide] = face ? [axes.length, axes[face]] : cuttingAxes(source);
  const kept = candidate?.pieces.find((piece) => piece.id === sourceId);
  const previousIds = new Set(project.pieces.map((piece) => piece.id));
  const lineage = kept?.cutStock?.id;
  return {
    width: source.size[wide],
    length: source.size[long],
    axes: { long, wide },
    source: stockFootprint(source, source, long, wide),
    retained: kept ? stockFootprint(kept, source, long, wide) : [],
    ...(source.roundOpenings?.length
      ? {
          openings: source.roundOpenings.flatMap((opening) => {
            if (opening.axis === long || opening.axis === wide) return [];
            const indices: readonly number[] = openingAxes(opening.axis);
            return [
              {
                center: [
                  opening.center[indices.indexOf(wide)] + source.size[wide] / 2,
                  opening.center[indices.indexOf(long)] + source.size[long] / 2,
                ] as Point2,
                diameter: opening.diameter,
              },
            ];
          }),
        }
      : {}),
    ...(source.rectangularOpenings?.length
      ? {
          rectangles: source.rectangularOpenings.flatMap((opening) => {
            if (opening.axis === long || opening.axis === wide) return [];
            const indices: readonly number[] = openingAxes(opening.axis);
            const u = indices.indexOf(wide),
              v = indices.indexOf(long);
            return [
              {
                center: [
                  opening.center[u] + source.size[wide] / 2,
                  opening.center[v] + source.size[long] / 2,
                ] as Point2,
                size: [opening.spans[u], opening.spans[v]] as Point2,
              },
            ];
          }),
        }
      : {}),
    offcuts: lineage
      ? (candidate?.pieces ?? [])
          .filter(
            (piece) =>
              piece.offcut &&
              !previousIds.has(piece.id) &&
              piece.cutStock?.id === lineage,
          )
          .map((piece) => ({
            id: piece.id,
            points: stockFootprint(piece, source, long, wide),
          }))
      : [],
  };
}
