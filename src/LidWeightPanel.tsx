import { useState, type FormEvent } from "react";
import {
  formatLidTorque,
  formatLidWeightNumber,
  lidMomentReference,
  lidStayScope,
  lidStayTorqueComparison,
  lidWeightScope,
  removeLidWeight,
  type reviewLidWeight,
  saveLidWeight,
} from "./lidWeight";
import { everbiltLidSupport, springLidStay } from "./lidStayReference";
import type { Project } from "./model";
import type { LidWeightPlan } from "./lidWeightSchema";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";

const offsets = [
  ["x", "Side offset (local X)"],
  ["y", "Height offset (local Y)"],
  ["z", "Front/back offset (local Z)"],
] as const;

export function LidWeightPanel({
  project,
  sectionId,
  plan,
  review,
  onChange,
}: {
  project: Project;
  sectionId: string;
  plan: LidWeightPlan | undefined;
  review: ReturnType<typeof reviewLidWeight> | null;
  onChange: (project: Project) => void;
}) {
  const [error, setError] = useState("");
  const stay =
    review?.state === "ready" ? lidStayTorqueComparison(review) : null;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    const number = (key: string) => Number(input.get(key));
    try {
      onChange(
        saveLidWeight(project, sectionId, {
          weightLb: number("weight"),
          centerLocal: [number("x"), number("y"), number("z")],
        }),
      );
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Check the lid measurements.",
      );
    }
  }
  return (
    <details className="field-section">
      <summary>Lid weight and gravity torque</summary>
      {plan && review?.state === "ready" && (
        <div>
          <p className="small-note">
            {review.axisLabel} · {formatLidWeightNumber(plan.weightLb)} lb
          </p>
          <p>
            <strong>{formatLidTorque(review.angleTorque(0))}</strong> at 0°
          </p>
          <p className="small-note">
            Peak {formatLidTorque(review.peak)} at{" "}
            {formatLidWeightNumber(review.peakAngle)}° over the modeled 0–
            {LID_OPEN_ANGLE_DEGREES}° swing.
          </p>
        </div>
      )}
      {stay && (
        <details className="field-section">
          <summary>Compare lid stays</summary>
          <p>
            <strong>Sugatsune {springLidStay.model}</strong>
          </p>
          <p className="small-note">{stay.note}</p>
          {!!stay.rows.length && (
            <ul className="small-note">
              {stay.rows.map(({ location, range, result }) => (
                <li key={location}>
                  {location} {range} · {result}
                </li>
              ))}
            </ul>
          )}
          <p className="small-note">{lidStayScope}</p>
          <p className="small-note">
            <a href={springLidStay.manual} target="_blank" rel="noreferrer">
              Sugatsune installation manual
            </a>
            {" · "}
            <a href={springLidStay.listing} target="_blank" rel="noreferrer">
              Sugatsune listing
            </a>
          </p>
          <p>
            <strong>Home Depot Everbilt {everbiltLidSupport.model}</strong>
          </p>
          <p className="small-note">{everbiltLidSupport.scope}</p>
          <p className="small-note">
            <a
              href={everbiltLidSupport.manual}
              target="_blank"
              rel="noreferrer"
            >
              Retailer-linked drawing for 19844
            </a>
            {" · "}
            <a
              href={everbiltLidSupport.listing}
              target="_blank"
              rel="noreferrer"
            >
              Home Depot listing
            </a>
          </p>
        </details>
      )}
      {review?.state === "stale" && (
        <p role="status" className="form-error">
          {review.reason}
        </p>
      )}
      <p className="small-note">
        Include the handle, cushion and anything else that moves with the lid.
        Enter balance-point offsets in inches from the center of the lid blank.
        Zero offsets use the blank center.
      </p>
      <form key={JSON.stringify([project.id, sectionId, plan])} onSubmit={save}>
        <label className="field">
          Lid weight (lb)
          <input
            type="number"
            name="weight"
            step="any"
            min={0.001}
            max={1000}
            required
            defaultValue={plan?.weightLb}
          />
        </label>
        {offsets.map(([key, label], index) => (
          <label className="field" key={key}>
            {label} (in)
            <input
              type="number"
              name={key}
              min={-12000}
              max={12000}
              step="any"
              required
              defaultValue={plan?.centerLocal[index] ?? 0}
            />
          </label>
        ))}
        <button type="submit" className="button secondary full">
          Save lid measurements
        </button>
        {plan && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setError("");
              onChange(removeLidWeight(project, sectionId));
            }}
          >
            Remove lid measurements
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <p className="small-note">
        {lidWeightScope}{" "}
        <a href={lidMomentReference} target="_blank" rel="noreferrer">
          Manufacturer lid moment reference
        </a>
      </p>
    </details>
  );
}
