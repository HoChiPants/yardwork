import { useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import type { Project } from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import {
  clearGreenhouseLatch,
  greenhouseLatchScope,
  reviewGreenhouseLatch,
  saveGreenhouseLatch,
  supportsGreenhouseLatch,
} from "./greenhouseLatch";
import { type GreenhouseLatchMount } from "./greenhouseLatchSchema";

const mountFields = [
  ["inset", "Plate center in from meeting edge", 0.001],
  ["width", "Plate width", 0.001],
  ["height", "Plate height", 0.001],
  ["clearanceDepth", "Clear space needed in front of plate", 0.001],
  ["reach", "Engagement point toward meeting edge", -24],
  ["rise", "Engagement point above plate center", -24],
  ["standout", "Engagement point out from wood face", 0],
  ["pilotDepth", "Pilot tip depth into wood", 0.001],
  ["screwDiameter", "Seated screw diameter", 0.001],
  ["screwDepth", "Seated screw tip depth into wood", 0.001],
] as const;

const mountLabels = { latch: "Jamb latch", keeper: "Door keeper" } as const;
type Role = keyof typeof mountLabels;

function transferredHoles(input: string, label: string) {
  return input
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const coordinates = line.split(",").map((value) => value.trim());
      if (
        coordinates.length !== 2 ||
        coordinates.some((value) => !value || !Number.isFinite(Number(value)))
      )
        throw Error(
          `Enter one horizontal, vertical pair per line for the ${label.toLowerCase()} holes.`,
        );
      return coordinates.map(Number);
    });
}

function MountFields({
  role,
  existing,
}: {
  role: Role;
  existing?: GreenhouseLatchMount;
}) {
  return (
    <fieldset className="field-section">
      <legend>{mountLabels[role]}</legend>
      {mountFields.map(([name, label, min]) => (
        <label key={name} className="field">
          {label} (in)
          <input
            type="number"
            aria-label={`${mountLabels[role]} ${label.toLowerCase()}`}
            name={`${role}.${name}`}
            defaultValue={existing?.[name]}
            min={min}
            max={24}
            step="any"
            required
          />
        </label>
      ))}
      <label className="field">
        {mountLabels[role]} hole centers (in)
        <textarea
          name={`${role}.centers`}
          rows={3}
          maxLength={240}
          required
          defaultValue={existing?.centers
            .map((point) => point.join(", "))
            .join("\n")}
        />
      </label>
    </fieldset>
  );
}

export function GreenhouseLatchPanel({
  project,
  plan,
  shown,
  onShow,
  onChange,
}: {
  project: Project;
  plan: MotionPlan;
  shown: boolean;
  onShow: (id: string | null) => void;
  onChange: (next: Project) => void;
}) {
  const saved = project.greenhouseLatchPlans?.find(
    ({ motionId }) => motionId === plan.id,
  );
  const review = saved ? reviewGreenhouseLatch(project, saved) : null;
  const [height, setHeight] = useState(saved?.height ?? NaN);
  const [keeperHeightOffset, setKeeperHeightOffset] = useState(
    saved?.keeperHeightOffset ?? 0,
  );
  const [tolerance, setTolerance] = useState(saved?.tolerance ?? NaN);
  const [error, setError] = useState("");
  const supported = supportsGreenhouseLatch(plan);
  if (!supported && !saved) return null;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const fields = new FormData(event.currentTarget);
    function read(role: Role) {
      return {
        ...Object.fromEntries(
          mountFields.map(([name]) => [
            name,
            Number(fields.get(`${role}.${name}`)),
          ]),
        ),
        centers: transferredHoles(
          String(fields.get(`${role}.centers`) ?? ""),
          mountLabels[role],
        ),
      };
    }
    try {
      const draft = {
        height,
        keeperHeightOffset,
        tolerance,
        latch: read("latch"),
        keeper: read("keeper"),
      };
      onChange(saveGreenhouseLatch(project, plan.id, draft));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Review the delivered latch and keeper measurements.",
      );
    }
  }

  return (
    <details className="field-section">
      <summary>Fit Everbilt latch and keeper</summary>
      {review && (
        <div aria-live="polite">
          <p className="small-note">
            <strong>{review.detail}</strong>
          </p>
          {review.delta && (
            <p className="small-note">
              Keeper offset from latch · Left/right{" "}
              {formatPreciseInches(review.delta[0])} · Height{" "}
              {formatPreciseInches(review.delta[1])} · Front/back{" "}
              {formatPreciseInches(review.delta[2])}.
            </p>
          )}
          {review.mounts.map(({ role, piece, issues, holes }) => (
            <div key={role} className="small-note">
              <strong>
                {mountLabels[role]} · {partLabel(project, piece.id)}
              </strong>
              {issues.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
              {holes.state === "checked" && <p>{holes.detail}</p>}
              {holes.marks.flatMap((mark) =>
                mark.issues.map((detail) => (
                  <p key={`${mark.index}/${detail}`}>
                    Hole {mark.index} · {detail}
                  </p>
                )),
              )}
            </div>
          ))}
        </div>
      )}
      {review?.mounts.length ? (
        <button
          type="button"
          className="button secondary full"
          aria-pressed={shown}
          onClick={() => onShow(shown ? null : plan.id)}
        >
          {shown ? "Hide latch marks" : "Show latch marks in 3D"}
        </button>
      ) : null}
      {supported && (
        <details open={!saved}>
          <summary>
            {saved ? "Edit latch measurements" : "Enter latch measurements"}
          </summary>
          <form onSubmit={save}>
            <p className="small-note">
              Dry-fit Everbilt 24417 with the door closed. Measure both mounts
              and the point where the bar meets the latch groove. Use the actual
              fit to establish clearance and alignment tolerance.
            </p>
            <LengthInput
              label="Jamb latch center above door bottom"
              value={height}
              onChange={setHeight}
              max={240}
              required
            />
            <LengthInput
              label="Keeper center height offset from latch"
              value={keeperHeightOffset}
              onChange={setKeeperHeightOffset}
              min={-24}
              max={24}
              required
            />
            <p className="small-note">
              Use a positive offset if the keeper plate center is higher than
              the jamb latch plate center.
            </p>
            <LengthInput
              label="Alignment tolerance per axis"
              value={tolerance}
              onChange={setTolerance}
              min={0.001}
              max={1}
              required
            />
            <p className="small-note">
              Enter each hole as horizontal, vertical from its plate center, one
              pair per line. Positive is right and up when facing the exterior.
              A negative engagement reach points away from the meeting edge.
            </p>
            <MountFields role="latch" existing={saved?.latch} />
            <MountFields role="keeper" existing={saved?.keeper} />
            <p className="small-note">
              The instructions specify a 3/16 in pilot bit for both pieces.
              Measure pilot and seated screw depths past the wood face.
            </p>
            <button type="submit" className="button secondary full">
              Save and check latch fit
            </button>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        </details>
      )}
      {saved && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onShow(null);
            onChange(clearGreenhouseLatch(project, plan.id));
          }}
        >
          Remove latch layout
        </button>
      )}
      <p className="small-note">{greenhouseLatchScope}</p>
    </details>
  );
}
