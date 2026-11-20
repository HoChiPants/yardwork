import { useState } from "react";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { MaterialId, Project } from "./model";
import { partLabel } from "./partLabels";
import {
  previewShelfDivider,
  shelfDividerStocks,
  type ShelfDividerPreview,
} from "./shelfDivider";

export function ShelfDividerPanel({
  project,
  shelfId,
  material,
  preview,
  onPreview,
  onCommit,
}: {
  project: Project;
  shelfId: string;
  material: MaterialId;
  preview: ShelfDividerPreview | null;
  onPreview: (fit: ShelfDividerPreview | null) => void;
  onCommit: (fit: ShelfDividerPreview) => void;
}) {
  const [stock, setStock] = useState(
    shelfDividerStocks.some(({ id }) => id === material)
      ? material
      : shelfDividerStocks[0].id,
  );
  const [reuse, setReuse] = useState(true);
  const [error, setError] = useState("");
  function previewFit() {
    setError("");
    try {
      onPreview(previewShelfDivider(project, shelfId, stock, reuse));
    } catch (problem) {
      onPreview(null);
      setError(
        problem instanceof Error ? problem.message : "Review the divider fit.",
      );
    }
  }
  return (
    <details className="field-section shelf-divider-options">
      <summary>Try a center divider</summary>
      <label className="field">
        Divider sheet stock
        <select
          value={stock}
          onChange={(event) => {
            setStock(event.target.value as MaterialId);
            setError("");
            onPreview(null);
          }}
        >
          {shelfDividerStocks.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="code-trade-choice">
        <input
          type="checkbox"
          checked={reuse}
          onChange={(event) => {
            setReuse(event.target.checked);
            setError("");
            onPreview(null);
          }}
        />
        Use a matching offcut when one fits
      </label>
      <button
        type="button"
        className="button secondary full"
        onClick={previewFit}
      >
        Preview center divider
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div
          className="section-description"
          aria-label="Center divider fit"
          aria-live="polite"
        >
          <p>
            {formatStockLength(preview.height)} tall ·{" "}
            {formatStockLength(preview.depth)} deep ·{" "}
            {formatPreciseInches(preview.thickness)} thick.{" "}
            {preview.baseId
              ? `Bears on ${partLabel(project, preview.baseId)}.`
              : "Bears on the modeled floor."}
          </p>
          <p className="small-note">
            {preview.reusedId
              ? `Reuses ${partLabel(project, preview.reusedId)} from the cut pool.`
              : "Uses a new sheet source."}{" "}
            {preview.offcuts.length > 0 &&
              `Saves ${preview.offcuts.length} new ${preview.offcuts.length === 1 ? "offcut" : "offcuts"}.`}
          </p>
          <p className="small-note">
            Longest span{" "}
            {formatStockLength(preview.previous.geometry.longest.length)} →{" "}
            {formatStockLength(preview.after.geometry.longest.length)}.{" "}
            Estimated immediate sag{" "}
            {formatPreciseInches(preview.previous.deflection)} →{" "}
            {formatPreciseInches(preview.after.deflection)}.{" "}
            {preview.after.withinTarget
              ? "Within your sag target."
              : "The longest span still exceeds your sag target."}
          </p>
          <p className="small-note">
            Review how the divider goes in, how it fastens, and what supports it
            in the finished build.
          </p>
          <button
            type="button"
            className="button primary full"
            onClick={() => onCommit(preview)}
          >
            Add center divider
          </button>
        </div>
      )}
    </details>
  );
}
