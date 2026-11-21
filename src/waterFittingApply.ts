import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { bom, cutPiece } from "./engine";
import { part, projectSchema, step, uid, type Project } from "./model";
import { fittingLabel, removeWaterFitting, reviewWaterFitting, splitWaterMainChoice, waterFittingLayout, waterSocketSeat } from "./waterFittings";
import { splitWaterMainInput, waterFittingInput, waterFittingPorts, type WaterFitting, type WaterRunEnd } from "./waterFittingSchema";
import { previewWaterRun } from "./wallWaterApply";
import { waterRunDraft } from "./wallWaterSchema";

export function previewWaterFitting(project: Project, input: unknown, existingId?: string) {
  const draft = waterFittingInput.parse(input);
  const existing = project.waterFittings?.find(({ id }) => id === existingId);
  if (existingId && !existing) throw Error("This fitting is no longer in the project.");
  if (!existing && (project.waterFittings?.length ?? 0) >= 64) throw Error("This project already has 64 pipe connections.");
  const layout = waterFittingLayout(project, draft, existingId);
  let candidate = existing ? removeWaterFitting(project, existing) : project;
  const reusedStock = new Map<string, string>();
  // Trim first so the old shape of one pipe cannot block its partner's adjustment.
  for (const entry of [...layout.positions].sort((a, b) =>
    (a.length - (a.run.end - a.run.start)) - (b.length - (b.run.end - b.run.start)))) {
    const { run, port, distance } = entry;
    if (Math.abs(run[port.end] - distance) > 1e-6) {
      const change = previewWaterRun(candidate, { ...waterRunDraft(run), [port.end]: distance }, run.id);
      candidate = change.project;
      if (change.stock) reusedStock.set(run.id, change.stock);
    }
  }
  const pipeCuts = layout.positions.map(({ run, length }) => ({
    label: run.name, before: run.end - run.start, after: length, reused: reusedStock.get(run.id),
  }));
  const name = fittingLabel(layout.materialId);
  const previousPiece = project.pieces.find(({ id }) => id === existing?.pieceId);
  const title = `Connect ${layout.ports.map(({ run }) => run.name).join(" and ")}`.slice(0, 100);
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
  const pipeMaterials = new Set<string>(layout.ports.map(({ run }) => run.materialId));
  const stocks = bom(next).filter(({ id }) => pipeMaterials.has(id));
  const stock = stocks.find(({ id }) => id === layout.ports[0].run.materialId);
  return { project: next, fitting, layout: check.layout, pipeCuts, stock, stocks,
    affectedConnections: project.joints.length - next.joints.length };
}

/** Split a continuous main at the measured intersection and fit the branch in one edit. */
export function previewSplitWaterMain(project: Project, input: unknown) {
  const draft = splitWaterMainInput.parse(input);
  const { main, centerDistance, product } = splitWaterMainChoice(project, draft.mainId, draft.branch);
  const half = draft.inlineLength / 2;
  const seat = waterSocketSeat(half, product.insertion, "the inline sockets");
  waterSocketSeat(draft.branchReach, product.branch!.insertion, "the branch");
  const endA = centerDistance - seat, startB = centerDistance + seat;
  if (endA <= main.start + 1e-6 || startB >= main.end - 1e-6)
    throw Error("Both inline socket faces need pipe continuing past the tee.");
  const original = project.pieces.find(({ id }) => id === main.pipeId)!;
  const sourceId = original.cutStock?.id;
  let candidate = project;
  let rightOffcut: string | undefined;
  let trim = 2 * seat;
  if (sourceId) {
    if (!inspectCutStock(project).valid.has(sourceId))
      throw Error("Review this main's recorded stock source before splitting it.");
    const loss = pieceCutKerf(original);
    trim -= 2 * loss;
    if (trim <= 1e-6) throw Error("The recorded cutting loss leaves no space for both trim cuts.");
    candidate = cutPiece(candidate, original.id, endA - main.start, 1);
    const tail = candidate.pieces.at(-1)!;
    candidate = cutPiece(candidate, tail.id, trim, 1);
    rightOffcut = candidate.pieces.at(-1)!.id;
    candidate = { ...candidate, pieces: candidate.pieces.map((piece) => piece.id === tail.id ? { ...piece, name: "Offcut · Tee center trim" } : piece) };
  }

  const reachesEnd = ({ runId, end }: WaterRunEnd) => runId === main.id && end === "end";
  const neighbors = (project.waterFittings ?? []).filter((fitting) => waterFittingPorts(fitting).some(reachesEnd));
  const neighboringPieces = project.pieces.filter(({ id }) => neighbors.some(({ pieceId }) => pieceId === id));
  if (neighbors.length) candidate = { ...candidate,
    pieces: candidate.pieces.filter(({ id }) => !neighbors.some(({ pieceId }) => pieceId === id)) };

  const left = previewWaterRun(candidate, { ...waterRunDraft(main), end: endA }, main.id);
  const right = previewWaterRun(left.project, {
    ...waterRunDraft(main), name: `${main.name.slice(0, 54)} · B`, start: startB,
    reuse: rightOffcut ? true : main.reuse,
  }, undefined, rightOffcut);
  const reattach = (port: WaterRunEnd) => reachesEnd(port) ? { ...port, runId: right.run.id } : port;
  candidate = neighbors.length ? {
    ...right.project, pieces: [...right.project.pieces, ...neighboringPieces],
    waterFittings: right.project.waterFittings?.map((fitting) => ({
      ...fitting, a: reattach(fitting.a), b: reattach(fitting.b),
      ...(fitting.branch && { branch: { ...fitting.branch, port: reattach(fitting.branch.port) } }),
    })),
  } : right.project;
  const result = previewWaterFitting(candidate, {
    a: { runId: left.run.id, end: "end" }, b: { runId: right.run.id, end: "start" },
    reach: [half, half], branch: { port: draft.branch, reach: draft.branchReach },
  });
  const split = { name: main.name, before: main.end - main.start, left: endA - main.start, right: main.end - startB,
    removed: 2 * seat, trim, recorded: !!sourceId };
  return { ...result, split, affectedConnections: project.joints.length - result.project.joints.length };
}
