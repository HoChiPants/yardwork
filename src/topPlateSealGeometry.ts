import { Euler, Matrix4, Vector3 } from "three";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import { isDrywall } from "./drywallReference";
import { material, type Piece, type Project, type V3 } from "./model";
import { plateSeamOpeningIssue, plateSeamOpeningRuns } from "./plateSeamOpenings";
import { sillPlateFootprint } from "./sillGaskets";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { openingAxes, openingHalfSpans, pieceThroughOpenings } from "./throughOpenings";
import type { DrywallPlateFace, TopPlateInput } from "./topPlateSealSchema";

const tolerance = 0.001;
type Interval = { start: number; end: number };
type Backing = Interval & { id: string; gap: number };
type Blocker = Interval & { id: string; name: string };
const clean = (value: number) => Number(value.toFixed(5));

export function topPlateLayout(project: Project, input: TopPlateInput, face: DrywallPlateFace = "top") {
  const plate = project.pieces.find(({ id }) => id === input.plateId);
  const footprint = plate && sillPlateFootprint(plate);
  if (!plate || !footprint || footprint.length < footprint.width)
    throw Error(`Choose a long, horizontal rectangular wood ${face} plate.`);
  const { along, across, length, width } = footprint;
  const sign = input.side === "a" ? -1 : 1;
  const tangent = new Vector3(...along);
  const outward = new Vector3(...across).multiplyScalar(sign);
  const vertical = new Vector3(0, 1, 0);
  const start = new Vector3(...plate.position).addScaledVector(tangent, -length / 2)
    .addScaledVector(outward, width / 2);
  const bead = bottomPlateSealant.size[input.bead];
  const interruptedWood = plateSeamOpeningRuns(plate, footprint, sign, [-bead / 2, bead / 2]);
  const at = (distance: number, gap = 0): V3 =>
    start.clone().addScaledVector(tangent, distance).addScaledVector(outward, gap).toArray();
  if (plate.position[1] - footprint.bottom < bead / 2 - tolerance)
    throw Error(`The ${face} plate face does not have room for this bead size.`);
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
    if (!isDrywall(panel.material) || panel.cutPlanes.length) return [];
    const axes = directions(panel);
    const { thickness } = stockAxes(panel);
    const openings = pieceThroughOpenings(panel);
    if (openings.some(({ axis }) => axis !== thickness)) return [];
    if (Math.abs(panel.size[thickness] - 0.5) > tolerance) return [];
    const normal = axes[thickness];
    if (Math.abs(normal.dot(outward)) < 1 - 1e-7) return [];
    if (!axes.some((axis) => Math.abs(axis.dot(vertical)) > 1 - 1e-7)) return [];
    const height = span(panel, axes, vertical);
    if (height.start > -bead / 2 + tolerance || height.end < bead / 2 - tolerance) return [];
    // The lower edge should meet this plate's face while keeping the modeled floor clearance.
    if (face === "bottom" && height.start < footprint.bottom - plate.position[1] - tolerance) return [];
    const gap = span(panel, axes, outward).start;
    if (gap < -tolerance || gap > bead + tolerance) return [];
    let strips = [onPlate(span(panel, axes, tangent))];
    for (const opening of openings) {
      const [u, v] = openingAxes(opening.axis);
      const [a, b] = openingHalfSpans(opening);
      const center = new Vector3(...panel.position).sub(start)
        .addScaledVector(axes[u], opening.center[0]).addScaledVector(axes[v], opening.center[1]);
      const rise = Math.abs(axes[u].dot(vertical)) * a + Math.abs(axes[v].dot(vertical)) * b;
      if (Math.abs(center.dot(vertical)) - rise >= bead / 2 + tolerance) continue;
      // The rectangular screen also conservatively clears the full round opening.
      const reach = Math.abs(axes[u].dot(tangent)) * a + Math.abs(axes[v].dot(tangent)) * b;
      const left = center.dot(tangent) - reach, right = center.dot(tangent) + reach;
      strips = strips.flatMap(({ start, end }) => right <= start || left >= end ? [{ start, end }] : [
        { start, end: Math.min(end, left) }, { start: Math.max(start, right), end },
      ].filter((strip) => strip.end - strip.start > tolerance));
    }
    return strips.filter(({ start, end }) => end - start > tolerance)
      .map((interval) => ({ ...interval, id: panel.id, gap: Math.max(0, gap) }));
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
  const stations = [...new Set([0, length, ...[...backing, ...blockers, ...interruptedWood].flatMap(({ start, end }) => [start, end])].map(clean))]
    .sort((a, b) => a - b);
  const runs = stations.slice(1).flatMap((end, index) => {
    const distance = stations[index], center = (distance + end) / 2;
    if (end - distance <= tolerance) return [];
    const covers = ({ start, end }: Interval) => start - tolerance < center && end + tolerance > center;
    const supports = backing.filter(covers);
    const panel = supports[0], blocker = blockers.find(covers);
    const woodMissing = interruptedWood.some(covers);
    const problem = woodMissing ? plateSeamOpeningIssue :
      !panel ? "Drywall does not cover the bead band here." :
      supports.length > 1 ? "Drywall faces overlap here. Review the panel joint." :
      blocker ? `Bead space is blocked by ${blocker.name}.` :
      panel.gap > input.gap + tolerance ? "The modeled gap exceeds the entered measurement." : "";
    return [{
      start: distance, end, length: end - distance, panelId: panel?.id,
      panelIds: supports.map(({ id }) => id).sort(),
      gap: panel ? clean(panel.gap) : null, blockerId: blocker?.id, woodMissing, problem,
      points: [at(distance), at(end)] as [V3, V3],
    }];
  });
  const signature = JSON.stringify([plate.material, clean(width), clean(plate.position[1] - footprint.bottom),
    runs.map(({ start, end, panelIds, gap, blockerId, woodMissing }) =>
      [start, end, panelIds, gap, blockerId, ...(woodMissing ? [true] : [])])]);
  return { plate, ends, runs, signature, length, clearLength: runs.reduce((sum, run) => sum + (run.problem ? 0 : run.length), 0) };
}
