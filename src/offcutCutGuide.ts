import { cutSourceRegion } from "./cutSourceAxes";
import { inspectCutStock } from "./cutStock";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

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
  const invalid = new Set<number>();
  return records.map(({ id, record }, index) => {
    const part = pieces.get(record.targetId);
    const prior = producers.get(record.inputId);
    const current =
      part &&
      !part.offcut &&
      part.cutStock?.id === record.sourceId &&
      checked.valid.has(record.sourceId)
        ? cutSourceRegion(part)
        : null;
    const issues = [];
    if (
      !current ||
      !sameCutDimensions(current.size, record.result.size) ||
      !sameCutDimensions(current.sourceSize, record.result.sourceSize) ||
      !sameCutDimensions(current.offset, record.result.offset)
    )
      issues.push("Review the current part and cut source.");
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
    const input = partLabel(project, record.inputId);
    const target = partLabel(project, record.targetId);
    return {
      id,
      title: `${input} → ${target}${part ? ` · ${part.name}` : ""}`,
      issues,
      prior:
        prior && prior.index < index && prior.sourceId === record.sourceId
          ? prior.index + 1
          : undefined,
      inputSize: formatCutDimensions(record.inputSize),
      cuts: record.cuts.map(
        ({ kind, size }) =>
          `${kind === "crosscut" ? "Crosscut" : "Rip"} to ${formatStockLength(size)}`,
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
            `   Starting size ${row.inputSize}${row.prior ? ` · remnant from cut ${row.prior}` : ""}.`,
            `   ${row.cuts.length ? row.cuts.join(" · ") + "." : "Fits as measured."}`,
            ...(row.remnants.length
              ? [`   Keep ${row.remnants.join(" and ")}.`]
              : []),
          ]),
      "",
    ]),
    "",
  ].join("\n");
}
