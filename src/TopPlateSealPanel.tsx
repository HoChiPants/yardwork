import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as inches, formatStockLength as span } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { sillPlateFootprint } from "./sillGaskets";
import { drywallPlateDetails, previewTopPlateSeal, reviewTopPlateSeal, topPlateSealTitle } from "./topPlateSeal";
import type { DrywallPlateFace, TopPlateInput, TopPlateSeal } from "./topPlateSealSchema";

type Proposal = ReturnType<typeof previewTopPlateSeal>;
type Props = {
  project: Project;
  selectedPart?: string | null;
  initialId?: string;
  face: DrywallPlateFace;
  onSave: (draft: Proposal) => void;
  onShow: (id: string) => void;
  onRemove: (id: string) => void;
};

export function TopPlateSealPanel({ initialId, ...props }: Props) {
  const { key, scope, fieldGuide } = drywallPlateDetails[props.face];
  const plans = props.project[key] ?? [];
  const name = props.face === "top" ? "Top" : "Bottom";
  const [selection, setSelection] = useState(initialId ?? "");
  return <>
    <h2 id="modal-title">Seal a {props.face} plate to drywall</h2>
    <p>Use the modeled wall face to lay out the bead before the drywall goes up.</p>
    {!!plans.length && <label className="field">{name} plate seal plan
      <select value={selection} onChange={(event) => setSelection(event.target.value)}>
        <option value="">New seal plan</option>
        {plans.map((plan) => <option key={plan.id} value={plan.id}>{topPlateSealTitle(props.project, plan, props.face)}</option>)}
      </select>
    </label>}
    <SealForm key={selection} {...props} record={plans.find(({ id }) => id === selection)} />
    <p className="small-note">{scope}{" "}
      <a href={fieldGuide} target="_blank" rel="noreferrer">PNNL drywall-to-plate guidance</a>{" · "}
      <a href={bottomPlateSealant.specification} target="_blank" rel="noreferrer">OSI instructions and coverage</a>
    </p>
  </>;
}

function SealForm({ project, selectedPart, record, face, onSave, onShow, onRemove }: Omit<Props, "initialId"> & { record?: TopPlateSeal }) {
  const plates = project.pieces.flatMap((part) => {
    const footprint = sillPlateFootprint(part);
    return footprint && footprint.length >= footprint.width ? [{ part, footprint }] : [];
  });
  const [fields, setFields] = useState<Omit<TopPlateInput, "dryInteriorBeforeDrywall"> & { dryInteriorBeforeDrywall: boolean }>(() => {
    if (record) {
      const { signature: _signature, id: _id, ...values } = record;
      return values;
    }
    return {
      plateId: plates.find(({ part }) => part.id === selectedPart)?.part.id ?? plates[0]?.part.id ?? "",
      side: "a", bead: "1/4", gap: NaN, depth: NaN, session: "Wall air sealing", dryInteriorBeforeDrywall: false,
    };
  });
  const [proposal, setProposal] = useState<{ basis: Project; value: Proposal }>();
  const [error, setError] = useState("");
  const saved = record && reviewTopPlateSeal(project, record, face);
  const active = proposal?.basis === project ? proposal.value : undefined;
  const chosen = plates.find(({ part }) => part.id === fields.plateId);
  const direction = (sign: number) => chosen?.footprint.across.flatMap((amount, axis) =>
    Math.abs(amount) < 0.3 ? [] : [`${sign * amount < 0 ? "−" : "+"}${["X", "Y", "Z"][axis]}`]).join(" ");

  function update<K extends keyof typeof fields>(key: K, value: typeof fields[K]) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setProposal(undefined);
    setError("");
  }
  function preview(event: FormEvent) {
    event.preventDefault();
    try {
      setProposal({ basis: project, value: previewTopPlateSeal(project, fields, record?.id, face) });
    } catch (issue) {
      setProposal(undefined);
      setError(issue instanceof ZodError ? "Choose a wood plate, enter the measured joint dimensions and confirm the work conditions." :
        issue instanceof Error ? issue.message : "Check the plate, drywall and joint measurements.");
    }
  }
  if (!plates.length && !record) return <p>Add a horizontal wood plate and position the drywall along its wall face.</p>;
  return <>
    {saved?.problem && <p role="alert" className="form-error">{saved.problem}</p>}
    <form onSubmit={preview}>
      <label className="field">Wood {face} plate<select required value={fields.plateId} onChange={(event) => update("plateId", event.target.value)}>
        <option value="">Choose a wood plate</option>
        {record && !chosen && <option value={record.plateId}>Missing {face} plate</option>}
        {plates.map(({ part }) => <option key={part.id} value={part.id}>{partLabel(project, part.id)} · {part.name}</option>)}
      </select></label>
      <label className="field">Long side to seal<select value={fields.side} onChange={(event) => update("side", event.target.value === "b" ? "b" : "a")}>
        <option value="a">Side A{chosen ? ` · toward ${direction(-1)}` : ""}</option>
        <option value="b">Side B{chosen ? ` · toward ${direction(1)}` : ""}</option>
      </select></label>
      <div className="water-measurement-fields">
        <LengthInput label="Widest measured gap" value={fields.gap} min={0} max={bottomPlateSealant.maxWidth} required onChange={(value) => update("gap", value)} />
        <LengthInput label="Measured fill depth" value={fields.depth} min={0} max={bottomPlateSealant.maxDepth} required onChange={(value) => update("depth", value)} />
        <label className="field">Planned bead size<select value={fields.bead} onChange={(event) => update("bead", event.target.value === "3/8" ? "3/8" : "1/4")}>
          <option value="1/4">¼ in · about 86 ft per cartridge</option>
          <option value="3/8">⅜ in · about 38 ft per cartridge</option>
        </select></label>
        <label className="field">Work session<input required maxLength={60} value={fields.session} onChange={(event) => update("session", event.target.value)} /></label>
      </div>
      <p className="small-note">Use the same work session for top and bottom plate beads that can share a cartridge.</p>
      <label className="checkbox-field"><input type="checkbox" checked={fields.dryInteriorBeforeDrywall} onChange={(event) => update("dryInteriorBeforeDrywall", event.target.checked)} />
        This is a dry, unrated interior detail and the {face} plate face will be accessible before hanging drywall
      </label>
      <div className="inline">
        <button className="button secondary" type="submit">Preview {face} plate seal</button>
        {record && saved?.layout && <button className="button secondary" type="button" onClick={() => onShow(record.id)}>Show saved seam in 3D</button>}
        {record && <button className="button secondary" type="button" onClick={() => onRemove(record.id)}>Remove plan</button>}
      </div>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {active && <section className="field-section" aria-label={`${face === "top" ? "Top" : "Bottom"} plate seal preview`}>
      <p><strong>{span(active.layout.clearLength)} clear for a bead</strong> on a {span(active.layout.length)} plate edge.</p>
      <ul>{active.layout.runs.map((run) => <li key={run.start}>{inches(run.start)} to {inches(run.end)} from start · {
        run.problem || `Drywall ${partLabel(project, run.panelId!)} covers the bead band.`
      }</li>)}</ul>
      <button className="button primary" type="button" onClick={() => onSave(active)}>Save {face} plate seal and show in 3D</button>
    </section>}
  </>;
}
