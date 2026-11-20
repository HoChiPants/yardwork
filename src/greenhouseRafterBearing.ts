import {
  faceContactPatch,
  faceOverlap,
  retainedWoodFaces,
  type WoodFace,
} from "./connectionContacts";
import { formatPreciseInches } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";

const epsilon = 1e-7;
const pointDifference = (a: V3, b: V3) =>
  a.map((value, i) => value - b[i]) as V3;
const dot = (a: V3, b: V3) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);
const mean = (points: V3[]) =>
  [0, 1, 2].map(
    (axis) =>
      points.reduce((sum, point) => sum + point[axis], 0) / points.length,
  ) as V3;
const upward = (face: WoodFace) => Math.abs(face.normal[1] - 1) <= epsilon;
const downward = (face: WoodFace) => Math.abs(face.normal[1] + 1) <= epsilon;

export const rafterBearingScope =
  "Eave checks follow direct wood contact to a wall plate or through one wood block seated on a plate. Ridge checks show how the actual plumb faces meet. Review the bearing detail, ridge supports, tie-downs and loads separately.";

type Wood = { piece: Piece; faces: WoodFace[] };
type Patch = { supportIds: string[]; outline: V3[]; area: number };
type Joint = {
  state: "contact" | "edge" | "gap" | "missing" | "review";
  patches: Patch[];
  point: V3;
  gap?: number;
  fitSurfaces?: EaveFitSurface[];
};
type Range = [number, number];
export type EaveFitSurface = {
  plateId: string;
  footprint: V3[];
  underside: WoodFace;
};

/** Convex face trimmed to the actual wall plate width across the roof run. */
function inEave(face: WoodFace, [low, high]: Range): WoodFace | null {
  const clip = (points: V3[], bound: number, sign: 1 | -1) => {
    const result: V3[] = [];
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      const a = sign * (point[0] - bound),
        b = sign * (next[0] - bound);
      if (a >= 0) result.push(point);
      if ((a < 0 && b > 0) || (a > 0 && b < 0))
        result.push(
          point.map(
            (value, i) => value + ((next[i] - value) * a) / (a - b),
          ) as V3,
        );
    });
    return result;
  };
  const points = clip(clip(face.points, low, 1), high, -1);
  return points.length >= 3 ? { ...face, points } : null;
}

function eaveJoint(
  rafter: Wood,
  plates: { id: string; face: WoodFace }[],
  blocks: Wood[],
  band: Range | undefined,
  point: V3,
  captureFit: boolean,
): Joint {
  if (!band) return { state: "missing", patches: [], point };
  const underside = rafter.faces
    .filter((face) => face.normal[1] < -epsilon)
    .flatMap((face) => inEave(face, band) ?? []);
  const patches: Patch[] = [];
  const fitSurfaces: EaveFitSurface[] = [];
  let minClearance = Infinity;
  let closestPoint = point;
  for (const face of underside) {
    for (const plate of plates) {
      const direct = faceContactPatch(face, plate.face);
      if (direct)
        patches.push({
          supportIds: [plate.id],
          area: direct.area,
          outline: direct.outline,
        });
      const height = plate.face.points[0][1];
      const projection = faceOverlap(
        plate.face,
        {
          normal: face.normal,
          points: face.points.map(([x, , z]) => [x, height, z]),
        },
        0,
      );
      if (projection) {
        if (captureFit)
          fitSurfaces.push({
            plateId: plate.id,
            footprint: projection.outline,
            underside: face,
          });
        const origin = face.points[0];
        for (const sample of projection.outline) {
          const clearance =
            -dot(face.normal, pointDifference(sample, origin)) / face.normal[1];
          if (clearance < minClearance) {
            minClearance = clearance;
            closestPoint = [sample[0], height + clearance, sample[2]];
          }
        }
      }
    }
    for (const block of blocks) {
      if (block.piece.id === rafter.piece.id) continue;
      for (const top of block.faces.filter(
        (candidate) => candidate.normal[1] > epsilon,
      )) {
        const contact = faceContactPatch(face, top);
        if (!contact) continue;
        const seated = block.faces
          .filter(downward)
          .flatMap((bottom) =>
            plates
              .filter((plate) => faceContactPatch(bottom, plate.face))
              .map((plate) => plate.id),
          );
        if (seated.length)
          patches.push({
            supportIds: [block.piece.id, ...seated],
            outline: contact.outline,
            area: contact.area,
          });
      }
    }
  }
  if (patches.length)
    return { state: "contact", patches, point: mean(patches[0].outline) };
  if (!Number.isFinite(minClearance))
    return { state: "missing", patches, point };
  if (minClearance < -epsilon)
    return { state: "review", patches, point: closestPoint };
  return Math.abs(minClearance) <= epsilon
    ? {
        state: "edge",
        patches,
        point: closestPoint,
        ...(captureFit ? { fitSurfaces } : {}),
      }
    : {
        state: "gap",
        patches,
        point: closestPoint,
        gap: minClearance,
        ...(captureFit ? { fitSurfaces } : {}),
      };
}

