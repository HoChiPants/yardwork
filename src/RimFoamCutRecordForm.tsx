import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { foamBlankSize, type RimFoamSheet } from "./rimAirSeals";
import type { MeasuredFoamRemnant } from "./rimFoamOffcuts";

export function RimFoamCutRecordForm({ source, onRecord }: {
  source: RimFoamSheet;
  onRecord: (source: RimFoamSheet, label: string, remnants: MeasuredFoamRemnant[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [remnants, setRemnants] = useState<MeasuredFoamRemnant[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    try {
      onRecord(source, label, remnants);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review the recorded cut and measurements.");
    }
  }

  function update(slot: number, changes: Partial<MeasuredFoamRemnant>) {
    setRemnants((rows) => rows.map((row) => row.slot === slot ? { ...row, ...changes } : row));
  }

  if (!open) return <button type="button" className="text-button"
    aria-label={`Record cuts for ${source.label}`} onClick={() => setOpen(true)}>Record cuts and scraps</button>;

  return <form className="rim-seal-form rim-foam-record-form" noValidate onSubmit={submit} onChange={() => setError("")}>
    {!source.offcutLabel && <label className="field">Physical foam sheet label
      <input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
    </label>}
    {source.order.layout.leftovers.length > 0 && <fieldset>
      <legend>Measured remnants to keep</legend>
      {source.order.layout.leftovers.map(({ width, length }, slot) => {
        const name = `R${slot + 1}`;
        const draft = remnants.find((row) => row.slot === slot);
        return <div key={slot} className="rim-seal-bay">
          <label className="rim-seal-check">
            <input type="checkbox" checked={!!draft} aria-label={`Keep remnant ${name}`}
              onChange={(event) => setRemnants(event.target.checked
                ? [...remnants, { slot, width: NaN, length: NaN, label: "" }]
                : remnants.filter((row) => row.slot !== slot))} />
            <span>{name} · {foamBlankSize(width, length)} expected</span>
          </label>
          {draft && <div className="rim-seal-fields">
            <label className="field">{name} physical label
              <input value={draft.label} maxLength={60} onChange={(event) => update(slot, { label: event.target.value })} />
            </label>
            <LengthInput label={`${name} measured width`} value={draft.width} max={width} onChange={(value) => update(slot, { width: value })} />
            <LengthInput label={`${name} measured length`} value={draft.length} max={length} onChange={(value) => update(slot, { length: value })} />
          </div>}
        </div>;
      })}
    </fieldset>}
    <label className="rim-seal-check">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I made and checked these cuts and measured the sound scraps I’m keeping.</span>
    </label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="rim-seal-actions">
      <button type="submit" className="button primary" disabled={!confirmed}>Save cut record</button>
      <button type="button" className="text-button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
    </div>
  </form>;
}
