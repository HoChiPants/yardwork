import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatStockLength, preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import { ventLayoutMeasurements } from "./plumbingVentLayout";
import type { PlumbingVentLayout } from "./plumbingVentSchema";
import { saveProjectCode } from "./projectCode";

const axes = ["X", "Y", "Z"] as const;
const planAxes = ["X", "Z"] as const;
const directions = ["-X", "+X", "-Z", "+Z"];

function MeasuredCoordinate({
  label,
  value,
  required = false,
}: {
  label: string;
  value: number | undefined | null;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? NaN);
  return (
    <LengthInput
      label={label}
      name={label}
      required={required}
      value={draft}
      onChange={setDraft}
      defaultUnit={preferredLengthUnit(value ?? 0)}
      min={-12000}
      max={12000}
    />
  );
}
function measured(form: FormData, field: string) {
  const raw = String(form.get(field) ?? "").trim();
  return raw === ""
    ? null
    : Number(raw) * (form.get(`${field}-unit`) === "ft" ? 12 : 1);
}
function point(form: FormData, prefix: string, names: readonly string[]) {
  return names.map((axis) => measured(form, `${prefix} ${axis}`));
}
function observationPoint(values: (number | null)[], label: string) {
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null))
    throw Error(
      `Complete all coordinates for ${label}, or leave every field blank.`,
    );
  return values;
}

export function PlumbingVentLayoutPanel({
  project,
  onChange,
  shown,
  onShow,
}: {
  project: Project;
  onChange: (next: Project) => void;
  shown: boolean;
  onShow: (show: boolean) => void;
}) {
  const context = project.projectCode;
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (
    !context ||
    !context.trades.includes("plumbing") ||
    context.wallVent.inScope !== "yes"
  )
    return null;

  const wallVent = context.wallVent;
  const layout = wallVent.layout;
  const dimensions = layout ? ventLayoutMeasurements(layout) : null;
  const ipc = context.codePath === "ibc";
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const input = new FormData(event.currentTarget);
      const lotLine = observationPoint(
        [
          ...point(input, "Lot point A", planAxes),
          ...point(input, "Lot point B", planAxes),
        ],
        "the lot-line segment",
      );
      const gradePoint = observationPoint(
        point(input, "Grade point", axes),
        "the grade point",
      );
      const next = saveProjectCode(project, {
        ...context,
        wallVent: {
          ...wallVent,
          layout: {
            exteriorSide: input.get("exterior-side"),
            wallCoordinate: measured(input, "Exterior wall coordinate"),
            terminal: point(input, "Terminal", axes),
            lotLine: lotLine ? [lotLine.slice(0, 2), lotLine.slice(2)] : null,
            gradePoint,
            underVentedOverhang: input.get("vented-overhang"),
            openingProtected: input.get("protected-opening"),
          },
        },
      });
      onChange(next);
      setSaved(true);
      setError("");
    } catch (e) {
      setSaved(false);
      setError(
        e instanceof Error ? e.message : "Check the vent and site coordinates.",
      );
    }
  }
  function remove() {
    const { layout: _removed, ...remaining } = wallVent;
    onChange(saveProjectCode(project, { ...context, wallVent: remaining }));
    onShow(false);
    setError("");
    setSaved(false);
  }

  return (
    <details className="field-section vent-layout-panel">
      <summary>
        {layout ? "Edit vent and site datums" : "Set vent and site datums"}
      </summary>
      <p className="small-note">
        Use the same origin as the 3D workspace. Y is elevation. Mark the
        outside wall face and the actual terminal opening.
      </p>
      {layout && dimensions && (
        <div className="section-description">
          <p className="small-note" data-testid="vent-projection">
            {dimensions.projection > 0
              ? `${formatStockLength(dimensions.projection)} out from the exterior wall`
              : "Terminal is on or inside the exterior wall datum"}
          </p>
          <button
            type="button"
            className="button secondary full"
            aria-pressed={shown}
            onClick={() => onShow(!shown)}
          >
            {shown ? "Hide vent datums" : "Show vent datums in 3D"}
          </button>
        </div>
      )}
      <form
        key={JSON.stringify(layout ?? null)}
        onSubmit={save}
        onChange={() => {
          setSaved(false);
          setError("");
        }}
      >
        <label className="field">
          Exterior side of wall
          <select
            name="exterior-side"
            defaultValue={layout?.exteriorSide ?? ""}
            required
          >
            <option value="" disabled>
              Choose outward direction
            </option>
            {directions.map((direction) => (
              <option key={direction}>{direction}</option>
            ))}
          </select>
        </label>
        <MeasuredCoordinate
          label="Exterior wall coordinate"
          value={layout?.wallCoordinate}
          required
        />
        <div role="group" aria-label="Terminal coordinates">
          {axes.map((axis, i) => (
            <MeasuredCoordinate
              key={axis}
              label={`Terminal ${axis}`}
              value={layout?.terminal[i]}
              required
            />
          ))}
        </div>
        <details className="field-section">
          <summary>Lot line and grade{ipc ? " · IPC site checks" : ""}</summary>
          <p className="small-note">
            Use the nearest surveyed lot-line segment. Enter the highest
            adjacent grade within 10 ft horizontally of the terminal.
          </p>
          {[0, 1].map((side) => (
            <div key={side} className="two-col">
              {planAxes.map((axis, i) => (
                <MeasuredCoordinate
                  key={axis}
                  label={`Lot point ${side === 0 ? "A" : "B"} ${axis}`}
                  value={layout?.lotLine?.[side][i]}
                />
              ))}
            </div>
          ))}
          {axes.map((axis, i) => (
            <MeasuredCoordinate
              key={axis}
              label={`Grade point ${axis}`}
              value={layout?.gradePoint?.[i]}
            />
          ))}
        </details>
        <details className="field-section">
          <summary>Opening and soffit conditions</summary>
          <ObservedCondition
            label="Under an overhang with soffit vents"
            name="vented-overhang"
            value={layout?.underVentedOverhang}
          />
          <ObservedCondition
            label="Opening protected from birds and rodents"
            name="protected-opening"
            value={layout?.openingProtected}
          />
        </details>
        <button className="button secondary full">Save vent datums</button>
        {layout && (
          <button type="button" className="text-button" onClick={remove}>
            Remove vent datums
          </button>
        )}
        {saved && (
          <p className="small-note" role="status">
            Vent datums saved.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}

function ObservedCondition({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: PlumbingVentLayout["openingProtected"] | undefined;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value ?? "unknown"}>
        <option value="unknown">Confirm condition</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}
