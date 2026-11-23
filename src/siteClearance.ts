import { clipBox } from "./cutProfiles";
import { movingSections } from "./sectionAttachments";
import { formatPreciseInches } from "./measurement";
import { isHardware, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { pieceThroughOpenings, throughOpeningPrisms } from "./throughOpenings";
import type { SiteClearance } from "./siteClearanceSchema";
import { rotate } from "./spatial";

export const siteClearanceTolerance = 1e-7;
const epsilon = siteClearanceTolerance;

export function clearanceAxis(side: SiteClearance["side"]): 0 | 2 {
  return side.endsWith("X") ? 0 : 2;
}

export function worldClearanceProfiles(piece: Piece) {
  const openings = pieceThroughOpenings(piece);
  const profiles = openings.length
    ? throughOpeningPrisms(piece.size, openings).cells
    : [clipBox(piece.size, piece.cutPlanes ?? [])];
  return profiles.map(({ vertices, faces }) => ({
    vertices: vertices.map((point) => {
      const rotated = rotate(point, piece.rotation);
      return rotated.map((value, axis) => value + piece.position[axis]) as V3;
    }),
    faces,
  }));
}

export function worldClearanceShape(piece: Piece) {
  const profiles = worldClearanceProfiles(piece);
  if (profiles.length === 1) return profiles[0];
  const vertices: V3[] = [];
  const faces = profiles.flatMap((profile) => {
    const offset = vertices.length;
    vertices.push(...profile.vertices);
    return profile.faces.map((face) => ({
      ...face,
      indices: face.indices.map((i) => i + offset),
    }));
  });
  return { vertices, faces };
}

export function gapToSiteFace(
  { vertices, faces }: ReturnType<typeof worldClearanceShape>,
  plane: SiteClearance,
  heightPadding = 0,
): number | null {
  const axis = clearanceAxis(plane.side);
  let coordinates = vertices.map((point) => point[axis]);
  if (plane.top !== null) {
    const bottom = -heightPadding,
      top = plane.top + heightPadding;
    coordinates = vertices
      .filter(
        (point) => point[1] >= bottom - epsilon && point[1] <= top + epsilon,
      )
      .map((point) => point[axis]);
    // Extrema within a height band can occur where its boundaries cut an edge.
    for (const face of faces) {
      for (let i = 0; i < face.indices.length; i++) {
        const a = vertices[face.indices[i]],
          b = vertices[face.indices[(i + 1) % face.indices.length]];
        for (const height of [bottom, top]) {
          if (Math.min(a[1], b[1]) < height && Math.max(a[1], b[1]) > height) {
            const t = (height - a[1]) / (b[1] - a[1]);
            coordinates.push(a[axis] + t * (b[axis] - a[axis]));
          }
        }
      }
    }
  }
  if (!coordinates.length) return null;
  return plane.side.startsWith("+")
    ? plane.coordinate - Math.max(...coordinates)
    : Math.min(...coordinates) - plane.coordinate;
}

export function siteClearanceMembers(project: Project, plane: SiteClearance) {
  const wholeProject = plane.bindingId === null;
  const binding = project.ideaBindings.find(
    (entry) => entry.id === plane.bindingId,
  );
  const sectionIds = new Set(binding?.entries.flatMap((entry) => entry.sections.map(({ sectionId }) => sectionId)));
  const ids = wholeProject ? null : movingSections(project, project.sections.filter(({ id }) => sectionIds.has(id))).pieceIds;
  const pieces = project.pieces.filter(
    (piece) =>
      (ids === null || ids.has(piece.id)) &&
      !piece.offcut &&
      !isHardware(piece.material),
  );
  return {
    bindingTitle: wholeProject ? "Entire project" : (binding?.title ?? null),
    pieces,
  };
}

export function siteClearanceFacesByPart(project: Project) {
  const facesByPart = new Map<string, SiteClearance[]>();
  for (const plane of project.siteClearances ?? []) {
    for (const { id } of siteClearanceMembers(project, plane).pieces) {
      const faces = facesByPart.get(id);
      if (faces) faces.push(plane);
      else facesByPart.set(id, [plane]);
    }
  }
  return facesByPart;
}

export function reviewSiteClearance(project: Project, plane: SiteClearance) {
  const { bindingTitle, pieces } = siteClearanceMembers(project, plane);
  let gap: number | null = null;
  let pieceId: string | null = null;
  const sign = plane.side.startsWith("+") ? 1 : -1;
  for (const piece of pieces) {
    const distance = gapToSiteFace(worldClearanceShape(piece), plane);
    if (distance === null) continue;
    if (gap === null || distance < gap) {
      gap = Math.abs(distance) <= epsilon ? 0 : distance;
      pieceId = piece.id;
    }
  }
  const shortfall = gap === null ? 0 : Math.max(0, plane.minimum - gap);
  const status = !pieces.length
    ? plane.bindingId === null
      ? "empty"
      : "missing"
    : gap === null
      ? "outside-height"
      : shortfall > epsilon
        ? "short"
        : "met";
  return {
    plane,
    bindingTitle,
    status,
    gap,
    pieceId,
    shortfall,
    offset: -sign * shortfall,
  } as const;
}
export type SiteClearanceReview = ReturnType<typeof reviewSiteClearance>;

export function siteClearanceText(
  project: Project,
  review: SiteClearanceReview,
) {
  const { plane, bindingTitle, status, gap, pieceId, shortfall } = review;
  const distance = formatPreciseInches;
  const face = `${plane.side} face at ${distance(plane.coordinate)}${plane.top === null ? ", full height" : `, floor to ${distance(plane.top)} above the floor`}`;
  const result =
    status === "missing"
      ? "Saved design or modeled members missing."
      : status === "empty"
        ? "Add parts to check this face."
        : status === "outside-height"
          ? "No design parts intersect this height band."
          : `${pieceId ? `${partLabel(project, pieceId)} · ` : ""}${distance(Math.abs(gap!))} ${gap! < 0 ? "past the face" : "from the face"}${status === "short" ? ` · short by ${distance(shortfall)}` : " · minimum met"}.`;
  return `${bindingTitle ?? "Missing design"} · ${face} · minimum ${distance(plane.minimum)}. ${result}`;
}
