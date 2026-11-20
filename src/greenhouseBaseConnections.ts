import {
  retainedWoodFaces,
  reviewConnectionContact,
  type ConnectionContactReview,
} from "./connectionContacts";
import type {
  ConnectionIntent,
  ConnectionIntentState,
} from "./connectionCoverage";
import { clipBox } from "./cutProfiles";
import { greenhouseBaseRailRoles } from "./greenhouseBaseReference";
import { formatPreciseInches } from "./measurement";
import { isHardware, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

type RailRole = keyof typeof greenhouseBaseRailRoles;
const railRoles = ["back", "front", "left", "right"] as const;
const locations = [
  { label: "Front left", end: "front", side: "left", sign: 1 },
  { label: "Front right", end: "front", side: "right", sign: 1 },
  { label: "Back left", end: "back", side: "left", sign: -1 },
  { label: "Back right", end: "back", side: "right", sign: -1 },
] as const;
const pairKey = (a: string, b: string) => [a, b].sort().join("/");
const legacyRailName = " · perimeter rail";
const fitEpsilon = 1e-7;

export type GreenhouseBaseCorner = {
  label: (typeof locations)[number]["label"];
  end: "front" | "back";
  side: "left" | "right";
  sideId: string | null;
  endId: string | null;
  fit: ConnectionContactReview | null;
  alignment: {
    outsideOffset: number;
    topOffset: number;
    endOffset: number;
  } | null;
  intents: readonly ConnectionIntent[];
};

export const greenhouseBaseScope =
  "Review the four rail-end joints, their hardware and tool access. Foundation support and anchoring need their own site detail.";

function railsByRole(members: Piece[]) {
  const roles = new Map<RailRole, Piece>();
  if (
    members.some(
      ({ designRole }) =>
        designRole &&
        Object.values(greenhouseBaseRailRoles).some(
          (role) => role === designRole,
        ),
    )
  ) {
    for (const role of railRoles) {
      const matching = members.filter(
        ({ designRole }) => designRole === greenhouseBaseRailRoles[role],
      );
      if (matching.length === 1) roles.set(role, matching[0]);
    }
  } else {
    // Older generated base sections saved the rails in generator order.
    const legacy = members.filter(({ name }) => name.endsWith(legacyRailName));
    if (legacy.length === railRoles.length)
      railRoles.forEach((role, index) => roles.set(role, legacy[index]));
  }
  return roles;
}

export function greenhouseBaseEntries(project: Project) {
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  const pieces = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  return project.ideaBindings.flatMap(({ entries, title }) =>
    entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "greenhouse"
      )
        return [];
      const baseRef = entry.sections.find(
        ({ role }) => role === "base-framing",
      );
      const section = baseRef && sections.get(baseRef.sectionId);
      const members = (section?.pieceIds ?? []).flatMap((id) => {
        const member = pieces.get(id);
        return member ? [member] : [];
      });
      const rails = railsByRole(members);
      const rotation = section?.rotation ?? entry.pose.rotation;
      return [{ entryId: entry.id, title, rotation, members, rails }];
    }),
  );
}

export function greenhouseBaseConnections(
  project: Project,
  intents: readonly ConnectionIntent[],
) {
  const pairs = new Map<string, ConnectionIntent[]>();
  for (const record of intents) {
    if (record.purpose !== "assembly" || record.pieceIds.length !== 2) continue;
    const key = pairKey(record.pieceIds[0], record.pieceIds[1]);
    const previous = pairs.get(key) ?? [];
    previous.push(record);
    pairs.set(key, previous);
  }

  return greenhouseBaseEntries(project).map(
    ({ entryId, title, rotation, members, rails }) => {
      const inverse = inverseRotation(rotation);
      const footprints = new Map(
        railRoles.flatMap((role) => {
          const piece = rails.get(role);
          if (!piece) return [];
          try {
            const points = retainedWoodFaces(piece).flatMap(({ points }) =>
              points.map((p) => rotate(p, inverse)),
            );
            return [
              [
                role,
                {
                  left: Math.min(...points.map(([x]) => x)),
                  right: Math.max(...points.map(([x]) => x)),
                  top: Math.max(...points.map(([, y]) => y)),
                  back: Math.min(...points.map(([, , z]) => z)),
                  front: Math.max(...points.map(([, , z]) => z)),
                },
              ] as const,
            ];
          } catch {
            return [];
          }
        }),
      );
      return {
        entryId,
        title,
        rotation,
        memberIds: members.map(({ id }) => id),
        corners: locations.map(
          ({ label, end, side, sign }): GreenhouseBaseCorner => {
            const sideRail = rails.get(side),
              endRail = rails.get(end);
            const fit =
              sideRail && endRail
                ? reviewConnectionContact(
                    sideRail,
                    endRail,
                    12,
                    rotate([0, 0, sign], rotation),
                  )
                : null;
            const sideEdges = footprints.get(side),
              endEdges = footprints.get(end);
            return {
              label,
              end,
              side,
              sideId: sideRail?.id ?? null,
              endId: endRail?.id ?? null,
              fit,
              alignment:
                sideEdges && endEdges
                  ? {
                      outsideOffset:
                        (sideEdges[side] - endEdges[side]) *
                        (side === "left" ? -1 : 1),
                      topOffset: sideEdges.top - endEdges.top,
                      endOffset:
                        sideEdges[end] -
                        endEdges[end === "front" ? "back" : "front"],
                    }
                  : null,
              intents:
                sideRail && endRail
                  ? (pairs.get(pairKey(sideRail.id, endRail.id)) ?? [])
                  : [],
            };
          },
        ),
      };
    },
  );
}

