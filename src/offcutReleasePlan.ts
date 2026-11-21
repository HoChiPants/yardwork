import { cutSourceFrame, cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock } from "./cutStock";
import { bom } from "./engine";
import { material, part, projectSchema, type Project, type V3 } from "./model";
import { formatCutDimensions, sameCutDimensions } from "./offcutCutGuide";
import { ensurePartLabels, partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";

export function planOffcutRelease(project: Project, historyId: string) {
  const entries = project.history.flatMap(({ id, offcutCut }) =>
    offcutCut && !offcutCut.releasedAt ? [{ id, record: offcutCut }] : [],
  );
  const index = entries.findIndex(({ id }) => id === historyId);
  if (index < 0) throw Error("This offcut assignment is no longer active.");
  const root = entries[index].record;
  if (root.retainedTrim)
    throw Error("This is the trim that produced the offcut. Review its downstream assignments to return uncut remnants.");
  const released = new Set<string>();
  const targetIds = new Set<string>();
  const remnants = new Map<string, V3>();
  for (const { id, record } of entries.slice(index)) {
    if (id !== historyId && !remnants.has(record.inputId)) continue;
    if (record.sourceId !== root.sourceId || targetIds.has(record.targetId))
      throw Error(
        "The saved assignments disagree on their cut source or parts.",
      );
    released.add(id);
    targetIds.add(record.targetId);
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
    if (piece.offcut || (piece.cutStock && piece.cutStock.id !== root.sourceId))
      throw Error(
        "A part now uses different stock. Review its current assignment.",
      );
    return [{ ...piece, cutStock: null }];
  });
  const releasedAt = new Date().toISOString();
  const next = projectSchema.parse(
    ensurePartLabels({
      ...project,
      pieces: [...pieces, restored],
      history: project.history.map((entry) =>
        released.has(entry.id) && entry.offcutCut
          ? { ...entry, offcutCut: { ...entry.offcutCut, releasedAt } }
          : entry,
      ),
    }),
  );
  const checked = inspectCutStock(next);
  if (!checked.valid.has(root.sourceId)) {
    const problem = checked.invalid.find(
      ({ sourceId }) => sourceId === root.sourceId,
    );
    throw Error(
      `Returning the starting stock conflicts with the current cut source. ${problem?.detail ?? ""}`.trim(),
    );
  }

  const quantity = (input: Project) =>
    bom(input).find(({ id }) => id === anchor.material)?.quantity ?? 0;
  const before = quantity(project);
  const after = quantity(next);
  return {
    source: project,
    project: next,
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
    purchase:
      before === after
        ? null
        : {
            name: stockMaterial.name,
            unit: stockMaterial.unit,
            before,
            after,
          },
  };
}

export type OffcutReleasePlan = ReturnType<typeof planOffcutRelease>;
