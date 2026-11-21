import type { Project } from "./model";
import type { WallTracePoint as Point } from "./wallTrace";

const tolerance = 0.001;
const edgeLimit = 24000;
const difference = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
type Segment = { a: Point; b: Point; delta: Point; length: number; cuts: number[] };

export type PlanOutline = {
  points: Point[];
  area: number;
  center: Point;
  width: number;
  depth: number;
};

/** Split true crossings, T-junctions and coincident runs into shared graph edges. */
function splitSegments(lines: Project["planLines"]): Segment[] {
  const segments = lines.flatMap(({ a: [x, , z], b: [u, , v] }): Segment[] => {
    const delta: Point = [u - x, v - z];
    const length = Math.hypot(...delta);
    return length > tolerance ? [{ a: [x, z], b: [u, v], delta, length, cuts: [] }] : [];
  });
  let cuts = 0;
  const addCut = (segment: Segment, fraction: number) => {
    const inset = tolerance / segment.length;
    if (fraction <= inset || fraction >= 1 - inset || segment.cuts.some((cut) => Math.abs(cut - fraction) <= inset)) return;
    if (segments.length + ++cuts > edgeLimit)
      throw Error("This drawing has too many line intersections to review together. Import the relevant portion or trace one wall at a time.");
    segment.cuts.push(fraction);
  };
  for (const [index, first] of segments.entries()) {
    for (let other = index + 1; other < segments.length; other++) {
      const second = segments[other];
      if ([0, 1].some((axis) =>
        Math.max(first.a[axis], first.b[axis]) < Math.min(second.a[axis], second.b[axis]) - tolerance ||
        Math.max(second.a[axis], second.b[axis]) < Math.min(first.a[axis], first.b[axis]) - tolerance)) continue;
      const offset = difference(second.a, first.a);
      const determinant = cross(first.delta, second.delta);
      if (Math.abs(determinant) <= first.length * second.length * 1e-10) {
        if (Math.abs(cross(offset, first.delta)) > first.length * tolerance) continue;
        for (const point of [second.a, second.b]) addCut(first, dot(difference(point, first.a), first.delta) / first.length ** 2);
        for (const point of [first.a, first.b]) addCut(second, dot(difference(point, second.a), second.delta) / second.length ** 2);
        continue;
      }
      const t = cross(offset, second.delta) / determinant;
      const u = cross(offset, first.delta) / determinant;
      const firstInset = tolerance / first.length, secondInset = tolerance / second.length;
      if (t >= -firstInset && t <= 1 + firstInset && u >= -secondInset && u <= 1 + secondInset) {
        addCut(first, t);
        addCut(second, u);
      }
    }
  }
  return segments;
}

