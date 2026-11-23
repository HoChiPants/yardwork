import { useMemo, useState } from "react";
import type { Project, WorkspaceDimension } from "./model";
import { workspaceDimensionSummary, workspaceDimensionsTitle } from "./workspaceDimensions";

function DimensionNameForm({ initialName, onSave }: { initialName: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return <form className="dimension-name-form" onSubmit={(event) => {
    event.preventDefault();
    if (name.trim()) onSave(name.trim());
  }}>
    <label className="field">
      Dimension name
      <input value={name} onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Cabinet opening" maxLength={80} required />
    </label>
    <button type="submit" className="button secondary" disabled={!name.trim()}>
      {initialName ? "Update dimension" : "Save dimension"}
    </button>
  </form>;
}

export function SavedDimensions({ project, active, canSave, onSave, onShow, onRemove, onPlanCut }: {
  project: Project;
  active?: WorkspaceDimension;
  canSave: boolean;
  onSave: (name: string) => void;
  onShow: (mark: WorkspaceDimension) => void;
  onRemove: (id: string) => void;
  onPlanCut: (id: string) => void;
}) {
  const marks = useMemo(() => (project.workspaceDimensions ?? []).map((mark) => ({
    mark, length: workspaceDimensionSummary(project, mark).length,
  })), [project]);
  return <>
    {canSave && <DimensionNameForm key={active ? active.id + active.name : "new"}
      initialName={active?.name ?? ""} onSave={onSave} />}
    {active && marks.some(({ mark, length }) => mark.id === active.id && length !== null) &&
      <button type="button" className="text-button" onClick={() => onPlanCut(active.id)}>Plan cut from saved mark</button>}
    {!!marks.length && <details>
      <summary>{workspaceDimensionsTitle} ({marks.length})</summary>
      <ul className="saved-dimension-list">
        {marks.map(({ mark, length }) => <li key={mark.id}>
          <button type="button" className="text-button" aria-pressed={mark.id === active?.id}
            onClick={() => onShow(mark)}>
            {mark.name} · {length ?? "Review points"}
          </button>
          <button type="button" className="text-button" aria-label={`Remove ${mark.name}`} onClick={() => onRemove(mark.id)}>
            Remove
          </button>
        </li>)}
      </ul>
    </details>}
  </>;
}
