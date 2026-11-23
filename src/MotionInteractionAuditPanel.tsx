import { useEffect, useRef, useState } from "react";
import { motionDistance, trialMotionOpeningOrder, type MotionPlaybackLimit, type MotionTestSelection } from "./mechanismMotion";
import { auditMotionInteractions, firstOrderStop, heldInteractionTest, interactionSetup } from "./motionInteractionAudit";
import { LengthInput } from "./LengthInput";
import { formatPreciseInches } from "./measurement";
import { motionOrderLabel } from "./motionOrderLabels";
import type { Project } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

type Report = Awaited<ReturnType<typeof auditMotionInteractions>>;
const independentLabels = {
  solid: "Contact",
  envelope: "Possible contact",
  short: "Gap too small",
  "envelope-gap": "Possible gap shortfall",
  unresolved: "Needs review",
  clear: "Pair clear",
};
export function MotionInteractionAuditPanel({ project, describe, onInspect }: {
  project: Project;
  describe: (id: string) => string;
  onInspect: (plan: MotionPlan, setup: MotionTestSetup, result: MotionTestSelection["result"], name: string, stop?: MotionPlaybackLimit) => void;
}) {
  const active = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<{ source: Project; checked: number; total: number }>();
  const [outcome, setOutcome] = useState<{ source: Project; minimum: number; report: Report }>();
  const [gap, setGap] = useState(NaN);
  const minimum = Number.isNaN(gap) ? 0 : gap;
  const invalidGap = minimum !== 0 && (!Number.isFinite(minimum) || minimum < 0.001 || minimum > 24);
  const [error, setError] = useState<{ source: Project; message: string }>();
  useEffect(() => () => active.current?.abort(), [project]);
  const running = progress?.source === project ? progress : undefined;
  const report = outcome?.source === project && outcome.minimum === minimum ? outcome.report : undefined;

  function cancel() {
    active.current?.abort();
    active.current = null;
    setProgress(undefined);
  }

  async function scan() {
    if (invalidGap) return;
    cancel();
    const request = new AbortController();
    active.current = request;
    setOutcome(undefined);
    setError(undefined);
    setProgress({ source: project, checked: 0, total: 0 });
    try {
      // Let the progress and cancel controls render before screening the saved motions.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      request.signal.throwIfAborted();
      const report = await auditMotionInteractions(project, {
        signal: request.signal, describe, minimum,
        onProgress: (checked, total) => setProgress({ source: project, checked, total }),
      });
      if (!request.signal.aborted) setOutcome({ source: project, minimum, report });
    } catch (cause) {
      if (!request.signal.aborted)
        setError({ source: project, message: cause instanceof Error ? cause.message : "Could not complete the motion scan." });
    } finally {
      if (active.current === request) cancel();
    }
  }

  return <details className="field-section" id="motion-interaction-audit">
    <summary>Scan interacting motions</summary>
    <p className="small-note">Checks opening paths against the build. Enter a gap to check the space between moving groups at any combination of openings.</p>
    <LengthInput label="Minimum gap between moving groups (optional)" min={0} max={24} value={gap}
      onChange={(value) => { if (running) cancel(); setGap(value); }} />
    {invalidGap && <p className="small-note" role="status">Enter a minimum gap from 0.001 to 24 inches.</p>}
    {running ? <div className="motion-actions">
      <span role="status" className="small-note">
        {running.total ? `Completed ${running.checked} of ${running.total} checks…` : "Finding overlapping sweeps…"}
      </span>
      <button type="button" className="text-button" onClick={cancel}>Cancel scan</button>
    </div> : <button type="button" className="button secondary small" onClick={() => void scan()} disabled={invalidGap}>
      {report ? "Scan again" : "Scan motion pairs"}
    </button>}
    {error?.source === project && <p role="alert" className="form-error">{error.message}</p>}
    {report && <section aria-label="Motion scan results">
      <p role="status" className="small-note">
        {report.pairs.length} {report.pairs.length === 1 ? "pair" : "pairs"} checked · {report.separated}
        {minimum ? ` with sweeps at least ${formatPreciseInches(minimum)} apart` : " with separate sweeps"}
        {report.shared ? ` · ${report.shared} sharing moving parts` : ""}
      </p>
      {report.unavailable.length > 0 && <ul className="motion-findings">
        {report.unavailable.map(({ plan, reason }) => <li key={plan.id}><strong>{plan.label} · Needs review</strong><p>{reason}</p></li>)}
      </ul>}
      <ul className="motion-scan-pairs">
        {report.pairs.map(({ selected, companion, paths, independent }) => {
          const name = `${selected.label} + ${companion.label}`;
          return <li key={selected.id + companion.id}>
            <strong>{name}</strong>
            <ul className="motion-scan-paths" aria-label={minimum ? "Opening paths and independent gap" : undefined}>
              {paths.map(({ order, clear, issue }) => {
                const label = motionOrderLabel(selected.label, companion.label, order);
                return <li key={order ?? "together"}>
                  <div className="motion-scan-path">
                    <span>{label} · {clear ? minimum ? "Collision path clear" : "Clear" : "Review"}</span>
                    <button type="button" className="text-button" aria-label={`Inspect ${name} · ${label}`} onClick={() => {
                      const trial = trialMotionOpeningOrder(project, selected, interactionSetup(companion), order);
                      onInspect(selected, trial.setup, trial.result, `${label} · ${name}`, firstOrderStop(trial)?.stop);
                    }}>Inspect path</button>
                  </div>
                  {issue && <p className="small-note">{issue}</p>}
                </li>;
              })}
              <li>
                <div className="motion-scan-path">
                  <span>{minimum ? `${formatPreciseInches(minimum)} gap at different openings` : "Different openings"} · {independentLabels[independent.status]}</span>
                  {"movingId" in independent && (
                    <button type="button" className="text-button" aria-label={`Inspect ${name} · Different openings`} onClick={() => {
                      const test = heldInteractionTest(project, selected, companion, independent);
                      if (test) onInspect(test.plan, test.setup, test.result, test.inspection.name, test.inspection.stop);
                    }}>{minimum ? "Inspect gap" : "Inspect contact"}</button>
                  )}
                </div>
                {"movingId" in independent && <p className="small-note">
                  {selected.label} · {motionDistance(independent.selectedTravel, selected.mechanism.kind)}
                  {" / "}{companion.label} · {motionDistance(independent.companionTravel, companion.mechanism.kind)}
                  {" · "}{describe(independent.movingId)} / {describe(independent.obstacleId)}
                  {independent.status === "short" && ` · ${formatPreciseInches(independent.gap)} modeled gap`}
                </p>}
                {independent.status === "unresolved" && <p className="small-note">Some combinations were too close to verify within the search limit.</p>}
              </li>
            </ul>
          </li>;
        })}
      </ul>
    </section>}
  </details>;
}
