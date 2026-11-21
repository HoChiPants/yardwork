import { useMemo, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import type { Project, V3 } from "./model";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import { ProjectCodeRows } from "./ProjectCodePanel";
import { reviewSinkDrain, sinkDrainCodeRows } from "./sinkDrain";
import { previewSinkDrain } from "./sinkDrainApply";
import { sinkTrap } from "./sinkDrainReference";
import type { SinkDrain, SinkDrainInput } from "./sinkDrainSchema";

type Proposal = ReturnType<typeof previewSinkDrain>;
type Props = {
  project: Project;
  measurement: { a: V3 | null; b: V3 | null };
  initialDrain?: string;
  onApply: (proposal: Proposal) => void;
  onRemove: (record: SinkDrain) => void;
};

export function SinkDrainPanel({ project, measurement, initialDrain, onApply, onRemove }: Props) {
  const [selection, select] = useState(initialDrain ?? "");
  const records = project.sinkDrains ?? [];
  const saved = records.find(({ id }) => id === selection);
  return <>
    <h2 id="modal-title">Fit a sink drain</h2>
    {!!records.length && <label className="field">Sink drain plan
      <select value={selection} onChange={(event) => select(event.target.value)}>
        <option value="">New sink drain</option>
        {records.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    <DrainForm key={selection} project={project} measurement={measurement} saved={saved}
      onApply={onApply} onRemove={onRemove} />
  </>;
}

const blankVent = { length: NaN, fall: NaN, takeoff: NaN, uniform: false };
function DrainForm({ project, measurement, saved, onApply, onRemove }: Omit<Props, "initialDrain"> & { saved?: SinkDrain }) {
  const [draft, setDraft] = useState<SinkDrainInput>(() => {
    if (saved) {
      const { id: _id, bodyId: _bodyId, tubeId: _tubeId, ...input } = saved;
      return input;
    }
    return {
      name: "Kitchen sink drain", tail: [NaN, NaN, NaN], wall: [NaN, NaN, NaN],
      tailDiameter: 1.5, tailSeat: NaN, wallSeat: NaN, bendReach: NaN, outletDrop: NaN,
      bodyDrop: NaN, bodyWidth: NaN, blank: NaN, kerf: 0.125, service: NaN,
    };
  });
  const [review, setReview] = useState<{ basis: Project; proposal: Proposal } | null>(null);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);
  const active = review?.basis === project ? review.proposal : undefined;
  const previous = useMemo(() => saved && reviewSinkDrain(project, saved).problem, [project, saved]);
  function update<K extends keyof SinkDrainInput>(key: K, value: SinkDrainInput[K]) {
    setDraft((before) => ({ ...before, [key]: value }));
    setReview(null);
    setError("");
  }
  function marks(key: "tail" | "wall", title: string, point: V3 | null) {
    return <fieldset className="field-section">
      <legend>{title}</legend>
      {!!point && <button className="text-button" type="button" onClick={() => update(key, point)}>
        Use measurement {key === "tail" ? "A" : "B"}
      </button>}
      <div className="water-measurement-fields">
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <LengthInput key={axis} label={`${title} ${axis}`} value={draft[key][index]} min={-12000} max={12000}
            onChange={(value) => {
              const next: V3 = [...draft[key]];
              next[index] = value;
              update(key, next);
            }} />
        ))}
      </div>
    </fieldset>;
  }
  const length = (key: "tailSeat" | "wallSeat" | "bendReach" | "outletDrop" | "bodyDrop" | "bodyWidth" | "blank" | "kerf" | "service",
    label: string, min: number, max: number) =>
    <LengthInput label={label} value={draft[key]} min={min} max={max} onChange={(value) => update(key, value)} />;
  const ventLength = (key: "length" | "fall" | "takeoff", label: string, min: number, max: number) =>
    <LengthInput label={label} value={draft.vent![key]} min={min} max={max}
      onChange={(value) => update("vent", { ...draft.vent!, [key]: value })} />;
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setReview({ basis: project, proposal: previewSinkDrain(project, draft, saved?.id, fresh) });
      setError("");
    } catch (issue) {
      setReview(null);
      setError(issue instanceof ZodError ? "Complete the measured connection marks, dry-fit dimensions and selected vent fields."
        : issue instanceof Error ? issue.message : "Review the measured sink drain.");
    }
  }
  return <>
    <p>Fit the Oatey HDC9704B kit to an existing 1½ in tubular waste connector. Mark the center of the cut tailpiece end and the center of the wall socket mouth.</p>
    {previous && <p className="form-error" role="alert">{previous}</p>}
    <form onSubmit={preview}>
      <label className="field">Drain name<input required value={draft.name} maxLength={60} onChange={(e) => update("name", e.target.value)} /></label>
      {marks("tail", "Tailpiece end", measurement.a)}
      {marks("wall", "Wall socket mouth", measurement.b)}
      <details className="field-section" open>
        <summary>Dry-fit measurements</summary>
        <p className="small-note">With the kit together, measure from the tailpiece inlet center to the tangent where the arm becomes straight. Measure the outlet center relative to the inlet rim. Enter a negative drop if the outlet center is higher.</p>
        <div className="water-measurement-fields">
          <label className="field">Tailpiece outside diameter
            <select value={draft.tailDiameter} onChange={(e) => update("tailDiameter", e.target.value === "1.25" ? 1.25 : 1.5)}>
              <option value="1.5">1½ in</option><option value="1.25">1¼ in · kit reducer washer</option>
            </select>
          </label>
          {length("tailSeat", "Tailpiece engagement", 0.01, 4)}
          {length("wallSeat", "Wall socket engagement", 0.01, 4)}
          {length("bendReach", "Horizontal reach to straight tube", 0.01, 10)}
          {length("outletDrop", "Outlet center below inlet rim", -2, 6)}
          {length("bodyDrop", "Bottom below inlet rim", 0.01, 12)}
          {length("bodyWidth", "Widest collar or bend width", 1.5, 6)}
          {length("blank", "Full straight length from bend", 0.01, 12)}
          {length("kerf", "Cut loss", 0, 0.5)}
          {length("service", "Clearance below for trap removal", 0.01, 20)}
        </div>
      </details>
      <details className="field-section" open={!!draft.vent || undefined}>
        <summary>Measured path to vent</summary>
        <label className="checkbox-field"><input type="checkbox" checked={!!draft.vent}
          onChange={(e) => update("vent", e.target.checked ? blankVent : undefined)} /> Include field measurements from the trap weir to the vent</label>
        {draft.vent && <>
          <div className="water-measurement-fields">
            {ventLength("length", "Developed length to vent", 0.01, 480)}
            {ventLength("fall", "Total fall to vent location", -24, 48)}
            {ventLength("takeoff", "Vent takeoff above weir", -24, 24)}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={draft.vent.uniform}
            onChange={(e) => update("vent", { ...draft.vent!, uniform: e.target.checked })} /> Uniform fall confirmed on the full route</label>
        </>}
      </details>
      {saved && <label className="checkbox-field"><input type="checkbox" checked={fresh}
        onChange={(e) => { setFresh(e.target.checked); setReview(null); setError(""); }} /> Use a new measured kit blank for this revision</label>}
      <div className="inline">
        <button className="button secondary" type="submit">Preview sink drain</button>
        {saved && <button type="button" className="button secondary" onClick={() => onRemove(saved)}>Remove sink drain</button>}
      </div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {active && <section className="field-section" aria-label="Sink drain proposal">
      <p><strong>{formatStockLength(active.layout.keep)} straight tube cut</strong> · {dim(active.record.wallSeat)} wall engagement.</p>
      {active.scrap && <p>Cut pool remnant · {dim(active.scrap.size[1])}.</p>}
      <p>Trap removal space is clear in the modeled cabinet.</p>
      {!!active.movement.length && <ul aria-label="Cabinet movement review">{active.movement.map((line) => <li key={line}>{line}</li>)}</ul>}
      <ProjectCodeRows rows={sinkDrainCodeRows(project, active.record, active.layout)} />
      <button type="button" className="button primary" onClick={() => onApply(active)}>{saved ? "Update sink drain" : "Add sink drain"}</button>
    </section>}
    <p className="small-note">Verify the delivered washers, alignment at the wall, and service access in the field. <a href={sinkTrap.installation} target="_blank" rel="noreferrer">Oatey installation</a>{" · "}
      <a href={sinkTrap.drawing} target="_blank" rel="noreferrer">Kit drawing</a>{" · "}
      <a href={sinkTrap.listing} target="_blank" rel="noreferrer">Home Depot listing</a></p>
  </>;
}
