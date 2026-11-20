import { useState, type FormEvent } from "react";
import {
  greenhouseVentChoices,
  greenhouseVentMotionInput,
} from "./greenhouseVents";
import { LengthInput } from "./LengthInput";
import type { Project } from "./model";
import type { MotionPlan, MotionPlanInput } from "./motionPlanSchema";

export function GreenhouseVentEditor({
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
  const initial =
    existing?.mechanism.kind === "hinge"
      ? existing.mechanism.greenhouseVent
      : undefined;
  const reserved = new Set(
    (project.motionPlans ?? []).flatMap((plan) =>
      plan.id !== existing?.id &&
      plan.mechanism.kind === "hinge" &&
      plan.mechanism.greenhouseVent
        ? [plan.mechanism.greenhouseVent.entryId]
        : [],
    ),
  );
  const choices = greenhouseVentChoices(project).filter(
    ({ entry }) => !reserved.has(entry.id),
  );
  const [entryId, setEntryId] = useState(
    initial?.entryId ?? choices[0]?.entry.id ?? "",
  );
  const [travel, setTravel] = useState(existing?.mechanism.travel ?? 45);
  const [outset, setOutset] = useState(initial?.outset ?? 0);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onSave(greenhouseVentMotionInput(project, { entryId, outset }, travel));
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Review the roof vent setup.",
      );
    }
  }

  return (
    <form
      className="field-section"
      aria-label="Greenhouse roof vent setup"
      onSubmit={submit}
    >
      <h3>Greenhouse roof vent swing</h3>
      <label className="field">
        Greenhouse with roof vent
        <select
          value={entryId}
          onChange={(event) => setEntryId(event.target.value)}
        >
          {!choices.some(({ entry }) => entry.id === entryId) && (
            <option value="">Choose a current roof vent</option>
          )}
          {choices.map(({ entry, label }, index) => (
            <option key={entry.id} value={entry.id}>
              {label}
              {choices.length > 1 ? ` · ${index + 1}` : ""}
            </option>
          ))}
        </select>
      </label>
      <LengthInput
        label="Pivot height above sash"
        value={outset}
        onChange={setOutset}
        min={-3}
        max={6}
      />
      <p className="small-note">
        The test starts at the ridge-side edge. Enter the measured offset
        perpendicular to the closed sash.
      </p>
      <label className="field">
        Maximum opening (degrees)
        <input
          type="number"
          step="any"
          min="0.01"
          max="180"
          required
          value={Number.isFinite(travel) ? travel : ""}
          onChange={(event) => setTravel(event.target.valueAsNumber)}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        disabled={!entryId || !Number.isFinite(outset)}
      >
        Save and test vent swing
      </button>
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel setup
      </button>
    </form>
  );
}
