import { material, type Piece, type V3 } from "./model";
import { clipBox } from "./cutProfiles";

/** Resolve only render-buffer rounding onto the actual clicked retained face. */
export function pickFastenerSurface(piece: Piece, point: V3, inward: V3) {
  if (piece.offcut || !material(piece.material).wood)
    throw Error("Choose a retained face of the selected wood member.");
  if (![...point, ...inward].every(Number.isFinite) || Math.hypot(...inward) < 1e-9)
    throw Error("The clicked surface has no usable entrance and normal.");
  const norm = Math.hypot(...inward),
    normal = inward.map((v) => -v / norm) as V3,
    dot = (a: V3, b: V3) => a.reduce((sum, value, i) => sum + value * b[i], 0),
    solid = clipBox(piece.size, piece.cutPlanes),
    face = solid.faces.find((candidate) =>
      dot(candidate.normal, normal) > 1 - 1e-5 &&
      Math.abs(dot(candidate.normal, point) - dot(candidate.normal, solid.vertices[candidate.indices[0]])) <= 0.001,
    );
  if (!face) throw Error("Click the actual retained face; former cut-away surfaces cannot supply an entrance.");
  const delta = dot(face.normal, point) - dot(face.normal, solid.vertices[face.indices[0]]),
    entranceLocal = point.map((value, i) => value - delta * face.normal[i]) as V3;
  if (solid.faces.some((candidate) =>
    dot(candidate.normal, entranceLocal) > dot(candidate.normal, solid.vertices[candidate.indices[0]]) + 1e-6,
  )) throw Error("Click inside the retained face, away from an edge or removed region.");
  return { entranceLocal, driveLocal: face.normal.map((v) => v === 0 ? 0 : -v) as V3 };
}
