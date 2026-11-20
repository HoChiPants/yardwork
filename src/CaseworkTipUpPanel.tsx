import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { motionDistance, type MotionPreview } from "./mechanismMotion";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import {
  caseworkTipUpChoices,
  caseworkTipUpPreview,
  caseworkTipUpScope,
  reviewCaseworkTipUp,
  saveCaseworkTipUp,
} from "./caseworkTipUp";
import type { CaseworkTipUpPlan } from "./caseworkTipUpSchema";
import { useMotionPlayback } from "./useMotionPlayback";

const displayLength = (inches: number) =>
  formatStockLength(Number(inches.toFixed(2)));

type Props = {
  project: Project;
  previewActive: boolean;
  onChange: (project: Project) => void;
  onStartPreview: () => void;
  onPreview: (value: MotionPreview | null) => void;
};

function TipUpForm({
  project,
  entryId,
  plan,
  onChange,
  onPreview,
}: Props & { entryId: string; plan?: CaseworkTipUpPlan }) {
  const [ceilingHeight, setCeilingHeight] = useState(
    plan?.ceilingHeight ?? NaN,
  );
  const [stagingOffset, setStagingOffset] = useState(plan?.stagingOffset ?? 0);
  const [restingFace, setRestingFace] = useState(plan?.restingFace ?? "front");
  const [error, setError] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    try {
      const next = saveCaseworkTipUp(project, entryId, {
        ceilingHeight,
        stagingOffset,
        restingFace,
      });
      onPreview(null);
      onChange(next);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The tip-up measurements could not be saved.",
      );
    }
  }
  return (
    <form onSubmit={save}>
      <LengthInput
        label="Lowest ceiling height above floor"
        value={ceilingHeight}
        max={480}
        required
        onChange={setCeilingHeight}
      />
      <label className="field">
        Start with this face down
        <select
          value={restingFace}
          onChange={(event) =>
            setRestingFace(event.target.value as "front" | "back")
          }
        >
          <option value="front">Front face</option>
          <option value="back">Back face</option>
        </select>
      </label>
      <LengthInput
        label="Tip-up location in front of final position"
        value={stagingOffset}
        min={0}
        max={240}
        required
        onChange={setStagingOffset}
      />
      <p className="small-note">
        Enter 0 to raise the carcass at its final position. A positive offset
        tests a second move back into place once upright.
      </p>
      <button className="button secondary full" type="submit">
        Save and check tip-up
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function CaseworkTipUpPanel(props: Props) {
  const { project, onChange, onStartPreview, onPreview, previewActive } = props;
  const [selected, setSelected] = useState("");
  const available = caseworkTipUpChoices(project);
  const plans = project.caseworkTipUpPlans ?? [];
  const choices = [
    ...available.map(({ entry, title }) => ({ id: entry.id, title })),
    ...plans
      .filter((p) => !available.some(({ entry }) => entry.id === p.entryId))
      .map((p) => ({ id: p.entryId, title: "Missing casework" })),
  ];
  const id =
    choices.find((choice) => choice.id === selected)?.id ?? choices[0]?.id;
  const plan = plans.find((row) => row.entryId === id);
  const report = useMemo(
    () => (plan ? reviewCaseworkTipUp(project, plan) : null),
    [project, plan],
  );
  const margin =
    report?.peakHeight === undefined
      ? null
      : report.ceilingHeight - report.peakHeight;
  const { play, cancel } = useMotionPlayback(report ?? project, true);
  useEffect(() => {
    if (!previewActive) cancel();
  }, [previewActive]);

  if (!id) return null;
  return (
    <details className="field-section" id="casework-tip-up">
      <summary>Test casework tip-up</summary>
      {choices.length > 1 && (
        <label className="field">
          Choose carcass
          <select
            value={id}
            onChange={(event) => {
              cancel();
              onPreview(null);
              setSelected(event.target.value);
            }}
          >
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {report && (
        <div>
          <p className="small-note" role="status">
            <strong>
              {report.state === "clear"
                ? "Tip-up clears"
                : report.state === "blocked"
                  ? "Tip-up blocked"
                  : "Tip-up needs review"}
            </strong>
            <br />
            {report.detail}
          </p>
          {report.peakHeight !== undefined && margin !== null && (
            <p className="small-note">
              Upright {displayLength(report.uprightHeight!)} · Peak during turn{" "}
              {displayLength(report.peakHeight)} ·{" "}
              {margin < 0 ? "Ceiling short by" : "Ceiling margin"}{" "}
              {displayLength(Math.abs(margin))}.
            </p>
          )}
          {report.legs.map((leg) => (
            <button
              key={leg.title}
              type="button"
              className="button secondary full"
              onClick={() => {
                onStartPreview();
                onPreview(caseworkTipUpPreview(report, leg, 0));
                play(
                  0,
                  leg.limit.travel,
                  leg.mechanism.travel,
                  (position, stopped) =>
                    onPreview(
                      caseworkTipUpPreview(report, leg, position, stopped),
                    ),
                );
              }}
            >
              Play{" "}
              {leg.mechanism.kind === "hinge" ? "tip-up" : "placement slide"} ·{" "}
              {motionDistance(leg.limit.travel, leg.mechanism.kind)}
            </button>
          ))}
          {report.deferred && <p className="small-note">{report.deferred}</p>}
        </div>
      )}
      {available.some(({ entry }) => entry.id === id) && (
        <details open={!plan}>
          <summary>
            {plan ? "Edit tip-up measurements" : "Enter tip-up measurements"}
          </summary>
          <TipUpForm key={id} {...props} entryId={id} plan={plan} />
        </details>
      )}
      {plan && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            cancel();
            onPreview(null);
            onChange({
              ...project,
              caseworkTipUpPlans: plans.filter((row) => row.entryId !== id),
            });
          }}
        >
          Remove tip-up check
        </button>
      )}
      <p className="small-note">{caseworkTipUpScope}</p>
    </details>
  );
}
