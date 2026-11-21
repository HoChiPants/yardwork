import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Section } from "./model";
import { partLabel } from "./partLabels";
import { formatPreciseInches } from "./measurement";
import {
  reviewLidTravel,
  type LidPreview,
  type LidTravelReview,
} from "./lidMotion";
import { lidSiteAngle, lidSiteMotionText } from "./lidSiteClearance";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";
import { useMotionPlayback } from "./useMotionPlayback";
import type { MotionCollisionFocus } from "./motionCamera";
import { LidWeightPanel } from "./LidWeightPanel";
import { LidStayFitEditor } from "./LidStayFitEditor";
import { lidStayTravelReviews, lidTravelPose, type LidTravelInspection } from "./lidTravelFindings";
import {
  armContactText,
  limitLidStayPlayback,
} from "./lidStayFit";
import { formatLidTorque, reviewLidWeight } from "./lidWeight";

/** Travel is temporary; weight and mounting measurements save separately. */
export function LidMotionPanel({
  project,
  section,
  onPreview,
  previewActive,
  initialInspection,
  onChange,
}: {
  project: Project;
  section: Section;
  onPreview: (preview: LidPreview | null) => void;
  previewActive: boolean;
  initialInspection?: LidTravelInspection;
  onChange: (project: Project) => void;
}) {
  const [angle, setAngle] = useState(0),
    [review, setReview] = useState<LidTravelReview | null>(null),
    [error, setError] = useState(""),
    [stayStop, setStayStop] =
      useState<ReturnType<typeof limitLidStayPlayback>>(null);
  const stayRows = useMemo(
    () => lidStayTravelReviews(project, section.id),
    [project, section.id],
  );
  const stayReviews = stayRows.map(({ status }) => status);
  const weightPlan = project.lidWeightPlans?.find(
    (plan) => plan.sectionId === section.id,
  );
  const weightReview = useMemo(
    () => (weightPlan ? reviewLidWeight(project, weightPlan) : null),
    [project, weightPlan],
  );
  const { cancel, play: animate } = useMotionPlayback(project, previewActive);
  const latestPreview = useRef(onPreview);
  const inspectedFace = useRef<string | undefined>(undefined);
  latestPreview.current = onPreview;
  useEffect(() => {
    setReview(initialInspection?.review ?? null);
    setAngle(initialInspection?.finding?.angle ?? 0);
    setError(initialInspection?.error ?? "");
    setStayStop(initialInspection?.finding?.stayStop ?? null);
    inspectedFace.current = initialInspection?.finding?.faceId;
    if (!initialInspection) latestPreview.current(null);
    return () => latestPreview.current(null);
  }, [project, section.id, initialInspection]);
  const showPose = (
    next: LidPreview,
    faceId = inspectedFace.current,
    stoppedByStay: ReturnType<typeof limitLidStayPlayback> = null,
    focusPair?: MotionCollisionFocus,
  ) => {
    setAngle(next.angle);
    setStayStop(stoppedByStay);
    onPreview({ ...lidTravelPose(next, stayReviews, faceId, stoppedByStay), focusPair });
    setError("");
  };
  const showAngle = (requested: number, faceId?: string, focus?: string) => {
    cancel();
    inspectedFace.current = faceId;
    if (review) {
      const next = review.preview(requested);
      showPose(next, faceId, null, focus ? [next.piece.id, focus] : undefined);
    }
  };
  const play = (opening: boolean) => {
    if (!review) return;
    inspectedFace.current = undefined;
    const end = review.travel;
    const limit = review.playbackLimit(angle, opening ? end : 0);
    const stay = limitLidStayPlayback(stayReviews, angle, limit.travel);
    const target = stay?.travel ?? limit.travel;
    animate(angle, target, end, (value, stopped) =>
      showPose(
        review.preview(value, stopped && !stay ? limit.inspectAt : undefined),
        inspectedFace.current,
        stopped ? stay : null,
      ),
    );
  };
  const start = () => {
    try {
      const result = reviewLidTravel(project, section.id);
      inspectedFace.current = undefined;
      setReview(result);
      showPose(
        result.preview(section.recipe?.lidOpen ? LID_OPEN_ANGLE_DEGREES : 0),
      );
    } catch (problem) {
      onPreview(null);
      setReview(null);
      setError(
        problem instanceof Error
          ? problem.message
          : "The lid travel could not be reviewed.",
      );
    }
  };
  return (
    <section
      className="lid-motion-panel field-section"
      aria-label="Lid travel review"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h4>Lid travel</h4>
      <p className="small-note">
        Play the lid in either direction to test clearance, or scrub to inspect
        any angle.
      </p>
      <LidWeightPanel
        project={project}
        sectionId={section.id}
        plan={weightPlan}
        review={weightReview}
        onChange={onChange}
      />
      <div hidden={previewActive}>
        <LidStayFitEditor
          project={project}
          section={section}
          onChange={onChange}
        />
        <button type="button" className="button secondary full" onClick={start}>
          Review lid travel
        </button>
      </div>
      {previewActive && (
        <div data-testid="lid-preview-controls">
          <p className="small-note" role="status">
            Temporary lid preview · {lidSiteAngle(angle)} · close preview to
            edit parts.
          </p>
          <label className="field">
            Opening angle ·{" "}
            <output aria-label="Current lid preview angle">
              {lidSiteAngle(angle)}
            </output>
            <input
              aria-label="Lid preview angle"
              type="range"
              min={0}
              max={review?.travel ?? LID_OPEN_ANGLE_DEGREES}
              step={1}
              value={Math.round(angle)}
              onChange={(event) => showAngle(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>
          {stayStop && (
            <>
              <p role="status">
                {stayStop.kind !== "reach"
                  ? armContactText(project, stayStop)
                  : "Playback stopped at a folding stay’s measured reach limit."}
              </p>
              {stayStop.kind !== "reach" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    if (stayStop.kind === "arm-contact") {
                      showAngle(stayStop.inspectAt);
                    } else if (review) {
                      cancel();
                      showPose(review.preview(stayStop.inspectAt), undefined, stayStop);
                    }
                  }}
                >
                  {stayStop.kind === "arm-contact" ? "Inspect arm contact" : "Inspect arm clearance"}
                </button>
              )}
            </>
          )}
          {stayRows.map(({ fit, status }) => {
            if (status.state !== "current") return null;
            const link = status.preview(angle);
            const hitIds = [
              ...new Set(link.arms?.flatMap((arm) => arm.hitIds) ?? []),
            ];
            return (
              <p
                className="small-note"
                key={fit.id}
                data-testid="lid-stay-live"
                data-state={link.state}
              >
                {partLabel(project, fit.fixedPieceId)} stay ·{" "}
                {formatPreciseInches(link.distance)} pin spacing
                {link.state === "too-far"
                  ? " · Cannot extend this far"
                  : link.state === "too-short"
                    ? " · Cannot fold this close"
                    : ""}
                {!!hitIds.length &&
                  ` · Arm overlap with ${hitIds.map((id) => partLabel(project, id)).join(", ")}`}
              </p>
            );
          })}
          {weightReview?.state === "ready" && (
            <p className="small-note">
              Gravity torque ·{" "}
              <output
                aria-label="Gravity torque at preview angle"
                aria-live="off"
              >
                {formatLidTorque(weightReview.angleTorque(angle))}
              </output>
            </p>
          )}
          <div className="motion-actions">
            <button
              type="button"
              className="button secondary small"
              onClick={() => play(true)}
            >
              Play opening
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => play(false)}
            >
              Play closing
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => showAngle(0)}
            >
              Inspect closed (0°)
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() =>
                showAngle(review?.travel ?? LID_OPEN_ANGLE_DEGREES)
              }
            >
              Inspect open ({review?.travel ?? LID_OPEN_ANGLE_DEGREES}°)
            </button>
          </div>
          <button
            type="button"
            className="text-button"
            style={{ marginTop: 10 }}
            onClick={() => {
              cancel();
              onPreview(null);
            }}
          >
            Exit lid preview
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <div className="lid-travel-results" data-testid="lid-travel-results">
          <p className="small-note">
            <strong>
              {review.collisions.length
                ? `${review.collisions.length} potential ${review.collisions.length === 1 ? "obstruction" : "obstructions"} found along the travel.`
                : review.unsupportedPieceIds.length
                  ? "Some part geometry needs clearance review."
                  : "Lid panel clears the modeled parts along this travel."}
            </strong>
          </p>
          {review.collisions.length > 0 && (
            <p className="small-note">
              Inspect the first interference, then exit preview to move the
              obstruction or revise the lid clearance.
            </p>
          )}
          {review.collisions.map((collision) => {
            const piece = project.pieces.find(
                (part) => part.id === collision.pieceId,
              ),
              label = partLabel(project, collision.pieceId);
            return (
              <div
                key={collision.pieceId}
                className="section-description"
                data-lid-obstruction-id={collision.pieceId}
              >
                <p className="small-note">
                  <strong>
                    {label} · {piece?.name ?? "Missing part"}
                  </strong>
                  <br />
                  {collision.kind === "envelope"
                    ? "Possible collision · part envelope"
                    : collision.kind === "uncertain"
                      ? "Clearance needs review"
                      : "Solid interference"}{" "}
                  near {lidSiteAngle(collision.firstAngle)}.
                </p>
                <div className="motion-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Inspect ${label} at ${lidSiteAngle(collision.inspectAngle)}`}
                    onClick={() => showAngle(collision.inspectAngle)}
                  >
                    Inspect at {lidSiteAngle(collision.inspectAngle)}
                  </button>
                  {collision.kind !== "uncertain" &&
                    lidSiteAngle(collision.closingAngle) !==
                      lidSiteAngle(collision.inspectAngle) && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => showAngle(collision.closingAngle)}
                      >
                        Inspect closing near{" "}
                        {lidSiteAngle(collision.closingAngle)}
                      </button>
                    )}
                  <button type="button" className="text-button"
                    aria-label={`Focus these parts for the lid against ${label}`}
                    onClick={() => showAngle(
                      angle === collision.closingAngle ? collision.closingAngle : collision.inspectAngle,
                      undefined, collision.pieceId,
                    )}>
                    Focus these parts
                  </button>
                </div>
              </div>
            );
          })}
          {review.outsideZone && (
            <div
              className="section-description"
              data-testid="lid-work-zone-finding"
            >
              <p className="small-note">
                <strong>Swing exceeds the work zone.</strong>
                <br />
                Boundaries: {review.outsideZone.faces.join(", ")}. Increase the
                actual available clearance or change the layout.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => showAngle(review.outsideZone!.inspectAngle)}
              >
                Inspect work-zone limit
              </button>
            </div>
          )}
          {review.siteClearances.map((result) => (
            <div
              className="section-description"
              key={result.plane.id}
              data-testid="lid-site-clearance"
            >
              <p className="small-note">
                <strong>
                  {result.plane.label} ·{" "}
                  {result.status === "short"
                    ? "Lid clearance shortfall"
                    : result.status === "needs-review"
                      ? "Lid clearance needs review"
                      : result.status === "outside-height"
                        ? "Outside the measured height band"
                        : "Modeled swing meets minimum"}
                </strong>
                <br />
                {lidSiteMotionText(result)}
              </p>
              {result.status === "short" && result.angle !== null && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => showAngle(result.angle!, result.plane.id)}
                >
                  Inspect {result.plane.label} at {lidSiteAngle(result.angle)}
                </button>
              )}
            </div>
          ))}
          {review.unsupportedPieceIds.length > 0 && (
            <p className="small-note">
              {review.unsupportedPieceIds.length}{" "}
              {review.unsupportedPieceIds.length === 1
                ? "part needs"
                : "parts need"}{" "}
              separate envelope/geometry review.
            </p>
          )}
          <details>
            <summary>Clearance, pivot and hardware details</summary>
            <p className="small-note">
              Playback stops at detected interference, work-zone boundaries,
              measured site shortfalls, folding stay reach limits, or arm
              contacts found in the sampled travel. The angle controls let you
              inspect either side of an obstruction.
            </p>
            <p className="small-note">
              {review.mechanism
                ? `${review.mechanism.label} entered hinge axis`
                : "Provisional rear pivot"}{" "}
              (world inches):{" "}
              {review.pivot.map((value) => String(value)).join(", ")}.<br />
              Axis:{" "}
              {review.axis
                .map((value) => String(Number(value.toFixed(6))))
                .join(", ")}
              ; pivot-axis span {formatPreciseInches(review.width)}.
            </p>
            <p className="small-note">
              Hinge/stay selection, mounting, pinch protection and loads still
              need review. Purchase records do not create an installed
              mechanism.
            </p>
            {review.unsupportedPieceIds.map((id) => (
              <p className="small-note" key={id}>
                {partLabel(project, id)} ·{" "}
                {project.pieces.find((piece) => piece.id === id)?.name ??
                  "Missing part"}
              </p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
