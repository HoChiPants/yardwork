import { z } from "zod";
import { Vector3 } from "three";
import type { V3 } from "./model";

/** Local centered inches; retain points satisfying normal.dot(point) <= constant. */
export type CutPlane = { normal: V3; constant: number };
export const cutPlaneSchema = z.strictObject({
  normal: z
    .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
    .refine(
      (n) => Math.abs(Math.hypot(...n) - 1) <= 1e-10,
      "Cut-plane normal must have unit length",
    ),
  constant: z.number().finite(),
});
export const cutPlanesSchema = z.array(cutPlaneSchema).max(6);
const sizeSchema = z.tuple([
  z.number().finite().positive().max(12000),
  z.number().finite().positive().max(12000),
  z.number().finite().positive().max(12000),
]);
export type ConvexFace = {
  /** Counterclockwise from outside, indexing ConvexSolid.vertices. */
  indices: number[];
  normal: V3;
  kind: "stock" | "cut";
  planeIndex?: number;
};
export type ConvexSolid = { vertices: V3[]; faces: ConvexFace[] };
type Polygon = Omit<ConvexFace, "indices"> & { points: Vector3[] };
const vector = (v: V3) => new Vector3(...v);
const tuple = (v: Vector3) => v.toArray() as V3;
function unique(points: Vector3[], epsilon: number) {
  const found: Vector3[] = [];
  for (const point of points)
    if (
      !found.some(
        (other) => other.distanceToSquared(point) <= epsilon * epsilon,
      )
    )
      found.push(point);
  return found;
}
function cleanPolygon(points: Vector3[], epsilon: number): Vector3[] {
  const clean: Vector3[] = [];
  for (const point of points)
    if (!clean.length || clean.at(-1)!.distanceTo(point) > epsilon)
      clean.push(point);
  if (clean.length > 1 && clean[0].distanceTo(clean.at(-1)!) <= epsilon)
    clean.pop();
  let pruning = true;
  while (pruning && clean.length >= 3) {
    pruning = false;
    for (let i = 0; i < clean.length; i++) {
      const a = clean[i]
        .clone()
        .sub(clean[(i + clean.length - 1) % clean.length]);
      const b = clean[(i + 1) % clean.length].clone().sub(clean[i]);
      if (a.clone().cross(b).length() <= epsilon * (a.length() + b.length())) {
        clean.splice(i, 1);
        pruning = true;
        break;
      }
    }
  }
  return clean;
}
function boxPolygons(size: V3): Polygon[] {
  const result: Polygon[] = [];
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const normal = new Vector3().setComponent(axis, sign);
      const uAxis = (axis + 1) % 3;
      const u = new Vector3().setComponent(uAxis, 1);
      const v = normal.clone().cross(u);
      const vAxis = (axis + 2) % 3;
      const center = normal.clone().multiplyScalar(size[axis] / 2);
      const points = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) =>
        center
          .clone()
          .addScaledVector(u, (a * size[uAxis]) / 2)
          .addScaledVector(v, (b * size[vAxis]) / 2),
      );
      result.push({ points, normal: tuple(normal), kind: "stock" });
    }
  return result;
}
function capPolygon(points: Vector3[], normal: Vector3, epsilon: number) {
  const ring = unique(points, epsilon);
  if (ring.length < 3) return [];
  const center = ring
    .reduce((sum, point) => sum.add(point), new Vector3())
    .divideScalar(ring.length);
  // Choose a stable tangent using the coordinate axis least parallel to normal.
  const axis = [0, 1, 2].sort(
    (a, b) =>
      Math.abs(normal.getComponent(a)) - Math.abs(normal.getComponent(b)),
  )[0];
  const u = new Vector3().setComponent(axis, 1);
  u.addScaledVector(normal, -u.dot(normal)).normalize();
  const v = normal.clone().cross(u).normalize();
  const angle = (point: Vector3) => {
    const delta = point.clone().sub(center);
    return Math.atan2(delta.dot(v), delta.dot(u));
  };
  ring.sort((a, b) => angle(a) - angle(b));
  return cleanPolygon(ring, epsilon);
}

