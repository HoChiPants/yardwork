import { useState, type FormEvent } from "react";
import {
  floorRegisterCutoutLabel, floorRegisterCutoutUse, floorRegisterReviews, floorRegisterSealMethod, isFloorRegisterPanel,
  previewFloorRegister, type FloorRegisterPreview,
} from "./floorRegister";
import { floorRegisterBoot, floorRegisterScope } from "./floorRegisterReference";
import type { FloorRegisterMeasurements } from "./floorRegisterSchema";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import { partLabel } from "./partLabels";

const fields = [
  ["fromLeft", "From low X edge", 0, 240],
  ["fromFront", "From low Z edge", 0, 240],
  ["openingLength", "Opening along X", 0.125, 48],
  ["openingWidth", "Opening along Z", 0.125, 48],
  ["throatLength", "Throat along X", 0.125, 48],
  ["throatWidth", "Throat along Z", 0.125, 48],
  ["bodyLength", "Body along X", 0.125, 48],
  ["bodyWidth", "Body along Z", 0.125, 48],
  ["depth", "Body depth below sheet", 0.125, 48],
  ["bodyOffsetX", "Body center offset along X", -24, 24],
  ["bodyOffsetZ", "Body center offset along Z", -24, 24],
] as const;

export function FloorRegisterPanel({ project, panelId, initialId, onPreview, onSave, onRemove, onShow, onCutout }: {
  project: Project;
  panelId?: string;
  initialId?: string;
  onPreview: (layout?: FloorRegisterPreview) => void;
  onSave: (input: FloorRegisterMeasurements, id?: string) => void;
  onRemove: (id: string) => void;
  onShow: (id: string) => void;
  onCutout: (id: string, dimensions: V3) => void;
}) {
  const [activeId, setActiveId] = useState(initialId ?? "");
  const reviews = floorRegisterReviews(project);
  const active = reviews.find(({ plan }) => plan.id === activeId);
  const panels = project.pieces.filter(isFloorRegisterPanel);
  const initialPanel = panels.find(({ id }) => id === panelId) ?? panels[0];
  return <>
    <h2 id="modal-title">Plan floor register</h2>
    <p className="small-note">{floorRegisterScope}</p>
    {!!reviews.length && <label className="field">Register plan
      <select value={activeId} onChange={(event) => { onPreview(); setActiveId(event.target.value); }}>
        <option value="">New floor register</option>
        {reviews.map(({ plan, issue }) => <option key={plan.id} value={plan.id}>
          {partLabel(project, plan.input.panelId)} · Floor register{issue ? " · review" : ""}
        </option>)}
      </select>
    </label>}
    {active && <div className="motion-actions">
      <span role="status">{active.issue ?? "Floor register plan saved."}</span>
      {!active.issue && <button type="button" className="button secondary" onClick={() => onShow(active.plan.id)}>
        Show saved opening in 3D
      </button>}
      <button type="button" className="text-button" onClick={() => { onRemove(active.plan.id); setActiveId(""); }}>
        Remove register plan and its opening
      </button>
    </div>}
    {active?.plan.recoveredCutout ? <p className="small-note">{floorRegisterCutoutLabel(project, active.plan)}</p>
      : active && !active.issue && active.layout && <RegisterCutoutFields key={activeId}
        limits={[active.plan.input.openingLength, active.plan.input.openingWidth, active.layout.panel.size[1]]}
        onRecord={(dimensions) => onCutout(active.plan.id, dimensions)} />}
    {initialPanel ? <RegisterMeasurements key={activeId} project={project} panels={panels}
      existing={active?.plan} initialPanelId={initialPanel.id} onPreview={onPreview}
      onSave={(input) => onSave(input, active?.plan.id)} /> : <p role="status">Add a horizontal wood subfloor panel first.</p>}
    <p className="small-note">
      <a href={floorRegisterBoot.listing} target="_blank" rel="noreferrer">Master Flow end register box</a>{" · "}
      <a href={floorRegisterBoot.airSeal} target="_blank" rel="noreferrer">PNNL duct-boot sealing</a>
    </p>
  </>;
}

