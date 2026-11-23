import { useEffect, useRef, useState } from "react";
import {
  trialMotionOpeningOrder, type MotionPlaybackLimit, type MotionTestSelection,
} from "./mechanismMotion";
import type { Project } from "./model";
import { motionOpeningOrders, motionOrderLabel, motionStopText } from "./motionOrderLabels";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";

type Trial = ReturnType<typeof trialMotionOpeningOrder>;

export function MotionOrderComparison({ project, selected, companion, setup, describe, expanded, onPreview }: {
  project: Project;
  selected: MotionPlan;
  companion: MotionPlan;
  setup: MotionTestSetup;
  describe: (id: string) => string;
  expanded?: boolean;
  onPreview: (setup: MotionTestSetup, result: MotionTestSelection["result"], stop?: MotionPlaybackLimit) => void;
}) {
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<Project | null>(null);
  const [checked, setChecked] = useState<{ project: Project; trials: Trial[] }>();
  const results = checked?.project === project ? checked.trials : undefined;
  useEffect(() => () => controller.current?.abort(), [project]);

  async function compare() {
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setPending(project);
    setChecked(undefined);
    const trials: Trial[] = [];
    for (const order of motionOpeningOrders) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (request.signal.aborted) return;
      trials.push(trialMotionOpeningOrder(project, selected, setup, order));
    }
    setChecked({ project, trials });
    setPending(null);
  }

  return <details className="field-section" open={expanded}>
    <summary>Compare opening orders</summary>
    <p className="small-note">Each order uses the same travel targets, held positions and minimum gaps. Closing follows the reverse path from the target pose.</p>
    {!results && (pending === project
      ? <div className="motion-actions">
        <span role="status" className="small-note">Checking both directions…</span>
        <button type="button" className="text-button" onClick={() => {
          controller.current?.abort();
          setPending(null);
        }}>Cancel comparison</button>
      </div>
      : <button type="button" className="button secondary small" onClick={() => void compare()}>Check all three orders</button>)}
    {results && <ul className="motion-findings" aria-label="Opening order results">
      {results.map(({ setup, result, clear, opening, closing }) => {
        const order = setup.openingOrder;
        const name = motionOrderLabel(selected.label, companion.label, order);
        const blocked = opening?.inspectAt !== undefined ? opening : closing?.inspectAt !== undefined ? closing : undefined;
        return <li key={order ?? "together"}>
          <strong>{name}</strong>
          {result.review ? <>
            {clear ? <p className="small-note">Clear through opening and closing.</p> : <>
              {opening?.inspectAt !== undefined && <p className="small-note">Opening stop · {motionStopText(result.review, opening, describe)}</p>}
              {closing?.inspectAt !== undefined && <p className="small-note">Closing stop · {motionStopText(result.review, closing, describe)}</p>}
              {!blocked && <p className="small-note">The target was reached. Open this test to review uncertain gaps or geometry.</p>}
            </>}
            <button type="button" className="text-button" onClick={() => onPreview(setup, result, blocked)}>
              {blocked ? "Inspect first stop" : "Preview order"}
            </button>
          </> : <p className="small-note">{result.error}</p>}
        </li>;
      })}
    </ul>}
  </details>;
}
