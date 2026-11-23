import { hingePoseAroundAxis } from "./hinges";
import { installationRoute, type InstallationRoute, type InstallationWaypoint } from "./installationRouteSchema";
import { installationHinge, motionDistance, reviewMotionPath, type MotionPreview } from "./mechanismMotion";
import { formatStockLength } from "./measurement";
import { part, projectSchema, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid } from "./solidCollision";

const epsilon = 1e-6;
const finalPose: InstallationWaypoint = { x: 0, y: 0, z: 0, yaw: 0 };
const coordinates = ({ x, y, z }: InstallationWaypoint): V3 => [x, y, z];
const add = (a: V3, b: V3) => a.map((n, axis) => n + b[axis]) as V3;
const subtract = (a: V3, b: V3) => a.map((n, axis) => n - b[axis]) as V3;
export const installationRouteReference = "https://www.thomasvillecabinetry.com/-/media/thomasville/pages/resources/literature/2023/tvlinstallguideupdate31423.pdf";
export const installationRouteScope = "The route checks rigid parts, straight translations and level turns against the saved room. Confirm the actual opening, temporary bracing, grip space and handling before installation. Use the cabinet maker’s instructions for taking off and refitting components.";

export function installationRouteTargets(project: Project) {
  const active = new Set(project.pieces.flatMap(({ id, offcut }) => offcut ? [] : [id]));
  const sectionMembers = new Map(project.sections.map(({ id, pieceIds }) => [id, pieceIds.filter((id) => active.has(id))]));
  const designs = project.ideaBindings.flatMap(({ title, entries }) => entries.map((entry, index) => ({
    kind: "design" as const, id: entry.id, title: entries.length > 1 ? `${title} · assembly ${index + 1}` : title,
    members: [...new Set(entry.sections.flatMap(({ sectionId }) => sectionMembers.get(sectionId) ?? []))],
  })));
  const sections = project.sections.map(({ id, name }) => ({
    kind: "section" as const, id, title: name, members: sectionMembers.get(id) ?? [],
  }));
  return [...designs, ...sections].filter(({ members }) => members.length);
}

type Path = ReturnType<typeof reviewMotionPath>;
type Leg = {
  title: string;
  path: Path;
  travel: number;
  kind: "hinge" | "slide";
  limit: ReturnType<Path["playbackLimit"]>;
  staged?: readonly Piece[];
};
type RouteReview = {
  state: "clear" | "blocked" | "needs-review";
  detail: string;
  legs: Leg[];
  anchor?: V3;
  hiddenIds: string[];
  ceiling?: number;
  doorOption?: { id: string; angle: number; label: string };
};

function poseParts(parts: readonly Piece[], anchor: V3, point: InstallationWaypoint) {
  return parts.map((piece) => {
    const posed = hingePoseAroundAxis(piece, anchor, [0, -1, 0], point.yaw);
    return { ...posed, position: add(posed.position, coordinates(point)) };
  });
}

function potentiallyInSweep(scope: Project, path: Path) {
  return path.unresolvedIds.some((id) => {
    const piece = scope.pieces.find((part) => part.id === id);
    if (!piece) return true;
    const box = prepareCollisionBox(piece.size, piece.position, piece.rotation).bounds;
    return box.min.every((n, axis) => n <= path.bounds.max[axis] + epsilon && box.max[axis] >= path.bounds.min[axis] - epsilon);
  });
}

