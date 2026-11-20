import { material, type Piece, type Project, type V3 } from "./model";
import {
  saunaCeilingBatt as batt,
  saunaCeilingBattRole,
} from "./saunaCeilingReference";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { partLabel } from "./partLabels";

import type { Point2 } from "./convexHull";
import {
  coverageArea as area,
  coverageAreaEpsilon as areaEpsilon,
  coverageEpsilon as epsilon,
  coveredArea,
  formatCoverageArea as ceilingGapArea,
  fullDepthCover,
  subtractCover,
  type CoveragePolygon as Polygon,
} from "./depthCoverage";

export { ceilingGapArea };

type Envelope = {
  clearWidth: number;
  clearDepth: number;
  clearHeight: number;
  interiorLayerAllowance: number;
};

export function saunaFramingEnvelope(p: Envelope, wallDepth: number) {
  const margin = p.interiorLayerAllowance + wallDepth;
  return {
    outsideW: p.clearWidth + 2 * margin,
    outsideD: p.clearDepth + 2 * margin,
    wallTop: p.clearHeight + p.interiorLayerAllowance,
  };
}

export type CeilingCoverageReview = {
  roomId: string;
  title: string;
  enoughFramingDepth: boolean;
  openArea: number;
  outlines: V3[][];
  labelPoint?: V3;
  overlappingPartIds: string[];
  unseatedPartIds: string[];
};

export function saunaCeilingCoverage(
  project: Project,
): CeilingCoverageReview[] {
  const active = project.pieces.filter((piece) => !piece.offcut);
  const insulation = active.filter(
    (piece) => piece.material === batt.materialId,
  );
  const sections = new Map(
    project.sections.map((section) => [section.id, section]),
  );
  return project.ideaBindings.flatMap((binding) =>
    binding.entries.flatMap((entry) => {
      if (
        entry.spec.type !== "structure" ||
        entry.spec.structure.kind !== "sauna"
      )
        return [];
      const { selections, parameters } = entry.spec.structure;
      if (
        selections.saunaCeilingInsulation?.materialId !== batt.materialId ||
        selections.saunaCeilingInsulation.productRegistryRef !== batt.productId
      )
        return [];
      const { origin, rotation } = entry.pose;
      const inverse = inverseRotation(rotation);
      const wallDepth = [
        ...material(selections.frameLumber?.materialId ?? "stud").size,
      ].sort((a, b) => a - b)[1];
      const { outsideW, outsideD, wallTop } = saunaFramingEnvelope(
        parameters,
        wallDepth,
      );
      const high = wallTop + batt.thickness;
      const room: Polygon = [
        [-outsideW / 2, -outsideD / 2],
        [outsideW / 2, -outsideD / 2],
        [outsideW / 2, outsideD / 2],
        [-outsideW / 2, outsideD / 2],
      ];
      const memberIds = (role: string) =>
        new Set(
          entry.sections
            .filter((mapping) => mapping.role === role)
            .flatMap(
              (mapping) => sections.get(mapping.sectionId)?.pieceIds ?? [],
            ),
        );
      const framingIds = memberIds("ceiling-framing");
      const ownedBattIds = memberIds(saunaCeilingBattRole);
      const covers = (piece: Piece) =>
        fullDepthCover(piece, origin, inverse, { axes: [0, 2, 1], low: wallTop, high });
      let gaps = [room],
        enoughFramingDepth = false;
      for (const piece of active) {
        if (!framingIds.has(piece.id) || !material(piece.material).wood)
          continue;
        const cover = covers(piece);
        if (
          !cover ||
          coveredArea(room, cover) <=
            areaEpsilon
        )
          continue;
        enoughFramingDepth = true;
        gaps = gaps.flatMap((region) => subtractCover(region, cover));
      }
      const overlappingPartIds: string[] = [];
      const unseatedPartIds: string[] = [];
      for (const piece of insulation) {
        const cover =
          Math.abs(piece.size[stockAxes(piece).thickness] - batt.thickness) <=
            epsilon && covers(piece);
        const footprint = cover
          ? coveredArea(room, cover)
          : 0;
        if (!cover || footprint <= areaEpsilon) {
          if (ownedBattIds.has(piece.id)) unseatedPartIds.push(piece.id);
          continue;
        }
        if (!enoughFramingDepth) continue;
        const before = gaps.reduce((sum, polygon) => sum + area(polygon), 0);
        gaps = gaps.flatMap((region) => subtractCover(region, cover));
        const after = gaps.reduce((sum, polygon) => sum + area(polygon), 0);
        if (footprint - (before - after) > areaEpsilon)
          overlappingPartIds.push(piece.id);
      }
      if (!enoughFramingDepth) gaps = [];
      const worldPoint = ([x, z]: Point2) =>
        rotate([x, high, z], rotation).map((v, i) => v + origin[i]) as V3;
      const largest = gaps.reduce<Polygon | undefined>(
        (best, polygon) =>
          !best || area(polygon) > area(best) ? polygon : best,
        undefined,
      );
      const labelPoint =
        largest &&
        worldPoint([
          largest.reduce((sum, [x]) => sum + x, 0) / largest.length,
          largest.reduce((sum, [, z]) => sum + z, 0) / largest.length,
        ]);
      return [
        {
          roomId: entry.id,
          title: binding.title,
          enoughFramingDepth,
          openArea: gaps.reduce((sum, polygon) => sum + area(polygon), 0),
          outlines: gaps.map((polygon) => polygon.map(worldPoint)),
          labelPoint,
          overlappingPartIds,
          unseatedPartIds,
        },
      ];
    }),
  );
}

export function ceilingCoverageText(review: CeilingCoverageReview) {
  if (!review.enoughFramingDepth)
    return "The ceiling needs framing that reaches the modeled 9.5 in insulation depth.";
  return review.openArea > 0
    ? `${ceilingGapArea(review.openArea)} lacks full-depth batt coverage in the modeled ceiling cavities.`
    : "The modeled ceiling cavities have full-depth batt coverage.";
}

export function saunaCeilingGuideLines(project: Project) {
  return saunaCeilingCoverage(project).flatMap((review) => [
    `${review.title} · ${ceilingCoverageText(review)}`,
    ...(review.overlappingPartIds.length
      ? [
          `Review overlapping batt placements at ${review.overlappingPartIds.map((id) => partLabel(project, id)).join(", ")}.`,
        ]
      : []),
    ...(review.unseatedPartIds.length
      ? [
          `Check the ceiling height and seating of ${review.unseatedPartIds.map((id) => partLabel(project, id)).join(", ")}.`,
        ]
      : []),
  ]);
}
