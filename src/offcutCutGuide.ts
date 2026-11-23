import { cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf, setCutSourceOnHand } from "./cutStock";
import { cutConsumesTail } from "./packing";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { plannedStockCutOrders, type StockCutOrderView } from "./plannedCutSources";
import { isDrywall } from "./drywallReference";
import { openingCutoutPrerequisite } from "./openingCutouts";
import { offcutStockSize } from "./stockAxes";

export const offcutCutOrderTitle = "Recorded offcut cut order";
export const offcutCutOrderScope =
  "Work from top to bottom. Match the starting piece to its label and measured size. Sizes are length × width × thickness.";

export const sameCutDimensions = (
  first: readonly number[],
  second: readonly number[],
) => first.every((value, index) => Math.abs(value - second[index]) <= 1e-6);
export const formatCutDimensions = (size: readonly number[]) =>
  [...size].reverse().map(formatStockLength).join(" × ");

function unavailableInputs(project: Project) {
  return new Map(project.history.flatMap(({ offcutCut }) =>
    offcutCut?.inputUnavailable ? [[offcutCut.inputId, offcutCut] as const] : []));
}

export function unavailableOffcutLines(project: Project) {
  return [...unavailableInputs(project)].map(([id, record]) =>
    `${partLabel(project, id)} · ${record.inputName ?? "Offcut"} · ${formatCutDimensions(record.inputSize)}`);
}

