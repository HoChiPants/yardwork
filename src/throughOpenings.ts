import type { Piece, V3 } from "./model";
import {
  coverageArea,
  polygonCover,
  subtractCover,
  type CoveragePolygon,
} from "./depthCoverage";
import type { ThroughOpening } from "./throughOpeningSchema";
import { convexHull, type Point2 } from "./convexHull";
import type { ConvexSolid } from "./cutProfiles";

const sides = 48;
const profiles = [0, 1, 2] as const;
const epsilon = 1e-7;

export function openingAxes(axis: ThroughOpening["axis"]) {
  return [profiles[(axis + 1) % 3], profiles[(axis + 2) % 3]] as const;
}

export function pieceThroughOpenings(
  piece: Pick<Piece, "roundOpenings" | "rectangularOpenings">,
): readonly ThroughOpening[] {
  if (!piece.rectangularOpenings?.length) return piece.roundOpenings ?? [];
  return [...(piece.roundOpenings ?? []), ...piece.rectangularOpenings];
}

export function openingHalfSpans(opening: ThroughOpening): Point2 {
  if ("spans" in opening) return [opening.spans[0] / 2, opening.spans[1] / 2];
  const r = opening.diameter / 2;
  return [r, r];
}

export function openingIntersectsBlank(size: V3, opening: ThroughOpening) {
  const [u, v] = openingAxes(opening.axis);
  const [x, y] = opening.center;
  if ("spans" in opening) {
    const [dx, dy] = openingHalfSpans(opening);
    return (
      Math.abs(x) < size[u] / 2 + dx - epsilon &&
      Math.abs(y) < size[v] / 2 + dy - epsilon
    );
  }
  return (
    Math.hypot(
      Math.max(0, Math.abs(x) - size[u] / 2),
      Math.max(0, Math.abs(y) - size[v] / 2),
    ) <
    opening.diameter / 2 - epsilon
  );
}

function planarShape(size: V3, openings: readonly ThroughOpening[]) {
  const axis = openings[0].axis;
  const [u, v] = openingAxes(axis);
  const w = size[u] / 2,
    h = size[v] / 2;
  const outer: CoveragePolygon = [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ];
  const rings = openings.map((opening): CoveragePolygon => {
    const [x, y] = opening.center;
    const [dx, dy] = openingHalfSpans(opening);
    if ("spans" in opening)
      return [
        [x - dx, y - dy],
        [x + dx, y - dy],
        [x + dx, y + dy],
        [x - dx, y + dy],
      ];
    return Array.from({ length: sides }, (_, i) => {
      const theta = (i * Math.PI * 2) / sides;
      return [x + dx * Math.cos(theta), y + dy * Math.sin(theta)];
    });
  });
  const covers = rings.map(polygonCover);
  const cells = covers.reduce(
    (retained, cover) => retained.flatMap((cell) => subtractCover(cell, cover)),
    [outer],
  );
  return { outer, rings, covers, cells };
}

/** Extrude the same retained planar regions used for the rendered cut. */
export function throughOpeningPrisms(
  size: V3,
  openings: readonly ThroughOpening[],
) {
  const axis = openings[0].axis;
  const [u, v] = openingAxes(axis);
  const { cells } = planarShape(size, openings);
  const profiles = cells.map(convexHull);
  if (!profiles.length || profiles.some((profile) => profile.length < 3))
    throw Error("Openings need a non-degenerate retained shape.");

  function prism(profile: CoveragePolygon): ConvexSolid {
    const count = profile.length;
    const unit = (depth: number, x = 0, y = 0): V3 => {
      const point: V3 = [0, 0, 0];
      point[axis] = depth;
      point[u] = x;
      point[v] = y;
      return point;
    };
    const vertices = [-size[axis] / 2, size[axis] / 2].flatMap((depth) =>
      profile.map(([x, y]) => unit(depth, x, y)),
    );
    const faces: ConvexSolid["faces"] = [
      {
        indices: profile.map((_, i) => count - 1 - i),
        normal: unit(-1),
        kind: "stock",
      },
      {
        indices: profile.map((_, i) => count + i),
        normal: unit(1),
        kind: "stock",
      },
    ];
    for (const [i, [x, y]] of profile.entries()) {
      const j = (i + 1) % count;
      const [nextX, nextY] = profile[j];
      const span = Math.hypot(nextX - x, nextY - y);
      faces.push({
        indices: [i, j, j + count, i + count],
        normal: unit(0, (nextY - y) / span, (x - nextX) / span),
        kind: "stock",
      });
    }
    return { vertices, faces };
  }
  return {
    hull: prism(convexHull(profiles.flat())),
    cells: profiles.map(prism),
  };
}

