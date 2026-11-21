import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { motionDistance } from "./mechanismMotion";
import type { MotionPlan, MotionSequenceTargets } from "./motionPlanSchema";

export function MotionSequenceTargetsFields({
  selected,
  companion,
  current,
  onTest,
}: {
  selected: MotionPlan;
  companion: MotionPlan;
  current?: MotionSequenceTargets;
  onTest: (targets?: MotionSequenceTargets) => void;
}) {
  const [selectedTravel, setSelectedTravel] = useState(
    current?.selected?.travel ?? selected.mechanism.travel,
  );
  const [companionTravel, setCompanionTravel] = useState(
    current?.companion?.travel ?? companion.mechanism.travel,
  );
  const valid = (plan: MotionPlan, travel: number) =>
    Number.isFinite(travel) && travel > 0 && travel <= plan.mechanism.travel;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid(selected, selectedTravel) || !valid(companion, companionTravel))
      return;
    onTest({
      selected: { kind: selected.mechanism.kind, travel: selectedTravel },
      companion: { kind: companion.mechanism.kind, travel: companionTravel },
    });
  }

  return (
    <details className="field-section" open={current ? true : undefined}>
      <summary>Set travel targets for this test</summary>
      <form onSubmit={submit}>
        <TravelTarget
          plan={selected}
          value={selectedTravel}
          onChange={setSelectedTravel}
        />
        <TravelTarget
          plan={companion}
          value={companionTravel}
          onChange={setCompanionTravel}
        />
        <div className="motion-actions">
          <button
            type="submit"
            className="button secondary small"
            disabled={
              !valid(selected, selectedTravel) ||
              !valid(companion, companionTravel)
            }
          >
            Test these travel targets
          </button>
          {current && (
            <button
              type="button"
              className="text-button"
              onClick={() => onTest()}
            >
              Use full travel
            </button>
          )}
        </div>
      </form>
      <p className="small-note">
        The first part stays at its target while the second moves.
      </p>
    </details>
  );
}

function TravelTarget({
  plan,
  value,
  onChange,
}: {
  plan: MotionPlan;
  value: number;
  onChange: (value: number) => void;
}) {
  const { kind, travel: max } = plan.mechanism;
  const label = `${plan.label} ${kind === "hinge" ? "target angle" : "target extension"}`;
  return (
    <>
      {kind === "hinge" ? (
        <label className="field">
          {label} (degrees)
          <input
            type="number"
            required
            min={0}
            max={max}
            step="any"
            value={Number.isFinite(value) ? value : ""}
            onChange={(event) => onChange(event.target.valueAsNumber)}
          />
        </label>
      ) : (
        <LengthInput
          label={label}
          value={value}
          onChange={onChange}
          min={0}
          max={max}
          required
        />
      )}
      <p className="small-note">Full travel · {motionDistance(max, kind)}</p>
    </>
  );
}
