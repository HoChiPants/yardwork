import {
  greenhouseDoorGeometry,
  greenhouseDoorReview,
} from "./greenhouseDoors";
import { greenhouseDoorKits } from "./greenhouseDoorReference";
import {
  greenhouseLatchInputSchema,
  greenhouseLatchSchema,
  type GreenhouseLatchMount,
  type GreenhouseLatchPlan,
} from "./greenhouseLatchSchema";
import { formatPreciseInches as length } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import {
  reviewSocketPlateFace,
  reviewWoodMountHoles,
  socketFaceAxes,
} from "./rodMountGeometry";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
} from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

export const everbiltLatch = greenhouseDoorKits["everbilt-24417-gate-kit"];
export const latchPilotDiameter = 3 / 16;
export const greenhouseLatchScope =
  "Confirm the delivered hardware, screw engagement and a usable release from both sides on the actual door. This checks the closed mounting layout and measured alignment. Dry-fit and operate the latch before drilling.";

const epsilon = 1e-6;
const plus = (a: V3, b: V3) => a.map((x, i) => x + b[i]) as V3;
const minus = (a: V3, b: V3) => a.map((x, i) => x - b[i]) as V3;
const world = (local: V3, pose: { origin: V3; rotation: V3 }) =>
  plus(rotate(local, pose.rotation), pose.origin);

export function supportsGreenhouseLatch(motion?: MotionPlan) {
  return (
    motion?.mechanism.kind === "hinge" &&
    motion.mechanism.greenhouseDoor?.kitId === "everbilt-24417-gate-kit"
  );
}

function layout(
  project: Project,
  motionId: string,
  height: number,
  keeperHeightOffset: number,
) {
  const motion = project.motionPlans?.find(({ id }) => id === motionId);
  if (
    !motion ||
    motion.mechanism.kind !== "hinge" ||
    !motion.mechanism.greenhouseDoor ||
    !supportsGreenhouseLatch(motion)
  )
    throw Error(
      "Select the Everbilt 24417 hardware on a saved greenhouse door swing.",
    );
  const review = greenhouseDoorReview(project, motion);
  if (review?.warning) throw Error(review.warning);
  const setup = motion.mechanism.greenhouseDoor;
  const shape = greenhouseDoorGeometry(project, setup.entryId);
  const { opening, localBounds } = shape;
  const bottom = 2 * shape.midHeight - shape.top;
  const latchY = bottom + height;
  const keeperY = latchY + keeperHeightOffset;
  if (
    [latchY, keeperY].some(
      (y) => y <= bottom + epsilon || y >= shape.top - epsilon,
    )
  )
    throw Error(
      "Keep both mounting heights between the bottom and top of the modeled door.",
    );
  const side = setup.side === "right" ? "left" : "right";
  const sign = side === "right" ? 1 : -1;
  const jamb = shape.jambs[side];
  if (!jamb)
    throw Error("Restore the latch-side jamb before laying out the hardware.");
  const latchEdge = sign > 0 ? jamb.min[0] : jamb.max[0];
  const keeperEdge = sign > 0 ? shape.right : shape.left;
  function mount(candidates: Piece[], edge: number, y: number, inner: boolean) {
    const available = candidates
      .flatMap((piece) => {
        if (!material(piece.material).wood) return [];
        const { min, max } = localBounds(piece);
        const actualEdge = (inner ? -sign : sign) > 0 ? max[0] : min[0];
        return Math.abs(actualEdge - edge) < epsilon &&
          y > min[1] + epsilon &&
          y < max[1] - epsilon
          ? [{ piece, edge, y, front: max[2] }]
          : [];
      })
      .sort((a, b) => b.front - a.front);
    if (available.length !== 1)
      throw Error(
        "The mounting height must identify one solid wood member at each meeting edge.",
      );
    return available[0];
  }
  return {
    opening,
    side,
    sign,
    latch: mount(shape.fixed, latchEdge, latchY, true),
    keeper: mount(shape.leafMembers, keeperEdge, keeperY, false),
  };
}
type Layout = ReturnType<typeof layout>;

