import { Euler, Matrix4, Vector3 } from "three";
import { retainedWoodFaces } from "./connectionContacts";
import { convexHull } from "./convexHull";
import { polygonCover, subtractCover, type CoveragePolygon } from "./depthCoverage";
import { material, type Project, type V3 } from "./model";
import { plateSeamOpeningIssue, plateSeamOpeningRuns } from "./plateSeamOpenings";
import { sillPlateFootprint } from "./sillGaskets";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { bottomPlateSealant } from "./bottomPlateSealReference";
import type { BottomPlateInput } from "./bottomPlateSealSchema";

const epsilon = 0.001;
type Interval = { start: number; end: number };
type Deck = Interval & { id: string; gap: number; materialId: string };
type Obstruction = Interval & { id: string; name: string };

function bounds(points: number[]): Interval | undefined {
  const start = Math.min(...points), end = Math.max(...points);
  return end - start > epsilon ? { start, end } : undefined;
}

function sectionAt(outline: [number, number][], offset: number) {
  const hits: number[] = [];
  for (const [i, [x, z]] of outline.entries()) {
    const [nextX, nextZ] = outline[(i + 1) % outline.length];
    if (Math.abs(z - offset) < 1e-7) hits.push(x);
    if ((z < offset && nextZ > offset) || (z > offset && nextZ < offset))
      hits.push(x + (nextX - x) * (offset - z) / (nextZ - z));
  }
  return bounds(hits);
}

/** Keep stations where the full bead band is backed by one panel at one elevation. */
function backedIntervals(outlines: CoveragePolygon[], length: number, low: number, high: number) {
  if (outlines.length === 1) {
    const acrossLow = sectionAt(outlines[0], low);
    const acrossHigh = sectionAt(outlines[0], high);
    if (!acrossLow || !acrossHigh) return [];
    const start = Math.max(0, acrossLow.start, acrossHigh.start);
    const end = Math.min(length, acrossLow.end, acrossHigh.end);
    return end - start > epsilon ? [{ start, end }] : [];
  }

  // Through-cuts divide the retained top into convex faces. Subtract all of
  // them before measuring the breaks so their shared edges do not count as holes.
  let uncovered: CoveragePolygon[] = [[[0, low], [length, low], [length, high], [0, high]]];
  for (const outline of outlines) {
    if (!uncovered.length) break;
    const hull = convexHull(outline);
    if (hull.length < 3) continue;
    const cover = polygonCover(hull);
    uncovered = uncovered.flatMap((region) => subtractCover(region, cover));
  }
  const gaps = uncovered.flatMap((region) => {
    const span = bounds(region.map(([x]) => x));
    return span ? [span] : [];
  }).sort((a, b) => a.start - b.start);
  const intervals: Interval[] = [];
  let from = 0;
  for (const gap of gaps) {
    if (gap.start - from > epsilon) intervals.push({ start: from, end: gap.start });
    from = Math.max(from, gap.end);
  }
  if (length - from > epsilon) intervals.push({ start: from, end: length });
  return intervals;
}

