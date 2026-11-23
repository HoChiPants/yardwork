import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { backerRodAllocationKey, removeBackerRodOffcut, saveBackerRodOffcut, type BackerRodOffcutInput } from "./trimBackerRodOffcuts";
import { trimBackerRodLength, trimBackerRods } from "./trimBackerRodReference";
import { recordBackerRodCuts, trimBackerRodCutPlan } from "./woodJointDecisions";

type Draft = BackerRodOffcutInput & { id?: string };
type Allocation = ReturnType<typeof trimBackerRodCutPlan>[number]["offcuts"][number];

export function BackerRodOffcutPool({ project, onChange }: {
  project: Project;
  onChange: (update: (project: Project) => Project) => void;
}) {
  const [draft, setDraft] = useState<Draft>();
  const [recording, setRecording] = useState<Allocation>();
  const [error, setError] = useState("");
  const records = project.backerRodOffcuts ?? [];
  const used = records.length ? trimBackerRodCutPlan(project).flatMap(({ offcuts }) => offcuts) : [];
  function edit(next?: Draft) {
    setDraft(next);
    setRecording(undefined);
    setError("");
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const { id, ...input } = draft;
    try {
      onChange((live) => saveBackerRodOffcut(live, input, id));
      edit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review the measured offcut.");
    }
  }
  return <details className="foam-offcut-pool">
    <summary>Backer rod offcuts ({records.length})</summary>
    {records.map((record) => {
      const product = trimBackerRods.find(({ id }) => id === record.productId)!;
      const allocation = used.find(({ source }) => source.id === record.id);
      return <article key={record.id} className="cut-pool-row" aria-label={record.label}>
        <strong>{record.label}</strong>
        <p>{product.model} · {formatStockLength(product.diameter)} diameter · {formatStockLength(record.length)} on hand</p>
        {allocation && <p>
          {allocation.runs.length} planned {allocation.runs.length === 1 ? "cut" : "cuts"} · {formatStockLength(allocation.left)} expected left
        </p>}
        {recording?.source.id === record.id ? <RecordBackerRodUse allocation={recording}
          onCancel={() => edit()} onSave={(measured) => {
            try {
              const key = backerRodAllocationKey(recording.source, recording.runs);
              onChange((live) => recordBackerRodCuts(live, record.id, key, measured));
              edit();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Review the recorded cuts.");
            }
          }} /> :
        <div className="button-row">
          {allocation && <button type="button" className="button secondary small" onClick={() => {
            edit();
            setRecording(allocation);
          }}>Record cuts from {record.label}</button>}
          <button type="button" className="text-button" onClick={() => edit(record)}>Edit {record.label}</button>
          <button type="button" className="text-button" onClick={() => {
            onChange((live) => removeBackerRodOffcut(live, record.id));
            if (record.id === draft?.id) edit();
          }}>Remove {record.label}</button>
        </div>}
      </article>;
    })}
    {draft ? <form onSubmit={save}>
      <label className="field">Offcut label
        <input required maxLength={60} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      </label>
      <label className="field">Matching backer rod
        <select value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value as Draft["productId"] })}>
          {trimBackerRods.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
        </select>
      </label>
      <LengthInput label="Measured usable length" value={draft.length} required min={0.001} max={trimBackerRodLength}
        onChange={(length) => setDraft({ ...draft, length })} />
      <div className="button-row">
        <button className="button primary small" type="submit">Save backer rod offcut</button>
        <button className="text-button" type="button" onClick={() => edit()}>Cancel</button>
      </div>
    </form> : <button className="text-button" type="button" onClick={() => edit({
      label: "", productId: trimBackerRods[0].id, length: NaN,
    })}>Add measured backer rod offcut</button>}
    {!!project.backerRodCutRecords?.length && <details>
      <summary>Recorded backer rod cuts ({project.backerRodCutRecords.length})</summary>
      <ul>{project.backerRodCutRecords.map(({ source, cuts, remnant }) => <li key={source.id}>
        {source.label} · {cuts.map(({ length }) => formatStockLength(length)).join(" + ")} cut
        {remnant && ` · ${remnant.label} kept at ${formatStockLength(remnant.length)}`}
      </li>)}</ul>
    </details>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </details>;
}

function RecordBackerRodUse({ allocation, onSave, onCancel }: {
  allocation: Allocation;
  onSave: (remnant?: { length: number; label: string }) => void;
  onCancel: () => void;
}) {
  const [length, setLength] = useState(NaN);
  const [label, setLabel] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault();
    onSave(Number.isNaN(length) ? undefined : { length, label });
  }}>
    <p className="small-note">Record these cuts after using {allocation.source.label}.</p>
    <ol>{allocation.runs.map((run) => <li key={run.key}>{formatStockLength(run.length)} · {run.title}</li>)}</ol>
    {allocation.left > 0 && <>
      <p className="small-note">Up to {formatStockLength(allocation.left)} available for a measured remainder.</p>
      <LengthInput label="Measured remainder length (optional)" value={length} min={0.001}
        max={allocation.left} onChange={setLength} />
      {Number.isFinite(length) && <label className="field">Remainder label (optional)
        <input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
      </label>}
    </>}
    <div className="button-row">
      <button type="submit" className="button primary small">Save recorded backer rod cuts</button>
      <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
