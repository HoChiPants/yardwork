import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { bottomPlateDisplayRuns, bottomPlateSealTitle, previewBottomPlateSeal, reviewBottomPlateSeal } from "./bottomPlateSeal";
import { bottomPlateScope, bottomPlateSealant, quartCartridgeGun } from "./bottomPlateSealReference";
import type { BottomPlateInput, BottomPlateSeal } from "./bottomPlateSealSchema";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as dim, formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { sillPlateFootprint } from "./sillGaskets";

type Proposal = ReturnType<typeof previewBottomPlateSeal>;
type Props = {
  project: Project;
  selectedPart?: string | null;
  initialId?: string;
  onSave: (proposal: Proposal) => void;
  onShow: (id: string) => void;
  onRemove: (id: string) => void;
};

export function BottomPlateSealPanel({ project, selectedPart, initialId, onSave, onShow, onRemove }: Props) {
  const [selection, setSelection] = useState(initialId ?? "");
  const plans = project.bottomPlateSeals ?? [];
  const record = plans.find(({ id }) => id === selection);
  return <>
    <h2 id="modal-title">Seal a bottom plate</h2>
    <p>Check a framed wall’s long edge where it meets the wood subfloor. The preview marks the measured bead path and any breaks.</p>
    {!!plans.length && <label className="field">Bottom plate seal plan
      <select value={selection} onChange={(event) => setSelection(event.target.value)}>
        <option value="">New seal plan</option>
        {plans.map((plan) => <option value={plan.id} key={plan.id}>{bottomPlateSealTitle(project, plan)}</option>)}
      </select>
    </label>}
    <SealForm key={selection} project={project} selectedPart={selectedPart} record={record}
      onSave={onSave} onShow={onShow} onRemove={onRemove} />
    <p className="small-note">
      {bottomPlateScope}{" "}
      <a href={bottomPlateSealant.fieldGuide} target="_blank" rel="noreferrer">PNNL bottom plate guidance</a>
      {" · "}<a href={bottomPlateSealant.specification} target="_blank" rel="noreferrer">OSI instructions</a>
      {" · "}<a href={bottomPlateSealant.listing} target="_blank" rel="noreferrer">OSI cartridge</a>
      {" · "}<a href={quartCartridgeGun} target="_blank" rel="noreferrer">Example cartridge gun</a>
    </p>
  </>;
}

function SealForm({ project, selectedPart, record, onSave, onShow, onRemove }: Omit<Props, "initialId"> & { record?: BottomPlateSeal }) {
  const plates = project.pieces.flatMap((part) => {
    const footprint = sillPlateFootprint(part);
    return footprint && footprint.length >= footprint.width ? [{ part, footprint }] : [];
  });
  const [fields, setFields] = useState<Omit<BottomPlateInput, "dryExposedWood"> & { dryExposedWood: boolean }>(() => {
    if (record) {
      const { signature: _signature, id: _id, ...input } = record;
      return input;
    }
    return {
      plateId: plates.find(({ part }) => part.id === selectedPart)?.part.id ?? plates[0]?.part.id ?? "",
      side: "a", gap: NaN, depth: NaN, bead: "3/8", session: "Wall air sealing", dryExposedWood: false,
    };
  });
  const [proposal, setProposal] = useState<{ basis: Project; value: Proposal }>();
  const [error, setError] = useState("");
  const active = proposal?.basis === project ? proposal.value : undefined;
  const saved = record && reviewBottomPlateSeal(project, record);
  const plate = plates.find(({ part }) => part.id === fields.plateId);
  function update<K extends keyof typeof fields>(key: K, value: typeof fields[K]) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setProposal(undefined);
    setError("");
  }
  function preview(event: FormEvent) {
    event.preventDefault();
    try {
      setProposal({ basis: project, value: previewBottomPlateSeal(project, fields, record?.id) });
      setError("");
    } catch (issue) {
      setProposal(undefined);
      setError(issue instanceof ZodError ? "Choose a plate and confirm the site conditions. Enter a measured gap up to ⅝ in and fill depth up to ½ in." :
        issue instanceof Error ? issue.message : "Check the plate and the measured seam.");
    }
  }
  const direction = (sign: number) => plate?.footprint.across.flatMap((value, index) =>
    Math.abs(value) < 0.3 ? [] : [`${value * sign < 0 ? "−" : "+"}${["X", "Y", "Z"][index]}`]).join(" ");
  if (!plates.length && !record)
    return <p>Add a horizontal wood bottom plate and model the subfloor sheets beneath the seam.</p>;
  return <>
    {saved?.problem && <p role="alert" className="form-error">{saved.problem}</p>}
    <form onSubmit={preview}>
      <label className="field">Wood bottom plate
        <select required value={fields.plateId} onChange={(event) => update("plateId", event.target.value)}>
          <option value="">Choose a horizontal wood plate</option>
          {record && !plate && <option value={record.plateId}>Missing bottom plate</option>}
          {plates.map(({ part }) => <option key={part.id} value={part.id}>{partLabel(project, part.id)} · {part.name}</option>)}
        </select>
      </label>
      <label className="field">Long side to seal
        <select value={fields.side} onChange={(event) => update("side", event.target.value === "b" ? "b" : "a")}>
          <option value="a">Side A{plate ? ` · toward ${direction(-1)}` : ""}</option>
          <option value="b">Side B{plate ? ` · toward ${direction(1)}` : ""}</option>
        </select>
      </label>
      <div className="water-measurement-fields">
        <LengthInput label="Widest measured gap" value={fields.gap} min={0} max={bottomPlateSealant.maxWidth} required
          onChange={(value) => update("gap", value)} />
        <LengthInput label="Measured fill depth" value={fields.depth} min={0} max={bottomPlateSealant.maxDepth} required
          onChange={(value) => update("depth", value)} />
        <label className="field">Planned bead size
          <select value={fields.bead} onChange={(event) => update("bead", event.target.value === "1/4" ? "1/4" : "3/8")}>
            <option value="1/4">¼ in · about 86 ft per cartridge</option>
            <option value="3/8">⅜ in · about 38 ft per cartridge</option>
          </select>
        </label>
        <label className="field">Work session<input value={fields.session} required maxLength={60} onChange={(event) => update("session", event.target.value)} /></label>
      </div>
      <p className="small-note">Use the same work session for seams that can share an opened cartridge.</p>
      <label className="checkbox-field"><input type="checkbox" checked={fields.dryExposedWood}
        onChange={(event) => update("dryExposedWood", event.target.checked)} />
        This is an exposed, dry wood seam in an unrated assembly
      </label>
      <div className="inline">
        <button className="button secondary" type="submit">Preview air seal</button>
        {record && saved?.layout && <button className="button secondary" type="button" onClick={() => onShow(record.id)}>Show saved seam in 3D</button>}
        {record && <button className="button secondary" type="button" onClick={() => onRemove(record.id)}>Remove plan</button>}
      </div>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {active && <section className="field-section" aria-label="Bottom plate seal preview">
      <p><strong>{formatStockLength(active.layout.clearLength)} clear for a bead</strong> along a {formatStockLength(active.layout.length)} plate edge.</p>
      <ul>{bottomPlateDisplayRuns(active.layout).map((run) => <li key={run.start}>
        {dim(run.start)} to {dim(run.end)} from start · {run.problem || "Backing and bead space clear in the model."}
      </li>)}</ul>
      <button className="button primary" type="button" onClick={() => onSave(active)}>Save air seal and show in 3D</button>
    </section>}
  </>;
}
