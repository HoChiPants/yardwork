import { formatPreciseInches } from "./measurement";
import { motionDistance, motionReviewDistance, motionReviewTravel, type MotionPlaybackLimit, type MotionReview } from "./mechanismMotion";
import type { MotionOpeningOrder } from "./motionPlanSchema";

export const motionOpeningOrders: readonly (MotionOpeningOrder | undefined)[] = ["selected-first", "companion-first", undefined];

export function motionOrderLabel(selected: string, companion: string, order?: MotionOpeningOrder) {
  return order === "selected-first" ? `${selected} first` : order === "companion-first" ? `${companion} first` : "Move together";
}

export function motionStopText(review: MotionReview, stop: MotionPlaybackLimit, describe: (id: string) => string) {
  let position = motionReviewDistance(review, stop.travel, stop.phase);
  if (review.linked && review.linkedTravel !== undefined) {
    const linkedAt = review.linkedTravel * stop.travel / motionReviewTravel(review);
    position = `${review.plan.label} · ${position}, ${review.linked.label} · ${motionDistance(linkedAt, review.linked.mechanism.kind)}`;
  }
  const { contact, clearanceStop } = stop;
  const pose = review.preview(stop.travel, stop.inspectAt, stop.siteFaceId, stop.phase);
  let reason: string;
  if (clearanceStop) {
    const { minimum, movingId, otherId } = clearanceStop.requirement;
    const pair = `${describe(movingId)} / ${describe(otherId)}`;
    reason = clearanceStop.reason
      ? `${pair} · ${clearanceStop.reason}`
      : `${pair} reached the ${formatPreciseInches(minimum)} minimum gap`;
  } else if (contact) {
    const event = contact.kind === "solid" ? "Contact" : "Possible contact";
    reason = `${event} · ${describe(contact.movingId)} / ${describe(contact.obstacleId)}`;
  } else {
    const site = review.site.find(({ plane }) => plane.id === stop.siteFaceId);
    const obstacles = pose.obstacleNames.join(", ");
    const zone = pose.outsideZoneFaces.join(", ");
    reason = site ? `Measured clearance · ${site.plane.label}`
      : obstacles ? `${pose.envelopeOnly ? "Possible contact" : "Contact"} · ${obstacles}`
        : zone ? `Work-zone limit · ${zone}`
          : "Clearance needs review";
  }
  return `${position} · ${reason}`;
}
