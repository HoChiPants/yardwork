import type { Piece, V3 } from "./model";
import type { sillPlateFootprint } from "./sillGaskets";
import { rotate } from "./spatial";
import { openingAxes, openingHalfSpans, pieceThroughOpenings } from "./throughOpenings";

export const plateSeamOpeningIssue = "A plate cutout interrupts the bead. Review the wood backing and penetration seal.";

/** Intersect through-cuts with the bead band on one long face of a horizontal plate. */
export function plateSeamOpeningRuns(
  plate: Piece,
  footprint: NonNullable<ReturnType<typeof sillPlateFootprint>>,
  side: -1 | 1,
  heightBand: readonly [number, number],
) {
  const openings = pieceThroughOpenings(plate);
  if (!openings.length) return [];
  const { lengthAxis, widthAxis, boreAxis, width, length } = footprint;
  const up = rotate([0, 1, 2].map((axis) => Number(axis === boreAxis)) as V3, plate.rotation)[1];
  const face = side * width / 2;
  const [bandLow, bandHigh] = up > 0 ? heightBand : [-heightBand[1], -heightBand[0]];
  const low = Math.max(-plate.size[boreAxis] / 2, bandLow);
  const high = Math.min(plate.size[boreAxis] / 2, bandHigh);
  const epsilon = 0.001;

  return openings.flatMap((opening) => {
    const axes = openingAxes(opening.axis);
    const half = openingHalfSpans(opening);
    const runIndex = axes.indexOf(lengthAxis);
    const offsets = axes.map((axis, index) => {
      const center = opening.center[index];
      if (axis === widthAxis) return Math.abs(face - center);
      if (axis === boreAxis) return Math.max(0, low - center, center - high);
      return 0;
    });
    const radiusSquared = half[0] ** 2 - offsets[0] ** 2 - offsets[1] ** 2;
    if ("diameter" in opening ? radiusSquared <= 0 : offsets.some((distance, i) => distance > half[i] + epsilon))
      return [];
    if (runIndex === -1) return [{ start: 0, end: length }];
    const reach = "diameter" in opening ? Math.sqrt(radiusSquared) : half[runIndex];
    const center = length / 2 + opening.center[runIndex];
    const start = Math.max(0, center - reach), end = Math.min(length, center + reach);
    return end - start > epsilon ? [{ start, end }] : [];
  });
}