function openingsTouch(a: ThroughOpening, b: ThroughOpening) {
  const dx = Math.abs(a.center[0] - b.center[0]);
  const dy = Math.abs(a.center[1] - b.center[1]);
  if (!("spans" in a) && !("spans" in b))
    return Math.hypot(dx, dy) < (a.diameter + b.diameter) / 2 - epsilon;
  if ("spans" in a && "spans" in b)
    return (
      dx <= (a.spans[0] + b.spans[0]) / 2 + epsilon &&
      dy <= (a.spans[1] + b.spans[1]) / 2 + epsilon
    );
  const circle = "diameter" in a ? a : b;
  const rectangle = "spans" in a ? a : b;
  const [w, h] = openingHalfSpans(rectangle);
  return (
    Math.hypot(Math.max(0, dx - w), Math.max(0, dy - h)) <=
    openingHalfSpans(circle)[0] + epsilon
  );
}

export function throughOpeningProblem(
  size: V3,
  openings: readonly ThroughOpening[],
) {
  if (!openings.length) return null;
  if (openings.length > 6) return "This part can hold up to six through-cuts.";
  const noun = openings.every((opening) => "diameter" in opening)
    ? "Round openings"
    : "Through-cuts";
  if (openings.some(({ axis }) => axis !== openings[0].axis))
    return `${noun} on one blank must share a through-axis.`;
  if (openings.some((opening) => !openingIntersectsBlank(size, opening)))
    return noun === "Round openings"
      ? "A round opening misses the retained blank."
      : "A through-cut misses the retained blank.";
  if (
    openings.some((a, i) =>
      openings.slice(i + 1).some((b) => openingsTouch(a, b)),
    )
  )
    return `${noun} on one blank must remain separate.`;
  const { cells, outer } = planarShape(size, openings);
  const retained = cells.reduce((sum, cell) => sum + coverageArea(cell), 0);
  if (retained <= epsilon) return "The openings would remove the whole blank.";
  if (retained >= coverageArea(outer) - epsilon)
    return `${noun} need an intersection large enough to model.`;

  const [u, v] = openingAxes(openings[0].axis);
  const halfBlank = [size[u] / 2, size[v] / 2];
  for (const opening of openings) {
    if (!("spans" in opening)) continue;
    const half = openingHalfSpans(opening);
    const spansAxis = halfBlank.map(
      (edge, i) => half[i] - Math.abs(opening.center[i]) >= edge - epsilon,
    );
    const insideAxis = halfBlank.map(
      (edge, i) => half[i] + Math.abs(opening.center[i]) < edge - epsilon,
    );
    if ((spansAxis[0] && insideAxis[1]) || (spansAxis[1] && insideAxis[0]))
      return "This through-cut would split the blank into two parts. Use Straight trim to separate stock.";
  }
  return null;
}

export function shiftedThroughOpenings<T extends ThroughOpening>(
  openings: readonly T[],
  size: V3,
  axis: number,
  shift: number,
) {
  return openings.flatMap((opening) => {
    const [u, v] = openingAxes(opening.axis);
    const next: T = {
      ...opening,
      center: [
        opening.center[0] - (u === axis ? shift : 0),
        opening.center[1] - (v === axis ? shift : 0),
      ],
    };
    return openingIntersectsBlank(size, next) ? [next] : [];
  });
}