export function bottomPlateLayout(project: Project, input: BottomPlateInput) {
  const plate = project.pieces.find(({ id }) => id === input.plateId);
  const footprint = plate && sillPlateFootprint(plate);
  if (!plate || !footprint || footprint.length < footprint.width)
    throw Error("Choose a horizontal rectangular wood bottom plate with an identifiable long side.");
  const { bottom, along, across, length, width } = footprint;
  const sign = input.side === "a" ? -1 : 1;
  const edge = sign * width / 2;
  const bead = bottomPlateSealant.size[input.bead];
  const underside = bottom - plate.position[1];
  const interruptedWood = plateSeamOpeningRuns(plate, footprint, sign, [underside, underside + bead]);
  const start = new Vector3(plate.position[0], bottom, plate.position[2])
    .addScaledVector(new Vector3(...along), -length / 2);
  const u = new Vector3(...along), v = new Vector3(...across);
  const at = (distance: number, offset = edge, elevation = bottom): V3 =>
    start.clone().addScaledVector(u, distance).addScaledVector(v, offset).setY(elevation).toArray();
  const ends = [at(0), at(length)] as [V3, V3];
  const nearby = project.pieces.filter((piece) => {
    if (piece.offcut || piece.id === plate.id) return false;
    const radius = Math.hypot(...piece.size) / 2;
    const delta = new Vector3(...piece.position).sub(start);
    const distance = delta.dot(u);
    return distance + radius > 0 && distance - radius < length &&
      Math.abs(delta.dot(v) - edge) <= radius + bead &&
      Math.abs(delta.y) <= radius + bottomPlateSealant.maxWidth + bead;
  });
  const deck: Deck[] = nearby.flatMap((piece) => {
    const stock = material(piece.material);
    if (!stock.wood || stock.stockKind !== "sheet") return [];
    const levels = new Map<number, { gap: number; outlines: CoveragePolygon[] }>();
    for (const { normal, points } of retainedWoodFaces(piece)) {
      if (normal[1] < 1 - 1e-7 || points.some((point) => Math.abs(point[1] - points[0][1]) > epsilon)) continue;
      const gap = bottom - points[0][1];
      if (gap < -epsilon || gap > bottomPlateSealant.maxWidth + epsilon) continue;
      const outline = points.map((point): [number, number] => {
        const delta = new Vector3(...point).sub(start);
        return [delta.dot(u), delta.dot(v)];
      });
      const key = Number(gap.toFixed(5));
      const level = levels.get(key) ?? { gap: Math.max(0, gap), outlines: [] };
      level.outlines.push(outline);
      levels.set(key, level);
    }
    return [...levels.values()].flatMap(({ gap, outlines }) =>
      backedIntervals(outlines, length, edge - bead / 2, edge + bead / 2).map((hit) =>
        ({ ...hit, id: piece.id, materialId: piece.material, gap })));
  });
  const y = new Vector3(0, 1, 0);
  const orientation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(u, y, u.clone().cross(y)));
  const aisle = prepareCollisionBox([length, bead, bead],
    at(length / 2, edge + sign * bead / 2, bottom + bead / 2), [orientation.x, orientation.y, orientation.z]);
  const obstructions: Obstruction[] = nearby.flatMap((piece) => {
    const stock = material(piece.material);
    // Loose hardware is addressed separately and does not close off a whole bead path.
    if (stock.stockKind === "fastener") return [];
    const envelope = prepareCollisionBox(piece.size, piece.position, piece.rotation);
    if (!solidOverlap(aisle, envelope)) return [];
    const solid = prepareCollisionSolid(piece);
    if (solid && !solidOverlap(aisle, solid)) return [];
    const center = new Vector3(...piece.position).sub(start).dot(u);
    const half = piece.size.reduce((total, size, axis) => {
      const direction = rotate([0, 1, 2].map((i) => Number(i === axis)) as V3, piece.rotation);
      return total + size / 2 * Math.abs(new Vector3(...direction).dot(u));
    }, 0);
    const hit = { start: Math.max(0, center - half), end: Math.min(length, center + half) };
    return hit.end - hit.start > epsilon ? [{ ...hit, id: piece.id, name: piece.name }] : [];
  });
  const positions = [...new Set([0, length, ...[...deck, ...obstructions, ...interruptedWood].flatMap(({ start, end }) => [start, end])]
    .map((value) => Number(value.toFixed(5))))].sort((a, b) => a - b);
  const runs = positions.slice(1).flatMap((end, i) => {
    const from = positions[i], center = (from + end) / 2;
    if (end - from <= epsilon) return [];
    const covers = ({ start, end }: Interval) => start - epsilon < center && end + epsilon > center;
    const supports = deck.filter(covers).sort((a, b) => a.gap - b.gap || a.id.localeCompare(b.id));
    const blocker = obstructions.find(covers);
    const woodMissing = interruptedWood.some(covers);
    const problem = woodMissing ? plateSeamOpeningIssue :
      !supports.length ? "Subfloor backing or edge room is missing." :
      blocker ? `Bead access is blocked by ${blocker.name}.` :
      supports[0].gap > input.gap + epsilon ? "The model gap exceeds the entered measurement." : "";
    return [{
      start: from, end, length: end - from, panelId: supports[0]?.id, panelMaterial: supports[0]?.materialId, actualGap: supports[0]?.gap ?? null,
      blockerId: blocker?.id, woodMissing, problem, points: [at(from), at(end)] as [V3, V3],
    }];
  });
  const signature = JSON.stringify([plate.material, runs.map(({ start, end, panelId, panelMaterial, actualGap, blockerId, woodMissing }) =>
    [start, end, panelId, panelMaterial, actualGap === null ? null : Number(actualGap.toFixed(5)), blockerId, ...(woodMissing ? [true] : [])])]);
  return { plate, ends, runs, signature, length, clearLength: runs.reduce((total, run) => total + (run.problem ? 0 : run.length), 0) };
}
