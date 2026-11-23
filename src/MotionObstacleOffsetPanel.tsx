import { useEffect, useRef, useState } from "react";
import { bounds } from "./engine";
import { LengthInput } from "./LengthInput";
import { formatStockLength } from "./measurement";
import { motionDirections, motionPairClearanceLine, motionReviewTravel, type MotionPlaybackLimit, type MotionPreview } from "./mechanismMotion";
import { unionBounds } from "./motionCamera";
import { findClearMotionOffset, maxMotionOffset, maxMotionOffsetSearch, prepareMotionOffsetTrial, type MotionOffsetTrial } from "./motionObstacleOffset";
import type { Project } from "./model";
import { motionGapPairKey, type MotionPlan, type MotionTestSetup } from "./motionPlanSchema";
import { useMotionPlayback } from "./useMotionPlayback";

export function MotionObstacleOffsetPanel({ project, plan, setup, obstacleId, label, onPreview, onReset, onClose, onApply }: {
  project: Project;
  plan: MotionPlan;
  setup?: MotionTestSetup;
  obstacleId: string;
  label: string;
  onPreview: (preview: MotionPreview) => void;
  onReset: () => void;
  onClose: () => void;
  onApply: (trial: MotionOffsetTrial) => void;
}) {
  const [direction, setDirection] = useState<number | "horizontal">("horizontal");
  const [distance, setDistance] = useState(4);
  const [trial, setTrial] = useState<MotionOffsetTrial>();
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const playback = useMotionPlayback(project, !!trial);
  useEffect(() => () => {
    request.current?.abort();
    request.current = undefined;
  }, [project]);

  function showPose(candidate: MotionOffsetTrial, pose: MotionPreview) {
    onPreview({
      ...pose,
      label: "Offset trial · " + pose.label,
      bounds: unionBounds([pose.bounds, bounds(candidate.part)]),
      pieces: [...pose.pieces, candidate.part],
    });
  }

  function show(candidate: MotionOffsetTrial, travel: number, stop?: MotionPlaybackLimit) {
    const pose = candidate.review.preview(travel, stop?.inspectAt, stop?.siteFaceId, stop?.phase);
    setPosition(pose.travel);
    showPose(candidate, {
      ...pose,
      clearanceStop: stop?.clearanceStop,
      uncertainLimit: stop?.uncertain,
    });
  }

  function reset() {
    request.current?.abort();
    request.current = undefined;
    setBusy(false);
    playback.cancel();
    setTrial(undefined);
    setMessage("");
    onReset();
  }

  async function checkOffset(search: boolean) {
    if (!search && direction === "horizontal") return;
    reset();
    const controller = new AbortController();
    request.current = controller;
    if (search) setBusy(true);
    try {
      const test = prepareMotionOffsetTrial(project, plan, setup, obstacleId);
      const candidate = search
        ? await findClearMotionOffset(test, direction, distance, controller.signal)
        : typeof direction === "number" ? test(direction, distance) : null;
      if (controller.signal.aborted) return;
      if (!candidate) {
        setMessage(search ? "No offset passed the modeled movement checks within the search distance."
          : "This position intersects wood or lies outside the available work space.");
        return;
      }
      setTrial(candidate);
      setMessage(candidate.clear
        ? `${formatStockLength(candidate.distance)} ${motionDirections[candidate.direction].label} clears the modeled opening and closing paths.`
        : candidate.regressions.length
          ? "This offset clears the current test. Review the affected movement checks below."
          : "The adjusted position still needs clearance review. Play the motion to see where it stops.");
      show(candidate, 0);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Review this offset.");
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setBusy(false);
      }
    }
  }

  function play(opening: boolean) {
    if (!trial) return;
    const end = motionReviewTravel(trial.review);
    const to = opening ? end : 0;
    const from = position === to ? opening ? 0 : end : position;
    const limit = trial.review.playbackLimit(from, to);
    playback.play(from, limit.travel, end, (travel, finished) => show(trial, travel, finished ? limit : undefined));
  }

  const valid = Number.isFinite(distance) && distance > 0 && distance <= maxMotionOffset;
  return <section className="field-section" aria-label="Try an obstruction offset">
    <h3>Try moving {label}</h3>
    <label className="field">Offset direction
      <select value={direction} disabled={busy} onChange={(event) => {
        reset();
        setDirection(event.target.value === "horizontal" ? "horizontal" : Number(event.target.value));
      }}>
        <option value="horizontal">Any horizontal direction</option>
        {motionDirections.map(({ label }, index) => <option key={label} value={index}>{label}</option>)}
      </select>
    </label>
    <LengthInput label="Offset distance or search limit" value={distance} min={0.001} max={maxMotionOffset}
      onChange={(value) => { reset(); setDistance(value); }} />
    <div className="motion-actions">
      <button type="button" className="button secondary small" disabled={!valid || busy || direction === "horizontal"}
        onClick={() => void checkOffset(false)}>Check this offset</button>
      <button type="button" className="button secondary small" disabled={!valid || distance > maxMotionOffsetSearch || busy}
        onClick={() => void checkOffset(true)}>Find a clear offset</button>
      {busy && <button type="button" className="text-button" onClick={() => request.current?.abort()}>Cancel search</button>}
    </div>
    {busy && <p className="small-note" role="status">Checking positions against saved movements…</p>}
    {valid && distance > maxMotionOffsetSearch && <p className="small-note">
      Search checks up to {maxMotionOffsetSearch} in. Use Check this offset for larger moves.
    </p>}
    {message && <p className="small-note" role="status">{message}</p>}
    {!!trial?.review.clearances?.length && (
      <ul className="motion-findings" aria-label="Minimum gaps in this offset">
        {trial.review.clearances.map((finding) => (
          <li key={motionGapPairKey(finding.requirement)} className="small-note">
            {motionPairClearanceLine(trial.project, trial.review, finding)}
          </li>
        ))}
      </ul>
    )}
    {!!trial?.regressions.length && <ul className="motion-findings" aria-label="Affected movement tests">
      {trial.regressions.map(({ id, label, detail, show }) => (
        <li key={id}>
          <p className="small-note"><strong>{label}</strong> · {detail}</p>
          {show && <button type="button" className="text-button" onClick={() => {
            playback.cancel();
            showPose(trial, show());
          }}>Inspect interference</button>}
        </li>
      ))}
    </ul>}
    {trial && <div className="motion-actions">
      <button type="button" className="button secondary small" onClick={() => play(true)}>Play trial opening</button>
      <button type="button" className="button secondary small" onClick={() => play(false)}>Play trial closing</button>
      {trial.clear && <button type="button" className="button primary small" onClick={() => onApply(trial)}>Apply offset</button>}
    </div>}
    <button type="button" className="text-button" onClick={() => { request.current?.abort(); playback.cancel(); onClose(); }}>Back to original test</button>
  </section>;
}
