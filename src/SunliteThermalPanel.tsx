import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import type { Project } from "./model";
import {
  coldRetentionText,
  saveSunliteTemperatures,
  saveSunliteTravel,
  sunliteThermalScope,
  sunliteThermalSource,
  thermalAxisText,
  type SunliteThermalReview,
} from "./sunliteThermal";
import type { SunliteTravel } from "./sunliteThermalSchema";

const directions = [
  ["along", "along flutes"],
  ["across", "across flutes"],
] as const;

function readTravel(values: FormData): SunliteTravel {
  const retention: NonNullable<SunliteTravel["retention"]> = {};
  for (const [axis, label] of directions) {
    const overlap = values.get(`${axis}-overlap`);
    const minimum = values.get(`${axis}-minimum`);
    if (overlap === "" && minimum === "") continue;
    if (!overlap || !minimum)
      throw Error(`Enter both measured and required overlap ${label}.`);
    retention[axis] = { overlap: Number(overlap), minimum: Number(minimum) };
  }
  return {
    along: Number(values.get("along")),
    across: Number(values.get("across")),
    ...(retention.along || retention.across ? { retention } : {}),
  };
}

function ColdRetentionResults({
  row,
}: {
  row: SunliteThermalReview["rows"][number];
}) {
  if (!row.along.retention && !row.across.retention) return null;
  return (
    <>
      <p>Cold retention along flutes · {coldRetentionText(row.along)}</p>
      <p>Cold retention across flutes · {coldRetentionText(row.across)}</p>
    </>
  );
}

function ThermalRows({ review }: { review: SunliteThermalReview }) {
  return (
    <ul>
      {review.rows.map((row) => (
        <li key={row.id}>
          <strong>
            {row.label} · {row.name}
          </strong>
          <p>Along flutes · {thermalAxisText(row.along)}</p>
          <p>Across flutes · {thermalAxisText(row.across)}</p>
          <ColdRetentionResults row={row} />
          {row.stale && (
            <p>
              Remeasure travel and overlap after the panel or installation
              temperature changed.
            </p>
          )}
        </li>
      ))}
      {review.excluded > 0 && (
        <li>
          {review.excluded} panels need a flute direction before comparison.
        </li>
      )}
    </ul>
  );
}

export function PrintSunliteThermal({
  review,
}: {
  review: SunliteThermalReview;
}) {
  const { cold, installation, hot } = review.temperatures;
  return (
    <section className="sunlite-thermal-print">
      <h2>SUNLITE temperature movement</h2>
      <p>
        Sheet temperatures · low {cold} °F · installation {installation} °F ·
        high {hot} °F.
      </p>
      <p>{sunliteThermalScope}</p>
      <p>
        <a href={sunliteThermalSource}>Palram thermal coefficient</a>
      </p>
      <ThermalRows review={review} />
    </section>
  );
}

export function SunliteThermalPanel({
  project,
  review,
  onChange,
}: {
  project: Project;
  review: SunliteThermalReview | null;
  onChange: (next: Project) => void;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const row =
    review?.rows.find((item) => item.id === selected) ?? review?.rows[0];
  const temperatures = review?.temperatures;
  function submit(
    event: FormEvent<HTMLFormElement>,
    update: (values: FormData) => Project,
  ) {
    event.preventDefault();
    try {
      onChange(update(new FormData(event.currentTarget)));
      setError("");
    } catch (e) {
      setError(
        e instanceof ZodError
          ? (e.issues[0]?.message ?? "Review the entered measurements.")
          : e instanceof Error
            ? e.message
            : "Review the entered measurements.",
      );
    }
  }
  return (
    <details className="field-section">
      <summary>SUNLITE temperature movement</summary>
      <p>Enter sheet temperatures, including expected heating from sunlight.</p>
      <form
        key={JSON.stringify(temperatures)}
        onSubmit={(event) =>
          submit(event, (values) =>
            saveSunliteTemperatures(project, {
              cold: Number(values.get("cold")),
              installation: Number(values.get("installation")),
              hot: Number(values.get("hot")),
            }),
          )
        }
      >
        {(
          [
            ["cold", "Lowest sheet temperature"],
            ["installation", "Installation sheet temperature"],
            ["hot", "Highest sheet temperature"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="field">
            {label} (°F)
            <input
              type="number"
              name={key}
              min={-103}
              max={212}
              step="any"
              required
              defaultValue={temperatures?.[key]}
            />
          </label>
        ))}
        <button className="button secondary small">
          Save temperature range
        </button>
      </form>
      {row && (
        <form
          key={JSON.stringify([
            row.id,
            row.along.usableGrowth,
            row.across.usableGrowth,
            row.along.retention,
            row.across.retention,
          ])}
          onSubmit={(event) =>
            submit(event, (values) =>
              saveSunliteTravel(project, row.id, readTravel(values)),
            )
          }
        >
          <label className="field">
            Panel to compare
            <select
              value={row.id}
              onChange={(event) => setSelected(event.target.value)}
            >
              {review?.rows.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <p>{sunliteThermalScope}</p>
          <p>Along flutes · {thermalAxisText(row.along)}</p>
          <p>Across flutes · {thermalAxisText(row.across)}</p>
          <ColdRetentionResults row={row} />
          {row.stale && (
            <p>
              Remeasure travel and overlap after the panel or installation
              temperature changed.
            </p>
          )}
          <label className="field">
            Available growth along flutes (in)
            <input
              type="number"
              name="along"
              min={0}
              max={240}
              step="any"
              required
              defaultValue={row.along.usableGrowth ?? undefined}
            />
          </label>
          <label className="field">
            Available growth across flutes (in)
            <input
              type="number"
              name="across"
              min={0}
              max={240}
              step="any"
              required
              defaultValue={row.across.usableGrowth ?? undefined}
            />
          </label>
          <details
            open={
              row.along.retention || row.across.retention ? true : undefined
            }
          >
            <summary>Cold-weather edge overlap</summary>
            <p>
              For each direction, use the smaller measured overlap of the
              opposing edges and the larger required overlap from their profile
              details. Leave a pair blank if the measurements are still pending.
            </p>
            {directions.map(([axis, label]) => (
              <div className="planner-module-grid" key={axis}>
                <label className="field">
                  Least overlap {label} (in)
                  <input
                    name={`${axis}-overlap`}
                    type="number"
                    min={0}
                    max={240}
                    step="any"
                    defaultValue={row[axis].retention?.overlap}
                  />
                </label>
                <label className="field">
                  Required overlap {label} (in)
                  <input
                    name={`${axis}-minimum`}
                    type="number"
                    min={0}
                    max={240}
                    step="any"
                    defaultValue={row[axis].retention?.minimum}
                  />
                </label>
              </div>
            ))}
          </details>
          <button className="button secondary small">Save panel travel</button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <details>
          <summary>All panel estimates · {review.rows.length}</summary>
          <ThermalRows review={review} />
        </details>
      )}
      <p>
        <a href={sunliteThermalSource} target="_blank" rel="noreferrer">
          Palram thermal coefficient
        </a>
      </p>
    </details>
  );
}