/** Exposed faces only. Interior cell subdivisions never become contact surfaces. */
export function throughOpeningSurface(
  size: V3,
  openings: readonly ThroughOpening[],
) {
  const axis = openings[0].axis;
  const [u, v] = openingAxes(axis);
  const { outer, rings, covers, cells } = planarShape(size, openings);
  const faces: { normal: V3; points: V3[]; openingWall?: true }[] = [];
  const outline: number[] = [];
  const lift = ([x, y]: Point2, depth: number): V3 => {
    const point: V3 = [0, 0, 0];
    point[u] = x;
    point[v] = y;
    point[axis] = depth;
    return point;
  };
  const low = -size[axis] / 2,
    high = size[axis] / 2;
  for (const cell of cells) {
    faces.push({
      normal: lift([0, 0], 1),
      points: cell.map((point) => lift(point, high)),
    });
    faces.push({
      normal: lift([0, 0], -1),
      points: [...cell].reverse().map((point) => lift(point, low)),
    });
  }
  type Segment = [number, number];
  const rectangle = polygonCover(outer);
  const edges = [outer, ...rings];
  for (const [boundary, ring] of edges.entries()) {
    for (const [index, start] of ring.entries()) {
      const end = ring[(index + 1) % ring.length];
      const dx = end[0] - start[0],
        dy = end[1] - start[1];
      const at = (t: number): Point2 => [start[0] + t * dx, start[1] + t * dy];
      const clip = (cover: typeof rectangle): Segment | null => {
        let from = 0,
          to = 1;
        for (const { x, y, limit } of cover) {
          const speed = x * dx + y * dy;
          const gap = limit - x * start[0] - y * start[1];
          if (Math.abs(speed) <= epsilon) {
            if (gap < -epsilon) return null;
          } else if (speed > 0) to = Math.min(to, gap / speed);
          else from = Math.max(from, gap / speed);
        }
        return to - from > epsilon ? [from, to] : null;
      };
      const exposed = boundary === 0 ? ([0, 1] as Segment) : clip(rectangle);
      if (!exposed) continue;
      if (
        boundary > 0 &&
        rectangle.some(
          ({ x, y, limit }) =>
            Math.abs(x * start[0] + y * start[1] - limit) <= epsilon &&
            Math.abs(x * end[0] + y * end[1] - limit) <= epsilon,
        )
      )
        continue;
      const allowed = covers.reduce<Segment[]>(
        (segments, cover, i) => {
          if (i + 1 === boundary) return segments;
          const occluded = clip(cover);
          if (!occluded) return segments;
          const [a, b] = occluded;
          return segments.flatMap(([from, to]) => {
            if (b <= from || a >= to) return [[from, to]];
            return [
              ...(a > from + epsilon ? [[from, a] as Segment] : []),
              ...(b < to - epsilon ? [[b, to] as Segment] : []),
            ];
          });
        },
        [exposed],
      );
      const length = Math.hypot(dx, dy);
      const facing = boundary === 0 ? 1 : -1;
      const normal = lift([(facing * dy) / length, (-facing * dx) / length], 0);
      for (const interval of allowed) {
        const [a, b] = (
          boundary === 0 ? interval : [...interval].reverse()
        ).map(at);
        faces.push({
          normal,
          points: [lift(a, low), lift(b, low), lift(b, high), lift(a, high)],
          ...(boundary > 0 && { openingWall: true }),
        });
        outline.push(
          ...lift(a, low),
          ...lift(b, low),
          ...lift(a, high),
          ...lift(b, high),
        );
        if (boundary === 0 || "spans" in openings[boundary - 1]) {
          outline.push(...lift(a, low), ...lift(a, high));
          if (interval[1] < 1 - epsilon)
            outline.push(...lift(b, low), ...lift(b, high));
        }
      }
    }
  }
  return { faces, outline };
}

export function throughOpeningTriangles(
  size: V3,
  openings: readonly ThroughOpening[],
) {
  const { faces, outline } = throughOpeningSurface(size, openings);
  const positions: number[] = [];
  const normals: number[] = [];
  for (const { normal, points } of faces) {
    for (let i = 1; i < points.length - 1; i++) {
      positions.push(...points[0], ...points[i], ...points[i + 1]);
      normals.push(...normal, ...normal, ...normal);
    }
  }
  return { positions, normals, outline };
}
