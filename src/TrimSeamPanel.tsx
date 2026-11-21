import { useState, type FormEvent } from "react";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { trimBackerRodInstructions, trimBackerRodMinRecess, trimBackerRods, trimBackerRodScope } from "./trimBackerRodReference";
import { modeledTrimSeamEdges, trimSeamMarker, type TrimSeamMarker } from "./trimSeamGeometry";
import { trimSealant } from "./trimSealantReference";
import { trimSeamLine, type WoodJointDecisionEntry } from "./woodJointDecisions";
import { trimSeamOpenSpanLimit, type TrimSeamInput, type TrimSeamOpenSpan } from "./woodJointDecisionSchema";

export function TrimSeamPanel({ project, entry, onSave, onShow }: {
  project: Project;
  entry: WoodJointDecisionEntry;
  onSave: (input: TrimSeamInput | null) => void;
  onShow: (marker: TrimSeamMarker | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const plan = entry.trimSeam?.estimate ? entry.decision.trimSeam : undefined;
  const [edgeIds, setEdgeIds] = useState<string[]>(plan?.edgeIds ?? []);
  const [openSpans, setOpenSpans] = useState<TrimSeamOpenSpan[]>(plan?.openSpans ?? []);
  const [backerRodId, setBackerRodId] = useState<TrimSeamInput["backerRodId"]>(plan?.backerRodId);
  const [fittedBacking, setFittedBacking] = useState(!!plan?.backerRodId);
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
        ...(openSpans.length && { openSpans }),
        ...(backerRodId && { backerRodId }),
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
            <p className="small-note">Choose accessible edges on dry interior wood trim. Mark sections to keep open from the start shown in 3D.</p>
            <ul className="motion-findings">
              {shape.edges.map((edge) => {
                const title = `${edge.label} · ${formatPreciseInches(edge.length)}`;
                return (
                  <li key={edge.id}>
                    <label className="checkbox-field"><input type="checkbox" checked={edgeIds.includes(edge.id)}
                      onChange={({ currentTarget }) => {
                        setEdgeIds(currentTarget.checked ? [...edgeIds, edge.id] : edgeIds.filter((id) => id !== edge.id));
                        if (!currentTarget.checked) setOpenSpans(openSpans.filter(({ edgeId }) => edgeId !== edge.id));
                        setFittedBacking(false);
                        onShow(null);
                      }} />
                      {title}
                    </label>
                    <button type="button" className="text-button" onClick={() => {
                      try {
                        onShow(trimSeamMarker(edge, `Trim seam · ${title}`, openSpans));
                        setError("");
                      } catch (issue) {
                        onShow(null);
                        setError((issue as Error).message);
                      }
                    }}>Show {edge.label.toLowerCase()} in 3D</button>
                    {edgeIds.includes(edge.id) && (
                      <details>
                        <summary>Keep part of {edge.label.toLowerCase()} open</summary>
                        <p className="small-note">Measure both ends from the dot marked Start in 3D. The dashed sections stay open.</p>
                        {openSpans.map((span, index) => span.edgeId === edge.id && (
                          <div key={index}>
                            <div className="two-col">
                              {(["start", "end"] as const).map((field) => (
                                <label className="field" key={field}>Keep open {field} (in)
                                  <input type="number" step="any" value={Number.isFinite(span[field]) ? span[field] : ""}
                                    onChange={({ currentTarget }) => {
                                      const value = currentTarget.valueAsNumber;
                                      setOpenSpans(openSpans.map((row, i) => i === index ? { ...row, [field]: value } : row));
                                      setFittedBacking(false);
                                      onShow(null);
                                    }} />
                                </label>
                              ))}
                            </div>
                            <button type="button" className="text-button" onClick={() => {
                              setOpenSpans(openSpans.filter((_, i) => i !== index));
                              setFittedBacking(false);
                              onShow(null);
                            }}>Remove keep-open range</button>
                          </div>
                        ))}
                        <button type="button" className="text-button" disabled={openSpans.length >= trimSeamOpenSpanLimit}
                          onClick={() => {
                            setOpenSpans([...openSpans, { edgeId: edge.id, start: NaN, end: NaN }]);
                            onShow(null);
                          }}>Add keep-open range</button>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            <label className="field">Measured bead width (in)
              <input name="width" type="number" min="0.001" max={trimSealant.screenWidth} step="any" defaultValue={plan?.gapWidth}
                onChange={() => setFittedBacking(false)} required />
            </label>
            <label className="field">Backer rod
              <select value={backerRodId ?? ""} onChange={({ currentTarget }) => {
                const product = trimBackerRods.find(({ id }) => id === currentTarget.value);
                setBackerRodId(product?.id);
                setFittedBacking(false);
                if (product) setTrial(true);
              }}>
                <option value="">No backer rod in this plan</option>
                {trimBackerRods.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            {backerRodId && <>
              <p className="small-note">Enter the widest opening for the bead width. {trimBackerRodScope} <a href={trimBackerRodInstructions} target="_blank" rel="noreferrer">Frost King instructions</a></p>
              <label className="checkbox-field">
                <input type="checkbox" required checked={fittedBacking} onChange={({ currentTarget }) => setFittedBacking(currentTarget.checked)} />
                I checked the chosen rod fits along the runs at the measured depth.
              </label>
            </>}
            <label className="field">Measured bead depth (in)
              <input name="depth" type="number" min={backerRodId ? trimBackerRodMinRecess : 0.001} max={trimSealant.screenDepth} step="any" defaultValue={plan?.gapDepth}
                onChange={() => setFittedBacking(false)} required />
            </label>
            {backerRodId && <p className="small-note">Measure depth to the top of the fitted rod, and use cartridge coverage from a trial.</p>}
            <label className="field">Coverage basis
              <select value={trial ? "trial" : "reference"} onChange={(e) => setTrial(e.target.value === "trial")}>
                <option value="reference" disabled={!!backerRodId}>DAP reference · 3/16 in bead</option>
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
          setOpenSpans([]);
          setBackerRodId(undefined);
          setFittedBacking(false);
          setTrial(false);
          onShow(null);
        }}>Remove measured seam</button>}
      </>}
    </details>
  );
}
