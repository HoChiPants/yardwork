import { useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { uid, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { roofVentFlashingReviews, roofVentMeasuredPosition, saveRoofVentFlashing } from "./roofVentFlashing";
import { roofVentFlashingInputSchema, type RoofVentFlashingInput, type RoofVentMeasurements } from "./roofVentFlashingSchema";
import { oateyRoofVentBoot, roofVentFlashingScope } from "./roofVentFlashingReference";

export function RoofVentFlashingPanel({ project, initialId, measuredPoint, onSave, onRemove, onShow }: {
  project: Project;
  initialId?: string;
  measuredPoint: V3 | null;
  onSave: (input: RoofVentFlashingInput, id: string) => void;
  onRemove: (id: string) => void;
  onShow: (id: string) => void;
}) {
  const reviews = roofVentFlashingReviews(project);
  const [selected, select] = useState(initialId);
  const active = reviews.find(({ plan }) => plan.id === selected);
  const panels = [...new Set(project.projectCode?.shingleRoof?.planes.flatMap(({ basis }) =>
    basis.kind === "panel" && basis.pieceId && project.pieces.some(({ id }) => id === basis.pieceId) ? [basis.pieceId] : []) ?? [])];
  return <>
    <h2 id="modal-title">Plan roof vent flashing</h2>
    <p className="small-note">{roofVentFlashingScope}</p>
    <p className="small-note">
      <a href={oateyRoofVentBoot.installation} rel="noreferrer" target="_blank">Oatey installation guidance</a>{" · "}
      <a href={oateyRoofVentBoot.integration} rel="noreferrer" target="_blank">PNNL roof penetration detail</a>
    </p>
    {!!reviews.length && <label className="field">Flashing plan
      <select value={active?.plan.id ?? ""} onChange={(event) => select(event.target.value)}>
        <option value="">New roof vent</option>
        {reviews.map(({ plan, issue }) => <option key={plan.id} value={plan.id}>
          {plan.input.label}{issue ? " · needs review" : ""}
        </option>)}
      </select>
    </label>}
    {active && <div className="motion-actions">
      <span role="status">{active.issue ?? "Roof vent flashing plan saved."}</span>
      {!active.issue && <button type="button" className="button secondary" onClick={() => onShow(active.plan.id)}>
        Show flashing and opening in 3D
      </button>}
      <button type="button" className="text-button" onClick={() => { onRemove(active.plan.id); select(undefined); }}>
        Remove flashing plan
      </button>
    </div>}
    {panels.length ? <VentMeasurements key={active?.plan.id ?? "new"} panels={panels} project={project} measuredPoint={measuredPoint}
      existing={active?.plan} onSave={(input, id) => { onSave(input, id); select(id); }} /> :
      <p role="status">Save a modeled shingle deck panel in the Roofing section of Project code.</p>}
  </>;
}

function VentMeasurements({ project, panels, existing, measuredPoint, onSave }: {
  project: Project;
  panels: string[];
  existing?: NonNullable<Project["roofVentFlashings"]>[number];
  measuredPoint: V3 | null;
  onSave: (input: RoofVentFlashingInput, id: string) => void;
}) {
  const [id] = useState(existing?.id ?? uid());
  const [input, setInput] = useState({
    label: existing?.input.label ?? "Roof vent",
    panelId: panels.includes(existing?.input.panelId ?? "") ? existing!.input.panelId : panels[0],
    across: existing?.input.across ?? NaN,
    downhill: existing?.input.downhill ?? NaN,
    outsideDiameter: existing?.input.outsideDiameter ?? NaN,
    radialClearance: existing?.input.radialClearance ?? NaN,
    flangeLeft: existing?.input.flangeLeft ?? NaN,
    flangeUphill: existing?.input.flangeUphill ?? NaN,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    source: Project; input: RoofVentFlashingInput; geometry: NonNullable<ReturnType<typeof roofVentFlashingReviews>[number]["geometry"]>;
  }>();
  const current = preview?.source === project ? preview : undefined;
  const measuredPosition = useMemo(() => measuredPoint ? roofVentMeasuredPosition(project, input.panelId, measuredPoint) : null,
    [input.panelId, measuredPoint, project]);
  function updateMeasurements(values: Partial<RoofVentMeasurements>) {
    setInput((previous) => ({ ...previous, ...values }));
    setConfirmed(false);
  }
  function applyPosition() {
    if (!measuredPosition) return;
    updateMeasurements(measuredPosition);
    setPreview(undefined);
    setError("");
  }
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const checked = roofVentFlashingInputSchema.parse({ ...input, fieldConfirmed: confirmed });
      const proposal = saveRoofVentFlashing(project, checked, id);
      const geometry = roofVentFlashingReviews(proposal).find(({ plan }) => plan.id === id)?.geometry;
      if (!geometry) throw Error("The roof opening could not be measured.");
      setPreview({ source: project, input: checked, geometry });
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "ZodError" ? cause.message :
        "Fill in the measured position, clearance and both flange edges before checking the layout.");
    }
  }
  const fields = [
    { key: "across", label: "Across from deck center", min: -1200, max: 1200 },
    { key: "downhill", label: "Downhill from deck center", min: -1200, max: 1200 },
    { key: "outsideDiameter", label: "Measured pipe outside diameter", min: 0.001, max: 6 },
    { key: "radialClearance", label: "Clearance around the pipe", min: 0, max: 1 },
    { key: "flangeLeft", label: "From pipe to left flange edge", min: 0.001, max: 18 },
    { key: "flangeUphill", label: "From pipe to uphill flange edge", min: 0.001, max: 18 },
  ] as const;
  return <form className="valley-plan" noValidate onSubmit={check}
    onChangeCapture={() => { setError(""); setPreview(undefined); }}>
    <label className="field">Plan name
      <input value={input.label} maxLength={80} onChange={(event) => setInput({ ...input, label: event.target.value })} />
    </label>
    <label className="field">Roof deck panel
      <select value={input.panelId} onChange={(event) => updateMeasurements({ panelId: event.target.value })}>
        {panels.map((id) => <option key={id} value={id}>{partLabel(project, id)}</option>)}
      </select>
    </label>
    <p className="small-note">Measure along the deck surface from the center of the selected face. Across is positive to your right while facing downhill.</p>
    {measuredPosition && <button type="button" className="text-button" onClick={applyPosition}>Use measured point on this panel</button>}
    <div className="valley-fields">
      {fields.map(({ key, label, min, max }) => <LengthInput key={key} label={label} min={min} max={max}
        value={input[key]} onChange={(value) => updateMeasurements({ [key]: value })} />)}
    </div>
    <label className="valley-check">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span>I measured a vertical pipe and checked the delivered collar, flange seating and deck backing.</span>
    </label>
    <button type="submit" className="button secondary" disabled={!confirmed}>Check the opening and flashing</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {current && <section className="valley-results" aria-label="Roof vent flashing preview">
      <h3>Measured opening envelope</h3>
      <p>{formatStockLength(current.geometry.openingWidth)} across × {formatStockLength(current.geometry.openingLength)} downhill</p>
      <p>Center the envelope {formatStockLength(current.geometry.openingShift)} downhill from the pipe center on the upper face.</p>
      <p>Check the marked opening against the actual pipe and flange before cutting the deck.</p>
      <button type="button" className="button primary" onClick={() => onSave(current.input, id)}>Save roof vent flashing plan</button>
    </section>}
  </form>;
}
