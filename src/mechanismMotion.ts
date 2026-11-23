import { Quaternion, Vector3 } from "three";
import { drawerSlideMountGuideLines } from "./drawerSlideMounts";
import type { DrawerStopRequest } from "./drawerOpening";
import { doorwayHinge, doorwayLeafRole, doorJambMaterial } from "./doorWall";
import { doorHardwareRole } from "./doorHardwareReference";
import { drawerSlideKey, drawerSlidePurchaseReview, reviewDrawerSlide } from "./drawerSlides";
import { greenhouseDoorReview } from "./greenhouseDoors";
import { greenhouseVentReview } from "./greenhouseVents";
import { saunaDoorReview } from "./saunaDoors";
import { hingePoseAroundAxis } from "./hinges";
import { finishedPanel, measuredBandingByPanel } from "./edgeBanding";
import { lidWeightPose } from "./lidMotion";
import { reviewSiteSweepBand, sweepLidSiteFaces } from "./lidSiteClearance";
import { formatPreciseInches } from "./measurement";
import { hingeComponentExtrema, hingeOffsetAt, hingeOffsetSegments, hingeOffsetSpeed } from "./measuredHingePath";
import { sectionParts, uid, type Piece, type Project, type V3 } from "./model";
import { findClosestPairGap, firstPairClearanceStop, sweepPairClearance, type ClosestPairGap, type PairClearanceResult } from "./motionPairClearance";
import {
  motionGapPairKey,
  motionPlanInputSchema,
  motionPlanSchema,
  motionTestScenarioLimit,
  motionTestScenarioSchema,
  motionTestGapRequirements,
  motionTestSetupSchema,
  type MotionPlan,
  type MotionOpeningOrder,
  type MotionPairClearance,
  type MotionSequenceTargets,
  type MotionTestSetup,
} from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import {
  clearanceAxis,
  gapToSiteFace,
  siteClearanceFacesByPart,
  siteClearanceTolerance,
  worldClearanceProfiles,
  worldClearanceShape,
} from "./siteClearance";
import type { SiteClearance } from "./siteClearanceSchema";
import { sweepSlideSiteFace } from "./slideSiteClearance";
import {
  intervalSeparated,
  prepareCollisionSolid,
  slideOverlapInterval,
  solidGap,
  solidOverlap,
  swingIntervalSeparated,
  swingSeparated,
  transformCollisionSolid,
  translateCollisionSolid,
  type CollisionSolid,
  type GapEndpoints,
} from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";
import type { MotionCollisionFocus } from "./motionCamera";

const contactTolerance = 0.01;
const radians = Math.PI / 180;
const vector = (v: V3) => new Vector3(...v);
const add = (a: V3, b: V3) => a.map((n, i) => n + b[i]) as V3;
const subtract = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
const scale = (v: V3, n: number) => v.map((x) => x * n) as V3;
const axes = [0, 1, 2] as const;
export const motionDirections = [
  { label: "+X · Right", axis: [1, 0, 0] },
  { label: "−X · Left", axis: [-1, 0, 0] },
  { label: "+Y · Up", axis: [0, 1, 0] },
  { label: "−Y · Down", axis: [0, -1, 0] },
  { label: "+Z · Front", axis: [0, 0, 1] },
  { label: "−Z · Back", axis: [0, 0, -1] },
] satisfies { label: string; axis: V3 }[];
type Bounds = CollisionSolid["bounds"];
type Shape = { piece: Piece; solid: CollisionSolid };

function bounds(vertices: readonly V3[]): Bounds {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const point of vertices) {
    for (const i of axes) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  }
  return { min, max };
}

function shape(piece: Piece): Shape {
  const solid = prepareCollisionSolid(piece);
  if (solid) return { piece, solid };
  // Hardware/tubes without a supported filled profile use their exterior
  // envelope. A hit on that envelope is kept distinct from solid contact.
  const envelope = prepareCollisionSolid({
    ...piece,
    material: "plywood",
    cutPlanes: [],
  });
  if (!envelope) throw Error("The part has no usable collision envelope.");
  return { piece, solid: { ...envelope, kind: "envelope" } };
}

function members(project: Project, ids: string[]) {
  const active = new Map(
    project.pieces.filter((p) => !p.offcut).map((p) => [p.id, p]),
  );
  return ids.map((id) => {
    const piece = active.get(id);
    if (!piece)
      throw Error(
        "A moving part is missing or has become an offcut. Edit the motion to choose its parts again.",
      );
    return piece;
  });
}

function resolvedSeatLid(project: Project, plan: MotionPlan) {
  if (plan.mechanism.kind !== "hinge" || !plan.mechanism.seatLid) return;
  const { sectionId, hingePlanId } = plan.mechanism.seatLid;
  const closed = lidWeightPose(project, sectionId);
  if (plan.memberIds.length !== 1 || plan.memberIds[0] !== closed.piece.id)
    throw Error("The actual seat lid changed. Reconnect this storage lid under Test movement.");
  if (closed.mechanism?.planId !== hingePlanId)
    throw Error("The seat lid hinge selection changed. Reconnect the lid to use its current hinge.");
  return closed;
}

function resolvedMotion(project: Project, plan: MotionPlan): { parts: Piece[]; mechanism: WorldMechanism } {
  const lid = resolvedSeatLid(project, plan);
  if (lid && plan.mechanism.kind === "hinge") {
    return {
      parts: [lid.piece],
      mechanism: { ...plan.mechanism, axis: lid.axis, pivot: lid.pivot },
    };
  }
  const parts = members(project, plan.memberIds);
  const anchor = parts[0];
  const axis = rotate(plan.mechanism.axis, anchor.rotation);
  return {
    parts,
    mechanism:
      plan.mechanism.kind === "hinge"
        ? {
            ...plan.mechanism,
            axis,
            pivot: add(anchor.position, rotate(plan.mechanism.pivot, anchor.rotation)),
            ...(plan.mechanism.hingePath && {
              hingePath: plan.mechanism.hingePath.map(({ angle, offset }) => ({ angle, offset: rotate(offset, anchor.rotation) })),
            }),
          }
        : { ...plan.mechanism, axis },
  };
}

export function motionSetup(project: Project, plan: MotionPlan) {
  return { label: plan.label, memberIds: plan.memberIds, mechanism: resolvedMotion(project, plan).mechanism };
}

export function saveMotionPlan(
  project: Project,
  input: unknown,
  existingId?: string,
) {
  const draft = motionPlanInputSchema.parse(input);
  const anchor = members(project, draft.memberIds)[0];
  const plans = project.motionPlans ?? [];
  const existing = plans.find(({ id }) => id === existingId);
  if (existingId && !existing)
    throw Error("That motion plan is missing.");
  if (!existingId && plans.length >= 50)
    throw Error("A project can contain up to 50 motion plans.");
  const inverse = inverseRotation(anchor.rotation);
  const axis = rotate(draft.mechanism.axis, inverse);
  const mechanism =
    draft.mechanism.kind === "hinge"
      ? {
          ...draft.mechanism,
          axis,
          pivot: rotate(
            subtract(draft.mechanism.pivot, anchor.position),
            inverse,
          ),
          ...(draft.mechanism.hingePath && {
            hingePath: draft.mechanism.hingePath.map(({ angle, offset }) => ({ angle, offset: rotate(offset, inverse) })),
          }),
        }
      : { ...draft.mechanism, axis };
  const plan = motionPlanSchema.parse({
    ...draft,
    mechanism,
    id: existingId ?? uid(),
    ...(existing?.testSetup && { testSetup: existing.testSetup }),
    ...(existing?.testScenarios && { testScenarios: existing.testScenarios }),
  });
  return {
    plan,
    project: {
      ...project,
      motionPlans: existingId
        ? plans.map((row) => (row.id === existingId ? plan : row))
        : [...plans, plan],
    },
  };
}

export type MotionReferenceFrame = "workspace" | "moving-part";

/** Return the selected edge datum in workspace coordinates. */
export function motionPivotPreset(
  project: Project,
  ids: string[],
  edge: "left" | "right" | "back" | "front",
  frame: MotionReferenceFrame = "workspace",
) {
  const parts = members(project, ids);
  if (!parts.length) throw Error("Choose a moving part for the hinge.");
  const reference = frame === "moving-part" ? parts[0] : undefined;
  const vertices = reference
    ? localVertices(reference)
    : parts.flatMap((part) => shape(part).solid.vertices);
  const { min, max } = bounds(vertices);
  const center = min.map((n, i) => (n + max[i]) / 2) as V3;
  if (edge === "left" || edge === "right")
    center[0] = edge === "left" ? min[0] : max[0];
  else center[2] = edge === "back" ? min[2] : max[2];
  return reference
    ? add(reference.position, rotate(center, reference.rotation))
    : center;
}

function localVertices(part: Piece) {
  const inverse = inverseRotation(part.rotation);
  return shape(part).solid.vertices.map((point) =>
    rotate(subtract(point, part.position), inverse),
  );
}

type WorldMechanism = MotionPlan["mechanism"];
type MovingShape = Shape & {
  motion: WorldMechanism;
  rate: number;
  extrema: ReturnType<typeof sweptExtrema>;
};
type ContactShape = MovingShape | (Shape & { motion?: undefined });
export type PairClearanceFinding = {
  requirement: MotionPairClearance;
  result: PairClearanceResult;
  phase?: MotionPhase;
  findClosest?: MotionGapSearch;
};
export type ClosestMotionGap = ClosestPairGap & { phase?: MotionPhase };
export type MotionGapPair = Pick<MotionPairClearance, "movingId" | "otherId">;
export type MotionGapSearch = (signal?: AbortSignal) => Promise<ClosestMotionGap>;

type SiteMotionRow = { row: MovingShape; plane: SiteClearance };
type MotionSiteFinding = {
  plane: SiteClearance;
  movingId: string;
  status: ReturnType<typeof sweepSiteFace>["status"];
  inspectAt: number | null;
  held?: true;
};
export type MotionPhase = 0 | 1;
type ClearanceGuard = { requirement: MotionPairClearance; reason?: string };
type ClearanceStop = ClearanceGuard & { gap?: number };
export type MotionPlaybackLimit = {
  travel: number;
  inspectAt?: number;
  uncertain?: boolean;
  siteFaceId?: string;
  phase?: MotionPhase;
  clearanceStop?: ClearanceStop;
  gapEndpoints?: GapEndpoints;
  contact?: Pick<MotionHit, "movingId" | "obstacleId" | "kind" | "held">;
  approachFrom?: number;
};

function measureContactApproach(
  posePair: (at: number) => [CollisionSolid, CollisionSolid],
  from: number,
  overlapAt: number,
) {
  const direction = Math.sign(overlapAt - from);
  const distance = Math.abs(overlapAt - from);
  const at = (advanced: number) => from + direction * advanced;
  const intersects = (advanced: number) => solidOverlap(...posePair(at(advanced)), 0);
  if (!distance || intersects(0) || !intersects(distance)) return;

  // Bracket the contact from the approached side, without changing the
  // playback tolerance or the saved motion. A model already intersecting
  // at the start cannot supply a measured approach.
  let high = distance;
  let retreat = Math.min(distance, Math.max(1e-5, distance * 1e-6));
  let low = distance - retreat;
  while (low > 0 && intersects(low)) {
    high = low;
    retreat *= 2;
    low = Math.max(0, distance - retreat);
  }
  for (let i = 0; i < 24 && high - low > 1e-6; i++) {
    const mid = (low + high) / 2;
    if (intersects(mid)) high = mid;
    else low = mid;
  }
  const travel = at(Math.max(0, low - 1e-5));
  let endpoints: GapEndpoints | undefined;
  const gap = solidGap(...posePair(travel), (points) => { endpoints = points; });
  return endpoints ? { travel, endpoints, gap } : undefined;
}

