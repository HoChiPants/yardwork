import { useState } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import {
  addSunliteTapeKits,
  fillSunliteTapeAllowances,
  removeSunliteTapeCut,
  saveSunliteTapeCut,
  tapeCutStates,
  tapeNames,
  tapePlanLines,
  tapePlanNotes,
  tapePlanTitle,
  type SunliteTapeReview,
} from "./sunliteTapePlan";
import {
  sunliteTapeRollLength,
  sunliteTapeStripInputLimit,
} from "./sunliteTapeSchema";

type Row = SunliteTapeReview["rows"][number];

function TapeLengthForm({
  row,
  onSave,
}: {
  row: Row;
  onSave: (length: number, basis: string) => void;
}) {
  const previous = row.state !== "stale" ? row.measurement : undefined;
  const [length, setLength] = useState(previous?.length ?? NaN);
  const [basis, setBasis] = useState(previous?.basis ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(length, basis);
      }}
    >
      <LengthInput
        label="Tape strip cut length"
        value={length}
        onChange={setLength}
        defaultUnit={preferredLengthUnit(length)}
        min={0.001}
        max={sunliteTapeStripInputLimit}
      />
      <label className="field">
        Edge measurement notes
        <textarea
          value={basis}
          rows={2}
          maxLength={400}
          onChange={(event) => setBasis(event.target.value)}
        />
      </label>
      <button
        className="button secondary full"
        disabled={!Number.isFinite(length) || length <= 0 || !basis.trim()}
      >
        Save tape length
      </button>
    </form>
  );
}

function TapeAllowanceForm({
  onSave,
}: {
  onSave: (upper: number, lower: number, basis: string) => void;
}) {
  const [upper, setUpper] = useState(NaN);
  const [lower, setLower] = useState(NaN);
  const [basis, setBasis] = useState("");
  const entered = [upper, lower].every(
    (value) =>
      Number.isFinite(value) && value >= 0 && value <= sunliteTapeRollLength,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(upper, lower, basis);
      }}
    >
      <p className="small-note">
        Check the modeled edges against your panels. Enter the extra length for
        one complete strip on each edge, including both ends. Existing entries
        stay in place.
      </p>
      <LengthInput
        label="Extra per upper strip"
        value={upper}
        onChange={setUpper}
        min={0}
        max={sunliteTapeRollLength}
      />
      <LengthInput
        label="Extra per lower strip"
        value={lower}
        onChange={setLower}
        min={0}
        max={sunliteTapeRollLength}
      />
      <label className="field">
        Layout and trim notes
        <textarea
          value={basis}
          rows={2}
          maxLength={400}
          onChange={(event) => setBasis(event.target.value)}
        />
      </label>
      <button
        className="button secondary full"
        disabled={!entered || !basis.trim()}
      >
        Fill unmeasured edges
      </button>
    </form>
  );
}

