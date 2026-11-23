import { useMemo, useState } from "react";
import { formatStockLength } from "./measurement";
import type { MaterialId, Project } from "./model";
import { partLabel } from "./partLabels";
import { previewRoofDeckBlockingPlan, roofDeckBlockingBays, roofDeckBlockingReference, roofDeckBlockingScope,
  roofDeckBlockingStocks, type RoofDeckBlockingPreview } from "./roofDeckBlocking";
import { orientedStockSize } from "./stockAxes";

const allBays = "all-bays";

export function RoofDeckBlockingPanel({ project, jointId, preview, onPreview, onAdd }: {
  project: Project;
  jointId: string;
  preview: RoofDeckBlockingPreview | null;
  onPreview: (preview: RoofDeckBlockingPreview | null) => void;
  onAdd: (preview: RoofDeckBlockingPreview, reviewJoints: boolean) => void;
}) {
  const bays = useMemo(() => roofDeckBlockingBays(project, jointId), [project, jointId]);
  const [options, setOptions] = useState<{ bay: string; stock: MaterialId; reuse: boolean }>({
    bay: bays[0]?.id ?? "", stock: "stud", reuse: true,
  });
  const [error, setError] = useState("");
  const active = preview ? {
    bay: preview.bayIds.length > 1 ? allBays : preview.bayIds[0],
    stock: preview.stockId, reuse: preview.reuse,
  } : options;
  const { bay, stock, reuse } = active;
  const currentBay = (bay === allBays && bays.length > 1) || bays.some(({ id }) => id === bay) ? bay : bays[0]?.id ?? "";
  function updateOptions(change: Partial<typeof options>) {
    setOptions({ ...active, ...change });
    onPreview(null);
    setError("");
  }
  function checkFit() {
    try {
      setError("");
      const bayIds = currentBay === allBays ? bays.map(({ id }) => id) : [currentBay];
      onPreview(previewRoofDeckBlockingPlan(project, jointId, bayIds, stock, reuse));
    } catch (problem) {
      onPreview(null);
      setError(problem instanceof Error ? problem.message : "Review the roof blocking fit.");
    }
  }
  return <section id="roof-deck-blocking-fit" className="field-section" aria-label="Fit roof deck blocking">
    <h3>Fit roof deck blocking</h3>
    {!bays.length ? <p className="small-note">
      A shared block needs two facing stationary framing members seated against both panels’ underside plane.
    </p> : <>
      <label className="field">Framing bay
        <select value={currentBay} onChange={(event) => updateOptions({ bay: event.target.value })}>
          {bays.map(({ id, left, right, length }) => <option key={id} value={id}>
            {partLabel(project, left.piece.id)} to {partLabel(project, right.piece.id)} · {formatStockLength(length)}
          </option>)}
          {bays.length > 1 && <option value={allBays}>All {bays.length} framing bays</option>}
        </select>
      </label>
      <label className="field">Blocking stock
        <select value={stock} onChange={(event) => updateOptions({ stock: event.target.value as MaterialId })}>
          {roofDeckBlockingStocks.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={reuse} onChange={(event) => updateOptions({ reuse: event.target.checked })} />
        Use matching on-hand offcuts
      </label>
      <button type="button" className="button secondary" onClick={checkFit}>Preview roof blocking</button>
    </>}
    <p className="small-note">{roofDeckBlockingScope} <a href={roofDeckBlockingReference} target="_blank" rel="noreferrer">Weyerhaeuser blocking detail</a></p>
    {!preview && error && <p role="alert" className="form-error">{error}</p>}
    {preview && <section aria-label="Roof blocking preview" aria-live="polite">
      {currentBay === allBays && <p>
        {preview.fits.length} of {bays.length} bays ready · {preview.newBoards} new {preview.newBoards === 1 ? "board" : "boards"} · {preview.onHandOffcuts} on-hand {preview.onHandOffcuts === 1 ? "offcut" : "offcuts"}
      </p>}
      {preview.fits.map((fit) => <div key={fit.bayId}>
        <p>Fit {formatStockLength(fit.cutLength)} between {fit.rafters.map((id) => partLabel(project, id)).join(" and ")}.</p>
        <p>{fit.source ? `Use ${partLabel(preview.project, fit.source.id)} from ${fit.fromPlan ? "the preceding cuts" : "the Cut pool"}.`
          : `Start with ${formatStockLength(fit.sourceLength)} stock.`} {fit.operations.join(" · ") || "Fits as measured."}</p>
        <p>Adds {fit.reduction.map(formatStockLength).join(" and ")} of contact along the two fastener lines.</p>
      </div>)}
      {!!preview.offcuts.length && <p>Keep {preview.offcuts.map((piece) =>
        `${partLabel(preview.project, piece.id)} · ${formatStockLength(orientedStockSize(piece)[2])}`).join(" and ")}.</p>}
      {preview.skipped.map(({ bayId, rafters, reason }) => <p key={bayId} className="form-error">
        {rafters.map((id) => partLabel(project, id)).join(" to ")} skipped. {reason}
      </p>)}
      {!!preview.fits.length && <div className="button-row">
        <button type="button" className="button primary" onClick={() => onAdd(preview, false)}>
          {preview.skipped.length ? "Add fitted roof blocking" : "Add roof blocking"}
        </button>
        <button type="button" className="button secondary" onClick={() => onAdd(preview, true)}>Add and review connections</button>
      </div>}
    </section>}
  </section>;
}