function sweepSiteFace(
  { row, plane }: SiteMotionRow,
  from: number,
  to: number,
) {
  const axis = scale(row.motion.axis, Math.sign(to - from));
  const distance = Math.abs(to - from) * row.rate;
  const piece = posedPiece(row.piece, row.motion, from * row.rate);
  if (row.motion.kind === "slide") {
    const results = worldClearanceProfiles(piece).map(({ vertices }) =>
      sweepSlideSiteFace(vertices, axis, distance, plane),
    );
    const shortfalls = results.filter(({ status }) => status === "short");
    return (
      shortfalls.sort((a, b) => a.at! - b.at!)[0] ??
      results.find(({ status }) => status === "met") ??
      results[0]
    );
  }
  if (row.motion.hingePath) {
    const start = from * row.rate;
    const signedTravel = (to - from) * row.rate;
    const end = start + signedTravel;
    if (plane.top === null) {
      const extrema = sweptExtrema(row.solid, row.motion, Math.min(start, end), Math.max(start, end));
      const index = clearanceAxis(plane.side);
      const positive = plane.side.startsWith("+");
      const point = positive ? extrema.max[index] : extrema.min[index];
      const gap = (positive ? 1 : -1) * (plane.coordinate - point.value);
      return { status: gap < plane.minimum - siteClearanceTolerance ? "short" as const : "met" as const, at: Math.abs(point.at - start) };
    }
    const speed = row.extrema.radius * radians + hingeOffsetSpeed(row.motion.hingePath);
    return reviewSiteSweepBand(
      plane,
      distance,
      (at) => worldClearanceShape(posedPiece(row.piece, row.motion, start + Math.sign(signedTravel) * at)),
      (span) => speed * span / 2,
      1 / 64,
    );
  }
  const [{ status, angle }] = sweepLidSiteFaces(
    piece,
    row.motion.pivot,
    axis,
    distance,
    [plane],
  );
  return { status, at: angle };
}

function poseSolid(
  solid: CollisionSolid,
  mechanism: WorldMechanism,
  travel: number,
): CollisionSolid {
  if (travel === 0) return solid;
  if (mechanism.kind === "slide") {
    return translateCollisionSolid(solid, scale(mechanism.axis, travel));
  }
  const q = new Quaternion().setFromAxisAngle(
    vector(mechanism.axis),
    -travel * radians,
  );
  const turn = (p: V3) => vector(p).applyQuaternion(q).toArray();
  const center = mechanism.hingePath
    ? add(mechanism.pivot, hingeOffsetAt(mechanism.hingePath, travel))
    : mechanism.pivot;
  return transformCollisionSolid(
    solid,
    (p) => add(turn(subtract(p, mechanism.pivot)), center),
    turn,
  );
}

/** Include interior extrema of each rotating vertex, not just the two end poses. */
function sweptExtrema(
  shape: CollisionSolid,
  motion: WorldMechanism,
  start = 0,
  end = motion.travel,
) {
  const min = axes.map(() => ({ value: Infinity, at: 0 }));
  const max = axes.map(() => ({ value: -Infinity, at: 0 }));
  let radius = 0;
  const record = (i: number, value: number, at: number) => {
    if (value < min[i].value) min[i] = { value, at };
    if (value > max[i].value) max[i] = { value, at };
  };
  const segments = motion.kind === "hinge" && motion.hingePath
    ? hingeOffsetSegments(motion.hingePath, start, end) : undefined;
  const startAngle = start * radians;
  const endAngle = end * radians;
  for (const vertex of shape.vertices) {
    if (motion.kind === "slide") {
      for (const i of axes) {
        record(i, vertex[i] + motion.axis[i] * start, start);
        record(i, vertex[i] + motion.axis[i] * end, end);
      }
      continue;
    }
    const axis = vector(motion.axis);
    const relative = vector(subtract(vertex, motion.pivot));
    const parallel = axis.clone().multiplyScalar(relative.dot(axis));
    const center = parallel.clone().add(vector(motion.pivot)).toArray();
    const cos = relative.clone().sub(parallel);
    const sin = relative.clone().cross(axis).toArray();
    const radial = cos.toArray();
    radius = Math.max(radius, cos.length());
    for (const i of axes) {
      if (segments) {
        hingeComponentExtrema(segments, i, center[i], radial[i], sin[i], (value, at) => record(i, value, at));
        continue;
      }
      const turning = Math.atan2(sin[i], radial[i]);
      for (const theta of [
        startAngle,
        endAngle,
        turning,
        turning + Math.PI,
        turning - Math.PI,
        turning + 2 * Math.PI,
      ]) {
        if (theta >= startAngle && theta <= endAngle)
          record(
            i,
            center[i] + radial[i] * Math.cos(theta) + sin[i] * Math.sin(theta),
            theta / radians,
          );
      }
    }
  }
  return {
    min,
    max,
    radius,
    bounds: {
      min: min.map((entry) => entry.value) as V3,
      max: max.map((entry) => entry.value) as V3,
    },
  };
}

export function motionBoundsOverlap(a: Bounds, b: Bounds, margin = 0) {
  return axes.every((i) => a.max[i] + margin >= b.min[i] && b.max[i] + margin >= a.min[i]);
}

type MotionHit = {
  movingId: string;
  obstacleId: string;
  kind: "solid" | "envelope" | "uncertain";
  held?: true;
  first: number;
  inspectAt: number;
  closingAt: number;
};

function swingHit(
  moving: CollisionSolid,
  fixed: CollisionSolid,
  mechanism: WorldMechanism & { kind: "hinge" },
  radius: number,
) {
  // Use a conservative bound on every point's angular displacement to
  // certify intervals. Subdivide near contact until an overlapping pose is
  // found or the interval must be reported as unresolved.
  type Contact = {
    first: number;
    inspectAt: number;
    uncertain: boolean;
    unresolvedBefore?: number;
  };
  const possible: { hit?: Contact } = {};
  let visited = 0;
  const search = (start: number, end: number): Contact | null => {
    const center = (start + end) / 2;
    if (++visited > 4096) {
      possible.hit ??= { first: start, inspectAt: center, uncertain: true };
      return null;
    }
    const middle = poseSolid(moving, mechanism, center);
    const halfAngle = (end - start) * radians / 2;
    if (
      swingSeparated(
        middle,
        fixed,
        mechanism.axis,
        radius * halfAngle,
        contactTolerance,
      ) || swingIntervalSeparated(middle, fixed, mechanism.pivot, mechanism.axis, halfAngle, contactTolerance)
    )
      return null;
    if (end - start > 1 / 512)
      return search(start, center) ?? search(center, end);
    for (const point of [start, center, end]) {
      const pose =
        point === center ? middle : poseSolid(moving, mechanism, point);
      if (solidOverlap(pose, fixed, contactTolerance))
        return { first: start, inspectAt: point, uncertain: false };
    }
    possible.hit ??= { first: start, inspectAt: center, uncertain: true };
    return null;
  };
  const confirmed = search(0, mechanism.travel);
  const earlier = possible.hit;
  return confirmed && earlier
    ? { ...confirmed, unresolvedBefore: earlier.first }
    : (confirmed ?? earlier ?? null);
}

const workZoneNames = ["left", "right", "floor", "ceiling", "rear", "front"];
function poseExtrema(bounds: Bounds, at: number) {
  return {
    min: bounds.min.map((value) => ({ value, at })),
    max: bounds.max.map((value) => ({ value, at })),
  };
}

function workZoneHits(
  project: Project,
  extrema: Pick<ReturnType<typeof sweptExtrema>, "min" | "max">,
) {
  const zone = project.workZone;
  if (!zone) return [];
  const low = [-zone.width / 2, 0, -zone.depth / 2];
  const high = [zone.width / 2, zone.height, zone.depth / 2];
  return axes.flatMap((i) => [
    ...(extrema.min[i].value < low[i] - contactTolerance
      ? [{ label: workZoneNames[2 * i], inspectAt: extrema.min[i].at }]
      : []),
    ...(extrema.max[i].value > high[i] + contactTolerance
      ? [{ label: workZoneNames[2 * i + 1], inspectAt: extrema.max[i].at }]
      : []),
  ]);
}

function overlapAlong(
  moving: CollisionSolid,
  fixed: CollisionSolid,
  mechanism: WorldMechanism,
  radius: number,
) {
  if (solidOverlap(moving, fixed, contactTolerance))
    return { first: 0, inspectAt: 0, uncertain: false };
  if (mechanism.kind === "hinge")
    return swingHit(moving, fixed, mechanism, radius);
  const interval = slideOverlapInterval(
    moving,
    fixed,
    mechanism.axis,
    mechanism.travel,
    contactTolerance,
  );
  if (!interval) return null;
  const inset = Math.min(0.03, (interval.exit - interval.enter) / 2);
  return {
    first: interval.enter,
    inspectAt: interval.enter + inset,
    uncertain: false,
  };
}

function motionSolid(row: ContactShape, travel: number) {
  return row.motion
    ? poseSolid(row.solid, row.motion, travel * row.rate)
    : row.solid;
}

function projectedMotionSpeed(row: ContactShape, direction?: V3) {
  const motion = row.motion;
  if (!motion) return 0;
  const axis = vector(motion.axis);
  if (motion.kind === "slide")
    return row.rate * (direction ? Math.abs(axis.dot(vector(direction))) : 1);
  const radial = row.extrema.radius * radians *
    (direction ? axis.cross(vector(direction)).length() : 1);
  const drift = motion.hingePath ? hingeOffsetSpeed(motion.hingePath, direction) : 0;
  return row.rate * (radial + drift);
}

function separationSpeed(first: ContactShape, second: ContactShape, axis?: V3) {
  if (first.motion === second.motion) return 0;
  const velocity = (row: ContactShape) =>
    row.motion && row.motion.kind === "slide" ? scale(row.motion.axis, row.rate) : [0, 0, 0] as V3;
  const relative = vector(subtract(velocity(first), velocity(second)));
  return (axis ? Math.abs(relative.dot(vector(axis))) : relative.length()) +
    [first, second].reduce((sum, row) => row.motion?.kind === "hinge"
      ? sum + projectedMotionSpeed(row, axis) : sum, 0);
}

function pairOverlap(a: ContactShape, b: ContactShape, travel: number) {
  return solidOverlap(
    motionSolid(a, travel),
    motionSolid(b, travel),
    contactTolerance,
  );
}

