import { setCutSourceOnHand } from "./cutStock";
import { formatPreciseInches } from "./measurement";
import { isPexPipe } from "./wallWaterReference";
import { isDrywall } from "./drywallReference";
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
    (stock.wood || isDrywall(stock.id) || isPexPipe(stock.id)) &&
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
  if (!stock) throw Error("Choose cuttable wood, drywall or straight PEX pipe.");
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
  const pipe = isPexPipe(materialId);
  if (isDrywall(materialId) && Math.abs(thickness - limits[2]) > 0.000001)
    throw Error("Choose the exact drywall thickness and measure the sheet width and length.");
  if (pipe && (Math.abs(width - limits[1]) > 0.000001 || Math.abs(thickness - limits[2]) > 0.000001))
    throw Error("Choose the exact pipe stock diameter and measure only its length.");
  const size: V3 = pipe ? [width, length, thickness] : [width, thickness, length];
  const name = `Offcut · ${label.trim() || stock.name}`.slice(0, 120);
  const offcut = part(
    name,
    materialId,
    size,
    [0, (pipe ? length : thickness) / 2, 0],
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
        stockLengthAxis: pipe ? 1 as const : 2 as const,
        cutStock: {
          id: sourceId,
          ...(!pipe && { sourceAxes: [1, 0, 2] as [1, 0, 2] }),
          size: [...size] as V3,
          offset: [0, 0, 0] as V3,
        },
      },
    ],
  };
  return setCutSourceOnHand(next, sourceId, true);
}
