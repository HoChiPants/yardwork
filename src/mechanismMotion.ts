import { Quaternion, Vector3 } from "three";
import { accuride3732 } from "./drawerSlideReference";
import { reviewDrawerSlide } from "./drawerSlides";
import { greenhouseDoorReview } from "./greenhouseDoors";
import { greenhouseVentReview } from "./greenhouseVents";
import { saunaDoorReview } from "./saunaDoors";
import { hingePoseAroundAxis } from "./hinges";
import { sweepLidSiteFaces } from "./lidSiteClearance";
import { formatPreciseInches } from "./measurement";
import { uid, type Piece, type Project, type V3 } from "./model";
import { sweepPairClearance, type PairClearanceResult } from "./motionPairClearance";
import {
  motionPlanInputSchema,
  motionPlanSchema,
  motionTestScenarioLimit,
  motionTestScenarioSchema,
  motionTestSetupSchema,
  type MotionPlan,
  type MotionOpeningOrder,
  type MotionPairClearance,
  type MotionSequenceTargets,
  type MotionTestSetup,
} from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import {
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
  solidOverlap,
  swingSeparated,
  transformCollisionSolid,
  translateCollisionSolid,
  type CollisionSolid,
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

export function motionSetup(project: Project, plan: MotionPlan) {
  const parts = members(project, plan.memberIds);
  const anchor = parts[0];
  const axis = rotate(plan.mechanism.axis, anchor.rotation);
  return {
    label: plan.label,
    memberIds: plan.memberIds,
    mechanism:
      plan.mechanism.kind === "hinge"
        ? {
            ...plan.mechanism,
            axis,
            pivot: add(
              anchor.position,
              rotate(plan.mechanism.pivot, anchor.rotation),
            ),
          }
        : { ...plan.mechanism, axis },
  };
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

type WorldMechanism = ReturnType<typeof motionSetup>["mechanism"];
type MovingShape = Shape & {
  motion: WorldMechanism;
  rate: number;
  extrema: ReturnType<typeof sweptExtrema>;
};
type ContactShape = MovingShape | (Shape & { motion?: undefined });
type PairClearanceFinding = { requirement: MotionPairClearance; result: PairClearanceResult; phase?: MotionPhase };

type SiteMotionRow = { row: MovingShape; plane: SiteClearance };
export type MotionPhase = 0 | 1;
export type MotionPlaybackLimit = {
  travel: number;
  inspectAt?: number;
  uncertain?: boolean;
  siteFaceId?: string;
  phase?: MotionPhase;
};

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
  return transformCollisionSolid(
    solid,
    (p) => add(turn(subtract(p, mechanism.pivot)), mechanism.pivot),
    turn,
  );
}

/** Include interior extrema of each rotating vertex, not just the two end poses. */
function sweptExtrema(shape: CollisionSolid, motion: WorldMechanism) {
  const min = axes.map(() => ({ value: Infinity, at: 0 }));
  const max = axes.map(() => ({ value: -Infinity, at: 0 }));
  let radius = 0;
  const record = (i: number, value: number, at: number) => {
    if (value < min[i].value) min[i] = { value, at };
    if (value > max[i].value) max[i] = { value, at };
  };
  for (const vertex of shape.vertices) {
    if (motion.kind === "slide") {
      for (const i of axes) {
        record(i, vertex[i], 0);
        record(i, vertex[i] + motion.axis[i] * motion.travel, motion.travel);
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
    const end = motion.travel * radians;
    for (const i of axes) {
      const turning = Math.atan2(sin[i], radial[i]);
      for (const theta of [
        0,
        end,
        turning,
        turning + Math.PI,
        turning - Math.PI,
        turning + 2 * Math.PI,
      ]) {
        if (theta >= 0 && theta <= end)
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

function broadphase(a: Bounds, b: Bounds) {
  return axes.every((i) => a.max[i] >= b.min[i] && b.max[i] >= a.min[i]);
}

type MotionHit = {
  movingId: string;
  obstacleId: string;
  kind: "solid" | "envelope" | "uncertain";
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
  const search = (start: number, end: number): Contact | null => {
    const center = (start + end) / 2;
    const middle = poseSolid(moving, mechanism, center);
    const displacement = (radius * (end - start) * radians) / 2;
    if (
      swingSeparated(
        middle,
        fixed,
        mechanism.axis,
        displacement,
        contactTolerance,
      )
    )
      return null;
    if (end - start > 0.0625)
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
  return confirmed && earlier && (moving.cells || fixed.cells)
    ? { ...confirmed, unresolvedBefore: earlier.first }
    : (confirmed ?? earlier ?? null);
}

const workZoneNames = ["left", "right", "floor", "ceiling", "rear", "front"];
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

function separationSpeed(first: ContactShape, second: ContactShape, axis?: V3) {
  if (first.motion === second.motion) return 0;
  const velocity = (row: ContactShape) =>
    row.motion && row.motion.kind === "slide" ? scale(row.motion.axis, row.rate) : [0, 0, 0] as V3;
  const relative = vector(subtract(velocity(first), velocity(second)));
  return (axis ? Math.abs(relative.dot(vector(axis))) : relative.length()) +
    [first, second].reduce((sum, row) => row.motion && row.motion.kind === "hinge"
      ? sum + row.rate * row.extrema.radius * radians *
        (axis ? vector(row.motion.axis).cross(vector(axis)).length() : 1)
      : sum, 0);
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
  if (!b.motion) {
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
  if (a.motion.kind === "slide" && b.motion.kind === "slide") {
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
  const projectedSpeed = (row: MovingShape, axis: V3) => {
    const travelAxis = vector(row.motion.axis);
    const testAxis = vector(axis);
    return (
      row.rate *
      (row.motion.kind === "slide"
        ? Math.abs(travelAxis.dot(testAxis))
        : row.extrema.radius * radians * travelAxis.cross(testAxis).length())
    );
  };
  const other = b;
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
          ((projectedSpeed(a, axis) + projectedSpeed(other, axis)) *
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
  if (mechanism.kind === "hinge")
    return hingePoseAroundAxis(piece, mechanism.pivot, mechanism.axis, travel);
  return {
    ...piece,
    position: add(piece.position, scale(mechanism.axis, travel)),
  };
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
  if (linked && setup.openingOrder) motionSequence(active, linked, setup.openingOrder, setup.sequenceTargets);
  if (setup.clearance) {
    members(project, [setup.clearance.movingId, setup.clearance.otherId]);
    if (!hasClearanceMovingPart(active, linked, setup.clearance))
      throw Error("Choose a part moving in this test for the clearance check.");
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

function boundMotionReview(project: Project, plan: MotionPlan) {
  return (
    greenhouseDoorReview(project, plan) ??
    greenhouseVentReview(project, plan) ??
    saunaDoorReview(project, plan)
  );
}

export function reviewMotion(
  project: Project,
  plan: MotionPlan,
  held: readonly HeldMotion[] = [],
  linked?: MotionPlan,
  testedTravel = plan.mechanism.travel,
) {
  const doorReview = boundMotionReview(project, plan);
  if (doorReview?.warning) throw Error(doorReview.warning);
  const parkedPieces = new Map<string, Piece>();
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
    const other = motionSetup(project, parked.plan).mechanism;
    const position = motionPosition(parked.travel, other.travel);
    for (const piece of members(project, parked.plan.memberIds))
      parkedPieces.set(piece.id, posedPiece(piece, other, position));
    heldPlans.push(parked.plan);
  }
  const path = reviewMotionPath(
    project,
    members(project, plan.memberIds),
    { ...motionSetup(project, plan).mechanism, travel: testedTravel },
    {
      parkedPieces,
      linked: linked && {
        parts: members(project, linked.memberIds),
        mechanism: motionSetup(project, linked).mechanism,
      },
      measuredSite: true,
    },
  );
  return {
    ...path,
    plan,
    linked,
    preview(requested: number, inspectAt?: number, siteFaceId?: string) {
      return {
        ...path.preview(requested, inspectAt, siteFaceId),
        label: linked ? `${plan.label} + ${linked.label}` : plan.label,
      };
    },
  };
}

/** Check an already resolved world-space motion without saving a plan. */
export function reviewMotionPath(
  project: Project,
  parts: readonly Piece[],
  mechanism: WorldMechanism,
  {
    parkedPieces = new Map<string, Piece>(),
    linked,
    measuredSite = false,
  }: {
    parkedPieces?: ReadonlyMap<string, Piece>;
    linked?: { parts: readonly Piece[]; mechanism: WorldMechanism };
    measuredSite?: boolean;
  } = {},
) {
  const prepare = (
    members: readonly Piece[],
    motion: WorldMechanism,
  ): MovingShape[] => {
    const rate = motion.travel / mechanism.travel;
    if (!Number.isFinite(rate) || rate <= 0)
      throw Error("Choose travel distances that can be previewed together.");
    return members.map(shape).map((row) => ({
      ...row,
      motion,
      rate,
      extrema: sweptExtrema(row.solid, motion),
    }));
  };
  const primary = prepare(parts, mechanism);
  const companions = linked ? prepare(linked.parts, linked.mechanism) : [];
  const moving = [...primary, ...companions];
  const siteFacesByPart = measuredSite
    ? siteClearanceFacesByPart(project)
    : null;
  const siteRows = moving.flatMap((row) =>
    (siteFacesByPart?.get(row.piece.id) ?? []).map((plane) => ({ row, plane })),
  );
  const site = siteRows.map(({ row, plane }) => {
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
  const fixed: ContactShape[] = project.pieces.flatMap((piece) => {
    if (piece.offcut || ids.has(piece.id)) return [];
    try {
      return [shape(parkedPieces.get(piece.id) ?? piece)];
    } catch {
      unresolvedIds.push(piece.id);
      return [];
    }
  });
  const primaryObstacles: ContactShape[] = [...fixed, ...companions];
  const candidates = moving.map((row) =>
    (row.motion === mechanism ? primaryObstacles : fixed).filter((other) =>
      broadphase(
        row.extrema.bounds,
        other.motion ? other.extrema.bounds : other.solid.bounds,
      ),
    ),
  );
  const hits: MotionHit[] = [];
  const zone = moving.flatMap((row) =>
    workZoneHits(project, row.extrema).map((hit) => ({
      ...hit,
      inspectAt: hit.inspectAt / row.rate,
      movingId: row.piece.id,
    })),
  );
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
    const outsideZone = new Set<string>();
    const siteFaces = new Map<string, string>();
    let hasSolidContact = false;
    for (const [index, row] of moving.entries()) {
      const pose = motionSolid(row, travel);
      for (const other of candidates[index]) {
        if (!solidOverlap(pose, motionSolid(other, travel), contactTolerance))
          continue;
        interference.add(row.piece.id);
        interference.add(other.piece.id);
        obstacles.set(other.piece.id, other.piece.name);
        if (pose.kind === "solid" && other.solid.kind === "solid")
          hasSolidContact = true;
      }
      if (project.workZone) {
        for (const { label } of workZoneHits(project, {
          min: pose.bounds.min.map((value) => ({ value, at: travel })),
          max: pose.bounds.max.map((value) => ({ value, at: travel })),
        }))
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
      envelopeOnly: interference.size > 0 && !hasSolidContact,
    };
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
    pairClearance(requirement: MotionPairClearance): PairClearanceFinding {
      const get = (id: string) => moving.find(({ piece }) => piece.id === id) ??
        fixed.find(({ piece }) => piece.id === id);
      const first = get(requirement.movingId);
      const second = get(requirement.otherId);
      if (!first || !second)
        return { requirement, result: { status: "needs-review", reason: "A selected part is missing or has no usable geometry." } };
      if (first.solid.kind === "envelope" || second.solid.kind === "envelope")
        return { requirement, result: { status: "needs-review", reason: "A selected part has an exterior envelope only. Measure the actual gap." } };
      try {
        return {
          requirement,
          result: sweepPairClearance(requirement.minimum, mechanism.travel,
            (at) => [motionSolid(first, at), motionSolid(second, at)],
            (axis) => separationSpeed(first, second, axis)),
        };
      } catch {
        return { requirement, result: { status: "needs-review", reason: "The modeled profiles could not be measured. Verify the gap on site." } };
      }
    },
    playbackLimit(
      requestedFrom: number,
      requestedTo: number,
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
      const recordContact = (
        clear: number,
        hit: number,
        possible = false,
        faceId?: string,
      ) => {
        if (clear <= target) {
          target = clear;
          inspection = hit;
          uncertain = possible;
          siteFaceId = faceId;
        }
      };
      for (const [index, row] of moving.entries()) {
        const start = motionSolid(row, from);
        for (const other of candidates[index]) {
          const hit = contactAlong(row, other, from, to);
          if (!hit) continue;
          if (hit.uncertain) {
            if (other.motion || row.solid.cells || other.solid.cells)
              recordContact(
                Math.max(0, hit.first - precision),
                hit.inspectAt,
                true,
              );
            continue;
          }
          let low = Math.max(0, hit.first - precision);
          let high = hit.inspectAt;
          if (low > target && (hit.unresolvedBefore ?? Infinity) > target)
            continue;
          const overlaps = (travel: number) =>
            pairOverlap(row, other, from + direction * travel);
          while (high - low > precision) {
            const mid = (low + high) / 2;
            if (overlaps(mid)) high = mid;
            else low = mid;
          }
          if (hit.unresolvedBefore !== undefined)
            low = Math.max(0, hit.unresolvedBefore - precision);
          recordContact(low, high);
        }
        if (!project.workZone) continue;
        const path = { ...row.motion, axis: scale(row.motion.axis, direction) };
        const outside = (travel: number) =>
          workZoneHits(
            project,
            sweptExtrema(start, { ...path, travel: travel * row.rate }),
          ).length > 0;
        if (!outside(target)) continue;
        let low = 0;
        let high = target;
        while (high - low > precision) {
          const mid = (low + high) / 2;
          if (outside(mid)) high = mid;
          else low = mid;
        }
        const last = sweptExtrema(start, { ...path, travel: high * row.rate });
        const hit = workZoneHits(project, last).sort(
          (a, b) => a.inspectAt - b.inspectAt,
        )[0];
        recordContact(low, hit.inspectAt / row.rate);
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
      return {
        travel: inspection === undefined ? to : from + direction * target,
        inspectAt:
          inspection === undefined ? undefined : from + direction * inspection,
        ...(uncertain ? { uncertain } : {}),
        ...(siteFaceId ? { siteFaceId } : {}),
      };
    },
    preview(requested: number, inspectAt?: number, siteFaceId?: string) {
      const travel = motionPosition(requested, mechanism.travel);
      const inspectedTravel = motionPosition(
        inspectAt ?? travel,
        mechanism.travel,
      );
      const status = checkPose(inspectedTravel);
      return {
        pieces: [
          ...moving.map((row) =>
            posedPiece(row.piece, row.motion, travel * row.rate),
          ),
          ...parkedPieces.values(),
        ],
        travel,
        kind: mechanism.kind,
        guideLine,
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

function motionSequence(selected: MotionPlan, companion: MotionPlan, order: MotionOpeningOrder, targets?: MotionSequenceTargets): MotionSequence {
  const leg = (plan: MotionPlan, target?: MotionSequenceTargets["selected"]) => {
    if (target && (target.kind !== plan.mechanism.kind || target.travel > plan.mechanism.travel))
      throw Error(`The saved travel target for ${plan.label} no longer fits its motion. Update the test target or restore full travel.`);
    return { plan, travel: target?.travel ?? plan.mechanism.travel };
  };
  const first = leg(selected, targets?.selected);
  const second = leg(companion, targets?.companion);
  return order === "selected-first" ? [first, second] : [second, first];
}

function sequencePosition(sequence: MotionSequence, travel: number, phase = phaseAt(travel)) {
  const leg = sequence[phase];
  return `${leg.plan.label} · ${motionDistance(phaseTravel(phase, leg.travel, travel), leg.plan.mechanism.kind)}`;
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
  const site = phaseIndices.flatMap((phase) => phases[phase].site.map((row) => ({
    ...row, phase, inspectAt: row.inspectAt === null ? null : asProgress(phase, row.inspectAt),
  })));
  const sweepBounds = bounds(phases.flatMap(({ bounds }) => [bounds.min, bounds.max]));

  return {
    plan,
    linked: undefined,
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
    pairClearance(requirement) {
      const checks = phases.map((motion) => motion.pairClearance(requirement));
      for (const phase of phaseIndices) {
        const { result } = checks[phase];
        if (result.status === "short")
          return { requirement, phase, result: { ...result, at: asProgress(phase, result.at) } };
      }
      return checks.find(({ result }) => result.status === "needs-review") ?? checks[0];
    },
    playbackLimit(requestedFrom, requestedTo) {
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
        const limit = phases[phase].playbackLimit(forward ? localLow : localHigh, forward ? localHigh : localLow);
        if (limit.inspectAt !== undefined)
          return {
            ...limit,
            phase,
            travel: asProgress(phase, limit.travel),
            inspectAt: asProgress(phase, limit.inspectAt),
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
  return review.sequence ? sequenceEnd : review.plan.mechanism.travel;
}

export function motionReviewDistance(review: MotionReview, travel: number, phase?: MotionPhase) {
  return review.sequence
    ? sequencePosition(review.sequence, travel, phase)
    : motionDistance(travel, review.plan.mechanism.kind);
}

export type MotionPreview = ReturnType<MotionReview["preview"]> & {
  focusPair?: MotionCollisionFocus;
  focusTest?: { planId: string; setup?: MotionTestSetup; scenarioId?: string };
  obstaclePieces?: readonly Piece[];
  hiddenPieceIds?: readonly string[];
  clearanceCeiling?: { center: V3; size: V3 };
  uncertainLimit?: boolean;
};

export function motionDistance(
  value: number,
  kind: MotionPlan["mechanism"]["kind"],
) {
  return kind === "hinge"
    ? `${Number(value.toFixed(2))}°`
    : formatPreciseInches(Number(value.toFixed(2)));
}

export type MotionTestVariant = "baseline" | "saved";
type MotionTestResult =
  | { review: MotionReview; error?: never }
  | { review?: never; error: string };

export type MotionTestSelection = {
  plan: MotionPlan;
  setup?: MotionTestSetup;
  scenarioId?: string;
  result: MotionTestResult;
};

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
      review = reviewMotion(project, plan, held, linked);
    }
    if (setup?.clearance)
      review.clearance = hasClearanceMovingPart(plan, linked, setup.clearance)
        ? review.pairClearance(setup.clearance)
        : { requirement: setup.clearance, result: { status: "needs-review", reason: "The selected part no longer moves in this test." } };
    return { review };
  } catch (problem) {
    return { error: problem instanceof Error ? problem.message : "Confirm the current moving parts." };
  }
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

function motionHitLine(project: Project, review: MotionReview, hit: MotionReview["hits"][number]) {
  const parts = `${partLabel(project, hit.movingId)} against ${partLabel(project, hit.obstacleId)}`;
  const pairs = `${parts} near ${motionReviewDistance(review, hit.first, hit.phase)}`;
  if (hit.kind === "uncertain") return `Close pass needs review · ${pairs}.`;
  if (hit.kind === "envelope") return `Possible interference · ${pairs} based on the part envelope.`;
  return `Modeled interference · ${pairs}.`;
}

function unresolvedMotionLine(project: Project, review: MotionReview) {
  return `Clearance could not be checked for ${review.unresolvedIds.map((id) => partLabel(project, id)).join(", ")}.`;
}

function motionSiteLine(project: Project, review: MotionReview, entry: MotionReview["site"][number]) {
  const { plane, movingId, status, inspectAt, phase } = entry;
  const result =
    status === "short"
      ? `clearance shortfall near ${motionReviewDistance(review, inspectAt ?? 0, phase)}`
      : status === "needs-review"
        ? "close pass needs review"
        : status === "outside-height"
          ? "travel stays outside the measured height band"
          : "measured clearance met along travel";
  return `${plane.label} · ${partLabel(project, movingId)} · ${result}.`;
}

export function motionPairClearanceLine(project: Project, review: MotionReview) {
  const finding = review.clearance;
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
  siteFaceId?: string;
  phase?: MotionPhase;
};

export function motionTestFindings(project: Project, result: MotionTestResult, includeClear = false): MotionTestFinding[] {
  if (!result.review) return [{ id: "setup", detail: result.error }];
  const review = result.review;
  const findings: MotionTestFinding[] = [
    ...review.hits.map((hit) => ({
      id: `contact/${hit.movingId}/${hit.obstacleId}${hit.phase === undefined ? "" : "/" + hit.phase}`,
      detail: motionHitLine(project, review, hit),
      travel: hit.inspectAt,
      phase: hit.phase,
    })),
    ...review.zone.map((entry) => ({
      id: `zone/${entry.movingId}/${entry.label}${entry.phase === undefined ? "" : "/" + entry.phase}`,
      detail: `${partLabel(project, entry.movingId)} exceeds the ${entry.label} work-zone limit near ${motionReviewDistance(review, entry.inspectAt, entry.phase)}.`,
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
  if (review.clearance) {
    const { result, phase } = review.clearance;
    findings.push({ id: "pair-clearance", detail: motionPairClearanceLine(project, review),
      travel: result.status === "short" ? result.at : undefined, phase });
  }
  if (includeClear && !findings.length)
    findings.push({ id: "clear", detail: "No modeled clearance findings along the tested travel." });
  return findings;
}

function motionClearanceLines(project: Project, review: MotionReview) {
  return [
    ...review.hits.map((hit) => motionHitLine(project, review, hit)),
    ...(review.unresolvedIds.length
      ? [unresolvedMotionLine(project, review)]
      : []),
    ...(!review.hits.length && !review.unresolvedIds.length
      ? ["No modeled part interference found along the travel."]
      : []),
    ...(review.zone.length
      ? [`Work-zone limits exceeded at ${[...new Set(review.zone.map((issue) => issue.label))].join(", ")}.`]
      : []),
    ...review.site.map((entry) => motionSiteLine(project, review, entry)),
    ...(review.clearance ? [motionPairClearanceLine(project, review)] : []),
  ];
}

function savedTestLines(project: Project, label: string, setup: MotionTestSetup, result: MotionTestResult, unavailableLabel = label) {
  if (!result.review) return [`${unavailableLabel} · Needs review. ${result.error}`];
  const { held, linked } = resolveMotionTestSetup(project, setup);
  const { sequence } = result.review;
  return [
    [
      label,
      ...(sequence
        ? [`opens in order: ${sequence.map(({ plan }) => plan.label).join(" → ")}. Closing reverses the order.`]
        : linked ? [`moves with ${linked.label}`] : []),
      ...(sequence && setup.sequenceTargets
        ? [`Test targets · ${sequence.map(({ plan, travel }) => `${plan.label} ${motionDistance(travel, plan.mechanism.kind)}`).join(", ")}.`]
        : []),
      ...held.map(({ plan, travel }) => `${plan.label} held at ${motionDistance(travel, plan.mechanism.kind)}`),
    ].join(" · "),
    ...motionClearanceLines(project, result.review),
  ];
}

export function motionReviewLines(project: Project, reviews = projectMotionReviews(project)) {
  return reviews.flatMap(({ plan, baseline, saved, scenarios }) => {
    const door = boundMotionReview(project, plan);
    const doorLines = door?.warning ? [door.warning] : (door?.lines ?? []);
    const slideFit = reviewDrawerSlide(project, plan);
    const slideLines = slideFit
      ? [
          `${accuride3732.orderModel} · One left/right side-mount pair · ${slideFit.ready ? "Modeled dimensions match the slide reference." : "Resolve slide dimensions before fitting."}`,
          ...slideFit.rows.map(
            (row) =>
              `${row.label}${row.matches ? "" : " · Review"} · ${row.detail}`,
          ),
          "Confirm the delivered slides and fasteners. Use the 3732 instructions to align both rails on the actual mounting faces before locating holes.",
        ]
      : [];
    const kind = plan.mechanism.kind;
    const distance = motionDistance(plan.mechanism.travel, kind);
    return [
      ...(baseline.review
        ? [
            `${plan.label} · ${kind === "hinge" ? "Hinged swing" : "Straight slide"} · ${distance} · ${plan.memberIds.map((id) => partLabel(project, id)).join(", ")}.`,
            ...(saved || scenarios.length ? ["Test with other motions at their saved positions"] : []),
            ...motionClearanceLines(project, baseline.review),
          ]
        : [`${plan.label} · Motion needs review. Confirm the moving parts and current geometry.`]),
      ...(saved && plan.testSetup ? savedTestLines(project, `Saved clearance test · ${plan.label}`, plan.testSetup, saved, "Saved clearance test") : []),
      ...scenarios.flatMap(({ name, setup, result }) => savedTestLines(project, `Named clearance test · ${name}`, setup, result)),
      ...slideLines,
      ...doorLines,
    ];
  });
}
