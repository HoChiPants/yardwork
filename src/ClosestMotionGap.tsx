import { useCallback, useEffect, useRef, useState } from "react";
import { formatPreciseInches } from "./measurement";
import { motionReviewDistance, type ClosestMotionGap as Gap, type MotionGapSearch, type MotionReview } from "./mechanismMotion";

export function ClosestMotionGap({ review, search, autoStart = false, onInspect }: {
  review: MotionReview;
  search?: MotionGapSearch;
  autoStart?: boolean;
  onInspect: (gap: Gap) => void;
}) {
  const task = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<MotionReview | null>(null);
  const [outcome, setOutcome] = useState<{ source: MotionReview; gap?: Gap }>();
  const searching = pending === review;
  const current = outcome?.source === review ? outcome : undefined;
  const find = useCallback(async () => {
    if (!search) return;
    const controller = new AbortController();
    task.current?.abort();
    task.current = controller;
    setOutcome(undefined);
    setPending(review);
    try {
      const gap = await search(controller.signal);
      if (!controller.signal.aborted) setOutcome({ source: review, gap });
    } catch {
      if (!controller.signal.aborted) setOutcome({ source: review });
    } finally {
      if (task.current === controller) {
        task.current = null;
        setPending(null);
      }
    }
  }, [review, search]);
  useEffect(() => {
    if (autoStart) void find();
    return () => task.current?.abort();
  }, [autoStart, find]);

  const gap = current?.gap;
  const range = gap && [
    Math.floor(gap.lowerBound * 1000) / 1000,
    Math.ceil(gap.gap * 1000) / 1000,
  ];
  if (!search) return null;
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