export function reviewInstallationRoute(project: Project, plan: InstallationRoute): RouteReview {
  const result: RouteReview = { state: "needs-review", detail: "", legs: [], hiddenIds: plan.defer, ceiling: plan.ceiling };
  try {
    const target = installationRouteTargets(project).find(({ id, kind }) => id === plan.target.id && kind === plan.target.kind);
    if (!target) throw Error("The selected assembly or section is missing. Choose a current target.");
    const deferred = new Set(plan.defer);
    const members = new Set(target.members);
    if (plan.defer.some((id) => !members.has(id))) throw Error("A part marked for later is missing or left the assembly. Review the route’s parts.");
    const moving = project.pieces.filter(({ id }) => members.has(id) && !deferred.has(id));
    if (!moving.length) throw Error("Keep at least one installed member in the route.");
    const vertices = moving.flatMap((piece) => {
      const shape = prepareCollisionSolid(piece);
      if (!shape) throw Error(`${partLabel(project, piece.id)} · ${piece.name} needs a modeled solid or envelope for this test.`);
      return shape.vertices;
    });
    const min = [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis]))) as V3;
    const max = [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis]))) as V3;
    const anchor: V3 = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
    result.anchor = anchor;
    const radius = Math.max(...vertices.map(([x, , z]) => Math.hypot(x - anchor[0], z - anchor[2])));
    const limitX = Math.max(0, ...plan.waypoints.map(({ x }) => Math.abs(x))) + radius + 4;
    const limitZ = Math.max(0, ...plan.waypoints.map(({ z }) => Math.abs(z))) + radius + 4;
    const slab = (name: string, y: number) => part(name, "plywood", [limitX * 2, 1, limitZ * 2],
      [anchor[0], y, anchor[2]], moving[0].stepId, "Installation boundaries");
    const scope = { ...project, pieces: [...project.pieces.filter(({ id }) => !deferred.has(id)),
      slab("Modeled floor", -0.5),
      ...(plan.ceiling !== undefined ? [slab("Measured ceiling", plan.ceiling + 0.5)] : []),
    ] };
    const [start] = plan.waypoints;
    let parked = new Map<string, Piece>();
    function addLeg(title: string, path: Path, travel: number, kind: Leg["kind"], checkedScope: Project, staged?: readonly Piece[]) {
      const limit = path.playbackLimit(0, travel);
      result.legs.push({ title, path, travel, kind, limit, staged });
      if (limit.inspectAt !== undefined) {
        const hit = path.preview(limit.travel, limit.inspectAt, limit.siteFaceId);
        const obstacle = hit.obstacleNames[0] ?? hit.siteFaceNames[0] ?? hit.outsideZoneFaces[0] ?? "possible obstruction";
        const uncertain = limit.uncertain || hit.envelopeOnly;
        result.state = uncertain ? "needs-review" : "blocked";
        result.detail = `${title} ${uncertain ? "needs review near" : "stops at"} ${motionDistance(limit.travel, kind)} · ${obstacle}.`;
        if (!plan.door && limit.contact) {
          const other = limit.contact.obstacleId;
          const door = project.motionPlans?.find(({ mechanism, memberIds }) => mechanism.kind === "hinge" &&
            memberIds.includes(other) && !memberIds.some((id) => members.has(id)));
          if (door) result.doorOption = { id: door.id, label: door.label, angle: door.mechanism.travel };
        }
        return false;
      }
      if (potentiallyInSweep(checkedScope, path)) {
        result.detail = `${title} passes near a part whose collision shape is unavailable. Review its actual profile before using this route.`;
        return false;
      }
      return true;
    }
    if (plan.door) {
      const door = project.motionPlans?.find(({ id }) => id === plan.door!.id);
      if (!door || door.mechanism.kind !== "hinge" || door.memberIds.some((id) => members.has(id)))
        throw Error("Choose a different saved hinged door outside the carried assembly.");
      const started = new Map(poseParts(moving, anchor, start).map((piece) => [piece.id, piece]));
      const beforeMoving = { ...scope, pieces: scope.pieces.map((piece) => started.get(piece.id) ?? piece) };
      const hinge = installationHinge(beforeMoving, door);
      if (plan.door.angle > hinge.mechanism.travel + epsilon) throw Error("The held angle exceeds the door’s saved opening travel.");
      const opening = reviewMotionPath(beforeMoving, hinge.parts, hinge.mechanism, { measuredSite: true });
      if (!addLeg(`Open ${door.label}`, opening, plan.door.angle, "hinge", beforeMoving, [...started.values()])) return result;
      parked = new Map(hinge.poseAt(plan.door.angle).map((piece) => [piece.id, piece]));
    }

    let previous = start;
    const nextPoints = [...plan.waypoints.slice(1), finalPose];
    for (const [index, point] of nextPoints.entries()) {
      const destination = index === nextPoints.length - 1 ? "final position" : `waypoint ${index + 1}`;
      const delta = subtract(coordinates(point), coordinates(previous));
      const distance = Math.hypot(...delta);
      if (distance > epsilon) {
        const path = reviewMotionPath(scope, poseParts(moving, anchor, previous),
          { kind: "slide", axis: delta.map((n) => n / distance) as V3, travel: distance }, { measuredSite: true, parkedPieces: parked });
        if (!addLeg(`Move to ${destination}`, path, distance, "slide", scope)) return result;
      }
      let angle = ((point.yaw - previous.yaw + 540) % 360) - 180;
      if (angle === -180 && point.yaw - previous.yaw > 0) angle = 180;
      if (Math.abs(angle) > epsilon) {
        const pivot = add(anchor, coordinates(point));
        const path = reviewMotionPath(scope, poseParts(moving, anchor, { ...point, yaw: previous.yaw }),
          { kind: "hinge", axis: [0, -Math.sign(angle), 0], pivot, travel: Math.abs(angle) }, { measuredSite: true, parkedPieces: parked });
        if (!addLeg(`Turn at ${destination}`, path, Math.abs(angle), "hinge", scope)) return result;
      }
      previous = point;
    }
    if (!result.legs.length) throw Error("Enter a measurable change from the final position.");
    result.state = "clear";
    result.detail = "The modeled assembly reaches its saved final position along this route.";
  } catch (cause) {
    result.detail = cause instanceof Error ? cause.message : "Review the installation route measurements.";
  }
  return result;
}

