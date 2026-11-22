import { cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutConsumesTail } from "./packing";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";
import { plannedStockCutOrders, type PlannedStockCutOrder } from "./plannedCutSources";
import { isDrywall } from "./drywallReference";

export const offcutCutOrderTitle = "Recorded offcut cut order";
export const offcutCutOrderScope =
  "Work from top to bottom. Match the starting piece to its label and measured size. Sizes are length × width × thickness.";

export const sameCutDimensions = (
  first: readonly number[],
  second: readonly number[],
) => first.every((value, index) => Math.abs(value - second[index]) <= 1e-6);
export const formatCutDimensions = (size: readonly number[]) =>
  [...size].reverse().map(formatStockLength).join(" × ");

export function offcutCutRows(
  project: Project,
  inspection?: ReturnType<typeof inspectCutStock>,
  stockOrders?: readonly PlannedStockCutOrder[],
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
  const verified = new Set<number>();
  // A later recorded trim can explain a changed finished size on the same
  // part. Work back from the current retained stock to verify the chain.
  for (let index = records.length - 1; index >= 0; index--) {
    const { record } = records[index];
    const part = pieces.get(record.targetId);
    const nextIndex = lastTrim.get(record.targetId);
    const next = nextIndex === undefined ? undefined : records[nextIndex].record;
    const current =
      part && !part.offcut && part.cutStock?.id === record.sourceId &&
      checked.valid.has(record.sourceId) ? cutSourceRegion(part) : null;
    if (next && nextIndex !== undefined && verified.has(nextIndex) &&
        next.sourceId === record.sourceId &&
        sameCutDimensions(next.retainedTrim!.inputRegionSize, record.result.size) &&
        sameCutDimensions(next.result.sourceSize, record.result.sourceSize) &&
        sameCutDimensions(next.result.offset, record.result.offset))
      verified.add(index);
    else if (current &&
        sameCutDimensions(current.size, record.result.size) &&
        sameCutDimensions(current.sourceSize, record.result.sourceSize) &&
        sameCutDimensions(current.offset, record.result.offset))
      verified.add(index);
    if (record.retainedTrim) lastTrim.set(record.targetId, index);
  }
  const invalid = new Set<number>();
  const plannedSources = new Set(project.plannedCutSources?.map(({ sourceId }) => sourceId));
  const sourceOrderLabels = new Map((stockOrders ?? plannedStockCutOrders(project, checked))
    .map(({ sourceId, anchorLabel }) => [sourceId, anchorLabel]));
  const priorResult = new Map<string, number>();
  return records.map(({ id, record }, index) => {
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
    const woodKerf = part?.cutStock?.woodKerf;
    const kerf = part ? pieceCutKerf(part) : 0;
    const input = partLabel(project, record.inputId);
    const target = partLabel(project, record.targetId);
    return {
      id,
      title: `${record.retainedTrim ? `Trim ${target}` : `${input} → ${target}`}${part ? ` · ${part.name}` : ""}`,
      retainedPartId: record.retainedTrim ? record.targetId : undefined,
      issues,
      preparedBy: earlierPartIndex === undefined ? undefined : earlierPartIndex + 1,
      waitForStockCuts: plannedSources.has(record.sourceId) && !prior && earlierPartIndex === undefined,
      sourceOrderLabel: sourceOrderLabels.get(record.sourceId),
      prior:
        prior && prior.index < index && prior.sourceId === record.sourceId
          ? prior.index + 1
          : undefined,
      inputSize: formatCutDimensions(record.inputSize),
      cuttingLoss: record.cuts.length && woodKerf !== undefined
        ? `Recorded blade kerf ${formatStockLength(woodKerf)} per cut.`
        : undefined,
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
      remnants: record.remnants.map(
        ({ id, size }) =>
          `${partLabel(project, id)} · ${formatCutDimensions(size)}`,
      ),
    };
  });
}

export type OffcutCutRow = ReturnType<typeof offcutCutRows>[number];

const escape = (value: string) =>
  value.replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}\[\]<>|]/g, "\\$&");

export function offcutCutOrderMarkdown(rows: readonly OffcutCutRow[]) {
  if (!rows.length) return "";
  return [
    `## ${offcutCutOrderTitle}`,
    "",
    offcutCutOrderScope,
    "",
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${escape(row.title)}`,
      ...(row.issues.length
        ? [`   **Review needed.** ${row.issues.join(" ")}`]
        : [
            `   Starting size ${row.inputSize}${row.prior ? ` · remnant from cut ${row.prior}` : row.preparedBy ? ` · blank from cut ${row.preparedBy}` : ""}.`,
            ...(row.waitForStockCuts ? [
              `   Complete the source stock cut order before using this blank.${row.sourceOrderLabel ? ` Find ${row.sourceOrderLabel} under Planned stock cuts.` : ""}`,
            ] : []),
            `   ${row.cuts.length ? row.cuts.join(" · ") + "." : "Fits as measured."}`,
            ...(row.cuttingLoss ? [`   ${row.cuttingLoss}`] : []),
            ...(row.remnants.length
              ? [`   Keep ${row.remnants.join(" and ")}.`]
              : []),
          ]),
      "",
    ]),
    "",
  ].join("\n");
}
