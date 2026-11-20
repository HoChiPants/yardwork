import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import type { SunliteProfileId } from "./sunliteProfileSchema";
import {
  addMeasuredSunlitePurchases,
  profileCutStates,
  profileNames,
  profileScope,
  removeSunliteCut,
  saveSunliteCut,
  saveSunliteSetup,
  sunliteProfileLines,
  type SunliteProfileReview,
} from "./sunliteProfiles";
import { sunliteInstructions, type SunliteProfileRun } from "./sunliteTakeoff";

type Group = SunliteProfileReview["groups"][number];
type Row = Group["rows"][number];

function StockSetup({
  group,
  onSave,
}: {
  group: Group;
  onSave: (length: number, kerf: number, basis: string) => void;
}) {
  const [length, setLength] = useState(group.setup?.usableLength ?? NaN);
  const [kerf, setKerf] = useState(group.setup?.kerf ?? NaN);
  const [basis, setBasis] = useState(group.setup?.basis ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(length, kerf, basis);
  };
  return (
    <form onSubmit={submit}>
      <p className="small-note">
        Measure the usable length after end prep and the width of a test cut.
        For a snap-cap set, use the shorter usable length and the wider kerf of
        the two pieces.
      </p>
      <LengthInput
        label="Usable stock length"
        value={length}
        onChange={setLength}
        defaultUnit={preferredLengthUnit(length)}
        max={96}
      />
      <LengthInput
        label="Saw kerf"
        value={kerf}
        onChange={setKerf}
        min={0.0001}
        max={1}
      />
      <label className="field">
        Stock and saw notes
        <textarea
          rows={2}
          value={basis}
          onChange={(event) => setBasis(event.target.value)}
          maxLength={400}
        />
      </label>
      <button
        className="button secondary full"
        disabled={
          !Number.isFinite(length) || !Number.isFinite(kerf) || !basis.trim()
        }
      >
        Save profile stock setup
      </button>
    </form>
  );
}

function CutMeasurement({
  row,
  onSave,
}: {
  row: Row;
  onSave: (length: number, basis: string) => void;
}) {
  const [length, setLength] = useState(
    row.state === "stale" ? NaN : (row.measurement?.length ?? NaN),
  );
  const [basis, setBasis] = useState(
    row.state === "stale" ? "" : (row.measurement?.basis ?? ""),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(length, basis);
      }}
    >
      <LengthInput
        label="Finished cut length"
        value={length}
        onChange={setLength}
        defaultUnit={preferredLengthUnit(length)}
        max={240}
      />
      <label className="field">
        Field measurement notes
        <textarea
          rows={2}
          value={basis}
          onChange={(event) => setBasis(event.target.value)}
          maxLength={400}
          placeholder="Record where you measured and the fit allowances you used."
        />
      </label>
      <button
        className="button secondary full"
        disabled={!Number.isFinite(length) || !basis.trim()}
      >
        Save measured cut length
      </button>
    </form>
  );
}