function contactAlong(
  a: MovingShape,
  b: ContactShape,
  from: number,
  to: number,
): {
  first: number;
  inspectAt: number;
  uncertain: boolean;
  unresolvedBefore?: number;
} | null {
  const direction = Math.sign(to - from);
  const span = Math.abs(to - from);
  const first = motionSolid(a, from);
  const second = motionSolid(b, from);
  if (!b.motion && (a.motion.kind !== "hinge" || !a.motion.hingePath)) {
    const hit = overlapAlong(
      first,
      second,
      {
        ...a.motion,
        axis: scale(a.motion.axis, direction),
        travel: span * a.rate,
      },
      a.extrema.radius,
    );
    return (
      hit && {
        ...hit,
        first: hit.first / a.rate,
        inspectAt: hit.inspectAt / a.rate,
        ...("unresolvedBefore" in hit &&
        typeof hit.unresolvedBefore === "number"
          ? { unresolvedBefore: hit.unresolvedBefore / a.rate }
          : {}),
      }
    );
  }
  if (solidOverlap(first, second, contactTolerance))
    return { first: 0, inspectAt: 0, uncertain: false };
  if (a.motion.kind === "slide" && b.motion && b.motion.kind === "slide") {
    const relative = scale(
      subtract(scale(a.motion.axis, a.rate), scale(b.motion.axis, b.rate)),
      direction,
    );
    const interval = slideOverlapInterval(
      first,
      second,
      relative,
      span,
      contactTolerance,
    );
    return (
      interval && {
        first: interval.enter,
        inspectAt:
          interval.enter + Math.min(0.03, (interval.exit - interval.enter) / 2),
        uncertain: false,
      }
    );
  }
  const poseAt = (travel: number) => from + direction * travel;
  const possible: {
    hit?: { first: number; inspectAt: number; uncertain: boolean };
  } = {};
  const search = (
    start: number,
    end: number,
    depth: number,
  ): {
    first: number;
    inspectAt: number;
    uncertain: boolean;
  } | null => {
    const center = (start + end) / 2;
    if (
      intervalSeparated(
        motionSolid(a, poseAt(center)),
        motionSolid(b, poseAt(center)),
        (axis) =>
          ((projectedMotionSpeed(a, axis) + projectedMotionSpeed(b, axis)) *
            (end - start)) /
          2,
        contactTolerance,
      )
    )
      return null;
    if (depth < 12)
      return search(start, center, depth + 1) ?? search(center, end, depth + 1);
    for (const point of [start, center, end])
      if (pairOverlap(a, b, poseAt(point)))
        return { first: start, inspectAt: point, uncertain: false };
    possible.hit ??= { first: start, inspectAt: center, uncertain: true };
    return null;
  };
  const confirmed = search(0, span, 0);
  if (confirmed && possible.hit)
    return { ...confirmed, unresolvedBefore: possible.hit.first };
  return confirmed ?? possible.hit ?? null;
}

function posedPiece(piece: Piece, mechanism: WorldMechanism, travel: number) {
  if (travel === 0) return piece;
  if (mechanism.kind === "hinge") {
    const pose = hingePoseAroundAxis(piece, mechanism.pivot, mechanism.axis, travel);
    return mechanism.hingePath
      ? { ...pose, position: add(pose.position, hingeOffsetAt(mechanism.hingePath, travel)) }
      : pose;
  }
  return {
    ...piece,
    position: add(piece.position, scale(mechanism.axis, travel)),
  };
}

/** Resolve a saved hinge for a separate installation scenario without moving the saved parts. */
export function installationHinge(project: Project, plan: MotionPlan) {
  const bound = boundMotionReview(project, plan);
  if (bound?.warning) throw Error(bound.warning);
  const { parts, mechanism } = resolvedMotion(project, plan);
  if (mechanism.kind !== "hinge") throw Error("Choose a saved hinged door for this route.");
  return { parts, mechanism, poseAt: (angle: number) => parts.map((piece) => posedPiece(piece, mechanism, motionPosition(angle, mechanism.travel))) };
}

function motionPosition(requested: number, travel: number) {
  if (!Number.isFinite(requested))
    throw Error("Choose a finite opening position.");
  return Math.min(travel, Math.max(0, requested));
}

export function canParkMotion(
  project: Project,
  active: MotionPlan,
  other: MotionPlan,
  held: readonly MotionPlan[] = [],
) {
  const occupied = [active, ...held];
  const occupiedIds = new Set(occupied.flatMap((plan) => plan.memberIds));
  const available = new Set(
    project.pieces.filter((p) => !p.offcut).map((p) => p.id),
  );
  return (
    occupied.every((plan) => plan.id !== other.id) &&
    other.memberIds.every((id) => available.has(id) && !occupiedIds.has(id))
  );
}

export type HeldMotion = { plan: MotionPlan; travel: number };

export function resolveMotionTestSetup(project: Project, setup?: MotionTestSetup) {
  const plans = new Map(project.motionPlans?.map((plan) => [plan.id, plan]));
  const find = (id: string) => {
    const plan = plans.get(id);
    if (!plan)
      throw Error("A motion in this test setup was removed. Reset the setup to test again.");
    return plan;
  };
  const linked = setup?.linkedId ? find(setup.linkedId) : undefined;
  if (!linked && setup?.sequenceTargets?.companion)
    throw Error("Choose a second motion before setting its travel target.");
  const held = (setup?.held ?? []).map(({ motionId, percent }): HeldMotion => {
    const plan = find(motionId);
    return { plan, travel: (plan.mechanism.travel * percent) / 100 };
  });
  return { held, linked };
}

function checkMotionTestReferences(project: Project, active: MotionPlan, setup: MotionTestSetup) {
  members(project, active.memberIds);
  const { held, linked } = resolveMotionTestSetup(project, setup);
  const occupied: MotionPlan[] = [];
  for (const other of [linked, ...held.map(({ plan }) => plan)]) {
    if (!other) continue;
    if (!canParkMotion(project, active, other, occupied))
      throw Error("Choose test motions with their own active moving parts.");
    occupied.push(other);
  }
  motionTestTravel(active, setup.sequenceTargets?.selected);
  if (linked) motionTestTravel(linked, setup.sequenceTargets?.companion);
  for (const requirement of motionTestGapRequirements(setup)) {
    members(project, [requirement.movingId, requirement.otherId]);
    if (!hasClearanceMovingPart(active, linked, requirement))
      throw Error("Choose a part moving in this test for each clearance check.");
  }
}

function hasClearanceMovingPart(active: MotionPlan, linked: MotionPlan | undefined, requirement: MotionPairClearance) {
  return [active, linked].some((plan) => plan?.memberIds.includes(requirement.movingId));
}

export function saveMotionTestSetup(
  project: Project,
  planId: string,
  setup?: MotionTestSetup,
) {
  const plans = project.motionPlans ?? [];
  const active = plans.find(({ id }) => id === planId);
  if (!active) throw Error("That motion plan is missing.");
  const testSetup = setup && motionTestSetupSchema.parse(setup);
  if (testSetup) checkMotionTestReferences(project, active, testSetup);
  const { testSetup: _previous, ...plan } = active;
  return {
    ...project,
    motionPlans: plans.map((row) => row.id === planId
      ? { ...plan, ...(testSetup && { testSetup }) }
      : row),
  };
}

export function saveMotionTestScenario(project: Project, planId: string, name: string, setup: MotionTestSetup) {
  const plans = project.motionPlans ?? [];
  const active = plans.find(({ id }) => id === planId);
  if (!active) throw Error("That motion plan is missing.");
  const scenarios = active.testScenarios ?? [];
  const existing = scenarios.find((row) => row.name.toLowerCase() === name.trim().toLowerCase());
  if (!existing && scenarios.length >= motionTestScenarioLimit)
    throw Error(`Keep up to ${motionTestScenarioLimit} named clearance tests per motion.`);
  const scenario = motionTestScenarioSchema.parse({ id: existing?.id ?? uid(), name, setup });
  checkMotionTestReferences(project, active, scenario.setup);
  const testScenarios = existing
    ? scenarios.map((row) => row.id === scenario.id ? scenario : row)
    : [...scenarios, scenario];
  return {
    scenario,
    project: { ...project, motionPlans: plans.map((row) => row.id === planId ? { ...row, testScenarios } : row) },
  };
}

export function removeMotionTestScenario(project: Project, planId: string, scenarioId: string): Project {
  return {
    ...project,
    motionPlans: project.motionPlans?.map((row) => {
      if (row.id !== planId || !row.testScenarios?.some(({ id }) => id === scenarioId)) return row;
      const { testScenarios, ...plan } = row;
      const remaining = testScenarios.filter(({ id }) => id !== scenarioId);
      return remaining.length ? { ...plan, testScenarios: remaining } : plan;
    }),
  };
}

function doorwayMotionReview(project: Project, plan: MotionPlan): { warning: string | null; lines?: string[] } | null {
  if (plan.mechanism.kind !== "hinge" || !plan.mechanism.doorway) return null;
  const { sectionId } = plan.mechanism.doorway;
  const section = project.sections.find(({ id }) => id === sectionId);
  const command = section?.generator;
  const leaf = project.pieces.find(({ id, offcut }) => id === plan.memberIds[0] && !offcut);
  const warning = { warning: "The fitted door or hinge measurements changed. Open the doorway planner and preview the door again." };
  if (!section || !command?.doorUnit || !leaf || leaf.designRole !== doorwayLeafRole || !section.pieceIds.includes(leaf.id)) return warning;
  const same = (a: V3, b: V3) => a.every((value, i) => Math.abs(value - b[i]) < 1e-6);
  if (!same(rotate([0, 1, 0], section.rotation), [0, 1, 0]))
    return { warning: "The wall is tilted. Restore an upright wall before reviewing the interior door swing." };
  const hinge = doorwayHinge(command.doorUnit);
  if (!same(hinge.pivot, plan.mechanism.pivot) || !same(hinge.axis, plan.mechanism.axis) || hinge.travel !== plan.mechanism.travel) return warning;
  const actual = project.pieces.filter(({ id, offcut }) => !offcut && section.pieceIds.includes(id));
  const expected = sectionParts(command, leaf.stepId, section.name, section.origin, section.rotation)
    .filter(({ designRole, material }) => designRole === doorwayLeafRole || material === doorJambMaterial || doorHardwareRole(designRole));
  const moving = expected.filter(({ designRole }) => designRole === doorwayLeafRole || doorHardwareRole(designRole));
  if (plan.memberIds.length !== moving.length || !moving.every(({ designRole }) =>
    actual.some(({ id, designRole: role }) => role === designRole && plan.memberIds.includes(id)))) return warning;
  if (!expected.every((part) => actual.some(({ designRole, material, position, rotation, size, cutPlanes, rectangularOpenings, roundOpenings }) =>
    part.designRole === designRole && part.material === material && same(part.position, position) && same(part.rotation, rotation) &&
    same(part.size, size) && !cutPlanes.length && !rectangularOpenings?.length && !roundOpenings?.length))) return warning;
  return { warning: null, lines: [command.doorUnit.hardware
    ? "Swing carries both measured hardware envelopes with the leaf. Confirm the actual handle shape and installed stop in the room."
    : "Swing uses the measured closed leaf and vertical hinge pin. Check the installed stops, casing and hardware before fitting the trim."] };
}

function boundMotionReview(project: Project, plan: MotionPlan) {
  if (plan.mechanism.kind === "hinge" && plan.mechanism.seatLid) {
    try {
      const seat = resolvedSeatLid(project, plan)!;
      const hinge = seat.mechanism ? `measured hinge axis (${seat.mechanism.label})` : "provisional rear pivot";
      return { warning: null, lines: [
        `This test follows the rigid seat panel from its closed pose using the ${hinge}. Review stays, stops and other hardware in the individual lid check.`,
      ] };
    } catch (cause) {
      return { warning: cause instanceof Error ? cause.message : "Review the seat lid and its hinge." };
    }
  }
  return (
    greenhouseDoorReview(project, plan) ??
    greenhouseVentReview(project, plan) ??
    saunaDoorReview(project, plan) ??
    doorwayMotionReview(project, plan)
  );
}

