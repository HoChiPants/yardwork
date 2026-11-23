import { useMemo, useState } from "react";
import { canPlaceWoodFace, previewWoodFacePlacement, woodPlacementFaces, type WoodFacePlacement } from "./facePlacement";
import { formatPreciseInches } from "./measurement";
import type { Piece, Project } from "./model";
import { partLabel } from "./partLabels";

export function PartFacePlacement({ project, piece, preview, onPreview, onApply }: {
  project: Project;
  piece: Piece;
  preview: WoodFacePlacement | null;
  onPreview: (value: WoodFacePlacement | null) => void;
  onApply: (value: WoodFacePlacement) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [side, setSide] = useState(0);
  const [centered, setCentered] = useState(true);
  const [error, setError] = useState("");
  const targets = useMemo(() => project.pieces.filter((part) => part.id !== piece.id && canPlaceWoodFace(part)), [project, piece.id]);
  const targetExists = targets.some(({ id }) => id === target);
  function resetPreview() {
    setError("");
    onPreview(null);
  }
  if (!targets.length) return null;
  return (
    <details className="field-section" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (!event.currentTarget.open) resetPreview();
    }}>
      <summary>Place against another part</summary>
      {open && <>
        <label className="field">
          Target part
          <select value={targetExists ? target : ""} onChange={(event) => {
            setTarget(event.target.value);
            resetPreview();
          }}>
            <option value="">Choose a wood part…</option>
            {targets.map(({ id, name }) => <option value={id} key={id}>{partLabel(project, id)} · {name}</option>)}
          </select>
        </label>
        <label className="field">
          Place on target side
          <select value={side} onChange={(event) => {
            setSide(Number(event.target.value));
            resetPreview();
          }}>
            {woodPlacementFaces.map(({ label }, index) => <option value={index} key={label}>{label}</option>)}
          </select>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={centered} onChange={(event) => {
            setCentered(event.target.checked);
            resetPreview();
          }} /> Center across the face
        </label>
        <div className="motion-actions">
          <button type="button" className="button secondary" disabled={!targetExists} onClick={() => {
            resetPreview();
            try {
              onPreview(previewWoodFacePlacement(project, piece.id, target, side, centered));
            } catch (problem) {
              setError(problem instanceof Error ? problem.message : "Review the selected faces.");
            }
          }}>Preview placement</button>
          {preview && <>
            <button type="button" className="button primary" onClick={() => onApply(preview)}>Apply placement</button>
            <button type="button" className="text-button" onClick={resetPreview}>Cancel preview</button>
          </>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {preview && <p className="small-note" role="status">
          {preview.part.position.map(formatPreciseInches).join(" × ")} (X, Y, Z) · {Number(preview.area.toFixed(3))} sq in modeled face contact
        </p>}
      </>}
    </details>
  );
}
