import {
  material,
  projectSchema,
  type Piece,
  type Project,
  type V3,
} from "./model";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { reviewMotionPath } from "./mechanismMotion";
import { LID_OPEN_ANGLE_DEGREES } from "./motionConstants";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import {
  closeRecordedHingePose,
  hingePoseAroundAxis,
  selectedHingeAxis,
} from "./hinges";
import type { RecordedLidMotion } from "./hingeSchema";
import { lidSiteFaces, sweepLidSiteFaces } from "./lidSiteClearance";
import { gapToSiteFace, worldClearanceShape } from "./siteClearance";
import type { SiteClearance } from "./siteClearanceSchema";
import type { LidStayLink } from "./lidStayFit";
import type { MotionCollisionFocus } from "./motionCamera";

const poseSnapshot = (piece: Piece) => ({
  position: [...piece.position] as V3,
  rotation: [...piece.rotation] as V3,
});
/** Move the saved closing receipt together with its actual open section. */
export function transformRecordedLidMotion(
  recorded: RecordedLidMotion,
  point: (value: V3) => V3,
  delta: V3,
): RecordedLidMotion {
  const rotating = delta.some((value) => value !== 0);
  const transform = (pose: RecordedLidMotion["closedPose"]) => ({
    position: point(pose.position),
    rotation: rotating ? composeRotation(delta, pose.rotation) : pose.rotation,
  });
  return {
    ...recorded,
    pivot: point(recorded.pivot),
    axis: rotating ? rotate(recorded.axis, delta) : recorded.axis,
    closedPose: transform(recorded.closedPose),
    openedPose: transform(recorded.openedPose),
  };
}

export type LidPreview = {
  focusPair?: MotionCollisionFocus;
  sectionId: string;
  angle: number;
  piece: Piece;
  pivot: V3;
  axis: V3;
  width: number;
  mechanism?: { kind: "measured-axis"; planId: string; label: string };
  /** Highlights the inspected pose, or the obstruction just ahead of a playback stop. */
  atLimit?: boolean;
  envelopeOnly?: boolean;
  travelBounds?: ReturnType<typeof reviewMotionPath>["bounds"];
  interferenceIds?: string[];
  outsideZoneFaces?: string[];
  shownSiteFaceId?: string;
  siteFaceHits?: string[];
  stayLinks?: LidStayLink[];
  stayArmHitIds?: string[];
  stayArmContactAhead?: boolean;
};
/** The measured pivot is physical endpoint A; a provisional pivot is the span center. */
export function lidAxisSegment(preview: LidPreview): [V3, V3] {
  const offsets = preview.mechanism ? [0, 1] : [-0.5, 0.5];
  return offsets.map(
    (offset) =>
      preview.pivot.map(
        (value, i) => value + offset * preview.width * preview.axis[i],
      ) as V3,
  ) as [V3, V3];
}
function context(project: Project, sectionId: string) {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe?.openingLid)
    throw Error("Choose a storage section with an opening seat lid.");
  const members = project.pieces.filter(
    (piece) => !piece.offcut && section.pieceIds.includes(piece.id),
  );
  const measured = selectedHingeAxis(project, sectionId);
  if (!measured && section.recordedLidMotion)
    throw Error(
      "The saved measured mechanism is missing. Close using its recorded axis before choosing another mechanism; it has not fallen back to the provisional pivot.",
    );
  if (measured) {
    const lid = members.find((piece) => piece.id === measured.movingPieceId);
    if (!lid || !prepareCollisionSolid(lid))
      throw Error(
        "The measured mechanism's actual moving member is missing or unsupported.",
      );
    const recorded = section.recordedLidMotion;
    if (
      recorded &&
      (recorded.planId !== measured.planId ||
        recorded.movingPieceId !== lid.id ||
        Math.hypot(...recorded.pivot.map((v, i) => v - measured.pivot[i])) >
          1e-6 ||
        Math.hypot(...recorded.axis.map((v, i) => v - measured.axis[i])) > 1e-6)
    )
      throw Error(
        "The selected axis changed while this lid was open. Close using its recorded axis, then review the mechanism.",
      );
    return {
      section,
      lid,
      pivot: measured.pivot,
      axis: measured.axis,
      width: measured.length,
      mechanism: {
        kind: "measured-axis" as const,
        planId: measured.planId,
        label: project.lidHingePlans.find((p) => p.id === measured.planId)!
          .label,
      },
    };
  }
  const tagged = members.filter((piece) => piece.designRole === "seat-lid");
  const candidates = tagged.length
    ? tagged
    : members.filter((piece) => piece.name.endsWith("seat lid"));
  if (candidates.length !== 1)
    throw Error(
      candidates.length
        ? "More than one seat lid matches this section. Resolve its lid identity before reviewing motion."
        : "This section's lid is missing. Rebuild or restore its seat lid before reviewing motion.",
    );
  const lid = candidates[0];
  if (!prepareCollisionSolid(lid))
    throw Error("This lid's material has no supported motion geometry.");
  const recipe = section.recipe;
  const thickness = Math.min(...material(recipe.panelMaterial).size);
  const localPivot: V3 = [0, recipe.height - thickness, -recipe.depth / 2];
  const pivot = rotate(localPivot, section.rotation).map(
    (value, i) => value + section.origin[i],
  ) as V3;
  return {
    section,
    lid,
    pivot,
    axis: rotate([1, 0, 0], section.rotation),
    width: recipe.width,
    mechanism: undefined,
  };
}

