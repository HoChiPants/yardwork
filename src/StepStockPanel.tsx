import { stepStockSummary, stepStockTitle, type StepStockRow } from "./stepStockPreparation";

export function StepStockPanel({ rows, onInspect, onOpenOffcutCuts }: {
  rows?: readonly StepStockRow[];
  onInspect?: (partId: string) => void;
  onOpenOffcutCuts?: (operations: readonly number[]) => void;
}) {
  if (!rows?.length) return null;
  const list = <ul className="step-stock-rows">
    {rows.map((row) => (
      <li key={row.id}>
        <strong>{row.title}</strong>
        <p className="small-note">{row.detail}</p>
        <p>{stepStockSummary(row)}.</p>
        {row.keepOffcuts.map((note) => <p key={note} className="small-note">{note}</p>)}
        {row.issues.map((issue) => <p key={issue} className="small-note">Review · {issue}</p>)}
        {onInspect && <button className="text-button" type="button" aria-label={`Open stock plan for ${row.labels[0]}`}
          onClick={() => onInspect(row.partId)}>Open stock plan</button>}
        {onOpenOffcutCuts && !!row.offcutOperations.length && <button className="text-button" type="button"
          aria-label={`Open offcut cuts for ${row.labels.join(", ")}`} onClick={() => onOpenOffcutCuts(row.offcutOperations)}>
          Open offcut cuts
        </button>}
      </li>
    ))}
  </ul>;
  return onInspect ? <details className="field-section" aria-label={stepStockTitle}>
    <summary>{stepStockTitle} ({rows.length})</summary>
    {list}
  </details> : <section>
    <h3>{stepStockTitle}</h3>
    {list}
  </section>;
}