export function offcutCutRows(
  project: Project,
  inspection?: ReturnType<typeof inspectCutStock>,
  stockOrders?: readonly StockCutOrderView[],
) {
  const records = project.history.flatMap(({ id, offcutCut }) =>
    offcutCut && !offcutCut.releasedAt ? [{ id, record: offcutCut }] : [],
  );
  if (!records.length) return [];
  const checked = inspection ?? inspectCutStock(project);
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const producers = new Map(
    records.flatMap(({ record }, index) =>
      record.remnants.map(
        (remnant) =>
          [
            remnant.id,
            { index, sourceId: record.sourceId, size: remnant.size },
          ] as const,
      ),
    ),
  );
  const lastTrim = new Map<string, number>();
  const unavailable = unavailableInputs(project);
  const laterInputs = new Map(unavailable);
  const verified = new Set<number>();
  // A later recorded trim can explain a changed finished size on the same
  // part. Work back from the current retained stock to verify the chain.
  for (let index = records.length - 1; index >= 0; index--) {
    const { record } = records[index];
    const part = pieces.get(record.targetId);
    const nextIndex = lastTrim.get(record.targetId);
    const next = nextIndex === undefined ? undefined : records[nextIndex].record;
    const current =
      part && (!part.offcut || record.looseSplit || record.usableMeasurement) && part.cutStock?.id === record.sourceId &&
      checked.valid.has(record.sourceId) ? cutSourceRegion(part) : null;
    const sameResult = current &&
        sameCutDimensions(current.size, record.result.size) &&
        sameCutDimensions(current.sourceSize, record.result.sourceSize) &&
        sameCutDimensions(current.offset, record.result.offset);
    const laterTrim = next && nextIndex !== undefined && verified.has(nextIndex) &&
        next.sourceId === record.sourceId &&
        sameCutDimensions(next.retainedTrim!.inputRegionSize, record.result.size) &&
        sameCutDimensions(next.result.sourceSize, record.result.sourceSize) &&
        sameCutDimensions(next.result.offset, record.result.offset);
    if (record.looseSplit || record.usableMeasurement) {
      const primary = laterInputs.get(record.targetId);
      const laterUse = primary &&
        primary.sourceId === record.sourceId &&
        sameCutDimensions(primary.inputSize, record.remnants[0].size) &&
        sameCutDimensions(primary.result.sourceSize, record.result.sourceSize) &&
        sameCutDimensions(primary.usableMeasurement?.inputOffset ?? primary.result.offset, record.result.offset);
      const other = record.remnants[1];
      const otherPart = other && pieces.get(other.id);
      const otherUse = other && laterInputs.get(other.id);
      const otherTrimIndex = other && lastTrim.get(other.id);
      const otherTrim = otherTrimIndex !== undefined && verified.has(otherTrimIndex)
        ? records[otherTrimIndex].record : undefined;
      const otherVerified = !other || (otherPart?.cutStock?.id === record.sourceId &&
        sameCutDimensions(offcutStockSize(otherPart), other.size)) ||
        [otherUse, otherTrim].some((use) => use?.sourceId === record.sourceId && sameCutDimensions(use.inputSize, other.size));
      if (checked.valid.has(record.sourceId) && (sameResult || laterTrim || laterUse) && otherVerified)
        verified.add(index);
    } else if (laterTrim || sameResult) {
      verified.add(index);
    }
    if (verified.has(index) && record.inputId !== record.targetId) laterInputs.set(record.inputId, record);
    if (record.retainedTrim) lastTrim.set(record.targetId, index);
  }
  const invalid = new Set<number>();
  const plannedSources = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  const sourceOrderLabels = new Map((stockOrders ?? plannedStockCutOrders(project, checked))
    .map(({ sourceId, anchorLabel }) => [sourceId, anchorLabel]));
  const recordedSourceLabels = new Map(project.recordedStockCutOrders?.map(({ sourceId, anchorLabel }) => [sourceId, anchorLabel]));
  const recoveredCutouts = new Map(project.openingCutoutRecords?.map((record) => [record.sourceId, record]));
  const priorResult = new Map<string, number>();
  const incompleteCuts = new Map<number, number>();
  const rows = records.map(({ id, record }, index) => {
    const part = pieces.get(record.targetId);
    const prior = producers.get(record.inputId);
    const earlierPartIndex = record.retainedTrim ? priorResult.get(record.targetId) : undefined;
    priorResult.set(record.targetId, index);
    const earlierPart = earlierPartIndex === undefined ? undefined : records[earlierPartIndex].record;
    const issues = [];
    if (!verified.has(index))
      issues.push("Review the current part and cut source.");
    if (earlierPart && earlierPartIndex !== undefined &&
        (invalid.has(earlierPartIndex) || earlierPart.sourceId !== record.sourceId ||
          !sameCutDimensions(earlierPart.result.size, record.retainedTrim!.inputRegionSize)))
      issues.push(`Review cut ${earlierPartIndex + 1}, which prepared this blank.`);
    if (
      prior &&
      (prior.index >= index ||
        prior.sourceId !== record.sourceId ||
        !sameCutDimensions(prior.size, record.inputSize))
    )
      issues.push("Verify the starting remnant and its dimensions.");
    else if (prior && invalid.has(prior.index))
      issues.push(
        `Review cut ${prior.index + 1}, which supplies this remnant.`,
      );
    if (issues.length) invalid.add(index);
    const savedPart = part ?? checked.groups.get(record.sourceId)?.[0];
    const woodKerf = savedPart?.cutStock?.woodKerf;
    const kerf = savedPart ? pieceCutKerf(savedPart) : 0;
    const input = partLabel(project, record.inputId);
    const target = partLabel(project, record.targetId);
    const cutout = !prior && earlierPartIndex === undefined ? recoveredCutouts.get(record.sourceId) : undefined;
    const priorNumber = prior && prior.index < index && prior.sourceId === record.sourceId ? prior.index + 1 : undefined;
    const preparedBy = earlierPartIndex === undefined ? undefined : earlierPartIndex + 1;
    const prerequisite = [priorNumber, preparedBy].reduce<number | undefined>((first, dependency) => {
      const waitingFor = dependency === undefined ? undefined : incompleteCuts.get(dependency);
      return first === undefined ? waitingFor : waitingFor === undefined ? first : Math.min(first, waitingFor);
    }, undefined);
    if (prerequisite !== undefined || (record.cuts.length > 0 && !record.completedAt))
      incompleteCuts.set(index + 1, prerequisite ?? index + 1);
    return {
      id,
      title: record.usableMeasurement ? `Measure ${input} · ${record.inputName ?? "Offcut"}`
        : record.looseSplit ? `Split ${input} · ${record.inputName ?? "Wood offcut"}`
        : `${record.retainedTrim ? `Trim ${target}` : `${input} → ${target}`}${part ? ` · ${part.name}` : ""}`,
      retainedPartId: record.retainedTrim ? record.targetId : undefined,
      pendingAssignment: !record.completedAt && !record.retainedTrim && !record.looseSplit &&
        !record.usableMeasurement && record.inputId !== record.targetId,
      issues,
      preparedBy,
      waitForStockCuts: plannedSources.has(record.sourceId) && !priorNumber && preparedBy === undefined,
      sourceCutsPending: plannedSources.has(record.sourceId),
      sourceOrderLabel: sourceOrderLabels.get(record.sourceId),
      recordedSourceLabel: !prior && earlierPartIndex === undefined ? recordedSourceLabels.get(record.sourceId) : undefined,
      recoveredOpening: cutout ? openingCutoutPrerequisite(project, cutout) : undefined,
      prior: priorNumber,
      prerequisite,
      completedAt: record.completedAt,
      inputSize: formatCutDimensions(record.inputSize),
      measurement: record.usableMeasurement
        ? `Mark the usable blank from ${formatStockLength(record.usableMeasurement.fromEnd)} along the length and ${formatStockLength(record.usableMeasurement.fromEdge)} across the width.`
        : undefined,
      cuttingLoss: record.cuts.length && woodKerf !== undefined
        ? `Recorded blade kerf ${formatStockLength(woodKerf)} per cut.`
        : record.looseSplit ? `Modeled blade kerf ${formatStockLength(kerf)} per cut.` : undefined,
      cuts: record.cuts.map(
        ({ kind, size }) => {
          const label = part && isDrywall(part.material)
            ? kind === "crosscut" ? "Score and snap length" : "Score and snap width"
            : kind === "crosscut" ? "Crosscut" : "Rip";
          const original = record.inputSize[kind === "crosscut" ? 2 : 1];
          const tail = cutConsumesTail(original, size, kerf)
            ? ` · Blade uses the remaining ${formatStockLength(kerf)}` : "";
          return `${label} to ${formatStockLength(size)}${tail}`;
        },
      ),
      unavailableRemnants: record.remnants.filter(({ id }) => unavailable.get(id)?.sourceId === record.sourceId)
        .map(({ id }) => partLabel(project, id)),
      remnants: record.remnants.filter(({ id }) => unavailable.get(id)?.sourceId !== record.sourceId).map(
        ({ id, size }) =>
          `${partLabel(project, id)} · ${formatCutDimensions(size)}${record.looseSplit && pieces.has(id) ? ` · ${pieces.get(id)!.name}` : ""}`,
      ),
    };
  });
  const handoffs = new Map<number, string[]>();
  for (const [index, row] of rows.entries()) {
    if (!row.prior || rows[row.prior - 1].issues.length) continue;
    const label = partLabel(project, records[index].record.inputId);
    const notes = handoffs.get(row.prior) ?? [];
    const operation = row.measurement ? "measurement" : row.cuts.length ? "cut" : "operation";
    notes.push(row.issues.length
      ? `Set aside ${label} and review operation ${index + 1} before using it.`
      : `Set aside ${label} for ${operation} ${index + 1}.`);
    handoffs.set(row.prior, notes);
  }
  return rows.map((row, index) => ({ ...row, remnantHandoffs: handoffs.get(index + 1) ?? [] }));
}

