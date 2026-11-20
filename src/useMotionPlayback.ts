import { useEffect, useRef } from "react";

export function useMotionPlayback(source: object, active: boolean) {
  const frame = useRef<number | null>(null);

  function cancel() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  useEffect(() => cancel, [source, active]);

  function play(
    from: number,
    target: number,
    fullTravel: number,
    show: (position: number, stopped: boolean) => void,
  ) {
    cancel();
    if (
      target === from ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      show(target, true);
      return;
    }
    const start = performance.now();
    const duration = 300 + (950 * Math.abs(target - from)) / fullTravel;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      if (t === 1) {
        frame.current = null;
        show(target, true);
      } else {
        const eased = t * t * (3 - 2 * t);
        show(from + (target - from) * eased, false);
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);
  }

  return { play, cancel };
}
