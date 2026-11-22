import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { previewRoundDuctElbow } from "./roundDuctElbow";
import { ductTipKey, type RoundDuctElbowInput, type RoundDuctTip } from "./roundDuctElbowSchema";
import { roundDuctElbowScope, roundDuctElbowStock } from "./roundDuctReference";

type Review = ReturnType<typeof previewRoundDuctElbow>;
type SavedElbow = NonNullable<Project["roundDuctElbows"]>[number];

export function RoundDuctElbowPanel({ project, onPreview, onSave, onRemove }: {
  project: Project;
  onPreview: (value?: Review) => void;
  onSave: (input: RoundDuctElbowInput, id?: string) => void;
  onRemove: (id: string) => void;
}) {
  const records = project.roundDuctElbows ?? [];
  const [id, setId] = useState("");
  const saved = records.find((record) => record.id === id);
  const options = (project.roundDuctRuns ?? []).flatMap(({ id: runId, input }) =>
    (["start", "end"] as const).map((tip) => ({ tip: { runId, tip }, label: `${input.name} · ${tip}` })));
  return <>
    <h2 id="modal-title">Fit a round duct elbow</h2>
    <p>{roundDuctElbowScope}</p>
    {records.length > 0 && <label className="field">Saved round duct elbow
      <select value={id} onChange={(event) => { setId(event.target.value); onPreview(); }}>
        <option value="">New elbow</option>
        {records.map(({ id: key, input }) => <option key={key} value={key}>
          {options.find(({ tip }) => ductTipKey(tip) === ductTipKey(input.first))?.label ?? "Missing pipe"} to{" "}
          {options.find(({ tip }) => ductTipKey(tip) === ductTipKey(input.second))?.label ?? "missing pipe"}
        </option>)}
      </select>
    </label>}
    {options.length < 4 ? <p role="status">Save two straight round duct runs before fitting an elbow.</p> :
      <ElbowMeasurements key={id} project={project} options={options} saved={saved} onPreview={onPreview} onSave={onSave} />}
    {saved && <button type="button" className="text-button" onClick={() => {
      onRemove(saved.id); setId(""); onPreview();
    }}>Remove saved elbow</button>}
    <p className="small-note"><a href={roundDuctElbowStock.listing} target="_blank" rel="noreferrer">Master Flow B90E6 reference</a></p>
  </>;
}

function ElbowMeasurements({ project, options, saved, onPreview, onSave }: {
  project: Project;
  options: { tip: RoundDuctTip; label: string }[];
  saved?: SavedElbow;
  onPreview: (value?: Review) => void;
  onSave: (input: RoundDuctElbowInput, id?: string) => void;
}) {
  const [first, setFirst] = useState(saved ? ductTipKey(saved.input.first) : "");
  const [second, setSecond] = useState(saved ? ductTipKey(saved.input.second) : "");
  const [firstSetback, setFirstSetback] = useState(saved?.input.firstSetback ?? NaN);
  const [secondSetback, setSecondSetback] = useState(saved?.input.secondSetback ?? NaN);
  const [envelopeWidth, setEnvelopeWidth] = useState(saved?.input.envelopeWidth ?? NaN);
  const [crimpedTip, setCrimpedTip] = useState<RoundDuctElbowInput["crimpedTip"] | "">(saved?.input.crimpedTip ?? "");
  const [checked, setChecked] = useState<{ input: RoundDuctElbowInput; result: Review; source: Project }>();
  const input = checked?.source === project ? checked : undefined;
  function update<T,>(set: (value: T) => void, value: T) {
    set(value);
    setChecked(undefined);
    onPreview();
  }
  function preview(event: FormEvent) {
    event.preventDefault();
    const firstTip = options.find(({ tip }) => ductTipKey(tip) === first)?.tip;
    const secondTip = options.find(({ tip }) => ductTipKey(tip) === second)?.tip;
    if (!firstTip || !secondTip || !crimpedTip) return;
    const next = { first: firstTip, second: secondTip, firstSetback, secondSetback, envelopeWidth, crimpedTip };
    const result = previewRoundDuctElbow(project, next, saved?.id);
    setChecked({ input: next, result, source: project });
    onPreview(result);
  }
  return <form onSubmit={preview}>
    <div className="valley-fields">
      <label className="field">First pipe tip<select value={first} required onChange={(event) => update(setFirst, event.target.value)}>
        <option value="">Choose a pipe end</option>
        {options.map(({ tip, label }) => <option key={ductTipKey(tip)} value={ductTipKey(tip)}>{label}</option>)}
      </select></label>
      <label className="field">Second pipe tip<select value={second} required onChange={(event) => update(setSecond, event.target.value)}>
        <option value="">Choose a pipe end</option>
        {options.map(({ tip, label }) => <option key={ductTipKey(tip)} value={ductTipKey(tip)}>{label}</option>)}
      </select></label>
    </div>
    <div className="valley-fields duct-elbow-fields">
      <LengthInput label="First setback" value={firstSetback} min={0} max={48} required onChange={(value) => update(setFirstSetback, value)} />
      <LengthInput label="Second setback" value={secondSetback} min={0} max={48} required onChange={(value) => update(setSecondSetback, value)} />
      <LengthInput label="Elbow clearance width" value={envelopeWidth} min={6} max={48} required onChange={(value) => update(setEnvelopeWidth, value)} />
      <label className="field">Elbow crimp<select value={crimpedTip} required onChange={(event) => update(setCrimpedTip, event.target.value as typeof crimpedTip)}>
        <option value="">Choose the crimped port</option>
        <option value="first">First tip</option>
        <option value="second">Second tip</option>
      </select></label>
    </div>
    <button type="submit" className="button secondary">Check elbow fit</button>
    {input && <section className="valley-results" aria-label="Elbow fit results">
      {input.result.issues.length > 0 && <p role="alert">{input.result.issues.join(" ")}</p>}
      {input.result.geometry && <p>Measured turn points {input.result.geometry.cornerGap > 1e-7
        ? `${formatStockLength(input.result.geometry.cornerGap)} apart` : "align"}.</p>}
      {input.result.required && <p>First pipe end · {input.result.required[0]}<br />Second pipe end · {input.result.required[1]}</p>}
      {!input.result.issues.length && <button type="button" className="button primary"
        onClick={() => onSave(input.input, saved?.id)}>Save measured elbow</button>}
    </section>}
  </form>;
}
