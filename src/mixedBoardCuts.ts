import { inspectCutStock, pieceCutKerf, plannedCutKerf } from "./cutStock";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { material, type Material, type MaterialId, type Piece, type Project } from "./model";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { stockSplitState } from "./packing";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { ensurePartLabels } from "./partLabels";

export const maxMixedBoardCuts = 12;
export const maxComparedOffcuts = 32;

type OffcutSource = {
  id: string;
  label: string;
  axis: Piece["stockLengthAxis"];
  pending: boolean;
};

type AvailableOffcut = {
  stock: MaterialId;
  length: number;
  kerf: number;
  source: OffcutSource;
  fits: Set<number>;
  canSplitAgain: boolean;
  onHand: boolean;
};

export function findBoardCutListOffcuts(
  project: Project,
  group: MaterialGroup,
  lengths: readonly number[],
  labels?: readonly string[],
) {
  const labeled = ensurePartLabels(project);
  const partLabels = new Map(labeled.partLabels.map(({ partId, label }) => [partId, label]));
  const wanted = labels?.length ? new Set(labels) : undefined;
  const inspection = inspectCutStock(labeled);
  const family = materialFamilyVariants(group.preferred);
  const matches = new Map<string, AvailableOffcut>();
  for (const length of new Set(lengths)) {
    for (const { piece, available, desired, stockLengthAxis, sourceCutPending, onHand }
      of fittingBoardOffcuts(labeled, family, length, inspection)) {
      const label = partLabels.get(piece.id);
      if (!label || (wanted && !wanted.has(label)) || Math.abs(available[1] - desired[1]) > 1e-7) continue;
      const previous = matches.get(label);
      if (previous) {
        if (stockLengthAxis === previous.source.axis) previous.fits.add(length);
      } else {
        matches.set(label, {
          stock: piece.material,
          length: available[2],
          kerf: pieceCutKerf(piece),
          source: { id: piece.id, label, axis: stockLengthAxis, pending: sourceCutPending },
          fits: new Set([length]),
          canSplitAgain: !!piece.cutStock?.sourceAxes,
          onHand,
        });
      }
    }
  }
  return matches;
}

export type BoardCutPlan = {
  boards: {
    stock: MaterialId;
    length: number;
    kerf: number;
    cuts: number[];
    offcut: number;
    source?: OffcutSource;
  }[];
  purchaseLength: number;
};

type Board = BoardCutPlan["boards"][number];

export function mixedBoardStockOptions(project: Project, group: MaterialGroup) {
  const { options } = materialPlacementOptions(group);
  if (project.retailer !== "home-depot") return options;
  const sizeOf = (stock: Material) => [...(stock.stockSize ?? stock.size)].sort((a, b) => a - b);
  return options.map((option) => {
    const generic = material(option.id);
    if (generic.productReference || project.woodKerfs?.[option.id] !== undefined ||
        project.pieces.some(({ material }) => material === option.id) ||
        project.inventory.some(({ material }) => material === option.id)) return option;
    const dimensions = sizeOf(generic);
    const exact = group.variants.find((stock) =>
      stock.wood && stock.cuttable && stock.stockKind === "linear" &&
      sizeOf(stock).every((value, index) => Math.abs(value - dimensions[index]) <= 0.001) &&
      reviewedOfferForMaterial(stock, "home-depot"));
    return exact ? { ...option, id: exact.id, value: sizeOf(exact)[2] } : option;
  });
}