function ridgeJoint(
  rafter: Wood,
  ridges: Wood[],
  side: 1 | -1,
  point: V3,
): Joint {
  const ends = rafter.faces.filter(
    ({ normal }) =>
      Math.abs(normal[1]) < epsilon && normal[0] * side < -epsilon,
  );
  const patches: Patch[] = [];
  let nearest = Infinity;
  for (const end of ends)
    for (const ridge of ridges)
      for (const target of ridge.faces) {
        const contact = faceContactPatch(end, target);
        if (contact) {
          patches.push({
            supportIds: [ridge.piece.id],
            outline: contact.outline,
            area: contact.area,
          });
          continue;
        }
        if (
          Math.hypot(
            ...end.normal.map((value, i) => value + target.normal[i]),
          ) > epsilon
        )
          continue;
        const gap = dot(
          pointDifference(target.points[0], end.points[0]),
          end.normal,
        );
        if (gap > epsilon && gap < nearest && faceOverlap(end, target, gap))
          nearest = gap;
      }
  if (patches.length)
    return { state: "contact", patches, point: mean(patches[0].outline) };
  const endPoint = ends[0] ? mean(ends[0].points) : point;
  return Number.isFinite(nearest)
    ? { state: "gap", patches, point: endPoint, gap: nearest }
    : { state: ridges.length ? "review" : "missing", patches, point: endPoint };
}

const rafterRole = "greenhouse-rafter";
const ridgeRole = "greenhouse-ridge";
const eaveRole = "greenhouse-eave-plate";
const endWallRole = "greenhouse-end-plate";

export function reviewGreenhouseRafterBearing(
  project: Project,
  captureFitFor?: string,
) {
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  const active = project.pieces.filter(
    (piece) => !piece.offcut && material(piece.material).wood,
  );
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "greenhouse"
      )
        return [];
      const ids = (...roles: string[]) =>
        new Set(
          entry.sections
            .filter(({ role }) => roles.includes(role))
            .flatMap(
              ({ sectionId }) => sections.get(sectionId)?.pieceIds ?? [],
            ),
        );
      const roofIds = ids("roof-framing");
      const wallIds = ids("wall-framing", "door-opening-framing");
      if (!roofIds.size) return [];
      const inverse = inverseRotation(entry.pose.rotation);
      const toLocal = (point: V3) =>
        rotate(pointDifference(point, entry.pose.origin), inverse);
      const toWorld = (point: V3) =>
        rotate(point, entry.pose.rotation).map(
          (value, axis) => value + entry.pose.origin[axis],
        ) as V3;
      const wood: Wood[] = active.flatMap((piece) => {
        try {
          return [
            {
              piece,
              faces: retainedWoodFaces(piece).map((face) => ({
                normal: rotate(face.normal, inverse),
                points: face.points.map(toLocal),
              })),
            },
          ];
        } catch {
          return [];
        }
      });
      const roof = wood.filter(({ piece }) => roofIds.has(piece.id));
      const rafters = roof.filter(
        ({ piece }) =>
          piece.designRole === rafterRole ||
          (!piece.designRole && piece.name.endsWith(" · plumb-cut rafter")),
      );
      const ridges = roof.filter(
        ({ piece }) =>
          piece.designRole === ridgeRole ||
          (!piece.designRole && piece.name.endsWith(" · ridge")),
      );
      const wallTops = wood
        .filter(
          ({ piece }) =>
            wallIds.has(piece.id) &&
            ([eaveRole, endWallRole].includes(piece.designRole ?? "") ||
              (!piece.designRole && piece.name.endsWith(" · top plate"))),
        )
        .flatMap(({ piece, faces }) =>
          faces.filter(upward).map((face) => ({ piece, face })),
        );
      const sideBands = new Map<1 | -1, Range>();
      for (const { piece, face } of wallTops) {
        const points = face.points.map(([x]) => x);
        const center = mean(face.points);
        if (
          piece.designRole !== eaveRole &&
          (piece.designRole || Math.abs(center[0]) <= Math.abs(center[2]))
        )
          continue;
        sideBands.set(center[0] < 0 ? -1 : 1, [
          Math.min(...points),
          Math.max(...points),
        ]);
      }
      const platesBySide = new Map(
        [...sideBands].map(([side, band]) => [
          side,
          wallTops.flatMap(({ piece, face }) => {
            const clipped = inEave(face, band);
            return clipped ? [{ id: piece.id, face: clipped }] : [];
          }),
        ]),
      );
      const framingIds = new Set(
        [...rafters, ...ridges].map(({ piece }) => piece.id),
      );
      const blocks = wood.filter(({ piece }) => !framingIds.has(piece.id));
      const fittedBlockIds = roof
        .filter(
          ({ piece }) =>
            piece.designRole === "greenhouse-eave-block" ||
            (!piece.designRole && piece.name === "Beveled eave block"),
        )
        .map(({ piece }) => piece.id);
      const worldJoint = (joint: Joint): Joint => ({
        ...joint,
        point: toWorld(joint.point),
        patches: joint.patches.map((patch) => ({
          ...patch,
          outline: patch.outline.map(toWorld),
        })),
      });
      const rows = rafters.map((rafter) => {
        const points = rafter.faces.flatMap((face) => face.points);
        const low = Math.min(...points.map((point) => point[1]));
        const eave = mean(points.filter((point) => point[1] <= low + epsilon));
        const high = Math.max(...points.map((point) => point[1]));
        const ridge = mean(
          points.filter((point) => point[1] >= high - epsilon),
        );
        const side = eave[0] < 0 ? -1 : 1;
        return {
          id: rafter.piece.id,
          eave: worldJoint(
            eaveJoint(
              rafter,
              platesBySide.get(side) ?? [],
              blocks,
              sideBands.get(side),
              eave,
              rafter.piece.id === captureFitFor,
            ),
          ),
          ridge: worldJoint(ridgeJoint(rafter, ridges, side, ridge)),
        };
      });
      return rows.length
        ? [
            {
              entryId: entry.id,
              title: binding.title,
              rows,
              fittedBlockIds,
              plateIds: [...new Set(wallTops.map(({ piece }) => piece.id))],
              ridgeIds: ridges.map(({ piece }) => piece.id),
            },
          ]
        : [];
    }),
  );
}

