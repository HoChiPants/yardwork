import { inspectCutStock } from "./cutStock";
import type { BomRow } from "./engine";
import { material, type Piece, type Project } from "./model";
import { formatCutDimensions, offcutCutRows } from "./offcutCutGuide";
import { ensurePartLabels, partLabel } from "./partLabels";
import { plannedStockCutOrders } from "./plannedCutSources";
import { stockAxes } from "./stockAxes";
import type { StockCutSequence } from "./stockCutSequence";

export type StepStockRow = {
  id: string;
  title: string;
  detail: string;
  partId: string;
  labels: string[];
  shared: number[];
  earlier?: number;
  offcutOperations: number[];
  pendingOffcutCuts: number;
  keepOffcuts: string[];
  issues: string[];
};

export const stepStockTitle = "Stock for this step";

export function stockPreparationByStep(
  project: Project,
  rows: readonly BomRow[],
  sequences: ReadonlyMap<string, readonly StockCutSequence[]>,
  inspection = inspectCutStock(project),
  planned = plannedStockCutOrders(project, inspection),
  offcutRows = offcutCutRows(project, inspection, planned),
) {
  const labeled = ensurePartLabels(project);
  const labelById = new Map(labeled.partLabels.map(({ partId, label }) => [partId, label]));
  const labelsFor = (part: Piece) => labelById.get(part.id) ?? partLabel(labeled, part.id);
  const active = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const steps = new Map(project.steps.map(({ id }, i) => [id, i + 1]));
  const byStep = new Map<string, StepStockRow[]>();
  const bySource = new Map(planned.map((order) => [order.sourceId, order]));
  const recorded = new Map(project.recordedStockCutOrders?.map((order) => [order.sourceId, order]));
  const invalid = new Map(inspection.invalid.map(({ sourceId, detail }) => [sourceId, detail]));
  const history = new Map(project.history.map(({ id, offcutCut }) => [id, offcutCut]));
  const cutBeforePart = new Map<string, number>();
  const savedOffcuts = new Map<string, { producerStep?: number; useStep: number; note: string }[]>();
  const completedSteps = new Set(project.steps.filter(({ complete }) => complete).map(({ id }) => id));
  for (const [index, row] of offcutRows.entries()) {
    const record = history.get(row.id);
    if (!record) continue;
    cutBeforePart.set(record.targetId, index + 1);
    for (const { id } of record.remnants) cutBeforePart.set(id, index + 1);
    const target = active.get(record.targetId);
    if (!target || row.issues.length || record.inputId === record.targetId ||
      record.looseSplit || record.usableMeasurement || completedSteps.has(target.stepId)) continue;
    const useStep = steps.get(target.stepId);
    if (useStep === undefined) continue;
    const producer = row.prior && history.get(offcutRows[row.prior - 1].id);
    const producerPart = producer ? active.get(producer.targetId) : undefined;
    const producerStep = producerPart ? steps.get(producerPart.stepId) : undefined;
    const note = `Keep ${partLabel(labeled, record.inputId)} (${row.inputSize}) for step ${useStep} · ${labelsFor(target)} · ${target.name}.`;
    const uses = savedOffcuts.get(record.sourceId) ?? [];
    uses.push({ producerStep, useStep, note });
    savedOffcuts.set(record.sourceId, uses);
  }

  function addStock(stock: Pick<StepStockRow, "id" | "title" | "detail" | "issues">, members: Piece[]) {
    const groups = new Map<string, Piece[]>();
    for (const member of members) {
      if (!steps.has(member.stepId)) continue;
      const group = groups.get(member.stepId) ?? [];
      group.push(member);
      groups.set(member.stepId, group);
    }
    if (!groups.size) return;
    const numbers = Array.from(groups.keys(), (id) => steps.get(id)!).sort((a, b) => a - b);
    for (const [stepId, parts] of groups) {
      const number = steps.get(stepId)!;
      const offcutOperations = new Set<number>();
      const issues = new Set(stock.issues);
      // Follow only the operations that supply this step's parts.
      const pending = parts.flatMap(({ id }) => {
        const index = cutBeforePart.get(id);
        return index === undefined ? [] : [index];
      });
      while (pending.length) {
        const index = pending.pop()!;
        if (offcutOperations.has(index)) continue;
        const cut = offcutRows[index - 1];
        offcutOperations.add(index);
        for (const issue of cut.issues) issues.add(`Offcut operation ${index} · ${issue}`);
        if (cut.prior) pending.push(cut.prior);
        if (cut.preparedBy) pending.push(cut.preparedBy);
      }
      const operations = [...offcutOperations].sort((a, b) => a - b);
      const entry: StepStockRow = {
        ...stock, issues: [...issues], partId: parts[0].id, labels: parts.map(labelsFor),
        shared: numbers.filter((value) => value !== number),
        earlier: numbers[0] < number ? numbers[0] : undefined,
        offcutOperations: operations,
        pendingOffcutCuts: operations.filter((index) => {
          const cut = offcutRows[index - 1];
          return cut.cuts.length > 0 && !cut.completedAt && !cut.issues.length;
        }).length,
        keepOffcuts: (savedOffcuts.get(stock.id) ?? []).flatMap(({ producerStep, useStep, note }) =>
          (producerStep ?? numbers[0]) === number && useStep > number ? [note] : []),
      };
      const next = byStep.get(stepId) ?? [];
      next.push(entry);
      byStep.set(stepId, next);
    }
  }

  for (const [sourceId, pieces] of inspection.groups) {
    const members = pieces.filter((piece) => active.has(piece.id));
    if (!members.length) continue;
    const first = members[0];
    const size = first.cutStock!.size;
    const axes = stockAxes(first, size);
    const order = bySource.get(sourceId), receipt = recorded.get(sourceId);
    const review = invalid.get(sourceId) ?? order?.issue;
    addStock({
      id: sourceId,
      title: `${order?.anchorLabel ?? receipt?.anchorLabel ?? labelsFor(first)} · ${material(first.material).name}`,
      detail: [
        review ? "Review this source" : receipt?.completedAt ? "Cuts marked complete"
          : order ? "Planned stock cuts" : "Recorded blank layout",
        formatCutDimensions([size[axes.thickness], size[axes.width], size[axes.length]]),
      ].join(" · "),
      issues: [review, order?.review].filter((value): value is string => !!value),
    }, members);
  }
  for (const [stockId, group] of sequences) {
    for (const sequence of group) {
      const members = sequence.partIds.flatMap((id) => {
        const part = active.get(id);
        return part && !part.cutStock ? [part] : [];
      });
      addStock({
        id: `${stockId}/${sequence.title}`, title: `${material(sequence.layout.materialId).name} · ${sequence.title}`,
        detail: sequence.source, issues: sequence.review ? [sequence.review] : [],
      }, members);
    }
  }
  for (const row of rows) {
    for (const oversized of row.oversizedParts) {
      const piece = active.get(oversized.id);
      if (piece) addStock({
        id: `oversize/${piece.id}`, title: `${labelsFor(piece)} · ${piece.name}`,
        detail: material(row.id).name, issues: ["This blank exceeds the selected stock size."],
      }, [piece]);
    }
  }
  return byStep;
}

