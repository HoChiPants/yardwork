import { useState, type FormEvent } from "react";
import type { BearingConnection } from "./bearingConnections";
import { bearingDecisionStateText } from "./bearingConnections";
import { maxRemovalLeg } from "./bearingDecisionSchema";
import { LengthInput } from "./LengthInput";
import { motionDirections, type MotionPreview } from "./mechanismMotion";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import {
  reviewRemovalPath,
  type RemovalLeg,
  type RemovalReview,
} from "./removalMotion";
import { useMotionPlayback } from "./useMotionPlayback";

type LegForm = { direction: number; travel: number };
function restoreLeg(
  leg: RemovalLeg | undefined,
  fallbackDirection: number,
): LegForm {
  if (!leg) return { direction: fallbackDirection, travel: NaN };
  return {
    direction: motionDirections.findIndex(({ axis }) =>
      axis.every((n, index) => n === leg.axis[index]),
    ),
    travel: leg.travel,
  };
}

function LegFields({
  index,
  value,
  onChange,
}: {
  index: number;
  value: LegForm;
  onChange: (value: LegForm) => void;
}) {
  return (
    <div className="field-section">
      <label className="field">
        Movement {index} direction
        <select
          value={value.direction}
          onChange={(event) =>
            onChange({ ...value, direction: Number(event.target.value) })
          }
        >
          {motionDirections.map(({ label }, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <LengthInput
        label={`Movement ${index} distance`}
        value={value.travel}
        min={0}
        max={maxRemovalLeg}
        onChange={(travel) => onChange({ ...value, travel })}
      />
    </div>
  );
}

export function RemovalMotionPanel({
  project,
  contact,
  preview,
  onPreview,
  onBack,
  onSavePath,
  onClearPath,
}: {
  project: Project;
  contact: BearingConnection | undefined;
  preview: MotionPreview | null;
  onPreview: (preview: MotionPreview | null) => void;
  onBack: () => void;
  onSavePath: (legs: readonly RemovalLeg[]) => void;
  onClearPath: () => void;
}) {
  const saved = contact?.decision?.saved.removalPath;
  const [first, setFirst] = useState(() => restoreLeg(saved?.legs[0], 2));
  const [second, setSecond] = useState(() =>
    saved?.legs[1] ? restoreLeg(saved.legs[1], 4) : null,
  );
  const [result, setResult] = useState<{
    project: Project;
    path: RemovalReview;
  } | null>(null);
  const [error, setError] = useState("");
  const review = result?.project === project ? result.path : null;
  const { cancel, play: animate } = useMotionPlayback(project, !!preview);
  function reset() {
    cancel();
    setResult(null);
    setError("");
    onPreview(null);
  }
  const legs = () =>
    (second ? [first, second] : [first]).map(({ direction, travel }) => ({
      axis: motionDirections[direction].axis,
      travel,
    }));
  function test(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    if (!contact?.decision) return;
    try {
      const path = reviewRemovalPath(project, contact.top.id, legs());
      setResult({ project, path });
      onPreview(path.preview(0));
    } catch {
      setError(
        "The removal path could not be tested. Check the part and enter a distance between 0 and 240 inches for each movement.",
      );
    }
  }
  function updateSavedPath(update: () => void) {
    try {
      update();
      reset();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The removal path could not be updated.",
      );
    }
  }
  function show(travel: number, siteFaceId?: string) {
    cancel();
    if (review) onPreview(review.preview(travel, undefined, siteFaceId));
  }
  function play(opening: boolean) {
    if (!review || !preview) return;
    const from = preview.travel;
    const target = review.playbackLimit(from, opening ? review.total : 0);
    animate(from, target.travel, review.total, (value, stopped) =>
      onPreview({
        ...review.preview(
          value,
          stopped ? target.inspectAt : undefined,
          stopped ? target.siteFaceId : undefined,
        ),
        uncertainLimit: stopped && target.uncertain,
      }),
    );
  }
  const describe = (id: string) =>
    `${partLabel(project, id)} · ${project.pieces.find((part) => part.id === id)?.name ?? "Removed part"}`;
  const hasFindings = review?.segments.some(
    ({ path }) =>
      path.hits.length || path.zone.length || path.siteFindings.length,
  );
  const validLeg = (leg: LegForm) =>
    Number.isFinite(leg.travel) &&
    leg.travel > 0 &&
    leg.travel <= maxRemovalLeg;
  return (
    <section aria-label="Removal clearance" className="removal-motion">
      <button className="text-button" type="button" onClick={onBack}>
        ← Back to connections
      </button>
      <h2>Removal clearance</h2>
      {!contact?.decision ? (
        <p role="status">
          This saved contact has changed. Return to the bearing joint to review
          the current parts.
        </p>
      ) : (
        <>
          <p>{describe(contact.top.id)}</p>
          <p className="small-note">{contact.decision.saved.note}</p>
          {saved && (
            <div className="field-section">
              <p className="small-note" role="status">
                {contact.decision.removalText}
              </p>
              <button
                className="text-button"
                type="button"
                onClick={() => updateSavedPath(onClearPath)}
              >
                Clear saved path
              </button>
            </div>
          )}
          {contact.decision.state !== "current" && (
            <p className="small-note">
              {bearingDecisionStateText[contact.decision.state]}
            </p>
          )}
          <form onSubmit={test}>
            <LegFields
              index={1}
              value={first}
              onChange={(value) => {
                reset();
                setFirst(value);
              }}
            />
            {second && (
              <LegFields
                index={2}
                value={second}
                onChange={(value) => {
                  reset();
                  setSecond(value);
                }}
              />
            )}
            <div className="motion-actions">
              <button
                className="button primary"
                type="submit"
                disabled={
                  !validLeg(first) || (second !== null && !validLeg(second))
                }
              >
                Test path
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  reset();
                  setSecond(second ? null : { direction: 4, travel: NaN });
                }}
              >
                {second ? "Remove second movement" : "Add second movement"}
              </button>
            </div>
          </form>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {review && preview && (
        <div className="field-section">
          <label className="field">
            Removal progress · {formatStockLength(preview.travel)} of{" "}
            {formatStockLength(review.total)}
            <input
              type="range"
              aria-label="Removal progress"
              min={0}
              max={review.total}
              step="any"
              value={preview.travel}
              onChange={(event) => show(event.target.valueAsNumber)}
            />
          </label>
          <div className="motion-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => play(true)}
            >
              Play removal
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => play(false)}
            >
              Play return
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={
                !contact?.decision || contact.decision.state === "changed"
              }
              onClick={() => updateSavedPath(() => onSavePath(legs()))}
            >
              Save tested path
            </button>
          </div>
          {!hasFindings && review.unresolvedIds.length === 0 && (
            <p role="status">No modeled interference along this path.</p>
          )}
          {review.segments.map(({ start, path }, i) =>
            path.hits.length || path.zone.length || path.siteFindings.length ? (
              <section
                key={i}
                aria-label={`Movement ${i + 1} clearance findings`}
              >
                <h3>Movement {i + 1} clearance findings</h3>
                <ul className="motion-findings">
                  {path.hits.map((hit) => (
                    <li key={hit.obstacleId}>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => show(start + hit.inspectAt)}
                      >
                        {hit.kind === "solid"
                          ? "Collision"
                          : "Possible collision"}{" "}
                        · {describe(hit.obstacleId)}
                      </button>
                    </li>
                  ))}
                  {path.zone.map((hit) => (
                    <li key={hit.label}>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => show(start + hit.inspectAt)}
                      >
                        Reaches {hit.label} work-zone limit
                      </button>
                    </li>
                  ))}
                  {path.siteFindings.map(({ plane, status, inspectAt }) => (
                    <li key={plane.id}>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => show(start + (inspectAt ?? 0), plane.id)}
                      >
                        {status === "short"
                          ? "Inspect measured clearance"
                          : "Review close pass"}{" "}
                        · {plane.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {review.unresolvedIds.length > 0 && (
            <p className="small-note">
              Clearance could not be checked for{" "}
              {review.unresolvedIds.map(describe).join(", ")}.
            </p>
          )}
        </div>
      )}
      <p className="small-note">
        This preview moves one part along the distances you enter. Check
        fasteners, hand clearance and how you will handle the part on site.
      </p>
    </section>
  );
}
