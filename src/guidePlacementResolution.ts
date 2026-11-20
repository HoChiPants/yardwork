import type { Project } from "./model";
import type { AssemblyStage } from "./assemblyStages";
import type { GuidePlacement } from "./guidePlacementSchema";

export type GuidePlacementIssue = {
  pieceId: string;
  placement: GuidePlacement;
  code: "target-unavailable";
  message: string;
};
export const unresolvedGuidePlacementKey = "review-unresolved-guide-placement";
const identity = (ownerId: string, key: string) =>
  JSON.stringify([ownerId, key]);

/** Resolve explicit task choices only; no geometry, names or generated roles are inferred. */
export function resolveGuidePlacements(
  project: Project,
  baseStages: readonly AssemblyStage[],
): { stages: AssemblyStage[]; issues: GuidePlacementIssue[] } {
  const active = project.pieces.filter((piece) => !piece.offcut),
    placed = active.filter((piece) => piece.guidePlacement);
  if (!placed.length) return { stages: [...baseStages], issues: [] };
  const targets = new Map<string, AssemblyStage[]>();
  for (const stage of baseStages) {
    const key = identity(stage.ownerId, stage.key);
    targets.set(key, [...(targets.get(key) ?? []), stage]);
  }
  const additions = new Map<string, string[]>(),
    placedIds = new Set(placed.map((piece) => piece.id)),
    issues: GuidePlacementIssue[] = [],
    labels = new Map(project.partLabels.map((row) => [row.partId, row.label]));
  for (const piece of placed) {
    const placement = piece.guidePlacement!,
      key = identity(placement.ownerId, placement.stageKey);
    if (targets.get(key)?.length !== 1) {
      issues.push({
        pieceId: piece.id,
        placement: { ...placement },
        code: "target-unavailable",
        message: `${labels.get(piece.id) ?? piece.name}: its explicitly selected guide stage is unavailable. Choose a current assembly stage or clear the placement; the saved target is retained.`,
      });
      continue;
    }
    additions.set(key, [...(additions.get(key) ?? []), piece.id]);
  }
  const describe = (ids: string[]) =>
    ids
      .slice(0, 8)
      .map(
        (id) => labels.get(id) ?? active.find((piece) => piece.id === id)!.name,
      )
      .join(", ") +
    (ids.length > 8 ? ` and ${ids.length - 8} other listed members` : "");
  const stages = baseStages.flatMap((stage) => {
    const added = [
        ...(additions.get(identity(stage.ownerId, stage.key)) ?? []),
      ].sort(),
      memberIds = [
        ...new Set([
          ...stage.memberIds.filter((id) => !placedIds.has(id)),
          ...added,
        ]),
      ].sort();
    if (!memberIds.length) return [];
    return [
      {
        ...stage,
        memberIds,
        notes:
          stage.notes +
          (added.length
            ? `\nExplicit guide placement: ${describe(added)}. Review these actual members during this task; their physical roles, ownership and connection details are unchanged.`
            : ""),
      },
    ];
  });
  if (issues.length)
    stages.push({
      ownerId: project.id,
      key: unresolvedGuidePlacementKey,
      title: "Review parts with unavailable guide placement",
      memberIds: issues.map((issue) => issue.pieceId).sort(),
      notes:
        "These actual members retain an explicit guide-stage choice whose exact owner and stage key are unavailable. Review their intended construction task and choose a current stage or clear their placement. No role, target identity, fastening or construction order has been inferred.",
      order: stages.length,
    });
  // A family's unresolved-system review must survive moving its last native stage.
  for (const stage of baseStages) {
    if (
      !stage.ownerReview ||
      stages.some((entry) => entry.notes.includes(stage.ownerReview!))
    )
      continue;
    const ownerIds = new Set(
        baseStages
          .filter((entry) => entry.ownerId === stage.ownerId)
          .flatMap((entry) => entry.memberIds),
      ),
      destination =
        [...stages]
          .reverse()
          .find((entry) => entry.ownerId === stage.ownerId) ??
        stages.find((entry) => entry.memberIds.some((id) => ownerIds.has(id)));
    if (destination) destination.notes += `\n${stage.ownerReview}`;
  }
  const counts = new Map<string, number>();
  for (const stage of stages)
    for (const id of stage.memberIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (
    counts.size !== active.length ||
    active.some((piece) => counts.get(piece.id) !== 1)
  )
    throw Error("Guide placement must assign every active part exactly once.");
  return {
    stages: stages.map((stage, order) => ({ ...stage, order })),
    issues,
  };
}