function pose(
  { section, lid, pivot, axis, width, mechanism }: ReturnType<typeof context>,
  angle: number,
  limit = LID_OPEN_ANGLE_DEGREES,
): LidPreview {
  if (!Number.isFinite(angle) || angle < 0 || angle > limit)
    throw Error(`Choose a lid angle from 0 to ${limit} degrees.`);
  const currentAngle = section.recipe!.lidOpen ? LID_OPEN_ANGLE_DEGREES : 0;
  if (angle === currentAngle)
    return {
      sectionId: section.id,
      angle,
      piece: lid,
      pivot,
      axis,
      width,
      ...(mechanism ? { mechanism } : {}),
    };
  if (mechanism)
    return {
      sectionId: section.id,
      angle,
      piece: hingePoseAroundAxis(lid, pivot, axis, angle - currentAngle),
      pivot,
      axis,
      width,
      mechanism,
    };
  // Conjugate the recipe's local X rotation into world space. Apply it to the
  // actual edited piece; never reconstruct dimensions, cuts or source lineage.
  const delta = composeRotation(
    composeRotation(section.rotation, [
      (-(angle - currentAngle) * Math.PI) / 180,
      0,
      0,
    ]),
    inverseRotation(section.rotation),
  );
  const offset = rotate(lid.position.map((v, i) => v - pivot[i]) as V3, delta);
  return {
    sectionId: section.id,
    angle,
    piece: {
      ...lid,
      position: offset.map((v, i) => v + pivot[i]) as V3,
      rotation: composeRotation(delta, lid.rotation),
    },
    pivot,
    axis,
    width,
  };
}

/** Persist a design pose. A recorded measured axis is sufficient to close even after its references become stale. */
export function persistLidPose(
  project: Project,
  sectionId: string,
  open: boolean,
): Project {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe?.openingLid)
    throw Error("This section has no opening seat lid.");
  if (section.recipe.lidOpen === open) return project;
  const recorded = section.recordedLidMotion;
  let moved: Piece,
    nextRecorded = recorded;
  if (!open && recorded) {
    const actual = project.pieces.find(
      (piece) =>
        piece.id === recorded.movingPieceId &&
        !piece.offcut &&
        section.pieceIds.includes(piece.id),
    );
    if (!actual)
      throw Error(
        "Restore the recorded moving member before closing this measured lid.",
      );
    // Exact equality distinguishes an untouched pose from even a small edit.
    // Restore only pose numbers; later cuts, stock and all other fields survive.
    moved = closeRecordedHingePose(actual, recorded);
    nextRecorded = undefined;
  } else {
    const ctx = context(project, sectionId);
    moved = pose(ctx, open ? LID_OPEN_ANGLE_DEGREES : 0).piece;
    nextRecorded =
      open && ctx.mechanism
        ? {
            planId: ctx.mechanism.planId,
            movingPieceId: moved.id,
            pivot: ctx.pivot,
            axis: ctx.axis,
            closedPose: poseSnapshot(ctx.lid),
            openedPose: poseSnapshot(moved),
          }
        : undefined;
  }
  return projectSchema.parse({
    ...project,
    guideFingerprint: null,
    pieces: project.pieces.map((piece) =>
      piece.id === moved.id ? moved : piece,
    ),
    sections: project.sections.map((s) => {
      if (s.id !== sectionId) return s;
      const { recordedLidMotion: _old, ...rest } = s;
      return {
        ...rest,
        recipe: { ...s.recipe!, lidOpen: open },
        ...(nextRecorded ? { recordedLidMotion: nextRecorded } : {}),
      };
    }),
  });
}