function RegisterCutoutFields({ limits, onRecord }: { limits: V3; onRecord: (dimensions: V3) => void }) {
  const [dimensions, setDimensions] = useState<V3>([NaN, NaN, NaN]);
  return <details className="field-section">
    <summary>Record recovered cutout</summary>
    <form className="valley-plan" onSubmit={(event) => { event.preventDefault(); onRecord(dimensions); }}>
      <p className="small-note">{floorRegisterCutoutUse} After cutting, measure the clear rectangle inside the saw kerf, starter holes and any damaged edges.</p>
      <div className="valley-fields">
        {(["Usable cutout along X", "Usable cutout along Z", "Cutout thickness"] as const).map((label, axis) => (
          <LengthInput key={label} label={label} required min={0} max={limits[axis]} value={dimensions[axis]} onChange={(value) => {
            setDimensions((previous) => previous.map((dimension, index) => index === axis ? value : dimension) as V3);
          }} />
        ))}
      </div>
      <button type="submit" className="button secondary" disabled={dimensions.some((value) => !Number.isFinite(value) || value <= 0)}>
        Add cutout to Cut pool
      </button>
    </form>
  </details>;
}

function RegisterMeasurements({ project, panels, existing, initialPanelId, onPreview, onSave }: {
  project: Project;
  panels: Project["pieces"];
  existing?: NonNullable<Project["floorRegisterPlans"]>[number];
  initialPanelId: string;
  onPreview: (layout?: FloorRegisterPreview) => void;
  onSave: (input: FloorRegisterMeasurements) => void;
}) {
  const [input, setInput] = useState<FloorRegisterMeasurements>(() => existing?.input ?? {
    panelId: initialPanelId, fromLeft: NaN, fromFront: NaN, openingLength: NaN, openingWidth: NaN,
    throatLength: NaN, throatWidth: NaN, bodyLength: NaN, bodyWidth: NaN, depth: NaN,
    bodyOffsetX: 0, bodyOffsetZ: 0,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(true);
  const [preview, setPreview] = useState<ReturnType<typeof previewFloorRegister> & { source: Project }>();
  const checked = preview?.source === project ? preview : undefined;
  function update(patch: Partial<FloorRegisterMeasurements>) {
    setInput((current) => ({ ...current, ...patch }));
    setConfirmed(false);
    setPreview(undefined);
    onPreview();
  }
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = previewFloorRegister(project, input, existing);
    setPreview({ source: project, ...result });
    onPreview(result.layout);
    if (result.layout) setEditing(false);
  }
  return <form className="valley-plan" noValidate onSubmit={check}>
    {editing ? <>
    <label className="field">Subfloor panel
      <select value={input.panelId} onChange={(event) => update({ panelId: event.target.value })}>
        {!panels.some(({ id }) => id === input.panelId) && <option value={input.panelId}>Missing panel</option>}
        {panels.map(({ id, name }) => <option key={id} value={id}>{partLabel(project, id)} · {name}</option>)}
      </select>
    </label>
    <p className="small-note">Use the panel’s local X and Z axes. Mark the near corner of the opening from the low edges. Center the throat in the opening and include the outlet in the measured body envelope.</p>
    <div className="valley-fields">
      {fields.map(([key, label, min, max]) => <LengthInput key={key} label={label} min={min} max={max}
        value={input[key]} onChange={(value) => update({ [key]: value })} />)}
    </div>
    <button type="submit" className="button secondary">Check opening and fit</button>
    </> : <button type="button" className="button secondary" onClick={() => {
      setEditing(true); setConfirmed(false); setPreview(undefined); onPreview();
    }}>Edit floor register measurements</button>}
    {checked && <section className="valley-results" aria-label="Floor register fit preview">
      {checked.issue && <p role="alert">{checked.issue}</p>}
      {checked.layout && <>
        {checked.layout.blockers.length > 0 && <p>
          Blocking parts {checked.layout.blockers.map(({ id, name }) => `${partLabel(project, id)} · ${name}`).join(", ")}.
        </p>}
        {!checked.issue && <>
          <p>No modeled part crosses the opening or body envelope.</p>
          <p>Gap per side {formatStockLength(checked.layout.nominalGap[0])} along X and {formatStockLength(checked.layout.nominalGap[1])} along Z.</p>
          <p>{formatStockLength(checked.layout.sealRun)} modeled seal path. {floorRegisterSealMethod(checked.layout)}</p>
          <label className="valley-check">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>I measured the delivered throat, the body and the outlet, and checked the surrounding framing.</span>
          </label>
          <button type="button" className="button primary" disabled={!confirmed} onClick={() => onSave(input)}>
            Save opening and seal plan
          </button>
        </>}
      </>}
    </section>}
  </form>;
}
