import { projectSchema, type Project } from "./model";
import { baseAssemblyStages } from "./assemblyStages";
import {
  guidePlacementSchema,
  type GuidePlacement,
} from "./guidePlacementSchema";
import { resolveGuidePlacements } from "./guidePlacementResolution";

export function guidePlacementTargets(project: Project): {
  ownerId: string;
  stageKey: string;
  title: string;
  memberIds: string[];
}[] {
  return baseAssemblyStages(project).map((stage) => ({
    ownerId: stage.ownerId,
    stageKey: stage.key,
    title:
      project.steps.find(
        (step) =>
          step.generated?.kind === "assembly-stage" &&
          step.generated.planId === stage.ownerId &&
          step.generated.stageKey === stage.key,
      )?.title ?? stage.title,
    memberIds: [...stage.memberIds],
  }));
}
export function guidePlacementIssues(project: Project) {
  return resolveGuidePlacements(project, baseAssemblyStages(project)).issues;
}

/** An explicit workflow choice never changes physical roles, ownership or hardware. */
export function assignGuidePlacement(
  project: Project,
  pieceId: string,
  target: GuidePlacement | null,
): Project {
  const piece = project.pieces.find((entry) => entry.id === pieceId);
  if (!piece || piece.offcut)
    throw Error("Choose an active actual part for guide placement.");
  const placement = target === null ? null : guidePlacementSchema.parse(target);
  if (
    placement &&
    guidePlacementTargets(project).filter(
      (entry) =>
        entry.ownerId === placement.ownerId &&
        entry.stageKey === placement.stageKey,
    ).length !== 1
  )
    throw Error(
      "This assembly-stage target is unavailable. Choose a current guide task.",
    );
  if (
    (placement?.ownerId === piece.guidePlacement?.ownerId &&
      placement?.stageKey === piece.guidePlacement?.stageKey) ||
    (!placement && !piece.guidePlacement)
  )
    return project;
  return projectSchema.parse({
    ...project,
    guideFingerprint: null,
    pieces: project.pieces.map((entry) => {
      if (entry.id !== pieceId) return entry;
      const { guidePlacement: _old, ...rest } = entry;
      return placement ? { ...rest, guidePlacement: { ...placement } } : rest;
    }),
  });
}

/** Intentional project cloning/import rekeys only its known outer owner identity. */
export function rekeyGuidePlacements(
  project: Project,
  newProjectId: string,
): Project {
  guidePlacementSchema.shape.ownerId.parse(newProjectId);
  if (project.id === newProjectId) return project;
  return projectSchema.parse({
    ...project,
    id: newProjectId,
    pieces: project.pieces.map((piece) =>
      piece.guidePlacement?.ownerId === project.id
        ? {
            ...piece,
            guidePlacement: { ...piece.guidePlacement, ownerId: newProjectId },
          }
        : piece,
    ),
  });
}
