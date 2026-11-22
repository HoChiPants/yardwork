import { useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { rimEdgeSealant, rimFoam, rimSealEdges, rimSealGuide, rimSealScope } from "./rimAirSealReference";
import { rimAirSealInputSchema, type RimAirSealInput, type RimSide } from "./rimAirSealSchema";
import {
  foamBlankSize, reviewRimAirSeals, rimAirSealFrame, rimAirSealKey, rimEdgeSealEstimate, saveRimAirSeal,
} from "./rimAirSeals";

type Target = Pick<RimAirSealInput, "sectionId" | "side">;
type Props = {
  project: Project;
  initialSectionId?: string;
  initialSide?: RimSide;
  onSave: (input: RimAirSealInput) => void;
  onRemove: (target: Target) => void;
  onShow: (target: Target) => void;
};

export function RimAirSealPanel({ project, initialSectionId, initialSide, ...actions }: Props) {
  const bases = project.sections.filter(({ generator }) => generator?.type === "foundation");
  const removed = [...new Set((project.rimAirSeals ?? []).map(({ input }) => input.sectionId))]
    .filter((id) => !bases.some((base) => base.id === id));
  const possible = [...bases.map(({ id, name }) => ({ id, name })), ...removed.map((id) => ({ id, name: "Removed floor base" }))];
  const [sectionId, selectSection] = useState(possible.find(({ id }) => id === initialSectionId)?.id ?? possible[0]?.id ?? "");
  const [side, selectSide] = useState<RimSide>(initialSide ??
    project.rimAirSeals?.find(({ input }) => input.sectionId === sectionId)?.input.side ?? "back");
  const target = { sectionId, side };
  const key = rimAirSealKey(target);
  const saved = useMemo(() => reviewRimAirSeals(project), [project]);
  const record = saved.rows.find(({ plan }) => rimAirSealKey(plan.input) === key);
  return <>
    <h2 id="modal-title">Plan rim air sealing</h2>
    <p className="small-note">Measure the closed openings at the rim and review the foam cuts before buying. {rimSealScope}</p>
    <p className="small-note"><a href={rimSealGuide} target="_blank" rel="noreferrer">PNNL rim joist detail</a>{" · "}
      <a href={rimSealEdges} target="_blank" rel="noreferrer">Four-edge sealing</a>{" · "}
      <a href={rimFoam.manufacturer} target="_blank" rel="noreferrer">Foam instructions</a></p>
    {possible.length ? <>
      <div className="rim-seal-fields">
        <label className="field">Floor base
          <select value={sectionId} onChange={(event) => {
            const id = event.target.value;
            selectSection(id);
            selectSide(project.rimAirSeals?.find(({ input }) => input.sectionId === id)?.input.side ?? "back");
          }}>
            {possible.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="field">Rim side
          <select value={side} onChange={(event) => selectSide(event.target.value as RimSide)}>
            <option value="back">Back rim</option>
            <option value="front">Front rim</option>
          </select>
        </label>
      </div>
      {record && <div className="notice">
        <div>
          <p><strong>Saved plan</strong> · {record.name}</p>
          {record.issues.map((issue) => <p key={issue} role="status">{issue}</p>)}
          <RimEdgeSealSummary row={record} review={saved} />
          <div className="rim-seal-actions">
            {!record.issues.length && <button type="button" className="button secondary" onClick={() => actions.onShow(target)}>Show saved foam cuts in 3D</button>}
            <button type="button" className="text-button" onClick={() => actions.onRemove(target)}>Remove saved seal plan</button>
          </div>
        </div>
      </div>}
      <RimSealMeasurements key={key} project={project} target={target} original={record?.plan.input} onSave={actions.onSave} />
    </> : <p role="status">Add a generated floor base first.</p>}
  </>;
}

type RimSealReview = ReturnType<typeof reviewRimAirSeals>;

function RimEdgeSealSummary({ row, review }: { row: RimSealReview["rows"][number]; review: RimSealReview }) {
  const estimate = rimEdgeSealEstimate(row);
  const takeoff = review.edgeSealant;
  if (!row.plan.input.edgeSeal || !takeoff) return null;
  return <div className="small-note">
    {estimate && <p>{formatStockLength(estimate.run)} along all four edges</p>}
    {takeoff.issue ? <p role="status">{takeoff.issue}</p> : takeoff.sessions.map(({ name, required }) =>
      <p key={name}><strong>{required} {required === 1 ? "can" : "cans"} estimated</strong> · {name}</p>)}
  </div>;
}

type BayDraft = RimAirSealInput["bays"][number];
function RimSealMeasurements({ project, target, original, onSave }: {
  project: Project;
  target: Target;
  original?: RimAirSealInput;
  onSave: Props["onSave"];
}) {
  const frame = useMemo(() => rimAirSealFrame(project, target.sectionId, target.side), [project, target.sectionId, target.side]);
  const [bays, setBays] = useState<BayDraft[]>(original?.bays ?? []);
  const [topInset, setTopInset] = useState(original?.topInset ?? 0);
  const [gap, setGap] = useState(original?.gap ?? NaN);
  const [kerf, setKerf] = useState(original?.kerf ?? NaN);
  const [offcut, setOffcut] = useState(original?.offcut);
  const [edgeSeal, setEdgeSeal] = useState(original?.edgeSeal);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ input: RimAirSealInput; source: Project; result: ReturnType<typeof reviewRimAirSeals> } | null>(null);
  const available = frame.bays.filter(({ issue }) => !issue);
  const livePreview = preview?.source === project ? preview : null;
  const planPreview = livePreview?.result.rows.find(({ plan }) => rimAirSealKey(plan.input) === rimAirSealKey(target));
  if (frame.issue || !available.length) return <p role="status">{frame.issue ?? "Review the joist ends to restore a rectangular opening."}</p>;

  function updateBay(bay: BayDraft) {
    setBays((previous) => previous.map((row) => row.left === bay.left && row.right === bay.right ? bay : row));
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPreview(null);
    const selected = bays.filter(({ left, right }) => available.some((bay) => bay.left === left && bay.right === right));
    if (!selected.length) { setError("Choose at least one clear bay and enter its measured width and height."); return; }
    const parsed = rimAirSealInputSchema.safeParse({
      ...target, topInset, gap, kerf, bays: selected, ...(offcut && { offcut }),
      ...(edgeSeal && { edgeSeal }), confirmedBacking: confirmed,
    });
    if (!parsed.success) {
      const sealIssue = parsed.error.issues.find(({ path }) => path[0] === "edgeSeal");
      setError(sealIssue
        ? gap > rimEdgeSealant.maxGap ? "Use a clearance of 1 in or less with this sealant estimate."
          : "Enter the seal depth, usable trial length per can and work session. The fill depth fits within the 2 in insert."
        : "Enter the measured width and height for each selected bay, the top offset, edge clearance and cutting loss. Check the offcut dimensions and field confirmation.");
      return;
    }
    try {
      const next = saveRimAirSeal(project, parsed.data);
      setPreview({ input: parsed.data, source: project, result: reviewRimAirSeals(next) });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review these measurements.");
    }
  }

  return <form className="rim-seal-form" noValidate onSubmit={review} onChangeCapture={() => { setPreview(null); setError(""); }}>
    <div className="rim-seal-fields">
      <LengthInput label="Opening top below rim top" value={topInset} min={0} max={48} onChange={setTopInset} />
      <LengthInput label="Clearance per edge" value={gap} max={8} onChange={setGap} />
      <LengthInput label="Measured cutting loss" value={kerf} min={0} max={1} onChange={setKerf} />
    </div>
    <p className="small-note">Use the same top offset for the bays in this plan. Enter zero cutting loss only if your cutting method leaves zero loss in a trial cut.</p>
    <fieldset>
      <legend>Measured openings</legend>
      {frame.bays.map((bay) => {
        const { label, left, right } = bay;
        const draft = bays.find((row) => row.left === left && row.right === right);
        return <div className="rim-seal-bay" key={bay.id}>
          <label className="rim-seal-check">
            <input type="checkbox" checked={!!draft && !bay.issue} disabled={!!bay.issue}
              aria-label={`Include ${label}`} onChange={(event) => {
                if (event.target.checked) setBays([...bays, { left, right, width: NaN, height: NaN }]);
                else setBays(bays.filter((row) => row.left !== left || row.right !== right));
              }} />
            <span><strong>{label}</strong> · {bay.issue ?? `${foamBlankSize(bay.width, bay.top - bay.bottom)} modeled space`}</span>
          </label>
          {draft && !bay.issue && <div className="rim-seal-fields">
            <LengthInput label={`${label} measured width`} value={draft.width} min={0.01} max={600}
              onChange={(width) => updateBay({ ...draft, width })} />
            <LengthInput label={`${label} measured height`} value={draft.height} min={0.01} max={48}
              onChange={(height) => updateBay({ ...draft, height })} />
          </div>}
        </div>;
      })}
    </fieldset>
    <label className="rim-seal-check">
      <input type="checkbox" checked={!!offcut} onChange={(event) =>
        setOffcut(event.target.checked ? { label: "", width: NaN, length: NaN } : undefined)} />
      <span>Try a measured 2 in foam offcut first</span>
    </label>
    {offcut && <div className="rim-seal-fields">
      <label className="field">Offcut label
        <input value={offcut.label} maxLength={60} onChange={(event) => setOffcut({ ...offcut, label: event.target.value })} />
      </label>
      <LengthInput label="Offcut width" value={offcut.width} max={rimFoam.width} onChange={(width) => setOffcut({ ...offcut, width })} />
      <LengthInput label="Offcut length" value={offcut.length} max={rimFoam.length} onChange={(length) => setOffcut({ ...offcut, length })} />
    </div>}
    <label className="rim-seal-check">
      <input type="checkbox" checked={!!edgeSeal} onChange={(event) =>
        setEdgeSeal(event.target.checked ? { depth: NaN, trialLengthPerCan: NaN, session: "Rim sealing" } : undefined)} />
      <span>Estimate edge sealant</span>
    </label>
    {edgeSeal && <fieldset>
      <legend>{rimEdgeSealant.name}</legend>
      <p className="small-note">Use a matching scrap to check adhesion. Enter the usable cured length from one can at the same gap and fill depth. Give plans the same work-session name when they can share opened cans. <a href={rimEdgeSealant.instructions} target="_blank" rel="noreferrer">Product instructions</a></p>
      <div className="rim-seal-fields">
        <LengthInput label="Seal fill depth" value={edgeSeal.depth} max={rimFoam.thickness}
          onChange={(depth) => setEdgeSeal({ ...edgeSeal, depth })} />
        <LengthInput label="Usable trial length per can" value={edgeSeal.trialLengthPerCan} defaultUnit="ft"
          onChange={(trialLengthPerCan) => setEdgeSeal({ ...edgeSeal, trialLengthPerCan })} />
        <label className="field">Sealant work session
          <input value={edgeSeal.session} maxLength={60} onChange={(event) => setEdgeSeal({ ...edgeSeal, session: event.target.value })} />
        </label>
      </div>
    </fieldset>}
    <label className="rim-seal-check">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I checked this air barrier boundary, measured the openings, and verified continuous backing and access on all four edges.</span>
    </label>
    <button type="submit" className="button secondary" disabled={!confirmed}>Check fit and plan cuts</button>
    {error && <p role="alert" className="form-error">{error}</p>}
    {livePreview && planPreview && <section className="rim-seal-results" aria-label="Rim seal cut preview">
      <h3>Foam cuts</h3>
      <ul>{planPreview.cuts.map((cut) => <li key={cut.id}>
        {cut.name} · {foamBlankSize(cut.width, cut.length)} · seal all four edges
      </li>)}</ul>
      <p>{livePreview.result.sheets.length} new {livePreview.result.sheets.length === 1 ? "sheet" : "sheets"} for the reviewed plans ·{" "}
        {livePreview.result.scraps.length} measured {livePreview.result.scraps.length === 1 ? "offcut used" : "offcuts used"}.</p>
      {livePreview.result.needsReview && <p>Other plans need review before ordering foam for the project.</p>}
      <RimEdgeSealSummary row={planPreview} review={livePreview.result} />
      {livePreview.result.unusedOffcuts.map((label) => <p key={label}>Keep offcut {label} for a different cut.</p>)}
      {[...livePreview.result.scraps, ...livePreview.result.sheets].map(({ label, order, kerf }) => <details key={label}>
        <summary>{label} · {formatStockLength(kerf)} cutting loss</summary>
        <ol>{order.steps.filter(Boolean).map((text, index) => <li key={index}>{text}</li>)}</ol>
        {order.remnants.map((size, index) => <p key={index}>Keep reusable foam {size}.</p>)}
      </details>)}
      <button type="button" className="button primary" onClick={() => onSave(livePreview.input)}>Save rim seal plan</button>
    </section>}
  </form>;
}
