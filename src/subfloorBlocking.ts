import { Vector3 } from "three";
import { retainedWoodFaces } from "./connectionContacts";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import { fittedStockFaces, previewFittedStock } from "./fittedStock";
import { planFittedStockSource } from "./fittedStockSource";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { subfloorReviews, type SubfloorBlockingBay } from "./subfloor";

const tolerance = 0.00001;
const vector = (point: V3) => new Vector3(...point);
const localPoint = (point: Vector3, piece: Piece) => rotate(point.clone().sub(vector(piece.position)).toArray(), inverseRotation(piece.rotation));
export function previewSubfloorBlocking(
  project: Project,
  panelId: string,
  bayId: string,
  placement: "under-sheet" | "centered",
  source: "prefer-offcut" | "new-board",
) {
  const current = subfloorReviews(project, [panelId])[0]?.layout;
  const bay = current?.blocking.find(({ id }) => id === bayId);
  if (!current || !bay) throw Error("This blocking bay changed. Choose a current unsupported bay.");
  const { piece: panel } = current;
  const { first, second, points, inward } = bay;
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  if ([panel, first, second].some(({ id, designRole }) => moving.has(id) || designRole === "seat-lid"))
    throw Error("Choose a stationary sheet and joists for fitted subfloor blocking.");
  const stock = material(first.material);
  const [thickness, depth] = [...stock.size].sort((a, b) => a - b);
  if (!stock.cuttable || stock.stockKind !== "linear" || stock.shape || thickness < 1.5 - tolerance)
    throw Error("Choose a bay between solid, nominal 2-inch sawn framing members to fit blocking from matching stock.");
  const [a, b] = points.map(vector);
  const direction = b.clone().sub(a).normalize();
  const findFace = (joist: Piece, toward: Vector3, plane: Vector3) => fittedStockFaces(project, joist.id).find(({ normalWorld, centerWorld }) =>
    vector(normalWorld).distanceTo(toward) <= tolerance && Math.abs(vector(centerWorld).sub(plane).dot(toward)) <= tolerance);
  const left = findFace(first, direction, a), right = findFace(second, direction.clone().negate(), b);
  if (!left || !right) throw Error("This bay needs two square, opposing joist faces at the measured gap.");
  const bottom = panel.position[1] - panel.size[stockAxes(panel).thickness] / 2;
  const datum = a.clone().addScaledVector(vector(inward), placement === "under-sheet" ? thickness / 2 : 0).setY(bottom - depth / 2);
  const { length: axis } = stockAxes({ ...first, size: stock.size, stockLengthAxis: null, cutStock: null });
  const tangentAxis = [0, 1, 2].sort((x, y) => Math.abs(left.normalLocal[x]) - Math.abs(left.normalLocal[y]) || x - y)[0];
  const tangent: V3 = [0, 0, 0];
  tangent[tangentAxis] = 1;
  const uVertical = Math.abs(rotate(tangent, first.rotation)[1]) > 0.5;
  const needUVertical = stock.size[(axis + 1) % 3] > stock.size[(axis + 2) % 3];
  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(first.id) && pieceIds.includes(second.id));
  const fit = previewFittedStock(project, {
    first: left.ref, second: right.ref, datumLocal: localPoint(datum, first), material: stock.id,
    rollDegrees: uVertical === needUVertical ? 0 : 90, clearanceA: 0, clearanceB: 0, sectionId: section?.id ?? null,
    stepId: first.stepId, name: `Subfloor blocking · ${partLabel(project, first.id)} to ${partLabel(project, second.id)}`,
  });
  const planned = planFittedStockSource(project, fit, source);
  const after = subfloorReviews(planned.project, [panelId])[0]?.layout;
  if (!after || after.blocking.some(({ id }) => id === bayId) || stillMissing(after.edges, bay))
    throw Error("The model still shows a break across this bay. Review the sheet edge and the block’s top contact.");
  return {
    ...planned, panelId, bay,
    outlines: retainedWoodFaces(planned.block).map(({ points }) => points),
    motionConflicts: fittedPartMotionConflicts(planned.project, planned.block.id),
  };
}

function stillMissing(edges: NonNullable<ReturnType<typeof subfloorReviews>[number]["layout"]>["edges"], bay: SubfloorBlockingBay) {
  const start = vector(bay.points[0]);
  const direction = vector(bay.points[1]).sub(start).normalize();
  return edges.some(({ problem, name, points }) => problem && name === bay.edge &&
    vector(points[1]).sub(start).dot(direction) > tolerance &&
    vector(points[0]).sub(start).dot(direction) < bay.length - tolerance);
}

export type SubfloorBlockingPreview = ReturnType<typeof previewSubfloorBlocking>;
