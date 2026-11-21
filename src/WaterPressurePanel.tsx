import { useMemo, useRef, useState, type FormEvent } from "react";
import type { Project } from "./model";
import { ProjectCodeRows } from "./ProjectCodePanel";
import {
  previewWaterPressure, reviewWaterPressure, saveWaterPressureTest, waterPressureObservations, waterPressureScope,
  waterTestManufacturer, waterTestPhaseFields,
} from "./waterPressure";
import { blankWaterPressure, type WaterPressureInput, type WaterPressureTest } from "./waterPressureSchema";

export function WaterPressurePanel({ project, initialRecord, onChange }: {
  project: Project; initialRecord?: string; onChange: (project: Project) => void;
}) {
  const [selection, select] = useState(initialRecord ?? "");
  const records = project.waterPressureTests ?? [];
  const saved = records.find(({ id }) => id === selection);
  return <>
    <h2 id="modal-title">Water pressure test</h2>
    {!!records.length && <label className="field">Test record
      <select value={selection} onChange={(event) => select(event.target.value)}>
        <option value="">New test record</option>
        {records.map((record) => <option key={record.id} value={record.id}>
          {record.name}{record.testedOn ? ` · ${record.testedOn}` : ""}
        </option>)}
      </select>
    </label>}
    {saved || project.waterRuns?.length
      ? <PressureForm key={selection} project={project} saved={saved} onSave={(next) => {
        onChange(next);
        select(saved?.id ?? next.waterPressureTests!.at(-1)!.id);
      }} />
      : <p>Add a wall water line to record a test on its modeled section.</p>}
  </>;
}

