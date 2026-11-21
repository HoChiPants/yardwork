import { useMemo, useState } from "react";
import { floorJoistBearingScope, floorJoistReference, floorJoistSpanScope, floorJoistSpecies } from "./floorJoistReference";
import type { Project } from "./model";
import type { SubfloorReview } from "./subfloor";
import { reviewSubfloorJoists, subfloorJoistLines } from "./subfloorJoists";
import type { SubfloorJoistSpanInput } from "./subfloorSchema";

type Props = {
  project: Project;
  panel: SubfloorReview;
  onSave: (id: string, selection: { reference: SubfloorJoistSpanInput | null } | null) => void;
  onShow: (id: string, preview?: SubfloorJoistSpanInput | null) => void;
};

export function SubfloorJoistPanel({ project, panel, onSave, onShow }: Props) {
  const saved = project.subfloorJoistPlans?.find(({ panelId }) => panelId === panel.panelId);
  const [species, setSpecies] = useState<SubfloorJoistSpanInput["species"] | "">(saved?.reference?.species ?? "");
  const [spacing, setSpacing] = useState<SubfloorJoistSpanInput["spacing"]>(saved?.reference?.spacing ??
    floorJoistReference.spacing.find((value) => value + 0.00001 >= (panel.layout?.widest ?? 24)) ?? 24);
  const [confirmed, setConfirmed] = useState(false);
  const [edited, setEdited] = useState(false);
  const preview = useMemo(() => edited ? species && confirmed ? { species, spacing } : null : undefined,
    [edited, species, confirmed, spacing]);
  const review = useMemo(() => reviewSubfloorJoists(project, panel, preview), [project, panel, preview]);
  const n = review.rows.flatMap(({ ends }) => ends.filter(({ issue }) => issue)).length;
  const pending = Boolean(species && edited && !confirmed);
  return <details className="field-section" open={!!saved}>
    <summary>Joist bearing and span</summary>
    <p className="small-note">{floorJoistBearingScope} <a href={floorJoistReference.code} target="_blank" rel="noreferrer">R502.6 and span table</a></p>
    {review.rows.length > 0 && <>
      <p><strong>{review.rows.length} joist lines{n > 0 ? ` · ${n} end${n === 1 ? "" : "s"} to review` : ""}</strong></p>
      <label className="field">Confirmed lumber stamp
        <select value={species} onChange={(event) => {
          setSpecies(event.target.value as typeof species);
          setEdited(true);
          setConfirmed(false);
        }}>
          <option value="">Measure bearing and clear spans</option>
          {Object.entries(floorJoistSpecies).map(([id, name]) => <option value={id} key={id}>{name} No. 2</option>)}
        </select>
      </label>
      {species && <>
        <label className="field">Maximum joist spacing
          <select value={spacing} onChange={(event) => {
            setSpacing(Number(event.target.value) as typeof spacing);
            setEdited(true);
            setConfirmed(false);
          }}>
            {floorJoistReference.spacing.map((value) => <option value={value} key={value}>{value} in on center</option>)}
          </select>
        </label>
        <p className="small-note">{floorJoistSpanScope}</p>
        <label className="checkbox-field">
          <input type="checkbox" checked={edited ? confirmed : !!saved?.reference && !review.referenceProblem}
            onChange={(event) => { setEdited(true); setConfirmed(event.target.checked); }} />
          These stamps, spacing and reference loads match the floor I’m reviewing.
        </label>
      </>}
    </>}
    <ul>{subfloorJoistLines(project, review).map((line, index) => <li key={index}>{line}</li>)}</ul>
    <div className="inline">
      {review.rows.some(({ marks }) => marks.length > 0) && <button type="button" className="button secondary"
        onClick={() => onShow(panel.panelId, preview)}>Show joist bearing in 3D</button>}
      {(!saved || edited) && <button type="button" className="button primary" disabled={pending || !!review.problem || !!review.referenceProblem}
        onClick={() => { onSave(panel.panelId, { reference: preview ?? null }); setEdited(false); }}>Save joist check</button>}
      {saved && !edited && <span>Joist check saved</span>}
    </div>
    {saved && <button type="button" className="text-button" onClick={() => {
      onSave(panel.panelId, null);
      setSpecies("");
      setEdited(false);
      setConfirmed(false);
    }}>Remove joist check</button>}
  </details>;
}
