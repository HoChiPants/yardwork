import {
  openingAxes,
  openingHalfSpans,
  pieceThroughOpenings,
} from "./throughOpenings";
import type { ThroughOpening } from "./throughOpeningSchema";
import type { Piece, V3 } from "./model";
import type { RodMountHoleInput } from "./rodFitSchema";
import { rotate } from "./spatial";

const epsilon = 1e-7;
type Axis = ThroughOpening["axis"];
type FaceVoid = { center: [number, number] } & (
  { radius: number } | { half: [number, number] }
);

export function socketFaceAxes(normal: V3) {
  const axis = ([0, 1, 2] as const).find(
    (i) =>
      Math.abs(Math.abs(normal[i]) - 1) < epsilon &&
      normal.every((value, j) => j === i || Math.abs(value) < epsilon),
  );
  return axis === undefined ? null : { axis, across: openingAxes(axis) };
}

/** Voids in a flat face, including a notch that opens onto the edge of a panel. */
function faceVoids(
  piece: Piece,
  axis: Axis,
  coordinate: number,
  tip = coordinate,
): FaceVoid[] {
  const across = openingAxes(axis);
  return pieceThroughOpenings(piece).flatMap((opening): FaceVoid[] => {
    if (opening.axis === axis)
      return [
        {
          center: opening.center,
          ...("diameter" in opening
            ? { radius: opening.diameter / 2 }
            : { half: openingHalfSpans(opening) }),
        },
      ];

    const openingPlane: readonly number[] = openingAxes(opening.axis);
    const depthIndex = openingPlane.indexOf(axis);
    const spanIndex = 1 - depthIndex;
    const target = opening.center[depthIndex];
    const delta = Math.max(
      0,
      Math.min(coordinate, tip) - target,
      target - Math.max(coordinate, tip),
    );
    const half = openingHalfSpans(opening);
    if (Math.abs(delta) > half[depthIndex] + epsilon) return [];
    const halfChord =
      "diameter" in opening
        ? Math.sqrt(Math.max(0, half[depthIndex] ** 2 - delta ** 2))
        : half[spanIndex];
    if (halfChord <= epsilon) return [];
    const chordAxis = openingPlane[spanIndex];
    const range = across.map((i) =>
      i === chordAxis ? halfChord : piece.size[i] / 2,
    ) as [number, number];
    const center = across.map((i) =>
      i === chordAxis ? opening.center[spanIndex] : 0,
    ) as [number, number];
    return [{ center, half: range }];
  });
}

function overlapsVoid(
  hole: FaceVoid,
  u: number,
  v: number,
  radius: number,
  tolerance: number,
) {
  const x = Math.abs(u - hole.center[0]);
  const y = Math.abs(v - hole.center[1]);
  if ("radius" in hole)
    return Math.hypot(x, y) < radius + hole.radius + tolerance;
  return (
    Math.hypot(Math.max(0, x - hole.half[0]), Math.max(0, y - hole.half[1])) <
    radius + tolerance
  );
}

export function rodEndCrossesCut(
  piece: Piece,
  local: V3,
  normal: V3,
  radius: number,
) {
  const frame = socketFaceAxes(normal);
  if (!frame) return false; // The model stores through-cuts only on rectangular blanks.
  const [u, v] = frame.across;
  return faceVoids(piece, frame.axis, local[frame.axis]).some((hole) =>
    overlapsVoid(hole, local[u], local[v], radius, -epsilon),
  );
}

/** Check the full cylindrical envelope from the wood face to the entered tip. */
export function socketBoreProblems(
  piece: Piece,
  entry: V3,
  normal: V3,
  diameter: number,
  depth: number,
) {
  const frame = socketFaceAxes(normal);
  if (!frame) return ["Mounting face axes are unavailable."];
  const {
    axis,
    across: [u, v],
  } = frame;
  const radius = diameter / 2;
  const tipAxis = entry[axis] - normal[axis] * depth;
  const withinDepth = normal[axis] * tipAxis > -piece.size[axis] / 2 + epsilon;
  const crossesEdge = [u, v].some(
    (i) => Math.abs(entry[i]) + radius >= piece.size[i] / 2 - epsilon,
  );
  const crossesProfile = piece.cutPlanes.some(({ normal: plane, constant }) => {
    const atFace =
      plane[axis] * entry[axis] + plane[u] * entry[u] + plane[v] * entry[v];
    const atTip = atFace + plane[axis] * (tipAxis - entry[axis]);
    const radial = radius * Math.hypot(plane[u], plane[v]);
    return (
      atFace + radial > constant + epsilon ||
      (atTip > atFace + epsilon && atTip + radial >= constant - epsilon)
    );
  });
  const crossesCut = faceVoids(piece, axis, entry[axis], tipAxis).some((hole) =>
    overlapsVoid(hole, entry[u], entry[v], radius, epsilon),
  );
  return [
    ...(!withinDepth ? ["reaches or passes the back of the panel"] : []),
    ...(crossesEdge ? ["reaches a panel edge"] : []),
    ...(crossesProfile ? ["reaches a trimmed panel face"] : []),
    ...(crossesCut ? ["intersects a through-cut"] : []),
  ];
}

