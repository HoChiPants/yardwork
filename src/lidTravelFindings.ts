import {
  reviewLidTravel,
  type LidPreview,
  type LidTravelReview,
} from "./lidMotion";
import { lidSiteAngle, lidSiteMotionText } from "./lidSiteClearance";
import {
  armContactText,
  reviewLidStayFit,
  type limitLidStayPlayback,
} from "./lidStayFit";
import type { Project } from "./model";
import { partLabel } from "./partLabels";

type StayReview = ReturnType<typeof reviewLidStayFit>;
type StayStop = NonNullable<ReturnType<typeof limitLidStayPlayback>>;

export type LidTravelFinding = {
  id: string;
  detail: string;
  angle?: number;
  faceId?: string;
  stayStop?: StayStop;
};

export type LidTravelInspection = {
  review?: LidTravelReview;
  error?: string;
  finding?: LidTravelFinding;
};

export function lidTravelPose(
  next: LidPreview,
  stays: readonly StayReview[],
  faceId?: string,
  stoppedByStay?: StayStop | null,
): LidPreview {
  const stayLinks = stays.flatMap((result) =>
    result.state === "current" ? [result.preview(next.angle)] : [],
  );
  const armHits = [
    ...new Set([
      ...stayLinks.flatMap(
        (link) => link.arms?.flatMap((arm) => arm.hitIds) ?? [],
      ),
      ...(stoppedByStay?.kind === "arm-contact" ? stoppedByStay.hitIds : []),
    ]),
  ];
  const shownSiteFaceId =
    faceId ?? next.siteFaceHits?.[0] ?? next.shownSiteFaceId;
  return {
    ...next,
    ...(shownSiteFaceId && { shownSiteFaceId }),
    ...(stayLinks.length && { stayLinks }),
    ...(stoppedByStay?.kind === "arm-unresolved" && {
      stayArmReviewIds: stoppedByStay.hitIds,
      stayArmReviewFitId: stoppedByStay.id,
    }),
    ...(armHits.length && {
      stayArmHitIds: armHits,
      stayArmContactAhead:
        stoppedByStay?.kind === "arm-contact" &&
        stoppedByStay.travel === next.angle,
    }),
  };
}

export function lidStayTravelReviews(project: Project, sectionId: string) {
  return (project.lidStayFits ?? [])
    .filter((fit) => fit.sectionId === sectionId)
    .map((fit) => ({ fit, status: reviewLidStayFit(project, fit) }));
}

export function inspectLidTravel(project: Project, sectionId: string) {
  const stays = lidStayTravelReviews(project, sectionId);
  let review: LidTravelReview;
  try {
    review = reviewLidTravel(project, sectionId);
  } catch (problem) {
    const error =
      problem instanceof Error
        ? problem.message
        : "The lid travel could not be reviewed.";
    return {
      review: undefined,
      error,
      stays,
      findings: [{ id: "setup", detail: error }] as LidTravelFinding[],
    };
  }
  const findings: LidTravelFinding[] = review.collisions.map((hit) => {
    const condition =
      hit.kind === "solid"
        ? "Lid interference"
        : hit.kind === "envelope"
          ? "Possible lid interference with a part envelope"
          : "Lid clearance needs review";
    const obstacle = project.pieces.find(({ id }) => id === hit.pieceId);
    return {
      id: `contact/${hit.pieceId}`,
      detail: `${condition} · ${partLabel(project, hit.pieceId)} ${obstacle?.name ?? ""} near ${lidSiteAngle(hit.firstAngle)}.`,
      angle: hit.inspectAngle,
    };
  });
  if (review.outsideZone) {
    findings.push({
      id: "zone",
      detail: `Swing exceeds the work zone · ${review.outsideZone.faces.join(", ")}.`,
      angle: review.outsideZone.inspectAngle,
    });
  }
  for (const entry of review.siteClearances) {
    if (entry.status !== "short" && entry.status !== "needs-review") continue;
    findings.push({
      id: `site/${entry.plane.id}`,
      detail: `${entry.plane.label} · ${lidSiteMotionText(entry)}`,
      angle: entry.angle ?? 0,
      faceId: entry.plane.id,
    });
  }
  if (review.unsupportedPieceIds.length) {
    findings.push({
      id: "geometry",
      detail: `Lid clearance could not be checked for ${review.unsupportedPieceIds.map((id) => partLabel(project, id)).join(", ")}.`,
    });
  }
  for (const { fit, status } of stays) {
    const part = partLabel(project, fit.fixedPieceId);
    if (status.state !== "current") {
      findings.push({
        id: `stay/${fit.id}`,
        detail: `${part} stay · ${status.reason}`,
      });
      continue;
    }
    const limit = status.playbackLimit(0, review.travel);
    if (limit) {
      findings.push({
        id: `stay/${fit.id}`,
        detail:
          limit.kind !== "reach"
            ? armContactText(project, limit)
            : `${part} stay reaches its measured limit near ${lidSiteAngle(limit.inspectAt)}.`,
        angle: limit.inspectAt,
        stayStop: limit,
      });
    }
    if (!status.armClearance) {
      findings.push({
        id: `stay-envelope/${fit.id}`,
        detail: `${part} stay · Add the measured arm dimensions to check for overlap.`,
      });
    }
  }
  return { review, error: undefined, stays, findings };
}

export function projectLidTravelChecks(project: Project) {
  return project.sections
    .filter((section) => section.recipe?.openingLid)
    .map((section) => ({ section, ...inspectLidTravel(project, section.id) }));
}

export type ProjectLidTravelChecks = ReturnType<typeof projectLidTravelChecks>;
