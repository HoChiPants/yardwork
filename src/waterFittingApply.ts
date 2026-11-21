import { bom } from "./engine";
import { part, projectSchema, step, uid, type Project } from "./model";
import { fittingLabel, removeWaterFitting, reviewWaterFitting, waterFittingLayout } from "./waterFittings";
import { waterFittingInput, type WaterFitting } from "./waterFittingSchema";
import { previewWaterRun } from "./wallWaterApply";
import { waterRunDraft } from "./wallWaterSchema";

export function previewWaterFitting(project: Project, input: unknown, existingId?: string) {
  const draft = waterFittingInput.parse(input);
  const existing = project.waterFittings?.find(({ id }) => id === existingId);
  if (existingId && !existing) throw Error("This fitting is no longer in the project.");
  if (!existing && (project.waterFittings?.length ?? 0) >= 64) throw Error("This project already has 64 pipe connections.");
  const layout = waterFittingLayout(project, draft, existingId);
  let candidate = existing ? removeWaterFitting(project, existing) : project;
  const pipeCuts: { label: string; before: number; after: number; reused?: string }[] = [];
  // Trim first so the old shape of one pipe cannot block its partner's adjustment.
  for (const entry of [...layout.positions].sort((a, b) =>
    (a.length - (a.run.end - a.run.start)) - (b.length - (b.run.end - b.run.start)))) {
    const { run, port, distance, length } = entry;
    const before = run.end - run.start;
    let reused: string | undefined;
    if (Math.abs(run[port.end] - distance) > 1e-6) {
      const change = previewWaterRun(candidate, { ...waterRunDraft(run), [port.end]: distance }, run.id);
      candidate = change.project;
      reused = change.stock;
    }
    pipeCuts.push({ label: run.name, before, after: length, reused });
  }
  const name = fittingLabel(layout.product);
  const previousPiece = project.pieces.find(({ id }) => id === existing?.pieceId);
  const title = `Connect ${layout.ports[0].run.name} and ${layout.ports[1].run.name}`.slice(0, 100);
  const stage = candidate.steps.find(({ id }) => id === previousPiece?.stepId) ?? step(title);
  const { pose } = layout;
  const piece = {
    ...part(name, layout.materialId, pose.size, pose.position, stage.id, "PEX connections", pose.rotation),
    ...(existing && { id: existing.pieceId }),
  };
  const fitting: WaterFitting = {
    ...draft, id: existing?.id ?? uid(), pieceId: piece.id, materialId: layout.materialId,
  };
  const next = projectSchema.parse({
    ...candidate,
    waterFittings: existing ? project.waterFittings?.map((row) => row.id === existing.id ? fitting : row)
      : [...(candidate.waterFittings ?? []), fitting],
    pieces: [...candidate.pieces, piece],
    steps: candidate.steps.some(({ id }) => id === stage.id) ? candidate.steps : [...candidate.steps, stage],
    guideFingerprint: null,
  });
  const check = reviewWaterFitting(next, fitting);
  if (!check.layout) throw Error(check.problem);
  const stock = bom(next).find(({ id }) => id === layout.ports[0].run.materialId);
  return { project: next, fitting, layout: check.layout, pipeCuts, stock,
    affectedConnections: project.joints.length - next.joints.length };
}
