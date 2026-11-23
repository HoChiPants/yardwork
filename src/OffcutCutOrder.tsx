import {
  offcutCutOrderScope,
  offcutCutCompletion,
  offcutCutOrderTitle,
  type OffcutCutRow,
} from "./offcutCutGuide";

export function OffcutCutOrder({
  rows,
  cutIds,
  onShowAll,
  onComplete,
  onReview,
  unavailable = [],
}: {
  rows: readonly OffcutCutRow[];
  cutIds?: ReadonlySet<string>;
  onShowAll?: () => void;
  onComplete?: (id: string) => void;
  onReview?: (id: string) => void;
  unavailable?: readonly string[];
}) {
  if (!rows.length && !onShowAll && !unavailable.length) return null;
  const visible = rows.map((row, index) => ({ row, number: index + 1 }))
    .filter(({ row }) => !cutIds || cutIds.has(row.id));
  const content = (
    <>
      <h2 id={onShowAll ? "modal-title" : undefined}>{offcutCutOrderTitle}</h2>
      {!!visible.length && <p>{offcutCutOrderScope}</p>}
      {cutIds && onShowAll && <button type="button" className="text-button" onClick={onShowAll}>Show all offcut cuts</button>}
      {!visible.length && <p>No recorded offcut operations are available here.</p>}
      {!!visible.length && <ol className="offcut-cut-order-rows" aria-label={onShowAll ? "Offcut operations" : undefined}>
        {visible.map(({ row, number }) => (
          <li key={row.id} value={number}>
            <strong>{row.title}</strong>
            {row.issues.length ? (
              <p>
                <strong>Review needed.</strong> {row.issues.join(" ")}
              </p>
            ) : (
              <>
                <p>
                  Starting size {row.inputSize}
                  {row.prior ? ` · remnant from ${rows[row.prior - 1].measurement ? "measurement" : "cut"} ${row.prior}` : row.preparedBy ? ` · blank from cut ${row.preparedBy}` : ""}.
                </p>
                {row.waitForStockCuts && <p>
                  Complete the source stock cut order before using this blank.
                  {row.sourceOrderLabel && ` Find ${row.sourceOrderLabel} under Planned stock cuts.`}
                </p>}
                {row.recordedSourceLabel && <p>Original stock order · {row.recordedSourceLabel} under Recorded stock cuts.</p>}
                {row.recoveredOpening && <p>{row.recoveredOpening}</p>}
                <p>
                  {row.measurement ?? (row.cuts.length ? row.cuts.join(" · ") + "." : "Fits as measured.")}
                </p>
                {row.cuttingLoss && <p>{row.cuttingLoss}</p>}
                {offcutCutCompletion(row) && <p>{offcutCutCompletion(row)}</p>}
                {row.remnants.length > 0 && (
                  <p>Keep {row.remnants.join(" and ")}.</p>
                )}
                {!!row.unavailableRemnants.length && <p>Unavailable remnant · {row.unavailableRemnants.join(", ")}.</p>}
                {row.remnantHandoffs.map((note) => <p key={note}>{note}</p>)}
                {onComplete && !!row.cuts.length && !row.completedAt &&
                  row.prerequisite === undefined && !row.sourceCutsPending && <button
                    type="button" className="button secondary" onClick={() => onComplete(row.id)}>
                    Mark cuts complete
                  </button>}
              </>
            )}
            {onReview && row.pendingAssignment && <button type="button" className="text-button" onClick={() => onReview(row.id)}>
              Review starting offcut
            </button>}
          </li>
        ))}
      </ol>}
      {!!unavailable.length && !cutIds && <>
        <h3>Unavailable offcuts</h3>
        <ul aria-label="Unavailable offcuts">{unavailable.map((line) => <li key={line}>{line}</li>)}</ul>
      </>}
    </>
  );
  return onShowAll ? content : <section className="offcut-cut-order-print">{content}</section>;
}
