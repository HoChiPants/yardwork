import { useState, type FormEvent } from "react";
import { formatPreciseInches } from "./measurement";
import type { Project, V3 } from "./model";
import { modeledTrimSeamEdges } from "./trimSeamGeometry";
import { trimSealant } from "./trimSealantReference";
import { trimSeamLine, type WoodJointDecisionEntry } from "./woodJointDecisions";
import type { TrimSeamInput } from "./woodJointDecisionSchema";

export type TrimSeamMarker = { points: [V3, V3]; label: string };

export function TrimSeamPanel({ project, entry, onSave, onShow }: {
  project: Project;
  entry: WoodJointDecisionEntry;
  onSave: (input: TrimSeamInput | null) => void;
  onShow: (marker: TrimSeamMarker | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const plan = entry.trimSeam?.estimate ? entry.decision.trimSeam : undefined;
  const [edgeIds, setEdgeIds] = useState<string[]>(plan?.edgeIds ?? []);
  const [trial, setTrial] = useState(plan?.fieldCoverageFeet !== undefined);
  const [error, setError] = useState("");
  const [first, second] = entry.memberIds.map((id) => project.pieces.find((piece) => piece.id === id));
  const shape = open && entry.status === "current" && first && second
    ? modeledTrimSeamEdges(first, second)
    : null;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      onSave({
        edgeIds,
        gapWidth: Number(form.get("width")),
        gapDepth: Number(form.get("depth")),
        ...(trial && { fieldCoverageFeet: Number(form.get("trial")) }),
      });
      onShow(null);
      setError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review the seam measurements.");
    }
  }

  return (
    <details className="field-section" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (!event.currentTarget.open) onShow(null);
    }}>
      <summary>Plan trim sealant</summary>
      {entry.trimSeam && <p className="small-note" role="status">{trimSeamLine(entry)}</p>}
      {open && <>
        {entry.status !== "current" ? (
          <p className="small-note">Update the joint detail for the current fit before measuring a seam.</p>
        ) : !shape?.edges.length ? (
          <p className="small-note">For this geometry, measure the exposed run in the field and use Estimate trim sealant in List.</p>
        ) : (
          <form onSubmit={save}>
            <p className="small-note">Choose complete edges you can reach on dry interior wood trim. Check the actual opening, backing and finish on the installed pieces.</p>
            <ul className="motion-findings">
              {shape.edges.map((edge) => {
                const title = `${edge.label} · ${formatPreciseInches(edge.length)}`;
                return (
                  <li key={edge.id}>
                    <label className="checkbox-field"><input type="checkbox" checked={edgeIds.includes(edge.id)}
                      onChange={(e) => setEdgeIds(e.target.checked ? [...edgeIds, edge.id] : edgeIds.filter((id) => id !== edge.id))} />
                      {title}
                    </label>
                    <button type="button" className="text-button" onClick={() => onShow({
                      points: edge.points, label: `Trim seam · ${title}`,
                    })}>Show {edge.label.toLowerCase()} in 3D</button>
                  </li>
                );
              })}
            </ul>
            <label className="field">Measured bead width (in)
              <input name="width" type="number" min="0.001" max={trimSealant.screenWidth} step="any" defaultValue={plan?.gapWidth} required />
            </label>
            <label className="field">Measured bead depth (in)
              <input name="depth" type="number" min="0.001" max={trimSealant.screenDepth} step="any" defaultValue={plan?.gapDepth} required />
            </label>
            <label className="field">Coverage basis
              <select value={trial ? "trial" : "reference"} onChange={(e) => setTrial(e.target.value === "trial")}>
                <option value="reference">DAP reference · 3/16 in bead</option>
                <option value="trial">Measured from a trial</option>
              </select>
            </label>
            {trial && <label className="field">Trial coverage (ft per cartridge)
              <input name="trial" type="number" min="0.001" step="any" defaultValue={plan?.fieldCoverageFeet} required />
            </label>}
            <button className="button secondary" type="submit" disabled={!edgeIds.length}>Save measured seam</button>
          </form>
        )}
        {error && <p className="small-note" role="alert">{error}</p>}
        {entry.decision.trimSeam && <button type="button" className="text-button" onClick={() => {
          onSave(null);
          setEdgeIds([]);
          onShow(null);
        }}>Remove measured seam</button>}
      </>}
    </details>
  );
}