export function installationRoutePreview(report: RouteReview, leg: Leg, travel: number, stopped = false): MotionPreview {
  const preview = leg.path.preview(travel, stopped ? leg.limit.inspectAt : undefined, stopped ? leg.limit.siteFaceId : undefined);
  const { min, max } = preview.bounds;
  return {
    ...preview, pieces: [...preview.pieces, ...(leg.staged ?? [])], label: leg.title, hiddenPieceIds: report.hiddenIds,
    uncertainLimit: stopped && leg.limit.uncertain,
    ...(report.ceiling === undefined ? {} : { clearanceCeiling: {
      center: [(min[0] + max[0]) / 2, report.ceiling, (min[2] + max[2]) / 2],
      size: [max[0] - min[0] + 2, 0.1, max[2] - min[2] + 2],
    } }),
  };
}

export function saveInstallationRoute(project: Project, input: unknown) {
  const plan = installationRoute.parse(input);
  return projectSchema.parse({ ...project, guideFingerprint: null, installationRoutes: [
    ...(project.installationRoutes ?? []).filter(({ id }) => id !== plan.id), plan,
  ] });
}

export function installationRouteGuideLines(project: Project) {
  return (project.installationRoutes ?? []).flatMap((plan) => {
    const report = reviewInstallationRoute(project, plan);
    const offsets = plan.waypoints.map((point, index) => `${index === 0 ? "Start" : `Waypoint ${index}`} · X ${formatStockLength(point.x)}, Y ${formatStockLength(point.y)}, Z ${formatStockLength(point.z)}, yaw ${point.yaw}° from final.`);
    return [
      `${plan.name} · ${report.detail}`,
      ...(plan.ceiling === undefined ? [] : [`Measured ceiling ${formatStockLength(plan.ceiling)} above the model floor.`]),
      ...offsets,
      ...report.legs.map((leg) =>
        `${leg.title} · ${leg.limit.inspectAt === undefined ? motionDistance(leg.travel, leg.kind) : `review at ${motionDistance(leg.limit.travel, leg.kind)} of ${motionDistance(leg.travel, leg.kind)}`}.`),
      ...(report.doorOption ? [`Try the route with ${report.doorOption.label} held at ${report.doorOption.angle}° after checking it can open with the assembly staged.`] : []),
      ...(plan.defer.length ? [`Fit these parts after placement: ${plan.defer.map((id) => {
        const piece = project.pieces.find((row) => row.id === id && !row.offcut);
        return piece ? `${partLabel(project, id)} · ${piece.name}` : `${partLabel(project, id)} (missing)`;
      }).join(", ")}.`] : []),
      installationRouteScope,
    ];
  });
}
