import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import { previewRoundDuct } from "./roundDuct";
import { roundDuctStock } from "./roundDuctReference";
import type { RoundDuctInput } from "./roundDuctSchema";

const axes = ["X", "Y", "Z"] as const;
const fields = [
  ["envelopeWidth", "Clearance envelope width", 6, 48],
  ["stockLength", "Usable stock length", 1, 60],
  ["startEngagement", "Start collar engagement", 0, 60],
  ["endEngagement", "End collar engagement", 0, 60],
  ["jointOverlap", "Overlap between pipes", 0, 60],
  ["cutLoss", "Cutting loss per trimmed pipe", 0, 60],
] as const;

export function RoundDuctPanel({ project, initialId, measurement, onPreview, onSave, onRemove, onShow }: {
  project: Project;
  initialId?: string;
  measurement: { a: V3 | null; b: V3 | null };
  onPreview: (preview?: ReturnType<typeof previewRoundDuct>) => void;
  onSave: (input: RoundDuctInput, id?: string) => void;
  onRemove: (id: string) => void;
  onShow: (id: string) => void;
}) {
  const [id, setId] = useState(initialId ?? "");
  const records = project.roundDuctRuns ?? [];
  const active = records.find((record) => record.id === id);
  return <>
    <h2 id="modal-title">Plan round duct run</h2>
    {!!records.length && <label className="field">Saved duct run
      <select value={id} onChange={(event) => { onPreview(); setId(event.target.value); }}>
        <option value="">New duct run</option>
        {records.map((record) => <option key={record.id} value={record.id}>{record.input.name}</option>)}
      </select>
    </label>}
    {active && <div className="motion-actions">
      <button className="button secondary" type="button" onClick={() => onShow(active.id)}>Show saved duct run in 3D</button>
      <button className="text-button" type="button" onClick={() => { onRemove(active.id); onPreview(); setId(""); }}>Remove duct run</button>
    </div>}
    <RoundDuctMeasurements key={id} project={project} existing={active} measurement={measurement}
      onPreview={onPreview} onSave={(input) => onSave(input, active?.id)} />
    <p className="small-note"><a href={roundDuctStock.listing} target="_blank" rel="noreferrer">Master Flow pipe reference</a>{" · "}
      <a href={roundDuctStock.sealing} target="_blank" rel="noreferrer">PNNL metal duct sealing</a></p>
  </>;
}

function RoundDuctMeasurements({ project, existing, measurement, onPreview, onSave }: {
  project: Project;
  existing?: NonNullable<Project["roundDuctRuns"]>[number];
  measurement: { a: V3 | null; b: V3 | null };
  onPreview: (preview?: ReturnType<typeof previewRoundDuct>) => void;
  onSave: (input: RoundDuctInput) => void;
}) {
  const [input, setInput] = useState<RoundDuctInput>(() => existing?.input ?? {
    name: "Supply branch", start: measurement.a ?? [NaN, NaN, NaN], end: measurement.b ?? [NaN, NaN, NaN],
    envelopeWidth: NaN, stockLength: roundDuctStock.length, startEngagement: NaN, endEngagement: NaN, jointOverlap: NaN, cutLoss: 0,
  });
  const [preview, setPreview] = useState<ReturnType<typeof previewRoundDuct> & { source: Project }>();
  const [editing, setEditing] = useState(true);
  const checked = preview?.source === project ? preview : undefined;
  function update(patch: Partial<RoundDuctInput>) {
    setInput((current) => ({ ...current, ...patch }));
    setPreview(undefined);
    onPreview();
  }
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = previewRoundDuct(project, input, existing?.id);
    setPreview({ ...next, source: project });
    onPreview(next);
    if (next.geometry) setEditing(false);
  }
  return <form className="valley-plan" noValidate onSubmit={check}>
    {editing ? <>
      <p className="small-note">Mark both collar tips. Include insulation and working clearance in the envelope width.</p>
      <label className="field">Run name<input value={input.name} maxLength={100} onChange={(event) => update({ name: event.target.value })} /></label>
      {(["start", "end"] as const).map((end) => <div className="number-row" key={end}>
        {axes.map((axis, index) => <LengthInput key={axis} label={`${end === "start" ? "Start" : "End"} ${axis}`}
          value={input[end][index]} min={-12000} max={12000} onChange={(value) => {
            const point: V3 = [...input[end]];
            point[index] = value;
            update({ [end]: point });
          }} />)}
      </div>)}
      <div className="valley-fields">
        {fields.map(([key, label, min, max]) => <LengthInput key={key} label={label} value={input[key]} min={min} max={max}
          onChange={(value) => update({ [key]: value })} />)}
      </div>
      <button type="submit" className="button secondary">Check route and cuts</button>
    </> : <button type="button" className="button secondary" onClick={() => {
      setEditing(true); setPreview(undefined); onPreview();
    }}>Edit duct measurements</button>}
    {checked && <section className="valley-results" aria-label="Duct route and cuts">
      {checked.issues.length > 0 && <p role="alert">{checked.issues.join(" ")}</p>}
      {checked.geometry && <p>{formatStockLength(checked.geometry.length)} between collar tips.</p>}
      {!checked.issues.length && checked.cuts && <>
        <p>{checked.cuts.length} × {roundDuctStock.model} · {checked.jointCount} joints to seal.</p>
        <ol>
          {checked.cuts.map(({ length, whole, tail }, index) => <li key={index}>
            {whole ? "Keep whole" : "Cut to"} {formatStockLength(length)}.
            {tail > 1e-7 && ` Estimated tail ${formatStockLength(tail)}.`}
          </li>)}
        </ol>
        <p className="small-note">Dry-fit and fasten the joints, then seal them before insulating. See the build guide for the cut-end checks.</p>
        <button type="button" className="button primary" onClick={() => onSave(input)}>Save duct run and cut list</button>
      </>}
    </section>}
  </form>;
}
