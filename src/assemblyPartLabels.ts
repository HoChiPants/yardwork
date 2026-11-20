import { clipBox, solidBounds } from "./cutProfiles";
import { formatStockLength } from "./measurement";
import { material, type Piece, type Project } from "./model";
import { ensurePartLabels } from "./partLabels";
import { stockAxes } from "./stockAxes";

function sizeText(piece: Piece) {
  const { length, width, thickness } = stockAxes(
    piece,
    piece.cutStock?.size ?? piece.size,
  );
  let size = piece.size;
  let caption = "";
  if (piece.cutPlanes.length) {
    try {
      const { min, max } = solidBounds(clipBox(piece.size, piece.cutPlanes));
      size = piece.size.map(
        (_, axis) => max[axis] - min[axis],
      ) as Piece["size"];
      caption = "Overall";
    } catch {
      caption = "Blank";
    }
  }
  const dimensions = [length, width, thickness]
    .map((axis) => formatStockLength(size[axis]))
    .join(" × ");
  return { dimensions, caption, profile: piece.cutPlanes.length > 0 };
}

export function assemblyPartLabels(project: Project) {
  const labels = new Map(
    ensurePartLabels(project).partLabels.map(({ partId, label }) => [
      partId,
      label,
    ]),
  );
  const steps = new Map(
    project.steps.map((step, index) => [
      step.id,
      { title: step.title, number: index + 1 },
    ]),
  );
  return project.pieces
    .flatMap((piece) => {
      const step = steps.get(piece.stepId);
      if (piece.offcut || !step) return [];
      return [
        {
          pieceId: piece.id,
          name: piece.name,
          label: labels.get(piece.id)!,
          stepId: piece.stepId,
          step,
          stock: material(piece.material).name,
          ...sizeText(piece),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.step.number - b.step.number ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
}

export type AssemblyPartLabel = ReturnType<typeof assemblyPartLabels>[number];

export function findAssemblyPartLabels(
  rows: readonly AssemblyPartLabel[],
  query: string,
) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const exact = rows.find((row) => row.label.toLowerCase() === term);
  if (exact) return [exact];
  return rows.filter(
    (row) =>
      row.label.toLowerCase().startsWith(term) ||
      row.name.toLowerCase().includes(term),
  );
}