export function stepStockSummary(row: StepStockRow) {
  const otherSteps = row.shared.filter((number) => number !== row.earlier);
  return [
    `Use ${row.labels.join(", ")}`,
    ...(row.earlier ? [`first needed at step ${row.earlier}`] : []),
    ...(otherSteps.length ? [`shared with ${otherSteps.length === 1 ? "step" : "steps"} ${otherSteps.join(", ")}`] : []),
    ...(row.offcutOperations.length ? [`offcut ${row.offcutOperations.length === 1 ? "operation" : "operations"} ${row.offcutOperations.join(", ")}`] : []),
    ...(row.pendingOffcutCuts ? [`${row.pendingOffcutCuts} ${row.pendingOffcutCuts === 1 ? "operation still to cut" : "operations still to cut"}`] : []),
  ].join(" · ");
}

export function stepStockMarkdown(rows: readonly StepStockRow[] | undefined) {
  if (!rows?.length) return "";
  const escape = (text: string) => text.replace(/[\\`*_{}\[\]<>|]/g, "\\$&").replace(/[\r\n]+/g, " ");
  return `### ${stepStockTitle}\n\n` + rows.flatMap((row) => [
    `- ${escape(row.title)} · ${escape(row.detail)}. ${escape(stepStockSummary(row))}.`,
    ...row.keepOffcuts.map((note) => `  - ${escape(note)}`),
    ...row.issues.map((issue) => `  - Review · ${escape(issue)}`),
  ]).join("\n") + "\n\n";
}
