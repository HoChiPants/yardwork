import { useMemo, useState, type FormEvent } from "react";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { woodGlue } from "./woodGlueReference";
import {
  formatGlueArea, glueFaceMarker, glueFaceSequence, modeledGlueGuideLines, modeledGluePlan,
  modeledGlueSummary, saveGlueFaces, woodGlueFaces, type GlueFaceMarker,
} from "./woodGlueFaces";
import type { GlueFacesInput } from "./woodJointDecisionSchema";
import type { WoodJointDecisionEntry } from "./woodJointDecisions";

export function PrintWoodGlueFaces({ project }: { project: Project }) {
  const plan = useMemo(() => modeledGluePlan(project), [project]);
  if (!plan) return null;
  return <section className="wood-glue-faces-print">
    <h2>Measured glue faces</h2>
    <p>{woodGlue.scope} {glueFaceSequence}</p>
    <ul>{modeledGlueGuideLines(project, plan).map((line) => <li key={line}>{line}</li>)}</ul>
    <p><a href={woodGlue.specification}>Titebond application and coverage</a></p>
  </section>;
}

const eligible = (row: WoodJointDecisionEntry) => row.status === "current" && row.decision.method === "glue";

export function WoodGlueFacesPanel({ project, joints, jointId, onChange, onShow }: {
  project: Project;
  joints: WoodJointDecisionEntry[];
  jointId?: string;
  onChange: (next: Project) => void;
  onShow: (marker: GlueFaceMarker | null) => void;
}) {
  const [open, setOpen] = useState(!!jointId);
  const [choice, setChoice] = useState(jointId ?? "");
  const current = joints.filter(eligible);
  const selected = current.find(({ id }) => id === choice) ?? current[0];
  const plan = useMemo(() => open ? modeledGluePlan(project, joints) : null, [open, project, joints]);
  if (!current.length && !joints.some(({ decision }) => decision.glueFaces)) return null;
  return <details open={open} className="field-section" onToggle={({ currentTarget }) => {
    setOpen(currentTarget.open);
    if (!currentTarget.open) onShow(null);
  }}>
    <summary>Plan glue on actual faces</summary>
    {open && <>
      {current.length > 0 && <label className="field">Glue joint
        <select value={selected.id} onChange={({ currentTarget }) => {
          setChoice(currentTarget.value);
          onShow(null);
        }}>
          {current.map(({ id, title }) => <option value={id} key={id}>{title}</option>)}
        </select>
      </label>}
      {selected && <GlueFaceEditor key={`${selected.id}/${selected.decision.contactSignature}`} project={project} joint={selected} onChange={onChange} onShow={onShow} />}
      {plan && <section aria-label="Saved glue faces" className="field-section">
        <h4>Saved glue faces</h4>
        <p>{modeledGlueSummary(plan)}</p>
        <ul>{plan.rows.map(({ entry, detail, issue }) => <li key={entry.id}>
          {entry.title} · {detail ? formatGlueArea(detail.area) : issue}{" "}
          <button type="button" className="text-button" onClick={() => {
            onShow(null);
            onChange(saveGlueFaces(project, entry.id, null));
          }}>Remove glue faces</button>
        </li>)}</ul>
      </section>}
    </>}
  </details>;
}

function GlueFaceEditor({ project, joint, onChange, onShow }: {
  project: Project;
  joint: WoodJointDecisionEntry;
  onChange: (next: Project) => void;
  onShow: (marker: GlueFaceMarker | null) => void;
}) {
  const { firstId, secondId, glueFaces: saved, contactSignature } = joint.decision;
  const first = project.pieces.find(({ id }) => id === firstId);
  const second = project.pieces.find(({ id }) => id === secondId);
  const faces = useMemo(() => first && second ? woodGlueFaces(first, second) : [], [first, second]);
  const savedCurrent = saved?.contactSignature === contactSignature ? saved : undefined;
  const [selectedFaces, setSelectedFaces] = useState(() => savedCurrent?.faceIds ?? faces.map(({ id }) => id));
  const [coat, setCoat] = useState<GlueFacesInput["coat"]>(savedCurrent?.coat ?? "first");
  const [extra, setExtra] = useState(savedCurrent?.extraPercent ?? 0);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [shownId, setShownId] = useState<string>();
  const chosen = faces.filter(({ id }) => selectedFaces.includes(id));
  const total = chosen.reduce((sum, { area }) => sum + area, 0) * (coat === "both" ? 2 : 1);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setConfirmation("");
    try {
      const next = saveGlueFaces(project, joint.id, { faceIds: selectedFaces, coat, extraPercent: extra });
      onShow(null);
      setShownId(undefined);
      onChange(next);
      setConfirmation("Glue faces saved in the build guide.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the selected glue faces.");
    }
  }

  return <form onSubmit={save} onChange={() => { setError(""); setConfirmation(""); }}>
    <p className="small-note">Choose the contact faces to coat. The modeled area follows the retained wood around cuts and openings.</p>
    <label className="field">Apply glue to
      <select value={coat} onChange={({ currentTarget }) => setCoat(currentTarget.value as GlueFacesInput["coat"])}>
        <option value="first">{partLabel(project, firstId)} · {first?.name}</option>
        <option value="second">{partLabel(project, secondId)} · {second?.name}</option>
        <option value="both">Both parts</option>
      </select>
    </label>
    <p className="small-note">Face directions are shown on {partLabel(project, firstId)}.</p>
    <ul aria-label="Available glue faces">
      {faces.map((face) => <li key={face.id}>
        <label className="checkbox-field">
          <input type="checkbox" checked={selectedFaces.includes(face.id)}
            onChange={({ currentTarget }) => {
              const checked = currentTarget.checked;
              setSelectedFaces((previous) => checked ? [...previous, face.id] : previous.filter((id) => id !== face.id));
            }} />
          {face.label} · {formatGlueArea(face.area)}
        </label>
        <button type="button" className="text-button" onClick={() => {
          const id = shownId === face.id ? undefined : face.id;
          setShownId(id);
          onShow(id ? glueFaceMarker(face, partLabel(project, firstId)) : null);
        }}>{shownId === face.id ? "Hide glue face" : "Show glue face in 3D"}</button>
      </li>)}
    </ul>
    <label className="field">Glue allowance (%)
      <input type="number" min={0} max={100} step="any" value={Number.isFinite(extra) ? extra : ""}
        onChange={({ currentTarget }) => setExtra(currentTarget.valueAsNumber)} required />
    </label>
    <p>Area to coat · <output aria-label="Modeled glue area">{formatGlueArea(total)}</output></p>
    <button type="submit" className="button primary" disabled={!chosen.length || chosen.length !== selectedFaces.length}>Save glue faces</button>
    {error && <p role="alert" className="form-error">{error}</p>}
    {confirmation && <p role="status" className="small-note">{confirmation}</p>}
  </form>;
}
