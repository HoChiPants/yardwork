import { Triangle, Vector3 } from "three";
import { clipBox, triangulateSolid } from "./cutProfiles";
import { material, type Piece, type Project, type V3, type WorkspaceDimension, type WorkspaceDimensionAnchor } from "./model";
import { formatStockLength, measureBetween } from "./measurement";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { pieceThroughOpenings, throughOpeningTriangles } from "./throughOpenings";

export const workspaceDimensionsTitle = "Saved dimensions";
export const workspaceDimensionsScope = "Fixed points stay in the workspace. Linked points follow the retained part surfaces. A and B use X, Y and Z coordinates in inches from the workspace origin.";
export const dimensionEnds = ["a", "b"] as const;

function onRetainedSurface(piece: Piece, local: V3) {
  const stock = material(piece.material);
  if (piece.offcut || !stock.wood || stock.shape || (stock.stockKind !== "linear" && stock.stockKind !== "sheet")) return false;
  let positions: number[];
  try {
    const openings = pieceThroughOpenings(piece);
    ({ positions } = openings.length ? throughOpeningTriangles(piece.size, openings)
      : triangulateSolid(clipBox(piece.size, piece.cutPlanes)));
  } catch {
    return false;
  }
  const point = new Vector3(...local);
  const closest = new Vector3();
  const triangle = new Triangle();
  for (let i = 0; i < positions.length; i += 9) {
    triangle.a.fromArray(positions, i);
    triangle.b.fromArray(positions, i + 3);
    triangle.c.fromArray(positions, i + 6);
    if (triangle.getArea() > 0 && triangle.closestPointToPoint(point, closest).distanceToSquared(point) < 1e-6)
      return true;
  }
  return false;
}

export function canLinkDimensionPoint(project: Project, anchor: WorkspaceDimensionAnchor) {
  const piece = project.pieces.find(({ id }) => id === anchor.pieceId);
  return !!piece && onRetainedSurface(piece, anchor.local);
}

export function resolveWorkspaceDimension(
  project: Project,
  input: { a: V3 | null; b: V3 | null; anchors?: WorkspaceDimension["anchors"] },
) {
  const result = { a: input.a, b: input.b, issues: [] as string[] };
  for (const end of dimensionEnds) {
    const anchor = input.anchors?.[end];
    if (!anchor) continue;
    const piece = project.pieces.find(({ id }) => id === anchor.pieceId);
    if (piece && onRetainedSurface(piece, anchor.local))
      result[end] = rotate(anchor.local, piece.rotation).map((value, axis) => value + piece.position[axis]) as V3;
    else {
      result[end] = null;
      result.issues.push(`Point ${end.toUpperCase()} needs a new pick. The saved surface on ${partLabel(project, anchor.pieceId)} is unavailable.`);
    }
  }
  return result;
}

function workspaceDimensionCoordinates({ a, b }: Pick<WorkspaceDimension, "a" | "b">) {
  const point = (value: V3) => "(" + value.map((n) => Number(n.toFixed(5))).join(", ") + ")";
  return `A ${point(a)} · B ${point(b)}`;
}

export function workspaceDimensionSummary(project: Project, mark: WorkspaceDimension) {
  const { a, b, issues } = resolveWorkspaceDimension(project, mark);
  if (!a || !b) return { distance: null, length: null, detail: issues.join(" ") };
  const { distance } = measureBetween(a, b);
  const linked = dimensionEnds.flatMap((end) => {
    const anchor = mark.anchors?.[end];
    return anchor ? [`${end.toUpperCase()} follows ${partLabel(project, anchor.pieceId)}`] : [];
  });
  return {
    distance,
    length: formatStockLength(distance),
    detail: [workspaceDimensionCoordinates({ a, b }), ...linked].join(" · "),
  };
}

export function workspaceDimensionForCut(project: Project, id: string) {
  const mark = project.workspaceDimensions?.find((entry) => entry.id === id);
  if (!mark) throw Error("Choose a current saved dimension.");
  const { a, b, issues } = resolveWorkspaceDimension(project, mark);
  if (!a || !b) throw Error(issues.join(" "));
  const { distance } = measureBetween(a, b);
  if (distance < 0.125) throw Error("The saved dimension must be at least ⅛ in for a lumber cut.");
  return { id, name: mark.name, length: distance, a, b };
}

export function workspaceDimensionsMarkdown(project: Project) {
  const marks = project.workspaceDimensions ?? [];
  if (!marks.length) return "";
  const escape = (value: string) => value.replace(/[\\\x60*_{}\[\]<>|]/g, "\\$&");
  return [
    `## ${workspaceDimensionsTitle}`, "", workspaceDimensionsScope, "",
    ...marks.map((mark) => {
      const { length, detail } = workspaceDimensionSummary(project, mark);
      return `- ${escape(mark.name)} · ${length ?? "Review points"} · ${detail}`;
    }),
    "", "",
  ].join("\n");
}
