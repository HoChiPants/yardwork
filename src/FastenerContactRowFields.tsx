import { useState } from "react";
import type { FastenerContactRowPreview } from "./fastenerContactRow";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";

export function FastenerContactRowFields({
  preview,
  onPreview,
  onClear,
  onUse,
  onInspect,
}: {
  preview: FastenerContactRowPreview | null;
  onPreview: (inputs: {
    count: number;
    endInset: number;
    beforeFloorPlacement: boolean;
  }) => void;
  onClear: () => void;
  onUse: () => void;
  onInspect?: () => void;
}) {
  const [count, setCount] = useState(2);
  const [endInset, setEndInset] = useState(NaN);
  const [beforeFloorPlacement, setBeforeFloorPlacement] = useState(false);
  return (
    <details className="field-section fastener-contact-row">
      <summary>Lay out a row along the joint</summary>
      <p className="small-note">
        Place evenly spaced marks along one rectangular contact strip. Enter the
        count and inset you want to review.
      </p>
      <label className="field">
        Number of row marks
        <input
          type="number"
          min={2}
          max={100}
          step={1}
          value={Number.isFinite(count) ? count : ""}
          onChange={(event) => {
            setCount(event.target.valueAsNumber);
            onClear();
          }}
        />
      </label>
      <LengthInput
        label="Inset from each contact end"
        value={endInset}
        min={0.001}
        max={12000}
        onChange={(value) => {
          setEndInset(value);
          onClear();
        }}
      />
      <label className="field">
        Entry access
        <select
          value={beforeFloorPlacement ? "before" : "in-place"}
          onChange={(event) => {
            setBeforeFloorPlacement(event.target.value === "before");
            onClear();
          }}
        >
          <option value="in-place">In the modeled position</option>
          <option value="before">Before setting the assembly down</option>
        </select>
      </label>
      <button
        className="button secondary full"
        type="button"
        onClick={() => onPreview({ count, endInset, beforeFloorPlacement })}
      >
        Preview screw row
      </button>
      {preview && (
        <section
          className="fastener-strip-preview"
          aria-label="Screw row preview"
          aria-live="polite"
        >
          <p className="small-note">
            {preview.plan.locations.length} entry marks ·{" "}
            {formatStockLength(preview.length)} contact length ·{" "}
            {formatStockLength(preview.width)} contact width ·{" "}
            {formatStockLength(preview.spacing)} on center.{" "}
            {preview.floorAccess &&
              "Plan to drive these screws before setting the assembly down."}
          </p>
          <p className="small-note">
            Screw and pilot depths still need measurements. Check actual
            spacing, access and the fastening method.
          </p>
          <div className="button-row">
            <button className="button primary" type="button" onClick={onUse}>
              Use screw row
            </button>
            {onInspect && (
              <button className="text-button" type="button" onClick={onInspect}>
                View row in 3D
              </button>
            )}
            <button className="text-button" type="button" onClick={onClear}>
              Cancel row preview
            </button>
          </div>
        </section>
      )}
    </details>
  );
}
