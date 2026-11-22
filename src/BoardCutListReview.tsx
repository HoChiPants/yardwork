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
    <p>{name} · {plan.purchaseLength ? `${formatStockLength(plan.purchaseLength)} of new stock` : "No additional boards for these cuts"}</p>
    <ol className="board-cut-review" aria-label="Stock cut order">
      {plan.boards.map(({ length, cuts, kerf, offcut, source }, index) => (
        <li key={index}>
          <strong>{source ? `${source.label} · ${formatStockLength(length)} from Cut pool` : `${formatStockLength(length)} board`}</strong>
          <p>{cuts.map(formatStockLength).join(" + ")}</p>
          <small>{formatStockLength(kerf)} blade allowance
            {offcut > 1e-8 && ` · ${formatStockLength(offcut)} offcut`}</small>
          {source?.pending && <p className="small-note">Complete the source stock cut order first.</p>}
        </li>
      ))}
    </ol>
    <button type="button" className="button primary" onClick={onApply}>
      Plan and place {partCount} {partCount === 1 ? "piece" : "pieces"}
    </button>
  </>;
}
