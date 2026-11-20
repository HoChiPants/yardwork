import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import type {
  MotionPlan,
  MotionPlanInput,
  SaunaDoorSetup,
} from "./motionPlanSchema";
import { cedarbrookDoor } from "./saunaDoorReference";
import {
  saunaDoorChoices,
  saunaDoorMotionInput,
  saunaDoorPlanEntry,
} from "./saunaDoors";

export function SaunaDoorEditor({
  project,
  existing,
  onSave,
  onCancel,
}: {
  project: Project;
  existing?: MotionPlan;
  onSave: (draft: MotionPlanInput) => void;
  onCancel: () => void;
}) {
  const reserved = new Set(
    (project.motionPlans ?? [])
      .filter((plan) => plan.id !== existing?.id)
      .map(saunaDoorPlanEntry),
  );
  const choices = saunaDoorChoices(project).filter(
    ({ entry }) => !reserved.has(entry.id),
  );
  const initial =
    existing?.mechanism.kind === "hinge"
      ? existing.mechanism.saunaDoor
      : undefined;
  const [id, setId] = useState(initial?.entryId ?? choices[0]?.entry.id ?? "");
  const [side, setSide] = useState<SaunaDoorSetup["side"]>(
    initial?.side ?? "left",
  );
  const [outset, setOutset] = useState(initial?.outset ?? 0);
  const [sideOffset, setSideOffset] = useState(initial?.sideOffset ?? 0);
  const [wallDepth, setWallDepth] = useState(initial?.finishedWallDepth ?? NaN);
  const [travel, setTravel] = useState(existing?.mechanism.travel ?? 90);
  const [error, setError] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onSave(
        saunaDoorMotionInput(
          project,
          {
            entryId: id,
            side,
            outset,
            sideOffset,
            ...(Number.isFinite(wallDepth)
              ? { finishedWallDepth: wallDepth }
              : {}),
          },
          travel,
        ),
      );
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Review the sauna door setup.",
      );
    }
  }

  return (
    <form
      className="field-section"
      aria-label="Sauna door setup"
      onSubmit={save}
    >
      <h3>Sauna door swing</h3>
      <p className="small-note">
        The leaf swings outward. Zero offsets test the exterior edge of the
        modeled leaf. Enter the measured offsets when the installed axis is
        known.
      </p>
      <label className="field">
        Sauna
        <select value={id} onChange={(event) => setId(event.target.value)}>
          {!choices.some(({ entry }) => entry.id === id) && (
            <option value="">Choose a current sauna</option>
          )}
          {choices.map(({ entry, label }, index) => (
            <option key={entry.id} value={entry.id}>
              {label}
              {choices.length > 1 ? ` · ${index + 1}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Hinge side from outside
        <select
          value={side}
          onChange={(event) => setSide(event.target.value as typeof side)}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <LengthInput
        label="Pivot offset from leaf front"
        value={outset}
        onChange={setOutset}
        min={-3}
        max={6}
      />
      <LengthInput
        label="Pivot offset toward jamb"
        value={sideOffset}
        onChange={setSideOffset}
        min={-3}
        max={3}
      />
      <LengthInput
        label="Measured finished wall depth (optional)"
        value={wallDepth}
        onChange={setWallDepth}
        max={240}
      />
      <label className="field">
        Maximum opening (degrees)
        <input
          type="number"
          min="0.01"
          max="180"
          step="any"
          required
          value={Number.isFinite(travel) ? travel : ""}
          onChange={(event) => setTravel(event.target.valueAsNumber)}
        />
      </label>
      <p className="small-note">
        Check the delivered jamb, stop, handle and hinge placement.{" "}
        <a href={cedarbrookDoor.url} target="_blank" rel="noreferrer">
          Cedarbrook door specifications
        </a>
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={
          !id || !Number.isFinite(outset) || !Number.isFinite(sideOffset)
        }
      >
        Save and test sauna door
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel setup
      </button>
    </form>
  );
}
