import { isBatt, material, type Piece, type V3 } from "./model";
type Axis = 0 | 1 | 2;
type StockDimensions = Pick<Piece, "size" | "stockLengthAxis" | "material"> &
  Partial<Pick<Piece, "cutStock">>;
/** Stock length can be grain/flute direction even when the cut blank is wider than it is long. */
export function stockAxes(
  piece: StockDimensions,
  reference: V3 = piece.size,
  fallback: Axis | null = null,
) {
  const recorded = piece.cutStock?.sourceAxes;
  if (recorded) {
    const [thickness, width, length] = recorded;
    return { length, width, thickness };
  }
  const batt = isBatt(piece.material);
  const length =
    piece.stockLengthAxis ??
    fallback ??
    (batt
      ? 2
      : material(piece.material).shape === "tube-envelope"
        ? 1
        : (reference.indexOf(Math.max(...reference)) as Axis));
  const remaining = ([0, 1, 2] as Axis[])
    .filter((axis) => axis !== length)
    .sort((a, b) => reference[b] - reference[a]);
  if (batt) {
    const stockThickness = Math.min(...material(piece.material).size);
    const fullThickness = remaining.filter(
      (axis) => Math.abs(reference[axis] - stockThickness) < 0.001,
    );
    // Generated batts have local Z thickness; catalog-placed batts use Y.
    // Keep the same thickness axis after trimming a width smaller than it.
    const thickness =
      fullThickness.length === 1
        ? fullThickness[0]
        : length === 1
          ? 2
          : length === 2
            ? 1
            : remaining[1];
    return {
      length,
      width: remaining.find((axis) => axis !== thickness)!,
      thickness,
    };
  }
  return { length, width: remaining[0], thickness: remaining[1] };
}
export function orientedStockSize(
  piece: StockDimensions,
  fallback: Axis | null = null,
): V3 {
  const axes = stockAxes(piece, piece.size, fallback);
  return [
    piece.size[axes.thickness],
    piece.size[axes.width],
    piece.size[axes.length],
  ];
}
