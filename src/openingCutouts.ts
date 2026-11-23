import { formatStockLength } from "./measurement";
import { addMeasuredOffcut } from "./measuredOffcuts";
import { material, projectSchema, type Piece, type Project, type V3 } from "./model";
import type { OpeningCutoutRecord } from "./openingCutoutSchema";
import { ensurePartLabels, partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { rectangularOpeningMarks } from "./throughOpeningCuts";
import { openingAxes } from "./throughOpenings";
import type { RectangularOpening } from "./throughOpeningSchema";

export const openingCutoutTitle = "Recovered opening cutouts";
export const openingCutoutInstructions = "After cutting, measure the clear rectangle inside the blade path, starter holes and damaged edges.";
export const openingCutoutReference = "https://cdn.makitatools.com/apps/cms/doc/prod/XVJ/791dd413-af4d-43f3-b65c-a91da986df6a_XVJ03Z_IM.pdf";
const epsilon = 1e-7;

function cutoutFootprint(panel: Piece, opening: RectangularOpening) {
  const { axis, fromEdges: marks, spans: sizes } = rectangularOpeningMarks(panel, opening);
  const edges = openingAxes(axis);
  const fromEdges = marks.map((n) => Math.max(0, n)) as [number, number];
  const spans = edges.map((edge, i) => Math.min(panel.size[edge], marks[i] + sizes[i]) - fromEdges[i]) as [number, number];
  return { axis, edges, fromEdges, spans };
}

export function openingCutoutReview(project: Project, panel: Piece, index: number) {
  const opening = panel.rectangularOpenings?.[index];
  const stock = material(panel.material);
  const axes = stockAxes(panel, panel.cutStock?.size ?? panel.size);
  if (!opening || opening.source || opening.axis !== axes.thickness || panel.offcut ||
      !stock.wood || stock.stockKind !== "sheet" || !stock.cuttable) return;

  const { axis, edges, fromEdges, spans } = cutoutFootprint(panel, opening);
  if (spans.some((size) => size <= epsilon)) return;

  const existing = project.openingCutoutRecords?.find((record) =>
    record.panelId === panel.id && record.axis === axis &&
    fromEdges.every((start, i) => Math.min(start + spans[i], record.fromEdges[i] + record.spans[i]) -
      Math.max(start, record.fromEdges[i]) > epsilon),
  );
  const pending = project.plannedCutSources?.some(({ sourceId }) => sourceId === panel.cutStock?.id);
  const limits: V3 = [spans[edges[0] === axes.length ? 0 : 1], spans[edges[0] === axes.width ? 0 : 1], panel.size[axis]];
  return { axis, fromEdges, spans, limits, existing, pending };
}

export function recordOpeningCutout(project: Project, panelId: string, index: number, length: number, width: number) {
  const panel = project.pieces.find(({ id }) => id === panelId);
  const review = panel && openingCutoutReview(project, panel, index);
  if (!panel || !review) throw Error("Choose a saved rectangular cut through the thickness of a wood sheet.");
  if (review.existing) throw Error("This area of the opening already supplied a recorded cutout.");
  if (review.pending) throw Error("Complete the source stock cut order before recording this cutout.");
  const dimensions: V3 = [length, width, review.limits[2]];
  if (dimensions.some((value, i) => !Number.isFinite(value) || value <= 0 || value > review.limits[i] + epsilon))
    throw Error("Enter the usable cutout length and width within the saved opening.");
  dimensions[0] = Math.min(length, review.limits[0]);
  dimensions[1] = Math.min(width, review.limits[1]);

  const label = partLabel(project, panelId);
  const stocked = addMeasuredOffcut(project, panel.stepId, panel.material, dimensions, `Rectangular cutout from ${label}`);
  const offcut = stocked.pieces.at(-1)!;
  const record: OpeningCutoutRecord = {
    panelId, offcutId: offcut.id, sourceId: offcut.cutStock!.id, axis: review.axis,
    fromEdges: review.fromEdges, spans: review.spans, dimensions,
  };
  return projectSchema.parse(ensurePartLabels({
    ...stocked, guideFingerprint: null,
    openingCutoutRecords: [...(project.openingCutoutRecords ?? []), record],
  }));
}

export function openingCutoutOrigin(project: Project, record: OpeningCutoutRecord) {
  const edges = openingAxes(record.axis).map((axis) => "XYZ"[axis]);
  const marks = record.fromEdges.map((start, i) =>
    `${formatStockLength(start)} to ${formatStockLength(start + record.spans[i])} from local −${edges[i]}`,
  ).join(", ");
  return `${partLabel(project, record.panelId)} · ${marks}`;
}

export function openingCutoutPrerequisite(project: Project, record: OpeningCutoutRecord) {
  const panel = project.pieces.find(({ id, offcut }) => id === record.panelId && !offcut);
  const current = panel?.rectangularOpenings?.some((opening) => {
    if (opening.axis !== record.axis || opening.source) return false;
    const { fromEdges, spans } = cutoutFootprint(panel, opening);
    return fromEdges.every((start, i) => Math.abs(start - record.fromEdges[i]) <= epsilon &&
      Math.abs(spans[i] - record.spans[i]) <= epsilon);
  });
  const origin = openingCutoutOrigin(project, record);
  return current ? `Complete the opening and confirm the measured cutout before using this blank. Origin · ${origin}.`
    : `Use the previously measured cutout stock. Earlier opening · ${origin}.`;
}

export function openingCutoutGuideLines(project: Project) {
  const records = project.openingCutoutRecords;
  if (!records?.length) return [];
  const bySource = new Map(records.map((record) => [record.sourceId, [] as string[]]));
  for (const piece of project.pieces) {
    if (!piece.cutStock) continue;
    bySource.get(piece.cutStock.id)?.push(partLabel(project, piece.id));
  }
  return records.map((record) => {
    const pieces = bySource.get(record.sourceId) ?? [];
    const current = pieces.length ? `Source now supplies ${pieces.join(", ")}.` : "The source has no remaining parts or offcuts in this project.";
    return `${partLabel(project, record.offcutId)} · ${record.dimensions.map(formatStockLength).join(" × ")} · Recovered from ${openingCutoutOrigin(project, record)}. ${current}`;
  });
}
