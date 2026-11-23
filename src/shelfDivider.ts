import { Euler, Matrix4, Vector3 } from "three";
import { clearFittedPart } from "./clearFittedPart";
import { faceContactPatch, retainedWoodFaces } from "./connectionContacts";
import { cutKerf, inspectCutStock, pieceCutKerf } from "./cutStock";
import { cutPiece } from "./engine";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { catalog, part, projectSchema, type MaterialId, type Piece, type Project, type V3 } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { reviewPanelBearing, type PanelBearingReview } from "./panelBearing";
import { partLabel } from "./partLabels";
import { recordStraightTrim } from "./recordedStraightTrim";
import { reviewShelfSag, shelfSagGeometry } from "./shelfSag";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { reviewWoodSupport, woodSupportPath, type WoodSupportReview } from "./woodSupport";

const tolerance = 1e-7;
const placementMargin = 0.00001;
const vec = (value: V3) => new Vector3(...value);
const rectangular = (piece: Piece) =>
  !piece.cutPlanes?.length && !piece.roundOpenings?.length && !piece.rectangularOpenings?.length;
export const shelfDividerReference = "https://learn.kregtool.com/plans/easy-to-build-bookcase/";
export const shelfDividerStocks = catalog.filter(
  ({ wood, cuttable, stockKind, shape }) => wood && cuttable && stockKind === "sheet" && !shape,
);
export type ShelfDividerPlacement = { bayIndex?: number } &
  ({ method: "center" | "find-clear" } | { method: "measured"; offset: number });

function dividerRotation(line: [V3, V3], axes: ReturnType<typeof stockAxes>): V3 {
  const basis = [new Vector3(), new Vector3(), new Vector3()] as const;
  basis[axes.thickness].copy(vec(line[1]).sub(vec(line[0])).normalize());
  basis[axes.length].set(0, 1, 0);
  basis[axes.width].crossVectors(basis[axes.thickness], basis[axes.length]);
  const matrix = new Matrix4().makeBasis(...basis);
  if (matrix.determinant() < 0) {
    basis[axes.width].negate();
    matrix.makeBasis(...basis);
  }
  const rotation = new Euler().setFromRotationMatrix(matrix);
  return [rotation.x, rotation.y, rotation.z];
}

function localShelfPosition(shelf: Piece, world: V3, axis: 0 | 1 | 2) {
  const delta = vec(world).sub(vec(shelf.position)).toArray();
  return rotate(delta, inverseRotation(shelf.rotation))[axis];
}

function suggestedPositions(project: Project, shelf: Piece, axis: 0 | 1 | 2,
  center: number, min: number, max: number, half: number) {
  const direction: V3 = [0, 0, 0];
  direction[axis] = 1;
  const unit = vec(rotate(direction, shelf.rotation));
  const halfSpan = shelf.size[axis] / 2;
  const markBelow = (at: number) => Math.floor((at + halfSpan) * 8) / 8 - halfSpan;
  const markAbove = (at: number) => Math.ceil((at + halfSpan) * 8) / 8 - halfSpan;
  const firstMark = markAbove(min);
  const increments = Array.from({ length: Math.max(0, Math.floor(max - firstMark) + 1) }, (_, i) => firstMark + i);
  const aroundParts = project.pieces.flatMap((piece) => {
    if (piece.offcut || piece.id === shelf.id) return [];
    const centerProjection = vec(piece.position).sub(vec(shelf.position)).dot(unit);
    const projectedHalf = piece.size.reduce((sum, size, i) => {
      const local: V3 = [0, 0, 0];
      local[i] = 1;
      return sum + Math.abs(vec(rotate(local, piece.rotation)).dot(unit)) * size / 2;
    }, 0);
    return [centerProjection - projectedHalf - half - placementMargin, centerProjection + projectedHalf + half + placementMargin];
  });
  const nearEdges = [center, min, max, ...aroundParts].flatMap((at) => [markBelow(at), markAbove(at)]);
  return [...new Set([...increments, ...nearEdges])]
    .filter((at) => at >= min - tolerance && at <= max + tolerance)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
}