export type RafterBearingReview = ReturnType<
  typeof reviewGreenhouseRafterBearing
>[number];

export function rafterJointSummary(
  review: RafterBearingReview,
  key: "eave" | "ridge",
) {
  const joints = review.rows.map((row) => row[key]);
  const count = joints.filter(({ state }) => state === "contact").length;
  const gaps = joints.flatMap(({ gap }) => (gap === undefined ? [] : [gap]));
  const edges = joints.filter(({ state }) => state === "edge").length;
  const rest = joints.length - count - gaps.length - edges;
  return [
    `${count} of ${joints.length} ${key === "eave" ? "eave ends" : "ridge ends"} show wood face contact.`,
    ...(edges ? [`${edges} have edge or point contact only.`] : []),
    ...(gaps.length
      ? [
          `${gaps.length} have a gap in the model. Smallest gap ${gapText(Math.min(...gaps))}.`,
        ]
      : []),
    ...(rest
      ? [
          `${rest} still need a ${key === "eave" ? "plate or bearing" : "ridge alignment"} review.`,
        ]
      : []),
  ].join(" ");
}

const gapText = (gap: number) =>
  gap < 0.001 ? "under 0.001 in" : formatPreciseInches(Number(gap.toFixed(3)));

export function rafterBearingGuideLines(
  project: Project,
  reviews = reviewGreenhouseRafterBearing(project),
) {
  const describe = (joint: Joint) => {
    if (joint.patches.length) {
      const ids = new Set(
        joint.patches.flatMap(({ supportIds }) => supportIds),
      );
      return `wood contact at ${[...ids].map((id) => partLabel(project, id)).join(", ")}`;
    }
    if (joint.gap !== undefined) return `${gapText(joint.gap)} gap`;
    return {
      contact: "wood contact",
      edge: "edge or point only",
      gap: "gap",
      missing: "support reference missing",
      review: "review the retained joint",
    }[joint.state];
  };
  return reviews.flatMap((review) => [
    `${review.title} · ${rafterJointSummary(review, "eave")} ${rafterJointSummary(review, "ridge")}`,
    ...review.rows.map(
      ({ id, eave, ridge }) =>
        `${partLabel(project, id)} · Eave ${describe(eave)} · Ridge ${describe(ridge)}`,
    ),
  ]);
}
