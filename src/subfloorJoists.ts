import { Vector3 } from "three";
import { woodBearingSurfaces } from "./connectionContacts";
import { floorHangerPlanReviews } from "./floorHangerPlans";
import { floorJoistBearingScope, floorJoistReference as ref, floorJoistSpanInches, floorJoistSpanScope, floorJoistSpecies } from "./floorJoistReference";
import { formatStockLength as dim } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { subfloorReviews, type SubfloorReview } from "./subfloor";
import { subfloorJoistPlansSchema, type SubfloorJoistSpanInput } from "./subfloorSchema";
import { pieceThroughOpenings } from "./throughOpenings";
import { isPressureTreated } from "./treatedWood";

const epsilon = 0.00001;
type Surface = ReturnType<typeof woodBearingSurfaces>[number];
type BearingMark = { points: [V3, V3]; problem: boolean };
type EndReport = { label: string; inches: number; supportId?: string; issue?: string };
type Row = { id: string; ends: EndReport[]; clear: number[]; limit: number | null; supportIds: string[]; issue?: string; marks: BearingMark[] };

function axis(piece: Piece, index: number) {
  const local: V3 = [0, 0, 0];
  local[index] = 1;
  return new Vector3(...rotate(local, piece.rotation));
}

function reviewJoist(surface: Surface, reference: SubfloorJoistSpanInput | null, moving: Set<string>, hangers: Set<string>): Row {
  const { piece } = surface;
  const { length, width, thickness } = stockAxes(piece);
  const direction = axis(piece, length);
  const rest = [width, thickness] as const;
  const depthAxis = rest.find((index) => Math.abs(axis(piece, index).y) > 1 - epsilon);
  const id = piece.id;
  const empty = { id, ends: [], clear: [], limit: null, supportIds: [], marks: [] };
  if (depthAxis === undefined || Math.abs(direction.y) > epsilon || moving.has(id))
    return { ...empty, issue: "Review this joist’s orientation or movement before measuring fixed bearing." };

  const across = new Vector3(-direction.z, 0, direction.x);
  const long = piece.size[length];
  const wide = piece.size[depthAxis === width ? thickness : width];
  const center = new Vector3(...piece.position);
  const origin = center.clone().addScaledVector(direction, -long / 2);
  const mark = (start: number, end: number, problem: boolean): BearingMark => ({
    points: [start, end].map((value) => origin.clone().addScaledVector(direction, value)
      .setY(piece.position[1] + piece.size[depthAxis] / 2 + 0.04).toArray()) as [V3, V3], problem,
  });
  const strips = surface.contacts.map(({ pieceId, area, outline }) => {
    const offsets = outline.map((point) => new Vector3(...point).sub(origin));
    const l = offsets.map((point) => point.dot(direction)), w = offsets.map((point) => point.dot(across));
    const start = Math.max(0, Math.min(...l)), end = Math.min(long, Math.max(...l));
    const low = Math.min(...w), high = Math.max(...w);
    const fullWidth = low <= -wide / 2 + epsilon && high >= wide / 2 - epsilon &&
      Math.abs(area - (end - start) * (high - low)) <= epsilon && !moving.has(pieceId);
    return { pieceId, start, end, fullWidth, inches: end - start };
  }).sort((a, b) => a.start - b.start);

  const ends: EndReport[] = [];
  const marks: BearingMark[] = [];
  for (const far of [false, true]) {
    const label = far ? "Far end" : "Start end";
    const edge = far ? long : 0;
    const tail = (strip: typeof strips[number]) => Math.abs((far ? strip.end : strip.start) - edge);
    const near = strips.filter((strip) => tail(strip) <= epsilon);
    const usable = near.find(({ fullWidth }) => fullWidth);
    const nearest = strips.reduce((best, strip) => Math.min(best, tail(strip)), Infinity);
    const seat = usable ?? near[0];
    const inches = seat?.inches ?? 0;
    const issue = usable
      ? inches < ref.woodSeat - epsilon ? `Needs ${dim(ref.woodSeat - inches)} more wood seat along the joist to meet the ${dim(ref.woodSeat)} reference.` : undefined
      : seat ? "Contact covers only part of the width, has an irregular face or moves with an assembly."
        : hangers.has(id) ? "A hanger is recorded for this joist. Check the hanger and which end it supports."
          : Number.isFinite(nearest) ? `Nearest seat is ${dim(nearest)} inboard. Review the overhang and receiving support.`
            : "No direct wood seat found. Check what will carry this end.";
    ends.push({ label, inches, supportId: seat?.pieceId, issue });
    if (issue) marks.push(mark(far ? Math.max(0, long - 1.5) : 0, far ? long : Math.min(long, 1.5), true));
  }
  if (ends.some(({ issue }) => issue)) return { ...empty, ends, marks };

  const bearing = strips.filter(({ fullWidth, inches }) => fullWidth && inches >= ref.woodSeat - epsilon);
  if (bearing.some(({ end }, i) => bearing[i + 1] && end - bearing[i + 1].start > epsilon))
    return { ...empty, ends, issue: "The bearing footprints overlap. Review duplicated support or joist geometry.", marks: [mark(0, long, true)] };
  const spans = bearing.slice(1).flatMap(({ start }, i) => {
    const end = bearing[i].end;
    return start - end > epsilon ? [{ start: end, end: start, inches: start - end }] : [];
  });
  const clear = spans.map(({ inches }) => inches);
  const depth = ref.depths.findIndex((value) => Math.abs(value - piece.size[depthAxis]) <= epsilon);
  const shapeFits = Math.abs(wide - 1.5) <= epsilon && depth !== -1 &&
    !piece.cutPlanes.length && !pieceThroughOpenings(piece).length && !isPressureTreated(piece.material);
  const limit = reference && shapeFits
    ? floorJoistSpanInches[reference.species][ref.spacing.indexOf(reference.spacing)][depth] : null;
  const longest = Math.max(0, ...clear);
  const issue = reference && !shapeFits ? "Review the size, cut profile, holes or wood treatment before using this span table."
    : limit !== null && longest > limit + epsilon
      ? `Longest clear span exceeds the reference by ${dim(longest - limit)}. Review closer joist spacing, deeper stock or an additional designed support.`
      : undefined;
  return { id, ends, clear, limit, issue, supportIds: [...new Set(bearing.map(({ pieceId }) => pieceId))],
    marks: spans.map(({ start, end, inches }) => mark(start, end, limit !== null && inches > limit + epsilon)) };
}