export function reviewMotion(
  project: Project,
  plan: MotionPlan,
  held: readonly HeldMotion[] = [],
  linked?: MotionPlan,
  testedTravel = plan.mechanism.travel,
  linkedTravel = linked?.mechanism.travel,
) {
  const doorReview = boundMotionReview(project, plan);
  if (doorReview?.warning) throw Error(doorReview.warning);
  const parkedPieces = new Map<string, Piece>();
  const heldGroupByPart = new Map<string, string>();
  if (linked && !canParkMotion(project, plan, linked))
    throw Error("Choose another motion with its own active moving parts.");
  const linkedWarning = linked && boundMotionReview(project, linked)?.warning;
  if (linkedWarning) throw Error(linkedWarning);
  const heldPlans: MotionPlan[] = linked ? [linked] : [];
  for (const parked of held) {
    if (!canParkMotion(project, plan, parked.plan, heldPlans))
      throw Error("Choose another motion with its own active moving parts.");
    const parkedDoor = boundMotionReview(project, parked.plan);
    if (parkedDoor?.warning) throw Error(parkedDoor.warning);
    const { parts, mechanism: other } = resolvedMotion(project, parked.plan);
    const position = motionPosition(parked.travel, other.travel);
    for (const piece of parts) {
      parkedPieces.set(piece.id, posedPiece(piece, other, position));
      heldGroupByPart.set(piece.id, parked.plan.id);
    }
    heldPlans.push(parked.plan);
  }
  const main = resolvedMotion(project, plan);
  const second = linked && resolvedMotion(project, linked);
  const path = reviewMotionPath(project, main.parts, { ...main.mechanism, travel: testedTravel }, {
    parkedPieces,
    heldGroupByPart,
    linked: second && {
      parts: second.parts,
      mechanism: { ...second.mechanism, travel: linkedTravel ?? second.mechanism.travel },
    },
    measuredSite: true,
  });
  return {
    ...path,
    plan,
    linked,
    testedTravel,
    linkedTravel,
    preview(requested: number, inspectAt?: number, siteFaceId?: string) {
      const pose = path.preview(requested, inspectAt, siteFaceId);
      const limitedPair = linked && linkedTravel !== undefined &&
        (testedTravel !== plan.mechanism.travel || linkedTravel !== linked.mechanism.travel);
      return {
        ...pose,
        label: linked ? `${plan.label} + ${linked.label}` : plan.label,
        ...(limitedPair ? {
          positionText: `${plan.label} ${motionDistance(pose.travel, plan.mechanism.kind)} · ${linked.label} ${motionDistance(pose.travel * linkedTravel / testedTravel, linked.mechanism.kind)}`,
        } : {}),
      };
    },
  };
}

/** Include the full world-space sweep before selecting motion pairs to test. */
export function motionSweepBounds(project: Project, plan: MotionPlan, banding = measuredBandingByPanel(project)) {
  const warning = boundMotionReview(project, plan)?.warning;
  if (warning) throw Error(warning);
  const { parts, mechanism } = resolvedMotion(project, plan);
  return bounds(parts.flatMap((piece) => {
    const solid = shape(finishedPanel(piece, banding)).solid;
    const sweep = sweptExtrema(solid, mechanism).bounds;
    return [sweep.min, sweep.max];
  }));
}

type IndependentPose = {
  movingId: string;
  obstacleId: string;
  selectedTravel: number;
  companionTravel: number;
};
type IndependentContact = IndependentPose & { status: "solid" | "envelope" };
type IndependentGap = IndependentPose & (
  | { status: "short"; minimum: number; gap: number; endpoints?: GapEndpoints }
  | { status: "envelope-gap"; minimum: number }
);
export type IndependentMotionReview = IndependentContact | IndependentGap | { status: "clear" | "unresolved" };

/** Check independent openings. A pass needs a separation bound throughout each cell. */
export function independentlyMovingContact(
  project: Project, selected: MotionPlan, companion: MotionPlan, banding = measuredBandingByPanel(project), minimum = 0,
): IndependentMotionReview {
  if (!canParkMotion(project, selected, companion))
    throw Error("Choose two motions with separate moving parts.");
  if (minimum !== 0 && (!Number.isFinite(minimum) || minimum < 0.001 || minimum > 24))
    throw Error("Enter a minimum gap from 0.001 to 24 inches.");
  const requiredGap = minimum ? minimum - 1e-7 : 0;
  const group = (plan: MotionPlan): MovingShape[] => {
    const warning = boundMotionReview(project, plan)?.warning;
    if (warning) throw Error(warning);
    const { parts, mechanism: motion } = resolvedMotion(project, plan);
    return parts.map((piece) => {
      const row = shape(finishedPanel(piece, banding));
      return { ...row, motion, rate: 1, extrema: sweptExtrema(row.solid, motion) };
    });
  };
  const first = group(selected);
  const second = group(companion);
  type Range = [number, number];
  type Cell = { a: MovingShape; b: MovingShape; first: Range; second: Range };
  const cells: Cell[] = first.flatMap((a) => second.flatMap((b) =>
    motionBoundsOverlap(a.extrema.bounds, b.extrema.bounds, minimum)
      ? [{ a, b, first: [0, a.motion.travel], second: [0, b.motion.travel] }]
      : [],
  ));
  let unresolved = false;
  let envelope: IndependentContact | IndependentGap | undefined;
  const maxCells = 4096;
  for (let index = 0; index < cells.length; index++) {
    if (index === maxCells) return envelope ?? { status: "unresolved" };
    const cell = cells[index];
    const { a, b, first: [aStart, aEnd], second: [bStart, bEnd] } = cell;
    const aHalf = (aEnd - aStart) / 2, bHalf = (bEnd - bStart) / 2;
    const aAt = aStart + aHalf, bAt = bStart + bHalf;
    const aPose = motionSolid(a, aAt), bPose = motionSolid(b, bAt);
    if (intervalSeparated(aPose, bPose, (axis) =>
      requiredGap + aHalf * projectedMotionSpeed(a, axis) + bHalf * projectedMotionSpeed(b, axis),
      minimum ? 0 : contactTolerance))
      continue;
    const aReach = aHalf * projectedMotionSpeed(a), bReach = bHalf * projectedMotionSpeed(b);
    if (minimum) {
      let endpoints: GapEndpoints | undefined;
      const gap = solidGap(aPose, bPose, (points) => { endpoints = points; });
      if (gap < requiredGap) {
        const pose = { movingId: a.piece.id, obstacleId: b.piece.id, selectedTravel: aAt, companionTravel: bAt };
        if (aPose.kind === "solid" && bPose.kind === "solid")
          return { ...pose, status: "short", minimum, gap, endpoints };
        envelope ??= { ...pose, status: "envelope-gap", minimum };
        continue;
      }
      if (gap - aReach - bReach >= requiredGap) continue;
    } else if (solidOverlap(aPose, bPose, contactTolerance)) {
      const contact = { movingId: a.piece.id, obstacleId: b.piece.id, selectedTravel: aAt, companionTravel: bAt };
      if (aPose.kind === "solid" && bPose.kind === "solid") return { ...contact, status: "solid" };
      envelope ??= { ...contact, status: "envelope" };
      continue;
    }
    if (aReach + bReach <= 1 / 1024) {
      unresolved = true;
      continue;
    }
    // Split the axis with more possible displacement. Breadth first keeps a
    // near-touching corner from hiding a wider collision elsewhere.
    if (aReach >= bReach)
      cells.push({ ...cell, first: [aStart, aAt] }, { ...cell, first: [aAt, aEnd] });
    else
      cells.push({ ...cell, second: [bStart, bAt] }, { ...cell, second: [bAt, bEnd] });
  }
  return envelope ?? { status: unresolved ? "unresolved" : "clear" };
}

