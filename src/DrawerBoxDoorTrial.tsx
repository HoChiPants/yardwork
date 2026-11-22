import { useState, type FormEvent } from "react";
import { checkDrawerStop } from "./drawerOpening";
import { LengthInput } from "./LengthInput";
import { motionTargetDistance, runMotionTest, type MotionPreview } from "./mechanismMotion";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

export function DrawerBoxDoorTrial({ project, drawer, onPreview, onSetup }: {
  project: Project;
  drawer: MotionPlan;
  onPreview: (pose: MotionPreview) => void;
  onSetup: (setup: MotionTestSetup | undefined) => void;
}) {
  const doors = project.motionPlans?.filter(({ mechanism }) => mechanism.kind === "hinge") ?? [];
  const [doorId, setDoorId] = useState(doors.length === 1 ? doors[0].id : "");
  const door = doors.find(({ id }) => id === doorId);
  const [angle, setAngle] = useState(door?.mechanism.travel ?? NaN);
  const [extension, setExtension] = useState(drawer.mechanism.travel);
  const [result, setResult] = useState<ReturnType<typeof checkDrawerStop>>();
  const [error, setError] = useState("");
  if (!doors.length) return null;

  function clearTrial() {
    setResult(undefined);
    setError("");
    onSetup(undefined);
  }

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!door) return;
    clearTrial();
    try {
      const checked = checkDrawerStop(project, drawer, door, extension, angle, { held: [] });
      const { review, error: reason } = runMotionTest(project, drawer, checked.setup);
      if (!review) throw Error(reason ?? "Review the selected hinge and drawer.");
      const limit = review.playbackLimit(0, 100);
      onPreview({
        ...review.preview(limit.travel, limit.inspectAt, limit.siteFaceId, limit.phase),
        uncertainLimit: limit.uncertain,
      });
      setResult(checked);
      onSetup(checked.setup);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not test this draft with the door.");
    }
  }

  const valid = door && angle >= 0.01 && angle <= door.mechanism.travel && extension > 0 && extension <= drawer.mechanism.travel;
  return <details className="field-section">
    <summary>Check this drawer with a cabinet door</summary>
    <form onSubmit={check} noValidate>
      <label className="field">
        Cabinet door
        <select value={doorId} onChange={(event) => {
          clearTrial();
          setDoorId(event.target.value);
          setAngle(doors.find(({ id }) => id === event.target.value)?.mechanism.travel ?? NaN);
        }}>
          <option value="">Choose a saved hinge</option>
          {doors.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="field">
        Draft door stop (degrees)
        <input type="number" value={Number.isFinite(angle) ? angle : ""} min={0.01} max={door?.mechanism.travel} step="any"
          onChange={(event) => {
            clearTrial();
            setAngle(event.target.value === "" ? NaN : Number(event.target.value));
          }} />
      </label>
      <LengthInput label="Draft drawer travel" value={extension} min={0} max={drawer.mechanism.travel} onChange={(next) => {
        clearTrial();
        setExtension(next);
      }} />
      <button type="submit" className="button secondary small" disabled={!valid}>Check door and drawer draft</button>
    </form>
    {result && <section aria-label="Draft door and drawer result">
      <p role="status" className="small-note">{result.status === "clear"
        ? `The draft clears ${motionTargetDistance(extension, "slide")} at ${motionTargetDistance(angle, "hinge")}, including closing.`
        : `Review the draft at ${motionTargetDistance(angle, "hinge")} and ${motionTargetDistance(extension, "slide")}.`}</p>
      {result.findings.length > 0 && <ul>{result.findings.slice(0, 3).map((finding, index) => <li key={index}>{finding}</li>)}</ul>}
    </section>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </details>;
}
