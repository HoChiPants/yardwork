import { connectionCoverage } from "./connectionCoverage";
import { bounds } from "./engine";
import { proposalMotionChanges } from "./motionImpact";
import { motionDirections, motionReviewPasses, runMotionTest, type MotionReview } from "./mechanismMotion";
import { material, type Piece, type Project, type V3 } from "./model";
import type { MotionPlan, MotionTestSetup } from "./motionPlanSchema";
import { placeWood } from "./placement";

export const motionOffsetIncrement = 0.125;
export const maxMotionOffsetSearch = 12;
export const maxMotionOffset = 240;

export function offsettableMotionObstacles(project: Project, ids: readonly string[]) {
  if (!ids.length) return [];
  const requested = new Set(ids);
  const bound = new Set([
    ...project.sections.flatMap(({ pieceIds }) => pieceIds),
    ...(project.motionPlans ?? []).flatMap(({ memberIds }) => memberIds),
    ...(project.woodJointDecisions ?? []).flatMap(({ firstId, secondId }) => [firstId, secondId]),
  ]);
  const loose = project.pieces.filter(({ id, material: stock, offcut }) =>
    requested.has(id) && !bound.has(id) && !offcut && material(stock).wood);
  if (!loose.length) return [];
  const joined = new Set(connectionCoverage(project).intents.flatMap(({ pieceIds }) => pieceIds));
  return loose.filter(({ id }) => !joined.has(id));
}

export type MotionOffsetTrial = {
  source: Project;
  project: Project;
  part: Piece;
  review: MotionReview;
  direction: number;
  distance: number;
  clear: boolean;
  regressions: ReturnType<typeof proposalMotionChanges>;
};

export function prepareMotionOffsetTrial(project: Project, plan: MotionPlan, setup: MotionTestSetup | undefined, obstacleId: string) {
  const [obstacle] = offsettableMotionObstacles(project, [obstacleId]);
  if (!obstacle) throw Error("Choose a separate fixed wood part with no saved connections.");
  return (direction: number, distance: number): MotionOffsetTrial | null => {
    const move = motionDirections[direction];
    if (!move || !Number.isFinite(distance) || distance <= 0 || distance > maxMotionOffset)
      throw Error("Enter a positive offset in the chosen direction.");
    const axis = move.axis.findIndex((value) => value !== 0) as 0 | 1 | 2;
    const position = obstacle.position.map((value, i) => value + move.axis[i] * distance) as V3;
    if (position.some((value) => Math.abs(value) > 12000)) return null;
    const part = { ...obstacle, position };
    const { min, max } = bounds(part);
    const zone = project.workZone;
    if (min[1] < -1e-6 || (zone && (
      min[0] < -zone.width / 2 - 1e-6 || max[0] > zone.width / 2 + 1e-6 ||
      min[2] < -zone.depth / 2 - 1e-6 || max[2] > zone.depth / 2 + 1e-6 ||
      max[1] > zone.height + 1e-6
    ))) return null;
    const placement = placeWood(project, part, position, part.rotation, axis);
    if (placement.blocked || placement.adjusted) return null;
    const candidate = { ...project, pieces: project.pieces.map((piece) => piece.id === obstacle.id ? part : piece) };
    const { review, error } = runMotionTest(candidate, plan, setup);
    if (!review) throw Error(error);
    const passes = motionReviewPasses(review);
    const regressions = passes ? proposalMotionChanges(project, candidate) : [];
    return {
      source: project, project: candidate, part, review, distance, direction,
      clear: passes && !regressions.length,
      regressions,
    };
  };
}

export async function findClearMotionOffset(
  check: ReturnType<typeof prepareMotionOffsetTrial>, direction: number | "horizontal", distance: number, signal: AbortSignal,
) {
  if (!Number.isFinite(distance) || distance <= 0 || distance > maxMotionOffsetSearch)
    throw Error(`Enter a search distance up to ${maxMotionOffsetSearch} inches.`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const directions = direction === "horizontal"
    ? motionDirections.flatMap(({ axis }, index) => axis[1] === 0 ? [index] : [])
    : [direction];
  let nextYield = performance.now() + 16;
  const steps = Math.ceil(distance / motionOffsetIncrement);
  for (let i = 1; i <= steps; i++) {
    const offset = Math.min(i * motionOffsetIncrement, distance);
    for (const index of directions) {
      signal.throwIfAborted();
      const trial = check(index, offset);
      if (trial?.clear) return trial;
      if (performance.now() >= nextYield) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        nextYield = performance.now() + 16;
      }
    }
  }
  signal.throwIfAborted();
}