export function previewShelfDivider(
  project: Project, shelfId: string, materialId: MaterialId, preferOffcut: boolean,
  placement: ShelfDividerPlacement = { method: "center" },
) {
  const plan = project.shelfSagPlans?.find(({ pieceId }) => pieceId === shelfId);
  const row = reviewPanelBearing(project).find(({ piece }) => piece.id === shelfId);
  const previous = plan && row && reviewShelfSag(row, plan);
  if (!plan || !previous || "reason" in previous || previous.withinTarget || !row)
    throw Error("Save a shelf sag estimate above your target before previewing a divider.");
  const stock = shelfDividerStocks.find(({ id }) => id === materialId);
  if (!stock) throw Error("Choose a rectangular wood sheet for the divider.");

  const shelf = row.piece;
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  if (moving.has(shelf.id)) throw Error("Choose a stationary shelf for a fixed divider.");
  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(shelfId));
  const geometry = previous.geometry;
  const bay = placement.bayIndex === undefined ? geometry.longest : geometry.spans[placement.bayIndex];
  if (!bay) throw Error("Choose a current shelf bay.");
  const reference = stock.stockSize ?? stock.size;
  const freshAxes = stockAxes({ size: reference, material: stock.id, stockLengthAxis: null });
  const thickness = reference[freshAxes.thickness];
  const min = bay.clearStart + thickness / 2 + placementMargin, max = bay.clearEnd - thickness / 2 - placementMargin;
  if (max < min) throw Error("The chosen stock is too thick for this clear bay.");
  const center = Math.min(max, Math.max(min, (bay.start + bay.end) / 2));
  const axis = geometry.identity.spanAxis;
  const lineDirection = vec(rotate(axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1], shelf.rotation));
  const topAt = (at: number) => vec(geometry.line[0]).addScaledVector(lineDirection, at - geometry.longest.start);
  const offered = placement.method === "find-clear"
    ? suggestedPositions(project, shelf, axis, center, min, max, thickness / 2)
    : [placement.method === "measured" ? placement.offset - geometry.width / 2 : (bay.start + bay.end) / 2];
  if (offered.some((at) => !Number.isFinite(at) || at < min - tolerance || at > max + tolerance))
    throw Error("Move the divider center inside the clear bay so its full thickness fits between the supports.");

  const bearing = reviewWoodSupport(project);
  const bases = [...bearing.values()]
    .flatMap(({ piece, onFloor, next }) =>
      piece.id !== shelfId && !moving.has(piece.id) && (onFloor || next) &&
        !woodSupportPath(bearing, piece.id).some(({ id }) => moving.has(id))
        ? retainedWoodFaces(piece).flatMap((face) => {
            const y = face.points[0][1];
            return y > tolerance && y < geometry.line[0][1] - tolerance &&
              Math.hypot(face.normal[0], face.normal[1] - 1, face.normal[2]) <= tolerance
              ? [{ y, pieceId: piece.id, face }] : [];
          })
        : [])
    .sort((a, b) => b.y - a.y);

  const blank = part(
    `Shelf divider · ${shelf.name}`.slice(0, 120), stock.id, [...reference], [0, 0, 0],
    shelf.stepId, section?.name ?? shelf.assembly,
  );
  const candidate = (source: Piece, axes: ReturnType<typeof stockAxes>, top: Vector3, y: number): Piece => {
    const size: V3 = [...source.size];
    size[axes.length] = top.y - y;
    size[axes.width] = geometry.depth;
    return {
      ...blank, size, position: [top.x, (top.y + y) / 2, top.z],
      rotation: dividerRotation(geometry.line, axes), stockLengthAxis: axes.length,
    };
  };
  function fitAt(at: number) {
    const top = topAt(at);
    const fit = [...bases, { y: 0, pieceId: null, face: null }].find(({ y, face }) => {
      if (top.y - y <= tolerance) return false;
      const divider = candidate(blank, freshAxes, top, y);
      if (face) {
        const bottom = retainedWoodFaces(divider).find(({ normal }) => normal[1] < -1 + tolerance)!;
        if ((faceContactPatch(bottom, face)?.area ?? 0) < thickness * geometry.depth - tolerance) return false;
      }
      return clearFittedPart(project, divider);
    });
    if (!fit) return null;
    const part = candidate(blank, freshAxes, top, fit.y);
    const motion = fittedPartMotionConflicts({ ...project, pieces: [...project.pieces, part] }, part.id);
    return { at, top, fit, motion };
  }
  let selected: NonNullable<ReturnType<typeof fitAt>> | undefined;
  let motionTrials = 0;
  for (const at of offered) {
    const found = fitAt(at);
    if (!found) continue;
    selected ??= found;
    if (!found.motion.length) { selected = found; break; }
    // Detailed mechanism sweeps are bounded. Keep the best static fit and show its contacts.
    if (++motionTrials >= 24) break;
  }
  if (!selected) throw Error(placement.method === "find-clear"
    ? "No searched position fits between the shelf and a supported base. Try a measured offset or review the parts in this bay."
    : "There is no unobstructed fit to the floor or to a supported wood face beneath this bay.");
  const { at, top, fit, motion } = selected;
  const need = { length: top.y - fit.y, width: geometry.depth };
  const fits = (source: Piece, axes: ReturnType<typeof stockAxes>, kerf: number) =>
    (["length", "width"] as const).every((key) => {
      const extra = source.size[axes[key]] - need[key];
      return Math.abs(extra) <= tolerance || extra > kerf + tolerance;
    });
  const inspected = preferOffcut ? inspectCutStock(project) : null;
  const reusable = inspected ? project.pieces
    .filter((piece) => piece.offcut && piece.material === stock.id && rectangular(piece) &&
      !!piece.cutStock && inspected.valid.has(piece.cutStock.id))
    .flatMap((piece) => {
      const axes = stockAxes(piece, piece.cutStock!.size);
      if (!fits(piece, axes, pieceCutKerf(piece)) || Math.abs(piece.size[axes.thickness] - thickness) > tolerance) return [];
      const initial = candidate(piece, axes, top, fit.y);
      const target = piece.cutStock!.sourceAxes ? initial : { ...initial, stockLengthAxis: piece.stockLengthAxis };
      const [match] = fittingOffcuts(project, target, inspected, new Set([piece.id]));
      return match ? [{ piece, match, target }] : [];
    })
    .sort((a, b) => Number(b.match.onHand) - Number(a.match.onHand) ||
      a.match.available[1] * a.match.available[2] - b.match.available[1] * b.match.available[2])[0] : undefined;
  if (!reusable && !fits(blank, freshAxes, cutKerf(stock.id)))
    throw Error("This sheet has too little usable stock for the divider and trim. Choose a larger sheet or review the bearing location.");

  let next: Project;
  if (reusable) {
    next = assignOffcutToPart({ ...project, pieces: [...project.pieces, reusable.target] }, blank.id, reusable.piece.id);
  } else {
    const fitted = candidate(blank, freshAxes, top, fit.y);
    const trimShift = blank.size.map((value, i) => (value - fitted.size[i]) / 2) as V3;
    const initial = { ...fitted, size: blank.size,
      position: vec(fitted.position).add(vec(rotate(trimShift, fitted.rotation))).toArray() };
    next = { ...project, pieces: [...project.pieces, initial] };
    for (const trimAxis of [freshAxes.length, freshAxes.width])
      if (initial.size[trimAxis] - fitted.size[trimAxis] > tolerance)
        next = cutPiece(next, initial.id, fitted.size[trimAxis], trimAxis);
    next = recordStraightTrim(project, next, initial, "crosscut-first").project;
  }
  const offset = Number((at + geometry.width / 2).toFixed(7));
  next = projectSchema.parse({
    ...next,
    sections: next.sections.map((item) =>
      item.id === section?.id ? { ...item, pieceIds: [...item.pieceIds, blank.id] } : item),
    shelfDividerPlans: [...(next.shelfDividerPlans ?? []), { shelfId, dividerId: blank.id, baseId: fit.pieceId, offset }],
    guideFingerprint: null,
  });
  const divider = next.pieces.find(({ id }) => id === blank.id)!;
  const supported = reviewPanelBearing(next).find(({ piece }) => piece.id === shelfId);
  const after = supported && reviewShelfSag(supported, plan);
  if (!supported || !after || "reason" in after || !supported.contacts.some(({ pieceId }) => pieceId === divider.id))
    throw Error("This divider does not make full-depth contact with the shelf in the modeled pose.");
  const oldIds = new Set(project.pieces.map(({ id }) => id));
  const offcuts = next.pieces.filter(({ id, offcut }) => offcut && !oldIds.has(id));
  return {
    project: next, divider, materialId, shelfId, baseId: fit.pieceId,
    reusedId: reusable?.piece.id ?? null, height: need.length, depth: need.width, thickness,
    offset, openings: [at - thickness / 2 - bay.clearStart, bay.clearEnd - at - thickness / 2],
    datum: [topAt(-geometry.width / 2).toArray(), top.toArray()] as [V3, V3],
    previous, after, offcuts, motion, outlines: retainedWoodFaces(divider).map(({ points }) => points),
  };
}