function PressureForm({ project, saved, onSave }: {
  project: Project; saved?: WaterPressureTest; onSave: (project: Project) => void;
}) {
  const runs = project.waterRuns ?? [];
  const [draft, setDraft] = useState<WaterPressureInput>(() => {
    if (saved) {
      const { id: _id, scope: _scope, ...input } = saved;
      return input;
    }
    return blankWaterPressure(runs[0].id, `${runs[0].name} water test`.slice(0, 80));
  });
  const [error, setError] = useState("");
  const [showReview, setShowReview] = useState(!!saved);
  const reviewRegion = useRef<HTMLElement>(null);
  const review = useMemo(() => saved ? reviewWaterPressure(project, saved) : null, [project, saved]);
  const current = useMemo(() => saved ? null : waterPressureScope(project, draft.rootRunId),
    [project, saved, draft.rootRunId]);
  const scope = saved?.scope ?? current?.scope;
  if (review?.stale && saved) return <>
    <ProjectCodeRows rows={review.rows} />
    <details className="field-section" open>
      <summary>Earlier readings</summary>
      <ul>{waterPressureObservations(saved).map((line) => <li key={line}>{line}</li>)}</ul>
    </details>
  </>;
  function update<K extends keyof WaterPressureInput>(key: K, value: WaterPressureInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onSave(saveWaterPressureTest(project, draft, saved?.id));
      setShowReview(true);
      setError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review the test record.");
    }
  }
  const rows = scope && showReview ? previewWaterPressure(project, draft, scope) : null;
  const num = (label: string, value: number | null, onChange: (value: number | null) => void, min = 0) =>
    <label className="field">{label}
      <input type="number" inputMode="decimal" step="any" min={min} value={value ?? ""}
        onChange={(event) => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null)} />
    </label>;
  function yesNo(label: string, key: "boundaryConfirmed" | "addedWater" | "leakage") {
    return <label className="field">{label}
      <select value={draft[key]} onChange={(event) => update(key, event.target.value as WaterPressureInput[typeof key])}>
        <option value="unknown">Unrecorded</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </label>;
  }
  return <form onSubmit={submit}>
    <p className="small-note">Record an installer-performed water test before covering the piping.</p>
    <div className="two-col">
      <label className="field">Record name
        <input value={draft.name} required maxLength={80} onChange={(event) => update("name", event.target.value)} />
      </label>
      <label className="field">Connected section from
        <select value={draft.rootRunId} disabled={!!saved} onChange={(event) => {
          const rootRunId = event.target.value;
          setDraft((prev) => ({ ...prev, rootRunId, boundaryConfirmed: "unknown", boundaryNotes: "" }));
          setError("");
        }}>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.name}</option>)}
        </select>
      </label>
    </div>
    {!scope && <p role="alert" className="form-error">{current?.problem}</p>}
    {scope && <>
      <p><strong>{scope.runs.length} {scope.runs.length === 1 ? "line" : "lines"}</strong> · {scope.runs.map(({ name }) => name).join(", ")}
        {scope.fittings.length > 0 && ` · ${scope.fittings.map(({ model }) => model).join(", ")}`}</p>
      <details className="field-section">
        <summary>Modeled ends to account for ({scope.openEnds.length})</summary>
        <ul>{scope.openEnds.map(({ runId, end }) => <li key={`${runId}/${end}`}>
          {scope.runs.find(({ id }) => id === runId)?.name} · {end}
        </li>)}</ul>
      </details>
      <details className="field-section" open>
        <summary>Field setup</summary>
        <div className="two-col">
          <label className="field">Field test date
            <input type="date" value={draft.testedOn ?? ""} onChange={(event) => update("testedOn", event.target.value || null)} />
          </label>
          <label className="field">Water source
            <select value={draft.waterSource} onChange={(event) => update("waterSource", event.target.value as WaterPressureInput["waterSource"])}>
              <option value="unknown">Unrecorded</option><option value="potable">Potable water</option><option value="other">Other water source</option>
            </select>
          </label>
        </div>
        {yesNo("Field isolation verified", "boundaryConfirmed")}
        <label className="field">Isolation and equipment notes
          <textarea rows={2} maxLength={600} value={draft.boundaryNotes} onChange={(event) => update("boundaryNotes", event.target.value)} />
        </label>
        <div className="two-col">
          {num("System working pressure (psi)", draft.workingPsi, (value) => update("workingPsi", value), 0.001)}
          {num("Weakest setup rating (psi)", draft.setupLimitPsi, (value) => update("setupLimitPsi", value), 0.001)}
        </div>
        <div className="two-col">
          {num("Highest water temperature (°F)", draft.temperatureF, (value) => update("temperatureF", value), -80)}
          {num("Highest observed pressure (psi)", draft.peakPsi, (value) => update("peakPsi", value))}
        </div>
        <label className="field">Gauge ID or reference
          <input value={draft.gaugeReference} maxLength={160} onChange={(event) => update("gaugeReference", event.target.value)} />
        </label>
        <div className="two-col">
          {num("Gauge scale limit (psi)", draft.gaugeScalePsi, (value) => update("gaugeScalePsi", value), 0.001)}
          {num("Gauge working limit (psi)", draft.gaugeLimitPsi, (value) => update("gaugeLimitPsi", value), 0.001)}
        </div>
        <div className="two-col">
          {num("Gauge increment (psi)", draft.gaugeIncrementPsi, (value) => update("gaugeIncrementPsi", value), 0.001)}
        </div>
      </details>
      <details className="field-section">
        <summary>Manufacturer phases</summary>
        {waterTestPhaseFields.map(({ id, label }) => <fieldset className="field" key={id}>
          <legend>{label}</legend>
          <div className="two-col">
            {num(`${label} · starting psi`, draft[id].psi, (value) => update(id, { ...draft[id], psi: value }))}
            {num(`${label} · minutes`, draft[id].minutes, (value) => update(id, { ...draft[id], minutes: value }))}
          </div>
        </fieldset>)}
        {num("End of second high hold (psi)", draft.secondHoldEndPsi, (value) => update("secondHoldEndPsi", value))}
        <a href={waterTestManufacturer.url} target="_blank" rel="noreferrer">RWC water testing instructions</a>
      </details>
      <details className="field-section" open>
        <summary>Final hold</summary>
        <div className="two-col">
          {num("Final start (psi)", draft.finalHold.startPsi, (value) => update("finalHold", { ...draft.finalHold, startPsi: value }))}
          {num("Final low (psi)", draft.finalHold.lowestPsi, (value) => update("finalHold", { ...draft.finalHold, lowestPsi: value }))}
        </div>
        <div className="two-col">
          {num("Final end (psi)", draft.finalHold.endPsi, (value) => update("finalHold", { ...draft.finalHold, endPsi: value }))}
          {num("Final duration (minutes)", draft.finalHold.minutes, (value) => update("finalHold", { ...draft.finalHold, minutes: value }))}
        </div>
        <div className="two-col">
          {yesNo("Water added during final hold", "addedWater")}
          {yesNo("Visible leakage", "leakage")}
        </div>
        <label className="field">Follow-up notes
          <textarea rows={2} maxLength={1000} value={draft.notes} onChange={(event) => update("notes", event.target.value)} />
        </label>
      </details>
      {rows && <section aria-label="Water pressure review" ref={reviewRegion}><ProjectCodeRows rows={rows} /></section>}
      <div className="two-col">
        <button type="button" className="button secondary" onClick={() => {
          setShowReview(true);
          requestAnimationFrame(() => reviewRegion.current?.scrollIntoView({ block: "start" }));
        }}>Review observations</button>
        <button type="submit" className="button primary">Save test record</button>
      </div>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
