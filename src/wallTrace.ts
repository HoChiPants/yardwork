import { bom, bounds } from "./engine";
import { formatStockLength } from "./measurement";
import { applyCommand, framingStockDimensions, projectSchema, uid, type Project, type V3 } from "./model";
import { planOffcutReuse } from "./offcutReusePlan";
import { prepareCollisionSolid, solidOverlap, type CollisionSolid } from "./solidCollision";
import type { PlanOutline } from "./planOutlines";
import type { wallFramingStockIds } from "./windowWall";
import type { FramedWallDimensions } from "./framedWallRequest";

export type WallTracePoint = [x: number, z: number];
export type OutlineFace = "center" | "inside" | "outside";
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

export const wallTraceStockChoices = [
  "hd-kdht-2x4-8", "hd-spf-2x4-10", "hd-spf-2x4-12", "hd-spf-2x6-8", "hd-spf-2x6-10", "hd-spf-2x6-12",
] as const;

export function wallTraceFromDimensions(project: Project, { width, height, spacing, lumber }: FramedWallDimensions): WallTrace {
  const pieces = project.pieces.filter(({ offcut }) => !offcut);
  const start = pieces.length ? Math.max(...pieces.map((piece) => bounds(piece).max[0])) + 12 : -width / 2;
  const depth = lumber === "2x6" ? 5.5 : 3.5;
  const choices = wallTraceStockChoices.filter((id) => framingStockDimensions(id).depth === depth);
  const stock = choices.find((id) => framingStockDimensions(id).length >= Math.max(width, height - 3)) ?? choices.at(-1)!;
  return { ...emptyWallTrace(), a: [start, 0], b: [start + width, 0], height, spacing, stock };
}

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
  const { a, b, startTrim, endTrim, alignment } = trace;
  if (!a || !b) throw Error("Pick two points on the plan or enter their coordinates.");
  if (![...a, ...b, startTrim, endTrim].every(Number.isFinite))
    throw Error("Enter a number in each wall dimension and coordinate.");
  if (startTrim < 0 || endTrim < 0) throw Error("Use zero or a positive length for trims.");
  return reviewFraming(project, trace, [{ a, b, startTrim, endTrim, alignment }]);
}

type WallRun = {
  a: WallTracePoint;
  b: WallTracePoint;
  startTrim: number;
  endTrim: number;
  alignment: WallTrace["alignment"];
  cornerNote?: string;
};

export function reviewWallOutline(project: Project, trace: WallTrace, outline: PlanOutline, face: OutlineFace) {
  const depth = framingStockDimensions(trace.stock).depth;
  const { points } = outline;
  const directions = points.map(([x, z], index): WallTracePoint => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - x, dz = next[1] - z;
    const length = Math.hypot(dx, dz);
    return [dx / length, dz / length];
  });
  const faceOffset = face === "center" ? 0 : face === "inside" ? -depth / 2 : depth / 2;
  const corners = points.map(([x, z], index): WallTracePoint => {
    const [beforeX, beforeZ] = directions[(index + points.length - 1) % points.length];
    const [afterX, afterZ] = directions[index];
    const offset = faceOffset / (1 + beforeX * afterX + beforeZ * afterZ);
    return [x - offset * (beforeZ + afterZ), z + offset * (beforeX + afterX)];
  });
  const runs = corners.map((a, index): WallRun => {
    const b = corners[(index + 1) % corners.length];
    const [dx, dz] = directions[index];
    // Alternate through-walls with walls that butt into their faces at both ends.
    const trim = index % 2 === 0 ? -depth / 2 : depth / 2;
    if ((b[0] - a[0]) * dx + (b[1] - a[1]) * dz - 2 * trim < minimumPanel - rounding)
      throw Error(`Wall ${index + 1} has less than 24 in available at its corners. Adjust the face alignment, choose narrower lumber, or trace it by hand.`);
    const previous = (index + corners.length - 1) % corners.length + 1;
    const next = (index + 1) % corners.length + 1;
    return { a, b, startTrim: trim, endTrim: trim, alignment: "center", cornerNote:
      `Room wall ${index + 1} of ${corners.length}. ${index % 2 === 0
        ? `Walls ${previous} and ${next} butt into this wall’s side faces.`
        : `Butt this wall into the side faces of walls ${previous} and ${next}.`} Dry-fit both corners and confirm fastening and finish backing.` };
  });
  return reviewFraming(project, trace, runs, uid());
}

