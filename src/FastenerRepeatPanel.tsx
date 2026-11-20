import { useMemo, useState } from "react";
import {
  applyFastenerRepeat,
  fastenerRepeatKind,
  previewFastenerRepeat,
} from "./fastenerRepeat";
import type { FastenerPlan } from "./fasteningSchema";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

export function FastenerRepeatPanel({
  project,
  plan,
  disabled,
  onChange,
  onBeforeApply,
}: {
  project: Project;
  plan: FastenerPlan;
  disabled: boolean;
  onChange: (next: Project) => void;
  onBeforeApply: () => void;
}) {
  const [preview, setPreview] = useState<ReturnType<
    typeof previewFastenerRepeat
  > | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [floorAccess, setFloorAccess] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const kind = useMemo(
    () => fastenerRepeatKind(project, plan),
    [project, plan],
  );
  if (!kind) return null;
  const matches = preview?.rows.filter(({ target }) => target !== null) ?? [];
  const skipped = preview?.rows.filter(({ target }) => target === null) ?? [];
  const needsFloorAccess = preview?.rows.some(
    ({ section, target }) =>
      selected.includes(section.id) && target?.floorAccess,
  );

  function findMatches() {
    setPreview(null);
    setMessage("");
    setError("");
    setFloorAccess(false);
    try {
      const next = previewFastenerRepeat(project, plan.id);
      setPreview(next);
      setSelected(
        next.rows
          .filter(({ target }) => target)
          .map(({ section }) => section.id),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not check matching joints.",
      );
    }
  }

  function copyMarks() {
    if (!preview) return;
    setError("");
    try {
      const next = applyFastenerRepeat(project, preview, selected, floorAccess);
      onBeforeApply();
      onChange(next);
      setMessage(
        `Copied ${selected.length * plan.locations.length} screw marks across ${selected.length} ${selected.length === 1 ? "joint" : "joints"}. Review seating and pilot depth on each new plan.`,
      );
      setPreview(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not copy these marks.",
      );
    }
  }

  return (
    <details className="field-section">
      <summary>
        {kind === "roof" ? "Repeat on this roof" : "Repeat in matching modules"}
      </summary>
      <p className="small-note">
        Copy the saved entry points to matching joints in this design. Each
        joint gets its own plan and seating and pilot review.
      </p>
      {disabled && (
        <p className="small-note">Save or discard the edits above first.</p>
      )}
      <button
        type="button"
        className="button secondary full"
        disabled={disabled}
        onClick={findMatches}
      >
        Find matching joints
      </button>
      {preview && (
        <div className="attachment-plan">
          {kind === "roof" && (
            <p className="small-note">
              {matches.length} matching{" "}
              {matches.length === 1 ? "joint" : "joints"}. Choose where to copy
              the marks.
            </p>
          )}
          {(kind === "roof" ? matches : preview.rows).map(
            ({ section, target, issue }) =>
              target ? (
                <label className="checkbox-field" key={section.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(section.id)}
                    disabled={disabled}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((current) =>
                        checked
                          ? [...current, section.id]
                          : current.filter((id) => id !== section.id),
                      );
                    }}
                  />
                  <span>
                    <strong>{section.jointLabel ?? section.name}</strong>
                    <br />
                    {partLabel(project, target.head.id)} →{" "}
                    {partLabel(project, target.receiver.id)} ·{" "}
                    {target.plan.locations.length}{" "}
                    {target.plan.locations.length === 1 ? "mark" : "marks"}
                    {target.floorAccess && " · Floor-side access"}
                  </span>
                </label>
              ) : (
                <p key={section.id} className="small-note">
                  <strong>{section.name}</strong> · {issue}
                </p>
              ),
          )}
          {needsFloorAccess && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={floorAccess}
                disabled={disabled}
                onChange={(event) => setFloorAccess(event.target.checked)}
              />
              Drive the floor-side entries before setting down the assembly.
            </label>
          )}
          <button
            type="button"
            className="button primary full"
            disabled={
              disabled ||
              !selected.length ||
              (!!needsFloorAccess && !floorAccess)
            }
            onClick={copyMarks}
          >
            Copy screw marks
          </button>
          {kind === "roof" && skipped.length > 0 && (
            <details open={!matches.length || undefined}>
              <summary>
                {skipped.length} {skipped.length === 1 ? "joint" : "joints"} to
                review
              </summary>
              {skipped.map(({ section, issue }) => (
                <p key={section.id} className="small-note">
                  <strong>{section.name}</strong> · {issue}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="small-note" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
