import type { IdeaEntry } from "./ideaBindingSchema";
import type { Piece, Project, V3 } from "./model";
import { formatPreciseInches } from "./measurement";
import { cedarbrookBenches, saunaPedestalRole } from "./saunaBenchReference";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

const epsilon = 0.001;
type BenchFinding = { kind: "fit" | "approach"; detail: string };

export function saunaBenchReview(project: Project, entry: IdeaEntry) {
  if (entry.spec.type !== "structure" || entry.spec.structure.kind !== "sauna")
    return null;
  const selection = entry.spec.structure.selections.saunaBench;
  if (!selection) return null;
  const options = cedarbrookBenches.find(
    (bench) =>
      bench.materialId === selection.materialId &&
      bench.productId === selection.productRegistryRef,
  );
  const mapping = entry.sections.find((row) => row.role === saunaPedestalRole);
  const section = project.sections.find((row) => row.id === mapping?.sectionId);
  const piece =
    section?.pieceIds.length === 1
      ? project.pieces.find(
          (row) => row.id === section.pieceIds[0] && !row.offcut,
        )
      : undefined;
  const findings: BenchFinding[] = [];
  if (!options || !piece || piece.material !== options.materialId) {
    findings.push({
      kind: "fit",
      detail:
        "Restore the selected pedestal kit in its sauna bench section before reviewing the room layout.",
    });
    return { piece: undefined, findings, source: options?.url };
  }

  const { clearWidth, clearDepth, clearHeight, doorWidth, doorHeight } =
    entry.spec.structure.parameters;
  const { origin, rotation } = entry.pose;
  const inverse = inverseRotation(rotation);
  const solid = prepareCollisionSolid(piece)!;
  const local = solid.vertices.map((point) =>
    rotate(point.map((value, i) => value - origin[i]) as V3, inverse),
  );
  const base = Math.min(...local.map((point) => point[1]));
  const up = rotate(rotate([0, 1, 0], piece.rotation), inverse);
  if (
    Math.abs(base) > epsilon ||
    up[1] < 1 - epsilon ||
    local.some(
      ([x, y, z]) =>
        Math.abs(x) > clearWidth / 2 + epsilon ||
        Math.abs(z) > clearDepth / 2 + epsilon ||
        y > clearHeight + epsilon,
    )
  )
    findings.push({
      kind: "fit",
      detail:
        "Place the bench level on the finished floor and keep the assembled footprint within the clear sauna.",
    });

  // Check the immediate interior approach using the modeled opening width
  // as its depth. This is a layout check, separate from an egress assessment.
  const approachDepth = Math.min(doorWidth, clearDepth);
  const approachCenter = rotate(
    [
      0,
      Math.min(doorHeight, clearHeight) / 2,
      (clearDepth - approachDepth) / 2,
    ],
    rotation,
  );
  const approach: Piece = {
    ...piece,
    material: "plywood",
    size: [doorWidth, Math.min(doorHeight, clearHeight), approachDepth],
    position: approachCenter.map((value, i) => value + origin[i]) as V3,
    rotation,
  };
  const access = prepareCollisionSolid(approach)!;
  if (solidOverlap(solid, access))
    findings.push({
      kind: "approach",
      detail: `The bench overlaps the doorway approach, which extends ${formatPreciseInches(approachDepth)} into the room. Move it away from the opening and review the full exit path.`,
    });
  return { piece, findings, source: options.url };
}

export function saunaBenchReviews(project: Project) {
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      const review = saunaBenchReview(project, entry);
      return review
        ? [{ room: binding.title, entryId: entry.id, ...review }]
        : [];
    }),
  );
}

export function saunaBenchGuideLines(project: Project) {
  return saunaBenchReviews(project).flatMap(({ room, piece, findings }) => [
    `${room} · ${piece?.name ?? "Check the selected pedestal kit"}`,
    ...(findings.length
      ? findings.map((finding) => finding.detail)
      : [
          "The assembled footprint fits inside the room and leaves the immediate doorway approach open in the model.",
        ]),
  ]);
}
