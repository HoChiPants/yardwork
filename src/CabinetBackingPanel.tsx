import { useMemo, useState } from "react";
import { cabinetBackingReference, cabinetBackingReviews, cabinetBackingScope, cabinetBackingWalls, previewCabinetBacking } from "./cabinetBacking";
import type { CabinetBackingInput } from "./cabinetBackingSchema";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { orientedStockSize } from "./stockAxes";
import { CabinetScrewReachFields } from "./CabinetScrewReachFields";
import "./CabinetBackingPanel.css";

type Draft = ReturnType<typeof previewCabinetBacking>;
const blankPoint = () => ({ id: crypto.randomUUID(), value: NaN });

function WallElevation({ draft }: { draft: Draft }) {
  const { elevation: { width, height, rowHeight, studs, openings, blocks }, marks } = draft;
  const rectangle = ({ left, right, low, high }: { left: number; right: number; low: number; high: number }) => ({
    left: `${50 + left / width * 100}%`, bottom: `${low / height * 100}%`,
    width: `${(right - left) / width * 100}%`, height: `${(high - low) / height * 100}%`,
  });
  return <div className="backing-elevation" style={{ maxWidth: width / height * 240 }} aria-hidden="true">
    <div className="backing-wall" style={{ aspectRatio: width / height }}>
      {openings.map((opening, index) => <span className="backing-opening" key={index} style={rectangle(opening)} />)}
      {studs.map((stud) => <span className="backing-stud" key={stud.id} style={rectangle(stud)} />)}
      {blocks.map((block) => <span className="backing-block" key={block.id} style={rectangle(block)} />)}
      <span className="backing-row" style={{ bottom: `${rowHeight / height * 100}%` }} />
      {marks.map(({ offset }, index) => <span className="backing-mark" title={`Mounting point ${index + 1}`}
        key={offset} style={{ left: `${offset / width * 100}%`, bottom: `${rowHeight / height * 100}%` }} />)}
    </div>
    <div className="backing-labels"><span>Wall start</span><span>Wall end</span></div>
  </div>;
}

