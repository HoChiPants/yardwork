import { Line3, Vector3 } from "three";
import type { FastenerReview, ReviewedFastenerLocation } from "./fastenings";
import type { V3 } from "./model";

const tolerance = 1e-6;
const axes = [0, 1, 2] as const;
type Path = { line: Line3; direction: Vector3; length: number; radius: number };
type Entry = {
  review: FastenerReview;
  location: ReviewedFastenerLocation;
  paths: Path[];
  min: V3;
  max: V3;
};
type Conflict = {
  entry: Entry;
  other: Entry;
  memberId: string;
  crossing: boolean;
};

/** Check all four endpoint projections and the interior line minimum if it lies on both segments. */
function segmentDistanceSquared(first: Path, second: Path) {
  const a = first.line, b = second.line;
  const closest = new Vector3();
  const boundary = Math.min(
    a.closestPointToPoint(b.start, true, closest).distanceToSquared(b.start),
    a.closestPointToPoint(b.end, true, closest).distanceToSquared(b.end),
    b.closestPointToPoint(a.start, true, closest).distanceToSquared(a.start),
    b.closestPointToPoint(a.end, true, closest).distanceToSquared(a.end),
  );
  const normal = first.direction.clone().cross(second.direction);
  const scale = normal.lengthSq();
  if (scale < 1e-24) return boundary;
  const origin = b.start.clone().sub(a.start);
  const u = origin.clone().cross(second.direction).dot(normal) / scale;
  const v = origin.cross(first.direction).dot(normal) / scale;
  if (u < 0 || v < 0 || u > first.length || v > second.length) return boundary;
  return Math.min(boundary, a.start.clone().addScaledVector(first.direction, u)
    .distanceToSquared(b.start.clone().addScaledVector(second.direction, v)));
}

function memberPaths(review: FastenerReview, location: ReviewedFastenerLocation) {
  const { entranceWorld, driveWorld, headExitDepth, receiverEnterDepth, receiverExitDepth, pathDimensions } = location;
  if (!location.includedInDemand || !pathDimensions || !entranceWorld || !driveWorld ||
    headExitDepth === null || receiverEnterDepth === null || receiverExitDepth === null) return [];
  const origin = new Vector3(...entranceWorld);
  const direction = new Vector3(...driveWorld).normalize();
  const ranges = [
    { memberId: review.plan.head.pieceId, start: 0, end: headExitDepth },
    { memberId: review.plan.receiver.pieceId, start: receiverEnterDepth, end: receiverExitDepth },
  ];
  const { screwDepth, pilotDepth, pilotDiameter } = pathDimensions;
  return ranges.flatMap(({ memberId, start, end }) => {
    const paths: Path[] = [];
    const add = (depth: number | null, radius: number) => {
      if (depth === null) return;
      const stop = Math.min(end, depth);
      if (stop <= start + tolerance) return;
      paths.push({
        line: new Line3(origin.clone().addScaledVector(direction, start), origin.clone().addScaledVector(direction, stop)),
        direction, length: stop - start, radius,
      });
    };
    add(screwDepth, 0);
    add(pilotDepth, (pilotDiameter ?? 0) / 2);
    if (!paths.length) return [];
    const entry: Entry = {
      review, location, paths,
      min: axes.map((i) => Math.min(...paths.map(({ line, radius }) =>
        Math.min(line.start.getComponent(i), line.end.getComponent(i)) - radius))) as V3,
      max: axes.map((i) => Math.max(...paths.map(({ line, radius }) =>
        Math.max(line.start.getComponent(i), line.end.getComponent(i)) + radius))) as V3,
    };
    return [{ memberId, entry }];
  });
}

function sweepAxis(entries: Entry[]) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const { min, max } of entries)
    for (const axis of axes) {
      const center = (min[axis] + max[axis]) / 2;
      low[axis] = Math.min(low[axis], center);
      high[axis] = Math.max(high[axis], center);
    }
  const spread = high.map((value, i) => value - low[i]);
  return axes.reduce((a, b) => spread[a] >= spread[b] ? a : b);
}

export function findFastenerPathConflicts(reviews: readonly FastenerReview[]): Conflict[] {
  const byMember = new Map<string, Entry[]>();
  for (const review of reviews)
    for (const location of review.locations)
      for (const { memberId, entry } of memberPaths(review, location)) {
        const list = byMember.get(memberId) ?? [];
        list.push(entry);
        byMember.set(memberId, list);
      }
  const conflicts = new Map<ReviewedFastenerLocation, Conflict>();
  for (const [memberId, entries] of byMember) {
    if (entries.length < 2) continue;
    const axis = sweepAxis(entries);
    entries.sort((a, b) => a.min[axis] - b.min[axis]);
    for (let i = 0; i < entries.length - 1; i++) {
      const entry = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        const other = entries[j];
        if (other.min[axis] > entry.max[axis] + tolerance) break;
        if (conflicts.has(entry.location) && conflicts.has(other.location)) continue;
        if (axes.some((k) => other.max[k] < entry.min[k] - tolerance || other.min[k] > entry.max[k] + tolerance)) continue;
        let overlaps = false, crossing = false;
        for (const a of entry.paths)
          for (const b of other.paths) {
            const distance = segmentDistanceSquared(a, b);
            overlaps ||= distance <= (a.radius + b.radius + tolerance) ** 2;
            crossing ||= distance <= tolerance ** 2;
          }
        if (!overlaps) continue;
        if (!conflicts.has(entry.location)) conflicts.set(entry.location, { entry, other, memberId, crossing });
        if (!conflicts.has(other.location)) conflicts.set(other.location, { entry: other, other: entry, memberId, crossing });
      }
    }
  }
  return [...conflicts.values()];
}