export type BackplateExtents = [number, number, number, number];
export function reviewSocketPlateFace(
  piece: Piece,
  local: V3,
  normal: V3,
  extents: BackplateExtents,
) {
  const frame = socketFaceAxes(normal);
  if (!frame) return null;
  const [u, v] = frame.across;
  const [negativeU, positiveU, negativeV, positiveV] = extents;
  const low = [local[u] - negativeU, local[v] - negativeV];
  const high = [local[u] + positiveU, local[v] + positiveV];
  const corners = [
    [low[0], low[1]],
    [high[0], low[1]],
    [high[0], high[1]],
    [low[0], high[1]],
  ].map(([x, y]) => {
    const result = [...local] as V3;
    result[u] = x;
    result[v] = y;
    return result;
  });
  const crossesEdge =
    frame.across.some(
      (axis, i) =>
        low[i] < -piece.size[axis] / 2 - epsilon ||
        high[i] > piece.size[axis] / 2 + epsilon,
    ) ||
    corners.some((point) =>
      piece.cutPlanes.some(
        (plane) =>
          plane.normal.reduce((total, n, i) => total + n * point[i], 0) >
          plane.constant + epsilon,
      ),
    );
  const crossesVoid = faceVoids(piece, frame.axis, local[frame.axis]).some(
    (hole) => {
      if ("radius" in hole) {
        const [x, y] = hole.center;
        return (
          Math.hypot(
            Math.max(0, low[0] - x, x - high[0]),
            Math.max(0, low[1] - y, y - high[1]),
          ) <
          hole.radius - epsilon
        );
      }
      return [0, 1].every(
        (i) =>
          Math.min(high[i], hole.center[i] + hole.half[i]) -
            Math.max(low[i], hole.center[i] - hole.half[i]) >
          epsilon,
      );
    },
  );
  return { corners, crossesEdge, crossesVoid };
}

export function reviewWoodMountHoles(
  piece: Piece,
  face: { pointLocal: V3; normalLocal: V3 },
  extents: BackplateExtents,
  layout: RodMountHoleInput,
  backed: boolean,
) {
  const frame = socketFaceAxes(face.normalLocal);
  if (!frame) throw Error("Choose a flat mounting face with known axes.");
  const [u, v] = frame.across;
  const [negativeU, positiveU, negativeV, positiveV] = extents;
  const toWorld = (point: V3) =>
    rotate(point, piece.rotation).map((n, i) => n + piece.position[i]) as V3;
  const pathDepth = Math.max(layout.pilotDepth, layout.screwDepth);
  const diameter = Math.max(layout.pilotDiameter, layout.screwDiameter);
  const marks = layout.centers.map(([a, b], index) => {
    const entry = [...face.pointLocal] as V3;
    entry[u] += a;
    entry[v] += b;
    const issues = [
      ...(a < -negativeU || a > positiveU || b < -negativeV || b > positiveV
        ? ["Hole center is outside the recorded backplate."]
        : []),
      ...socketBoreProblems(
        piece,
        entry,
        face.normalLocal,
        layout.pilotDiameter,
        layout.pilotDepth,
      ).map((problem) => `Pilot envelope ${problem}.`),
      ...socketBoreProblems(
        piece,
        entry,
        face.normalLocal,
        layout.screwDiameter,
        layout.screwDepth,
      ).map((problem) => `Seated screw envelope ${problem}.`),
    ];
    const overlaps = layout.centers.flatMap(([otherA, otherB], at) =>
      at !== index && Math.hypot(a - otherA, b - otherB) <= diameter + epsilon
        ? [at + 1]
        : [],
    );
    if (overlaps.length)
      issues.push(`The entered path meets hole ${overlaps.join(", ")}.`);
    const tip = entry.map((n, i) => n - face.normalLocal[i] * pathDepth) as V3;
    const line: [V3, V3] = [toWorld(entry), toWorld(tip)];
    return { index: index + 1, local: entry, line, issues };
  });
  const conflict = !backed || marks.some(({ issues }) => issues.length);
  return {
    state: conflict ? ("conflict" as const) : ("checked" as const),
    marks,
    detail: !backed
      ? "Resolve the backplate conflict before using these mounting marks."
      : conflict
        ? "Review the flagged drill or screw paths."
        : `${marks.length} mounting ${marks.length === 1 ? "path fits" : "paths fit"} in the modeled panel.`,
  };
}