export function CabinetBackingPanel({ project, wallId, height, activePlanId, onApply, onRemove, onSaveScrews, onClearScrews }: {
  project: Project;
  wallId?: string | null;
  height?: number;
  activePlanId?: string;
  onApply: (draft: Draft) => void;
  onRemove: (id: string) => void;
  onSaveScrews: (candidate: Project, source: Project) => void;
  onClearScrews: (id: string) => void;
}) {
  const walls = useMemo(() => cabinetBackingWalls(project), [project]);
  const [wall, setWall] = useState(walls.find(({ id }) => id === wallId)?.id ?? walls[0]?.id ?? "");
  const [face, setFace] = useState<CabinetBackingInput["face"]>("front");
  const [stock, setStock] = useState<CabinetBackingInput["stock"]>("two-six");
  const [rowHeight, setRowHeight] = useState(height ?? NaN);
  const [points, setPoints] = useState(() => [blankPoint(), blankPoint()]);
  const [reuse, setReuse] = useState(true);
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const activeDraft = draft?.source === project ? draft : undefined;
  const wallCommand = walls.find(({ id }) => id === wall)?.generator;
  const saved = useMemo(() => cabinetBackingReviews(project).filter(({ plan }) => plan.input.wallId === wall),
    [project, wall]);
  const focused = saved.find(({ plan }) => plan.id === activePlanId);
  function edit(fn: () => void) {
    setDraft(undefined);
    setError("");
    fn();
  }

  return <>
    <h2 id="modal-title">{focused ? "Cabinet mounting row" : "Plan wall cabinet backing"}</h2>
    {!focused && (walls.length ? <form onSubmit={(event) => {
      event.preventDefault();
      edit(() => {
        try {
          setDraft(previewCabinetBacking(project, { wallId: wall, face, stock, height: rowHeight, offsets: points.map(({ value }) => value) }, reuse));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not check these mounting points.");
        }
      });
    }}>
      <p>Use the cabinet or rail’s measured mounting points. Enter one row at a time, from the wall’s modeled base and start.</p>
      <div className="two-col">
        <label className="field">Framed wall
          <select value={wall} onChange={({ currentTarget }) => edit(() => setWall(currentTarget.value))}>
            {walls.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="field">Mounting face
          <select value={face} onChange={({ currentTarget }) => edit(() => setFace(currentTarget.value as typeof face))}>
            <option value="front">Front · local +Z</option>
            <option value="back">Back · local −Z</option>
          </select>
        </label>
        <LengthInput label="Height above wall base" value={rowHeight} max={wallCommand?.height}
          onChange={(value) => edit(() => setRowHeight(value))} required />
        <label className="field">Backing lumber
          <select value={stock} onChange={({ currentTarget }) => edit(() => setStock(currentTarget.value as typeof stock))}>
            <option value="stud">2 × 4</option>
            <option value="two-six">2 × 6</option>
          </select>
        </label>
      </div>
      <fieldset className="field-section">
        <legend>Mounting point offsets from wall start</legend>
        {points.map(({ id, value }, index) => <div className="two-col" key={id}>
          <LengthInput label={`Mounting point ${index + 1}`} value={value} max={wallCommand?.width}
            onChange={(value) => edit(() => setPoints((list) => list.map((point) => point.id === id ? { id, value } : point)))} required />
          {points.length > 1 && <button className="text-button" type="button" aria-label={`Remove mounting point ${index + 1}`}
            onClick={() => edit(() => setPoints((list) => list.filter((point) => point.id !== id)))}>Remove</button>}
        </div>)}
        {points.length < 16 && <button className="text-button" type="button" onClick={() => edit(() => setPoints((list) => [...list, blankPoint()]))}>Add mounting point</button>}
      </fieldset>
      <label className="checkbox-field">
        <input type="checkbox" checked={reuse} onChange={({ currentTarget }) => edit(() => setReuse(currentTarget.checked))} />
        Use matching Cut pool pieces
      </label>
      <button type="submit" className="button secondary">Preview mounting points and cuts</button>
    </form> : <p>Add an upright framed wall to plan its cabinet mounting points.</p>)}
    {error && <p className="form-error" role="alert">{error}</p>}
    {activeDraft && <section className="field-section" aria-label="Cabinet backing preview">
      <h3>Where each mounting point lands</h3>
      <WallElevation draft={activeDraft} />
      <ol>
        {activeDraft.marks.map(({ offset, receiver, kind, edge }) => <li key={offset}>
          <strong>{formatPreciseInches(offset)} from start</strong> · {partLabel(activeDraft.project, receiver)} · {kind === "stud" ? "existing stud" : "added backing"} · {formatPreciseInches(edge)} to nearest modeled edge
        </li>)}
      </ol>
      {activeDraft.blocks.length > 0 && <>
        <h3>Backing cuts</h3>
        <ul>
          {activeDraft.blocks.map(({ block, first, second }) => {
            const cut = activeDraft.reuseCuts.get(block.id);
            return <li key={block.id}>{partLabel(activeDraft.project, block.id)} · {formatPreciseInches(block.size[1])} square cut · between {partLabel(project, first)} and {partLabel(project, second)}
              {cut && <> · Use {cut.label}{cut.pending && " after the planned source cut"}</>}</li>;
          })}
        </ul>
        <p>{activeDraft.boards} new {stock === "two-six" ? "2 × 6" : "2 × 4"} {activeDraft.boards === 1 ? "board" : "boards"} for these blocks.</p>
        {activeDraft.offcuts.length > 0 && <p>Keep {activeDraft.offcuts.map((piece) =>
          `${partLabel(activeDraft.project, piece.id)} · ${formatPreciseInches(orientedStockSize(piece)[2])}`).join(", ")}.</p>}
      </>}
      {activeDraft.motion.length > 0 && <p role="status">Check movement against the added backing for {activeDraft.motion.join(", ")}.</p>}
      <button type="button" className="button primary" onClick={() => {
        try { onApply(activeDraft); } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not save these mounting points.");
        }
      }}>Save mounting plan{activeDraft.blocks.length > 0 && " and add blocking"}</button>
    </section>}
    {saved.length > 0 && <section className="field-section" aria-label="Saved cabinet backing">
      {!focused && <h3>Saved mounting rows</h3>}
      {(focused ? [focused] : saved).map(({ plan, issue, fastening }) => <details key={plan.id} open={plan.id === activePlanId || undefined}>
        <summary>{plan.input.face} face · {formatPreciseInches(plan.input.height)} above wall base</summary>
        {issue ? <p className="form-error">{issue}</p> : <>
          <ul>{plan.input.offsets.map((offset, index) => <li key={offset}>{formatPreciseInches(offset)} from start · {partLabel(project, plan.receivers[index])}</li>)}</ul>
          <CabinetScrewReachFields project={project} plan={plan} saved={fastening} onSave={onSaveScrews} />
        </>}
        {plan.fastening && <button className="text-button" type="button" onClick={() => edit(() => onClearScrews(plan.id))}>Clear screw measurements</button>}
        {!focused && <button className="text-button" type="button" onClick={() => edit(() => onRemove(plan.id))}>Remove mounting marks, keep blocks</button>}
      </details>)}
    </section>}
    <p className="small-note">{cabinetBackingScope} <a href={cabinetBackingReference} target="_blank" rel="noreferrer">IKEA ENHET wall preparation guide</a></p>
  </>;
}
