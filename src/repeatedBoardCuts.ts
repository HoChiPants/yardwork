import { plannedCutKerf } from "./cutStock";
import type { MaterialId, Project } from "./model";
import { stockSplitState } from "./packing";

export const maxRepeatedBoards = 24;

export function repeatedBoardCuts(stock: number, length: number, quantity: number, kerf: number) {
  if (![stock, length, kerf].every(Number.isFinite) || length < 0.125 || kerf < 0 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > maxRepeatedBoards) return null;
  const first = stockSplitState(stock, length, kerf);
  if (first !== "whole" && first !== "cut") return null;

  const boards: { count: number; remaining: number }[] = [];
  let remaining = quantity;
  // Identical crosscuts make the maximum feasible prefix the same on every board.
  while (remaining > 0) {
    const board = { count: 0, remaining: stock };
    for (let index = 0; index < remaining; index++) {
      const state = stockSplitState(board.remaining, length, kerf);
      if (state !== "whole" && state !== "cut") break;
      board.count++;
      board.remaining = state === "whole" ? 0 : Math.max(board.remaining - length - kerf, 0);
    }
    boards.push(board);
    remaining -= board.count;
  }
  return { boards, purchaseLength: boards.length * stock };
}

export function compareRepeatedBoardCuts<T extends { id: MaterialId; value: number }>(
  project: Project,
  options: readonly T[],
  length: number,
  quantity: number,
) {
  return options.flatMap((option) => {
    const cut = repeatedBoardCuts(option.value, length, quantity, plannedCutKerf(project, option.id));
    return cut ? [{ ...option, ...cut }] : [];
  }).sort((a, b) => a.purchaseLength - b.purchaseLength || a.boards.length - b.boards.length || a.value - b.value);
}
