import { inspectCutStock, pieceCutKerf, plannedCutKerf } from "./cutStock";
import { materialFamilyVariants, materialPlacementOptions, type MaterialGroup } from "./materialGroups";
import { material, type Material, type MaterialId, type Piece, type Project } from "./model";
import { reviewedOfferForMaterial } from "./retailerCatalog";
import { stockSplitState } from "./packing";
import { fittingBoardOffcuts } from "./offcutAssignment";
import { ensurePartLabels } from "./partLabels";

export const maxMixedBoardCuts = 12;

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
  fits: ReadonlySet<number>;
  canSplitAgain: boolean;
};

export function findBoardCutListOffcut(project: Project, group: MaterialGroup, label: string, lengths: readonly number[]): AvailableOffcut | null {
  const labeled = ensurePartLabels(project);
  const id = labeled.partLabels.find((entry) => entry.label === label)?.partId;
  if (!id) return null;
  const inspection = inspectCutStock(project);
  const family = materialFamilyVariants(group.preferred);
  const matches = [...new Set(lengths)].flatMap((length) =>
    fittingBoardOffcuts(project, family, length, inspection)
      .filter(({ piece, available, desired }) => piece.id === id && Math.abs(available[1] - desired[1]) <= 1e-7)
      .map((match) => ({ ...match, length })));
  const first = matches[0];
  if (!first) return null;
  return {
    stock: first.piece.material,
    length: first.available[2],
    kerf: pieceCutKerf(first.piece),
    source: { id: first.piece.id, label, axis: first.stockLengthAxis, pending: first.sourceCutPending },
    fits: new Set(matches.filter(({ stockLengthAxis }) => stockLengthAxis === first.stockLengthAxis).map(({ length }) => length)),
    canSplitAgain: !!first.piece.cutStock?.sourceAxes,
  };
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
  offcut?: AvailableOffcut,
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

  let unassigned = limit - 1;
  const boards: Board[] = [];
  if (offcut) {
    let chosen: Board | undefined;
    let chosenScore: Score | undefined;
    let reusedLength = 0;
    for (let group = 1; group < limit; group++) {
      const rest = best[(limit - 1) ^ group];
      if (!rest) continue;
      const cuts = lengths.filter((_, index) => group & (1 << index));
      if ((!offcut.canSplitAgain && cuts.length > 1) || cuts.some((length) => !offcut.fits.has(length))) continue;
      const sum = cuts.reduce((total, length) => total + length, 0);
      const tailBeforeFinalBlade = offcut.length - sum - (cuts.length - 1) * offcut.kerf;
      // Reusing a scrap requires an exact final blank or a real remaining
      // trim. A blade-width-only shave is outside fitted-offcut rules.
      const whole = Math.abs(tailBeforeFinalBlade) <= 1e-7;
      if (!whole && tailBeforeFinalBlade <= offcut.kerf + 1e-7) continue;
      if (chosenScore && (rest.purchaseLength > chosenScore.purchaseLength ||
          (rest.purchaseLength === chosenScore.purchaseLength && (rest.boards > chosenScore.boards ||
            (rest.boards === chosenScore.boards && sum <= reusedLength))))) continue;
      chosen = { stock: offcut.stock, length: offcut.length, kerf: offcut.kerf, cuts,
        offcut: whole ? 0 : tailBeforeFinalBlade - offcut.kerf, source: offcut.source };
      chosenScore = rest;
      reusedLength = sum;
      unassigned = (limit - 1) ^ group;
    }
    if (!chosen) return null;
    boards.push(chosen);
  }

  const total = best[unassigned];
  if (!total) return null;
  for (let mask = unassigned; mask;) {
    const { chosen } = best[mask]!;
    boards.push(candidate[chosen]!);
    mask ^= chosen;
  }
  return { boards, purchaseLength: total.purchaseLength };
}
