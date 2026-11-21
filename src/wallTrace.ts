import { bom } from "./engine";
import { formatStockLength } from "./measurement";
import { applyCommand, framingStockDimensions, projectSchema, type Project, type V3 } from "./model";
import { planOffcutReuse } from "./offcutReusePlan";
import { prepareCollisionSolid, solidOverlap, type CollisionSolid } from "./solidCollision";
import type { wallFramingStockIds } from "./windowWall";

export type WallTracePoint = [x: number, z: number];
export type WallTrace = {
  a: WallTracePoint | null;
  b: WallTracePoint | null;
  height: number;
  elevation: number;
  startTrim: number;
  endTrim: number;
  alignment: "center" | "left" | "right";
  spacing: 12 | 16 | 24;
  stock: (typeof wallFramingStockIds)[number];
  reuse: boolean;
};

export const partitionFramingSource = "https://basc.pnnl.gov/resource-guides/advanced-framing-minimum-wall-studs";
export const partitionCodeSource = "https://codes.iccsafe.org/content/IRC2024P2/chapter-6-wall-construction";
const partitionScope = "Interior nonbearing framing. Verify wall function, floor and ceiling attachment, backing and fireblocking before building.";
const minimumPanel = 24;
const rounding = 1e-7;
const boundsIntersect = (first: CollisionSolid["bounds"], second: CollisionSolid["bounds"]) =>
  first.min.every((value, axis) => value <= second.max[axis] && second.min[axis] <= first.max[axis]);

export const emptyWallTrace = (): WallTrace => ({
  a: null, b: null, height: 96, elevation: 0, startTrim: 0, endTrim: 0,
  alignment: "center", spacing: 16, stock: "hd-kdht-2x4-8", reuse: true,
});

export function snapWallTracePoint(point: WallTracePoint, lines: Project["planLines"], enabled: boolean): WallTracePoint {
  if (!enabled) return point;
  let endpoint: WallTracePoint | undefined;
  let projection: WallTracePoint | undefined;
  let endpointDistance = 2;
  let projectionDistance = 2;
  for (const { a, b } of lines) {
    for (const [x, , z] of [a, b]) {
      const distance = Math.hypot(x - point[0], z - point[1]);
      if (distance <= endpointDistance) {
        endpoint = [x, z];
        endpointDistance = distance;
      }
    }
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const squared = dx * dx + dz * dz;
    if (squared <= rounding) continue;
    const fraction = Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[2]) * dz) / squared));
    const onLine: WallTracePoint = [a[0] + fraction * dx, a[2] + fraction * dz];
    const distance = Math.hypot(point[0] - onLine[0], point[1] - onLine[1]);
    if (distance <= projectionDistance) {
      projection = onLine;
      projectionDistance = distance;
    }
  }
  return endpoint ?? projection ?? [Math.round(point[0]), Math.round(point[1])];
}

export function reviewWallTrace(project: Project, trace: WallTrace) {
  const { a, b, height, elevation, startTrim, endTrim, stock, spacing, alignment } = trace;
  if (!a || !b) throw Error("Pick two points on the plan or enter their coordinates.");
  if (![...a, ...b, height, elevation, startTrim, endTrim].every(Number.isFinite))
    throw Error("Enter a number in each wall dimension and coordinate.");
  if (height < 12 || height > 120) throw Error("Set a wall height between 12 in and 10 ft.");
  if (startTrim < 0 || endTrim < 0 || elevation < 0) throw Error("Use zero or a positive length for trims and base elevation.");

  const dx = b[0] - a[0], dz = b[1] - a[1];
  const markedLength = Math.hypot(dx, dz);
  const runLength = markedLength - startTrim - endTrim;
  if (runLength < minimumPanel - rounding) throw Error("Leave at least 24 in of wall after trimming.");
  const { depth, length: stockLength } = framingStockDimensions(stock);
  if (height - 3 > stockLength + rounding)
    throw Error(`Each stud needs ${formatStockLength(height - 3)}. Choose longer lumber or shorten the wall.`);
  const count = Math.ceil((runLength - rounding) / stockLength);
  if (project.sections.length + count > 300 || project.steps.length + count > 500)
    throw Error("This run would exceed the project’s section or guide step limit. Shorten it or move it into a new project.");
  if (project.pieces.length + count * 4 > 2000)
    throw Error("This run would exceed the project’s part limit. Shorten it or move it into a new project.");

  const alongX = dx / markedLength, alongZ = dz / markedLength;
  const offset = alignment === "left" ? depth / 2 : alignment === "right" ? -depth / 2 : 0;
  const at = (distance: number, side = 0): V3 => [
    a[0] + alongX * distance - alongZ * (offset + side),
    elevation,
    a[1] + alongZ * distance + alongX * (offset + side),
  ];
  const rotation: V3 = [0, -Math.atan2(dz, dx), 0];
  const footprints: V3[][] = [];
  const lengths: number[] = [];
  let candidate = project;
  let distance = startTrim;
  let remaining = runLength;
  for (let index = 0; index < count; index++) {
    const width = Math.max(minimumPanel, Math.min(stockLength, remaining - (count - index - 1) * minimumPanel));
    const end = distance + width;
    footprints.push([at(distance, -depth / 2), at(end, -depth / 2), at(end, depth / 2), at(distance, depth / 2), at(distance, -depth / 2)]);
    lengths.push(width);
    candidate = applyCommand(candidate, { type: "wall", width, height, depth: 48, spacing, wallStock: stock }, undefined, {
      origin: at(distance + width / 2),
      rotation,
      stepNotes: count === 1 ? partitionScope : `${partitionScope} Dry-fit this panel against ${index === 0 ? "the next panel" : "the preceding panel"} at the paired end studs. Establish the plate joint and its backing before fastening.`,
    });
    remaining -= width;
    distance = end;
  }
  candidate = projectSchema.parse(candidate);
  const added = candidate.pieces.slice(project.pieces.length);
  const prepared = added.map((piece) => prepareCollisionSolid(piece)!);
  const obstructions = project.pieces.flatMap((piece) => {
    if (piece.offcut) return [];
    const solid = prepareCollisionSolid(piece);
    return solid && prepared.some((next) => boundsIntersect(solid.bounds, next.bounds) && solidOverlap(solid, next)) ? [piece] : [];
  });
  const zone = project.workZone;
  const outsideZone = !!zone && prepared.some(({ bounds: { min, max } }) =>
    min[0] < -zone.width / 2 - rounding || max[0] > zone.width / 2 + rounding ||
    min[1] < -rounding || max[1] > zone.height + rounding ||
    min[2] < -zone.depth / 2 - rounding || max[2] > zone.depth / 2 + rounding);
  const reuse = trace.reuse && !obstructions.length && project.pieces.some((piece) => piece.offcut && piece.material === stock)
    ? planOffcutReuse(candidate, undefined, new Set(added.map(({ id }) => id)))
    : null;
  const assigned = new Set(reuse?.assignments.map(({ partId }) => partId));
  const remainingCuts = added.filter(({ id }) => !assigned.has(id));
  const row = bom({ ...candidate, pieces: remainingCuts, joints: [] }).find(({ id }) => id === stock);
  return { candidate: reuse?.project ?? candidate, runLength, lengths, footprints, added, obstructions, outsideZone, reuse, row };
}
