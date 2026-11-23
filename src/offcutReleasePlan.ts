import { cutSourceFrame, cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock } from "./cutStock";
import { bom } from "./engine";
import { material, part, projectSchema, type MaterialId, type Project, type V3 } from "./model";
import { formatCutDimensions, offcutCutRows, sameCutDimensions } from "./offcutCutGuide";
import { onHandOffcuts } from "./offcutAssignment";
import { planOffcutReuse, type OffcutReusePlan } from "./offcutReusePlan";
import { ensurePartLabels, partLabel } from "./partLabels";
import { releasePlannedCutSources } from "./plannedCutSources";
import { stockAxes } from "./stockAxes";

type OffcutDisposition = "return" | "unavailable";

function releaseOffcutAssignments(project: Project, historyId: string, disposition: OffcutDisposition = "return") {
  const entries = project.history.flatMap(({ id, offcutCut }) =>
    offcutCut && !offcutCut.releasedAt ? [{ id, record: offcutCut }] : [],
  );
  const index = entries.findIndex(({ id }) => id === historyId);
  if (index < 0) throw Error("This offcut assignment is no longer active.");
  const root = entries[index].record;
  if (root.retainedTrim)
    throw Error("This is the trim that produced the offcut. Review its downstream assignments to return uncut remnants.");
  if (disposition === "unavailable") {
    if (root.looseSplit || root.usableMeasurement || root.inputId === root.targetId)
      throw Error("Choose an offcut assigned to a project part.");
    const row = offcutCutRows(project).find(({ id }) => id === historyId);
    if (row?.sourceCutsPending || row?.prerequisite !== undefined)
      throw Error("The starting offcut still depends on a planned cut. Review that cut order first.");
  }
  const released = new Set<string>();
  const targetIds = new Set<string>();
  const previousMaterials = new Map<string, MaterialId>();
  const remnants = new Map<string, V3>();
  for (const { id, record } of entries.slice(index)) {
    if (id !== historyId && !remnants.has(record.inputId)) continue;
    if (record.completedAt)
      throw Error("A cut in this chain was marked complete. The original uncut offcut cannot be restored.");
    if (record.usableMeasurement)
      throw Error("This stock has a measured usable blank. Releasing the earlier assignment would restore unusable material.");
    if (record.sourceId !== root.sourceId || targetIds.has(record.targetId))
      throw Error(
        "The saved assignments disagree on their cut source or parts.",
      );
    released.add(id);
    targetIds.add(record.targetId);
    if (record.previousMaterial) previousMaterials.set(record.targetId, record.previousMaterial);
    for (const remnant of record.remnants)
      remnants.set(remnant.id, remnant.size);
  }
  if (
    entries.some(
      ({ id, record }) => targetIds.has(record.targetId) && !released.has(id),
    )
  )
    throw Error(
      "A part has another active offcut assignment. Review its current stock before releasing this one.",
    );

  const sourcePieces = project.pieces.filter(
    ({ cutStock }) => cutStock?.id === root.sourceId,
  );
  const anchor = sourcePieces[0];
  const stock = anchor?.cutStock;
  if (
    !stock ||
    !sameCutDimensions(
      cutSourceRegion(anchor).sourceSize,
      root.result.sourceSize,
    )
  )
    throw Error("The starting stock dimensions can no longer be verified.");
  if (project.pieces.some(({ id }) => id === root.inputId))
    throw Error("The starting offcut is already present in the project.");
  const axes = stockAxes(anchor, stock.size);
  const frame = cutSourceFrame(
    stock.sourceAxes ?? [axes.thickness, axes.width, axes.length],
  );
  const size = frame.toPartSize(root.inputSize);
  const offset = stock.sourceAxes
    ? frame.toPartOffset(
        root.result.offset,
        root.result.sourceSize,
        root.inputSize,
      )
    : root.result.offset;
  const stockMaterial = material(anchor.material);
  const restored = {
    ...part(
      root.inputName ?? `Offcut · ${stockMaterial.name}`.slice(0, 120),
      anchor.material,
      size,
      [0, size[1] / 2, 0],
      anchor.stepId,
      "",
    ),
    id: root.inputId,
    stockLengthAxis: anchor.stockLengthAxis,
    offcut: true,
    cutStock: { ...stock, offset },
  };

  const pieces = project.pieces.flatMap((piece) => {
    const remnant = remnants.get(piece.id);
    if (remnant) {
      const { thickness, width, length } = stockAxes(
        piece,
        piece.cutStock?.size,
      );
      if (
        !piece.offcut ||
        piece.cutStock?.id !== root.sourceId ||
        piece.cutPlanes.length ||
        piece.roundOpenings?.length ||
        piece.rectangularOpenings?.length ||
        !sameCutDimensions(
          [piece.size[thickness], piece.size[width], piece.size[length]],
          remnant,
        )
      )
        throw Error(
          "A remnant has been edited. Review its current cuts before returning the starting stock.",
        );
      return [];
    }
    if (!targetIds.has(piece.id)) return [piece];
    const previous = previousMaterials.get(piece.id);
    if (piece.offcut || (piece.cutStock && piece.cutStock.id !== root.sourceId) ||
      (previous && piece.material !== anchor.material))
      throw Error(
        "A part now uses different stock. Review its current assignment.",
      );
    return [{ ...piece, material: previous ?? piece.material, cutStock: null }];
  });
  const releasedAt = new Date().toISOString();
  const next = projectSchema.parse(
    ensurePartLabels({
      ...project,
      pieces: disposition === "return" ? [...pieces, restored] : pieces,
      guideFingerprint: null,
      history: project.history.map((entry) =>
        released.has(entry.id) && entry.offcutCut
          ? { ...entry, offcutCut: {
              ...entry.offcutCut, releasedAt,
              ...(entry.id === historyId && disposition === "unavailable" ? { inputUnavailable: true as const } : {}),
            } }
          : entry,
      ),
    }),
  );
  const checked = inspectCutStock(next);
  if (!checked.valid.has(root.sourceId) && (disposition === "return" || checked.groups.has(root.sourceId))) {
    const problem = checked.invalid.find(
      ({ sourceId }) => sourceId === root.sourceId,
    );
    throw Error(
      `Returning the starting stock conflicts with the current cut source. ${problem?.detail ?? ""}`.trim(),
    );
  }
  if (project.history.some(({ offcutCut }) => offcutCut?.inputUnavailable && remnants.has(offcutCut.inputId)))
    throw Error("A remnant from these cuts was marked unavailable. Review the remaining stock before revising this chain.");

  return { project: next, root, restored, targetIds, previousMaterials };
}