export function saveGreenhouseLatch(
  project: Project,
  motionId: string,
  input: unknown,
) {
  const draft = greenhouseLatchInputSchema.parse(input);
  const base = layout(
    project,
    motionId,
    draft.height,
    draft.keeperHeightOffset,
  );
  const plan = greenhouseLatchSchema.parse({
    ...draft,
    motionId,
    side: base.side,
    latchId: base.latch.piece.id,
    keeperId: base.keeper.piece.id,
  });
  const plans = (project.greenhouseLatchPlans ?? []).filter(
    (p) => p.motionId !== motionId,
  );
  if (plans.length >= 50)
    throw Error("This project has 50 saved latch layouts.");
  return { ...project, greenhouseLatchPlans: [...plans, plan] };
}

export function clearGreenhouseLatch(
  project: Project,
  motionId: string,
): Project {
  if (!project.greenhouseLatchPlans?.some((plan) => plan.motionId === motionId))
    return project;
  return {
    ...project,
    greenhouseLatchPlans: project.greenhouseLatchPlans.filter(
      (p) => p.motionId !== motionId,
    ),
  };
}

function mountReview(
  project: Project,
  base: Layout,
  role: "latch" | "keeper",
  dims: GreenhouseLatchMount,
) {
  const { opening, sign } = base;
  const { piece, edge, y, front } = base[role];
  const inward = role === "latch" ? sign : -sign;
  const center: V3 = [edge + inward * dims.inset, y, front];
  const origin = world(center, opening);
  const inv = inverseRotation(piece.rotation);
  const pointLocal = rotate(minus(origin, piece.position), inv);
  const relative = (axis: V3) => rotate(rotate(axis, opening.rotation), inv);
  const normalLocal = relative([0, 0, 1]);
  const face = socketFaceAxes(normalLocal);
  const horizontal = relative([1, 0, 0]);
  const vertical = relative([0, 1, 0]);
  const mountFace = ["X", "Y", "Z"] as const;
  if (
    !face ||
    Math.abs(
      pointLocal[face.axis] * normalLocal[face.axis] -
        piece.size[face.axis] / 2,
    ) > epsilon
  )
    throw Error(
      "The hardware needs a flat exterior face aligned with the closed door.",
    );
  const [u, v] = face.across;
  const extents: [number, number, number, number] = [u, u, v, v].map(
    (axis) => (Math.abs(horizontal[axis]) > 0.5 ? dims.width : dims.height) / 2,
  ) as [number, number, number, number];
  const outline = reviewSocketPlateFace(
    piece,
    pointLocal,
    normalLocal,
    extents,
  );
  if (!outline) throw Error("Mounting face axes are unavailable.");
  const accessSize: V3 = [dims.width, dims.height, dims.clearanceDepth];
  const accessCenter = world(
    [center[0], y, front + dims.clearanceDepth / 2],
    opening,
  );
  const accessRadius = Math.hypot(...accessSize) / 2;
  const access = prepareCollisionBox(
    accessSize,
    accessCenter,
    opening.rotation,
  );
  const blockers = project.pieces.flatMap((other) => {
    if (
      other.id === piece.id ||
      other.offcut ||
      Math.hypot(...minus(other.position, accessCenter)) >
        accessRadius + Math.hypot(...other.size) / 2
    )
      return [];
    const solid =
      prepareCollisionSolid(other) ??
      prepareCollisionBox(other.size, other.position, other.rotation);
    return solidOverlap(access, solid, epsilon)
      ? [partLabel(project, other.id) + " " + other.name]
      : [];
  });
  const issues = [
    ...(outline.crossesEdge
      ? ["The plate footprint crosses a retained wood edge."]
      : []),
    ...(outline.crossesVoid
      ? ["The plate footprint crosses a through-cut."]
      : []),
    ...(blockers.length
      ? [
          `The space in front of the plate meets ${blockers.slice(0, 3).join(", ")}.`,
        ]
      : []),
  ];
  const holes = reviewWoodMountHoles(
    piece,
    { pointLocal, normalLocal },
    extents,
    {
      ...dims,
      pilotDiameter: latchPilotDiameter,
      basis: "Transferred from the delivered Everbilt mount",
      centers: dims.centers.map(([dx, dy]) => [
        dx * horizontal[u] + dy * vertical[u],
        dx * horizontal[v] + dy * vertical[v],
      ]),
    },
    issues.length === 0,
  );
  const target: V3 = [
    center[0] - inward * dims.reach,
    y + dims.rise,
    front + dims.standout,
  ];
  return {
    role,
    piece,
    outline: outline.corners.map((point) =>
      plus(rotate(point, piece.rotation), piece.position),
    ),
    axes: [mountFace[u], mountFace[v]],
    normalAxis: (normalLocal[face.axis] < 0 ? "−" : "+") + mountFace[face.axis],
    holes,
    issues,
    origin,
    target,
    targetWorld: world(target, opening),
  };
}

