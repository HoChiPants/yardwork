import { formatStockLength } from "./measurement";
import type { BoardCutPlan } from "./mixedBoardCuts";

export function BoardCutListReview({ name, plan, onApply }: {
  name: string;
  plan: BoardCutPlan;
  onApply: () => void;
}) {
  const partCount = plan.boards.reduce((total, { cuts }) => total + cuts.length, 0);
  return <>
    <h2 id="modal-title">Review lumber cut list</h2>
    <p>{name} · {formatStockLength(plan.purchaseLength)} total stock</p>
    <ol className="board-cut-review" aria-label="Stock cut order">
      {plan.boards.map(({ length, cuts, kerf, offcut }, index) => (
        <li key={index}>
          <strong>{formatStockLength(length)} board</strong>
          <p>{cuts.map(formatStockLength).join(" + ")}</p>
          <small>{formatStockLength(kerf)} blade allowance
            {offcut > 1e-8 && ` · ${formatStockLength(offcut)} offcut`}</small>
        </li>
      ))}
    </ol>
    <button type="button" className="button primary" onClick={onApply}>
      Plan and place {partCount} {partCount === 1 ? "piece" : "pieces"}
    </button>
  </>;
}