/** Check an already resolved world-space motion without saving a plan. */
export function reviewMotionPath(
  project: Project,
  parts: readonly Piece[],
  mechanism: WorldMechanism,
  {
    parkedPieces = new Map<string, Piece>(),
    heldGroupByPart = new Map<string, string>(),
    linked,
    additionalMotions = [],
    measuredSite = false,
  }: {
    parkedPieces?: ReadonlyMap<string, Piece>;
    heldGroupByPart?: ReadonlyMap<string, string>;
    linked?: { parts: readonly Piece[]; mechanism: WorldMechanism };
    additionalMotions?: readonly { parts: readonly Piece[]; mechanism: WorldMechanism }[];
    measuredSite?: boolean;
  } = {},
) {
  const banding = measuredBandingByPanel(project);
  const prepare = (
    members: readonly Piece[],
    motion: WorldMechanism,
  ): MovingShape[] => {
    const rate = motion.travel / mechanism.travel;
    if (!Number.isFinite(rate) || rate <= 0)
      throw Error("Choose travel distances that can be previewed together.");
    return members.map((piece) => shape(finishedPanel(piece, banding))).map((row) => ({
      ...row,
      motion,
      rate,
      extrema: sweptExtrema(row.solid, motion),
    }));
  };
  const groups = [
    prepare(parts, mechanism),
    ...(linked ? [prepare(linked.parts, linked.mechanism)] : []),
    ...additionalMotions.map(({ parts, mechanism }) => prepare(parts, mechanism)),
  ];
  const moving = groups.flat();
  const siteFacesByPart = measuredSite
    ? siteClearanceFacesByPart(project)
    : null;
  const siteRows = moving.flatMap((row) =>
    (siteFacesByPart?.get(row.piece.id) ?? []).map((plane) => ({ row, plane })),
  );
  const movingSite = siteRows.map(({ row, plane }) => {
    const result = sweepSiteFace({ row, plane }, 0, mechanism.travel);
    return {
      plane,
      movingId: row.piece.id,
      status: result.status,
      inspectAt: result.at === null ? null : result.at / row.rate,
    };
  });
  const ids = new Set(moving.map(({ piece }) => piece.id));
  const unresolvedIds: string[] = [];
  const modeledParked = new Map([...parkedPieces].map(([id, piece]) => [id, finishedPanel(piece, banding)]));
  const finishedFixedPieces: Piece[] = [];
  const fixed: Shape[] = project.pieces.flatMap((piece) => {
    if (piece.offcut || ids.has(piece.id)) return [];
    try {
      const parked = modeledParked.get(piece.id);
      const model = parked ?? finishedPanel(piece, banding);
      if (!parked && model !== piece) finishedFixedPieces.push(model);
      return [shape(model)];
    } catch {
      unresolvedIds.push(piece.id);
      return [];
    }
  });
  const fixedById = new Map(fixed.map((row) => [row.piece.id, row]));
  const candidates = groups.flatMap((group, index) => {
    // Compare separate moving groups once. Parts carried by the same motion stay rigidly together.
    const obstacles: ContactShape[] = [...fixed, ...groups.slice(index + 1).flat()];
    return group.map((row) => obstacles.filter((other) =>
      motionBoundsOverlap(row.extrema.bounds, other.motion ? other.extrema.bounds : other.solid.bounds)));
  });
  const held = fixed.map((row, index) => ({ row, index, group: heldGroupByPart.get(row.piece.id) }))
    .filter(({ group }) => group !== undefined);
  const heldHits: MotionHit[] = held.flatMap(({ row, index, group }) =>
    fixed.flatMap((other, otherIndex) => {
      const otherGroup = heldGroupByPart.get(other.piece.id);
      if (group === otherGroup || (otherGroup !== undefined && otherIndex < index)) return [];
      if (!motionBoundsOverlap(row.solid.bounds, other.solid.bounds) ||
          !solidOverlap(row.solid, other.solid, contactTolerance)) return [];
      const kind = row.solid.kind === "solid" && other.solid.kind === "solid" ? "solid" : "envelope";
      return [{
        movingId: row.piece.id, obstacleId: other.piece.id, kind, held: true,
        first: 0, inspectAt: 0, closingAt: mechanism.travel,
      }];
    }),
  );
  const heldZone = held.flatMap(({ row }) =>
    workZoneHits(project, poseExtrema(row.solid.bounds, 0)).map((hit) => ({
      ...hit, movingId: row.piece.id, held: true as const,
    })),
  );
  const heldSite = held.flatMap(({ row }) => {
    const faces = siteFacesByPart?.get(row.piece.id);
    if (!faces?.length) return [];
    const shape = worldClearanceShape(row.piece);
    return faces.flatMap((plane) => {
      const gap = gapToSiteFace(shape, plane);
      if (gap === null || gap >= plane.minimum - siteClearanceTolerance) return [];
      return [{ plane, movingId: row.piece.id, status: "short" as const, inspectAt: 0, held: true as const }];
    });
  });
  const site: MotionSiteFinding[] = [...movingSite, ...heldSite];
  const hits = [...heldHits];
  const zone = [...heldZone, ...moving.flatMap((row) =>
    workZoneHits(project, row.extrema).map((hit) => ({
      ...hit,
      inspectAt: hit.inspectAt / row.rate,
      movingId: row.piece.id,
      held: false as const,
    })),
  )];
  for (const [index, row] of moving.entries()) {
    for (const other of candidates[index]) {
      const opening = contactAlong(row, other, 0, mechanism.travel);
      if (!opening) continue;
      const closing = opening.uncertain
        ? null
        : contactAlong(row, other, mechanism.travel, 0);
      hits.push({
        movingId: row.piece.id,
        obstacleId: other.piece.id,
        kind: opening.uncertain
          ? "uncertain"
          : row.solid.kind === "envelope" || other.solid.kind === "envelope"
            ? "envelope"
            : "solid",
        first: opening.first,
        inspectAt: opening.inspectAt,
        closingAt:
          closing && !closing.uncertain
            ? mechanism.travel - closing.inspectAt
            : opening.inspectAt,
      });
    }
  }
  hits.sort((a, b) => a.first - b.first);
  const sweepBounds = bounds(
    moving.flatMap((row) => [row.extrema.bounds.min, row.extrema.bounds.max]),
  );
  const guideLine: [V3, V3] = (() => {
    if (mechanism.kind === "slide") {
      const origin = moving[0].piece.position;
      return [origin, add(origin, scale(mechanism.axis, mechanism.travel))];
    }
    const { pivot, axis } = mechanism;
    const direction = vector(axis);
    let start = 0;
    let end = 0;
    for (const { solid } of moving)
      for (const vertex of solid.vertices) {
        const distance = vector(subtract(vertex, pivot)).dot(direction);
        start = Math.min(start, distance);
        end = Math.max(end, distance);
      }
    const margin = 0.75;
    return [
      add(pivot, scale(axis, start - margin)),
      add(pivot, scale(axis, end + margin)),
    ];
  })();

  function checkPose(travel: number) {
    const interference = new Set<string>();
    const obstacles = new Map<string, string>();
    const outsideZone = new Set(heldZone.map(({ label }) => label));
    const siteFaces = new Map(heldSite.map(({ plane }) => [plane.id, plane.label]));
    let contact: MotionPlaybackLimit["contact"];
    for (const { movingId, obstacleId, kind } of heldHits) {
      interference.add(movingId);
      interference.add(obstacleId);
      const obstacle = fixedById.get(obstacleId)!.piece;
      obstacles.set(obstacleId, obstacle.name);
      if (!contact || (kind === "solid" && contact.kind !== "solid"))
        contact = { movingId, obstacleId, kind, held: true };
    }
    for (const [index, row] of moving.entries()) {
      const pose = motionSolid(row, travel);
      for (const other of candidates[index]) {
        if (!solidOverlap(pose, motionSolid(other, travel), contactTolerance))
          continue;
        interference.add(row.piece.id);
        interference.add(other.piece.id);
        obstacles.set(other.piece.id, other.piece.name);
        const kind = pose.kind === "solid" && other.solid.kind === "solid" ? "solid" : "envelope";
        if (!contact || (kind === "solid" && contact.kind !== "solid"))
          contact = { movingId: row.piece.id, obstacleId: other.piece.id, kind };
      }
      if (project.workZone) {
        for (const { label } of workZoneHits(project, poseExtrema(pose.bounds, travel)))
          outsideZone.add(label);
      }
      const faces = siteFacesByPart?.get(row.piece.id);
      if (faces?.length) {
        const shape = worldClearanceShape(
          posedPiece(row.piece, row.motion, travel * row.rate),
        );
        for (const face of faces) {
          const gap = gapToSiteFace(shape, face);
          if (gap !== null && gap < face.minimum - siteClearanceTolerance)
            siteFaces.set(face.id, face.label);
        }
      }
    }
    return {
      interferenceIds: [...interference],
      obstacleNames: [...obstacles.values()],
      outsideZoneFaces: [...outsideZone],
      siteFaceHits: [...siteFaces.keys()],
      siteFaceNames: [...siteFaces.values()],
      envelopeOnly: contact?.kind === "envelope",
      contact,
    };
  }

  function gapGeometry({ movingId, otherId }: MotionGapPair) {
    if (movingId === otherId) return "Choose two different parts.";
    const get = (id: string) => moving.find(({ piece }) => piece.id === id) ??
      fixedById.get(id);
    const first = get(movingId);
    const second = get(otherId);
    if (!first || !second) return "A selected part is missing or has no usable geometry.";
    if (first.solid.kind === "envelope" || second.solid.kind === "envelope")
      return "A selected part has an exterior envelope only. Measure the actual gap.";
    const posePair = (at: number): [CollisionSolid, CollisionSolid] => [motionSolid(first, at), motionSolid(second, at)];
    const localMarks = (at: number, endpoints: GapEndpoints): GapEndpoints => {
      const toLocal = (row: ContactShape, point: V3) => {
        const pose = row.motion ? posedPiece(row.piece, row.motion, at * row.rate) : row.piece;
        return rotate(subtract(point, pose.position), inverseRotation(pose.rotation));
      };
      return [toLocal(first, endpoints[0]), toLocal(second, endpoints[1])];
    };
    const speedBound = (axis?: V3) => separationSpeed(first, second, axis);
    const findClosest: MotionGapSearch = (signal) => findClosestPairGap(mechanism.travel, posePair, speedBound, signal);
    return { posePair, speedBound, findClosest, localMarks };
  }

  return {
    hits,
    zone,
    site,
    siteFindings: site.filter(
      ({ status }) => status === "short" || status === "needs-review",
    ),
    unresolvedIds,
    bounds: sweepBounds,
    gapSearch(pair: MotionGapPair): MotionGapSearch | undefined {
      const geometry = gapGeometry(pair);
      return typeof geometry === "string" ? undefined : geometry.findClosest;
    },
    contactApproach(stop: MotionPlaybackLimit) {
      const { contact, approachFrom, inspectAt } = stop;
      if (contact?.kind !== "solid" || approachFrom === undefined || inspectAt === undefined) return;
      const geometry = gapGeometry({ movingId: contact.movingId, otherId: contact.obstacleId });
      if (typeof geometry === "string") return;
      const witness = measureContactApproach(geometry.posePair, approachFrom, inspectAt);
      return witness && { ...witness, localMarks: geometry.localMarks(witness.travel, witness.endpoints) };
    },
    pairClearance(requirement: MotionPairClearance): PairClearanceFinding {
      const geometry = gapGeometry(requirement);
      if (typeof geometry === "string")
        return { requirement, result: { status: "needs-review", reason: geometry } };
      const { posePair, speedBound, findClosest } = geometry;
      try {
        return { requirement, result: sweepPairClearance(requirement.minimum, mechanism.travel, posePair, speedBound), findClosest };
      } catch {
        return { requirement, result: { status: "needs-review", reason: "The modeled profiles could not be measured. Verify the gap on site." } };
      }
    },
    playbackLimit(
      requestedFrom: number,
      requestedTo: number,
      clearances: readonly ClearanceGuard[] = [],
    ): MotionPlaybackLimit {
      const from = motionPosition(requestedFrom, mechanism.travel);
      const to = motionPosition(requestedTo, mechanism.travel);
      if (from === to) return { travel: from };
      const startStatus = checkPose(from);
      if (
        startStatus.interferenceIds.length ||
        startStatus.outsideZoneFaces.length ||
        startStatus.siteFaceHits.length
      )
        return {
          travel: from,
          inspectAt: from,
          ...(startStatus.contact ? { contact: startStatus.contact } : {}),
          ...(startStatus.siteFaceHits.length
            ? { siteFaceId: startStatus.siteFaceHits[0] }
            : {}),
        };

      const direction = Math.sign(to - from);
      const precision = mechanism.kind === "hinge" ? 0.001 : 0.0001;
      let target = Math.abs(to - from);
      let inspection: number | undefined;
      let uncertain = false;
      let siteFaceId: string | undefined;
      let contact: MotionPlaybackLimit["contact"];
      const recordContact = (
        clear: number,
        hit: number,
        possible = false,
        faceId?: string,
        pair?: MotionPlaybackLimit["contact"],
      ) => {
        if (clear <= target) {
          target = clear;
          inspection = hit;
          uncertain = possible;
          siteFaceId = faceId;
          contact = pair;
        }
      };
      for (const [index, row] of moving.entries()) {
        for (const other of candidates[index]) {
          const hit = contactAlong(row, other, from, to);
          if (!hit) continue;
          const pair = { movingId: row.piece.id, obstacleId: other.piece.id };
          if (hit.uncertain) {
            recordContact(Math.max(0, hit.first - precision), hit.inspectAt, true, undefined, { ...pair, kind: "uncertain" });
            continue;
          }
          if (hit.unresolvedBefore !== undefined) {
            recordContact(Math.max(0, hit.unresolvedBefore - precision), hit.inspectAt, true, undefined, { ...pair, kind: "uncertain" });
            continue;
          }
          let low = Math.max(0, hit.first - precision);
          let high = hit.inspectAt;
          if (low > target) continue;
          const overlaps = (travel: number) =>
            pairOverlap(row, other, from + direction * travel);
          while (high - low > precision) {
            const mid = (low + high) / 2;
            if (overlaps(mid)) high = mid;
            else low = mid;
          }
          const kind = row.solid.kind === "envelope" || other.solid.kind === "envelope" ? "envelope" : "solid";
          recordContact(low, high, false, undefined, { ...pair, kind });
        }
        if (!project.workZone) continue;
        const start = from * row.rate;
        const zoneDuring = (distance: number) => {
          const end = (from + direction * distance) * row.rate;
          return workZoneHits(
            project,
            sweptExtrema(row.solid, row.motion, Math.min(start, end), Math.max(start, end)),
          );
        };
        if (!zoneDuring(target).length) continue;
        let low = 0;
        let high = target;
        while (high - low > precision) {
          const mid = (low + high) / 2;
          if (zoneDuring(mid).length) high = mid;
          else low = mid;
        }
        const hit = zoneDuring(high).sort(
          (a, b) => Math.abs(a.inspectAt - start) - Math.abs(b.inspectAt - start),
        )[0];
        recordContact(low, Math.abs(hit.inspectAt - start) / row.rate);
      }
      for (const siteRow of siteRows) {
        if (target <= 0) break;
        const atDistance = (travel: number) =>
          sweepSiteFace(siteRow, from, from + direction * travel);
        const isBlocked = (
          status: ReturnType<typeof sweepSiteFace>["status"],
        ) => status === "short" || status === "needs-review";
        let high = target;
        let hit = atDistance(high);
        if (!isBlocked(hit.status)) continue;
        let low = 0;
        while (high - low > precision) {
          const mid = (low + high) / 2;
          const candidate = atDistance(mid);
          if (isBlocked(candidate.status)) {
            high = mid;
            hit = candidate;
          } else low = mid;
        }
        const witness = hit.status === "short" ? hit.at : null;
        recordContact(
          low,
          witness === null ? high : witness / siteRow.row.rate,
          witness === null,
          siteRow.plane.id,
        );
      }
      let clearanceStop: ClearanceStop | undefined;
      for (const clearance of clearances) {
        if (target <= 0) break;
        const { requirement } = clearance;
        const geometry = clearance.reason ?? gapGeometry(requirement);
        if (typeof geometry === "string") return {
          travel: from, inspectAt: from, clearanceStop: { requirement, reason: geometry },
        };
        try {
          const limit = firstPairClearanceStop(
            requirement.minimum, target, (distance) => geometry.posePair(from + direction * distance),
            geometry.speedBound, precision,
          );
          if (limit && (inspection === undefined || limit.distance < target)) {
            recordContact(limit.distance, limit.distance);
            clearanceStop = { requirement, gap: limit.observedGap };
          }
        } catch {
          return {
            travel: from, inspectAt: from, clearanceStop: { requirement, reason: "The modeled profiles could not be measured." },
          };
        }
      }
      return {
        travel: inspection === undefined ? to : from + direction * target,
        inspectAt:
          inspection === undefined ? undefined : from + direction * inspection,
        ...(uncertain ? { uncertain } : {}),
        ...(siteFaceId ? { siteFaceId } : {}),
        ...(clearanceStop ? { clearanceStop } : {}),
        ...(contact ? { contact } : {}),
        ...(contact?.kind === "solid" ? { approachFrom: from } : {}),
      };
    },
    preview(requested: number, inspectAt?: number, siteFaceId?: string) {
      const travel = motionPosition(requested, mechanism.travel);
      const inspectedTravel = motionPosition(
        inspectAt ?? travel,
        mechanism.travel,
      );
      const { contact: _contact, ...status } = checkPose(inspectedTravel);
      return {
        pieces: [
          ...moving.map((row) =>
            posedPiece(row.piece, row.motion, travel * row.rate),
          ),
          ...modeledParked.values(),
        ],
        ...(finishedFixedPieces.length ? { finishedFixedPieces } : {}),
        travel,
        kind: mechanism.kind,
        guideLine: mechanism.kind === "hinge" && mechanism.hingePath
          ? [
              add(guideLine[0], hingeOffsetAt(mechanism.hingePath, travel)),
              add(guideLine[1], hingeOffsetAt(mechanism.hingePath, travel)),
            ] as [V3, V3]
          : guideLine,
        bounds: sweepBounds,
        ...status,
        shownSiteFaceId: siteFaceId ?? status.siteFaceHits[0],
        atLimit: inspectAt !== undefined && inspectedTravel !== travel,
      };
    },
  };
}
type SingleMotionReview = ReturnType<typeof reviewMotion>;
type PhaseRows<T extends ReadonlyArray<object>> = (T[number] & { phase?: MotionPhase })[];
type MotionSequence = readonly [HeldMotion, HeldMotion];
export type MotionReview = Omit<SingleMotionReview, "hits" | "zone" | "site" | "siteFindings" | "preview"> & {
  sequence?: MotionSequence;
  clearance?: PairClearanceFinding;
  clearances?: readonly PairClearanceFinding[];
  hits: PhaseRows<SingleMotionReview["hits"]>;
  zone: PhaseRows<SingleMotionReview["zone"]>;
  site: PhaseRows<SingleMotionReview["site"]>;
  siteFindings: PhaseRows<SingleMotionReview["siteFindings"]>;
  preview: (requested: number, inspectAt?: number, siteFaceId?: string, phase?: MotionPhase) =>
    ReturnType<SingleMotionReview["preview"]> & { positionText?: string };
};

