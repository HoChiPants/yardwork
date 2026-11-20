import { useState } from "react";
import type { Project } from "./model";
import { LengthInput } from "./LengthInput";
export function WorkZoneForm({
  project,
  onApply,
  onClose,
}: {
  project: Project;
  onApply: (zone: Project["workZone"]) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(
    project.workZone ?? { width: 120, depth: 96, height: 96 },
  );
  const [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">DESIGN WITHIN YOUR SPACE</span>
      <h2 id="modal-title">Set your work zone.</h2>
      <p>
        Use feet or inches independently for each measurement. Switching a
        field's unit converts its value and keeps the same physical space.
      </p>
      <div className="work-zone-fields">
        {(["width", "depth", "height"] as const).map((axis) => (
          <LengthInput
            key={axis}
            label={axis[0].toUpperCase() + axis.slice(1)}
            ariaLabel={`Zone ${axis}`}
            value={size[axis]}
            min={1}
            defaultUnit={axis === "width" ? "ft" : "in"}
            onChange={(value) => setSize((s) => ({ ...s, [axis]: value }))}
          />
        ))}
      </div>
      <p className="small-note">
        The floor is at zero and the space is centered on the grid. You can
        stage uncut stock outside it; checks flag parts that extend past the
        boundary.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        onClick={() => {
          if (
            Object.values(size).some(
              (v) => !Number.isFinite(v) || v < 1 || v > 1200,
            )
          ) {
            setError(
              "Each measurement must be between 1 and 1,200 inches (up to 100 feet).",
            );
            return;
          }
          onApply(size);
          onClose();
        }}
      >
        Apply work zone
      </button>
      {project.workZone && (
        <button
          className="text-button"
          onClick={() => {
            onApply(null);
            onClose();
          }}
        >
          Remove work zone
        </button>
      )}
    </>
  );
}
