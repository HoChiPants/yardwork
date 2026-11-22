import { useEffect, useRef, useState } from "react";
import { formatPreciseInches } from "./measurement";
import { motionReviewDistance, type ClosestMotionGap as Gap, type MotionReview } from "./mechanismMotion";

export function ClosestMotionGap({ review, onInspect }: {
  review: MotionReview;
  onInspect: (gap: Gap) => void;
}) {
  const task = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<MotionReview | null>(null);
  const [outcome, setOutcome] = useState<{ source: MotionReview; gap?: Gap }>();
  const searching = pending === review;
  const current = outcome?.source === review ? outcome : undefined;
  useEffect(() => () => task.current?.abort(), [review]);

  async function find() {
    const findClosest = review.clearance?.findClosest;
    if (!findClosest) return;
    const controller = new AbortController();
    task.current?.abort();
    task.current = controller;
    setOutcome(undefined);
    setPending(review);
    try {
      const gap = await findClosest(controller.signal);
      if (!controller.signal.aborted) setOutcome({ source: review, gap });
    } catch {
      if (!controller.signal.aborted) setOutcome({ source: review });
    } finally {
      if (task.current === controller) {
        task.current = null;
        setPending(null);
      }
    }
  }

  const gap = current?.gap;
  const range = gap && [
    Math.floor(gap.lowerBound * 1000) / 1000,
    Math.ceil(gap.gap * 1000) / 1000,
  ];
  if (!review.clearance?.findClosest) return null;
  return <div>
    {searching ? <div className="motion-actions">
      <span className="small-note" role="status">Checking gaps through travel…</span>
      <button type="button" className="text-button" onClick={() => {
        task.current?.abort();
        task.current = null;
        setPending(null);
      }}>Cancel gap search</button>
    </div> : !current && <button type="button" className="text-button" onClick={() => void find()}>
      Find closest gap
    </button>}
    {current && !gap && <p className="small-note" role="status">Couldn’t measure these modeled surfaces through travel.</p>}
    {gap && range && <>
      <p className="small-note" role="status">
        <strong>Closest checked gap {formatPreciseInches(gap.gap)}</strong> at {motionReviewDistance(review, gap.at, gap.phase)}.
        {" "}Modeled minimum {range[0] === range[1]
          ? formatPreciseInches(range[0])
          : `between ${formatPreciseInches(range[0])} and ${formatPreciseInches(range[1])}`}.
      </p>
      <button type="button" className="text-button" onClick={() => onInspect(gap)}>Inspect closest pose</button>
    </>}
  </div>;
}
