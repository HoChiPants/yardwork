import { useState, type FormEvent } from "react";
import { RodSupportsPanel } from "./RodSupportsPanel";
import { RodSocketPlatesPanel } from "./RodSocketPlatesPanel";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches as inch } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { everbiltClosetRod } from "./closetRodReference";
import {
  applyRodFit,
  closetRods,
  reviewRodFit,
  rodFitScope,
  rodFlangeInstructions,
  saveRodFit,
} from "./rodFits";

function RodMeasurements({
  project,
  id,
  onChange,
}: {
  project: Project;
  id: string;
  onChange: (project: Project) => void;
}) {
  const review = reviewRodFit(project, id);
  const existing = review.plan?.measurements;
  const [values, setValues] = useState(() => ({
    measuredSpan: existing?.measuredSpan ?? NaN,
    startSetback: existing?.startSetback ?? NaN,
    endSetback: existing?.endSetback ?? NaN,
    clearance: existing?.clearance ?? NaN,
  }));
  const [basis, setBasis] = useState(existing?.basis ?? "");
  const [closedEnd, setClosedEnd] = useState(existing?.closedEnd ?? "start");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const attempt = (run: () => Project, text: string) => {
    setError("");
    setMessage("");
    try {
      onChange(run());
      setMessage(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The fit could not be saved.");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    attempt(
      () =>
        saveRodFit(project, id, {
          ...values,
          basis,
          closedEnd,
          measuredAt: new Date().toISOString(),
        }),
      "Rod measurements saved.",
    );
  };
  return (
    <>
      {review.bay && (
        <p className="small-note">
          Start {partLabel(project, review.bay.start.pieceId)} · end{" "}
          {partLabel(project, review.bay.end.pieceId)} · {inch(review.bay.span)}{" "}
          modeled opening.
        </p>
      )}
      <p className="small-note">{review.note}</p>
      {review.length !== null && (
        <p>
          <strong>Measured cut length · {inch(review.length)}</strong>
        </p>
      )}
      {review.canApply && (
        <button
          className="button secondary full"
          type="button"
          onClick={() =>
            attempt(() => applyRodFit(project, id), "Rod model updated.")
          }
        >
          Update rod to measured fit
        </button>
      )}
      {review.matchesModel &&
        review.bay?.rod.material === everbiltClosetRod.materialId &&
        !review.bay.rod.cutStock && (
          <p className="small-note">
            Apply the fit to each rod on the same stock tube, then review its
            shared cut order in List before cutting.
          </p>
        )}
      {review.bay && (
        <details open={!existing}>
          <summary>
            {existing ? "Edit field measurements" : "Enter field measurements"}
          </summary>
          <p className="small-note">
            Measure between the mounting faces at rod height. Enter the distance
            from each mounting face to the flange’s actual rod stop. Total extra
            clearance is shared between the ends.
          </p>
          <form onSubmit={submit}>
            {(
              [
                ["measuredSpan", "Measured opening"],
                ["startSetback", "Start flange setback"],
                ["endSetback", "End flange setback"],
                ["clearance", "Total insertion clearance"],
              ] as const
            ).map(([key, label]) => (
              <LengthInput
                key={key}
                label={label}
                min={key === "measuredSpan" ? 0.001 : 0}
                max={key === "measuredSpan" ? 240 : 12}
                value={values[key]}
                onChange={(value) => setValues((p) => ({ ...p, [key]: value }))}
              />
            ))}
            <label className="field">
              Closed flange side
              <select
                value={closedEnd}
                onChange={(e) =>
                  setClosedEnd(e.target.value === "end" ? "end" : "start")
                }
              >
                <option value="start">Start</option>
                <option value="end">End</option>
              </select>
            </label>
            <label className="field">
              Measurement notes
              <textarea
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </label>
            <button
              className="button secondary full"
              disabled={
                !basis.trim() ||
                Object.values(values).some((n) => !Number.isFinite(n))
              }
            >
              Save rod measurements
            </button>
          </form>
        </details>
      )}
      <p className="small-note">
        {rodFitScope}{" "}
        <a
          href={
            (review.bay?.rod.material ?? review.plan?.rodMaterial) ===
            everbiltClosetRod.materialId
              ? everbiltClosetRod.socketListing
              : rodFlangeInstructions
          }
          target="_blank"
          rel="noreferrer"
        >
          {(review.bay?.rod.material ?? review.plan?.rodMaterial) ===
          everbiltClosetRod.materialId
            ? "Everbilt end socket listing"
            : "Flange-family instructions"}
        </a>
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
    </>
  );
}

export function RodFitsPanel({
  project,
  onChange,
  shownId,
  onShow,
}: {
  project: Project;
  onChange: (project: Project) => void;
  shownId: string | null;
  onShow: (id: string | null) => void;
}) {
  const ids = [
    ...new Set([
      ...closetRods(project).map((p) => p.id),
      ...(project.rodFitPlans ?? []).map((p) => p.rodId),
    ]),
  ];
  const [selected, setSelected] = useState("");
  if (!ids.length) return null;
  const activeId = ids.includes(selected) ? selected : ids[0];
  const fit = reviewRodFit(project, activeId);
  const toggleMarkers = () => onShow(shownId === activeId ? null : activeId);
  return (
    <details className="field-section">
      <summary>Fit closet rods · {ids.length}</summary>
      <label className="field">
        Closet rod
        <select
          value={activeId}
          onChange={(e) => {
            setSelected(e.target.value);
            onShow(null);
          }}
        >
          {ids.map((id) => (
            <option key={id} value={id}>
              {partLabel(project, id)} ·{" "}
              {project.pieces.find((p) => p.id === id)?.name ?? "Missing rod"}
            </option>
          ))}
        </select>
      </label>
      <RodMeasurements
        key={`measurements/${activeId}`}
        project={project}
        id={activeId}
        onChange={onChange}
      />
      <RodSocketPlatesPanel
        key={`sockets/${activeId}`}
        project={project}
        fit={fit}
        rodId={activeId}
        shown={shownId === activeId}
        onToggle={toggleMarkers}
        onChange={onChange}
      />
      <RodSupportsPanel
        key={`supports/${activeId}`}
        project={project}
        fit={fit}
        shown={shownId === activeId}
        onToggle={toggleMarkers}
        onChange={onChange}
      />
    </details>
  );
}
