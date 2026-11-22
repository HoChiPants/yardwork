import { plannedCutKerf } from "./cutStock";
import { materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { material, type Material, type MaterialId, type Project } from "./model";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { stockSplitState } from "./packing";

export const maxMixedBoardCuts = 12;

export type BoardCutPlan = {
  boards: {
    stock: MaterialId;
    length: number;
    kerf: number;
    cuts: number[];
    offcut: number;
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
): BoardCutPlan | null {
  if (!lengths.length || lengths.length > maxMixedBoardCuts ||
      lengths.some((length) => !Number.isFinite(length) || length < 0.125)) return null;
  const stock = options.map(({ id, value }) => ({
    stock: id,
    length: value,
    kerf: plannedCutKerf(project, id),
  })).sort((a, b) => a.length - b.length || a.kerf - b.kerf);
  const limit = 1 << lengths.length;

  // A subset needs one blade allowance between pieces. The last piece
  // needs another only when it does not consume the available tail.
  const candidate: (Board | undefined)[] = Array(limit);
  for (let mask = 1; mask < limit; mask++) {
    const cuts = lengths.filter((_, index) => mask & (1 << index));
    const combined = cuts.reduce((total, length) => total + length, 0);
    for (const option of stock) {
      const available = option.length - (cuts.length - 1) * option.kerf;
      const end = stockSplitState(available, combined, option.kerf);
      if (end === "whole" || end === "cut") {
        candidate[mask] = {
          ...option,
          cuts,
          offcut: end === "whole" ? 0 : Math.max(0, available - combined - option.kerf),
        };
        break;
      }
    }
  }

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

  const total = best[limit - 1];
  if (!total) return null;
  const boards: Board[] = [];
  for (let mask = limit - 1; mask;) {
    const { chosen } = best[mask]!;
    boards.push(candidate[chosen]!);
    mask ^= chosen;
  }
  return { boards, purchaseLength: total.purchaseLength };
}