/** Closed geometry and axis for static calculations. */
export function lidWeightPose(project: Project, sectionId: string) {
  return pose(context(project, sectionId), 0);
}

/** Read-only pose. This return value must never be passed to a project save. */
export function lidPreview(
  project: Project,
  sectionId: string,
  angle: number,
): LidPreview {
  const result = pose(context(project, sectionId), angle);
  const solid = prepareCollisionSolid(result.piece)!;
  return {
    ...withSiteFaces(result, lidSiteFaces(project, sectionId)),
    interferenceIds: project.pieces
      .filter((piece) => {
        if (piece.id === result.piece.id || piece.offcut) return false;
        const other = obstacleSolid(piece);
        return other && solidOverlap(solid, other);
      })
      .map((piece) => piece.id),
    outsideZoneFaces: project.workZone
      ? outsideFaces(solid.bounds, project.workZone)
      : [],
  };
}

function obstacleSolid(piece: Piece) {
  try {
    return prepareCollisionSolid(piece);
  } catch {
    return null;
  } // A failed obstacle stays an incomplete geometry review.
}

function withSiteFaces(result: LidPreview, faces: readonly SiteClearance[]) {
  if (!faces.length) return result;
  const shape = worldClearanceShape(result.piece);
  const hits = faces.filter((face) => {
    const gap = gapToSiteFace(shape, face);
    return gap !== null && gap < face.minimum - 1e-7;
  });
  return {
    ...result,
    shownSiteFaceId: (hits[0] ?? faces[0]).id,
    siteFaceHits: hits.map((face) => face.id),
  };
}

function outsideFaces(
  bounds: { min: V3; max: V3 },
  zone: NonNullable<Project["workZone"]>,
) {
  return [
    ...(bounds.min[0] < -zone.width / 2 - 0.01 ? ["left"] : []),
    ...(bounds.max[0] > zone.width / 2 + 0.01 ? ["right"] : []),
    ...(bounds.min[1] < -0.01 ? ["floor"] : []),
    ...(bounds.max[1] > zone.height + 0.01 ? ["ceiling"] : []),
    ...(bounds.min[2] < -zone.depth / 2 - 0.01 ? ["rear"] : []),
    ...(bounds.max[2] > zone.depth / 2 + 0.01 ? ["front"] : []),
  ];
}

export function configuredLidTravel(project: Project, sectionId: string) {
  return Math.max(
    LID_OPEN_ANGLE_DEGREES,
    ...(project.lidStayFits ?? [])
      .filter((fit) => fit.sectionId === sectionId)
      .map((fit) => fit.testAngle),
  );
}

function sweepSiteClearances(
  project: Project,
  ctx: ReturnType<typeof context>,
  travel = configuredLidTravel(project, ctx.section.id),
) {
  const planes = lidSiteFaces(project, ctx.section.id);
  return planes.length
    ? sweepLidSiteFaces(pose(ctx, 0).piece, ctx.pivot, ctx.axis, travel, planes)
    : [];
}

export function reviewLidSiteClearances(project: Project, sectionId: string) {
  if (!lidSiteFaces(project, sectionId).length) return [];
  return sweepSiteClearances(project, context(project, sectionId));
}

export function siteFaceLidShortfall(project: Project, plane: SiteClearance) {
  if (plane.top !== null)
    throw Error("Choose a full-height face to fit the entire lid swing.");
  const sectionIds =
    plane.bindingId === null
      ? null
      : new Set(
          project.ideaBindings
            .find((design) => design.id === plane.bindingId)
            ?.entries.flatMap((entry) =>
              entry.sections.map((mapping) => mapping.sectionId),
            ),
        );
  const lids = project.sections.filter(
    (section) =>
      section.recipe?.openingLid &&
      (sectionIds === null || sectionIds.has(section.id)),
  );
  let shortfall = 0;
  for (const section of lids) {
    const ctx = context(project, section.id);
    const [result] = sweepLidSiteFaces(
      pose(ctx, 0).piece,
      ctx.pivot,
      ctx.axis,
      configuredLidTravel(project, section.id),
      [plane],
    );
    if (result.status === "short")
      shortfall = Math.max(shortfall, plane.minimum - result.gap!);
  }
  return { lidCount: lids.length, shortfall };
}

