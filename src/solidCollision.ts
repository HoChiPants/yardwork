import { Euler, Line3, Triangle, Vector3 } from "three";
import { clipBox, type ConvexSolid } from "./cutProfiles";
import { material, type Piece, type V3 } from "./model";
import { pieceThroughOpenings, throughOpeningPrisms } from "./throughOpenings";

type ConvexCollisionSolid = {
  vertices: V3[];
  /** Unit world-space face normals; parallel/opposite directions are deduplicated. */
  faceNormals: V3[];
  /** Unit directions of actual polygon perimeter edges, not triangle diagonals. */
  edgeDirections: V3[];
  /** Retained polygon boundaries, indexed into vertices, for distance queries. */
  faceLoops?: number[][];
  bounds: { min: V3; max: V3 };
  /** An envelope overlap requires review; it is not a known filled material profile. */
  kind: "solid" | "envelope";
};
export type CollisionSolid = ConvexCollisionSolid & {
  /** The outer hull supports broad-phase checks. Contacts use these retained cells. */
  cells?: ConvexCollisionSolid[];
};

const AXIS_EPSILON = 1e-12;
const cellTolerance = 1e-7;
const dimensions = [0, 1, 2] as const;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function finiteVector(value: V3): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}
function unit(value: V3): V3 | null {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length)) throw Error("Collision axes must be finite.");
  return length <= AXIS_EPSILON ? null : (value.map((v) => v / length) as V3);
}
function addDirection(directions: V3[], raw: V3) {
  const direction = unit(raw);
  if (!direction) return;
  // Using cross length avoids a broad dot-product rounding band near parallel.
  if (
    !directions.some(
      (other) => Math.hypot(...cross(other, direction)) <= AXIS_EPSILON,
    )
  )
    directions.push(direction);
}

/**
 * Fresh immutable preparation of a retained part in world inches.
 * Unsupported stock returns null; malformed/degenerate geometry throws so callers
 * cannot mistake a numerical failure for a clear space. Offcut filtering belongs
 * to the caller: a recorded remnant still has a geometric shape.
 */
export function prepareCollisionSolid(piece: Piece): CollisionSolid | null {
  const stock = material(piece.material);
  const openings = pieceThroughOpenings(piece);
  const hasOpening = openings.length > 0;
  if (
    !stock ||
    stock.shape === "tube-envelope" ||
    (!["linear", "sheet", "equipment"].includes(stock.stockKind) &&
      !(hasOpening && stock.orderRollWidth !== undefined))
  )
    return null;
  if (stock.stockKind === "linear" && !stock.wood) return null;
  if (!finiteVector(piece.position) || !finiteVector(piece.rotation))
    throw Error(
      "Collision positions and rotations must be finite three-axis vectors.",
    );
  const rotation = new Euler(...piece.rotation),
    rotate = (value: V3): V3 =>
      new Vector3(...value).applyEuler(rotation).toArray() as V3;
  const kind =
    stock.shape === "glazing-envelope" ||
    stock.stockKind === "equipment" ||
    !stock.wood
      ? "envelope"
      : "solid";
  if (hasOpening) {
    const { hull, cells } = throughOpeningPrisms(piece.size, openings);
    return {
      ...prepareConvex(hull, piece.position, rotate, kind),
      cells: cells.map((cell) =>
        prepareConvex(cell, piece.position, rotate, kind),
      ),
    };
  }
  return prepareConvex(
    clipBox(piece.size, piece.cutPlanes ?? []),
    piece.position,
    rotate,
    kind,
  );
}

export function prepareCollisionBox(size: V3, position: V3, rotation: V3): CollisionSolid {
  const orientation = new Euler(...rotation);
  return prepareConvex(clipBox(size, []), position,
    (point) => new Vector3(...point).applyEuler(orientation).toArray(), "envelope");
}

function boundsOf(vertices: readonly V3[]) {
  return {
    min: dimensions.map((axis) =>
      Math.min(...vertices.map((point) => point[axis])),
    ) as V3,
    max: dimensions.map((axis) =>
      Math.max(...vertices.map((point) => point[axis])),
    ) as V3,
  };
}

