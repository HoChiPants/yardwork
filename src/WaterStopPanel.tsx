import { useMemo, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import type { Project } from "./model";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import { LengthInput } from "./LengthInput";
import { waterPortKey } from "./waterFittings";
import { reviewWaterRun } from "./wallWater";
import { previewWaterStop } from "./waterStopApply";
import { waterStop, waterStopDepthNote } from "./waterStopReference";
import { stopEndSign, reviewWaterStop, waterStopOccupant } from "./waterStops";
import type { WaterStop, WaterStopInput } from "./waterStopSchema";

type Proposal = ReturnType<typeof previewWaterStop>;

export function WaterStopPanel({ project, initialStop, onApply, onRemove }: {
  project: Project;
  initialStop?: string;
  onApply: (proposal: Proposal) => void;
  onRemove: (record: WaterStop) => void;
}) {
  const [selection, select] = useState(initialStop ?? "");
  const records = project.waterStops ?? [];
  const saved = records.find(({ id }) => selection === id);
  return <>
    <h2 id="modal-title">Fit a fixture shutoff</h2>
    {!!records.length && <label className="field">Fixture shutoff plan
      <select value={selection} onChange={(event) => select(event.target.value)}>
        <option value="">New shutoff</option>
        {records.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    <StopForm key={selection} project={project} saved={saved} onApply={onApply} onRemove={onRemove} />
  </>;
}

function StopForm({ project, saved, onApply, onRemove }: {
  project: Project; saved?: WaterStop; onApply: (proposal: Proposal) => void; onRemove: (record: WaterStop) => void;
}) {
  const options = useMemo(() => (project.waterRuns ?? []).flatMap((run) => run.materialId === waterStop.pipe &&
    reviewWaterRun(project, run).measured
    ? (["start", "end"] as const).flatMap((end) => {
      const port = { runId: run.id, end };
      return waterStopOccupant(project, port, saved?.id) ? [] : [{ run, port, key: waterPortKey(port) }];
    }) : []), [project, saved?.id]);
  const savedRun = project.waterRuns?.find(({ id }) => id === saved?.port.runId);
  const [end, setEnd] = useState(saved ? waterPortKey(saved.port) : options[0]?.key ?? "");
  const [name, setName] = useState(saved?.name ?? "");
  const [outlet, setOutlet] = useState<WaterStopInput["outlet"]>(saved?.outlet ?? "up");
  const [exposed, setExposed] = useState(saved && savedRun
    ? (savedRun[saved.port.end] - saved.face) * stopEndSign(saved.port) : NaN);
  const [trim, setTrim] = useState(0);
  const [access, setAccess] = useState(saved?.access ?? NaN);
  const [hose, setHose] = useState(saved?.hose ?? NaN);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ basis: Project; proposal: Proposal } | null>(null);
  const active = review?.basis === project ? review.proposal : undefined;
  const entry = options.find(({ key }) => key === end);
  const problem = useMemo(() => saved && reviewWaterStop(project, saved).problem, [project, saved]);
  const set = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setReview(null);
    setError("");
  };
  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry) return;
    try {
      setReview({ basis: project, proposal: previewWaterStop(project, {
        name, port: entry.port, outlet, exposed, trim, access, hose,
      }, saved?.id) });
      setError("");
    } catch (issue) {
      setReview(null);
      setError(issue instanceof ZodError ? "Enter the measured stub-out and clearances." :
        issue instanceof Error ? issue.message : "Review the valve measurements.");
    }
  }
  return <>
    <p>Check a SharkBite Max UR23036 on an open ½ in PEX stub-out. Measure from the finished face perpendicular to the pipe. Plan space for the handle, wrench and supply hose you’ll use.</p>
    {problem && <p className="form-error" role="alert">{problem}</p>}
    {!entry && <p className="small-note">This layout needs a clear ½ in PEX endpoint. Add a wall water line or free the endpoint first.</p>}
    <form onSubmit={preview}>
      <div className="water-measurement-fields">
        <label className="field">Fixture name
          <input required value={name} maxLength={60} placeholder="Kitchen sink cold" onChange={(event) => set(setName, event.target.value)} />
        </label>
        <label className="field">Pipe end
          <select disabled={!!saved || !options.length} value={end} onChange={(event) => {
            set(setEnd, event.target.value);
            setExposed(NaN);
            setTrim(0);
          }}>
            {!entry && <option value={end}>Choose an open ½ in stub-out</option>}
            {options.map(({ key, run, port }) => <option key={key} value={key}>{run.name} · {port.end}</option>)}
          </select>
        </label>
        <LengthInput label="Exposed pipe before trimming" min={0.125} max={60} value={exposed} onChange={(value) => set(setExposed, value)} />
        <LengthInput label="Trim from pipe end" min={0} max={60} value={trim} onChange={(value) => set(setTrim, value)} />
        <LengthInput label="Clear space in front of handle" min={0.125} max={36} value={access} onChange={(value) => set(setAccess, value)} />
        <LengthInput label="Clear space beyond outlet" min={0.125} max={36} value={hose} onChange={(value) => set(setHose, value)} />
        <label className="field">Outlet direction viewed toward wall
          <select value={outlet} onChange={(event) => set(setOutlet, event.target.value as WaterStopInput["outlet"])}>
            <option value="up">Up</option><option value="down">Down</option>
            <option value="left">Left</option><option value="right">Right</option>
          </select>
        </label>
      </div>
      <p className="small-note">Verify the actual grip, hose bend, wall attachment and equipment access on site. The preview checks the entered spaces and the valve’s installation travel against modeled parts.</p>
      <div className="inline">
        <button type="submit" className="button secondary" disabled={!entry}>Preview shutoff fit</button>
        {saved && <button className="button secondary" type="button" onClick={() => onRemove(saved)}>Remove shutoff</button>}
      </div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {active && <section className="field-section" aria-label="Fixture shutoff proposal">
      <p><strong>{formatStockLength(active.after)} final pipe cut</strong> · {dim(active.layout.exposed)} exposed · {dim(waterStop.insertion)} insertion mark.</p>
      <p>{active.scrap ? `Cut pool remnant · ${dim(active.scrap.length)}.` : "Keep the original pipe cut."} Valve mouth sits {dim(active.layout.gap)} from the finished face.</p>
      <p>Front access, outlet clearance and insertion travel are clear with the model closed.</p>
      {!!active.movement.length && <ul aria-label="Movement review">{active.movement.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      <button type="button" className="button primary" onClick={() => onApply(active)}>{saved ? "Update shutoff" : "Add shutoff"}</button>
    </section>}
    <p className="small-note">{waterStopDepthNote} <a href={waterStop.spec} target="_blank" rel="noreferrer">Dimensions and 125 psi rating</a>{" · "}
      <a href={waterStop.instructions} target="_blank" rel="noreferrer">Installation</a>{" · "}
      <a href={waterStop.listing} target="_blank" rel="noreferrer">Home Depot listing</a></p>
  </>;
}
