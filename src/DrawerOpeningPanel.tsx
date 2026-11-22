import { useEffect, useRef, useState, type FormEvent } from "react";
import { LengthInput } from "./LengthInput";
import { checkDrawerStop, doorAndDrawer, findDrawerOpening, findShorterDrawerTravel } from "./drawerOpening";
import { motionDistance } from "./mechanismMotion";
import { preferredLengthUnit } from "./measurement";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

export function DrawerOpeningPanel({ project, selected, linked, test, initialExtension, initialStop, expanded, onChoose }: {
  project: Project;
  selected: MotionPlan;
  linked: MotionPlan;
  test: Pick<MotionTestSetup, "held" | "clearance">;
  initialExtension: number;
  initialStop?: number;
  expanded?: boolean;
  onChoose: (setup: MotionTestSetup) => void;
}) {
  const pair = doorAndDrawer(selected, linked)!;
  const [extension, setExtension] = useState(initialExtension);
  const [stop, setStop] = useState(initialStop ?? NaN);
  const [progress, setProgress] = useState<{ tried: number; total: number } | "shorter">();
  const [outcome, setOutcome] = useState<{ source: Project; result: Awaited<ReturnType<typeof findDrawerOpening>> }>();
  const [stopOutcome, setStopOutcome] = useState<{ source: Project; result: ReturnType<typeof checkDrawerStop> }>();
  const [shorter, setShorter] = useState<Awaited<ReturnType<typeof findShorterDrawerTravel>> | null>();
  const [error, setError] = useState("");
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), [project]);
  const result = outcome?.source === project ? outcome.result : undefined;
  const checkedStop = stopOutcome?.source === project ? stopOutcome.result : undefined;
  const valid = Number.isFinite(extension) && extension > 0 && extension <= pair.drawer.mechanism.travel;
  const validStop = Number.isFinite(stop) && stop >= 0.01 && stop <= pair.door.mechanism.travel;

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
    setStopOutcome(undefined);
    setShorter(undefined);
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

  function checkStop() {
    if (!valid || !validStop) return;
    setOutcome(undefined);
    setStopOutcome(undefined);
    setShorter(undefined);
    setError("");
    try {
      const result = checkDrawerStop(project, selected, linked, extension, stop, test);
      setStopOutcome({ source: project, result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review the selected door and drawer.");
    }
  }

  async function searchShorter() {
    if (!checkedStop?.canTryShorter || progress) return;
    const task = new AbortController();
    run.current = task;
    setProgress("shorter");
    setError("");
    try {
      const option = await findShorterDrawerTravel(project, selected, linked, extension, stop, test, task.signal);
      if (!task.signal.aborted) setShorter(option ?? null);
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
          setStopOutcome(undefined);
          setShorter(undefined);
          setError("");
          setExtension(value);
        }} />
      <p className="small-note">Checks whole-degree angles and the reachable endpoint with other parts held at their current test positions.</p>
      <div className="motion-actions">
        <button type="submit" className="button secondary small" disabled={!valid || !!progress}>Find an opening</button>
        {progress && progress !== "shorter" && <button type="button" className="text-button" onClick={cancel}>Cancel angle search</button>}
      </div>
      <label className="field">
        Door stop angle (degrees)
        <input type="number" min={0.01} max={pair.door.mechanism.travel} step="any"
          value={Number.isFinite(stop) ? stop : ""}
          onChange={(event) => {
            if (progress === "shorter") cancel();
            setStop(event.target.value === "" ? NaN : Number(event.target.value));
            setStopOutcome(undefined);
            setShorter(undefined);
          }} />
      </label>
      <p className="small-note">Enter the measured stop or the stated angle for your exact hinge hardware. The saved door travel is {motionDistance(pair.door.mechanism.travel, "hinge")}.</p>
      <button type="button" className="button secondary small" disabled={!valid || !validStop || !!progress} onClick={checkStop}>Check door stop</button>
    </form>
    {progress && progress !== "shorter" &&
      <p role="status">{progress.total ? `Checked ${progress.tried} of ${progress.total} angles…` : "Checking the door swing…"}</p>}
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
    {checkedStop && <section className="notice" aria-label="Door stop check">
      <div>
        <p role="status"><strong>{checkedStop.status === "clear"
          ? `The ${motionDistance(checkedStop.angle, "hinge")} stop clears ${motionDistance(extension, "slide")} of drawer travel in the model.`
          : `Review the ${motionDistance(checkedStop.angle, "hinge")} stop for ${motionDistance(extension, "slide")} of drawer travel.`}</strong></p>
        {!!checkedStop.findings.length && <ul>{checkedStop.findings.slice(0, 3).map((line, index) => <li key={index}>{line}</li>)}</ul>}
        <div className="motion-actions">
          <button type="button" className="button secondary small" onClick={() => onChoose(checkedStop.setup)}>
            {checkedStop.status === "clear" ? "Use this stop sequence" : "Review this door-stop test"}
          </button>
          {checkedStop.canTryShorter && shorter === undefined && progress !== "shorter" &&
            <button type="button" className="button secondary small" onClick={searchShorter}>Find shorter drawer travel</button>}
        </div>
        {progress === "shorter" && <p role="status">
          Checking shorter extensions… <button type="button" className="text-button" onClick={cancel}>Cancel travel search</button>
        </p>}
        {shorter === null && <p role="status">No shorter extension was verified at this stop.</p>}
        {shorter && <>
          <p role="status">The model verified {motionDistance(shorter.extension, "slide")} of drawer travel at this stop, including closing.</p>
          <button type="button" className="button secondary small" onClick={() => onChoose(shorter.setup)}>Use shorter sequence</button>
        </>}
      </div>
    </section>}
  </details>;
}
