/** A feasible rectangular layout, not a claim of globally minimal stock use. All dimensions are inches. */
export type RectangleCut = {
  id: string;
  name: string;
  width: number;
  length: number;
};
export type StockPlacement = RectangleCut & {
  x: number;
  y: number;
  rotated: boolean;
};
export type StockPlan = {
  width: number;
  length: number;
  placements: StockPlacement[];
  usedLength: number;
};
type Shelf = { x: number; y: number; widthUsed: number; length: number };
const EPS = 1e-8;
export function packRectangles(
  cuts: RectangleCut[],
  width: number,
  length: number,
): { plans: StockPlan[]; rejected: RectangleCut[] } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    width <= 0 ||
    length <= 0
  )
    throw Error("Stock dimensions must be positive finite numbers.");
  const rolls: { plan: StockPlan; shelves: Shelf[] }[] = [],
    rejected: RectangleCut[] = [];
  const ordered = [...cuts].sort(
    (a, b) =>
      Math.max(b.width, b.length) - Math.max(a.width, a.length) ||
      b.width * b.length - a.width * a.length,
  );
  for (const cut of ordered) {
    const variants = [
      { width: cut.width, length: cut.length, rotated: false },
      { width: cut.length, length: cut.width, rotated: true },
    ]
      .filter(
        (v) =>
          Number.isFinite(v.width) &&
          Number.isFinite(v.length) &&
          v.width > 0 &&
          v.length > 0 &&
          v.width <= width + EPS &&
          v.length <= length + EPS,
      )
      .sort((a, b) => a.length - b.length);
    if (!variants.length) {
      rejected.push(cut);
      continue;
    }
    let placed = false;
    for (const roll of rolls) {
      for (const shelf of roll.shelves) {
        const variant = variants.find(
          (v) =>
            v.width + shelf.widthUsed <= width + EPS &&
            v.length <= shelf.length + EPS,
        );
        if (variant) {
          roll.plan.placements.push({
            ...cut,
            ...variant,
            x: shelf.widthUsed,
            y: shelf.y,
          });
          shelf.widthUsed += variant.width;
          placed = true;
          break;
        }
      }
      if (placed) break;
      const variant = variants.find(
        (v) => roll.plan.usedLength + v.length <= length + EPS,
      );
      if (variant) {
        const y = roll.plan.usedLength;
        roll.shelves.push({
          x: 0,
          y,
          widthUsed: variant.width,
          length: variant.length,
        });
        roll.plan.placements.push({ ...cut, ...variant, x: 0, y });
        roll.plan.usedLength += variant.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const v = variants[0];
      rolls.push({
        plan: {
          width,
          length,
          placements: [{ ...cut, ...v, x: 0, y: 0 }],
          usedLength: v.length,
        },
        shelves: [{ x: 0, y: 0, widthUsed: v.width, length: v.length }],
      });
    }
  }
  return { plans: rolls.map((r) => r.plan), rejected };
}