/** Use the same swept geometry for a fitted seat lid as for a custom door. */
export function reviewLidTravel(
  project: Project,
  sectionId: string,
  travel = configuredLidTravel(project, sectionId),
) {
  if (
    !Number.isFinite(travel) ||
    travel < LID_OPEN_ANGLE_DEGREES ||
    travel > 90
  )
    throw Error("Choose a temporary lid travel between 75° and 90°.");
  const ctx = context(project, sectionId);
  const path = reviewMotionPath(project, [pose(ctx, 0).piece], {
    kind: "hinge",
    axis: ctx.axis,
    pivot: ctx.pivot,
    travel,
  });
  const siteClearances = sweepSiteClearances(project, ctx, travel);
  const siteFaces = siteClearances.map(({ plane }) => plane);
  const shortFaces = siteClearances
    .filter(({ status }) => status === "short")
    .map(({ plane }) => plane);
  const firstZone = [...path.zone].sort((a, b) => a.inspectAt - b.inspectAt)[0];
  return {
    sectionId,
    travel,
    lidId: ctx.lid.id,
    pivot: ctx.pivot,
    axis: ctx.axis,
    width: ctx.width,
    mechanism: ctx.mechanism,
    bounds: path.bounds,
    collisions: path.hits.map((hit) => ({
      pieceId: hit.obstacleId,
      kind: hit.kind,
      firstAngle: hit.first,
      inspectAngle: hit.inspectAt,
      closingAngle: hit.closingAt,
    })),
    outsideZone: firstZone
      ? {
          inspectAngle: firstZone.inspectAt,
          faces: [...new Set(path.zone.map(({ label }) => label))],
        }
      : null,
    unsupportedPieceIds: path.unresolvedIds,
    siteClearances,
    playbackLimit(from: number, to: number) {
      const limit = path.playbackLimit(from, to);
      if (from === limit.travel || !shortFaces.length) return limit;
      const start = pose(ctx, from, travel);
      if (withSiteFaces(start, shortFaces).siteFaceHits?.length)
        return { travel: from, inspectAt: from };

      const direction = Math.sign(limit.travel - from);
      const axis = ctx.axis.map((n) => direction * n) as V3;
      const shortfall = (distance: number) =>
        sweepLidSiteFaces(start.piece, ctx.pivot, axis, distance, shortFaces)
          .filter((result) => result.status === "short")
          .sort((a, b) => a.angle! - b.angle!)[0];
      let low = 0;
      let high = Math.abs(limit.travel - from);
      let hit = shortfall(high);
      if (!hit) return limit;
      // Search prefixes of the swing so an obstruction between clear endpoints
      // is still detected. Keep a verified shortfall pose separate from the stop.
      while (high - low > 0.001) {
        const mid = (low + high) / 2;
        const earlier = shortfall(mid);
        if (earlier) {
          high = mid;
          hit = earlier;
        } else low = mid;
      }
      return {
        travel: from + direction * low,
        inspectAt: from + direction * hit.angle!,
      };
    },
    preview(angle: number, inspectAt = angle): LidPreview {
      const result = pose(ctx, angle, travel);
      const inspected =
        inspectAt === angle ? result : pose(ctx, inspectAt, travel);
      const site = withSiteFaces(inspected, siteFaces);
      const status = path.preview(angle, inspectAt);
      return {
        ...site,
        ...result,
        travelBounds: path.bounds,
        atLimit: status.atLimit,
        envelopeOnly: status.envelopeOnly,
        interferenceIds: status.interferenceIds.filter(
          (id) => id !== ctx.lid.id,
        ),
        outsideZoneFaces: status.outsideZoneFaces,
      };
    },
  };
}
export type LidTravelReview = ReturnType<typeof reviewLidTravel>;
