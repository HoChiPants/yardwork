import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import { rimFoam } from "./rimAirSealReference";
import { foamBlankSize, type reviewRimAirSeals } from "./rimAirSeals";
import { addRimFoamOffcut, removeRimFoamOffcut } from "./rimFoamOffcuts";

export function FoamOffcutPool({ project, review, onChange, onPlan }: {
  project: Project;
  review: ReturnType<typeof reviewRimAirSeals>;
  onChange: (update: (project: Project) => Project) => void;
  onPlan?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [width, setWidth] = useState(NaN);
  const [length, setLength] = useState(NaN);
  const [error, setError] = useState("");
  const stock = project.rimFoamOffcuts ?? [];

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onChange((live) => addRimFoamOffcut(live, { label, width, length }));
      setLabel("");
      setWidth(NaN);
      setLength(NaN);
      setAdding(false);
      setError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review these foam measurements.");
    }
  }

  function remove(id: string) {
    try {
      onChange((live) => removeRimFoamOffcut(live, id));
      setError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not remove the foam offcut.");
    }
  }

  return <details className="foam-offcut-pool">
    <summary>Foam board offcuts ({stock.length})</summary>
    {stock.map(({ id, label: name, width, length }) => {
      const reservation = review.rows.find(({ plan }) => plan.input.poolOffcutIds?.includes(id));
      const planned = review.scraps.find(({ poolOffcutId }) => poolOffcutId === id)?.stock.placements.length;
      return <article key={id} className="cut-pool-row">
        <strong>{name}</strong>
        <p>{foamBlankSize(width, length)} · 2 in foam</p>
        {reservation ? <small>{reservation.name} · {reservation.issues.length ? "Review reservation"
          : planned ? `${planned} planned ${planned === 1 ? "cut" : "cuts"}` : "Reserved · unused in the current layout"}</small> :
          <button type="button" className="text-button" onClick={() => remove(id)}>
            Remove {name}
          </button>}
      </article>;
    })}
    {adding ? <form onSubmit={add} onChange={() => setError("")} noValidate>
      <p className="small-note">Measure a sound rectangle of matching 2 in FOAMULAR board and use its physical label.</p>
      <label className="field">Foam offcut label
        <input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <LengthInput label="Foam offcut width" value={width} max={rimFoam.width} onChange={setWidth} />
      <LengthInput label="Foam offcut length" value={length} max={rimFoam.length} onChange={setLength} />
      <div className="button-row">
        <button className="button primary" type="submit">Save foam offcut</button>
        <button className="text-button" type="button" onClick={() => { setAdding(false); setError(""); }}>Cancel</button>
      </div>
    </form> : <div className="button-row">
      <button type="button" className="text-button" onClick={() => setAdding(true)}>Add foam offcut</button>
      {onPlan && stock.length > 0 && <button className="text-button" type="button" onClick={onPlan}>Plan rim cuts</button>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
