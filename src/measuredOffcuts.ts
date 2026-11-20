import { setCutSourceOnHand } from "./cutStock";
import { formatPreciseInches } from "./measurement";
import {
  catalog,
  part,
  uid,
  type Material,
  type MaterialId,
  type Project,
  type V3,
} from "./model";

export const measuredOffcutMaterials = catalog.filter(
  (stock) =>
    stock.wood &&
    stock.cuttable &&
    (stock.stockKind === "linear" || stock.stockKind === "sheet"),
);

export function measuredOffcutLimits(stock: Material): V3 {
  const [thickness, width, length] = [...(stock.stockSize ?? stock.size)].sort(
    (a, b) => a - b,
  );
  return [length, width, thickness];
}

export function addMeasuredOffcut(
  project: Project,
  stepId: string,
  materialId: MaterialId,
  dimensions: V3,
  label = "",
) {
  const stock = measuredOffcutMaterials.find(({ id }) => id === materialId);
  if (!stock) throw Error("Choose a cuttable wood board or panel.");
  if (!project.steps.some(({ id }) => id === stepId))
    throw Error("Choose a current build step.");
  const limits = measuredOffcutLimits(stock);
  const names = ["length", "width", "thickness"];
  const [length, width, thickness] = dimensions.map((value, index) => {
    if (!Number.isFinite(value) || value <= 0)
      throw Error(`Enter a positive measured ${names[index]}.`);
    const limit = limits[index];
    if (value > limit + 0.000001)
      throw Error(
        `The ${names[index]} exceeds ${formatPreciseInches(limit)}. Choose a stock size that matches this offcut.`,
      );
    return Math.min(value, limit);
  });
  const size: V3 = [width, thickness, length];
  const name = `Offcut · ${label.trim() || stock.name}`.slice(0, 120);
  const offcut = part(
    name,
    materialId,
    size,
    [0, thickness / 2, 0],
    stepId,
    "",
  );
  const sourceId = uid();
  const next = {
    ...project,
    pieces: [
      ...project.pieces,
      {
        ...offcut,
        offcut: true,
        stockLengthAxis: 2 as const,
        cutStock: {
          id: sourceId,
          sourceAxes: [1, 0, 2] as [1, 0, 2],
          size: [...size] as V3,
          offset: [0, 0, 0] as V3,
        },
      },
    ],
  };
  return setCutSourceOnHand(next, sourceId, true);
}
