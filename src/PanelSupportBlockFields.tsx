import { useState } from "react";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { LengthInput } from "./LengthInput";
import type { MaterialId, Piece, Project } from "./model";
import {
  panelSupportStocks,
  previewSupportBlock,
  type PanelSupportBlockPreview,
  type SupportBlockTarget,
  type SupportBlockPosition,
} from "./panelSupportBlock";
import { partLabel } from "./partLabels";

export function PanelSupportBlockFields({
  project,
  target,
  stops,
  preview,
  onPreview,
  onAdd,
}: {
  project: Project;
  target: SupportBlockTarget;
  stops: readonly Piece[];
  preview: PanelSupportBlockPreview | null;
  onPreview: (fit: PanelSupportBlockPreview | null) => void;
  onAdd: (fit: PanelSupportBlockPreview, reviewJoints?: boolean) => void;
}) {
  const [stopId, setStopId] = useState(stops[0].id);
  const [stock, setStock] = useState<MaterialId>("stud");
  const [reuse, setReuse] = useState(true);
  const [x, setX] = useState(0);
  const [z, setZ] = useState(0);
  const [error, setError] = useState("");
  function reset() {
    setError("");
    onPreview(null);
  }
  function check(position?: SupportBlockPosition) {
    try {
      setError("");
      onPreview(previewSupportBlock(project, target, stopId, stock, reuse, position));
    } catch (problem) {
      onPreview(null);
      setError(problem instanceof Error ? problem.message : "Review the support block fit.");
    }
  }
  return (
    <section
      className="field-section support-block-fields"
      aria-label="Fit a support block"
    >
      <h3>Fit a support block</h3>
      <p className="small-note">
        Fit a square-ended block under the part where contact stops.
      </p>
      <label className="field">
        Part to support
        <select
          value={stopId}
          onChange={(event) => {
            setStopId(event.target.value);
            reset();
          }}
        >
          {stops.map((piece) => (
            <option key={piece.id} value={piece.id}>
              {partLabel(project, piece.id)} · {piece.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Support stock
        <select
          value={stock}
          onChange={(event) => {
            setStock(event.target.value as MaterialId);
            reset();
          }}
        >
          {panelSupportStocks.map(({ id, name, subtitle }) => (
            <option key={id} value={id}>
              {name} · {subtitle}
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
            reset();
          }}
        />
        Use a matching offcut when one fits
      </label>
      <details className="field-section">
        <summary>Offset from center</summary>
        <div className="number-row">
          <LengthInput label="Block X offset" value={x} min={-12000} max={12000} onChange={(value) => { setX(value); reset(); }} />
          <LengthInput label="Block Z offset" value={z} min={-12000} max={12000} onChange={(value) => { setZ(value); reset(); }} />
        </div>
        <p className="small-note">Offsets follow the workspace axes from the center of the receiving underside.</p>
      </details>
      <div className="button-row">
        <button type="button" className="button secondary small" onClick={() => check(x === 0 && z === 0 ? undefined : { kind: "offset", x, z })}>
          Preview support block
        </button>
        <button type="button" className="button secondary small" onClick={() => check({ kind: "nearby" })}>
          Find nearby fit
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div aria-label="Support block fit" role="region" aria-live="polite">
          <p>
            {formatStockLength(preview.height)} support block from{" "}
            {preview.baseId
              ? partLabel(project, preview.baseId)
              : "the modeled floor"}{" "}
            to {partLabel(project, preview.stopId)}.
          </p>
          {preview.offset.some((value) => Math.abs(value) > 1e-7) && <p>
            Offset from underside center · X {formatPreciseInches(preview.offset[0])} · Z {formatPreciseInches(preview.offset[1])}.
          </p>}
          <p>
            {preview.reusedId
              ? `Use ${partLabel(project, preview.reusedId)} from the Cut pool. ${preview.operations.length ? preview.operations.join(" · ") + "." : "Fits as measured."}`
              : preview.height < preview.stockLength - 1e-7
                ? `Crosscut new stock to ${formatStockLength(preview.height)}.`
                : "Use the full stock length."}
            {!!preview.offcuts.length &&
              ` Keep ${preview.offcuts.length} reusable offcut${preview.offcuts.length === 1 ? "" : "s"}.`}
          </p>
          <p>
            {preview.remainingStops.length
              ? `${preview.remainingStops.length} other contact breaks still need review.`
              : "The preview closes the modeled contact path to the floor."}
          </p>
          {!!preview.motionConflicts.length && (
            <p className="form-error">
              The block obstructs modeled movement in{" "}
              {preview.motionConflicts.join(", ")}.
            </p>
          )}
          <p className="small-note">
            Verify the floor or base, block sizing, attachment and load capacity
            for the build.
          </p>
          <div className="inline">
            <button
              type="button"
              className="button primary"
              disabled={!!preview.motionConflicts.length}
              onClick={() => onAdd(preview)}
            >
              Add support block
            </button>
            <button type="button" className="button secondary" disabled={!!preview.motionConflicts.length}
              onClick={() => onAdd(preview, true)}>
              Add and review joints
            </button>
            <button type="button" className="button secondary" onClick={reset}>
              Cancel preview
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
