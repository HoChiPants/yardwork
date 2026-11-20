import { useState, type FormEvent } from "react";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import {
  removeRodBracketMount,
  reviewRodBracketMount,
  rodBracketBackingChoices,
  rodBracketMountScope,
  saveRodBracketMount,
} from "./rodBracketMounts";
import type { RodSupport } from "./rodFitSchema";
import type { reviewRodFit } from "./rodFits";

const dimensions = [
  ["width", "Backplate width", 0.001, 24],
  ["height", "Backplate height", 0.001, 24],
  ["alongOffset", "Plate center along rod", -24, 24],
  ["heightOffset", "Plate center above rod", -24, 24],
  ["pilotDiameter", "Pilot diameter", 0.001, 2],
  ["pilotDepth", "Pilot tip depth past wood face", 0.001, 12],
  ["screwDiameter", "Screw outer diameter", 0.001, 2],
  ["screwDepth", "Seated screw depth past wood face", 0.001, 12],
] as const;

export function RodBracketMountPanel({
  project,
  fit,
  support,
  onChange,
}: {
  project: Project;
  fit: ReturnType<typeof reviewRodFit>;
  support: RodSupport;
  onChange: (next: Project) => void;
}) {
  const review = reviewRodBracketMount(project, fit, support);
  const draft = review?.state === "stale" ? undefined : support.mounting;
  const [expanded, setExpanded] = useState(!!support.mounting);
  const [centers, setCenters] = useState(() => draft?.centers ?? [[NaN, NaN]]);
  const [error, setError] = useState("");
  const choices = expanded
    ? rodBracketBackingChoices(project, fit, support)
    : [];
  if (!fit.plan) return null;
  const rodId = fit.plan.rodId;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      onChange(
        saveRodBracketMount(project, rodId, support.id, {
          ...Object.fromEntries(
            dimensions.map(([key]) => [key, Number(form.get(key))]),
          ),
          pieceId: form.get("pieceId"),
          basis: form.get("basis"),
          centers,
        }),
      );
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Review the bracket mounting dimensions.",
      );
    }
  }

  return (
    <details
      className="field-section"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Transfer center bracket holes</summary>
      {review && (
        <p
          className="small-note"
          data-testid="rod-bracket-mount-status"
          data-state={review.state}
        >
          {review.detail}
        </p>
      )}
      {!!review?.holes?.marks.some(({ issues }) => issues.length) && (
        <ul className="small-note">
          {review.holes.marks.flatMap(({ index, issues }) =>
            issues.length
              ? [
                  <li key={index}>
                    Hole {index} · {issues.join(" ")}
                  </li>,
                ]
              : [],
          )}
        </ul>
      )}
      {expanded &&
        (choices.length ? (
          <form onSubmit={submit}>
            <label className="field">
              Bracket backing
              <select
                name="pieceId"
                defaultValue={draft?.pieceId ?? ""}
                required
              >
                <option value="">Choose wood at the measured reach</option>
                {choices.map(({ piece, reach }) => (
                  <option key={piece.id} value={piece.id}>
                    {partLabel(project, piece.id)} · {piece.name} ·{" "}
                    {formatPreciseInches(reach)} reach
                  </option>
                ))}
              </select>
            </label>
            <p className="small-note">
              Enter the plate center from the rod station projected onto the
              backing. Positive values go toward the rod end and up.
            </p>
            <div className="rod-plate-extents">
              {dimensions.map(([key, label, min, max]) => (
                <label className="field" key={key}>
                  {label} (in)
                  <input
                    type="number"
                    name={key}
                    min={min}
                    max={max}
                    step="any"
                    required
                    defaultValue={
                      draft?.[key] ?? (key === "alongOffset" ? 0 : undefined)
                    }
                  />
                </label>
              ))}
            </div>
            <p className="small-note">
              Transfer each hole from the delivered bracket, using signed
              offsets from the plate center.
            </p>
            {centers.map((center, index) => (
              <div key={index}>
                <div className="two-col">
                  {["along rod", "up"].map((label, axis) => (
                    <label className="field" key={label}>
                      Hole {index + 1} offset {label} (in)
                      <input
                        type="number"
                        min={-24}
                        max={24}
                        step="any"
                        required
                        value={
                          Number.isFinite(center[axis]) ? center[axis] : ""
                        }
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          setCenters((rows) =>
                            rows.map((pair, row) =>
                              row === index
                                ? pair.map((n, i) => (i === axis ? value : n))
                                : pair,
                            ),
                          );
                        }}
                      />
                    </label>
                  ))}
                </div>
                {centers.length > 1 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setCenters((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    Remove hole {index + 1}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={centers.length >= 8}
              onClick={() => setCenters((rows) => [...rows, [NaN, NaN]])}
            >
              Add bracket hole
            </button>
            <label className="field">
              Bracket measurement notes
              <textarea
                name="basis"
                rows={2}
                required
                maxLength={300}
                defaultValue={draft?.basis}
              />
            </label>
            <button className="button secondary full">
              Save bracket mounting marks
            </button>
          </form>
        ) : (
          <p className="small-note">
            Place a flat wood backing face at the measured reach. Apply the
            measured rod fit and save matching reach readings first.
          </p>
        ))}
      {support.mounting && (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange(removeRodBracketMount(project, rodId, support.id))
          }
        >
          Remove bracket mounting layout
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="small-note">{rodBracketMountScope}</p>
    </details>
  );
}