export function PrintSunliteProfiles({
  review,
}: {
  review: SunliteProfileReview;
}) {
  const lines = sunliteProfileLines(review);
  if (lines.length === 0) return null;
  return (
    <section>
      <h2>Measured greenhouse profile cuts</h2>
      <p>{profileScope}</p>
      {lines.map((group) => (
        <div key={group.heading}>
          <h3>{group.heading}</h3>
          <ul>
            {group.summary.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          {group.sticks.map((stock) => (
            <div key={stock.heading}>
              <strong>{stock.heading}</strong>
              <ul>
                {stock.cuts.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function SunliteProfilePanel({
  project,
  review,
  onChange,
  onShow,
  shownId,
}: {
  project: Project;
  review: SunliteProfileReview;
  onChange: (project: Project) => void;
  onShow: (run: SunliteProfileRun | null) => void;
  shownId: string | null;
}) {
  const [id, setId] = useState<SunliteProfileId>("sunlite-96714");
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const group = review.groups.find((group) => group.id === id)!;
  const row = group.rows.find(({ run }) => run.id === runId) ?? group.rows[0];
  const count = review.groups.reduce((sum, current) => sum + current.ready, 0);
  const ready = review.groups.some((group) => group.offer && group.missing);
  const today = () => new Date().toISOString();
  const apply = (action: () => Project, confirmation: string) => {
    setError("");
    setStatus("");
    try {
      onChange(action());
      setStatus(confirmation);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the profile plan.",
      );
    }
  };
  return (
    <details className="field-section">
      <summary>Measured glazing profile cuts · {count} ready</summary>
      <p className="small-note">
        Match each field measurement to a modeled edge. The cut list groups
        those lengths onto stock and reserves saw kerf for each cut.
      </p>
      <label className="field">
        Glazing profile
        <select
          value={id}
          onChange={(event) => {
            setId(event.target.value as SunliteProfileId);
            setRunId("");
            onShow(null);
          }}
        >
          {review.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {profileNames[group.id]} ({group.ready}/{group.rows.length})
            </option>
          ))}
        </select>
      </label>
      <p className="small-note">
        Ready runs {group.ready} of {group.rows.length} · Stock units needed{" "}
        {group.sticks.length} · Selected {group.selected}
      </p>
      <details open={!group.setup}>
        <summary>Measure profile stock and saw kerf</summary>
        <StockSetup
          key={`${id}/${group.setup?.measuredAt ?? ""}`}
          group={group}
          onSave={(length, kerf, basis) =>
            apply(
              () =>
                saveSunliteSetup(project, id, {
                  usableLength: length,
                  kerf,
                  basis,
                  measuredAt: today(),
                }),
              "Profile stock setup saved.",
            )
          }
        />
      </details>
      {row && (
        <>
          <label className="field">
            Modeled profile run
            <select
              value={row.run.id}
              onChange={(event) => {
                setRunId(event.target.value);
                onShow(null);
              }}
            >
              {group.rows.map(({ run, state }) => (
                <option value={run.id} key={run.id}>
                  {run.label} ·{" "}
                  {state === "ready"
                    ? "Ready"
                    : state === "unmeasured"
                      ? "Unmeasured"
                      : "Review"}
                </option>
              ))}
            </select>
          </label>
          <p className="small-note">
            Model span {formatStockLength(row.run.length)} ·{" "}
            {profileCutStates[row.state]}
          </p>
          <button
            type="button"
            className="text-button"
            aria-pressed={shownId === row.run.id}
            onClick={() => onShow(shownId === row.run.id ? null : row.run)}
          >
            {shownId === row.run.id
              ? "Hide profile edge"
              : "Show profile edge in 3D"}
          </button>
          <CutMeasurement
            key={`${row.run.id}/${row.state === "stale" ? "stale" : (row.measurement?.measuredAt ?? "")}`}
            row={row}
            onSave={(length, basis) =>
              apply(
                () =>
                  saveSunliteCut(project, row.run.id, {
                    length,
                    basis,
                    measuredAt: today(),
                  }),
                "Profile cut measurement saved.",
              )
            }
          />
          {row.measurement && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                apply(
                  () => removeSunliteCut(project, row.run.id),
                  "Measurement removed.",
                )
              }
            >
              Remove cut measurement
            </button>
          )}
        </>
      )}
      {group.removed.length > 0 && (
        <details>
          <summary>
            Measurements with missing edges · {group.removed.length}
          </summary>
          <ul>
            {group.removed.map((cut) => (
              <li key={cut.runId}>
                {cut.label}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    apply(
                      () => removeSunliteCut(project, cut.runId),
                      "Measurement removed.",
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {group.sticks.length > 0 && (
        <details>
          <summary>Cut list by stock unit · {group.sticks.length}</summary>
          <ol>
            {group.sticks.map((stock, index) => (
              <li key={index}>
                Remainder {formatStockLength(stock.remaining)}
                <ul>
                  {stock.cuts.map(({ run, measurement, kerf }) => (
                    <li key={run.id}>
                      {run.label} · {formatStockLength(measurement.length)}{" "}
                      finished ·{" "}
                      {kerf
                        ? `${formatStockLength(kerf)} saw loss`
                        : "use as-is"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      )}
      {ready && (
        <button
          type="button"
          className="button secondary full"
          onClick={() =>
            apply(
              () => addMeasuredSunlitePurchases(project),
              "Missing profile stock added to the shopping list.",
            )
          }
        >
          Add stock for measured cuts
        </button>
      )}
      {group.missing > 0 && !group.offer && (
        <p className="small-note">
          This profile has a reviewed Home Depot listing.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="small-note">
          {status}
        </p>
      )}
      <p className="small-note">
        <a href={sunliteInstructions} target="_blank" rel="noreferrer">
          Palram SUNLITE installation resources
        </a>
      </p>
    </details>
  );
}
