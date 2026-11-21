import { bom, cutPiece } from "./engine";
import { inspectCutStock } from "./cutStock";
import { part, pieceSchema, projectSchema, step, uid, type Piece, type Project } from "./model";
import { measureWaterRun, removeWaterRun } from "./wallWater";
import { waterRunInput, type WaterRun } from "./wallWaterSchema";
import { pexStockLength } from "./wallWaterReference";

export function previewWaterRun(project: Project, input: unknown, runId?: string) {
  const draft = waterRunInput.parse(input);
  const previous = project.waterRuns?.find(({ id }) => id === runId);
  if (runId && !previous) throw Error("The saved run is no longer in the project.");
  if (!previous && (project.waterRuns?.length ?? 0) >= 32) throw Error("This project already has 32 saved water lines.");
  const layout = measureWaterRun(project, draft, previous);
  const id = previous?.id ?? uid();
  const priorPipe = project.pieces.find(({ id, offcut }) => id === previous?.pipeId && !offcut);
  const samePipe = priorPipe?.material === draft.materialId && Math.abs(priorPipe.size[1] - layout.length) < 1e-6;
  let candidate = previous ? removeWaterRun(project, previous, samePipe, true) : project;
  const title = `Rough in ${draft.name}`;
  const currentStepId = priorPipe?.stepId ?? previous?.stepId;
  const newStep = candidate.steps.find(({ id }) => id === currentStepId) ?? step(title);
  if (!candidate.steps.some(({ id }) => id === newStep.id)) candidate = { ...candidate, steps: [...candidate.steps, newStep] };
  const protectedIds = new Set(candidate.pieces.flatMap((p) => p.cutStock?.id && p.guidePlacement ? [p.cutStock.id] : []));
  const sources = draft.reuse ? inspectCutStock(candidate).valid : new Map();
  const spare = draft.reuse && !samePipe ? candidate.pieces.filter((piece) =>
    piece.offcut && piece.material === draft.materialId && piece.cutStock && sources.has(piece.cutStock.id) &&
    !protectedIds.has(piece.cutStock.id) && !piece.cutPlanes.length &&
    piece.size[1] >= layout.length - 1e-6,
  ).sort((a, b) => a.size[1] - b.size[1])[0] : undefined;
  if (spare && spare.size[1] > layout.length + 1e-6) candidate = cutPiece(candidate, spare.id, layout.length, 1);
  const stock = samePipe ? priorPipe : spare && candidate.pieces.find(({ id }) => id === spare.id);
  const pipe = pieceSchema.parse({
    ...(stock ?? part(draft.name, draft.materialId, layout.pipe.size, layout.pipe.position, newStep.id, title, layout.pipe.rotation)),
    ...layout.pipe, name: draft.name, stepId: newStep.id, assembly: title, offcut: false, designRole: "water-pipe",
  });
  const beforeIds = new Set(candidate.pieces.map(({ id }) => id));
  const boreMap = new Map(layout.studs.map(({ piece, opening }) => [piece.id, opening]));
  const shields = layout.shields.map(({ placement, studId, face }) => {
    const existingId = previous?.shields.find((entry) => entry.studId === studId && entry.face === face)?.id;
    const shield: Piece = {
      ...part(`${draft.name} · ${face} nail shield`, placement.material, placement.size, placement.position, newStep.id, title, placement.rotation),
      ...(existingId && { id: existingId }),
      designRole: "water-nail-shield",
    };
    return { shield, studId, face };
  });
  const run: WaterRun = {
    ...draft, id, stepId: newStep.id, pipeId: pipe.id,
    studs: [...boreMap.keys()],
    shields: shields.map(({ shield, studId, face }) => ({ id: shield.id, studId, face })),
  };
  const def = candidate.pieces.map((piece) => {
    if (piece.id === pipe.id) return pipe;
    const opening = boreMap.get(piece.id);
    return opening ? pieceSchema.parse({ ...piece, roundOpenings: [...(piece.roundOpenings ?? []), { ...opening, source: { waterRunId: id } }] }) : piece;
  });
  const next = projectSchema.parse({
    ...candidate,
    waterRuns: previous ? project.waterRuns?.map((row) => row.id === run.id ? run : row) : [...(candidate.waterRuns ?? []), run],
    pieces: [...def, ...(!beforeIds.has(pipe.id) ? [pipe] : []), ...shields.map(({ shield }) => shield)],
    guideFingerprint: null,
  });
  const remainder = spare ? Math.max(0, spare.size[1] - layout.length) :
    pipe.cutStock ? 0 :
    bom(next).find(({ id }) => id === pipe.material)?.bins.find(({ cuts }) => cuts.some(({ id }) => id === pipe.id))?.remaining ??
    Math.max(0, pexStockLength - layout.length);
  return {
    project: next, run, layout, stock: spare?.name,
    remaining: remainder,
    retainedCut: !spare && !!pipe.cutStock,
    affectedConnections: project.joints.length - next.joints.length,
  };
}