function reviewPanels(project: Project, panels: SubfloorReview[], preview?: SubfloorJoistSpanInput | null) {
  const active = new Set(panels.flatMap(({ layout }) => layout?.joistIds ?? []));
  const surfaces = new Map(woodBearingSurfaces(project, active).map((surface) => [surface.piece.id, surface]));
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  const hangers = new Set(floorHangerPlanReviews(project).flatMap(({ rows }) =>
    rows.filter(({ issue }) => !issue).map(({ end }) => end.joistId)));
  return panels.map(({ panelId, layout, problem }) => {
    const saved = project.subfloorJoistPlans?.find((plan) => plan.panelId === panelId);
    const members = (layout?.joistIds ?? []).map((id) => `${id}/${surfaces.get(id)?.piece.material ?? ""}`).sort().join("|");
    const reference = preview === undefined ? saved?.reference ?? null : preview;
    const referenceProblem = preview === undefined && saved?.reference && saved.reference.members !== members
      ? "Joist stock changed. Confirm the species and grade stamps again."
      : reference && layout && layout.joistIds.length < 3
        ? "Model at least three continuous joist lines to compare repetitive floor framing."
      : reference && layout && layout.widest > reference.spacing + epsilon
        ? `The model has ${dim(layout.widest)} between joists. Use the actual maximum spacing for the reference.`
        : undefined;
    const rows = (layout?.joistIds ?? []).map((id): Row => {
      const surface = surfaces.get(id);
      return surface && !moving.has(panelId)
        ? reviewJoist(surface, referenceProblem ? null : reference, moving, hangers)
        : { id, ends: [], clear: [], limit: null, supportIds: [], marks: [], issue: "Review the member before comparing its floor bearing." };
    });
    return { panelId, members, saved, reference, referenceProblem, rows, center: layout?.center,
      problem: problem ?? (!rows.length ? "Add continuous wood joists beneath the sheet before checking their bearing." : undefined) };
  });
}

export type SubfloorJoistReview = ReturnType<typeof reviewPanels>[number];

export function reviewSubfloorJoists(project: Project, panel: SubfloorReview, reference?: SubfloorJoistSpanInput | null) {
  return reviewPanels(project, [panel], reference)[0];
}

export function subfloorJoistReviews(project: Project) {
  const ids = project.subfloorJoistPlans?.map(({ panelId }) => panelId);
  return ids?.length ? reviewPanels(project, subfloorReviews(project, ids)) : [];
}

export function saveSubfloorJoists(project: Project, panelId: string, selection: { reference: SubfloorJoistSpanInput | null } | null): Project {
  const plans = (project.subfloorJoistPlans ?? []).filter((plan) => plan.panelId !== panelId);
  if (selection) {
    const review = reviewSubfloorJoists(project, subfloorReviews(project, [panelId])[0], selection.reference);
    if (review.problem || review.referenceProblem) throw Error(review.problem ?? review.referenceProblem);
    plans.push({ panelId, reference: selection.reference && { ...selection.reference, members: review.members } });
  }
  return { ...project, subfloorJoistPlans: subfloorJoistPlansSchema.parse(plans), guideFingerprint: null };
}

export function subfloorJoistLines(project: Project, review: SubfloorJoistReview) {
  const { rows, reference, problem, referenceProblem } = review;
  return [
    ...(problem ? [problem] : []), ...(referenceProblem ? [referenceProblem] : []),
    ...(reference ? [`${floorJoistSpecies[reference.species]} No. 2 · up to ${dim(reference.spacing)} on center · 40 psf live / 20 psf dead.`] : []),
    ...rows.flatMap(({ id, ends, clear, limit, issue }) => [
      `${partLabel(project, id)} · ${ends.map(({ label, inches, supportId, issue }) =>
        `${label} ${dim(inches)}${supportId ? ` on ${partLabel(project, supportId)}` : ""}${issue ? `. ${issue}` : ""}`).join(" · ")}`,
      ...(clear.length ? [`Clear span${clear.length > 1 ? "s" : ""} ${clear.map(dim).join(", ")}${limit === null ? "" : ` · reference limit ${dim(limit)}`}.`] : []),
      ...(issue ? [issue] : []),
    ]),
  ];
}

export function subfloorJoistReport(project: Project) {
  const reviews = subfloorJoistReviews(project);
  return reviews.length ? [floorJoistBearingScope, floorJoistSpanScope, ...reviews.flatMap((review) => [
    `${partLabel(project, review.panelId)} · Joist bearing and span`, ...subfloorJoistLines(project, review),
  ])] : [];
}