function prepareConvex(
  local: ConvexSolid,
  origin: V3,
  rotate: (point: V3) => V3,
  kind: ConvexCollisionSolid["kind"],
): ConvexCollisionSolid {
  const vertices = local.vertices.map(
      (point) => rotate(point).map((value, axis) => value + origin[axis]) as V3,
    ),
    faceNormals: V3[] = [],
    edgeDirections: V3[] = [];
  if (vertices.some((point) => !finiteVector(point)))
    throw Error("Collision world vertices must remain finite.");
  for (const face of local.faces) {
    addDirection(faceNormals, rotate(face.normal));
    for (let index = 0; index < face.indices.length; index++) {
      const start = face.indices[index],
        end = face.indices[(index + 1) % face.indices.length];
      if (Math.hypot(...subtract(vertices[end], vertices[start])) === 0)
        throw Error(
          "The world position loses the precision needed to represent this solid.",
        );
      addDirection(
        edgeDirections,
        rotate(subtract(local.vertices[end], local.vertices[start])),
      );
    }
  }
  if (faceNormals.length < 3 || edgeDirections.length < 3)
    throw Error(
      "Collision preparation needs a non-degenerate three-dimensional solid.",
    );
  return {
    vertices,
    faceNormals,
    edgeDirections,
    faceLoops: local.faces.map(({ indices }) => indices),
    bounds: boundsOf(vertices),
    kind,
  };
}

export function translateCollisionSolid(
  solid: CollisionSolid,
  offset: V3,
): CollisionSolid {
  const move = (point: V3) =>
    point.map((value, axis) => value + offset[axis]) as V3;
  const translate = ({
    vertices,
    bounds,
    faceNormals,
    edgeDirections,
    faceLoops,
    kind,
  }: ConvexCollisionSolid) => ({
    vertices: vertices.map(move),
    bounds: { min: move(bounds.min), max: move(bounds.max) },
    faceNormals,
    edgeDirections,
    faceLoops,
    kind,
  });
  return {
    ...translate(solid),
    ...(solid.cells ? { cells: solid.cells.map(translate) } : {}),
  };
}

export function transformCollisionSolid(
  solid: CollisionSolid,
  point: (point: V3) => V3,
  direction: (direction: V3) => V3,
): CollisionSolid {
  const transform = (part: ConvexCollisionSolid) => {
    const vertices = part.vertices.map(point);
    return {
      vertices,
      bounds: boundsOf(vertices),
      kind: part.kind,
      faceNormals: part.faceNormals.map(direction),
      edgeDirections: part.edgeDirections.map(direction),
      faceLoops: part.faceLoops,
    };
  };
  return {
    ...transform(solid),
    ...(solid.cells ? { cells: solid.cells.map(transform) } : {}),
  };
}

function validatePrepared(solid: ConvexCollisionSolid) {
  if (
    solid.vertices.length < 4 ||
    !solid.faceNormals.length ||
    !solid.edgeDirections.length ||
    solid.vertices.some((v) => !finiteVector(v)) ||
    solid.faceNormals.some((v) => !finiteVector(v) || !unit(v)) ||
    solid.edgeDirections.some((v) => !finiteVector(v) || !unit(v)) ||
    !finiteVector(solid.bounds.min) ||
    !finiteVector(solid.bounds.max) ||
    solid.bounds.min.some((value, axis) => value >= solid.bounds.max[axis])
  )
    throw Error("Use a finite non-degenerate prepared collision solid.");
}

function separatingAxes(a: ConvexCollisionSolid, b: ConvexCollisionSolid) {
  const axes: V3[] = [];
  for (const normal of [...a.faceNormals, ...b.faceNormals])
    addDirection(axes, normal);
  for (const edgeA of a.edgeDirections)
    for (const edgeB of b.edgeDirections)
      addDirection(axes, cross(unit(edgeA)!, unit(edgeB)!));
  return axes;
}