function stockPurchaseChange(before: Project, after: Project, materialId: MaterialId) {
  const quantity = (project: Project) => bom(project).find(({ id }) => id === materialId)?.quantity ?? 0;
  const stock = material(materialId);
  const from = quantity(before);
  const to = quantity(after);
  return from === to ? null : { name: stock.name, unit: stock.unit, before: from, after: to };
}

export function planOffcutRelease(project: Project, historyId: string, disposition: OffcutDisposition = "return") {
  const { project: next, root, restored, targetIds, previousMaterials } = releaseOffcutAssignments(project, historyId, disposition);
  return {
    source: project,
    project: next,
    disposition,
    offcut: `${partLabel(next, restored.id)} · ${restored.name}`,
    size: formatCutDimensions(root.inputSize),
    targets: [...targetIds].map((id) => {
      const target = project.pieces.find((piece) => piece.id === id);
      const label = partLabel(project, id);
      return {
        id,
        text: target
          ? `${label} · ${target.name}`
          : `${label} · Removed from the design`,
      };
    }),
    purchases: [...new Set([restored.material, ...previousMaterials.values()])].flatMap((id) => {
      const change = stockPurchaseChange(project, next, id);
      return change ? [{ id, ...change }] : [];
    }),
  };
}

export type OffcutReleasePlan = ReturnType<typeof planOffcutRelease>;

export function previewUncutStockRelease(project: Project, sourceId: string) {
  const inspection = inspectCutStock(project);
  const pieces = inspection.groups.get(sourceId);
  if (!project.plannedCutSources?.some((plan) => plan.sourceId === sourceId) ||
      !pieces?.length || !inspection.valid.has(sourceId))
    throw Error("Choose a current cut plan for stock that is still uncut.");
  const records = project.history.flatMap(({ id, offcutCut }) =>
    offcutCut?.sourceId === sourceId && !offcutCut.releasedAt ? [{ id, record: offcutCut }] : []);
  if (records.some(({ record }) => record.retainedTrim))
    throw Error("A part from this source has a later trim. Review its current cuts before releasing the original stock.");
  const remnantIds = new Set(records.flatMap(({ record }) => record.remnants.map(({ id }) => id)));
  const roots = records.filter(({ record }) => !remnantIds.has(record.inputId));
  let staged = project;
  for (const { id } of roots) staged = releaseOffcutAssignments(staged, id).project;
  if (staged.history.some(({ offcutCut }) => offcutCut?.sourceId === sourceId && !offcutCut.releasedAt))
    throw Error("Some offcut assignments could not be traced back to this stock plan.");

  // The normal release still requires the exact original planned layout,
  // so a changed profile, missing piece or untracked cut cannot be rewound here.
  const { project: next, restored: [blank] } = releasePlannedCutSources(staged, [sourceId]);
  return {
    source: project,
    project: next,
    materialId: pieces[0].material,
    parts: pieces.filter(({ offcut }) => !offcut).map(({ id, name }) => ({
      id, label: partLabel(project, id), name,
    })),
    assignments: records.length,
    restored: blank ? { label: partLabel(next, blank.id), size: formatCutDimensions(cutSourceRegion(blank).sourceSize) } : null,
    purchase: stockPurchaseChange(project, next, pieces[0].material),
  };
}

export type UncutStockRelease = ReturnType<typeof previewUncutStockRelease> & { reuse?: OffcutReusePlan };

export function previewUncutStockReuse(release: UncutStockRelease): OffcutReusePlan | null {
  if (release.restored || !release.parts.length) return null;
  const { project, materialId } = release;
  const targets = new Set(release.parts.map(({ id }) => id));
  const finished = new Set(project.steps.filter(({ complete }) => complete).map(({ id }) => id));
  if (project.pieces.some(({ id, stepId }) => targets.has(id) && finished.has(stepId))) return null;

  const scraps = onHandOffcuts(project).filter((piece) => piece.material === materialId);
  if (!scraps.length) return null;

  const plan = planOffcutReuse(project, scraps.map(({ id }) => id), targets);
  if (plan.assignments.length !== targets.size) return null;
  const purchase = stockPurchaseChange(release.source, plan.project, materialId);
  if (!purchase || purchase.after >= purchase.before) return null;
  return { ...plan, source: release.source, purchases: [{ id: materialId, ...purchase }] };
}
