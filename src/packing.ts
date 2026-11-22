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

export function stockSplitState(available: number, keep: number, kerf: number) {
  const remaining = available - keep;
  if (Math.abs(remaining) <= EPS) return "whole";
  if (remaining < 0) return "too-long";
  return remaining < kerf - EPS ? "thin-trim" : "cut";
}

/** A full blade pass can use the tail without leaving another piece. */
export function cutConsumesTail(available: number, keep: number, kerf: number) {
  const remainder = available - keep;
  return remainder > EPS && kerf > 0 && Math.abs(remainder - kerf) <= EPS;
}

type BoardBin = {
  remaining: number;
  cuts: { id: string; length: number; name: string }[];
};

/** Reassign cuts among the current unrecorded boards if both boards can still be cut. */
export function balanceBoardCutEnds(
  bins: BoardBin[],
  length: number,
  kerf: number,
) {
  const used = bins.map(({ cuts }) =>
    cuts.reduce((sum, cut) => sum + cut.length + kerf, 0),
  );
  const fits = (total: number) => {
    const end = stockSplitState(length + kerf, total, kerf);
    return end === "whole" || end === "cut";
  };

  for (const [sourceIndex, source] of bins.entries()) {
    if (fits(used[sourceIndex])) continue;
    let move:
      | { cut: number; target: number; swap: number | null; shift: number }
      | undefined;
    for (let cutIndex = source.cuts.length - 1; cutIndex >= 0; cutIndex--) {
      const amount = source.cuts[cutIndex].length + kerf;
      if (source.cuts.length > 1 && fits(used[sourceIndex] - amount)) {
        const target = used.findIndex(
          (total, index) => index !== sourceIndex && fits(total + amount),
        );
        if (target !== -1) {
          move = { cut: cutIndex, target, swap: null, shift: amount };
          break;
        }
      }
    }
    if (!move) {
      for (const [target, board] of bins.entries()) {
        if (target === sourceIndex) continue;
        for (const [cut, outgoing] of source.cuts.entries()) {
          const swap = board.cuts.findIndex((incoming) => {
            const shift = outgoing.length - incoming.length;
            return (
              fits(used[sourceIndex] - shift) && fits(used[target] + shift)
            );
          });
          if (swap !== -1) {
            move = {
              cut,
              target,
              swap,
              shift: outgoing.length - board.cuts[swap].length,
            };
            break;
          }
        }
        if (move) break;
      }
    }
    if (!move) continue;
    const destination = bins[move.target];
    const outgoing = source.cuts[move.cut];
    if (move.swap === null) {
      source.cuts.splice(move.cut, 1);
      destination.cuts.push(outgoing);
    } else {
      source.cuts[move.cut] = destination.cuts[move.swap];
      destination.cuts[move.swap] = outgoing;
    }
    used[sourceIndex] -= move.shift;
    used[move.target] += move.shift;
    source.remaining = Math.max(0, length - used[sourceIndex]);
    destination.remaining = Math.max(0, length - used[move.target]);
  }
}

export function packRectangles(
  cuts: RectangleCut[],
  width: number,
  length: number,
  options: { kerf?: number; allowRotation?: boolean; checkEdgeCuts?: boolean } = {},
): { plans: StockPlan[]; rejected: RectangleCut[] } {
  const kerf = options.kerf ?? 0;
  if (!Number.isFinite(kerf) || kerf < 0)
    throw Error("Kerf must be a finite nonnegative number.");
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    width <= 0 ||
    length <= 0
  )
    throw Error("Stock dimensions must be positive finite numbers.");
  const fitsCut = (available: number, keep: number) => {
    if (!options.checkEdgeCuts) return keep <= available + EPS;
    const state = stockSplitState(available, keep, kerf);
    return state === "whole" || state === "cut";
  };
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
      ...(options.allowRotation === false
        ? []
        : [{ width: cut.length, length: cut.width, rotated: true }]),
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
            fitsCut(width - shelf.widthUsed, v.width) &&
            fitsCut(shelf.length, v.length),
        );
        if (variant) {
          roll.plan.placements.push({
            ...cut,
            ...variant,
            x: shelf.widthUsed,
            y: shelf.y,
          });
          shelf.widthUsed += variant.width + kerf;
          placed = true;
          break;
        }
      }
      if (placed) break;
      const variant = variants.find(
        (v) => fitsCut(length - roll.plan.usedLength - kerf, v.length) &&
          (!options.checkEdgeCuts || fitsCut(width, v.width)),
      );
      if (variant) {
        const y = roll.plan.usedLength + kerf;
        roll.shelves.push({
          x: 0,
          y,
          widthUsed: variant.width + kerf,
          length: variant.length,
        });
        roll.plan.placements.push({ ...cut, ...variant, x: 0, y });
        roll.plan.usedLength = y + variant.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const v = variants.find((variant) => fitsCut(width, variant.width) && fitsCut(length, variant.length));
      if (!v) {
        rejected.push(cut);
        continue;
      }
      rolls.push({
        plan: {
          width,
          length,
          placements: [{ ...cut, ...v, x: 0, y: 0 }],
          usedLength: v.length,
        },
        shelves: [{ x: 0, y: 0, widthUsed: v.width + kerf, length: v.length }],
      });
    }
  }
  return { plans: rolls.map((r) => r.plan), rejected };
}
