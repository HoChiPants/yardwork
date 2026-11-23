import {
  cutSourceFrame,
  cutSourceRegion,
  tubeGroupKey,
  type CutSourceAxes,
} from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf, plannedCutKerf, setCutSourcesOnHand } from "./cutStock";
import { bom } from "./engine";
import {
  material,
  part,
  projectSchema,
  uid,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { ensurePartLabels } from "./partLabels";
import { rotate } from "./spatial";
import { orientedStockSize, stockAxes } from "./stockAxes";
import { stockCutSequences, type StockCutLayout, type StockCutSequence } from "./stockCutSequence";
import { formatStockLength } from "./measurement";
import { cutPlanFingerprint, type RecordedStockCutOrder } from "./plannedCutSources";
import { isDrywall } from "./drywallReference";
import { stockSplitState } from "./packing";
import { repeatedBoardCuts } from "./repeatedBoardCuts";

function indexReviewedLayouts(project: Project, rows: ReturnType<typeof bom>, loss: number | null) {
  const index = new Map<string, StockCutSequence>();
  for (const sequences of stockCutSequences(project, rows, loss).values())
    for (const sequence of sequences)
      if (!sequence.review && sequence.layout.kept.length)
        index.set(JSON.stringify(sequence.layout), sequence);
  return index;
}

function currentStockCutLayout(index: ReadonlyMap<string, StockCutSequence>, requested: StockCutLayout) {
  const current = index.get(JSON.stringify(requested));
  if (!current)
    throw Error(
      "This cut layout changed. Open the current stock cut order and review it again.",
    );
  return current;
}

export function saveTubeCutLoss(project: Project, requested: StockCutLayout) {
  const current = currentStockCutLayout(indexReviewedLayouts(project, bom(project), requested.tubeKerf ?? null), requested);
  if (current.layout.kind !== "tube")
    throw Error(
      "Choose a tube stock layout to save its measured cutting loss.",
    );
  const rodIds = current.layout.kept.map(({ id }) => id).sort();
  const kerf = current.layout.tubeKerf;
  const key = tubeGroupKey(rodIds);
  const { tubeCutPlans, ...rest } = project;
  const retained = (tubeCutPlans ?? []).filter((plan) =>
    kerf === undefined
      ? tubeGroupKey(plan.rodIds) !== key
      : !plan.rodIds.some((id) => rodIds.includes(id)),
  );
  const plans = kerf === undefined ? retained : [...retained, { rodIds, kerf }];
  return projectSchema.parse({
    ...rest,
    ...(plans.length ? { tubeCutPlans: plans } : {}),
    guideFingerprint: null,
  });
}

function prepareStockUnit(
  current: StockCutSequence,
  pieces: ReadonlyMap<string, Piece>,
  keptPieces: Map<string, Piece>,
  labels: ReadonlyMap<string, string>,
) {
  const {
    kind,
    materialId,
    thickness,
    width,
    length,
    kept,
    leftovers,
    tubeKerf,
    woodKerf,
  } = current.layout;
  const measuredLoss = {
    ...(tubeKerf === undefined ? {} : { tubeKerf }),
    ...(woodKerf === undefined ? {} : { woodKerf }),
  };
  const sourceSize: V3 = [thickness, width, length];
  const sourceId = uid();
  for (const region of kept) {
    const piece = pieces.get(region.id);
    if (
      !piece ||
      keptPieces.has(region.id) ||
      piece.offcut ||
      piece.cutStock ||
      piece.material !== materialId
    )
      throw Error(
        "A kept part already has a source or is unavailable for this stock layout.",
      );
    const axes = stockAxes(piece);
    const sourceAxes: CutSourceAxes = [axes.thickness, axes.width, axes.length];
    const frame = cutSourceFrame(sourceAxes);
    const keptSize = frame.toSourceSize(piece.size);
    keptPieces.set(piece.id, {
      ...piece,
      cutStock: {
        id: sourceId,
        size: frame.toPartSize(sourceSize),
        offset: frame.toPartOffset(
          [0, region.x, region.y],
          sourceSize,
          keptSize,
        ),
        sourceAxes,
        ...measuredLoss,
      },
    });
  }
  const anchor = keptPieces.get(kept[0].id)!;
  const anchorRegion = cutSourceRegion(anchor);
  const anchorCenter = anchorRegion.offset.map(
    (value, axis) => value + anchorRegion.size[axis] / 2,
  );
  const remnantPieces = leftovers.map((region, index) => {
    const size: V3 = [thickness, region.width, region.length];
    const offset: V3 = [0, region.x, region.y];
    const difference = offset.map(
      (value, axis) => value + size[axis] / 2 - anchorCenter[axis],
    ) as V3;
    const shift = rotate(
      anchorRegion.toPartDirection(difference),
      anchor.rotation,
    );
    const position = anchor.position.map(
      (value, axis) => value + shift[axis],
    ) as V3;
    const name =
      `Offcut · ${material(materialId).name} · ${kind} remnant ${index + 1}`.slice(
        0,
        120,
      );
    const remnant = part(
      name,
      materialId,
      anchorRegion.toPartSize(size),
      position.every((value) => Math.abs(value) <= 12000)
        ? position
        : anchor.position,
      anchor.stepId,
      "",
      anchor.rotation,
    );
    return {
      ...remnant,
      stockLengthAxis: anchor.stockLengthAxis ?? remnant.stockLengthAxis,
      offcut: true,
      cutStock: {
        id: sourceId,
        size: anchorRegion.toPartSize(sourceSize),
        offset: anchorRegion.toPartOffset(offset, sourceSize, size),
        sourceAxes: anchor.cutStock!.sourceAxes!,
        ...measuredLoss,
      },
    };
  });
  const label = labels.get(anchor.id)!;
  const notes = [
    `Recorded one ${material(materialId).name} ${kind} for ${kept.length} ${kept.length === 1 ? "part" : "parts"} starting with ${label}. Added ${leftovers.length} ${kind === "tube" ? "tube" : "rectangular"} ${leftovers.length === 1 ? "offcut" : "offcuts"} to the Cut pool.`,
    ...(tubeKerf === undefined
      ? []
      : [
          `Recorded tube cutting loss for ${label} · ${formatStockLength(tubeKerf)} per cut.`,
        ]),
    ...(woodKerf === undefined ? [] : [
      `Recorded wood blade kerf for ${label} · ${formatStockLength(woodKerf)} per cut.`,
    ]),
    ...current.steps.map(
      (instruction, i) =>
        `Stock cut order for ${label} · ${i + 1}. ${instruction}`,
    ),
  ];
  return {
    sourceId, remnantPieces, notes, stepId: anchor.stepId,
    materialId, anchorLabel: label, sourceSize, cuttingAllowance: pieceCutKerf(anchor),
  };
}

function saveReviewedStockCuts(
  project: Project,
  current: readonly StockCutSequence[],
  { onHand, planned }: { onHand: boolean; planned: boolean },
) {
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const keptPieces = new Map<string, Piece>();
  const labeled = ensurePartLabels(project);
  const labels = new Map(labeled.partLabels.map(({ partId, label }) => [partId, label]));
  const recorded = current.map((unit) => prepareStockUnit(unit, pieces, keptPieces, labels));
  const remnants = recorded.flatMap(({ remnantPieces }) => remnantPieces);
  const sourceIds = recorded.map(({ sourceId }) => sourceId);
  const tubePartIds = new Set(
    current.filter(({ layout }) => layout.kind === "tube").flatMap(({ partIds }) => partIds),
  );
  const { tubeCutPlans, ...rest } = labeled;
  const remainingTubePlans = tubeCutPlans?.filter(
    (plan) => !plan.rodIds.some((id) => tubePartIds.has(id)),
  );
  const activeProject =
    tubePartIds.size
      ? { ...rest, ...(remainingTubePlans?.length ? { tubeCutPlans: remainingTubePlans } : {}) }
      : labeled;
  const at = new Date().toISOString();
  const stockHistory = recorded.map(({ notes, stepId }) => notes.map((message) => ({
    id: uid(), at, stepId, message,
  })));
  const plannedCutSources = planned ? [
    ...(project.plannedCutSources ?? []),
    ...recorded.map(({ sourceId, remnantPieces }, index) => ({
      sourceId,
      fingerprint: cutPlanFingerprint([
        ...current[index].layout.kept.map(({ id }) => keptPieces.get(id)!),
        ...remnantPieces,
      ]),
      historyIds: stockHistory[index].map(({ id }) => id),
    })),
  ] : project.plannedCutSources;
  const recordedStockCutOrders: RecordedStockCutOrder[] = [...(project.recordedStockCutOrders ?? [])];
  if (!planned) recorded.forEach(({ sourceId, materialId, anchorLabel, sourceSize, cuttingAllowance }, i) => {
    const instructions = current[i].steps;
    if (!instructions.length) return;
    const entries = stockHistory[i].slice(-instructions.length);
    recordedStockCutOrders.push({
      sourceId, materialId, anchorLabel, sourceSize, cuttingAllowance, recordedAt: at,
      steps: instructions.map((instruction, index) => ({ instruction, id: entries[index].id })),
    });
  });
  const next = projectSchema.parse(
    ensurePartLabels({
      ...activeProject,
      pieces: [
        ...project.pieces.map((piece) => keptPieces.get(piece.id) ?? piece),
        ...remnants,
      ],
      ...(plannedCutSources ? { plannedCutSources } : {}),
      ...(recordedStockCutOrders.length ? { recordedStockCutOrders } : {}),
      history: [...project.history, ...stockHistory.flat()].slice(-5000),
    }),
  );
  const checked = inspectCutStock(next);
  for (const sourceId of sourceIds)
    if (!checked.valid.has(sourceId))
      throw Error(
        checked.invalid.find((row) => row.sourceId === sourceId)?.detail ??
          "The stock layout could not be recorded.",
      );
  return {
    project: onHand ? projectSchema.parse(setCutSourcesOnHand(next, sourceIds, true)) : next,
    sourceIds,
    offcuts: remnants.length,
  };
}

function saveStockCutLayouts(
  project: Project,
  requested: readonly StockCutLayout[],
  options: { onHand: boolean; planned: boolean },
) {
  if (!requested.length) throw Error("Choose stock units to record.");
  const before = bom(project);
  const reviewsByLoss = new Map<number | null, ReturnType<typeof indexReviewedLayouts>>();
  const current = requested.map((layout) => {
    const loss = layout.tubeKerf ?? null;
    if (!reviewsByLoss.has(loss)) reviewsByLoss.set(loss, indexReviewedLayouts(project, before, loss));
    return currentStockCutLayout(reviewsByLoss.get(loss)!, layout);
  });
  const saved = saveReviewedStockCuts(project, current, options);
  const after = bom(saved.project);
  for (const materialId of new Set(current.map(({ layout }) => layout.materialId))) {
    const oldCount = before.find((row) => row.id === materialId)?.physicalStockUnits;
    const newCount = after.find((row) => row.id === materialId)?.physicalStockUnits;
    if (oldCount !== newCount)
      throw Error("Recording this layout changed how many stock units the project needs. Review the cut order.");
  }
  return saved;
}

/** Reserve the stated parts on each board in order, without repacking older parts. */
export function planBoardCutGroups(project: Project, boards: readonly (readonly string[])[]): Project {
  const labeled = ensurePartLabels(project);
  const byId = new Map(labeled.pieces.map((piece) => [piece.id, piece]));
  const ids = boards.flat();
  if (!boards.length || new Set(ids).size !== ids.length)
    throw Error("Choose unassigned boards for these cuts.");
  const groups = boards.map((ids) => {
    const pieces = ids.map((id) => byId.get(id));
    if (!pieces.length || !pieces.every((piece): piece is Piece => !!piece && !piece.offcut && !piece.cutStock))
      throw Error("Choose unassigned boards for these cuts.");
    const stock = material(pieces[0].material);
    if (!stock.wood || !stock.cuttable || stock.stockKind !== "linear" ||
        pieces.some(({ material }) => material !== stock.id))
      throw Error("Choose one wood stock size for each board.");
    return { stock, pieces };
  });
  const batch = { ...labeled, pieces: groups.flatMap(({ pieces }) => pieces) };
  const rows = new Map(bom(batch).map((row) => [row.id, row]));
  const sequences = groups.map(({ stock, pieces }) => {
    const cuts = pieces.map((piece) => ({
      id: piece.id, name: piece.name, length: orientedStockSize(piece)[2],
    }));
    const row = rows.get(stock.id)!;
    const [sequence] = stockCutSequences(
      { ...batch, pieces },
      [{ ...row, bins: [{ cuts, remaining: 0 }] }],
    ).get(stock.id) ?? [];
    if (!sequence || sequence.review || sequence.layout.kept.length !== pieces.length)
      throw Error(sequence?.review ?? "Review the stock cut order for these parts.");
    return sequence;
  });
  return saveReviewedStockCuts(labeled, sequences, { onHand: false, planned: true }).project;
}

/** Reserve new stock for equal crosscuts. */
export function planDedicatedBoardCuts(project: Project, pieceIds: readonly string[]): Project {
  const byId = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const pieces = pieceIds.map((id) => byId.get(id));
  if (!pieces.length || new Set(pieceIds).size !== pieceIds.length ||
      !pieces.every((piece): piece is Piece => !!piece && !piece.offcut && !piece.cutStock))
    throw Error("Choose unassigned boards for these cuts.");
  const [first] = pieces;
  const stock = material(first.material);
  if (!stock.wood || !stock.cuttable || stock.stockKind !== "linear")
    throw Error("Choose wood board stock for the cuts.");
  const length = orientedStockSize(first)[2];
  if (pieces.some((piece) => piece.material !== first.material || orientedStockSize(piece)[2] !== length))
    throw Error("Choose boards of the same stock and finished length.");
  const stockLength = Math.max(...(stock.stockSize ?? stock.size));
  const kerf = plannedCutKerf(project, stock.id);
  const plan = repeatedBoardCuts(stockLength, length, pieces.length, kerf);
  if (!plan) throw Error("The finished parts do not fit this board stock.");
  if (stockSplitState(stockLength, length, kerf) === "whole") return ensurePartLabels(project);
  let start = 0;
  return planBoardCutGroups(project, plan.boards.map(({ count }) => {
    const group = pieceIds.slice(start, start + count);
    start += count;
    return group;
  }));
}

/** Commit an exact set of reviewed cuts as one change, with no intermediate repacking. */
export function recordStockCutLayouts(project: Project, requested: readonly StockCutLayout[], onHand = false) {
  return saveStockCutLayouts(project, requested, { onHand, planned: false });
}

export function planStockCutLayouts(project: Project, requested: readonly StockCutLayout[]) {
  if (requested.some(({ materialId }) => !material(materialId).wood && !isDrywall(materialId)))
    throw Error("Choose wood or drywall for a planned stock cut order.");
  return saveStockCutLayouts(project, requested, { onHand: false, planned: true });
}

/** Record a single reviewed purchase blank, keeping the existing part poses. */
export function recordStockCutLayout(project: Project, requested: StockCutLayout, onHand = false) {
  const { project: next, sourceIds, offcuts } = recordStockCutLayouts(project, [requested], onHand);
  return { project: next, sourceId: sourceIds[0], offcuts };
}
