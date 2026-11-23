import { Vector3 } from "three";
import { retainedWoodFaces } from "./connectionContacts";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import { fittedStockFaces, fittedStockMaterials, pickFittedStockFace, previewFittedStock } from "./fittedStock";
import { planFittedStockSource } from "./fittedStockSource";
import { guidePlacementTargets } from "./guidePlacement";
import { material, type MaterialId, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import type { RoofDeckJoint } from "./roofDeckSpacing";
import { reviewShingleRoof } from "./shingleRoof";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";

const tolerance = 1e-6;
const thickness = 1.5;
export const roofDeckBlockingStocks = fittedStockMaterials().filter(({ size }) => {
  const [thin, across] = [...size].sort((a, b) => a - b);
  return thin === thickness && across === 3.5;
});
export const roofDeckBlockingReference = "https://www.weyerhaeuser.com/application/files/2917/6463/0597/OSB-4004_Master_November2025.pdf#page=6";
export const roofDeckBlockingScope = "Preview square-ended 2 × 4 blocking laid flat beneath the deck. Verify the delivered stock grade, required roof edge support, and attachment at both ends before installing.";

const vector = (point: V3) => new Vector3(...point);
const localPoint = (point: Vector3, piece: Piece) => rotate(point.clone().sub(vector(piece.position)).toArray(), inverseRotation(piece.rotation));

function roofDeckJoints(project: Project) {
  const plan = project.projectCode?.trades.includes("roofing") && project.projectCode.shingleRoof;
  return plan ? reviewShingleRoof(project, plan).deckSpacing.joints : [];
}

export function roofDeckBlockingBays(project: Project, jointId: string) {
  return blockingBays(project, roofDeckJoints(project).find(({ id }) => id === jointId));
}

export function roofDeckBlockingTargets(project: Project, jointIds: ReadonlySet<string>) {
  if (!jointIds.size) return [];
  return roofDeckJoints(project).filter(({ id }) => jointIds.has(id)).map((joint) => ({
    jointId: joint.id,
    bayIds: blockingBays(project, joint).map(({ id }) => id),
  }));
}

function blockingBays(project: Project, joint: RoofDeckJoint | undefined) {
  if (!joint?.backing?.some(({ gaps }) => gaps.length)) return [];
  const panels = joint.pieceIds.map((id) => project.pieces.find((piece) => piece.id === id)!);
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  if (panels.some(({ id, designRole }) => moving.has(id) || designRole === "seat-lid")) return [];
  const axes = panels.map((panel) => stockAxes(panel, panel.cutStock?.size ?? panel.size));
  const [first, second] = panels.map((panel, index) => panel.size[axes[index].thickness]);
  if (Math.abs(first - second) > tolerance) return [];
  const [start, end] = joint.line.map(vector);
  const direction = end.clone().sub(start).normalize();
  const localUp: V3 = [0, 0, 0];
  localUp[axes[0].thickness] = 1;
  const normal = vector(rotate(localUp, panels[0].rotation));
  if (normal.y < 0) normal.negate();
  const underside = start.clone().addScaledVector(normal, -first);
  const datumLine = underside.clone().addScaledVector(normal, -thickness / 2);
  const position = (point: V3) => vector(point).sub(start).dot(direction);
  const gaps = joint.backing.flatMap(({ gaps }) => gaps.map(({ points }) => points.map(position).sort((a, b) => a - b)));

  const stops = project.pieces.flatMap((piece) => {
    const stock = material(piece.material);
    if (piece.offcut || moving.has(piece.id) || piece.designRole === "seat-lid" ||
      stock.stockKind !== "linear" || !stock.wood || stock.shape || pieceThroughOpenings(piece).length) return [];
    try {
      const faces = fittedStockFaces(project, piece.id);
      if (!faces.some(({ normalWorld, centerWorld }) => vector(normalWorld).distanceTo(normal) <= tolerance &&
        Math.abs(vector(centerWorld).sub(underside).dot(normal)) <= tolerance)) return [];
      return faces.flatMap((face) => {
        const outward = vector(face.normalWorld);
        const forward = outward.dot(direction) > 0;
        if (outward.distanceTo(direction.clone().multiplyScalar(forward ? 1 : -1)) > tolerance) return [];
        const at = position(face.centerWorld);
        const datumLocal = localPoint(datumLine.clone().addScaledVector(direction, at), piece);
        try {
          return [{ piece, at, forward, datumLocal, ref: pickFittedStockFace(project, piece.id, datumLocal, face.normalLocal) }];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }).sort((a, b) => a.at - b.at);

  return stops.flatMap((left, index) => {
    const right = stops[index + 1];
    if (!right || !left.forward || right.forward || left.piece.id === right.piece.id || right.at - left.at <= tolerance ||
      !gaps.some(([from, to]) => Math.min(right.at, to) - Math.max(left.at, from) > tolerance)) return [];
    return [{ id: `${left.piece.id}/${right.piece.id}`, left, right, normal, direction, joint,
      length: right.at - left.at }];
  });
}

export function previewRoofDeckBlocking(
  project: Project, jointId: string, bayId: string, stockId: MaterialId, reuse: boolean,
  planOffcuts?: ReadonlySet<string>,
) {
  const bay = roofDeckBlockingBays(project, jointId).find(({ id }) => id === bayId);
  const stock = roofDeckBlockingStocks.find(({ id }) => id === stockId);
  if (!bay || !stock) throw Error("Choose a current framing bay and solid 2 × 4 stock.");
  const { left, right, direction, normal } = bay;
  const axis = stock.size.indexOf(Math.max(...stock.size));
  const tangentAxis = [0, 1, 2].sort((a, b) => Math.abs(left.ref.normalLocal[a]) - Math.abs(left.ref.normalLocal[b]) || a - b)[0];
  const local: V3 = [0, 0, 0];
  local[tangentAxis] = 1;
  const initial = vector(rotate(local, left.piece.rotation));
  initial.addScaledVector(direction, -initial.dot(direction)).normalize();
  const target = stock.size[(axis + 1) % 3] === thickness ? normal : normal.clone().cross(direction);
  const roll = Math.atan2(direction.dot(initial.clone().cross(target)), initial.dot(target)) * 180 / Math.PI;
  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(left.piece.id) && pieceIds.includes(right.piece.id));
  const guidePlacement = guidePlacementTargets(project).find(({ memberIds }) => memberIds.includes(left.piece.id) && memberIds.includes(right.piece.id));
  const fit = previewFittedStock(project, {
    first: left.ref, second: right.ref, datumLocal: left.datumLocal,
    material: stock.id, rollDegrees: roll, clearanceA: 0, clearanceB: 0,
    sectionId: section?.id ?? null, stepId: left.piece.stepId,
    name: `Roof deck blocking · ${partLabel(project, left.piece.id)} to ${partLabel(project, right.piece.id)}`,
    ...(guidePlacement && { guidePlacement: { ownerId: guidePlacement.ownerId, stageKey: guidePlacement.stageKey } }),
  });
  const cut = planFittedStockSource(project, fit, reuse ? "on-hand" : "new-board", planOffcuts);
  const after = reviewShingleRoof(cut.project, cut.project.projectCode!.shingleRoof!).deckSpacing.joints.find(({ id }) => id === jointId);
  const reduction = (bay.joint.backing ?? []).map(({ gaps }, i) => gaps.reduce((sum, gap) => sum + gap.length, 0) -
    (after?.backing?.[i]?.gaps ?? gaps).reduce((sum, gap) => sum + gap.length, 0));
  if (reduction.some((length) => length <= tolerance))
    throw Error("The block must add contact beneath both fastener lines. Review the selected bay and panel joint.");
  return { ...cut, jointId, bayId, rafters: [left.piece.id, right.piece.id], reduction,
    outlines: retainedWoodFaces(cut.block).map(({ points }) => points),
    motionConflicts: fittedPartMotionConflicts(cut.project, cut.block.id) };
}

export function previewRoofDeckBlockingPlan(
  project: Project, jointId: string, bayIds: readonly string[], stockId: MaterialId, reuse: boolean,
) {
  const selected = new Set(bayIds);
  const bays = roofDeckBlockingBays(project, jointId)
    .filter(({ id }) => selected.has(id)).sort((a, b) => b.length - a.length);
  if (!bays.length || bays.length !== selected.size) throw Error("Choose current framing bays.");
  let next = project;
  const fits: (Omit<ReturnType<typeof previewRoofDeckBlocking>, "project"> & { fromPlan: boolean })[] = [];
  const skipped: { bayId: string; rafters: string[]; reason: string }[] = [];
  const planOffcuts = new Set<string>();
  for (const bay of bays) {
    try {
      const { project: fitted, ...fit } = previewRoofDeckBlocking(next, jointId, bay.id, stockId, reuse, planOffcuts);
      if (fit.motionConflicts.length) throw Error(`This block obstructs ${fit.motionConflicts.join(", ")}.`);
      const fromPlan = !!fit.source && planOffcuts.delete(fit.source.id);
      fits.push({ ...fit, fromPlan });
      next = fitted;
      for (const { id } of fit.offcuts) planOffcuts.add(id);
    } catch (problem) {
      skipped.push({ bayId: bay.id, rafters: [bay.left.piece.id, bay.right.piece.id],
        reason: problem instanceof Error ? problem.message : "Review the fit in this bay." });
    }
  }
  return {
    project: next, jointId, bayIds: [...selected], stockId, reuse, fits, skipped,
    offcuts: next.pieces.filter(({ id }) => planOffcuts.has(id)),
    outlines: fits.flatMap(({ outlines }) => outlines),
    newBoards: fits.filter(({ source }) => !source).length,
    onHandOffcuts: fits.filter(({ source, fromPlan }) => source && !fromPlan).length,
  };
}

export type RoofDeckBlockingPreview = ReturnType<typeof previewRoofDeckBlockingPlan>;