export type ShelfDividerPreview = ReturnType<typeof previewShelfDivider>;

export function reviewFittedShelfDividers(project: Project, rows: readonly PanelBearingReview[],
  support?: WoodSupportReview) {
  if (!project.shelfDividerPlans?.length) return [];
  const contacts = new Map(rows.map((row) => [row.piece.id, row]));
  const byId = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const bearing = support ?? reviewWoodSupport(project);
  const sagPlans = new Map(project.shelfSagPlans?.map((plan) => [plan.pieceId, plan]));
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  return project.shelfDividerPlans.map((plan) => {
    const row = contacts.get(plan.shelfId);
    const divider = byId.get(plan.dividerId);
    const geometry = row && shelfSagGeometry(row);
    const base = bearing.get(plan.dividerId);
    const current = !!(row && divider && geometry && rectangular(divider) &&
      ![plan.shelfId, plan.dividerId, plan.baseId].some((id) => id && moving.has(id)) &&
      !woodSupportPath(bearing, plan.dividerId).some(({ id }) => moving.has(id)) &&
      row.contacts.some(({ pieceId }) => pieceId === divider.id) &&
      Math.abs(localShelfPosition(row.piece, divider.position, geometry.identity.spanAxis) + geometry.width / 2 - plan.offset) < placementMargin &&
      (plan.baseId ? base?.next === plan.baseId : base?.onFloor));
    const sag = sagPlans.get(plan.shelfId);
    return {
      plan, divider, current,
      currentSag: current && sag ? reviewShelfSag(row!, sag) : null,
      withoutDivider: current && sag ? reviewShelfSag({ ...row!, contacts: row!.contacts.filter(({ pieceId }) => pieceId !== plan.dividerId) }, sag) : null,
    };
  });
}

