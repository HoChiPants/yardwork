import { useEffect, useRef, useState, type FormEvent } from "react";
import { compareDrawerStops, parseDrawerStopAngles } from "./drawerOpening";
import { motionTargetDistance } from "./mechanismMotion";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

type Comparison = Awaited<ReturnType<typeof compareDrawerStops>>;

export function DrawerStopComparison({ project, selected, linked, test, extension, maxAngle, initialAngles, disabled, onChoose }: {
  project: Project;
  selected: MotionPlan;
  linked: MotionPlan;
  test: Pick<MotionTestSetup, "held" | "clearance">;
  extension: number;
  maxAngle: number;
  initialAngles?: readonly number[];
  disabled: boolean;
  onChoose: (setup: MotionTestSetup) => void;
}) {
  const [input, setInput] = useState(initialAngles?.join(", ") ?? "");
  const [progress, setProgress] = useState<{ tried: number; total: number }>();
  const [outcome, setOutcome] = useState<{ source: Project; rows: Comparison }>();
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), [project]);
  const rows = outcome?.source === project ? outcome.rows : undefined;
  const longest = rows?.reduce((length, row) => Math.max(length, row.verified?.extension ?? 0), 0);

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setProgress(undefined);
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || progress) return;
    setOutcome(undefined);
    setError("");
    const angles = parseDrawerStopAngles(input);
    if (!angles || angles.length < 2) {
      setError("Enter at least two different angles, separated by commas.");
      return;
    }
    const task = new AbortController();
    controller.current = task;
    setProgress({ tried: 0, total: angles.length });
    try {
      const results = await compareDrawerStops(project, selected, linked, extension, angles, test, {
        signal: task.signal,
        onProgress: (value) => { if (!task.signal.aborted) setProgress(value); },
      });
      if (!task.signal.aborted) setOutcome({ source: project, rows: results });
    } catch (cause) {
      if (!task.signal.aborted) setError(cause instanceof Error ? cause.message : "Review the stop angles and drawer travel.");
    } finally {
      if (controller.current === task) {
        controller.current = null;
        setProgress(undefined);
      }
    }
  }

  return <details className="field-section" open={initialAngles ? true : undefined}>
    <summary>Compare door stops</summary>
    <form onSubmit={compare}>
      <label className="field">
        Stop angles (degrees)
        <input type="text" value={input} onChange={(event) => {
          cancel();
          setInput(event.target.value);
          setOutcome(undefined);
          setError("");
        }} />
      </label>
      <p className="small-note">
        Separate the angles with commas. The saved door travels up to {motionTargetDistance(maxAngle, "hinge")}.
      </p>
      <div className="motion-actions">
        <button type="submit" className="button secondary small" disabled={disabled || !!progress}>Compare drawer travel</button>
        {progress && <button type="button" className="text-button" onClick={cancel}>Cancel stop comparison</button>}
      </div>
    </form>
    {progress && <p role="status">Checked {progress.tried} of {progress.total} stops…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {rows && <section aria-label="Door stop comparison">
      <p role="status">{longest
        ? `Longest verified travel is ${motionTargetDistance(longest, "slide")}.`
        : "The tested stops did not verify any drawer travel."}</p>
      <table className="guide-connection-table drawer-stop-table" aria-label="Verified drawer travel by stop">
        <thead><tr><th scope="col">Stop</th><th scope="col">Verified drawer travel</th></tr></thead>
        <tbody>{rows.map((row) => {
          const angle = motionTargetDistance(row.angle, "hinge");
          const distance = row.verified && motionTargetDistance(row.verified.extension, "slide");
          return <tr key={row.angle}>
            <th scope="row">{angle}</th>
            <td>
              <strong>{distance ?? "Review clearance"}</strong>
              {row.findings.length > 0 && <small>{distance && "Requested travel · "}{row.findings[0]}</small>}
              <button type="button" className="button secondary small" onClick={() => onChoose(row.verified?.setup ?? row.setup)}>
                {distance ? `Use ${distance} at ${angle}` : `Review ${angle} stop`}
              </button>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </section>}
  </details>;
}
