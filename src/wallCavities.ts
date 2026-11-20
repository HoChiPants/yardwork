export type WallRectangle = {
  left: number;
  right: number;
  low: number;
  high: number;
};

/** Cut the wall plane around the explicit frame and its blocked openings. */
export function wallCavities(wall: WallRectangle, blocked: WallRectangle[]) {
  let free = [wall];
  for (const member of blocked) {
    free = free.flatMap((bay) => {
      const left = Math.max(bay.left, member.left);
      const right = Math.min(bay.right, member.right);
      const low = Math.max(bay.low, member.low);
      const high = Math.min(bay.high, member.high);
      if (right - left <= 0.0001 || high - low <= 0.0001) return [bay];
      return [
        { ...bay, right: left },
        { ...bay, left: right },
        { left, right, low: bay.low, high: low },
        { left, right, low: high, high: bay.high },
      ].filter((r) => r.right - r.left > 0.0001 && r.high - r.low > 0.0001);
    });
  }
  return free;
}