export function shelfDividerGuideLines(project: Project, rows: readonly PanelBearingReview[]) {
  return reviewFittedShelfDividers(project, rows).map(({ plan, divider, current, currentSag, withoutDivider }) => {
    const label = `${partLabel(project, plan.dividerId)} · divider for ${partLabel(project, plan.shelfId)}`;
    if (!current || !divider) return `${label}. The shelf contact, installation mark or base changed. Review the divider fit before using these marks.`;
    const axes = stockAxes(divider);
    const fit = `${label}. Square-cut ${formatStockLength(divider.size[axes.length])} tall by ${formatStockLength(divider.size[axes.width])} deep. Dry-fit the center ${formatStockLength(plan.offset)} from the shelf’s local start, on ${plan.baseId ? partLabel(project, plan.baseId) : "the modeled floor"}. Verify fit, fasteners and tool access before loading the shelf.`;
    const sag = currentSag && withoutDivider && "geometry" in currentSag && "geometry" in withoutDivider
      ? ` The current model estimates ${formatPreciseInches(currentSag.deflection)} immediate sag with this divider and ${formatPreciseInches(withoutDivider.deflection)} if it is removed.`
      : "";
    const hits = fittedPartMotionConflicts(project, divider.id);
    return `${fit}${sag}${hits.length ? ` Saved movement contacts this divider in ${hits.join(", ")}.` : ""}`;
  });
}
