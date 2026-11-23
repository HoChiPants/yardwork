import { useState, type FormEvent } from "react";
import { configuredLidTravel } from "./lidMotion";
import type { Project } from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { attachedLidMotion, saveSeatLidTest, type SeatLidTestStart } from "./seatLidMotions";

export function SeatLidMotionEditor({ project, selectedIds, existing, start, onSaved, onRemove, onCancel }: {
  project: Project;
  selectedIds: readonly string[];
  existing?: MotionPlan;
  start?: SeatLidTestStart;
  onSaved: (result: ReturnType<typeof saveSeatLidTest>) => void;
  onRemove: (plan: MotionPlan) => void;
  onCancel: () => void;
}) {
  const choices = project.sections.filter(({ recipe }) => recipe?.openingLid);
  const initialSection = existing?.mechanism.kind === "hinge" ? existing.mechanism.seatLid?.sectionId : undefined;
  const [sectionId, setSectionId] = useState(initialSection ?? start?.sectionId ??
    choices.find(({ pieceIds }) => selectedIds.some((id) => pieceIds.includes(id)))?.id ?? choices[0]?.id ?? "");
  const [other, setOther] = useState(start?.companionSectionId ?? "");
  const [angle, setAngle] = useState(existing?.mechanism.travel ?? configuredLidTravel(project, sectionId));
  const [error, setError] = useState("");
  const current = choices.find(({ id }) => id === sectionId);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      onSaved(saveSeatLidTest(project, sectionId, angle, other || undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check the selected seat lid and hinge.");
    }
  }

  return <>
    <form className="field-section" aria-label="Connect storage lids" onSubmit={save}>
      <h4>Storage lids in movement tests</h4>
      <p className="small-note">Use each lid’s saved hinge or its provisional rear pivot. Open the individual lid check to review stays, stops and hardware.</p>
      <label className="field">Seat lid
        <select required value={current?.id ?? ""} disabled={!!existing} onChange={({ currentTarget }) => {
          const id = currentTarget.value;
          setSectionId(id);
          setAngle(attachedLidMotion(project, id)?.mechanism.travel ?? configuredLidTravel(project, id));
          if (other === id) setOther("");
          setError("");
        }}>
          {!current && <option value="">Restore the saved seat lid</option>}
          {choices.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="field">Lid travel (degrees)
        <input type="number" required min={1} max={90} step="any" value={angle}
          onChange={({ currentTarget }) => setAngle(currentTarget.valueAsNumber || 0)} />
      </label>
      {choices.length > 1 && <label className="field">Also test with
        <select value={other} onChange={({ currentTarget }) => { setOther(currentTarget.value); setError(""); }}>
          <option value="">Only this lid</option>
          {choices.filter(({ id }) => id !== sectionId).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
      <div className="motion-actions">
        <button type="submit" className="button primary" disabled={!current}>
          {other ? "Save paired lid test" : existing ? "Update lid motion" : "Add lid movement"}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {existing && <button type="button" className="text-button" onClick={() => onRemove(existing)}>Remove linked lid movement</button>}
  </>;
}
