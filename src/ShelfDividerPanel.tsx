import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { MaterialId, Project } from "./model";
import { partLabel } from "./partLabels";
import { previewShelfDivider, shelfDividerStocks, type ShelfDividerPlacement, type ShelfDividerPreview } from "./shelfDivider";
import type { shelfSagGeometry } from "./shelfSag";

export function ShelfDividerPanel({
  project, shelfId, material, geometry, preview, onPreview, onCommit,
}: {
  project: Project;
  shelfId: string;
  material: MaterialId;
  geometry: NonNullable<ReturnType<typeof shelfSagGeometry>>;
  preview: ShelfDividerPreview | null;
  onPreview: (fit: ShelfDividerPreview | null) => void;
  onCommit: (fit: ShelfDividerPreview) => void;
}) {
  const [stock, setStock] = useState(shelfDividerStocks.some(({ id }) => id === material) ? material : shelfDividerStocks[0].id);
  const [selectedBay, setSelectedBay] = useState<number>();
  const [offset, setOffset] = useState(NaN);
  const [reuse, setReuse] = useState(true);
  const [error, setError] = useState("");
  const bayIndex = selectedBay ?? geometry.spans.indexOf(geometry.longest);
  const bay = geometry.spans[bayIndex] ?? geometry.longest;
  function edit(fn: () => void) {
    setError("");
    onPreview(null);
    fn();
  }
  function previewFit(placement: ShelfDividerPlacement) {
    setError("");
    try {
      onPreview(previewShelfDivider(project, shelfId, stock, reuse, { ...placement, bayIndex: geometry.spans.indexOf(bay) }));
    } catch (problem) {
      onPreview(null);
      setError(problem instanceof Error ? problem.message : "Review the divider fit.");
    }
  }
  return <div className="field-section shelf-divider-options">
    <h3>Fit a shelf divider</h3>
    {geometry.spans.length > 1 && <label className="field">Support bay
      <select value={geometry.spans.indexOf(bay)} onChange={({ currentTarget }) => edit(() => setSelectedBay(Number(currentTarget.value)))}>
        {geometry.spans.map((span, index) => <option key={span.start} value={index}>
          Bay {index + 1} · {formatStockLength(span.length)}{span === geometry.longest ? " · longest" : ""}
        </option>)}
      </select>
    </label>}
    <label className="field">Divider sheet stock
      <select value={stock} onChange={({ currentTarget }) => edit(() => setStock(currentTarget.value as MaterialId))}>
        {shelfDividerStocks.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="checkbox-field">
      <input type="checkbox" checked={reuse} onChange={({ currentTarget }) => edit(() => setReuse(currentTarget.checked))} />
      Use a matching offcut when one fits
    </label>
    <button type="button" className="button secondary full" onClick={() => previewFit({ method: "find-clear" })}>Find a clear divider position</button>
    <details>
      <summary>Set a measured position</summary>
      <p className="small-note">This bay runs from {formatStockLength(bay.clearStart + geometry.width / 2)} to {formatStockLength(bay.clearEnd + geometry.width / 2)} from the shelf’s local start.</p>
      <LengthInput label="Divider center from shelf start" min={0} max={geometry.width} value={offset}
        onChange={(value) => edit(() => setOffset(value))} />
      <button type="button" className="button secondary full" disabled={!Number.isFinite(offset)}
        onClick={() => previewFit({ method: "measured", offset })}>Preview measured position</button>
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    {preview && <section className="section-description" aria-label="Shelf divider fit" aria-live="polite">
      <p><strong>{formatStockLength(preview.offset)} from the shelf’s local start</strong> to the divider center. Clear openings {formatStockLength(preview.openings[0])} and {formatStockLength(preview.openings[1])} in this bay.</p>
      <p>Square-cut {formatStockLength(preview.height)} tall × {formatStockLength(preview.depth)} deep × {formatPreciseInches(preview.thickness)} thick. {preview.baseId ? `Bears on ${partLabel(project, preview.baseId)}.` : "Bears on the modeled floor."}</p>
      <p className="small-note">
        {preview.reusedId ? `Reuses ${partLabel(project, preview.reusedId)} from the Cut pool.` : "Uses a new sheet source."}{" "}
        {preview.offcuts.length > 0 && `Keeps ${preview.offcuts.length} new ${preview.offcuts.length === 1 ? "offcut" : "offcuts"}.`}
      </p>
      <p>Longest span {formatStockLength(preview.previous.geometry.longest.length)} → {formatStockLength(preview.after.geometry.longest.length)}.{" "}
        Estimated immediate sag {formatPreciseInches(preview.previous.deflection)} → {formatPreciseInches(preview.after.deflection)}.{" "}
        {preview.after.withinTarget ? "Within your sag target." : "The longest span still exceeds your sag target."}
      </p>
      {(project.motionPlans?.length || preview.motion.length) ? <p className={preview.motion.length ? "form-error" : "small-note"}>
        {preview.motion.length ? `Saved movement contacts the divider in ${preview.motion.join(", ")}.`
          : "The saved movement tests found no contact with this divider."}
      </p> : null}
      <button type="button" className="button primary full" onClick={() => onCommit(preview)}>Add shelf divider</button>
    </section>}
  </div>;
}
