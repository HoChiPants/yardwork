import { formatStockLength } from "./measurement";
import { material, type Project } from "./model";
import { OffcutReusePlanDetails } from "./OffcutReuseReview";
import type { previewProposalStock, ProposalCutScope } from "./proposalStock";
import { purchaseUnitLabel } from "./purchaseUnits";
import { SequenceBody, MaterialCutNote } from "./StockCutSequenceList";
import { stockCutSequenceContext } from "./stockCutSequence";
import { partLabel } from "./partLabels";

type StockReview = ReturnType<typeof previewProposalStock>;

export function ProposalStockReview({
  project, open, setOpen, offcuts, setOffcuts, review, error, cutScope, setCutScope, selectedCutUnits,
}: {
  project: Project;
  open: boolean;
  setOpen: (open: boolean) => void;
  offcuts: readonly string[] | null;
  setOffcuts: (labels: string[] | null) => void;
  review: StockReview | undefined;
  error: string | undefined;
  cutScope: ProposalCutScope | null;
  setCutScope: (scope: ProposalCutScope | null) => void;
  selectedCutUnits: StockReview["recordable"];
}) {
  const hasOffcuts = project.pieces.some(({ offcut }) => offcut);
  const shared = review?.recordable.filter(({ existingPartIds }) => existingPartIds.length) ?? [];
  const exclusive = (review?.recordable.length ?? 0) - shared.length;
  const expectedOffcuts = selectedCutUnits.reduce((sum, { layout }) => sum + layout.leftovers.length, 0);
  return (
    <details className="field-section proposal-stock" open={open} onToggle={(event) => {
      setOpen(event.currentTarget.open);
    }}>
      <summary>Cuts and stock{selectedCutUnits.length > 0 && ` · ${selectedCutUnits.length} to save`}</summary>
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
          {review && (!!review.recordable.length || cutScope) && (
            <div className="field-section">
              <label className="field">
                Wood cut orders to save
                <select value={cutScope ?? ""} onChange={(event) => {
                  const value = event.target.value;
                  setCutScope(value === "proposal" || value === "shared" ? value : null);
                }}>
                  <option value="">Keep layouts flexible</option>
                  <option value="proposal" disabled={!exclusive}>Boards and sheets only for this design</option>
                  <option value="shared" disabled={!shared.length}>Include boards and sheets shared with existing parts</option>
                </select>
              </label>
              {!!selectedCutUnits.length && (
                <p className="small-note" role="status">
                  Save {selectedCutUnits.length} {selectedCutUnits.length === 1 ? "stock unit" : "stock units"} with this design.
                  {expectedOffcuts > 0 && ` Add ${expectedOffcuts} planned ${expectedOffcuts === 1 ? "offcut" : "offcuts"} to the Cut pool.`}
                </p>
              )}
              {cutScope && !selectedCutUnits.length && (
                <p className="small-note" role="status">
                  {shared.length ? "The available cut orders share stock with existing parts. Choose whether to include them."
                    : "This proposal has no wood stock units ready to save. Review the cuts or keep the layouts flexible."}
                </p>
              )}
              {cutScope === "shared" && shared.length > 0 && (
                <ul aria-label="Existing parts that will share stock with the proposal">
                  {shared.map(({ title, layout, existingPartIds }) => (
                    <li key={layout.kept[0].id}>
                      {material(layout.materialId).name} · {title} · {existingPartIds.map((id) =>
                        `${partLabel(review.project, id)} ${review.project.pieces.find((piece) => piece.id === id)?.name ?? ""}`).join(", ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
