import { useMemo, useState } from "react";
import {
  checkGreenhouseDoorSeal,
  doorSealInstallScope,
  doorSealMotionScope,
  removeGreenhouseDoorSeal,
  reviewGreenhouseDoorSeal,
  saveGreenhouseDoorSeal,
} from "./greenhouseDoorSeal";
import { doorSeal } from "./greenhouseDoorSealReference";
import type { MotionPreview } from "./mechanismMotion";
import { formatPreciseInches as inches } from "./measurement";
import type { Project } from "./model";
import type { MotionPlan } from "./motionPlanSchema";

export function GreenhouseDoorSealPanel({ project, motion, onChange, onPreview }: {
  project: Project;
  motion: MotionPlan;
  onChange: (next: Project) => void;
  onPreview: (preview: MotionPreview) => void;
}) {
  const entryId = motion.mechanism.kind === "hinge" ? motion.mechanism.greenhouseDoor?.entryId : undefined;
  const saved = project.greenhouseDoorSeals?.find((seal) => seal.entryId === entryId);
  const review = useMemo(() =>
    saved?.motionId === motion.id ? reviewGreenhouseDoorSeal(project, saved) : undefined,
  [project, saved, motion.id]);
  const [draft, setDraft] = useState<{ project: Project; check: ReturnType<typeof checkGreenhouseDoorSeal> }>();
  const [error, setError] = useState("");
  if (!entryId) return null;
  const latest = draft?.project === project ? draft.check : undefined;
  const result = latest ?? review;
  const inspect = latest?.preview ?? review?.preview;

  function save() {
    try {
      onChange(saveGreenhouseDoorSeal(project, motion.id));
      setDraft(undefined);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review the weatherseal before saving.");
    }
  }

  return (
    <details className="field-section">
      <summary>Plan door weatherseal</summary>
      <section aria-label="Greenhouse door weatherseal">
        <p className="small-note">{doorSeal.name} · ⅛–¼ in closed gap.</p>
        {saved && saved.motionId !== motion.id && (
          <p className="small-note">This door has a weatherseal saved on another swing. Check this swing to update it.</p>
        )}
        {result && (
          <>
            <p role="status">{result.detail}</p>
            {result.rows.length > 0 && (
              <ul aria-label="Weatherseal runs">
                {result.rows.map((row) => (
                  <li key={row.role}>
                    <strong>{row.name}</strong>
                    <p className="small-note">
                      {row.mount} · {inches(row.length)} long · {inches(row.gap)} closed gap
                      {" · "}{inches(row.overlap)} common mounting width.
                    </p>
                    {row.issues.map((issue) => <p key={issue} className="small-note">{issue}</p>)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="button-row">
          <button type="button" className="button secondary small" onClick={() => {
            setDraft({ project, check: checkGreenhouseDoorSeal(project, motion) });
            setError("");
          }}>
            Check weatherseal fit
          </button>
          {inspect && (
            <button type="button" className="button secondary small" onClick={() => onPreview(inspect())}>
              Inspect seal clearance in 3D
            </button>
          )}
          {latest?.ready && (
            <button type="button" className="button secondary small" onClick={save}>Save weatherseal plan</button>
          )}
          {saved && (
            <button type="button" className="text-button" onClick={() => {
              setDraft(undefined);
              setError("");
              onChange(removeGreenhouseDoorSeal(project, entryId));
            }}>
              Remove weatherseal plan
            </button>
          )}
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <p className="small-note">{doorSealMotionScope} {doorSealInstallScope}</p>
        <p className="small-note">
          <a href={doorSeal.instructions} target="_blank" rel="noreferrer">Frost King instructions</a>
          {" · "}<a href={doorSeal.listing} target="_blank" rel="noreferrer">Home Depot weatherseal</a>
        </p>
      </section>
    </details>
  );
}