const phaseSize = 50;
const sequenceEnd = phaseSize * 2;
const phaseAt = (travel: number): MotionPhase => travel < phaseSize ? 0 : 1;
const phaseStart = (phase: MotionPhase) => phase * phaseSize;
const phaseTravel = (phase: MotionPhase, target: number, total: number) =>
  ((total - phaseStart(phase)) / phaseSize) * target;
const sequenceTravel = (phase: MotionPhase, target: number, local: number) =>
  phaseStart(phase) + (local / target) * phaseSize;

function motionTestTravel(plan: MotionPlan, target?: MotionSequenceTargets["selected"]) {
  if (target && (target.kind !== plan.mechanism.kind || target.travel > plan.mechanism.travel))
    throw Error(`The saved travel target for ${plan.label} no longer fits its motion. Update the test target or restore full travel.`);
  return target?.travel ?? plan.mechanism.travel;
}

function motionSequence(selected: MotionPlan, companion: MotionPlan, order: MotionOpeningOrder, targets?: MotionSequenceTargets): MotionSequence {
  const first = { plan: selected, travel: motionTestTravel(selected, targets?.selected) };
  const second = { plan: companion, travel: motionTestTravel(companion, targets?.companion) };
  return order === "selected-first" ? [first, second] : [second, first];
}

function sequencePosition(sequence: MotionSequence, travel: number, phase = phaseAt(travel)) {
  const leg = sequence[phase];
  const atTarget = travel === phaseStart(phase) + phaseSize;
  const distance = atTarget ? motionTargetDistance(leg.travel, leg.plan.mechanism.kind)
    : motionDistance(phaseTravel(phase, leg.travel, travel), leg.plan.mechanism.kind);
  return `${leg.plan.label} · ${distance}`;
}

function reviewMotionSequence(
  project: Project,
  plan: MotionPlan,
  sequence: MotionSequence,
  held: readonly HeldMotion[],
): MotionReview {
  const [first, second] = sequence;
  const phases = [
    reviewMotion(project, first.plan, [...held, { plan: second.plan, travel: 0 }], undefined, first.travel),
    reviewMotion(project, second.plan, [...held, first], undefined, second.travel),
  ] as const;
  const phaseIndices: MotionPhase[] = [0, 1];
  const asProgress = (phase: MotionPhase, local: number) =>
    sequenceTravel(phase, sequence[phase].travel, local);
  function sequenceGapSearch(firstSearch?: MotionGapSearch, secondSearch?: MotionGapSearch): MotionGapSearch | undefined {
    if (!firstSearch || !secondSearch) return;
    return async (signal) => {
      const firstGap = await firstSearch(signal);
      const secondGap = await secondSearch(signal);
      const phase = firstGap.gap <= secondGap.gap ? 0 : 1;
      const closest = phase === 0 ? firstGap : secondGap;
      return {
        ...closest, phase, at: asProgress(phase, closest.at),
        lowerBound: Math.min(firstGap.lowerBound, secondGap.lowerBound),
      };
    };
  }
  const site = phaseIndices.flatMap((phase) => phases[phase].site.map((row) => ({
    ...row, phase, inspectAt: row.inspectAt === null ? null : asProgress(phase, row.inspectAt),
  })));
  const sweepBounds = bounds(phases.flatMap(({ bounds }) => [bounds.min, bounds.max]));

  return {
    plan,
    linked: undefined,
    testedTravel: sequenceEnd,
    linkedTravel: undefined,
    sequence,
    bounds: sweepBounds,
    hits: phaseIndices.flatMap((phase) => phases[phase].hits.map((hit) => ({
      ...hit,
      phase,
      first: asProgress(phase, hit.first),
      inspectAt: asProgress(phase, hit.inspectAt),
      closingAt: asProgress(phase, hit.closingAt),
    }))),
    zone: phaseIndices.flatMap((phase) => phases[phase].zone.map((row) => ({
      ...row, phase, inspectAt: asProgress(phase, row.inspectAt),
    }))),
    site,
    siteFindings: site.filter(({ status }) => status === "short" || status === "needs-review"),
    unresolvedIds: [...new Set(phases.flatMap(({ unresolvedIds }) => unresolvedIds))],
    gapSearch(pair) {
      return sequenceGapSearch(phases[0].gapSearch(pair), phases[1].gapSearch(pair));
    },
    contactApproach(stop) {
      if (stop.phase === undefined || stop.approachFrom === undefined || stop.inspectAt === undefined) return;
      const phase = stop.phase;
      const local = (value: number) => phaseTravel(phase, sequence[phase].travel, value);
      const witness = phases[phase].contactApproach({
        ...stop, approachFrom: local(stop.approachFrom), inspectAt: local(stop.inspectAt), travel: local(stop.travel),
      });
      return witness && { ...witness, travel: asProgress(phase, witness.travel) };
    },
    pairClearance(requirement) {
      const checks = phases.map((motion) => motion.pairClearance(requirement));
      const findClosest = sequenceGapSearch(checks[0].findClosest, checks[1].findClosest);
      for (const phase of phaseIndices) {
        const { result } = checks[phase];
        if (result.status === "short")
          return { requirement, phase, result: { ...result, at: asProgress(phase, result.at) }, findClosest };
      }
      const finding = checks.find(({ result }) => result.status === "needs-review") ?? checks[0];
      return { ...finding, findClosest };
    },
    playbackLimit(requestedFrom, requestedTo, clearance) {
      const from = motionPosition(requestedFrom, sequenceEnd);
      const to = motionPosition(requestedTo, sequenceEnd);
      const forward = to > from;
      const orderedPhases = forward ? phaseIndices : [...phaseIndices].reverse();
      for (const phase of orderedPhases) {
        const legStart = phaseStart(phase);
        const low = Math.max(Math.min(from, to), legStart);
        const high = Math.min(Math.max(from, to), legStart + phaseSize);
        if (low >= high) continue;
        const localLow = phaseTravel(phase, sequence[phase].travel, low);
        const localHigh = phaseTravel(phase, sequence[phase].travel, high);
        const limit = phases[phase].playbackLimit(forward ? localLow : localHigh, forward ? localHigh : localLow, clearance);
        if (limit.inspectAt !== undefined)
          return {
            ...limit,
            phase,
            travel: asProgress(phase, limit.travel),
            inspectAt: asProgress(phase, limit.inspectAt),
            ...(limit.approachFrom !== undefined ? { approachFrom: asProgress(phase, limit.approachFrom) } : {}),
          };
      }
      return { travel: to };
    },
    preview(requested, inspectAt, siteFaceId, phaseHint) {
      const travel = motionPosition(requested, sequenceEnd);
      const phase = phaseHint ?? phaseAt(travel);
      const local = (value: number) => phaseTravel(phase, sequence[phase].travel, value);
      return {
        ...phases[phase].preview(local(travel), inspectAt === undefined ? undefined : local(inspectAt), siteFaceId),
        bounds: sweepBounds,
        label: "Opening sequence",
        travel,
        positionText: sequencePosition(sequence, travel, phase),
      };
    },
  };
}

export function motionReviewTravel(review: MotionReview) {
  return review.testedTravel;
}

export function motionReviewTargets({ sequence, plan, testedTravel, linked, linkedTravel }: MotionReview) {
  return sequence ?? [
    { plan, travel: testedTravel },
    ...(linked && linkedTravel !== undefined ? [{ plan: linked, travel: linkedTravel }] : []),
  ];
}

export function motionReviewHasLimits(review: MotionReview) {
  if (review.sequence) return review.sequence.some(({ plan, travel }) => travel < plan.mechanism.travel);
  return review.testedTravel < review.plan.mechanism.travel ||
    (review.linkedTravel !== undefined && !!review.linked && review.linkedTravel < review.linked.mechanism.travel);
}

