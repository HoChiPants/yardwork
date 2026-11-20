import {
  reviewMotionPath,
  type MotionPlaybackLimit,
  type MotionPreview,
} from "./mechanismMotion";
import type { Project, V3 } from "./model";
import { motionPlanInputSchema } from "./motionPlanSchema";
import { partLabel } from "./partLabels";

export type RemovalLeg = { axis: V3; travel: number };

export function reviewRemovalPath(
  project: Project,
  pieceId: string,
  legs: readonly RemovalLeg[],
) {
  const original = project.pieces.find(
    (piece) => piece.id === pieceId && !piece.offcut,
  );
  if (!original) throw Error("Choose an active part to test its removal.");
  if (legs.length < 1 || legs.length > 2)
    throw Error("Enter one or two straight movements.");
  const label = `Removal · ${partLabel(project, pieceId)}`;
  let piece = original;
  let total = 0;
  const segments = legs.map((leg) => {
    const { mechanism } = motionPlanInputSchema.parse({
      label,
      memberIds: [pieceId],
      mechanism: { kind: "slide", ...leg },
    });
    const path = reviewMotionPath(project, [piece], mechanism, {
      measuredSite: true,
    });
    const start = total;
    total += mechanism.travel;
    piece = path.preview(mechanism.travel).pieces[0];
    return { start, end: total, path };
  });
  const axes = [0, 1, 2] as const;
  const bounds = {
    min: axes.map((axis) =>
      Math.min(...segments.map(({ path }) => path.bounds.min[axis])),
    ) as V3,
    max: axes.map((axis) =>
      Math.max(...segments.map(({ path }) => path.bounds.max[axis])),
    ) as V3,
  };
  const clamp = (value: number) =>
    Math.max(0, Math.min(total, Number.isFinite(value) ? value : 0));
  const pose = (progress: number) => {
    const travel = clamp(progress);
    const segment =
      segments.find(({ end }) => travel < end) ?? segments[segments.length - 1];
    return segment.path.preview(travel - segment.start);
  };
  return {
    total,
    segments,
    unresolvedIds: segments[0].path.unresolvedIds,
    playbackLimit(
      requestedFrom: number,
      requestedTo: number,
    ): MotionPlaybackLimit {
      const from = clamp(requestedFrom),
        to = clamp(requestedTo);
      if (from === to) return { travel: to };
      const forward = from < to;
      const order = forward ? segments : [...segments].reverse();
      for (const { start, end, path } of order) {
        const low = Math.max(start, Math.min(from, to));
        const high = Math.min(end, Math.max(from, to));
        if (high <= low) continue;
        const [a, b] = forward ? [low, high] : [high, low];
        const limit = path.playbackLimit(a - start, b - start);
        if (limit.inspectAt !== undefined)
          return {
            ...limit,
            travel: limit.travel + start,
            inspectAt: limit.inspectAt + start,
          };
      }
      return { travel: to };
    },
    preview(
      requested: number,
      inspectAt?: number,
      siteFaceId?: string,
    ): MotionPreview {
      const travel = clamp(requested);
      const displayed = pose(travel);
      const checked = inspectAt === undefined ? displayed : pose(inspectAt);
      return {
        ...displayed,
        travel,
        bounds,
        label,
        interferenceIds: checked.interferenceIds,
        outsideZoneFaces: checked.outsideZoneFaces,
        siteFaceHits: checked.siteFaceHits,
        siteFaceNames: checked.siteFaceNames,
        shownSiteFaceId: siteFaceId ?? checked.shownSiteFaceId,
        obstacleNames: checked.obstacleNames,
        envelopeOnly: checked.envelopeOnly,
        atLimit: inspectAt !== undefined && clamp(inspectAt) !== travel,
      };
    },
  };
}

export type RemovalReview = ReturnType<typeof reviewRemovalPath>;