export function planMixedBoardCuts(
  project: Project,
  options: readonly { id: MaterialId; value: number }[],
  lengths: readonly number[],
  offcuts: readonly AvailableOffcut[] = [],
  useEveryOffcut = false,
): BoardCutPlan | null {
  if (!lengths.length || lengths.length > maxMixedBoardCuts ||
      lengths.some((length) => !Number.isFinite(length) || length < 0.125)) return null;
  const stock = options.map(({ id, value }) => ({
    stock: id,
    length: value,
    kerf: plannedCutKerf(project, id),
  })).sort((a, b) => a.length - b.length || a.kerf - b.kerf);
  const limit = 1 << lengths.length;

  const subsets = Array.from({ length: limit }, (_, mask) => {
    const cuts = lengths.filter((_, index) => mask & (1 << index));
    return { cuts, combined: cuts.reduce((total, length) => total + length, 0) };
  });
  function layout(mask: number, option: Pick<Board, "stock" | "length" | "kerf">): Board | undefined {
    const { cuts, combined } = subsets[mask];
    // Every two pieces need a blade pass between them. The last piece can
    // end at the edge, use a final blade-width tail, or leave a remnant.
    const available = option.length - (cuts.length - 1) * option.kerf;
    const end = stockSplitState(available, combined, option.kerf);
    if (end === "whole" || end === "cut") return {
      ...option,
      cuts,
      offcut: end === "whole" ? 0 : Math.max(0, available - combined - option.kerf),
    };
  }
  const candidate = subsets.map((_, mask) => {
    if (!mask) return;
    for (const option of stock) {
      const board = layout(mask, option);
      if (board) return board;
    }
  });

  type Score = { purchaseLength: number; boards: number; scrap: number; chosen: number };
  const best: (Score | undefined)[] = Array(limit);
  best[0] = { purchaseLength: 0, boards: 0, scrap: 0, chosen: 0 };
  for (let mask = 1; mask < limit; mask++) {
    const anchor = mask & -mask;
    for (let group = mask; group; group = (group - 1) & mask) {
      if (!(group & anchor)) continue;
      const board = candidate[group];
      const rest = best[mask ^ group];
      if (!board || !rest) continue;
      const purchaseLength = rest.purchaseLength + board.length;
      const boards = rest.boards + 1;
      const scrap = rest.scrap + board.offcut ** 2;
      const current = best[mask];
      // Prefer fewer purchases and concentrate leftover length when total
      // stock length is tied.
      if (!current || purchaseLength < current.purchaseLength ||
          (purchaseLength === current.purchaseLength && (boards < current.boards ||
            (boards === current.boards && scrap > current.scrap)))) {
        best[mask] = { purchaseLength, boards, scrap, chosen: group };
      }
    }
  }

  type OffcutAllocation = { board: Board; preceding?: OffcutAllocation };
  type Reuse = {
    purchase: Score;
    newMask: number;
    reusedLength: number;
    choice?: OffcutAllocation;
  };
  // Start with the best new-stock plan for each subset, then consider each
  // physical offcut once. Each transition uses disjoint finished pieces.
  let allocations: (Reuse | undefined)[] = best.map((purchase, newMask) =>
    purchase && { purchase, newMask, reusedLength: 0 });
  const fullMask = limit - 1;
  for (const { source, stock, length, kerf, fits, canSplitAgain } of offcuts) {
    if (!useEveryOffcut && allocations[fullMask]?.purchase.purchaseLength === 0) break;
    const patterns = subsets.map(({ cuts }, mask) =>
      mask && (canSplitAgain || cuts.length === 1) && cuts.every((cut) => fits.has(cut))
        ? layout(mask, { stock, length, kerf })
        : undefined);
    const next: (Reuse | undefined)[] = useEveryOffcut ? Array(limit) : [...allocations];
    for (let mask = 1; mask < limit; mask++) {
      let choice = next[mask];
      for (let group = mask & -mask; group; group = (group - mask) & mask) {
        const board = patterns[group];
        const rest = allocations[mask ^ group];
        if (!board || !rest) continue;
        const { purchase } = rest;
        const reusedLength = rest.reusedLength + subsets[group].combined;
        if (choice && (purchase.purchaseLength > choice.purchase.purchaseLength ||
            (purchase.purchaseLength === choice.purchase.purchaseLength &&
              (purchase.boards > choice.purchase.boards ||
                (purchase.boards === choice.purchase.boards && reusedLength <= choice.reusedLength))))) continue;
        choice = { purchase, newMask: rest.newMask, reusedLength,
          choice: { board: { ...board, source }, preceding: rest.choice } };
      }
      next[mask] = choice;
    }
    allocations = next;
  }

  const total = allocations[fullMask];
  if (!total) return null;
  const boards: Board[] = [];
  for (let choice = total.choice; choice; choice = choice.preceding) boards.push(choice.board);
  boards.reverse();
  for (let mask = total.newMask; mask;) {
    const { chosen } = best[mask]!;
    boards.push(candidate[chosen]!);
    mask ^= chosen;
  }
  return { boards, purchaseLength: total.purchase.purchaseLength };
}