/** Obtain a search for an active motion without assuming a required minimum. */
export function motionGapSearch(review: MotionReview, pair: MotionGapPair) {
  const plans = review.sequence?.map(({ plan }) => plan) ?? [review.plan, review.linked];
  const moves = plans.some((plan) => plan?.memberIds.some((id) => id === pair.movingId || id === pair.otherId));
  return moves ? review.gapSearch(pair) : undefined;
}

export function motionReviewDistance(review: MotionReview, travel: number, phase?: MotionPhase) {
  return review.sequence
    ? sequencePosition(review.sequence, travel, phase)
    : motionDistance(travel, review.plan.mechanism.kind);
}

export type MotionDirection = "opening" | "closing";

export function motionDirectionLimit(review: MotionReview, direction: MotionDirection) {
  const end = motionReviewTravel(review);
  return direction === "opening" ? review.playbackLimit(0, end) : review.playbackLimit(end, 0);
}

/** The first pause from each endpoint, using the same sweep as playback. */
export function motionDirectionStops(review: MotionReview) {
  if (!review.hits.length && !review.zone.length && !review.siteFindings.length &&
    !review.clearances?.some(({ result }) => result.status !== "met")) return [];
  return [
    { direction: "Opening", stop: motionDirectionLimit(review, "opening") },
    { direction: "Closing", stop: motionDirectionLimit(review, "closing") },
  ].filter(({ stop }) => stop.inspectAt !== undefined);
}

export function motionStopLine(
  project: Project, review: MotionReview, direction: string, stop: MotionPlaybackLimit,
  describe = (id: string) => partLabel(project, id),
) {
  const prefix = `${direction} pauses near ${motionReviewDistance(review, stop.travel, stop.phase)}`;
  const gap = stop.clearanceStop?.requirement;
  if (gap) {
    const pair = (review.clearances?.length ?? 0) > 1 ? ` between ${describe(gap.movingId)} and ${describe(gap.otherId)}` : "";
    return `${prefix} for the minimum gap${pair}.`;
  }
  const contact = stop.contact;
  if (contact) {
    const pair = `${describe(contact.movingId)} and ${describe(contact.obstacleId)}`;
    const reason = contact.kind === "solid" ? "contact" : contact.kind === "envelope" ? "possible contact" : "a close pass";
    if (contact.held) return `${prefix} for ${reason} between ${pair} at the held position.`;
    return `${prefix} for ${reason} between ${pair}.`;
  }
  if (stop.siteFaceId) {
    const label = review.site.find(({ plane }) => plane.id === stop.siteFaceId)?.plane.label;
    return `${prefix} for measured clearance${label ? ` at ${label}` : ""}.`;
  }
  return `${prefix} at the work-zone boundary.`;
}

export function motionApproachMarksLine(project: Project, pair: MotionCollisionFocus, localMarks: GapEndpoints) {
  const marks = localMarks.map((point, index) => {
    const values = point.map((value, axis) => `${["X", "Y", "Z"][axis]} ${Number(value.toFixed(3))}`);
    return `${partLabel(project, pair[index])} (${values.join(", ")})`;
  }).join(" · ");
  return `Approximate local marks from modeled part centers (in) · ${marks}.`;
}

export type MotionPreview = ReturnType<MotionReview["preview"]> & {
  draftGeometry?: true;
  focusPair?: MotionCollisionFocus;
  gapEndpoints?: ClosestPairGap["endpoints"];
  contactApproach?: GapEndpoints;
  contactApproachLocalMarks?: GapEndpoints;
  showApproachAxes?: boolean;
  focusTest?: { planId: string; setup?: MotionTestSetup; scenarioId?: string; gapPair?: MotionGapPair };
  obstaclePieces?: readonly Piece[];
  hiddenPieceIds?: readonly string[];
  clearanceCeiling?: { center: V3; size: V3 };
  uncertainLimit?: boolean;
  clearanceStop?: ClearanceStop;
};

export function motionTargetDistance(
  value: number,
  kind: MotionPlan["mechanism"]["kind"],
) {
  return kind === "hinge" ? `${value}°` : formatPreciseInches(value);
}

export function motionDistance(
  value: number,
  kind: MotionPlan["mechanism"]["kind"],
) {
  const rounded = kind === "slide" && Number.isInteger(value * 8) ? value : Number(value.toFixed(2));
  return motionTargetDistance(rounded, kind);
}

export type MotionTestVariant = "baseline" | "saved";
type MotionTestResult =
  | { review: MotionReview; error?: never }
  | { review?: never; error: string };

export type MotionTestSelection = {
  plan: MotionPlan;
  setup?: MotionTestSetup;
  scenarioId?: string;
  focusDrawerOpening?: boolean;
  focusShorterTravel?: boolean;
  focusOrderComparison?: boolean;
  gapPair?: MotionGapPair;
  drawerStop?: DrawerStopRequest;
  inspection?: { name: string; stop: MotionPlaybackLimit; approach?: true };
  result: MotionTestResult;
};

export function inspectMotionStop(
  review: MotionReview, stop: MotionPlaybackLimit, test: NonNullable<MotionPreview["focusTest"]>,
): MotionPreview {
  const gap = stop.clearanceStop?.requirement;
  const focusPair = stop.contact ? [stop.contact.movingId, stop.contact.obstacleId] as const
    : gap ? [gap.movingId, gap.otherId] as const : undefined;
  return {
    ...review.preview(stop.travel, stop.inspectAt, stop.siteFaceId, stop.phase),
    clearanceStop: stop.clearanceStop,
    gapEndpoints: stop.gapEndpoints,
    uncertainLimit: stop.uncertain,
    focusPair,
    focusTest: focusPair ? test : undefined,
  };
}

export function inspectMotionApproach(
  review: MotionReview, stop: MotionPlaybackLimit, test: NonNullable<MotionPreview["focusTest"]>,
): MotionPreview {
  const witness = review.contactApproach(stop);
  if (!witness || !stop.contact) throw Error("There is no separated approach to mark for this stop.");
  return {
    ...review.preview(witness.travel, undefined, undefined, stop.phase),
    contactApproach: witness.endpoints,
    contactApproachLocalMarks: witness.localMarks,
    focusPair: [stop.contact.movingId, stop.contact.obstacleId],
    focusTest: test,
  };
}

export function runMotionTest(
  project: Project,
  plan: MotionPlan,
  setup?: MotionTestSetup,
): MotionTestResult {
  try {
    const { held, linked } = resolveMotionTestSetup(project, setup);
    let review: MotionReview;
    if (linked && setup?.openingOrder) {
      const sequence = motionSequence(plan, linked, setup.openingOrder, setup.sequenceTargets);
      review = reviewMotionSequence(project, plan, sequence, held);
    } else {
      review = reviewMotion(
        project, plan, held, linked,
        motionTestTravel(plan, setup?.sequenceTargets?.selected),
        linked && motionTestTravel(linked, setup?.sequenceTargets?.companion),
      );
    }
    const requirements = motionTestGapRequirements(setup);
    if (requirements.length) {
      const guards: ClearanceGuard[] = [];
      review.clearances = requirements.map((requirement): PairClearanceFinding => {
        const reason = hasClearanceMovingPart(plan, linked, requirement) ? undefined : "The selected part no longer moves in this test.";
        const finding = reason
          ? { requirement, result: { status: "needs-review", reason } } as const
          : review.pairClearance(requirement);
        if (finding.result.status !== "met") guards.push({ requirement, reason });
        return finding;
      });
      review.clearance = review.clearances[0];
      if (guards.length) {
        const pathLimit = review.playbackLimit;
        review.playbackLimit = (from, to) => pathLimit(from, to, guards);
      }
    }
    return { review };
  } catch (problem) {
    return { error: problem instanceof Error ? problem.message : "Confirm the current moving parts." };
  }
}

export function motionReviewPasses(review: MotionReview, end = motionReviewTravel(review)) {
  if (review.hits.length || review.zone.length || review.siteFindings.length ||
      review.unresolvedIds.length || review.clearances?.some(({ result }) => result.status !== "met")) return false;
  const opening = review.playbackLimit(0, end);
  const closing = review.playbackLimit(end, 0);
  return opening.inspectAt === undefined && opening.travel === end &&
    closing.inspectAt === undefined && closing.travel === 0;
}

export function trialMotionOpeningOrder(project: Project, plan: MotionPlan, setup: MotionTestSetup, order?: MotionOpeningOrder) {
  const { openingOrder: _previous, ...settings } = setup;
  const candidate: MotionTestSetup = order ? { ...settings, openingOrder: order } : settings;
  const result = runMotionTest(project, plan, candidate);
  const review = result.review;
  if (!review) return { setup: candidate, result };
  if (motionReviewPasses(review)) return { setup: candidate, result, clear: true };
  const end = motionReviewTravel(review);
  return {
    setup: candidate, result, clear: false,
    opening: review.playbackLimit(0, end),
    closing: review.playbackLimit(end, 0),
  };
}

export function doorDrawerOrderSetup(door: MotionPlan, drawer: MotionPlan) {
  if (drawer.testSetup?.linkedId === door.id) return { plan: drawer, companion: door, setup: drawer.testSetup };
  if (door.testSetup?.linkedId === drawer.id) return { plan: door, companion: drawer, setup: door.testSetup };
  return { plan: drawer, companion: door, setup: { linkedId: door.id, held: [] } as MotionTestSetup };
}

/** Retest a shorter prefix of the same opening path, then retest closing. */
export function shorterMotionTrial(project: Project, review: MotionReview, setup?: MotionTestSetup) {
  if (review.unresolvedIds.length) return;
  const end = motionReviewTravel(review);
  const stop = review.playbackLimit(0, end);
  if (stop.inspectAt === undefined || stop.travel <= 0) return;

  // In a sequence only shorten the last leg. Shortening the first leg
  // would move the part that the next leg was meant to keep in place.
  if (review.sequence && stop.phase !== 1) return;
  const leg = review.sequence?.[1] ?? { plan: review.plan, travel: end };
  const key = leg.plan.id === review.plan.id ? "selected" : "companion";
  const kind = leg.plan.mechanism.kind;
  const increment = kind === "hinge" ? 1 : 0.125;
  const reached = review.sequence ? phaseTravel(1, leg.travel, stop.travel) : stop.travel;
  const travel = (Math.ceil(reached / increment) - 1) * increment;
  if (travel <= 0) return;

  const sequenceTargets: MotionSequenceTargets = { ...setup?.sequenceTargets, [key]: { kind, travel } };
  if (review.linked && review.linkedTravel !== undefined) {
    // Preserve the shared timeline, then verify again with a practical target value.
    const companionTravel = Number((review.linkedTravel * travel / end).toFixed(5));
    if (companionTravel <= 0) return;
    sequenceTargets.companion = { kind: review.linked.mechanism.kind, travel: companionTravel };
  }
  const candidate: MotionTestSetup = { held: [], ...setup, sequenceTargets };
  const result = runMotionTest(project, review.plan, candidate);
  if (!result.review || !motionReviewPasses(result.review)) return;
  const targets = motionReviewTargets(result.review)
    .map(({ plan, travel }) => `${plan.label} ${motionTargetDistance(travel, plan.mechanism.kind)}`)
    .join(" · ");
  return { setup: candidate, result, targets };
}

export function reviewMotionTests(project: Project, plan: MotionPlan, includeScenarios = true) {
  return {
    plan,
    baseline: runMotionTest(project, plan),
    saved: plan.testSetup ? runMotionTest(project, plan, plan.testSetup) : undefined,
    scenarios: (includeScenarios ? plan.testScenarios ?? [] : []).map((scenario) => ({
      ...scenario,
      result: runMotionTest(project, plan, scenario.setup),
    })),
  };
}