function projection(solid: ConvexCollisionSolid, axis: V3, origin: V3) {
  let min = Infinity,
    max = -Infinity;
  for (const point of solid.vertices) {
    const value = dot(subtract(point, origin), axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/** Continuous straight-line SAT. Each projected interval moves by a constant
 * distance per inch of travel, so a thin obstruction between poses is included.
 * See Eberly, Method of Separating Axes, section 6. */
export function slideOverlapInterval(
  a: CollisionSolid,
  b: CollisionSolid,
  direction: V3,
  travel: number,
  tolerance = 0.01,
) {
  const compound = a.cells || b.cells;
  const contact = compound ? Math.min(tolerance, cellTolerance) : tolerance;
  const hull = convexSlideInterval(a, b, direction, travel, contact);
  if (!hull || !compound) return hull;
  let first: typeof hull | null = null;
  for (const cellA of a.cells ?? [a]) {
    for (const cellB of b.cells ?? [b]) {
      const hit = convexSlideInterval(
        cellA,
        cellB,
        direction,
        Math.min(travel, hull.exit),
        contact,
      );
      if (
        hit &&
        (!first ||
          hit.enter < first.enter ||
          (hit.enter === first.enter && hit.exit > first.exit))
      )
        first = hit;
    }
  }
  return first;
}

function convexSlideInterval(
  a: ConvexCollisionSolid,
  b: ConvexCollisionSolid,
  direction: V3,
  travel: number,
  tolerance: number,
) {
  if (
    dimensions.some((i) => {
      const displacement = direction[i] * travel;
      return (
        a.bounds.max[i] + Math.max(0, displacement) - b.bounds.min[i] <=
          tolerance ||
        b.bounds.max[i] - a.bounds.min[i] - Math.min(0, displacement) <=
          tolerance
      );
    })
  )
    return null;
  let enter = 0,
    exit = travel;
  for (const axis of separatingAxes(a, b)) {
    const aa = projection(a, axis, a.vertices[0]);
    const bb = projection(b, axis, a.vertices[0]);
    const low = bb.min + tolerance - aa.max;
    const high = bb.max - tolerance - aa.min;
    const speed = dot(direction, axis);
    if (Math.abs(speed) <= AXIS_EPSILON) {
      if (low >= 0 || high <= 0) return null;
      continue;
    }
    const edges = [low / speed, high / speed];
    enter = Math.max(enter, Math.min(...edges));
    exit = Math.min(exit, Math.max(...edges));
    if (enter >= exit) return null;
  }
  return { enter, exit };
}

/** Certify a whole rotating interval using a midpoint axis. Only the
 * displacement perpendicular to the rotation axis can change the projection. */
export function swingSeparated(
  moving: CollisionSolid,
  fixed: CollisionSolid,
  rotationAxis: V3,
  maxDisplacement: number,
  tolerance: number,
) {
  return intervalSeparated(
    moving,
    fixed,
    (axis) => maxDisplacement * Math.hypot(...cross(rotationAxis, axis)),
    tolerance,
  );
}

/** Certify a fixed-axis swing segment using vertex projection extrema about
 * its midpoint pose. A single separating direction must cover the entire arc. */
export function swingIntervalSeparated(
  midpoint: CollisionSolid,
  fixed: CollisionSolid,
  pivot: V3,
  rotationAxis: V3,
  halfAngle: number,
  tolerance: number,
) {
  const cosine = Math.cos(halfAngle);
  const sine = Math.sin(halfAngle);
  const compound = midpoint.cells || fixed.cells;
  const contact = compound ? Math.min(tolerance, cellTolerance) : tolerance;
  const separated = (moving: ConvexCollisionSolid, obstacle: ConvexCollisionSolid) => {
    const paths = moving.vertices.map((point) => {
      const offset = subtract(point, pivot);
      const depth = dot(offset, rotationAxis);
      return {
        along: depth,
        radial: subtract(offset, rotationAxis.map((value) => value * depth) as V3),
        tangent: cross(rotationAxis, offset),
      };
    });
    for (const axis of separatingAxes(moving, obstacle)) {
      const obstacleProjection = projection(obstacle, axis, pivot);
      const along = dot(rotationAxis, axis);
      let min = Infinity;
      let max = -Infinity;
      for (const path of paths) {
        const center = path.along * along;
        const a = dot(path.radial, axis);
        const b = dot(path.tangent, axis);
        const left = center + a * cosine - b * sine;
        const right = center + a * cosine + b * sine;
        const radius = Math.hypot(a, b);
        min = Math.min(min, left, right);
        max = Math.max(max, left, right);
        if (Math.abs(Math.atan2(b, a)) <= halfAngle) max = Math.max(max, center + radius);
        if (Math.abs(Math.atan2(-b, -a)) <= halfAngle) min = Math.min(min, center - radius);
      }
      const gap = Math.max(obstacleProjection.min - max, min - obstacleProjection.max);
      if (gap + contact >= 1e-9) return true;
    }
    return false;
  };
  return separated(midpoint, fixed) || (!!compound &&
    (midpoint.cells ?? [midpoint]).every((moving) =>
      (fixed.cells ?? [fixed]).every((obstacle) => separated(moving, obstacle))));
}

/** The callback bounds the two solids' combined displacement along a test axis. */
export function intervalSeparated(
  first: CollisionSolid,
  second: CollisionSolid,
  projectionDisplacement: (axis: V3) => number,
  tolerance: number,
) {
  const compound = first.cells || second.cells;
  const contact = compound ? Math.min(tolerance, cellTolerance) : tolerance;
  if (convexIntervalSeparated(first, second, projectionDisplacement, contact))
    return true;
  return (
    !!compound &&
    (first.cells ?? [first]).every((a) =>
      (second.cells ?? [second]).every((b) =>
        convexIntervalSeparated(a, b, projectionDisplacement, contact),
      ),
    )
  );
}

function convexIntervalSeparated(
  first: ConvexCollisionSolid,
  second: ConvexCollisionSolid,
  projectionDisplacement: (axis: V3) => number,
  tolerance: number,
) {
  for (const axis of separatingAxes(first, second)) {
    const a = projection(first, axis, first.vertices[0]);
    const b = projection(second, axis, first.vertices[0]);
    const margin = Math.max(b.min - a.max, a.min - b.max);
    if (margin + tolerance >= projectionDisplacement(axis) + 1e-9) return true;
  }
  return false;
}

/**
 * Convex-polyhedron separating axes: both face-normal sets plus every nonzero
 * edge-direction cross product. Algorithm reference: David Eberly, section 4,
 * https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf
 *
 * Returns interior overlap only. On any normalized axis, a translation depth
 * <= tolerance inches is treated as contact. This directed interval test also
 * handles containment (unlike using just the shared interval's width). A tiny
 * scale-aware floating-point allowance is numerical roundoff, not a fit claim.
 * Envelope results remain conservative external interference, not solid contact.
 */
export function solidOverlap(
  a: CollisionSolid,
  b: CollisionSolid,
  tolerance = 0.01,
): boolean {
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw Error("Collision tolerance must be a finite nonnegative inch value.");
  validatePrepared(a);
  validatePrepared(b);
  const compound = a.cells || b.cells;
  // Internal partition seams are not real clearance. Applying the usual
  // contact allowance to every small cell could miss occupied material.
  const contact = compound ? Math.min(tolerance, cellTolerance) : tolerance;
  if (!convexOverlap(a, b, contact)) return false;
  return (
    !compound ||
    (a.cells ?? [a]).some((first) =>
      (b.cells ?? [b]).some((second) => convexOverlap(first, second, contact)),
    )
  );
}

function convexOverlap(
  a: ConvexCollisionSolid,
  b: ConvexCollisionSolid,
  tolerance: number,
) {
  const roundoff =
      Number.EPSILON *
      64 *
      Math.max(
        1,
        ...a.bounds.min.map(Math.abs),
        ...a.bounds.max.map(Math.abs),
        ...b.bounds.min.map(Math.abs),
        ...b.bounds.max.map(Math.abs),
      ),
    contact = tolerance + roundoff;
  for (let axis = 0; axis < 3; axis++)
    if (
      a.bounds.max[axis] - b.bounds.min[axis] <= contact ||
      b.bounds.max[axis] - a.bounds.min[axis] <= contact
    )
      return false;
  const origin = a.vertices[0];
  for (const axis of separatingAxes(a, b)) {
    const aa = projection(a, axis, origin),
      bb = projection(b, axis, origin);
    if (aa.max - bb.min <= contact || bb.max - aa.min <= contact) return false;
  }
  return true;
}

/** Check continuous coverage as the segment crosses cells of a retained solid. */
export function solidContainsSegment(shape: CollisionSolid, start: V3, finish: V3) {
  const delta = subtract(finish, start);
  const ranges = (shape.cells ?? [shape]).flatMap((cell): [number, number][] => {
    let from = 0, to = 1;
    for (const axis of cell.faceNormals) {
      const { min, max } = projection(cell, axis, start);
      const travel = dot(delta, axis);
      if (Math.abs(travel) < AXIS_EPSILON) {
        if (min > cellTolerance || max < -cellTolerance) return [];
        continue;
      }
      const a = (min - cellTolerance) / travel;
      const b = (max + cellTolerance) / travel;
      from = Math.max(from, Math.min(a, b));
      to = Math.min(to, Math.max(a, b));
      if (from > to) return [];
    }
    return [[from, to]];
  }).sort(([a], [b]) => a - b);
  let reached = 0;
  for (const [from, to] of ranges) {
    if (from > reached) return false;
    reached = Math.max(reached, to);
    if (reached === 1) return true;
  }
  return false;
}

function surfaceFeatures(shape: ConvexCollisionSolid) {
  if (!shape.faceLoops)
    throw Error("Distance review needs the modeled part surfaces.");
  const vertices = shape.vertices.map((point) => new Vector3(...point));
  const triangles: Triangle[] = [];
  const edges = new Map<string, Line3>();
  for (const loop of shape.faceLoops) {
    for (let i = 1; i + 1 < loop.length; i++) {
      const triangle = new Triangle(vertices[loop[0]], vertices[loop[i]], vertices[loop[i + 1]]);
      if (triangle.getArea() > 0) triangles.push(triangle);
    }
    for (const [i, a] of loop.entries()) {
      const b = loop[(i + 1) % loop.length];
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      if (!edges.has(key)) edges.set(key, new Line3(vertices[a], vertices[b]));
    }
  }
  return { vertices, triangles, edges: [...edges.values()] };
}

export type GapEndpoints = [V3, V3];

/** Euclidean gap at one pose. For separated convex solids, the closest features
 * are covered by vertex-to-face and edge-to-edge distances, including endpoints.
 * Through-openings use the retained cells, never their filled outer hull. */
export function solidGap(
  first: CollisionSolid,
  second: CollisionSolid,
  onEndpoints?: (points: GapEndpoints) => void,
): number {
  if (solidOverlap(first, second, 0)) return 0;
  const checked = new Map<ConvexCollisionSolid, ReturnType<typeof surfaceFeatures>>();
  const features = (shape: ConvexCollisionSolid) => {
    const cached = checked.get(shape);
    if (cached) return cached;
    const prepared = surfaceFeatures(shape);
    checked.set(shape, prepared);
    return prepared;
  };
  const point = new Vector3();
  const nearest = onEndpoints && [new Vector3(), new Vector3()] as const;
  const edgePoints = onEndpoints && [new Vector3(), new Vector3()] as const;
  let bestSquared = Infinity;
  for (const a of first.cells ?? [first]) {
    for (const b of second.cells ?? [second]) {
      const bound = dimensions.reduce<number>((sum, i) =>
        sum + Math.max(0, a.bounds.min[i] - b.bounds.max[i], b.bounds.min[i] - a.bounds.max[i]) ** 2, 0);
      if (bound >= bestSquared) continue;
      const firstFeatures = features(a);
      const secondFeatures = features(b);
      for (const [from, to, reversed] of [
        [firstFeatures, secondFeatures, false],
        [secondFeatures, firstFeatures, true],
      ] as const) {
        for (const vertex of from.vertices)
          for (const face of to.triangles) {
            face.closestPointToPoint(vertex, point);
            const squared = vertex.distanceToSquared(point);
            if (squared < bestSquared) {
              bestSquared = squared;
              nearest?.[0].copy(reversed ? point : vertex);
              nearest?.[1].copy(reversed ? vertex : point);
            }
          }
      }
      for (const edgeA of firstFeatures.edges)
        for (const edgeB of secondFeatures.edges) {
          const squared = edgeA.distanceSqToLine3(edgeB, edgePoints?.[0], edgePoints?.[1]);
          if (squared < bestSquared) {
            bestSquared = squared;
            if (nearest && edgePoints) {
              // Three's distance routine subtracts the second point from the first in place.
              nearest[0].addVectors(edgePoints[0], edgePoints[1]);
              nearest[1].copy(edgePoints[1]);
            }
          }
        }
    }
  }
  if (!Number.isFinite(bestSquared)) throw Error("Could not measure the modeled contact gap.");
  if (nearest && bestSquared > 0) onEndpoints?.([nearest[0].toArray(), nearest[1].toArray()]);
  return Math.sqrt(Math.max(0, bestSquared));
}

/** null means an unsupported profile, never a proven clear space. */
export function pieceOverlap(
  a: Piece,
  b: Piece,
  tolerance = 0.01,
): boolean | null {
  const first = prepareCollisionSolid(a),
    second = prepareCollisionSolid(b);
  return first && second ? solidOverlap(first, second, tolerance) : null;
}
