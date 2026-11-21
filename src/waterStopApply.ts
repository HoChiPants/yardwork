import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { part, projectSchema, step, uid, type Project } from "./model";
import { motionObstacleWarnings } from "./mechanismMotion";
import { previewWaterRun } from "./wallWaterApply";
import { waterRunDraft } from "./wallWaterSchema";
import { waterStop } from "./waterStopReference";
import { waterStopPreviewInput, type WaterStop } from "./waterStopSchema";
import { removeWaterStop, reviewWaterStop, stopEndSign, waterStopLayout, waterStopOccupant } from "./waterStops";
import { readWaterRunPort } from "./waterFittings";

export function previewWaterStop(project: Project, input: unknown, existingId?: string) {
  const { exposed, trim, ...draft } = waterStopPreviewInput.parse(input);
  const existing = project.waterStops?.find(({ id }) => id === existingId);
  if (existingId && !existing) throw Error("This shutoff is no longer in the project.");
  const { port } = draft;
  if (existing && (port.runId !== existing.port.runId || port.end !== existing.port.end))
    throw Error("Add a new shutoff to use a different pipe end.");
  const taken = waterStopOccupant(project, port, existingId);
  if (taken) throw Error(`That pipe end already belongs to ${taken}.`);
  const { run } = readWaterRunPort(project, port);
  if (run.materialId !== waterStop.pipe) throw Error("This valve needs a ½ in SharkBite PEX stub-out.");
  const sign = stopEndSign(port);
  const record = { ...draft, face: run[port.end] - sign * exposed };
  const after = run.end - run.start - trim;
  if (exposed - trim < waterStop.insertion - 1e-6)
    throw Error("The trim would leave less than 1 in of exposed pipe.");
  let candidate = existing ? removeWaterStop(project, existing) : project;
  let scrap: { id: string; length: number } | undefined;
  if (trim > 1e-6) {
    const stock = candidate.pieces.find(({ id }) => id === run.pipeId)!;
    if (stock.cutStock && !inspectCutStock(candidate).valid.has(stock.cutStock.id))
      throw Error("Review the recorded source before trimming this pipe.");
    const kerf = pieceCutKerf(stock);
    if (trim <= kerf + 1e-6) throw Error("The trim must exceed the recorded cutting loss.");
    candidate = cutPiece(candidate, stock.id, port.end === "start" ? trim - kerf : after, 1);
    const far = candidate.pieces.at(-1)!;
    const kept = candidate.pieces.find(({ id }) => id === stock.id)!;
    const waste = port.end === "start" ? kept : far;
    scrap = { id: far.id, length: waste.size[1] };
    const offcut = { ...waste, id: far.id, name: "Offcut · Fixture stub-out trim", offcut: true, assembly: "" };
    delete offcut.designRole;
    delete offcut.guidePlacement;
    candidate = { ...candidate, pieces: candidate.pieces.map((piece) =>
      piece.id === far.id ? offcut : piece.id === stock.id && port.end === "start"
        ? { ...far, id: stock.id, name: stock.name, offcut: false, guidePlacement: stock.guidePlacement }
        : piece) };
    candidate = previewWaterRun(candidate, { ...waterRunDraft(run), [port.end]: run[port.end] - sign * trim }, run.id).project;
  }
  const layout = waterStopLayout(candidate, record);
  const old = project.pieces.find(({ id }) => id === existing?.pieceId);
  const phase = candidate.steps.find(({ id }) => id === old?.stepId) ?? step(`Fit ${draft.name}`);
  const { size, position, rotation } = layout.pose;
  const piece = {
    ...part(draft.name, waterStop.id, size, position, phase.id, "Fixture shutoffs", rotation),
    ...(existing && { id: existing.pieceId }), designRole: "water-fixture-stop",
  };
  const stop: WaterStop = { ...record, id: existing?.id ?? uid(), pieceId: piece.id };
  const next = projectSchema.parse({
    ...candidate, waterStops: existing ? project.waterStops?.map((item) => item.id === existing.id ? stop : item)
      : [...(candidate.waterStops ?? []), stop],
    pieces: [...candidate.pieces, piece],
    steps: candidate.steps.some(({ id }) => id === phase.id) ? candidate.steps : [...candidate.steps, phase],
    guideFingerprint: null,
  });
  const check = reviewWaterStop(next, stop);
  if (!check.layout) throw Error(check.problem);
  const movement = motionObstacleWarnings(next, new Set([stop.pieceId]), "the valve");
  return { project: next, stop, layout: check.layout, before: run.end - run.start, after, scrap, movement };
}
