import { useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { modeledRoofValleys, reviewRoofValleys, saveRoofValley, type ModeledValley } from "./roofValleys";
import { valleyCodeReference, valleyFieldGuide, valleyScope, weatherWatch } from "./roofValleyReference";
import { roofValleyInputSchema, valleyKey, type RoofValleyInput } from "./roofValleySchema";
import { workshopAsset } from "./workshopTransport";

export function RoofValleyPanel({ project, initialId, onSave, onRemove, onShow }: {
  project: Project;
  initialId?: string;
  onSave: (input: RoofValleyInput) => void;
  onRemove: (id: string) => void;
  onShow: (id: string) => void;
}) {
  const valleys = useMemo(() => modeledRoofValleys(project), [project]);
  const saved = useMemo(() => reviewRoofValleys(project, valleys), [project, valleys]);
  const options = [
    ...valleys.map((valley, i) => ({
      id: valley.id,
      label: saved.rows.find(({ plan }) => valleyKey(plan.input.panels) === valley.id)?.plan.input.label
        ?? `Valley ${i + 1} · ${formatStockLength(valley.length)}`,
    })),
    ...saved.rows.filter(({ valley }) => !valley)
      .map(({ plan }) => ({ id: valleyKey(plan.input.panels), label: plan.input.label + " · needs review" })),
  ];
  const [selectedId, select] = useState(initialId);
  const id = options.find((row) => row.id === selectedId)?.id ?? options[0]?.id ?? "";
  const valley = valleys.find((run) => run.id === id);
  const record = saved.rows.find(({ plan }) => valleyKey(plan.input.panels) === id);
  return <>
    <h2 id="modal-title">Plan roof valley lining</h2>
    <p className="small-note">{valleyScope}</p>
    <p className="small-note"><a href={weatherWatch.instructions} target="_blank" rel="noreferrer">GAF application instructions</a>{" · "}
      <a href={valleyFieldGuide} target="_blank" rel="noreferrer">PNNL valley detail</a>{" · "}
      <a href={valleyCodeReference} target="_blank" rel="noreferrer">IRC roof assembly reference</a></p>
    {options.length ? <>
      <label className="field">Modeled valley
        <select value={id} onChange={(event) => select(event.target.value)}>
          {options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {valley && <p className="small-note">
        {formatStockLength(valley.length)} modeled downhill run · roof deck {valley.panels.map((id) => partLabel(project, id)).join(", ")}.
      </p>}
      {(record || (valley && !valley.issue)) && <div className="motion-actions">
        {valley && !valley.issue && <button type="button" className="button secondary" onClick={() => onShow(id)}>Show valley centerline in 3D</button>}
        {record && <button type="button" className="text-button" onClick={() => onRemove(id)}>Remove saved valley plan</button>}
      </div>}
      {record && <p role="status">{record.issue ? `Saved plan needs review. ${record.issue}` : "Valley lining plan saved."}</p>}
      {valley?.issue && !record && <p role="status">{valley.issue}</p>}
      {valley && !valley.issue && <ValleyMeasurements key={id} valley={valley} project={project}
        label={options.find((row) => row.id === id)?.label.replace(/ · .*$/, "") ?? "Roof valley"}
        original={record?.plan.input} onSave={onSave} />}
    </> : <>
      <p role="status">In Checks, choose Roofing in the project code review and save the adjoining modeled deck panels as roof areas. Yardwork looks for two uphill-facing sides draining into a shared sloped edge.</p>
      <p><a href={workshopAsset("/examples/roofing/closed-valley.yardwork.json")} download>Download the roof valley study</a></p>
    </>}
  </>;
}

function ValleyMeasurements({ valley, label, project, original, onSave }: {
  valley: ModeledValley;
  label: string;
  project: Project;
  original?: RoofValleyInput;
  onSave: (input: RoofValleyInput) => void;
}) {
  const [name, setName] = useState(original?.label ?? label);
  const [length, setLength] = useState(original?.length ?? NaN);
  const [peakExtra, setPeakExtra] = useState(original?.peakExtra ?? NaN);
  const [lap, setLap] = useState(original?.lap ?? weatherWatch.minLap);
  const [offcut, setOffcut] = useState(original?.offcut);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ input: RoofValleyInput; source: Project; review: ReturnType<typeof reviewRoofValleys> }>();
  const selected = preview?.source === project ? preview : undefined;
  const schedule = selected?.review.rows.find(({ valley: modeled }) => modeled?.id === valley.id);
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPreview(undefined);
    const parsed = roofValleyInputSchema.safeParse({
      panels: valley.panels, label: name, length, peakExtra, lap, fieldConfirmed: confirmed,
      ...(offcut && { offcut }),
    });
    if (!parsed.success) {
      setError("Enter a name, measured run, positive extension past the peak and an end lap of at least 6 in. If using an offcut, add its label and measured length.");
      return;
    }
    try {
      const candidate = saveRoofValley(project, parsed.data);
      setPreview({ input: parsed.data, source: project, review: reviewRoofValleys(candidate) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review the measured valley.");
    }
  }
  return <form className="valley-plan" noValidate onSubmit={review} onChangeCapture={() => { setPreview(undefined); setError(""); }}>
    <label className="field">Valley name
      <input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
    </label>
    <div className="valley-fields">
      <LengthInput label="Measured valley length" min={0.001} max={12000} value={length}
        defaultUnit={preferredLengthUnit(original?.length ?? valley.length)} onChange={setLength} />
      <LengthInput label="Extension past valley peak" min={0.001} max={weatherWatch.maxCut} value={peakExtra} onChange={setPeakExtra} />
      <LengthInput label="End overlap" min={weatherWatch.minLap} max={24} value={lap} onChange={setLap} />
    </div>
    <label className="valley-check">
      <input type="checkbox" checked={!!offcut} onChange={(event) =>
        setOffcut(event.target.checked ? { label: "", width: weatherWatch.width, length: NaN } : undefined)} />
      <span>Try a clean 36 in WeatherWatch offcut with the release backing still attached</span>
    </label>
    {offcut && <div className="valley-fields">
      <label className="field">Offcut label
        <input maxLength={60} value={offcut.label} onChange={(event) => setOffcut({ ...offcut, label: event.target.value })} />
      </label>
      <LengthInput label="Measured offcut length" value={offcut.length} max={weatherWatch.length} onChange={(length) => setOffcut({ ...offcut, length })} />
    </div>}
    <label className="valley-check">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I measured this closed shingle valley and checked the deck support, eave and peak.</span>
    </label>
    <button type="submit" className="button secondary" disabled={!confirmed}>Check valley and plan cuts</button>
    {error && <p role="alert" className="form-error">{error}</p>}
    {selected && schedule && <section className="valley-results" aria-label="Valley lining cut preview">
      <h3>Cut and lay from the eave uphill</h3>
      <ol>{schedule.strips.map(({ id, length, from, cover }) =>
        <li key={id}>Cut {formatStockLength(length)} at full width. Start {formatStockLength(from)} from the eave.
          {length > cover && ` Trim to ${formatStockLength(cover)} for the measured finish.`}</li>)}</ol>
      <p>{selected.review.rolls.length} new {selected.review.rolls.length === 1 ? "roll" : "rolls"} for the reviewed valleys.</p>
      {selected.review.needsReview && <p>Other saved valleys need review before ordering project rolls.</p>}
      {selected.review.scraps.map(({ label, strips, left }) => <p key={label}>Offcut {label} supplies {strips.map(({ name }) => name).join(", ")}. {formatStockLength(left)} left.</p>)}
      {selected.review.unused.map((label) => <p key={label}>Keep offcut {label} for another run.</p>)}
      {selected.review.rolls.map(({ runs, left }, i) => <details key={i}>
        <summary>New roll {i + 1} · {formatStockLength(left)} reusable length left</summary>
        <ul>{runs.map(({ id, name, length }) => <li key={id}>{name} · {formatStockLength(length)}</li>)}</ul>
      </details>)}
      <button type="button" className="button primary" onClick={() => onSave(selected.input)}>Save valley lining plan</button>
    </section>}
  </form>;
}
