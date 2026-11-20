import { bearingContactSignature } from "./bearingDecisions";
import {
  recordedRemovalSchema,
  removalLegsSchema,
  type BearingDecision,
  type RecordedRemoval,
} from "./bearingDecisionSchema";
import { motionDirections } from "./mechanismMotion";
import { formatStockLength } from "./measurement";
import type { Project } from "./model";
import { reviewRemovalPath } from "./removalMotion";
import { siteClearanceMembers } from "./siteClearance";
import { reviewWoodSupport } from "./woodSupport";

// This change detector binds a test to its inputs. It is not proof of installation.
function signature(input: string) {
  let a = 2166136261,
    b = 2654435769;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 1597334677);
  }
  return [a, b].map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
}

export function removalGeometryKey(project: Project) {
  const parts = project.pieces
    .filter((piece) => !piece.offcut)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, material, size, position, rotation, cutPlanes }) => [
      id,
      material,
      size,
      position,
      rotation,
      cutPlanes.map(({ normal, constant }) => [normal, constant]),
    ]);
  const zone = project.workZone;
  const site = (project.siteClearances ?? []).map((plane) => [
    plane.id,
    plane.side,
    plane.coordinate,
    plane.top,
    plane.minimum,
    siteClearanceMembers(project, plane)
      .pieces.map(({ id }) => id)
      .sort(),
  ]);
  return signature(
    JSON.stringify([
      parts,
      zone ? [zone.width, zone.depth, zone.height] : null,
      ...(site.length ? [site] : []),
    ]),
  );
}

function removalTestKey(
  geometry: string,
  decision: BearingDecision,
  legs: RecordedRemoval["legs"],
) {
  return `removal-1-${signature(
    JSON.stringify([
      geometry,
      decision.topId,
      decision.baseId,
      decision.contactSignature,
      legs.map(({ axis, travel }) => [axis, travel]),
    ]),
  )}`;
}

export function saveBearingRemovalPath(
  project: Project,
  topId: string,
  baseId: string,
  input: unknown,
) {
  const legs = removalLegsSchema.parse(input);
  const decision = project.bearingDecisions?.find(
    (row) => row.topId === topId && row.baseId === baseId,
  );
  if (!decision)
    throw Error("Record how the part stays removable before saving its path.");
  const wood = reviewWoodSupport(project);
  const top = wood.get(topId),
    base = wood.get(baseId);
  if (
    !top ||
    !base ||
    !top.supports.some(({ pieceId }) => pieceId === baseId) ||
    bearingContactSignature(top.piece, base.piece) !== decision.contactSignature
  )
    throw Error(
      "Review the changed bearing contact before saving its removal path.",
    );

  const review = reviewRemovalPath(project, topId, legs);
  const blocked = review.segments.some(
    ({ path }) =>
      path.zone.length ||
      path.hits.some(({ kind }) => kind === "solid") ||
      path.site.some(({ status }) => status === "short"),
  );
  const uncertain =
    review.unresolvedIds.length ||
    review.segments.some(
      ({ path }) =>
        path.hits.length ||
        path.site.some(({ status }) => status === "needs-review"),
    );
  const removalPath = recordedRemovalSchema.parse({
    legs,
    testKey: removalTestKey(removalGeometryKey(project), decision, legs),
    outcome: blocked ? "blocked" : uncertain ? "needs-review" : "clear",
  });
  return {
    ...project,
    bearingDecisions: project.bearingDecisions!.map((row) =>
      row === decision ? { ...row, removalPath } : row,
    ),
  };
}

export function clearBearingRemovalPath(
  project: Project,
  topId: string,
  baseId: string,
): Project {
  return {
    ...project,
    bearingDecisions: project.bearingDecisions?.map((row) => {
      if (row.topId !== topId || row.baseId !== baseId) return row;
      const { removalPath: _removed, ...kept } = row;
      return kept;
    }),
  };
}

export function recordedRemovalText(
  decision: BearingDecision,
  geometry: string | null,
) {
  const saved = decision.removalPath;
  if (!saved) return "";
  const movements = saved.legs
    .map(({ axis, travel }) => {
      const direction = motionDirections.find(({ axis: candidate }) =>
        candidate.every((n, i) => n === axis[i]),
      )!;
      return `${direction.label.split(" · ")[1]} ${formatStockLength(travel)}`;
    })
    .join(", then ");
  const result =
    !geometry ||
    removalTestKey(geometry, decision, saved.legs) !== saved.testKey
      ? "Retest required for the current model"
      : saved.outcome === "blocked"
        ? "Modeled obstruction in the saved test"
        : saved.outcome === "needs-review"
          ? "Clearance needs review"
          : "No modeled interference in the saved test";
  return `Removal path · ${movements} · ${result}.`;
}