/** Clip a box by at most six planes. No arbitrary imported mesh or world transform. */
export function clipBox(
  sizeInput: V3,
  planeInput: readonly CutPlane[],
): ConvexSolid {
  const size = sizeSchema.parse(sizeInput) as V3;
  const planes = cutPlanesSchema.parse([...planeInput]);
  const epsilon = Math.max(1e-10, Math.max(...size) * 1e-9);
  let polygons = boxPolygons(size);
  for (const [planeIndex, plane] of planes.entries()) {
    const normal = vector(plane.normal);
    const distance = (point: Vector3) => normal.dot(point) - plane.constant;
    const current = polygons.flatMap((polygon) => polygon.points);
    if (!current.some((point) => distance(point) > epsilon)) continue;
    if (!current.some((point) => distance(point) < -epsilon))
      throw new Error(
        "Cut planes remove the stock or leave a degenerate solid.",
      );
    const clipped: Polygon[] = [];
    const cap: Vector3[] = [];
    for (const polygon of polygons) {
      const output: Vector3[] = [];
      for (let i = 0; i < polygon.points.length; i++) {
        const a = polygon.points[i],
          b = polygon.points[(i + 1) % polygon.points.length];
        const da = distance(a),
          db = distance(b);
        const insideA = da <= epsilon,
          insideB = db <= epsilon;
        if (insideA) output.push(a.clone());
        if (insideA !== insideB) {
          const t = Math.max(0, Math.min(1, da / (da - db)));
          output.push(a.clone().lerp(b, t));
        }
      }
      const points = cleanPolygon(output, epsilon);
      if (points.length < 3) continue;
      for (const point of points)
        if (Math.abs(distance(point)) <= epsilon * 2) cap.push(point.clone());
      clipped.push({ ...polygon, points });
    }
    const face = capPolygon(cap, normal, epsilon);
    if (face.length < 3)
      throw new Error("Cut did not produce a closed non-degenerate cap.");
    clipped.push({
      points: face,
      normal: [...plane.normal],
      kind: "cut",
      planeIndex,
    });
    polygons = clipped;
  }
  const vertices: V3[] = [];
  const faces: ConvexFace[] = polygons.map(({ points, ...face }) => ({
    ...face,
    indices: points.map((point) => {
      const index = vertices.findIndex(
        (v) => vector(v).distanceTo(point) <= epsilon,
      );
      if (index >= 0) return index;
      vertices.push(tuple(point));
      return vertices.length - 1;
    }),
  }));
  const solid = { vertices, faces };
  const volume = solidVolume(solid);
  if (
    !Number.isFinite(volume) ||
    volume <= Math.max(1e-12, size[0] * size[1] * size[2] * 1e-10)
  )
    throw new Error("Cut planes leave empty or numerically degenerate stock.");
  return solid;
}

export function solidBounds(solid: ConvexSolid): { min: V3; max: V3 } {
  if (!solid.vertices.length) throw new Error("A solid needs vertices.");
  return {
    min: [0, 1, 2].map((axis) =>
      Math.min(...solid.vertices.map((v) => v[axis])),
    ) as V3,
    max: [0, 1, 2].map((axis) =>
      Math.max(...solid.vertices.map((v) => v[axis])),
    ) as V3,
  };
}
/** Cubic inches. Interior-reference tetrahedra avoid large-origin cancellation. */
export function solidVolume(solid: ConvexSolid): number {
  if (!solid.vertices.length) return 0;
  const center = solid.vertices
    .reduce((sum, v) => sum.add(vector(v)), new Vector3())
    .divideScalar(solid.vertices.length);
  let volume = 0;
  for (const face of solid.faces) {
    const a = vector(solid.vertices[face.indices[0]]).sub(center);
    for (let i = 1; i + 1 < face.indices.length; i++) {
      const b = vector(solid.vertices[face.indices[i]]).sub(center);
      const c = vector(solid.vertices[face.indices[i + 1]]).sub(center);
      volume += a.dot(b.cross(c)) / 6;
    }
  }
  return Math.abs(volume);
}
/** Flat triangle positions/normals; all coordinates remain local inches. */
export function triangulateSolid(solid: ConvexSolid) {
  const positions: number[] = [],
    normals: number[] = [];
  for (const face of solid.faces)
    for (let i = 1; i + 1 < face.indices.length; i++) {
      for (const index of [
        face.indices[0],
        face.indices[i],
        face.indices[i + 1],
      ]) {
        positions.push(...solid.vertices[index]);
        normals.push(...face.normal);
      }
    }
  return { positions, normals };
}

/**
 * A corner-referenced bevel at a nominal stock end. Axis is stock length;
 * tiltAxis is the perpendicular local axis the END normal tilts toward, not an
 * Euler rotation axis. At the start, the entire normal reverses, making equal
 * start/end cuts parallel. The longest corner remains at the original end and
 * all removed geometry stays inside the stock. 0 degrees is the square end.
 * This defines geometry only, not a saw setting/capacity or engineered joint.
 */
export function endCutPlane(
  sizeInput: V3,
  axis: 0 | 1 | 2,
  atEnd: boolean,
  angleDegrees: number,
  tiltAxis: 0 | 1 | 2,
): CutPlane {
  const size = sizeSchema.parse(sizeInput);
  if (
    ![0, 1, 2].includes(axis) ||
    ![0, 1, 2].includes(tiltAxis) ||
    axis === tiltAxis ||
    typeof atEnd !== "boolean"
  )
    throw new Error("End-cut axes must be different local coordinate axes.");
  if (!Number.isFinite(angleDegrees) || Math.abs(angleDegrees) > 75)
    throw new Error("End-cut angle must be between -75 and 75 degrees.");
  const angle = (angleDegrees * Math.PI) / 180;
  const sign = atEnd ? 1 : -1;
  const normal: V3 = [0, 0, 0];
  normal[axis] = sign * Math.cos(angle);
  normal[tiltAxis] = sign * Math.sin(angle);
  const constant =
    (Math.cos(angle) * size[axis]) / 2 -
    (Math.abs(Math.sin(angle)) * size[tiltAxis]) / 2;
  return cutPlaneSchema.parse({ normal, constant });
}
