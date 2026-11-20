import { Vector3 } from "three";
import { clipBox } from "./cutProfiles";
import {
  glazingBackingGaps,
  numericalTolerance,
  prepareGlazingBacking,
  type GlazingBackingSegment,
} from "./glazingBacking";
import { greenhouseVentChoices } from "./greenhouseVents";
import { formatPreciseInches as inches } from "./measurement";
import type { Piece, Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { sunliteHasPerimeterOpening } from "./sunliteTakeoff";

export const ventBackingScope =
  "Checks contact along the retained glazing perimeter using wood in the moving sash. Verify engagement width, fasteners, drainage and weather sealing for the actual vent detail.";

export const ventBackingSource =
  "https://www.palram.com/us/product/sunlite-diy/";

function sashEdges(
  panel: Piece,
  roofUp: V3,
  roofDepth: V3,
  backing: ReturnType<typeof prepareGlazingBacking>,
) {
  if (sunliteHasPerimeterOpening(panel))
    return {
      warning:
        "A through-cut changes the sash panel perimeter. Measure the retained edge and review the glazing detail.",
      edges: [],
    };

  const thickness = stockAxes(panel).thickness;
  if (Math.abs(panel.size[thickness] - 8 / 25.4) > 0.001)
    return {
      warning:
        "Check the modeled sash panel thickness and flute axis against 8 mm glazing.",
      edges: [],
    };
  const localAxis = new Vector3().setComponent(thickness, 1).toArray();
  const panelNormal = new Vector3(...rotate(localAxis, panel.rotation));
  const alignment = panelNormal.dot(new Vector3(...roofUp));
  if (Math.abs(alignment) <= numericalTolerance)
    return {
      warning:
        "Align the closed panel with the roof to identify the underside.",
      edges: [],
    };
  const sign = Math.sign(alignment);
  const outward = panelNormal.multiplyScalar(sign);
  const retained = clipBox(panel.size, panel.cutPlanes);
  const underside = retained.faces.find(
    ({ normal, indices }) =>
      normal[thickness] * sign < -1 + numericalTolerance &&
      indices.every(
        (index) =>
          Math.abs(
            retained.vertices[index][thickness] * sign +
              panel.size[thickness] / 2,
          ) <= numericalTolerance,
      ),
  );
  if (!underside)
    return {
      warning: "The panel lacks a retained flat underside at the glazing face.",
      edges: [],
    };

  const points = underside.indices.map((index) =>
    new Vector3(...rotate(retained.vertices[index], panel.rotation)).add(
      new Vector3(...panel.position),
    ),
  );
  const alongDepth = new Vector3(...roofDepth);
  const uphill = new Vector3(...roofUp).projectOnPlane(outward);
  if (uphill.lengthSq() <= numericalTolerance ** 2)
    return {
      warning: "Establish the ridge and eave sides of the closed sash panel.",
      edges: [],
    };
  uphill.normalize();
  const edges = points.map((a, index) => {
    const b = points[(index + 1) % points.length];
    const edge = b.clone().sub(a);
    const out = outward.clone().cross(edge).normalize();
    const slope = out.dot(uphill);
    const depth = out.dot(alongDepth);
    const name =
      Math.abs(slope) > Math.abs(depth)
        ? slope > 0
          ? "Ridge-side edge"
          : "Eave-side edge"
        : depth > 0
          ? "Front edge"
          : "Back edge";
    const contact: GlazingBackingSegment = [a.toArray(), b.toArray()];
    const visible: GlazingBackingSegment = [a, b].map((point) =>
      point
        .clone()
        .addScaledVector(outward, panel.size[thickness] / 2)
        .toArray(),
    ) as GlazingBackingSegment;
    return {
      id: `${panel.id}/${index}`,
      panelId: panel.id,
      name,
      length: edge.length(),
      points: visible,
      gaps: glazingBackingGaps(backing, contact, visible, outward.toArray()),
    };
  });
  return { warning: null, edges };
}

export function reviewGreenhouseVentBacking(project: Project) {
  const active = new Map(
    project.pieces
      .filter(({ offcut }) => !offcut)
      .map((part) => [part.id, part]),
  );
  return greenhouseVentChoices(project).flatMap(({ entry, label }) => {
    if (
      entry.spec.type !== "structure" ||
      entry.spec.structure.kind !== "greenhouse"
    )
      return [];
    const link = entry.sections.find(({ role }) => role === "roof-vent-sash");
    const section = project.sections.find(({ id }) => id === link?.sectionId);
    const members = (section?.pieceIds ?? []).flatMap((id) => {
      const part = active.get(id);
      return part ? [part] : [];
    });
    const panels = members.filter(({ material }) => material === "sunlite-8mm");
    if (!panels.length && !entry.spec.structure.selections.greenhouseGlazing)
      return [];
    const wood = prepareGlazingBacking(members);
    const roofUp = rotate([0, 1, 0], entry.pose.rotation);
    const roofDepth = rotate([0, 0, 1], entry.pose.rotation);
    const parts = panels.map((panel) => {
      try {
        return { id: panel.id, ...sashEdges(panel, roofUp, roofDepth, wood) };
      } catch {
        return {
          id: panel.id,
          warning: "The retained glazing geometry needs review.",
          edges: [],
        };
      }
    });
    return [
      {
        id: entry.id,
        title: label,
        parts,
        edges: parts.flatMap(({ edges }) => edges),
      },
    ];
  });
}

export type VentBackingReview = ReturnType<
  typeof reviewGreenhouseVentBacking
>[number];

export function ventBackingSummary(review: VentBackingReview) {
  if (!review.parts.length) return "The moving sash glazing is missing.";
  if (!review.edges.length) return "The sash glazing perimeter needs review.";
  const withGaps = review.edges.filter(({ gaps }) => gaps.length).length;
  const unchecked = review.parts.filter(({ warning }) => warning).length;
  const coverage = withGaps
    ? `${withGaps} of ${review.edges.length} checked sash edges have backing gaps.`
    : `Modeled backing reaches all ${review.edges.length} checked sash edges.`;
  return `${coverage}${unchecked ? ` Review ${unchecked} additional sash panel${unchecked === 1 ? "" : "s"}.` : ""}`;
}

export function ventBackingGuideLines(
  project: Project,
  review: VentBackingReview,
) {
  return [
    `${review.title} · ${ventBackingSummary(review)}`,
    ...review.parts.flatMap(({ id, warning, edges }) =>
      warning
        ? [`${partLabel(project, id)} · ${warning}`]
        : edges.map(
            ({ name, length, gaps }) =>
              `${partLabel(project, id)} · ${name} · ${inches(length)}. ${
                gaps.length
                  ? `Gaps ${gaps.map(({ length }) => inches(length)).join(", ")}. Review backing that moves with the sash.`
                  : "Modeled wood contact along the full edge."
              }`,
          ),
    ),
  ];
}