export function projectMotionReviews(project: Project, includeScenarios = true) {
  return (project.motionPlans ?? []).map((plan) => reviewMotionTests(project, plan, includeScenarios));
}

export type ProjectMotionReviews = ReturnType<typeof projectMotionReviews>;

/** Compare the moving parts against newly placed fixed hardware across saved tests. */
export function motionObstacleWarnings(project: Project, obstacleIds: ReadonlySet<string>, obstacle: string) {
  return projectMotionReviews(project).flatMap(({ plan, baseline, saved, scenarios }) => {
    const tests = [
      { label: plan.label, review: baseline.review },
      ...(saved ? [{ label: `${plan.label} · Saved test`, review: saved.review }] : []),
      ...scenarios.map(({ name, result }) => ({ label: `${plan.label} · ${name}`, review: result.review })),
    ];
    return tests.flatMap(({ label, review }) => {
      if (!review) return [];
      const hit = review.hits.filter(({ obstacleId }) => obstacleIds.has(obstacleId)).sort((a, b) => a.first - b.first)[0];
      return hit ? [`${label} · Possible contact with ${obstacle} near ${motionReviewDistance(review, hit.first, hit.phase)}.`] : [];
    });
  });
}


function motionHitLine(project: Project, review: MotionReview, hit: MotionReview["hits"][number], describePart = partLabel) {
  const parts = `${describePart(project, hit.movingId)} against ${describePart(project, hit.obstacleId)}`;
  if (hit.held) {
    const label = hit.kind === "solid" ? "Interference at held position" : "Possible interference at held position";
    return `${label} · ${parts}${hit.kind === "envelope" ? " based on the part envelope" : ""}.`;
  }
  const pairs = `${parts} near ${motionReviewDistance(review, hit.first, hit.phase)}`;
  if (hit.kind === "uncertain") return `Close pass needs review · ${pairs}.`;
  if (hit.kind === "envelope") return `Possible interference · ${pairs} based on the part envelope.`;
  return `Modeled interference · ${pairs}.`;
}

function unresolvedMotionLine(project: Project, review: MotionReview) {
  return `Clearance could not be checked for ${review.unresolvedIds.map((id) => partLabel(project, id)).join(", ")}.`;
}

function motionSiteLine(project: Project, review: MotionReview, entry: MotionReview["site"][number]) {
  const { plane, movingId, status, inspectAt, phase, held } = entry;
  const result =
    status === "short"
      ? held ? "clearance shortfall at the held position" : `clearance shortfall near ${motionReviewDistance(review, inspectAt ?? 0, phase)}`
      : status === "needs-review"
        ? "close pass needs review"
        : status === "outside-height"
          ? "travel stays outside the measured height band"
          : "measured clearance met along travel";
  return `${plane.label} · ${partLabel(project, movingId)} · ${result}.`;
}

export function motionPairClearanceLine(project: Project, review: MotionReview, finding = review.clearance) {
  if (!finding) return "";
  const { requirement: { movingId, otherId, minimum }, result, phase } = finding;
  const label = `${formatPreciseInches(minimum)} minimum gap · ${partLabel(project, movingId)} and ${partLabel(project, otherId)}`;
  if (result.status === "needs-review") return `${label} · Needs review. ${result.reason}`;
  if (result.status === "met") return `${label} · Met throughout the modeled travel.`;
  return `${label} · Shortfall. Observed ${formatPreciseInches(result.gap)} near ${motionReviewDistance(review, result.at, phase)}.`;
}

export type MotionTestFinding = {
  id: string;
  detail: string;
  travel?: number;
  closingTravel?: number;
  siteFaceId?: string;
  phase?: MotionPhase;
  gapStatus?: PairClearanceResult["status"];
};

export function motionTestFindings(project: Project, result: MotionTestResult, includeClear = false, describePart = partLabel): MotionTestFinding[] {
  if (!result.review) return [{ id: "setup", detail: result.error }];
  const review = result.review;
  const findings: MotionTestFinding[] = [
    ...review.hits.map((hit) => ({
      id: `contact/${hit.movingId}/${hit.obstacleId}${hit.phase === undefined ? "" : "/" + hit.phase}`,
      detail: motionHitLine(project, review, hit, describePart),
      travel: hit.inspectAt,
      closingTravel: hit.closingAt,
      phase: hit.phase,
    })),
    ...review.zone.map((entry) => ({
      id: `zone/${entry.movingId}/${entry.label}${entry.phase === undefined ? "" : "/" + entry.phase}`,
      detail: `${partLabel(project, entry.movingId)} exceeds the ${entry.label} work-zone limit ${entry.held ? "at the held position" : `near ${motionReviewDistance(review, entry.inspectAt, entry.phase)}`}.`,
      travel: entry.inspectAt,
      phase: entry.phase,
    })),
    ...review.siteFindings.map((entry) => ({
      id: `site/${entry.movingId}/${entry.plane.id}${entry.phase === undefined ? "" : "/" + entry.phase}`,
      detail: motionSiteLine(project, review, entry),
      travel: entry.inspectAt ?? (entry.phase === undefined ? undefined : phaseStart(entry.phase)),
      siteFaceId: entry.plane.id,
      phase: entry.phase,
    })),
  ];
  if (review.unresolvedIds.length)
    findings.push({ id: "geometry", detail: unresolvedMotionLine(project, review) });
  for (const finding of review.clearances ?? []) {
    const { result, phase, requirement } = finding;
    findings.push({ id: `pair-clearance/${motionGapPairKey(requirement)}`,
      detail: motionPairClearanceLine(project, review, finding),
      travel: result.status === "short" ? result.at : undefined, phase, gapStatus: result.status });
  }
  if (includeClear && !findings.length)
    findings.push({ id: "clear", detail: "No modeled clearance findings along the tested travel." });
  return findings;
}

function motionClearanceLines(project: Project, review: MotionReview, includeStops = false) {
  const gaps = review.clearances ?? [];
  const stops = includeStops ? motionDirectionStops(review)
    .flatMap(({ direction, stop }) => {
      const rows = [motionStopLine(project, review, direction, stop)];
      const witness = review.contactApproach(stop);
      if (witness && stop.contact) rows.push(
        `${direction} approach at ${motionReviewDistance(review, witness.travel, stop.phase)} · ${motionApproachMarksLine(
          project, [stop.contact.movingId, stop.contact.obstacleId], witness.localMarks,
        )}`,
      );
      return rows;
    }) : [];
  return [
    ...review.hits.map((hit) => motionHitLine(project, review, hit)),
    ...(review.unresolvedIds.length
      ? [unresolvedMotionLine(project, review)]
      : []),
    ...(!review.hits.length && !review.unresolvedIds.length
      ? ["No modeled part interference found along the travel."]
      : []),
    ...review.zone.filter(({ held }) => held).map((entry) =>
      `${partLabel(project, entry.movingId)} exceeds the ${entry.label} work-zone limit at the held position.`),
    ...(review.zone.some(({ held }) => !held)
      ? [`Work-zone limits exceeded at ${[...new Set(review.zone.filter(({ held }) => !held).map((issue) => issue.label))].join(", ")}.`]
      : []),
    ...review.site.map((entry) => motionSiteLine(project, review, entry)),
    ...gaps.map((finding) => motionPairClearanceLine(project, review, finding)),
    ...stops,
  ];
}

function savedTestLines(project: Project, label: string, setup: MotionTestSetup, result: MotionTestResult, includeStops: boolean, unavailableLabel = label) {
  if (!result.review) return [`${unavailableLabel} · Needs review. ${result.error}`];
  const { held, linked } = resolveMotionTestSetup(project, setup);
  const { sequence } = result.review;
  return [
    [
      label,
      ...(sequence
        ? [`opens in order: ${sequence.map(({ plan }) => plan.label).join(" → ")}. Closing reverses the order.`]
        : linked ? [`moves with ${linked.label}`] : []),
      ...(setup.sequenceTargets
        ? [`Test targets · ${motionReviewTargets(result.review).map(({ plan, travel }) => `${plan.label} ${motionTargetDistance(travel, plan.mechanism.kind)}`).join(", ")}.`]
        : []),
      ...held.map(({ plan, travel }) => `${plan.label} held at ${motionDistance(travel, plan.mechanism.kind)}`),
    ].join(" · "),
    ...motionClearanceLines(project, result.review, includeStops),
  ];
}

export function motionReviewLines(project: Project, reviews = projectMotionReviews(project), includeStops = true) {
  const slideConflicts = new Set(drawerSlidePurchaseReview(project).conflicts.map(({ key }) => key));
  return reviews.flatMap(({ plan, baseline, saved, scenarios }) => {
    const door = boundMotionReview(project, plan);
    const doorLines = door?.warning ? [door.warning] : (door?.lines ?? []);
    const slideFit = reviewDrawerSlide(project, plan);
    const slideConflict = !!slideFit && slideConflicts.has(drawerSlideKey(slideFit.setup));
    const slideLines = slideFit
      ? [
          `${slideFit.reference.orderModel} · One left/right side-mount pair · ${slideFit.ready ? "Modeled dimensions match the slide reference." : "Resolve slide dimensions before fitting."}`,
          ...slideFit.rows.map(
            (row) =>
              `${row.label}${row.matches ? "" : " · Review"} · ${row.detail}`,
          ),
          ...(slideConflict
            ? ["This drawer has different fitted slide choices. Choose one before purchasing its hardware."] : []),
          "Confirm the delivered slides and fasteners. Use the 3732 instructions to align both rails on the actual mounting faces before locating holes.",
        ]
      : [];
    const kind = plan.mechanism.kind;
    const distance = motionDistance(plan.mechanism.travel, kind);
    const measured = baseline.review && plan.mechanism.kind === "hinge" && plan.mechanism.hingePath
      ? motionSetup(project, plan).mechanism : undefined;
    const measuredPath = measured?.kind === "hinge" ? measured.hingePath : undefined;
    return [
      ...(baseline.review
        ? [
            `${plan.label} · ${measuredPath ? "Measured hinge path" : kind === "hinge" ? "Hinged swing" : "Straight slide"} · ${distance} · ${plan.memberIds.map((id) => partLabel(project, id)).join(", ")}.`,
            ...(measuredPath ? [
              "Measured movement of the closed hinge datum. X, Y, and Z offsets are in workspace inches. The preview interpolates between readings.",
              ...measuredPath.map(({ angle, offset }) => `At ${motionDistance(angle, "hinge")}, datum offset · X ${formatPreciseInches(offset[0])}, Y ${formatPreciseInches(offset[1])}, Z ${formatPreciseInches(offset[2])}.`),
            ] : []),
            ...(saved || scenarios.length ? ["Test with other motions at their saved positions"] : []),
            ...motionClearanceLines(project, baseline.review, includeStops),
          ]
        : [`${plan.label} · Motion needs review. Confirm the moving parts and current geometry.`]),
      ...(saved && plan.testSetup ? savedTestLines(project, `Saved clearance test · ${plan.label}`, plan.testSetup, saved, includeStops, "Saved clearance test") : []),
      ...scenarios.flatMap(({ name, setup, result }) => savedTestLines(project, `Named clearance test · ${name}`, setup, result, includeStops)),
      ...slideLines,
      ...(slideConflict
        ? (project.drawerSlideMounts?.some(({ motionId }) => motionId === plan.id)
          ? ["Resolve the competing slide choices before transferring the mounting marks."] : [])
        : drawerSlideMountGuideLines(project, plan.id)),
      ...doorLines,
    ];
  });
}