export function reviewGreenhouseLatch(
  project: Project,
  plan: GreenhouseLatchPlan,
) {
  try {
    const base = layout(
      project,
      plan.motionId,
      plan.height,
      plan.keeperHeightOffset,
    );
    if (
      base.side !== plan.side ||
      base.latch.piece.id !== plan.latchId ||
      base.keeper.piece.id !== plan.keeperId
    )
      throw Error(
        "The latch side or mounting member changed. Review the new parts and save the measured layout again.",
      );
    const latch = mountReview(project, base, "latch", plan.latch);
    const keeper = mountReview(project, base, "keeper", plan.keeper);
    const delta = minus(keeper.target, latch.target);
    const aligned = delta.every(
      (value) => Math.abs(value) <= plan.tolerance + epsilon,
    );
    const checked =
      aligned &&
      [latch, keeper].every((item) => item.holes.state === "checked");
    return {
      state: checked ? ("checked" as const) : ("conflict" as const),
      mounts: [latch, keeper],
      delta,
      aligned,
      detail: checked
        ? "The closed latch alignment and mounting marks fit the model."
        : "Review the closed alignment and flagged mounting marks.",
    };
  } catch (cause) {
    return {
      state: "stale" as const,
      mounts: [],
      delta: null,
      aligned: false,
      detail:
        cause instanceof Error
          ? cause.message
          : "Review the greenhouse door and latch layout.",
    };
  }
}

const roleName = { latch: "Jamb latch", keeper: "Door keeper" } as const;
export function greenhouseLatchGuideLines(project: Project) {
  return (project.greenhouseLatchPlans ?? []).flatMap((plan) => {
    const review = reviewGreenhouseLatch(project, plan);
    const doorLabel =
      project.motionPlans?.find(({ id }) => id === plan.motionId)?.label ??
      "Saved greenhouse latch";
    return [
      `${doorLabel} · Everbilt 24417 · ${review.detail}`,
      `Jamb latch center ${length(plan.height)} from the bottom of the closed door · keeper center offset ${length(plan.keeperHeightOffset)} from the jamb latch.`,
      ...(review.delta
        ? [
            `Closed keeper offset from latch · Left/right ${length(review.delta[0])} · Height ${length(review.delta[1])} · Front/back ${length(review.delta[2])} · entered tolerance ${length(plan.tolerance)} per axis.`,
          ]
        : []),
      ...review.mounts.flatMap(
        ({ role, piece, issues, holes, axes, normalAxis }) => {
          const label = `${roleName[role]} · ${partLabel(project, piece.id)}`;
          if (review.state !== "checked")
            return [
              `${label} · ${
                issues
                  .concat(holes.marks.flatMap((mark) => mark.issues))
                  .filter((value, index, list) => list.indexOf(value) === index)
                  .join(" ") ||
                "Resolve the closed latch alignment before transferring marks."
              }`,
            ];
          return [
            `${label} · pilot Ø 3/16 in, ${length(plan[role].pilotDepth)} to its tip past the wood face · screw penetration ${length(plan[role].screwDepth)}.`,
            ...holes.marks.map(
              ({ index, local }) =>
                `${label} hole ${index} · from the part center on its ${normalAxis} face · ${axes.map((axis) => axis + " " + length(local["XYZ".indexOf(axis)])).join(" · ")}.`,
            ),
          ];
        },
      ),
      greenhouseLatchScope,
    ];
  });
}