function TapeRollOrder({ review }: { review: SunliteTapeReview }) {
  const lines = tapePlanLines(review);
  return (
    <>
      <ul>
        {lines.status.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {lines.groups
        .filter(({ rolls }) => rolls.length)
        .map(({ name, rolls }) => (
          <div key={name}>
            <h4>{name}</h4>
            {rolls.map(({ label, strips }) => (
              <div key={label}>
                <strong>{label}</strong>
                <ul>
                  {strips.map((strip) => (
                    <li key={strip}>{strip}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      {lines.evidence.length > 0 && (
        <>
          <h4>Measurement notes</h4>
          <ul>
            {lines.evidence.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function PrintSunliteTape({ review }: { review: SunliteTapeReview }) {
  if (!review.started) return null;
  return (
    <section className="sunlite-tape-print">
      <h2>{tapePlanTitle}</h2>
      <p>{tapePlanNotes}</p>
      {review.offer && (
        <p>
          <a href={review.offer.url}>SUNLITE 92763 paired rolls</a>
        </p>
      )}
      <TapeRollOrder review={review} />
    </section>
  );
}

export function SunliteTapePanel({
  project,
  review,
  onChange,
  onShow,
  shownId,
}: {
  project: Project;
  review: SunliteTapeReview;
  onChange: (project: Project) => void;
  onShow: (runId: string | null) => void;
  shownId: string | null;
}) {
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const row = review.rows.find(({ run }) => run.id === runId) ?? review.rows[0];
  const apply = (edit: () => Project) => {
    setError("");
    try {
      const next = edit();
      if (next !== project) onChange(next);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The tape plan could not be saved.",
      );
    }
  };
  return (
    <details className="field-section" id="sunlite-tape-plan">
      <summary>
        {tapePlanTitle} · {review.readyCount} of {review.rows.length} edges
        ready
      </summary>
      <p className="small-note">{tapePlanNotes}</p>
      <p className="small-note">
        {review.required === null
          ? "Review all edges to calculate a kit quantity."
          : `${review.required} paired tape ${review.required === 1 ? "kit" : "kits"} needed · ${review.selected} selected`}
        {review.offer && (
          <>
            {" "}
            ·{" "}
            <a href={review.offer.url} target="_blank" rel="noreferrer">
              SUNLITE 92763
            </a>
          </>
        )}
      </p>
      {review.rows.some(({ state }) => state === "unmeasured") && (
        <details>
          <summary>Use the layout with a trim allowance</summary>
          <TapeAllowanceForm
            onSave={(upper, lower, basis) =>
              apply(() =>
                fillSunliteTapeAllowances(project, {
                  upper,
                  lower,
                  basis,
                  measuredAt: new Date().toISOString(),
                }),
              )
            }
          />
        </details>
      )}
      {row && (
        <>
          <label className="field">
            Tape edge
            <select
              value={row.run.id}
              onChange={(event) => {
                setRunId(event.target.value);
                onShow(null);
              }}
            >
              {review.groups.map(({ side }) => (
                <optgroup key={side} label={tapeNames[side]}>
                  {review.rows
                    .filter(({ run }) => run.side === side)
                    .map(({ run, state }) => (
                      <option key={run.id} value={run.id}>
                        {run.label} · {tapeCutStates[state]}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p className="small-note">
            {tapeNames[row.run.side]} · Modeled edge{" "}
            {formatStockLength(row.run.length)} · {tapeCutStates[row.state]}
          </p>
          <button
            className="button secondary"
            type="button"
            onClick={() => onShow(shownId === row.run.id ? null : row.run.id)}
          >
            {shownId === row.run.id ? "Hide tape edge" : "Show tape edge in 3D"}
          </button>
          <TapeLengthForm
            key={`${row.run.id}/${row.measurement?.measuredAt ?? ""}/${row.state}`}
            row={row}
            onSave={(length, basis) =>
              apply(() =>
                saveSunliteTapeCut(project, row.run.id, {
                  length,
                  basis,
                  measuredAt: new Date().toISOString(),
                }),
              )
            }
          />
          {row.measurement && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                apply(() => removeSunliteTapeCut(project, row.run.id))
              }
            >
              Remove saved tape length
            </button>
          )}
        </>
      )}
      {review.removed.length > 0 && (
        <details>
          <summary>
            Measurements for missing edges ({review.removed.length})
          </summary>
          {review.removed.map(({ label, runId }) => (
            <button
              key={runId}
              type="button"
              className="text-button"
              onClick={() => apply(() => removeSunliteTapeCut(project, runId))}
            >
              Remove {label}
            </button>
          ))}
        </details>
      )}
      {(review.started || review.panelIssues.length > 0) && (
        <details>
          <summary>Roll cut order and edge review</summary>
          <TapeRollOrder review={review} />
        </details>
      )}
      {review.missing !== null && review.missing > 0 && review.offer && (
        <button
          className="button secondary full"
          type="button"
          onClick={() => apply(() => addSunliteTapeKits(project))}
        >
          Add {review.missing} missing tape{" "}
          {review.missing === 1 ? "kit" : "kits"}
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
