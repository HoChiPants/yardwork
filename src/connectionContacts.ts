import {
  isHardware,
  isBatt,
  material,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { clipBox } from "./cutProfiles";
import { pieceThroughOpenings, throughOpeningSurface } from "./throughOpenings";
import { rotate } from "./spatial";
import {
  prepareCollisionSolid,
  solidOverlap,
  type CollisionSolid,
} from "./solidCollision";

export type ConnectionContactState =
  | "face-contact"
  | "near-face"
  | "interference"
  | "outside-search"
  | "no-facing-contact"
  | "unsupported";
export type ConnectionContactReview = {
  aId: string;
  bId: string;
  state: ConnectionContactState;
  /** Perpendicular face separation, not a fastener path or a manufactured allowance. */
  gap: number | null;
  area: number | null;
  normal: V3 | null;
  /** Center of the modeled face overlap, for inspection only; never a proposed hole. */
  center: V3 | null;
  reason: string;
};
type Point2 = [number, number];
export type WoodFace = { normal: V3; points: V3[] };
type Prepared = {
  piece: Piece;
  solid: CollisionSolid | null;
  faces: WoodFace[];
  unsupported: boolean;
};
const EPS = 1e-7,
  AREA_EPS = 1e-8;
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const sub = (a: V3, b: V3): V3 => a.map((n, i) => n - b[i]) as V3;
const add = (a: V3, b: V3): V3 => a.map((n, i) => n + b[i]) as V3;
const scale = (a: V3, n: number): V3 => a.map((value) => value * n) as V3;
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalized = (a: V3): V3 => scale(a, 1 / Math.hypot(...a));
function prepare(piece: Piece): Prepared {
  const result: Prepared = { piece, solid: null, faces: [], unsupported: true };
  if (piece.offcut || !material(piece.material)?.wood) return result;
  try {
    const solid = prepareCollisionSolid(piece);
    if (!solid || solid.kind !== "solid") return result;
    return {
      piece,
      solid,
      unsupported: false,
      faces: retainedWoodFaces(piece),
    };
  } catch {
    return result;
  }
}

export function retainedWoodFaces(piece: Piece): WoodFace[] {
  const openings = pieceThroughOpenings(piece);
  if (openings.length)
    return throughOpeningSurface(piece.size, openings).faces.map(
      ({ normal, points }) => ({
        normal: normalized(rotate(normal, piece.rotation)),
        points: points.map((point) =>
          add(rotate(point, piece.rotation), piece.position),
        ),
      }),
    );
  const local = clipBox(piece.size, piece.cutPlanes);
  const points = local.vertices.map((point) =>
    add(rotate(point, piece.rotation), piece.position),
  );
  return local.faces.map((face) => ({
    normal: normalized(rotate(face.normal, piece.rotation)),
    points: face.indices.map((index) => points[index]),
  }));
}
const cross2 = (a: Point2, b: Point2, c: Point2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function signedArea(points: Point2[]) {
  return (
    points.reduce((sum, point, i) => {
      const next = points[(i + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );
}
function ccw(points: Point2[]) {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}
/** Convex polygon clipping in the face plane; removed regions never return through an AABB. */
function intersect(subject: Point2[], clipping: Point2[]): Point2[] {
  let output = ccw(subject);
  const clip = ccw(clipping);
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        dp = cross2(a, b, p),
        dq = cross2(a, b, q);
      const pin = dp >= -EPS,
        qin = dq >= -EPS;
      if (pin) output.push(p);
      if (pin !== qin) {
        const t = dp / (dp - dq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return output;
}
export function faceOverlap(a: WoodFace, b: WoodFace, gap: number) {
  const origin = a.points[0],
    u = normalized(
      cross(a.normal, Math.abs(a.normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]),
    ),
    v = cross(a.normal, u);
  const project = (point: V3): Point2 => {
    const offset = sub(point, origin);
    return [dot(offset, u), dot(offset, v)];
  };
  const polygon = intersect(a.points.map(project), b.points.map(project));
  if (polygon.length < 3) return null;
  const signed = signedArea(polygon),
    area = Math.abs(signed);
  if (area <= AREA_EPS) return null;
  const sum = polygon.reduce(
    (total, point, i) => {
      const next = polygon[(i + 1) % polygon.length],
        factor = point[0] * next[1] - next[0] * point[1];
      return [
        total[0] + (point[0] + next[0]) * factor,
        total[1] + (point[1] + next[1]) * factor,
      ] as Point2;
    },
    [0, 0] as Point2,
  );
  const center = add(
    add(
      add(origin, scale(u, sum[0] / (6 * signed))),
      scale(v, sum[1] / (6 * signed)),
    ),
    scale(a.normal, gap / 2),
  );
  const outline = polygon.map(([x, y]) =>
    add(add(origin, scale(u, x)), scale(v, y)),
  );
  return { area, center, outline };
}

/** Positive-area contact between opposite retained faces on the same plane. */
export function faceContactPatch(a: WoodFace, b: WoodFace) {
  return Math.hypot(...add(a.normal, b.normal)) <= EPS &&
    Math.abs(dot(sub(b.points[0], a.points[0]), a.normal)) <= EPS
    ? faceOverlap(a, b, 0)
    : null;
}

/** Contact between a panel's retained underside and the top face of other active wood. */
export function woodBearingSurfaces(
  project: Project,
  panelIds: ReadonlySet<string>,
) {
  if (!panelIds.size) return [];
  const horizontal = (normal: V3, sign: 1 | -1) =>
    Math.hypot(normal[0], normal[1] - sign, normal[2]) <= EPS;
  const prepared = project.pieces
    .filter((piece) => !piece.offcut && material(piece.material).wood)
    .map(prepare);
  const supports = prepared
    .flatMap(({ piece, faces, solid }) => {
      if (!solid) return [];
      return faces
        .filter((face) => horizontal(face.normal, 1))
        .map((top) => ({
          piece,
          top,
          bounds: solid.bounds,
        }));
    })
    .sort((a, b) => a.top.points[0][1] - b.top.points[0][1]);
  return prepared.flatMap(({ piece, faces, solid }) => {
    if (!panelIds.has(piece.id) || !solid) return [];
    const undersides = faces
      .filter((face) => horizontal(face.normal, -1))
      .flatMap((face) => {
        const own = faceOverlap(face, face, 0);
        return own ? [{ face, ...own }] : [];
      });
    if (!undersides.length) return [];
    const area = undersides.reduce((sum, face) => sum + face.area, 0);
    const center = scale(
      undersides.reduce(
        (sum, face) => add(sum, scale(face.center, face.area)),
        [0, 0, 0] as V3,
      ),
      1 / area,
    );
    const contacts = [];
    for (const underside of undersides) {
      const height = underside.face.points[0][1];
      for (const { piece: support, top, bounds } of supports) {
        const gap = height - top.points[0][1];
        if (gap < -EPS) break;
        if (gap > EPS || support.id === piece.id) continue;
        if (
          bounds.min[0] >= solid.bounds.max[0] ||
          bounds.max[0] <= solid.bounds.min[0] ||
          bounds.min[2] >= solid.bounds.max[2] ||
          bounds.max[2] <= solid.bounds.min[2]
        )
          continue;
        const hit = faceOverlap(underside.face, top, 0);
        if (hit)
          contacts.push({
            pieceId: support.id,
            area: hit.area,
            outline: hit.outline,
          });
      }
    }
    return [
      {
        piece,
        undersides: undersides.map(({ outline }) => outline),
        center,
        contacts,
      },
    ];
  });
}
function checkedGap(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 12)
    throw Error("Choose a finite proximity search distance from zero to12in.");
  return value;
}
function review(
  a: Prepared,
  b: Prepared,
  maxGap: number,
  outward?: V3,
): ConnectionContactReview {
  const result: ConnectionContactReview = {
    aId: a.piece.id,
    bId: b.piece.id,
    state: "unsupported",
    gap: null,
    area: null,
    normal: null,
    center: null,
    reason:
      "These exact retained surfaces are not available for a wood-face review. Other materials and profiles need their own installation review.",
  };
  if (
    a.unsupported ||
    b.unsupported ||
    !a.solid ||
    !b.solid ||
    a.piece.id === b.piece.id
  )
    return result;
  const boundsGap = Math.hypot(
    ...[0, 1, 2].map((i) =>
      Math.max(
        0,
        a.solid!.bounds.min[i] - b.solid!.bounds.max[i],
        b.solid!.bounds.min[i] - a.solid!.bounds.max[i],
      ),
    ),
  );
  if (boundsGap > maxGap + EPS)
    return {
      ...result,
      state: "outside-search",
      reason:
        "The modeled bounds are outside this proximity search. This is not a joint or fit assessment.",
    };
  if (solidOverlap(a.solid, b.solid, EPS))
    return {
      ...result,
      state: "interference",
      reason:
        "Retained solids overlap. Review placement and intended joinery cuts before detailing this connection.",
    };
  let best: { gap: number; area: number; normal: V3; center: V3 } | null = null;
  for (const fa of a.faces) {
    if (
      outward &&
      (dot(fa.normal, outward) <= 0 ||
        Math.hypot(...cross(fa.normal, outward)) > EPS)
    )
      continue;
    for (const fb of b.faces) {
      if (
        dot(fa.normal, fb.normal) >= 0 ||
        Math.hypot(...cross(fa.normal, fb.normal)) > 1e-10
      )
        continue;
      const separation = dot(sub(fb.points[0], fa.points[0]), fa.normal);
      if (separation < -EPS || separation > maxGap + EPS) continue;
      const gap = Math.abs(separation) <= EPS ? 0 : separation,
        overlap = faceOverlap(fa, fb, gap);
      if (!overlap) continue;
      if (
        !best ||
        gap < best.gap - EPS ||
        (Math.abs(gap - best.gap) <= EPS && overlap.area > best.area + AREA_EPS)
      )
        best = {
          gap,
          area: overlap.area,
          normal: fa.normal,
          center: overlap.center,
        };
    }
  }
  return best
    ? {
        ...result,
        ...best,
        state: best.gap === 0 ? "face-contact" : "near-face",
        reason:
          best.gap === 0
            ? "Modeled retained faces meet. Contact alone does not fasten the parts or establish joint strength."
            : "Modeled opposite faces are near one another. Proximity is not a fit allowance or fastening approval; review the gap and intended joint.",
      }
    : {
        ...result,
        state: "no-facing-contact",
        reason:
          "No overlapping opposite retained faces were found within the search distance. Edge contact and other joinery require manual review.",
      };
}

/** Read-only geometry. It never creates intent, fasteners, holes, purchases or a strength score. */
export function reviewConnectionContact(
  a: Piece,
  b: Piece,
  maxGap = 0.125,
  /** When supplied, inspect the first member's face pointing along this unit world axis. */
  outward?: V3,
): ConnectionContactReview {
  return review(prepare(a), prepare(b), checkedGap(maxGap), outward);
}
export type NearbyConnectionPairs = {
  pairs: ConnectionContactReview[];
  issues: ConnectionContactReview[];
  candidateCount: number;
  issueCount: number;
  checkedPairs: number;
  complete: boolean;
  truncated: boolean;
  unsupportedPieceIds: string[];
};
export function nearbyConnectionPairs(
  project: Project,
  memberIds?: readonly string[],
  options: { limit?: number; maxChecks?: number; maxGap?: number } = {},
): NearbyConnectionPairs {
  const maxGap = checkedGap(options.maxGap ?? 0.125),
    limit = options.limit ?? 100,
    maxChecks = options.maxChecks ?? 10000;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000 ||
    !Number.isInteger(maxChecks) ||
    maxChecks < 1 ||
    maxChecks > 100000
  )
    throw Error("Choose a bounded contact search and result count.");
  const scope = memberIds ? new Set(memberIds) : null,
    active = project.pieces.filter(
      (piece) =>
        !piece.offcut && !isHardware(piece.material) && !isBatt(piece.material),
    );
  const prepared = active.map(prepare),
    unsupportedPieceIds = prepared
      .filter((p) => p.unsupported && (!scope || scope.has(p.piece.id)))
      .map((p) => p.piece.id)
      .sort();
  const wood = prepared
    .filter((p) => !p.unsupported)
    .sort(
      (a, b) =>
        a.solid!.bounds.min[0] - b.solid!.bounds.min[0] ||
        a.piece.id.localeCompare(b.piece.id),
    );
  const result: NearbyConnectionPairs = {
    pairs: [],
    issues: [],
    candidateCount: 0,
    issueCount: 0,
    checkedPairs: 0,
    complete: true,
    truncated: false,
    unsupportedPieceIds,
  };
  outer: for (let i = 0; i < wood.length; i++)
    for (let j = i + 1; j < wood.length; j++) {
      if (
        wood[j].solid!.bounds.min[0] - wood[i].solid!.bounds.max[0] >
        maxGap + EPS
      )
        break;
      if (scope && !scope.has(wood[i].piece.id) && !scope.has(wood[j].piece.id))
        continue;
      if (result.checkedPairs >= maxChecks) {
        result.complete = false;
        break outer;
      }
      result.checkedPairs++;
      const [a, b] =
          wood[i].piece.id.localeCompare(wood[j].piece.id) < 0
            ? [wood[i], wood[j]]
            : [wood[j], wood[i]],
        item = review(a, b, maxGap);
      if (item.state === "face-contact" || item.state === "near-face") {
        result.candidateCount++;
        if (result.pairs.length < limit) result.pairs.push(item);
      } else if (item.state === "interference") {
        result.issueCount++;
        if (result.issues.length < limit) result.issues.push(item);
      }
    }
  result.pairs.sort(
    (a, b) =>
      a.gap! - b.gap! ||
      a.aId.localeCompare(b.aId) ||
      a.bId.localeCompare(b.bId),
  );
  result.issues.sort(
    (a, b) => a.aId.localeCompare(b.aId) || a.bId.localeCompare(b.bId),
  );
  result.truncated =
    !result.complete ||
    result.candidateCount > result.pairs.length ||
    result.issueCount > result.issues.length;
  return result;
}
