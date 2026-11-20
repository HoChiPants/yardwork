import {
  motionDistance,
  reviewMotion,
  reviewMotionPath,
  type MotionPreview,
} from "./mechanismMotion";
import { formatPreciseInches as inches } from "./measurement";
import { material, part, type Piece, type Project, type V3 } from "./model";
import { saunaBenchReview } from "./saunaBenches";
import { saunaDoorPlanEntry } from "./saunaDoors";
import { saunaHeaterReview, saunaRooms } from "./saunaHeaters";
import {
  saunaBenchTravelInputSchema,
  saunaBenchTravelSchema,
  type SaunaBenchTravelPlan,
} from "./saunaBenchTravelSchema";
import { composeRotation, inverseRotation, rotate } from "./spatial";

const epsilon = 1e-6;
const plus = (a: V3, b: V3) => a.map((v, i) => v + b[i]) as V3;
const minus = (a: V3, b: V3) => a.map((v, i) => v - b[i]) as V3;
const indoorAssembly =
  "Measure the delivered prebuilt seat and leg assemblies separately. Consider carrying the pieces in and assembling the bench inside the room where there is space to work.";
export const benchTravelScope =
  "This test uses the assembled bench envelope, measured doorway and one end-first route. Confirm carrying space, hand clearance, threshold, weight and installation order on site.";

export function saunaBenchTravelRooms(project: Project) {
  return saunaRooms(project).filter(
    ({ entry }) =>
      entry.spec.type === "structure" &&
      entry.spec.structure.selections.saunaBench,
  );
}

export function saveSaunaBenchTravel(
  project: Project,
  roomId: string,
  input: unknown,
) {
  const room = saunaBenchTravelRooms(project).find(
    ({ entry }) => entry.id === roomId,
  );
  const bench = room && saunaBenchReview(project, room.entry)?.piece;
  if (!room || !bench)
    throw Error("Choose a sauna with its selected bench in the model.");
  const plan = saunaBenchTravelSchema.parse({
    ...saunaBenchTravelInputSchema.parse(input),
    roomId,
    benchId: bench.id,
    roughWidth: room.parameters.doorWidth,
    roughHeight: room.parameters.doorHeight,
  });
  if (
    Math.abs(plan.openingOffset) + plan.openingWidth / 2 >
      plan.roughWidth / 2 + epsilon ||
    plan.openingHeight + plan.sillRise > plan.roughHeight + epsilon
  )
    throw Error(
      "The measured opening exceeds the modeled rough opening. Recheck the finished dimensions or the room model.",
    );
  const rest = (project.saunaBenchTravelPlans ?? []).filter(
    (row) => row.roomId !== roomId,
  );
  if (rest.length >= 50)
    throw Error("This project has 50 saved carry-in plans.");
  return { ...project, saunaBenchTravelPlans: [...rest, plan] };
}

type BenchLeg = {
  label: string;
  path: ReturnType<typeof reviewMotionPath>;
  kind: Mechanism["kind"];
  amount: number;
  obstaclePieces: Piece[];
  limit: ReturnType<ReturnType<typeof reviewMotionPath>["playbackLimit"]>;
  blocker: string | null;
};
type BenchRoute = {
  plan: SaunaBenchTravelPlan;
  name: string;
  state: "clear" | "blocked" | "needs-review";
  detail: string;
  legs: BenchLeg[];
};
type Mechanism = Parameters<typeof reviewMotionPath>[2];

