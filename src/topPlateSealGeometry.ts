import { Euler, Matrix4, Vector3 } from "three";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { isDrywall } from "./drywallReference";
import { material, type Piece, type Project, type V3 } from "./model";
import { sillPlateFootprint } from "./sillGaskets";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";
import type { TopPlateInput } from "./topPlateSealSchema";

const tolerance = 0.001;
type Interval = { start: number; end: number };
type Backing = Interval & { id: string; gap: number };
type Blocker = Interval & { id: string; name: string };
const clean = (value: number) => Number(value.toFixed(5));

export function topPlateLayout(project: Project, input: TopPlateInput) {
  const plate = project.pieces.find(({ id }) => id === input.plateId);
  const footprint = plate && sillPlateFootprint(plate);
  if (!plate || !footprint || footprint.length < footprint.width)
    throw Error("Choose a long, horizontal rectangular wood top plate.");
  const { along, across, length, width } = footprint;
  const sign = input.side === "a" ? -1 : 1;
  const tangent = new Vector3(...along);
  const outward = new Vector3(...across).multiplyScalar(sign);
  const vertical = new Vector3(0, 1, 0);
  const start = new Vector3(...plate.position).addScaledVector(tangent, -length / 2)
    .addScaledVector(outward, width / 2);
  const bead = bottomPlateSealant.size[input.bead];
  const at = (distance: number, gap = 0): V3 =>
    start.clone().addScaledVector(tangent, distance).addScaledVector(outward, gap).toArray();
  if (plate.position[1] - footprint.bottom < bead / 2 - tolerance)
    throw Error("The top plate face does not have room for this bead size.");
  const ends = [at(0), at(length)] as [V3, V3];
  const nearby = project.pieces.filter((piece) => {
    if (piece.offcut || piece.id === plate.id) return false;
    const radius = Math.hypot(...piece.size) / 2;
    const delta = new Vector3(...piece.position).sub(start);
    const distance = delta.dot(tangent);
    return distance + radius > 0 && distance - radius < length &&
      Math.abs(delta.dot(outward)) <= radius + bead + tolerance &&
      Math.abs(delta.y) <= radius + bead;
  });
  const directions = (piece: Piece) => ([0, 1, 2] as const).map((axis) =>
    new Vector3(...rotate([0, 1, 2].map((i) => Number(i === axis)) as V3, piece.rotation)));
  const span = (piece: Piece, axes: Vector3[], direction: Vector3) => {
    const center = new Vector3(...piece.position).sub(start).dot(direction);
    const half = piece.size.reduce((sum, value, axis) => sum + value * Math.abs(axes[axis].dot(direction)) / 2, 0);
    return { start: center - half, end: center + half };
  };
  const onPlate = ({ start, end }: Interval): Interval =>
    ({ start: Math.max(0, start), end: Math.min(length, end) });
  const backing: Backing[] = nearby.flatMap((panel) => {
    if (!isDrywall(panel.material) || panel.cutPlanes.length || pieceThroughOpenings(panel).length) return [];
    const axes = directions(panel);
    const { thickness } = stockAxes(panel);
    if (Math.abs(panel.size[thickness] - 0.5) > tolerance) return [];
    const normal = axes[thickness];
    if (Math.abs(normal.dot(outward)) < 1 - 1e-7) return [];
    if (!axes.some((axis) => Math.abs(axis.dot(vertical)) > 1 - 1e-7)) return [];
    const height = span(panel, axes, vertical);
    if (height.start > -bead / 2 + tolerance || height.end < bead / 2 - tolerance) return [];
    const gap = span(panel, axes, outward).start;
    if (gap < -tolerance || gap > bead + tolerance) return [];
    const interval = onPlate(span(panel, axes, tangent));
    return interval.end - interval.start > tolerance ? [{ ...interval, id: panel.id, gap: Math.max(0, gap) }] : [];
  });
  const backingIds = new Set(backing.map(({ id }) => id));
  const orientation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(tangent, vertical, tangent.clone().cross(vertical)));
  const aisle = prepareCollisionBox([length, bead, bead], at(length / 2, bead / 2),
    [orientation.x, orientation.y, orientation.z]);
  const blockers: Blocker[] = nearby.flatMap((piece) => {
    if (backingIds.has(piece.id) || material(piece.material).stockKind === "fastener") return [];
    const box = prepareCollisionBox(piece.size, piece.position, piece.rotation);
    if (!solidOverlap(aisle, box)) return [];
    const solid = prepareCollisionSolid(piece);
    if (solid && !solidOverlap(aisle, solid)) return [];
    const interval = onPlate(span(piece, directions(piece), tangent));
    return interval.end - interval.start > tolerance ? [{ ...interval, id: piece.id, name: piece.name }] : [];
  });
  const stations = [...new Set([0, length, ...[...backing, ...blockers].flatMap(({ start, end }) => [start, end])].map(clean))]
    .sort((a, b) => a - b);
  const runs = stations.slice(1).flatMap((end, index) => {
    const distance = stations[index], center = (distance + end) / 2;
    if (end - distance <= tolerance) return [];
    const covers = ({ start, end }: Interval) => start - tolerance < center && end + tolerance > center;
    const supports = backing.filter(covers);
    const panel = supports[0], blocker = blockers.find(covers);
    const problem = !panel ? "Drywall does not cover the bead band here." :
      supports.length > 1 ? "Drywall faces overlap here. Review the panel joint." :
      blocker ? `Bead space is blocked by ${blocker.name}.` :
      panel.gap > input.gap + tolerance ? "The modeled gap exceeds the entered measurement." : "";
    return [{
      start: distance, end, length: end - distance, panelId: panel?.id,
      panelIds: supports.map(({ id }) => id).sort(),
      gap: panel ? clean(panel.gap) : null, blockerId: blocker?.id, problem,
      points: [at(distance), at(end)] as [V3, V3],
    }];
  });
  const signature = JSON.stringify([plate.material, clean(width), clean(plate.position[1] - footprint.bottom),
    runs.map(({ start, end, panelIds, gap, blockerId }) => [start, end, panelIds, gap, blockerId])]);
  return { plate, ends, runs, signature, length, clearLength: runs.reduce((sum, run) => sum + (run.problem ? 0 : run.length), 0) };
}