export type GreenhouseBaseReview = ReturnType<
  typeof greenhouseBaseConnections
>[number];
const planStates: Record<ConnectionIntentState, string> = {
  started: "plan started",
  pending: "details pending",
  "geometry-reviewed": "geometry reviewed",
  "legacy-record": "quantity only",
  stale: "references changed",
  conflict: "conflict needs review",
};

export function greenhouseBaseCornerText(
  project: Project,
  corner: GreenhouseBaseCorner,
) {
  const rail = (id: string | null, side: string) =>
    id ? partLabel(project, id) : `${side} rail missing or ambiguous`;
  const pair = `${rail(corner.sideId, corner.side)} ↔ ${rail(corner.endId, corner.end)}`;
  const fit = corner.fit;
  const { outsideOffset = 0, topOffset = 0 } = corner.alignment ?? {};
  const offsets = [
    ...(Math.abs(outsideOffset) > fitEpsilon
      ? [
          `side rail ${outsideOffset > 0 ? "extends" : "is inset"} ${formatPreciseInches(Math.abs(outsideOffset))} at the outside edge`,
        ]
      : []),
    ...(Math.abs(topOffset) > fitEpsilon
      ? [
          `side rail sits ${formatPreciseInches(Math.abs(topOffset))} ${topOffset > 0 ? "higher" : "lower"}`,
        ]
      : []),
  ];
  const geometry =
    fit?.state === "face-contact"
      ? `Modeled face contact · ${Number(fit.area!.toFixed(3))} in²${offsets.length ? ` · Check alignment, ${offsets.join(", ")}` : ""}`
      : fit?.state === "near-face"
        ? `Modeled gap · ${formatPreciseInches(fit.gap!)}`
        : fit?.state === "interference"
          ? "Modeled overlap · Check the fit"
          : "Check fit at this corner";
  const hardware = corner.intents.length
    ? corner.intents
        .map(({ label, state }) => `${label} · ${planStates[state]}`)
        .join(", ")
    : "Attachment plan needed";
  return { pair, geometry, hardware };
}

export function greenhouseCornerAligned(corner: GreenhouseBaseCorner) {
  return (
    corner.fit?.state === "face-contact" &&
    !!corner.alignment &&
    Math.abs(corner.alignment.outsideOffset) <= fitEpsilon &&
    Math.abs(corner.alignment.topOffset) <= fitEpsilon
  );
}

export type GreenhouseRailFit =
  | { kind: "move"; piece: Piece; offset: V3 }
  | { kind: "unavailable"; reason: string };

