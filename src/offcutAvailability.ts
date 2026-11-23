import type { Piece, Project } from "./model";

/** Owning the parent blank does not produce remnants from a pending cut. */
export function offcutAvailability(project: Project) {
  const onHandSources = new Set(project.onHandCutSources);
  const plannedSources = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  const pendingParts = new Set<string>();
  for (const { offcutCut: cut } of project.history) {
    if (!cut || cut.releasedAt) continue;
    if (!(cut.cuts.length && !cut.completedAt) && !pendingParts.has(cut.inputId)) continue;
    pendingParts.add(cut.targetId);
    for (const { id } of cut.remnants) pendingParts.add(id);
  }
  return (piece: Pick<Piece, "id" | "cutStock">) => {
    const sourceId = piece.cutStock?.id;
    if (!sourceId) return "unconfirmed";
    if (plannedSources.has(sourceId) || pendingParts.has(piece.id)) return "expected";
    return onHandSources.has(sourceId) ? "on-hand" : "unconfirmed";
  };
}
