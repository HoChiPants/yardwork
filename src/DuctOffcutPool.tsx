import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { addRoundDuctOffcut, releaseRoundDuctOffcut, removeRoundDuctOffcut, reserveRoundDuctOffcut, roundDuctTakeoff } from "./roundDuct";
import { roundDuctSlotKey, type RoundDuctEnd, type RoundDuctEnds, type RoundDuctOffcut } from "./roundDuctSchema";
import { fitRoundDuctOffcut } from "./roundDuctStock";

type Update = (update: (project: Project) => Project) => void;
type DraftEnd = RoundDuctEnd | "";

function EndSelect({ label, value, onChange }: { label: string; value: DraftEnd; onChange: (value: DraftEnd) => void }) {
  return <label className="field">{label}
    <select value={value} onChange={(event) => onChange(event.target.value as DraftEnd)}>
      <option value="">Choose end form</option>
      <option value="plain">Plain</option>
      <option value="crimped">Crimped</option>
    </select>
  </label>;
}

export function DuctOffcutPool({ project, onChange }: { project: Project; onChange: Update }) {
  const [adding, setAdding] = useState(false);
  const [reserving, setReserving] = useState<string>();
  const [error, setError] = useState("");
  const takeoff = roundDuctTakeoff(project);
  const records = project.roundDuctOffcuts ?? [];
  const visible = records.filter(({ retired }) => !retired);
  const retired = records.filter((record) => record.retired && record.source);
  function update(operation: Parameters<Update>[0]) {
    try {
      onChange(operation);
      setError("");
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Review the measured duct offcut.");
      return false;
    }
  }
  return <details className="foam-offcut-pool">
    <summary>Round duct offcuts ({visible.filter(({ assignment }) => !assignment).length})</summary>
    {visible.map((offcut) => {
      const run = offcut.assignment && takeoff.reviews.find(({ id }) => id === offcut.assignment?.runId);
      const key = offcut.assignment && roundDuctSlotKey(offcut.assignment.runId, offcut.assignment.index);
      const fit = key && takeoff.assigned.get(key)?.fit;
      return <article className="cut-pool-row" key={offcut.id} aria-label={offcut.label}>
        <strong>{offcut.label}</strong>
        <p>{formatStockLength(offcut.length)} · {offcut.ends.join(" / ")} ends</p>
        {offcut.source && <p className="small-note">Recovered from {offcut.source.name} · Pipe {offcut.source.index + 1}</p>}
        {offcut.assignment ? <>
          <p>{takeoff.stale.get(offcut.id) ?? `Reserved for ${run?.input.name} · Pipe ${offcut.assignment.index + 1}.`}</p>
          {fit && <p className="small-note">{fit.reversed ? "Reverse the recorded ends. " : ""}{fit.trim ? `Trim at the ${fit.trim} of the installed section.` : "Keep both measured ends."}</p>}
          <button type="button" className="text-button" onClick={() => update((live) => releaseRoundDuctOffcut(live, offcut.id))}>Release duct offcut</button>
        </> : reserving === offcut.id ? <ReserveDuctOffcut offcut={offcut} targets={takeoff.targets}
          onCancel={() => { setReserving(undefined); setError(""); }} onReserve={(target, ends) => {
            if (update((live) => reserveRoundDuctOffcut(live, offcut.id, target, ends))) setReserving(undefined);
          }} /> : <div className="button-row">
          {takeoff.targets.some(({ cut }) => cut.length <= offcut.length + 1e-7) && <button type="button" className="button secondary small"
            onClick={() => { setError(""); setReserving(offcut.id); }}>Match to a duct cut</button>}
          <button type="button" className="text-button" onClick={() => update((live) => removeRoundDuctOffcut(live, offcut.id))}>Remove from available stock</button>
        </div>}
      </article>;
    })}
    {adding ? <AddDuctOffcut tails={takeoff.tails} onCancel={() => { setAdding(false); setError(""); }}
      onSave={(input) => { if (update((live) => addRoundDuctOffcut(live, input))) setAdding(false); }} /> :
      <button type="button" className="text-button" onClick={() => { setAdding(true); setError(""); }}>Add measured duct offcut</button>}
    {!!retired.length && <details>
      <summary>Retired duct tails ({retired.length})</summary>
      <ul>{retired.map(({ id, label, source }) => <li key={id}>{label} · {source?.name} Pipe {(source?.index ?? 0) + 1}</li>)}</ul>
    </details>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </details>;
}

function AddDuctOffcut({ tails, onSave, onCancel }: {
  tails: ReturnType<typeof roundDuctTakeoff>["tails"];
  onSave: (input: { label: string; length: number; ends: RoundDuctEnds; tailKey?: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [length, setLength] = useState(NaN);
  const [tailKey, setTailKey] = useState("");
  const [first, setFirst] = useState<DraftEnd>("");
  const [second, setSecond] = useState<DraftEnd>("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (first && second) onSave({ label, length, ends: [first, second], ...(tailKey && { tailKey }) });
  }
  return <form onSubmit={submit}>
    <p className="small-note">Measure sound 6 in round duct you have on hand. Record the two ends in order and label the piece to match.</p>
    {tails.length > 0 && <label className="field">Duct offcut source
      <select value={tailKey} onChange={(event) => setTailKey(event.target.value)}>
        <option value="">Existing stock on hand</option>
        {tails.map(({ run, cut, index, revisionKey }) => <option key={revisionKey} value={revisionKey}>
          Cut complete · {run.input.name} · Pipe {index + 1} tail · estimated {formatStockLength(cut.tail)}
        </option>)}
      </select>
    </label>}
    <label className="field">Duct offcut label<input value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} /></label>
    <LengthInput label="Usable duct offcut length" value={length} min={0} max={60} onChange={setLength} required />
    <EndSelect label="Offcut first end" value={first} onChange={setFirst} />
    <EndSelect label="Offcut second end" value={second} onChange={setSecond} />
    <div className="button-row">
      <button className="button primary" type="submit" disabled={!first || !second || !(length > 0)}>Save duct offcut</button>
      <button className="text-button" type="button" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

function ReserveDuctOffcut({ offcut, targets, onReserve, onCancel }: {
  offcut: RoundDuctOffcut;
  targets: ReturnType<typeof roundDuctTakeoff>["targets"];
  onReserve: (target: string, ends: RoundDuctEnds) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState("");
  const [start, setStart] = useState<DraftEnd>("");
  const [end, setEnd] = useState<DraftEnd>("");
  const target = targets.find(({ revisionKey }) => revisionKey === key);
  const fit = target && start && end ? fitRoundDuctOffcut(offcut, target.cut.length, [start, end]) : undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fit && start && end) onReserve(key, [start, end]);
  }
  return <form onSubmit={submit}>
    <p className="small-note">Choose the end forms this pipe section needs to mate with the collars or neighboring pipe.</p>
    <label className="field">Receiving duct cut
      <select value={key} onChange={(event) => { setKey(event.target.value); setStart(""); setEnd(""); }}>
        <option value="">Choose a pipe section</option>
        {targets.filter(({ cut }) => cut.length <= offcut.length + 1e-7).map(({ run, cut, index, revisionKey }) => <option key={revisionKey} value={revisionKey}>
          {run.input.name} · Pipe {index + 1} · {formatStockLength(cut.length)}
        </option>)}
      </select>
    </label>
    <EndSelect label="Required form at start" value={start} onChange={setStart} />
    <EndSelect label="Required form at finish" value={end} onChange={setEnd} />
    {fit === null && <p role="status">This piece cannot produce both mating ends at the requested length.</p>}
    {fit && <p className="small-note">{fit.reversed ? "Reverse the recorded ends. " : ""}{fit.trim ? `Trim at the ${fit.trim} of the installed section.` : "Keep both measured ends."}</p>}
    <div className="button-row">
      <button type="submit" className="button primary" disabled={!fit}>Reserve duct offcut</button>
      <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