export function previewGreenhouseRailFit(
  project: Project,
  entryId: string,
  sideId: string,
): GreenhouseRailFit {
  const unavailable = (reason: string) => ({
    kind: "unavailable" as const,
    reason,
  });
  const base = greenhouseBaseConnections(project, []).find(
    (row) => row.entryId === entryId,
  );
  const corners =
    base?.corners.filter((corner) => corner.sideId === sideId) ?? [];
  const rail = project.pieces.find(
    (piece) => piece.id === sideId && !piece.offcut,
  );
  if (
    !base ||
    corners.length !== 2 ||
    !rail ||
    corners.some((corner) => !corner.alignment)
  )
    return unavailable(
      "Restore both end rails to preview a side rail adjustment.",
    );
  if (corners.every(greenhouseCornerAligned))
    return unavailable("Both ends of this side rail already meet and align.");

  const [first, second] = corners;
  const { outsideOffset, topOffset, endOffset } = first.alignment!;
  if (Math.abs(endOffset - second.alignment!.endOffset) > fitEpsilon)
    return unavailable(
      "Check the side rail’s cut length and the spacing between the end rails. Both ends need different adjustments.",
    );
  if (
    Math.abs(outsideOffset - second.alignment!.outsideOffset) > fitEpsilon ||
    Math.abs(topOffset - second.alignment!.topOffset) > fitEpsilon
  )
    return unavailable(
      "Check the height and outside edges of both end rails. They need to line up before this side rail can fit.",
    );
  const offset = rotate(
    [
      first.side === "left" ? outsideOffset : -outsideOffset,
      -topOffset,
      -endOffset,
    ],
    base.rotation,
  );
  const piece: Piece = {
    ...rail,
    position: rail.position.map((value, axis) => value + offset[axis]) as V3,
  };
  const proposed = {
    ...project,
    pieces: project.pieces.map((item) => (item.id === sideId ? piece : item)),
  };
  const aligned = greenhouseBaseConnections(proposed, [])
    .find((row) => row.entryId === entryId)
    ?.corners.filter((corner) => corner.sideId === sideId);
  if (aligned?.length !== 2 || !aligned.every(greenhouseCornerAligned))
    return unavailable(
      "Check the end cuts and rotation. This rail still needs a face that meets each end rail.",
    );

  try {
    const candidate = prepareCollisionSolid(piece);
    if (!candidate)
      return unavailable("This rail’s shape is unavailable for a fit check.");
    const { min, max } = candidate.bounds;
    if (min[1] < -fitEpsilon)
      return unavailable(
        "The proposed position would put this rail below the floor.",
      );
    const zone = project.workZone;
    if (
      zone &&
      (min[0] < -zone.width / 2 - fitEpsilon ||
        max[0] > zone.width / 2 + fitEpsilon ||
        min[2] < -zone.depth / 2 - fitEpsilon ||
        max[2] > zone.depth / 2 + fitEpsilon ||
        max[1] > zone.height + fitEpsilon)
    )
      return unavailable(
        "The proposed position would put this rail outside the work zone.",
      );

    for (const other of project.pieces) {
      if (other.id === sideId || other.offcut || isHardware(other.material))
        continue;
      const obstacle = prepareCollisionSolid(other);
      if (obstacle) {
        if (solidOverlap(candidate, obstacle, fitEpsilon))
          return unavailable(
            `Check ${partLabel(project, other.id)}. It occupies part of the proposed position.`,
          );
        continue;
      }
      const vertices = clipBox(other.size, other.cutPlanes).vertices.map(
        (point) => rotate(point, other.rotation),
      );
      if (
        [0, 1, 2].every((axis) => {
          const coordinates = vertices.map(
            (point) => point[axis] + other.position[axis],
          );
          return (
            Math.max(...coordinates) > min[axis] + fitEpsilon &&
            Math.min(...coordinates) < max[axis] - fitEpsilon
          );
        })
      )
        return unavailable(
          `Check ${partLabel(project, other.id)}. Its shape needs review at the proposed position.`,
        );
    }
  } catch {
    return unavailable(
      "A modeled part’s shape could not be checked at the proposed position.",
    );
  }
  return { kind: "move", piece, offset };
}

export function greenhouseBaseSummary(
  corners: readonly GreenhouseBaseCorner[],
) {
  const fit = corners.filter(greenhouseCornerAligned).length;
  const reviewed = corners.filter(
    (corner) =>
      greenhouseCornerAligned(corner) &&
      corner.intents.some(
        ({ current, state }) => current && state === "geometry-reviewed",
      ),
  ).length;
  return {
    line: `${fit} of ${corners.length} corners meet and align · ${reviewed} with geometry-reviewed fastening locations.`,
    needsReview: fit !== corners.length || reviewed !== corners.length,
  };
}

export function greenhouseBaseGuideLines(
  project: Project,
  reviews: readonly GreenhouseBaseReview[],
) {
  return reviews.flatMap(({ title, corners }) => [
    `${title} · ${greenhouseBaseSummary(corners).line}`,
    ...corners.map((corner) => {
      const { pair, geometry, hardware } = greenhouseBaseCornerText(
        project,
        corner,
      );
      return `${corner.label} · ${pair} · ${geometry} · ${hardware}`;
    }),
  ]);
}
