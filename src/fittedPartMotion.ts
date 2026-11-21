import { projectLidTravelChecks } from "./lidTravelFindings";
import { projectMotionReviews } from "./mechanismMotion";
import type { Project } from "./model";

export function fittedPartMotionConflicts(project: Project, blockId: string) {
  return [
    ...projectMotionReviews(project).flatMap(
      ({ plan, baseline, saved, scenarios }) =>
        [
          { name: plan.label, result: baseline },
          ...(saved
            ? [{ name: `${plan.label} · Saved test`, result: saved }]
            : []),
          ...scenarios.map(({ name, result }) => ({
            name: `${plan.label} · ${name}`,
            result,
          })),
        ].flatMap(({ name, result }) =>
          result.review?.hits.some(({ obstacleId }) => obstacleId === blockId)
            ? [name]
            : [],
        ),
    ),
    ...projectLidTravelChecks(project).flatMap(({ section, review }) =>
      review?.collisions.some(({ pieceId }) => pieceId === blockId)
        ? [`${section.name} lid`]
        : [],
    ),
  ];
}