function lineGraph(segments: Segment[]) {
  const points: Point[] = [];
  const neighbors: Set<number>[] = [];
  const buckets = new Map<string, number[]>();
  const node = (point: Point) => {
    const x = Math.floor(point[0] / tolerance), z = Math.floor(point[1] / tolerance);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const existing = buckets.get(`${x + i}:${z + j}`)?.find((id) => Math.hypot(...difference(point, points[id])) <= tolerance);
        if (existing !== undefined) return existing;
      }
    }
    const id = points.length;
    points.push(point);
    neighbors.push(new Set());
    const key = `${x}:${z}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(id);
    buckets.set(key, bucket);
    return id;
  };
  for (const { a, b, delta, cuts } of segments) {
    let from = node(a);
    for (const fraction of [...cuts.sort((left, right) => left - right), 1]) {
      const to = node(fraction === 1 ? b : [a[0] + fraction * delta[0], a[1] + fraction * delta[1]]);
      if (from !== to) {
        neighbors[from].add(to);
        neighbors[to].add(from);
      }
      from = to;
    }
  }
  return { points, neighbors };
}

/** Open tails and connecting lines cannot be the boundary of a room. */
function removeBridges(neighbors: Set<number>[]) {
  const visits = new Int32Array(neighbors.length);
  const earliest = new Int32Array(neighbors.length);
  let time = 0;
  for (const root of neighbors.keys()) {
    if (visits[root]) continue;
    visits[root] = earliest[root] = ++time;
    const queue = [{ id: root, parent: -1, edges: neighbors[root].values() }];
    while (queue.length) {
      const { id, parent, edges } = queue.at(-1)!;
      const next = edges.next();
      if (next.done) {
        queue.pop();
        if (parent < 0) continue;
        earliest[parent] = Math.min(earliest[parent], earliest[id]);
        if (earliest[id] > visits[parent]) {
          neighbors[parent].delete(id);
          neighbors[id].delete(parent);
        }
      } else if (next.value !== parent) {
        const target = next.value;
        if (visits[target]) earliest[id] = Math.min(earliest[id], visits[target]);
        else {
          visits[target] = earliest[target] = ++time;
          queue.push({ id: target, parent: id, edges: neighbors[target].values() });
        }
      }
    }
  }
}

function outlineForFace(face: Point[]): PlanOutline | null {
  const points = face.filter((point, index) => {
    const incoming = difference(point, face[(index + face.length - 1) % face.length]);
    const outgoing = difference(face[(index + 1) % face.length], point);
    return dot(incoming, outgoing) <= 0 || Math.abs(cross(incoming, outgoing)) > tolerance * Math.min(Math.hypot(...incoming), Math.hypot(...outgoing));
  });
  if (points.length < 4) return null;
  const relative = points.map((point) => difference(point, points[0]));
  let twiceArea = 0, centerX = 0, centerZ = 0;
  for (const [index, point] of relative.entries()) {
    const next = relative[(index + 1) % relative.length];
    const edge = difference(next, point);
    const after = difference(relative[(index + 2) % relative.length], next);
    if (Math.hypot(...edge) < 24 - tolerance ||
      Math.abs(dot(edge, after)) > tolerance * Math.min(Math.hypot(...edge), Math.hypot(...after))) return null;
    const contribution = cross(point, next);
    twiceArea += contribution;
    centerX += (point[0] + next[0]) * contribution;
    centerZ += (point[1] + next[1]) * contribution;
  }
  if (twiceArea <= 0) return null;
  const length = Math.hypot(...relative[1]);
  const orientation: Point = [relative[1][0] / length, relative[1][1] / length];
  const along = relative.map((point) => dot(point, orientation));
  const across = relative.map((point) => cross(orientation, point));
  return {
    points, area: twiceArea / 2,
    center: [points[0][0] + centerX / (3 * twiceArea), points[0][1] + centerZ / (3 * twiceArea)],
    width: Math.max(...along) - Math.min(...along), depth: Math.max(...across) - Math.min(...across),
  };
}

/** Enumerate the bounded right-angle faces, including those sharing a wall. */
export function detectPlanOutlines(lines: Project["planLines"]): PlanOutline[] {
  const { points, neighbors } = lineGraph(splitSegments(lines));
  removeBridges(neighbors);
  const ordered = neighbors.map((nodes, source) => [...nodes].sort((first, second) => {
    const [x, z] = difference(points[first], points[source]);
    const [u, v] = difference(points[second], points[source]);
    return Math.atan2(z, x) - Math.atan2(v, u);
  }));
  const visited = new Set<string>();
  const outlines: PlanOutline[] = [];
  for (const [start, edges] of ordered.entries()) {
    for (const next of edges) {
      let from = start, to = next;
      const face: number[] = [];
      while (!visited.has(`${from}:${to}`)) {
        visited.add(`${from}:${to}`);
        face.push(from);
        const turn = ordered[to];
        const following = turn[(turn.indexOf(from) + turn.length - 1) % turn.length];
        from = to;
        to = following;
      }
      if (from !== start || to !== next || new Set(face).size !== face.length) continue;
      const outline = outlineForFace(face.map((id) => points[id]));
      if (outline) outlines.push(outline);
    }
  }
  return outlines.sort((a, b) => b.area - a.area || a.center[0] - b.center[0] || a.center[1] - b.center[1]);
}

export function outlineAtPoint(outlines: PlanOutline[], [x, z]: Point): number {
  return outlines.reduce((smallest, outline, index) => {
    let contains = false;
    for (const [[ax, az], [bx, bz]] of outline.points.map((point, index) => [point, outline.points[(index + 1) % outline.points.length]]))
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) contains = !contains;
    return contains && (smallest < 0 || outline.area < outlines[smallest].area) ? index : smallest;
  }, -1);
}
