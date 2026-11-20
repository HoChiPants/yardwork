import { Vector3 } from "three";
import type { Project } from "./model";
import { formatPreciseInches } from "./measurement";
import { rotate } from "./spatial";
import {
  glazingBackingGaps,
  numericalTolerance,
  prepareGlazingBacking,
  type GlazingBackingSegment,
} from "./glazingBacking";
import { stockAxes } from "./stockAxes";
import { sunliteTakeoff } from "./sunliteTakeoff";

export const sunliteRoofDetail =
  "https://images.thdstatic.com/catalog/pdfImages/21/21944515-ca0f-4db2-b0c5-2864c2070043.pdf";
export const roofBackingScope =
  "Checks the nominal seam centerline for modeled wood contact beneath the panels. Verify the delivered profile, fastening locations, backing width and roof details before ordering or cutting.";

export function reviewSunliteRoofBacking(project: Project) {
  const sections = new Map(project.sections.map((row) => [row.id, row]));
  const rooms = project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "greenhouse"
      )
        return [];
      const panelIds = new Set(
        entry.sections
          .filter(({ role }) => role === "glazing-roof-panels")
          .flatMap(({ sectionId }) => sections.get(sectionId)?.pieceIds ?? []),
      );
      return [{ entry, title: binding.title, panelIds }];
    }),
  );
  if (!rooms.some(({ panelIds }) => panelIds.size)) return [];
  const estimate = sunliteTakeoff(project);
  if (!estimate) return [];
  const active = project.pieces.filter((piece) => !piece.offcut);
  const panels = new Map(
    active
      .filter(({ material }) => material === "sunlite-8mm")
      .map((piece) => [piece.id, piece]),
  );
  const movingSashIds = new Set(
    rooms.flatMap(({ entry }) =>
      entry.sections
        .filter(({ role }) => role === "roof-vent-sash")
        .flatMap(({ sectionId }) => sections.get(sectionId)?.pieceIds ?? []),
    ),
  );
  const wood = prepareGlazingBacking(
    active.filter(({ id }) => !movingSashIds.has(id)),
  );

  return rooms.flatMap(({ entry, title, panelIds }) => {
    const up = new Vector3(...rotate([0, 1, 0], entry.pose.rotation));
    const seams = estimate.seams.flatMap((seam) => {
      if (!seam.pieceIds.every((id) => panelIds.has(id))) return [];
      const panel = panels.get(seam.pieceIds[0]);
      if (!panel) return [];
      const axis = stockAxes(panel).thickness;
      const local = new Vector3().setComponent(axis, 1);
      const normal = new Vector3(...rotate(local.toArray(), panel.rotation));
      if (Math.abs(normal.dot(up)) <= numericalTolerance) return [];
      if (normal.dot(up) < 0) normal.negate();
      const points = seam.full ? seam.points : seam.overlapPoints;
      const contact = points.map((point) =>
        new Vector3(...point)
          .addScaledVector(normal, -panel.size[axis] / 2)
          .toArray(),
      ) as GlazingBackingSegment;
      const gaps = glazingBackingGaps(wood, contact, points, normal.toArray());
      return [
        {
          id: seam.id,
          label: seam.label,
          length: seam.length,
          partial: seam.partial,
          gaps,
        },
      ];
    });
    return seams.length ? [{ roomId: entry.id, title, seams }] : [];
  });
}

export type SunliteRoofReview = ReturnType<
  typeof reviewSunliteRoofBacking
>[number];

export function roofBackingSummary(review: SunliteRoofReview) {
  const affected = review.seams.filter((row) => row.gaps.length).length;
  return affected
    ? `${affected} of ${review.seams.length} checked roof seams have gaps in modeled backing.`
    : `Modeled backing reaches the full length of all ${review.seams.length} checked roof seams.`;
}

export function roofBackingGuideLines(review: SunliteRoofReview) {
  return [
    `${review.title} · ${roofBackingSummary(review)}`,
    ...review.seams
      .filter(({ gaps, partial }) => gaps.length > 0 || partial)
      .map(({ label, length, gaps, partial }) => {
        const shared = partial
          ? `Shared edge checked: ${formatPreciseInches(length)}. `
          : "";
        const contact = gaps.length
          ? `Gaps along seam ${gaps.map(({ length }) => formatPreciseInches(length)).join(", ")}.`
          : "Modeled backing reaches the shared edge.";
        return `${label} · ${shared}${contact}${partial ? " Review profile termination and flashing at this transition." : ""}`;
      }),
  ];
}
