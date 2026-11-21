import { useState } from "react";
import { ZodError } from "zod";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as dim } from "./measurement";
import type { Project, Section } from "./model";
import { reviewWaterRun, waterSupportSpans } from "./wallWater";
import { previewWaterRun } from "./wallWaterApply";
import { nailShield, pexCutter, pexPipes, pipePlanningCover, pipeProtectionSource, studBoreSource, type PexPipeId } from "./wallWaterReference";
import { waterRunDraft, type WaterRun, type WaterRunInput } from "./wallWaterSchema";
import { waterSupportForPipe, waterSupportProducts, waterSupportReference } from "./waterSupportReference";

type Proposal = ReturnType<typeof previewWaterRun>;

export function WallWaterPanel({ project, initialWall, initialRun, onApply, onRemove }: {
  project: Project;
  initialWall: string | null;
  initialRun?: string;
  onApply: (proposal: Proposal) => void;
  onRemove: (run: WaterRun) => void;
}) {
  const walls = project.sections.filter(({ generator }) => generator?.type === "wall");
  const runs = project.waterRuns ?? [];
  const [runId, setRunId] = useState(initialRun ?? "");
  const [wallId, setWallId] = useState(walls.find(({ id }) => id === initialWall)?.id ?? walls[0]?.id ?? "");
  const run = runs.find(({ id }) => id === runId);
  const wall = walls.find(({ id }) => id === (run?.sectionId ?? wallId));
  return <>
    <h2 id="modal-title">Plan a wall water line</h2>
    {!!runs.length && <label className="field">Water line
      <select value={runId} onChange={(event) => setRunId(event.target.value)}>
        <option value="">New line</option>
        {runs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
    </label>}
    {!run && !!walls.length && <label className="field">Wall panel
      <select value={wallId} onChange={(event) => setWallId(event.target.value)}>
        {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    {wall ? <WaterRunFields key={run?.id ?? wall.id} project={project} wall={wall} run={run} onApply={onApply} />
      : <p>{run ? "This run’s original wall is missing." : "Add or trace an interior nonbearing wall before laying out a pipe."}</p>}
    {run && <button className="text-button" type="button" onClick={() => onRemove(run)}>Remove planned water line</button>}
  </>;
}

function WaterRunFields({ project, wall, run, onApply }: {
  project: Project;
  wall: Section;
  run?: WaterRun;
  onApply: (proposal: Proposal) => void;
}) {
  const width = wall.generator!.width;
  const [draft, setDraft] = useState<WaterRunInput>(() => run ? waterRunDraft(run) : {
    name: "Water supply", sectionId: wall.id, materialId: "hd-pex-u860w10", start: 3,
    end: Math.min(width - 3, 123), height: NaN, depth: 0, bore: NaN, reuse: true,
  });
  const [checkedWall, setCheckedWall] = useState(false);
  const [proposal, setProposal] = useState<{ source: Project; next: Proposal } | null>(null);
  const [error, setError] = useState("");
  const active = proposal?.source === project ? proposal.next : null;
  const savedProblem = run ? reviewWaterRun(project, run).problem : undefined;
  const pipe = pexPipes[draft.materialId];
  const isolator = waterSupportProducts[waterSupportForPipe(draft.materialId)];
  const change = <K extends keyof WaterRunInput>(key: K, value: WaterRunInput[K]) => {
    setDraft({ ...draft, [key]: value });
    setProposal(null);
    setError("");
  };
  const length = (key: "start" | "end" | "height" | "depth" | "bore", label: string, min: number, max: number) =>
    <LengthInput label={label} value={draft[key]} min={min} max={max} onChange={(value) => change(key, value)} />;
  function preview() {
    setError("");
    setProposal(null);
    try {
      const bore = draft.isolator ? waterSupportReference.bore : draft.bore;
      if (![draft.start, draft.end, draft.height, draft.depth, bore].every(Number.isFinite))
        throw Error("Enter the endpoints, measured height, depth and bore diameter.");
      if (draft.isolator && !Number.isFinite(draft.isolator.flange))
        throw Error("Measure the delivered isolator’s flange thickness and enter it before previewing.");
      setProposal({ source: project, next: previewWaterRun(project, {
        ...draft, bore: Number.isFinite(draft.bore) ? draft.bore : bore,
      }, run?.id) });
    } catch (issue) {
      setError(issue instanceof ZodError ? issue.issues[0]?.message ?? "Review the measurements."
        : issue instanceof Error ? issue.message : "The pipe layout needs review.");
    }
  }
  const spans = active ? waterSupportSpans(active.layout) : null;
  return <>
    <p>Lay out one straight PEX-B run in {wall.name}. Measure endpoints from the left of the wall elevation. Use a negative distance for a stub beyond the left end. Positive depth moves toward the front face.</p>
    {savedProblem && <p className="form-error" role="alert">{savedProblem}</p>}
    <div className="two-col">
      <label className="field">Line name<input maxLength={60} value={draft.name} onChange={(event) => change("name", event.target.value)} /></label>
      <label className="field">Pipe stock
        <select value={draft.materialId} onChange={(event) => change("materialId", event.target.value as PexPipeId)}>
          {(Object.keys(pexPipes) as PexPipeId[]).map((id) =>
            <option key={id} value={id}>{pexPipes[id].nominal} in · SharkBite {pexPipes[id].model}</option>)}
        </select>
      </label>
      {length("start", "Start from left wall end", -120, width + 120)}
      {length("end", "End from left wall end", -120, width + 120)}
      {length("height", "Pipe center above wall base", 0.125, wall.generator!.height)}
      {length("depth", "Signed depth from wall center", -9, 9)}
      {!draft.isolator && length("bore", "Measured bore diameter", 0.125, 6)}
    </div>
    <p className="small-note">{pipe.nominal} in nominal · {dim(pipe.outside)} outside diameter. <a href={`https://www.homedepot.com/p/${pipe.internet}`} target="_blank" rel="noreferrer">Home Depot product</a></p>
    <label className="checkbox-field"><input type="checkbox" checked={!!draft.isolator}
      onChange={(event) => change("isolator", event.target.checked ? { face: "start", flange: NaN } : undefined)} />
      Add a HoldRite isolator at each crossed stud
    </label>
    {draft.isolator && <div className="field-section">
      <p className="small-note">The matching isolator uses a 1⅜ in bore. The flange seats against the stud with its nail ears vertical. <a href={`https://www.homedepot.com/p/${isolator.internet}`} target="_blank" rel="noreferrer">{isolator.model} at Home Depot</a></p>
      <div className="two-col">
        <label className="field">Flange faces toward
          <select value={draft.isolator.face} onChange={(event) => change("isolator", {
            ...draft.isolator!, face: event.target.value as "start" | "end",
          })}><option value="start">Start of line</option><option value="end">End of line</option></select>
        </label>
        <LengthInput label="Measured flange thickness" min={0.001} max={0.999}
          value={draft.isolator.flange} onChange={(value) => change("isolator", { ...draft.isolator!, flange: value })} />
      </div>
    </div>}
    <label className="checkbox-field"><input type="checkbox" checked={draft.reuse ?? true} onChange={(event) => change("reuse", event.target.checked)} /> Use a matching PEX remnant from the Cut pool</label>
    <label className="checkbox-field"><input type="checkbox" checked={checkedWall} onChange={(event) => { setCheckedWall(event.target.checked); setProposal(null); }} /> I’m laying out an interior nonbearing wall with accessible framing</label>
    <button type="button" className="button secondary" disabled={!checkedWall} onClick={preview}>Preview water line</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {active && <section className="field-section" aria-label="Water-line proposal">
      <p><strong>{dim(active.layout.length)} pipe cut</strong> · {active.layout.studs.length} stud bores · {active.layout.shields.length} shield plates</p>
      <p>{active.stock ? `Use ${active.stock}.` : active.retainedCut ? "Keep the recorded pipe cut." : "Cut layout uses 10 ft sticks."} {active.remaining > 0 && `Keep ${dim(active.remaining)} for another run.`}</p>
      {!!active.layout.supports.length && <p>
        {active.layout.supports.length} HoldRite {isolator.model} isolators · {active.layout.supports.length * waterSupportReference.nailsPerSupport} flange nails specified
        {spans?.longest ? ` · Longest support span ${dim(spans.longest)}` : ""}
        {spans?.over.length ? ` · Review ${spans.over.length} above 32 in` : ""}.
      </p>}
      {spans?.tails && <p className="small-note">End reaches from nearest isolator · Start {dim(spans.tails[0])} · End {dim(spans.tails[1])}. Review fixture and connection support.</p>}
      {active.affectedConnections > 0 && <p>{active.affectedConnections} modeled connections on the replaced parts will be removed.</p>}
      <details>
        <summary>Bore marks and face protection</summary>
        <ul>{active.layout.studs.map(({ piece, opening, yMark, backMark, nearEdge }) => {
          const faces = active.layout.shields.filter(({ studId }) => studId === piece.id).map(({ face }) => face);
          return <li key={piece.id}>{piece.name} · Ø {dim(opening.diameter)} · {dim(yMark)} from stud bottom · {dim(backMark)} from back face · {dim(nearEdge)} bore-to-face wood{faces.length ? ` · NS1 on ${faces.join(" and ")}` : ""}</li>;
        })}</ul>
      </details>
      {active.layout.shields.length > 0 && <p className="small-note">Preview includes NS1 shields wherever pipe-to-face cover is below {dim(pipePlanningCover)}. <a href={nailShield.listing} target="_blank" rel="noreferrer">Shield reference</a></p>}
      <button type="button" className="button primary" onClick={() => onApply(active)}>{run ? "Update water line" : "Add water line"}</button>
    </section>}
    <p className="small-note">Check fittings, pipe supports, hidden services and the adopted code before drilling. <a href={studBoreSource} target="_blank" rel="noreferrer">Stud boring</a> · <a href={pipeProtectionSource} target="_blank" rel="noreferrer">Pipe protection</a> · <a href={pexCutter.listing} target="_blank" rel="noreferrer">PEX cutter</a></p>
  </>;
}