export function reviewSaunaBenchTravel(
  project: Project,
  plan: SaunaBenchTravelPlan,
): BenchRoute {
  const room = saunaBenchTravelRooms(project).find(
    ({ entry }) => entry.id === plan.roomId,
  );
  const name = room?.title ?? "Saved sauna";
  const legs: BenchLeg[] = [];
  const report = (state: BenchRoute["state"], detail: string): BenchRoute => ({
    plan,
    name,
    state,
    detail,
    legs,
  });
  try {
    const benchReview = room && saunaBenchReview(project, room.entry);
    const bench = benchReview?.piece;
    if (!room || !bench || bench.id !== plan.benchId)
      return report(
        "needs-review",
        "The saved bench or room has changed. Select the installed bench and save new carry-in measurements.",
      );
    const p = room.parameters;
    if (
      p.doorWidth !== plan.roughWidth ||
      p.doorHeight !== plan.roughHeight ||
      Math.abs(plan.openingOffset) + plan.openingWidth / 2 >
        p.doorWidth / 2 + epsilon ||
      plan.openingHeight + plan.sillRise > p.doorHeight + epsilon
    )
      return report(
        "needs-review",
        "The modeled opening has changed. Confirm the finished doorway dimensions again.",
      );
    const benchSize = material(bench.material).size;
    if (
      bench.size.some(
        (value, axis) => Math.abs(value - benchSize[axis]) > epsilon,
      ) ||
      benchReview.findings.some(({ kind }) => kind === "fit")
    )
      return report(
        "needs-review",
        "Restore the selected bench’s listed size and level final position before testing the carry-in.",
      );
    const { rotation, origin } = room.entry.pose;
    if (
      Math.hypot(...minus(rotate([0, 1, 0], rotation), [0, 1, 0])) > epsilon ||
      Math.hypot(...minus(rotate([0, 1, 0], bench.rotation), [0, 1, 0])) >
        epsilon
    )
      return report(
        "needs-review",
        "Keep the modeled sauna and bench level to test a level carry.",
      );
    if (
      bench.size[2] > plan.openingWidth + epsilon ||
      plan.lift < plan.sillRise - epsilon ||
      plan.lift + bench.size[1] > plan.sillRise + plan.openingHeight + epsilon
    )
      return report(
        "blocked",
        `The end-first bench needs ${inches(bench.size[2])} in width across its depth and enough height for the entered lift above the sill. ${indoorAssembly}`,
      );
    if (
      Math.abs(plan.turnOffset) + bench.size[0] / 2 >
      p.clearDepth / 2 + epsilon
    )
      return report(
        "blocked",
        `The full bench cannot reach this turning point end-first inside the room. Adjust the turning point or try a different assembly order. ${indoorAssembly}`,
      );
    const toWorld = (point: V3) => plus(rotate(point, rotation), origin);
    const obstacles: Piece[] = [];
    function boundary(label: string, low: V3, high: V3) {
      const size = minus(high, low);
      if (size.some((value) => value <= epsilon)) return;
      obstacles.push(
        part(
          label,
          "plywood",
          size,
          toWorld(low.map((value, axis) => value + size[axis] / 2) as V3),
          bench!.stepId,
          "Finished opening",
          rotation,
        ),
      );
    }
    const x = p.clearWidth / 2,
      z = p.clearDepth / 2,
      h = p.clearHeight;
    const left = plan.openingOffset - plan.openingWidth / 2,
      right = plan.openingOffset + plan.openingWidth / 2,
      front = z + plan.passageDepth;
    boundary("Finished left wall", [-x - 1, 0, -z], [-x, h, z]);
    boundary("Finished right wall", [x, 0, -z], [x + 1, h, z]);
    boundary("Finished rear wall", [-x, 0, -z - 1], [x, h, -z]);
    boundary("Finished ceiling", [-x, h, -z], [x, h + 1, z]);
    boundary("Finished left jamb", [-x, 0, z], [left, h, front]);
    boundary("Finished right jamb", [right, 0, z], [x, h, front]);
    boundary(
      "Finished head",
      [left, plan.sillRise + plan.openingHeight, z],
      [right, h, front],
    );
    boundary("Finished sill", [left, 0, z], [right, plan.sillRise, front]);

    const obstaclePieces: Piece[] = [];
    if (plan.heaterPlaced) {
      const heater = saunaHeaterReview(project, plan.roomId)?.layout;
      if (!heater)
        return report(
          "needs-review",
          "Save the heater body location to test the route with the heater in place.",
        );
      obstaclePieces.push(
        part(
          "Modeled heater body",
          "plywood",
          heater.body.size,
          heater.body.center,
          bench.stepId,
          "Heater",
          heater.rotation,
        ),
      );
    }
    const doorPlan = project.motionPlans?.find(
      (row) => saunaDoorPlanEntry(row) === plan.roomId,
    );
    const modeledLeaf = room.entry.sections.some(
      ({ role }) => role === "sauna-door-leaf",
    );
    const parked = new Map<string, Piece>();
    if (modeledLeaf) {
      if (!doorPlan)
        return report(
          "needs-review",
          "Save an opening angle for the modeled sauna door before testing the bench carry-in.",
        );
      const motion = reviewMotion(project, doorPlan);
      const limit = motion.playbackLimit(0, doorPlan.mechanism.travel);
      if (limit.inspectAt !== undefined)
        return report(
          "needs-review",
          "The door cannot reach its saved opening angle. Resolve the door swing or choose a clear angle.",
        );
      for (const piece of motion.preview(doorPlan.mechanism.travel).pieces)
        parked.set(piece.id, piece);
    }
    const scope = {
      ...project,
      pieces: [...project.pieces, ...obstacles, ...obstaclePieces],
    };
    const carryY = bench.size[1] / 2 + plan.lift;
    let moving: Piece = {
      ...bench,
      position: toWorld([
        plan.openingOffset,
        carryY,
        front + bench.size[0] / 2 + 1,
      ]),
      rotation: composeRotation(rotation, [0, Math.PI / 2, 0]),
    };
    let stopped = false;
    function append(label: string, mechanism: Mechanism) {
      if (stopped || mechanism.travel <= epsilon) return;
      const path = reviewMotionPath(scope, [moving], mechanism, {
        parkedPieces: parked,
        measuredSite: true,
      });
      const limit = path.playbackLimit(0, mechanism.travel);
      const at = limit.inspectAt;
      const blocked =
        at === undefined
          ? null
          : path.preview(limit.travel, at, limit.siteFaceId);
      const blocker = blocked
        ? (blocked.obstacleNames[0] ??
          blocked.outsideZoneFaces[0] ??
          blocked.siteFaceNames[0] ??
          "Clearance needs inspection")
        : path.unresolvedIds.length
          ? "Some modeled parts have unavailable geometry"
          : null;
      legs.push({
        label,
        path,
        kind: mechanism.kind,
        amount: mechanism.travel,
        obstaclePieces,
        limit,
        blocker,
      });
      if (blocker) stopped = true;
      else moving = path.preview(mechanism.travel).pieces[0];
    }
    function slide(label: string, destination: V3) {
      const delta = minus(destination, moving.position);
      const travel = Math.hypot(...delta);
      if (travel > epsilon)
        append(label, {
          kind: "slide",
          axis: delta.map((v) => v / travel) as V3,
          travel,
        });
    }
    slide(
      "Carry end-first through the doorway",
      toWorld([plan.openingOffset, carryY, plan.turnOffset]),
    );
    const localLong = rotate(
      rotate([1, 0, 0], bench.rotation),
      inverseRotation(rotation),
    );
    const targetYaw = Math.atan2(-localLong[2], localLong[0]);
    const delta = Math.atan2(
      Math.sin(targetYaw - Math.PI / 2),
      Math.cos(targetYaw - Math.PI / 2),
    );
    append("Turn the bench inside", {
      kind: "hinge",
      // The motion engine measures clockwise opening around its directed axis.
      axis: rotate([0, -Math.sign(delta), 0], rotation),
      pivot: moving.position,
      travel: (Math.abs(delta) * 180) / Math.PI,
    });
    slide(
      "Move to the planned location",
      plus(bench.position, rotate([0, plan.lift, 0], rotation)),
    );
    slide("Lower onto the finished floor", bench.position);
    const failed = legs.find(({ blocker }) => blocker);
    return failed
      ? report(
          "blocked",
          `${failed.label} · ${failed.blocker}. ${indoorAssembly}`,
        )
      : report(
          "clear",
          "The assembled bench clears this modeled end-first route.",
        );
  } catch (cause) {
    return report(
      "needs-review",
      cause instanceof Error
        ? cause.message
        : "Review the bench and doorway geometry.",
    );
  }
}