function reviewFraming(project: Project, trace: WallTrace, runs: WallRun[], roomId?: string) {
  const { height, elevation, stock, spacing } = trace;
  if (!Number.isFinite(height) || !Number.isFinite(elevation)) throw Error("Enter a number for wall height and base elevation.");
  if (height < 12 || height > 120) throw Error("Set a wall height between 12 in and 10 ft.");
  if (elevation < 0) throw Error("Use zero or a positive base elevation.");

  const { depth, length: stockLength } = framingStockDimensions(stock);
  if (height - 3 > stockLength + rounding)
    throw Error(`Each stud needs ${formatStockLength(height - 3)}. Choose longer lumber or shorten the wall.`);
  const frames = runs.map((run, index) => {
    const dx = run.b[0] - run.a[0], dz = run.b[1] - run.a[1];
    const markedLength = Math.hypot(dx, dz);
    const length = markedLength - run.startTrim - run.endTrim;
    if (length < minimumPanel - rounding) throw Error("Leave at least 24 in of wall after trimming.");
    return { ...run, dx, dz, markedLength, length, wall: index + 1, count: Math.ceil((length - rounding) / stockLength) };
  });
  const panelCount = frames.reduce((count, frame) => count + frame.count, 0);
  if (project.sections.length + panelCount > 300 || project.steps.length + panelCount > 500)
    throw Error("This layout would exceed the project’s section or guide step limit. Shorten it or move it into a new project.");
  if (project.pieces.length + panelCount * 4 > 2000)
    throw Error("This layout would exceed the project’s part limit. Shorten it or move it into a new project.");

  const footprints: V3[][] = [];
  const lengths: number[] = [];
  let candidate = project;
  const buildOrder = runs.length > 1
    ? [...frames.filter((_, index) => index % 2 === 0), ...frames.filter((_, index) => index % 2 !== 0)]
    : frames;
  for (const { a, dx, dz, markedLength, length, wall, count, startTrim, alignment, cornerNote } of buildOrder) {
    const alongX = dx / markedLength, alongZ = dz / markedLength;
    const offset = alignment === "left" ? depth / 2 : alignment === "right" ? -depth / 2 : 0;
    const at = (distance: number, side = 0): V3 => [
      a[0] + alongX * distance - alongZ * (offset + side), elevation,
      a[1] + alongZ * distance + alongX * (offset + side),
    ];
    const rotation: V3 = [0, -Math.atan2(dz, dx), 0];
    let distance = startTrim;
    let remaining = length;
    for (let index = 0; index < count; index++) {
      const width = Math.max(minimumPanel, Math.min(stockLength, remaining - (count - index - 1) * minimumPanel));
      const end = distance + width;
      footprints.push([at(distance, -depth / 2), at(end, -depth / 2), at(end, depth / 2), at(distance, depth / 2), at(distance, -depth / 2)]);
      lengths.push(width);
      const panelNote = count > 1 ? `Dry-fit this panel against ${index === 0 ? "the next panel" : "the preceding panel"} at the paired end studs. Establish the plate joint and its backing before fastening.` : "";
      candidate = applyCommand(candidate, { type: "wall", width, height, depth: 48, spacing, wallStock: stock }, undefined, {
        origin: at(distance + width / 2), rotation,
        stepNotes: [partitionScope, cornerNote, panelNote].filter(Boolean).join(" "),
        roomFraming: roomId ? { id: roomId, wall, walls: frames.length, panel: index + 1, panels: count } : undefined,
      });
      remaining -= width;
      distance = end;
    }
  }
  candidate = projectSchema.parse(candidate);
  const added = candidate.pieces.slice(project.pieces.length);
  const prepared = added.map((piece) => prepareCollisionSolid(piece)!);
  const obstructions = project.pieces.flatMap((piece) => {
    if (piece.offcut) return [];
    const solid = prepareCollisionSolid(piece);
    return solid && prepared.some((next) => boundsIntersect(solid.bounds, next.bounds) && solidOverlap(solid, next)) ? [piece] : [];
  });
  const hasInternalOverlap = runs.length > 1 && prepared.some((solid, index) =>
    prepared.slice(index + 1).some((next) => boundsIntersect(solid.bounds, next.bounds) && solidOverlap(solid, next)));
  const zone = project.workZone;
  const outsideZone = !!zone && prepared.some(({ bounds: { min, max } }) =>
    min[0] < -zone.width / 2 - rounding || max[0] > zone.width / 2 + rounding ||
    min[1] < -rounding || max[1] > zone.height + rounding ||
    min[2] < -zone.depth / 2 - rounding || max[2] > zone.depth / 2 + rounding);
  const reuse = trace.reuse && !obstructions.length && !hasInternalOverlap && project.pieces.some((piece) => piece.offcut && piece.material === stock)
    ? planOffcutReuse(candidate, undefined, new Set(added.map(({ id }) => id)))
    : null;
  const assigned = new Set(reuse?.assignments.map(({ partId }) => partId));
  const remainingCuts = added.filter(({ id }) => !assigned.has(id));
  const row = bom({ ...candidate, pieces: remainingCuts, joints: [] }).find(({ id }) => id === stock);
  const runLengths = frames.map(({ length }) => length);
  return { candidate: reuse?.project ?? candidate, runLength: runLengths.reduce((sum, length) => sum + length, 0), runLengths, lengths, footprints, added, obstructions, hasInternalOverlap, outsideZone, reuse, row };
}