export type OffcutCutRow = ReturnType<typeof offcutCutRows>[number];

export function offcutCutCompletion(row: OffcutCutRow) {
  if (!row.cuts.length) return undefined;
  if (row.completedAt) return `Cuts marked complete · ${row.completedAt.slice(0, 10)}.`;
  if (row.prerequisite !== undefined) return `Mark cuts complete for operation ${row.prerequisite} first.`;
  return "Cuts to do.";
}

export function completeOffcutCut(project: Project, id: string) {
  const row = offcutCutRows(project).find((row) => row.id === id);
  if (!row?.cuts.length || row.issues.length)
    throw Error("Review the saved offcut operation before marking it complete.");
  if (row.completedAt) return project;
  if (row.sourceCutsPending)
    throw Error("Mark the original stock cut order complete first.");
  if (row.prerequisite !== undefined) throw Error(offcutCutCompletion(row));
  const sourceId = project.history.find((entry) => entry.id === id)!.offcutCut!.sourceId;
  const completedAt = new Date().toISOString();
  return {
    ...setCutSourceOnHand(project, sourceId, true),
    history: project.history.map((entry) => entry.id === id && entry.offcutCut
      ? { ...entry, offcutCut: { ...entry.offcutCut, completedAt } }
      : entry),
  };
}

const escape = (value: string) =>
  value.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");

export function offcutCutOrderMarkdown(rows: readonly OffcutCutRow[], unavailable: readonly string[] = []) {
  if (!rows.length && !unavailable.length) return "";
  return [
    `## ${offcutCutOrderTitle}`,
    "",
    ...(rows.length ? [offcutCutOrderScope, ""] : []),
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${escape(row.title)}`,
      ...(row.issues.length
        ? [`   **Review needed.** ${row.issues.join(" ")}`]
        : [
            `   Starting size ${row.inputSize}${row.prior ? ` · remnant from ${rows[row.prior - 1].measurement ? "measurement" : "cut"} ${row.prior}` : row.preparedBy ? ` · blank from cut ${row.preparedBy}` : ""}.`,
            ...(row.waitForStockCuts ? [
              `   Complete the source stock cut order before using this blank.${row.sourceOrderLabel ? ` Find ${row.sourceOrderLabel} under Planned stock cuts.` : ""}`,
            ] : []),
            ...(row.recordedSourceLabel ? [`   Original stock order · ${row.recordedSourceLabel} under Recorded stock cuts.`] : []),
            ...(row.recoveredOpening ? [`   ${row.recoveredOpening}`] : []),
            `   ${row.measurement ?? (row.cuts.length ? row.cuts.join(" · ") + "." : "Fits as measured.")}`,
            ...(row.cuttingLoss ? [`   ${row.cuttingLoss}`] : []),
            ...(offcutCutCompletion(row) ? [`   ${offcutCutCompletion(row)}`] : []),
            ...(row.remnants.length
              ? [`   Keep ${row.remnants.map(escape).join(" and ")}.`]
              : []),
            ...(row.unavailableRemnants.length
              ? [`   Unavailable remnant · ${row.unavailableRemnants.map(escape).join(", ")}.`]
              : []),
            ...row.remnantHandoffs.map((note) => `   ${escape(note)}`),
          ]),
      "",
    ]),
    ...(unavailable.length ? ["### Unavailable offcuts", "", ...unavailable.map((line) => `- ${escape(line)}`), ""] : []),
    "",
  ].join("\n");
}