export function saunaBenchLegPreview(
  leg: BenchLeg,
  travel: number,
  stopped = false,
): MotionPreview {
  return {
    ...leg.path.preview(
      travel,
      stopped ? leg.limit.inspectAt : undefined,
      stopped ? leg.limit.siteFaceId : undefined,
    ),
    label: leg.label,
    obstaclePieces: leg.obstaclePieces,
    uncertainLimit: stopped && leg.limit.uncertain,
  };
}

export function saunaBenchTravelGuideLines(project: Project) {
  return (project.saunaBenchTravelPlans ?? []).flatMap((plan) => {
    const review = reviewSaunaBenchTravel(project, plan);
    return [
      `${review.name} · ${plan.heaterPlaced ? "Heater body in place" : "Bench before heater"} · ${review.detail}`,
      `Finished opening ${inches(plan.openingWidth)} × ${inches(plan.openingHeight)} · sill ${inches(plan.sillRise)} · opening offset ${inches(plan.openingOffset)} · passage depth ${inches(plan.passageDepth)} · carry lift ${inches(plan.lift)} · turn offset ${inches(plan.turnOffset)}.`,
      ...(review.state === "clear"
        ? review.legs.map(
            (leg, index) =>
              `${index + 1}. ${leg.label} · ${motionDistance(leg.amount, leg.kind)}.`,
          )
        : []),
      benchTravelScope,
    ];
  });
}
