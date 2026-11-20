import { useMemo, useState } from "react";
import type { Project } from "./model";
import { assignGuidePlacement, guidePlacementIssues, guidePlacementTargets } from "./guidePlacement";
import { partLabel } from "./partLabels";
import "./GuidePlacementEditor.css";

export function GuidePlacementEditor({ project, pieceId, onChange, onOpenStage, onRegenerateGuide }: {
  project: Project;
  pieceId: string;
  onChange: (next: Project) => void;
  onOpenStage?: (stepId: string) => void;
  onRegenerateGuide?: () => void;
}) {
  const piece = project.pieces.find((part) => part.id === pieceId);
  const targets = useMemo(() => guidePlacementTargets(project), [project]);
  const issues = useMemo(() => guidePlacementIssues(project).filter((issue) => issue.pieceId === pieceId), [project, pieceId]);
  const [error, setError] = useState("");
  if (!piece || piece.offcut) return null;
  const key = (target: { ownerId: string; stageKey: string }) => JSON.stringify([target.ownerId, target.stageKey]);
  const selected = piece.guidePlacement;
  const current = selected ? targets.find((target) => key(target) === key(selected)) : null;
  const step = selected ? project.steps.find((entry) => entry.generated?.kind === "assembly-stage" && entry.generated.planId === selected.ownerId && entry.generated.stageKey === selected.stageKey) : null;
  return (
    <section className="field-section" aria-label="Part build stage">
      <label className="field">
        Build stage
        <select aria-label={`Build stage for ${partLabel(project, pieceId)}`} value={selected ? current ? key(selected) : "unavailable" : ""}
          onChange={(event) => {
            try {
              const target = targets.find((entry) => key(entry) === event.target.value);
              onChange(assignGuidePlacement(project, pieceId, target ? { ownerId: target.ownerId, stageKey: target.stageKey } : null));
              setError("");
            } catch (problem) { setError(problem instanceof Error ? problem.message : "Review the build-stage choice."); }
          }}>
          <option value="">Automatic from the design</option>
          {selected && !current && <option value="unavailable" disabled>Earlier stage is unavailable · choose again or clear</option>}
          {targets.map((target) => <option key={key(target)} value={key(target)}>{target.title}</option>)}
        </select>
      </label>
      <p className="small-note">This choice stays when the guide regenerates. The part's position and physical assembly stay unchanged.</p>
      {issues.map((issue) => <p key={issue.code} className="form-error" role="status">{issue.message}</p>)}
      {(selected || (current && step && onOpenStage)) && <div className="guide-placement-actions">
        {selected && <button type="button" className="text-button" onClick={() => onChange(assignGuidePlacement(project, pieceId, null))}>Use automatic stage</button>}
        {current && step && onOpenStage && <button type="button" className="text-button" onClick={() => onOpenStage(step.id)}>Open selected build stage</button>}
      </div>}
      {onRegenerateGuide && <button type="button" className="button secondary full" onClick={onRegenerateGuide}>Update build guide</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
