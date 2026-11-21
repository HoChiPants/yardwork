import { useEffect, useRef, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { doorAndDrawer, findDrawerOpening } from "./drawerOpening";
import { motionDistance } from "./mechanismMotion";
import { preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

export function DrawerOpeningPanel({ project, selected, linked, test, initialExtension, expanded, onChoose }: {
  project: Project;
  selected: MotionPlan;
  linked: MotionPlan;
  test: Pick<MotionTestSetup, "held" | "clearance">;
  initialExtension: number;
  expanded?: boolean;
  onChoose: (setup: MotionTestSetup) => void;
}) {
  const pair = doorAndDrawer(selected, linked)!;
  const [extension, setExtension] = useState(initialExtension);
  const [progress, setProgress] = useState<{ tried: number; total: number }>();
  const [outcome, setOutcome] = useState<{ source: Project; result: Awaited<ReturnType<typeof findDrawerOpening>> }>();
  const [error, setError] = useState("");
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), [project]);
  const result = outcome?.source === project ? outcome.result : undefined;
  const valid = Number.isFinite(extension) && extension > 0 && extension <= pair.drawer.mechanism.travel;

  function cancel() {
    run.current?.abort();
    run.current = null;
    setProgress(undefined);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    cancel();
    setOutcome(undefined);
    setError("");
    const task = new AbortController();
    run.current = task;
    setProgress({ tried: 0, total: 0 });
    try {
      const result = await findDrawerOpening(project, selected, linked, extension, test, {
        signal: task.signal,
        onProgress: (value) => { if (!task.signal.aborted) setProgress(value); },
      });
      if (!task.signal.aborted) setOutcome({ source: project, result });
    } catch (cause) {
      if (!task.signal.aborted) setError(cause instanceof Error ? cause.message : "Review the selected door and drawer.");
    } finally {
      if (run.current === task) {
        run.current = null;
        setProgress(undefined);
      }
    }
  }

  return <details className="field-section" open={expanded}>
    <summary>Find a door opening for the drawer</summary>
    <form onSubmit={search} noValidate>
      <LengthInput label="Drawer extension to check" value={extension} min={0} max={pair.drawer.mechanism.travel}
        defaultUnit={preferredLengthUnit(initialExtension)} onChange={(value) => {
          cancel();
          setOutcome(undefined);
          setError("");
          setExtension(value);
        }} />
      <p className="small-note">Checks whole-degree angles and the reachable endpoint with other parts held at their current test positions.</p>
      <div className="motion-actions">
        <button type="submit" className="button secondary small" disabled={!valid || !!progress}>Find an opening</button>
        {progress && <button type="button" className="text-button" onClick={cancel}>Cancel angle search</button>}
      </div>
    </form>
    {progress && <p role="status">{progress.total ? `Checked ${progress.tried} of ${progress.total} angles…` : "Checking the door swing…"}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <div className="notice">
      <div>
        {result.status === "clear" ? <>
          <p role="status"><strong>Open {pair.door.label} to {motionDistance(result.angle, "hinge")}, then extend {pair.drawer.label} to {motionDistance(extension, "slide")}.</strong></p>
          <p className="small-note">This was the first passing angle in the search. Retract the drawer before closing the door.</p>
        </> : <>
          <p role="status">{result.tried
            ? `None of the ${result.tried} openings checked up to ${motionDistance(result.maximum, "hinge")} verified the requested extension.`
            : "The door did not reach a testable opening with the drawer shut."}</p>
          <p className="small-note">Inspect the modeled obstruction or try a shorter drawer extension.</p>
        </>}
        <button type="button" className="button secondary small" onClick={() => onChoose(result.setup)}>
          {result.status === "clear" ? "Use this opening sequence" : "Review the attempted sequence"}
        </button>
      </div>
    </div>}
  </details>;
}
