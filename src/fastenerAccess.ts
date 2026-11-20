import { Euler, Quaternion, Vector3 } from "three";
import { assemblyStages } from "./assemblyStages";
import { clipBox } from "./cutProfiles";
import type { FastenerReview } from "./fastenings";
import { qualifiedFastenerLabel } from "./fastenings";
import { formatPreciseInches } from "./measurement";
import { isHardware, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { gapToSiteFace, siteClearanceFacesByPart } from "./siteClearance";
import {
  prepareCollisionBox,
  prepareCollisionSolid,
  solidOverlap,
} from "./solidCollision";
import { rotate } from "./spatial";

const epsilon = 1e-6;
export const driverAccessScope =
  "Check the actual tool, inserted bit, grip and working position on the dry-fit assembly. The model checks the entered straight approach using square envelopes around the measured shaft and body.";

type Stage = { title: string; index: number };
type AccessStageOrder = "saved" | "suggested";
type Envelope = { center: V3; size: V3; rotation: V3 };
export type DriverAccessLocation = {
  id: string;
  label: string;
  state: "clear" | "before-stage" | "within-stage" | "blocked" | "pending";
  detail: string;
  envelopes: Envelope[];
  blockerIds: string[];
};
type AccessReview = {
  review: FastenerReview;
  order: AccessStageOrder;
  locations: DriverAccessLocation[];
};

function stageAssignments(project: Project) {
  const stages = assemblyStages(project);
  const steps = new Map(
    project.steps.map((step, index) => [step.id, { step, index }]),
  );
  const stepByPart = new Map(
    project.pieces.map((piece) => [piece.id, piece.stepId]),
  );
  const assigned = stages.map((stage) => {
    const stepId = stepByPart.get(stage.memberIds[0]);
    const saved = stepId ? steps.get(stepId) : undefined;
    const phase = saved?.step.generated;
    if (
      phase?.kind !== "assembly-stage" ||
      phase.stageKey !== stage.key ||
      (phase.planId !== stage.ownerId && stage.ownerId !== project.id) ||
      phase.memberIds.length !== stage.memberIds.length ||
      !stage.memberIds.every(
        (id) => stepByPart.get(id) === stepId && phase.memberIds.includes(id),
      )
    )
      return undefined;
    return saved;
  });
  const savedMatches = stages.length > 0 && assigned.every(Boolean);
  return {
    order: savedMatches ? ("saved" as const) : ("suggested" as const),
    parts: new Map(
      stages.flatMap((stage, index) => {
        const saved = savedMatches ? assigned[index] : undefined;
        const value: Stage = {
          title: saved?.step.title ?? stage.title,
          index: saved?.index ?? index,
        };
        return stage.memberIds.map((id) => [id, value] as const);
      }),
    ),
  };
}

function blockersDescription(project: Project, pieces: readonly Piece[]) {
  const names = pieces
    .slice(0, 4)
    .map((piece) => `${partLabel(project, piece.id)} ${piece.name}`);
  return (
    names.join(", ") +
    (pieces.length > 4 ? ` and ${pieces.length - 4} more` : "")
  );
}

export function reviewDriverAccess(
  project: Project,
  reviews: readonly FastenerReview[],
): AccessReview[] {
  const measured = reviews.filter(({ plan }) => plan.driverAccess);
  if (!measured.length) return [];
  const { order, parts } = stageAssignments(project);
  const candidates = project.pieces
    .filter((p) => !p.offcut && !isHardware(p.material))
    .map((piece) => ({ piece, radius: Math.hypot(...piece.size) / 2 }));
  const prepared = new Map<string, ReturnType<typeof prepareCollisionSolid>>();
  const siteFaces = siteClearanceFacesByPart(project);
  return measured.map((review) => {
    const { plan } = review;
    const access = plan.driverAccess!;
    const head = parts.get(plan.head.pieceId);
    const receiver = parts.get(plan.receiver.pieceId);
    const ready =
      head && receiver
        ? head.index >= receiver.index
          ? head
          : receiver
        : null;
    const planes = [
      ...new Map(
        [
          ...(siteFaces.get(plan.head.pieceId) ?? []),
          ...(siteFaces.get(plan.receiver.pieceId) ?? []),
        ].map((plane) => [plane.id, plane]),
      ).values(),
    ];
    const locations = review.locations.map((item): DriverAccessLocation => {
      const { entranceWorld: entry, driveWorld: drive } = item;
      const base = {
        id: item.location.id,
        label: qualifiedFastenerLabel(plan, item.location),
      };
      if (
        !entry ||
        !drive ||
        item.state === "stale" ||
        item.state === "conflict"
      )
        return {
          ...base,
          state: "pending",
          detail:
            "Review the screw entrance and path before testing tool access.",
          envelopes: [],
          blockerIds: [],
        };
      const outward = new Vector3(...drive).negate().normalize();
      const e = new Euler().setFromQuaternion(
        new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), outward),
      );
      const rotation: V3 = [e.x, e.y, e.z];
      function envelope(start: number, depth: number, width: number): Envelope {
        return {
          size: [width, width, depth],
          center: new Vector3(...entry!)
            .addScaledVector(outward, start + depth / 2)
            .toArray() as V3,
          rotation,
        };
      }
      const envelopes = [
        envelope(0, access.bitReach + access.approachTravel, access.shaftWidth),
        envelope(
          access.bitReach,
          access.bodyLength + access.approachTravel,
          access.bodyWidth,
        ),
      ];
      const solids = envelopes.map(({ size, center, rotation }) =>
        prepareCollisionBox(size, center, rotation),
      );
      const floor = solids.some((solid) => solid.bounds.min[1] < -epsilon);
      const fixed = planes.filter((plane) =>
        envelopes.some(({ size, center, rotation }) => {
          const shape = clipBox(size, []);
          const gap = gapToSiteFace(
            {
              vertices: shape.vertices.map(
                (p) => rotate(p, rotation).map((v, i) => v + center[i]) as V3,
              ),
              faces: shape.faces,
            },
            plane,
          );
          return gap !== null && gap < -epsilon;
        }),
      );
      const blockers = candidates.flatMap(({ piece, radius }) => {
        if (
          !envelopes.some(
            ({ center, size }) =>
              Math.hypot(...center.map((v, i) => v - piece.position[i])) <=
              radius + Math.hypot(...size) / 2 + epsilon,
          )
        )
          return [];
        if (!prepared.has(piece.id))
          prepared.set(
            piece.id,
            prepareCollisionSolid(piece) ??
              prepareCollisionBox(piece.size, piece.position, piece.rotation),
          );
        const retained = prepared.get(piece.id)!;
        return solids.some((solid) => solidOverlap(solid, retained, epsilon))
          ? [{ piece, stage: parts.get(piece.id) }]
          : [];
      });
      const blockerIds = blockers.map(({ piece }) => piece.id);
      const report = (
        state: DriverAccessLocation["state"],
        detail: string,
      ) => ({ ...base, state, detail, envelopes, blockerIds });
      if (floor || fixed.length) {
        const obstacles = [
          ...(floor ? ["the modeled floor"] : []),
          ...fixed.map((plane) => plane.label),
        ];
        const guidance = fixed.length
          ? "Review a different tool or a dry-fit position with more site clearance."
          : "Review a different tool or a raised dry-fit setup.";
        return report(
          "blocked",
          `The straight tool approach meets ${obstacles.join(", ")}. ${guidance}`,
        );
      }
      if (!blockers.length)
        return report(
          "clear",
          "The measured straight tool approach clears the modeled assembly.",
        );
      const blockedBy = blockersDescription(
        project,
        blockers.map(({ piece }) => piece),
      );
      const required = blockers.some(
        ({ piece }) =>
          piece.id === plan.head.pieceId || piece.id === plan.receiver.pieceId,
      );
      if (
        required ||
        !ready ||
        blockers.some(({ stage }) => !stage || stage.index < ready.index)
      )
        return report(
          "blocked",
          `The tool approach meets ${blockedBy}. Review a different entry, tool or assembly order.`,
        );
      const first = blockers.reduce((a, b) =>
        a.stage!.index <= b.stage!.index ? a : b,
      ).stage!;
      const firstParts = blockersDescription(
        project,
        blockers
          .filter(({ stage }) => stage?.index === first.index)
          .map(({ piece }) => piece),
      );
      return first.index === ready.index
        ? report(
            "within-stage",
            `During “${ready.title}”, dry-fit both screw members and check access before adding ${firstParts}.`,
          )
        : report(
            "before-stage",
            `Dry-fit both screw members during “${ready.title}” and check access before “${first.title}” adds ${firstParts}.`,
          );
    });
    return { review, order, locations };
  });
}

export function driverAccessGuideLines(
  project: Project,
  reviews: readonly FastenerReview[],
) {
  return reviewDriverAccess(project, reviews).flatMap(
    ({ review, order, locations }) => {
      const access = review.plan.driverAccess!;
      return [
        `${review.plan.label} · ${order === "saved" ? "Saved guide order" : "Suggested assembly order"} · shaft ${formatPreciseInches(access.shaftWidth)} wide with ${formatPreciseInches(access.bitReach)} reach · tool body ${formatPreciseInches(access.bodyWidth)} wide × ${formatPreciseInches(access.bodyLength)} long · approach travel ${formatPreciseInches(access.approachTravel)}.`,
        ...(locations.length
          ? locations.map((row) => `${row.label} · ${row.detail}`)
          : ["Record a screw location to check its tool approach."]),
        driverAccessScope,
      ];
    },
  );
}
