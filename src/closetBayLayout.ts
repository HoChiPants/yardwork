import { formatPreciseInches } from "./measurement";
import type { ClosetInsertParams } from "./recipeSchemas";

/** Clear openings are measured between retained panel faces in the cabinet's local coordinates. */
export function closetBayLayout(p: ClosetInsertParams, panelThickness: number) {
  const available = p.width - 4 * panelThickness - (p.towerWidth ?? 25);
  const left = p.leftBayWidth ?? (p.rightBayWidth === undefined ? available / 2 : available - p.rightBayWidth);
  const right = p.rightBayWidth ?? available - left;
  let problem: string | undefined;
  if (Math.abs(left + right - available) > 1e-6)
    problem = "The two clear bays and shelf tower must fit inside the cabinet width after allowing for all four panels.";
  else if (Math.min(left, right) <= 1)
    problem = "The requested tower, bay widths and actual panel thickness leave no valid hanging bays on one or both sides.";
  return { left, right, towerCenter: (left - right) / 2, problem };
}

export function closetBaySummary(p: ClosetInsertParams, panelThickness: number) {
  const { left, right, problem } = closetBayLayout(p, panelThickness);
  if (problem) return null;
  return `Clear hanging bays: ${formatPreciseInches(left)} left and ${formatPreciseInches(right)} right.`;
}
