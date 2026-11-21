import { formatStockLength } from "./measurement";
import { material, type Project } from "./model";
import { OffcutReusePlanDetails } from "./OffcutReuseReview";
import type { previewProposalStock } from "./proposalStock";
import { purchaseUnitLabel } from "./purchaseUnits";
import { SequenceBody, MaterialCutNote } from "./StockCutSequenceList";
import { stockCutSequenceContext } from "./stockCutSequence";
import { partLabel } from "./partLabels";

export function ProposalStockReview({
  project, open, setOpen, offcuts, setOffcuts, review, error,
}: {
  project: Project;
  open: boolean;
  setOpen: (open: boolean) => void;
  offcuts: readonly string[] | null;
  setOffcuts: (labels: string[] | null) => void;
  review: ReturnType<typeof previewProposalStock> | undefined;
  error: string | undefined;
}) {
  const hasOffcuts = project.pieces.some(({ offcut }) => offcut);
  return (
    <details className="field-section proposal-stock" open={open} onToggle={(event) => {
      setOpen(event.currentTarget.open);
    }}>
      <summary>Cuts and stock</summary>
      {open && (
        <section aria-label="Proposal cuts and stock">
          {hasOffcuts || offcuts !== null ? (
            <>
              <label className="checkbox-field">
                <input type="checkbox" checked={offcuts !== null}
                  onChange={(e) => setOffcuts(e.target.checked ? [] : null)}
                  disabled={!hasOffcuts && offcuts === null} />
                Use matching scraps for the new parts
              </label>
              {!!offcuts?.length && (
                <p className="small-note">
                  Using {offcuts.join(", ")}.
                  {" "}<button type="button" className="text-button" onClick={() => setOffcuts([])}>
                    Use the whole Cut pool
                  </button>
                </p>
              )}
            </>
          ) : <p className="small-note">Add measured scraps to the Cut pool to check them against a proposal.</p>}
          {error && <p role="alert" className="form-error">{error}</p>}
          {review && (
            <>
              {!review.newPartCount ? (
                <p className="small-note">This change has no new cuttable parts.</p>
              ) : (
                <>
                  {review.plan && <OffcutReusePlanDetails plan={review.plan} />}
                  <p className="small-note">{stockCutSequenceContext} Shared stock units may include cuts for other parts in the project.</p>
                  {review.materials.map(({ row, sequences, oversized }) => (
                    <section key={row.id} className="field-section" aria-label={material(row.id).name}>
                      <h4>
                        {material(row.id).name} · {row.quantity} {purchaseUnitLabel(material(row.id).unit, row.quantity)} to buy for the project
                      </h4>
                      <MaterialCutNote id={row.id} />
                      {oversized.map((part) => (
                        <p className="form-error" key={part.id}>
                          {partLabel(review.project, part.id)} · {part.name} exceeds the selected stock at {part.size.map(formatStockLength).join(" × ")}.
                        </p>
                      ))}
                      {sequences.map((sequence) => (
                        <details key={sequence.title}>
                          <summary>{sequence.title} · {sequence.source}</summary>
                          <SequenceBody sequence={sequence} />
                        </details>
                      ))}
                    </section>
                  ))}
                </>
              )}
            </>
          )}
        </section>
      )}
    </details>
  );
}
