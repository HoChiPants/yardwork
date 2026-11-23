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
import { drywallPlateGuidePanels } from "./topPlateSeal";

const epsilon = 1e-6;
export const driverAccessScope =
  "Check the actual tool, inserted bit, grip and working position on the dry-fit assembly. The model checks the entered straight approach using square envelopes around the measured shaft and body.";

type Stage = { title: string; index: number };
type AccessStageOrder = "saved" | "suggested";
export const driverAccessOrderName = {
  saved: "Saved guide order",
  suggested: "Suggested assembly order",
  mixed: "Order varies by approach",
} as const;
type Envelope = { center: V3; size: V3; rotation: V3 };
export type DriverAccessLocation = {
  id: string;
  label: string;
  state: "clear" | "before-stage" | "within-stage" | "blocked" | "pending";
  order: AccessStageOrder;
  detail: string;
  envelopes: Envelope[];
  blockerIds: string[];
};
export const driverAccessStateName: Record<DriverAccessLocation["state"], string> = {
  clear: "Clear",
  "before-stage": "Fasten before adding a later part",
  "within-stage": "Fasten before another part in this step",
  blocked: "Approach blocked",
  pending: "Path needs review",
};
type AccessReview = {
  review: FastenerReview;
  order: AccessStageOrder | "mixed";
  locations: DriverAccessLocation[];
};

function stageAssignments(project: Project) {
  const suggested = new Map(assemblyStages(project).flatMap((stage) =>
    stage.memberIds.map((id) => [id, { ...stage, index: stage.order }] as const),
  ));
  const steps = new Map(project.steps.map((step, index) => [step.id, {
    title: step.title,
    index,
    phase: step.generated,
    members: new Set(step.generated?.kind === "assembly-stage" ? step.generated.memberIds : []),
  }]));
  const drywall = drywallPlateGuidePanels(project);
  const saved = new Map<string, Stage>();
  for (const piece of project.pieces) {
    const live = suggested.get(piece.id);
    const step = steps.get(piece.stepId);
    if (!live || !step?.members.has(piece.id) || step.phase?.kind !== "assembly-stage") continue;
    const isDrywallPhase = drywall.standalone.has(piece.id) &&
      step.phase.planId === project.id && step.phase.stageKey === drywall.stageKey;
    if (isDrywallPhase ||
      (step.phase.stageKey === live.key && step.phase.planId === live.ownerId))
      saved.set(piece.id, step);
  }
  return { saved, suggested };
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
  const { saved, suggested } = stageAssignments(project);
  const candidates = project.pieces
    .filter((p) => !p.offcut && !isHardware(p.material))
    .map((piece) => ({ piece, radius: Math.hypot(...piece.size) / 2 }));
  const prepared = new Map<string, ReturnType<typeof prepareCollisionSolid>>();
  const siteFaces = siteClearanceFacesByPart(project);
  return measured.map((review) => {
    const { plan } = review;
    const access = plan.driverAccess!;
    const readyStage = (stages: ReadonlyMap<string, Stage>) => {
      const head = stages.get(plan.head.pieceId);
      const receiver = stages.get(plan.receiver.pieceId);
      return head && receiver ? (head.index >= receiver.index ? head : receiver) : undefined;
    };
    const savedReady = readyStage(saved);
    const suggestedReady = readyStage(suggested);
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
          order: savedReady ? "saved" : "suggested",
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
          ? [piece]
          : [];
      });
      const blockerIds = blockers.map(({ id }) => id);
      const savedEarlier = savedReady && blockers.find(({ id }) => {
        const stage = saved.get(id);
        return stage && stage.index < savedReady.index &&
          id !== plan.head.pieceId && id !== plan.receiver.pieceId;
      });
      const order = savedReady && (savedEarlier || blockers.every(({ id }) => saved.has(id)))
        ? "saved" : "suggested";
      const ready = order === "saved" ? savedReady : suggestedReady;
      const stages = order === "saved" ? saved : suggested;
      const stagedBlockers = blockers.map((piece) => ({ piece, stage: stages.get(piece.id) }));
      const report = (
        state: DriverAccessLocation["state"],
        detail: string,
      ): DriverAccessLocation => ({ ...base, order, state, detail, envelopes, blockerIds });
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
      const required = blockers.filter(({ id }) =>
        id === plan.head.pieceId || id === plan.receiver.pieceId,
      );
      if (required.length)
        return report(
          "blocked",
          `The tool approach meets the screw members ${blockersDescription(project, required)}. Check a different tool or entry direction.`,
        );
      const early = ready && stagedBlockers.find(({ stage }) => stage && stage.index < ready.index);
      if (early?.stage && ready)
        return report(
          "blocked",
          `“${early.stage.title}” places ${blockersDescription(project, [early.piece])} in the tool path before “${ready.title}”. Review moving that task later or try a different tool or entry direction.`,
        );
      if (!ready || stagedBlockers.some(({ stage }) => !stage))
        return report(
          "blocked",
          `The tool approach meets ${blockersDescription(project, blockers)}. Confirm the parts’ assembly steps or check a different tool or entry direction.`,
        );
      const first = stagedBlockers.reduce((a, b) =>
        a.stage!.index <= b.stage!.index ? a : b,
      ).stage!;
      const firstParts = blockersDescription(
        project,
        stagedBlockers
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
    const firstOrder = locations[0]?.order ?? (savedReady ? "saved" : "suggested");
    const order = locations.every((location) => location.order === firstOrder) ? firstOrder : "mixed";
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
        `${review.plan.label} · ${driverAccessOrderName[order]} · shaft ${formatPreciseInches(access.shaftWidth)} wide with ${formatPreciseInches(access.bitReach)} reach · tool body ${formatPreciseInches(access.bodyWidth)} wide × ${formatPreciseInches(access.bodyLength)} long · approach travel ${formatPreciseInches(access.approachTravel)}.`,
        ...(locations.length
          ? locations.map((row) => `${row.label} · ${order === "mixed" ? `${driverAccessOrderName[row.order]} · ` : ""}${row.detail}`)
          : ["Record a screw location to check its tool approach."]),
        driverAccessScope,
      ];
    },
  );
}
