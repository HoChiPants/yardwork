import { clipBox } from "./cutProfiles";
import {
  coverageArea,
  coverageAreaEpsilon,
  coverageEpsilon,
  coveredArea,
  formatCoverageArea,
  fullDepthCover,
  polygonCover,
  slabFootprint,
  subtractCover,
  type CoveragePolygon,
  type DepthSlab,
} from "./depthCoverage";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { saunaFramingEnvelope } from "./saunaCeilingCoverage";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";

const rectangle = (
  left: number,
  right: number,
  bottom: number,
  top: number,
): CoveragePolygon => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top],
];

export const saunaWallCoverageScope =
  "This check measures the open bays in the saved wall layout. Verify the actual wall assembly, including behind the header, around services and at layer transitions.";

type WallGap = {
  wall: "Front wall" | "Rear wall" | "Left wall" | "Right wall";
  openArea: number;
  outlines: V3[][];
  labelPoint: V3;
};
type WallCoverageReview = {
  roomId: string;
  title: string;
  depthMismatch?: string;
  gaps: WallGap[];
  unseatedPartIds: string[];
};

export function saunaWallCoverage(project: Project): WallCoverageReview[] {
  const active = project.pieces.filter((piece) => !piece.offcut);
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
      const { parameters, selections } = entry.spec.structure;
      const selection = selections.saunaInsulation;
      if (!selection) return [];
      const stock = material(selection.materialId);
      if (
        stock.shape !== "insulation-batt" ||
        stock.productReference !== selection.productRegistryRef
      )
        return [];

      const review: WallCoverageReview = {
        roomId: entry.id,
        title: binding.title,
        gaps: [],
        unseatedPartIds: [],
      };
      const depth = [
        ...material(selections.frameLumber?.materialId ?? "stud").size,
      ].sort((a, b) => a - b)[1];
      const thickness = Math.min(...stock.size);
      if (Math.abs(thickness - depth) > coverageEpsilon) {
        review.depthMismatch = `The ${thickness} in batt needs a matching wall cavity. The planned cavity is ${depth} in deep.`;
        return [review];
      }

      const { origin, rotation } = entry.pose;
      const inverse = inverseRotation(rotation);
      const { outsideW, outsideD, wallTop } = saunaFramingEnvelope(
        parameters,
        depth,
      );
      const sideWidth = outsideD - 2 * depth;
      const wallAxes = [0, 1, 2] as const;
      const sideAxes = [2, 1, 0] as const;
      const walls: {
        wall: WallGap["wall"];
        slab: DepthSlab;
        width: number;
        face: number;
      }[] = [
        {
          wall: "Rear wall",
          width: outsideW,
          face: -outsideD / 2,
          slab: {
            axes: wallAxes,
            low: -outsideD / 2,
            high: -outsideD / 2 + depth,
          },
        },
        {
          wall: "Left wall",
          width: sideWidth,
          face: -outsideW / 2,
          slab: {
            axes: sideAxes,
            low: -outsideW / 2,
            high: -outsideW / 2 + depth,
          },
        },
        {
          wall: "Right wall",
          width: sideWidth,
          face: outsideW / 2,
          slab: {
            axes: sideAxes,
            low: outsideW / 2 - depth,
            high: outsideW / 2,
          },
        },
        {
          wall: "Front wall",
          width: outsideW,
          face: outsideD / 2,
          slab: {
            axes: wallAxes,
            low: outsideD / 2 - depth,
            high: outsideD / 2,
          },
        },
      ];
      const idsInRoles = (roles: string[]) =>
        new Set(
          entry.sections
            .filter(({ role }) => roles.includes(role))
            .flatMap(
              ({ sectionId }) => sections.get(sectionId)?.pieceIds ?? [],
            ),
        );
      const framingIds = idsInRoles(["wall-framing", "door-opening-framing"]);
      const ownedIds = idsInRoles(["wall-insulation"]);
      const framing = active
        .filter(
          (piece) => framingIds.has(piece.id) && material(piece.material).wood,
        )
        .map((piece) => {
          const solid = clipBox(piece.size, piece.cutPlanes ?? []);
          const center = rotate(
            piece.position.map((value, axis) => value - origin[axis]) as V3,
            inverse,
          );
          const localRotation = composeRotation(inverse, piece.rotation);
          return {
            ...solid,
            vertices: solid.vertices.map(
              (point) =>
                rotate(point, localRotation).map(
                  (value, axis) => value + center[axis],
                ) as V3,
            ),
          };
        });
      const insulation = active.filter((piece) => piece.material === stock.id);
      const fullThickness = insulation.flatMap((piece) => {
        const thicknessAxis = stockAxes(piece).thickness;
        if (Math.abs(piece.size[thicknessAxis] - thickness) > coverageEpsilon)
          return [];
        const normal: V3 = [0, 0, 0];
        normal[thicknessAxis] = 1;
        return [
          {
            piece,
            normal: rotate(normal, composeRotation(inverse, piece.rotation)),
          },
        ];
      });
      const seated = new Set<string>();
      for (const { wall, slab, width, face } of walls) {
        let cavities = [rectangle(-width / 2, width / 2, 0, wallTop)];
        if (wall === "Front wall") {
          const door = rectangle(
            -parameters.doorWidth / 2,
            parameters.doorWidth / 2,
            0,
            parameters.doorHeight,
          );
          cavities = cavities.flatMap((region) =>
            subtractCover(region, polygonCover(door)),
          );
        }
        for (const member of framing) {
          const footprint = slabFootprint(member, slab);
          if (coverageArea(footprint) <= coverageAreaEpsilon) continue;
          const cover = polygonCover(footprint);
          cavities = cavities.flatMap((region) => subtractCover(region, cover));
        }
        let gaps = cavities;
        for (const { piece, normal } of fullThickness) {
          if (Math.abs(normal[slab.axes[2]]) < 1 - coverageEpsilon) continue;
          const cover = fullDepthCover(piece, origin, inverse, slab);
          if (
            !cover ||
            !cavities.some(
              (region) => coveredArea(region, cover) > coverageAreaEpsilon,
            )
          )
            continue;
          seated.add(piece.id);
          gaps = gaps.flatMap((region) => subtractCover(region, cover));
        }
        if (!gaps.length) continue;
        const [u, v, d] = slab.axes;
        const worldPoint = ([across, height]: [number, number]) => {
          const point: V3 = [0, 0, 0];
          point[u] = across;
          point[v] = height;
          point[d] = face;
          return rotate(point, rotation).map(
            (value, axis) => value + origin[axis],
          ) as V3;
        };
        const largest = gaps.reduce((best, gap) =>
          coverageArea(gap) > coverageArea(best) ? gap : best,
        );
        const center = largest.reduce(
          ([x, y], [u, v]) => [x + u / largest.length, y + v / largest.length],
          [0, 0] as [number, number],
        );
        review.gaps.push({
          wall,
          openArea: gaps.reduce((sum, gap) => sum + coverageArea(gap), 0),
          outlines: gaps.map((gap) => gap.map(worldPoint)),
          labelPoint: worldPoint(center),
        });
      }
      review.unseatedPartIds = insulation
        .filter(({ id }) => ownedIds.has(id) && !seated.has(id))
        .map(({ id }) => id);
      return [review];
    }),
  );
}

export function wallGapText(gap: WallGap) {
  return `${gap.wall} has ${formatCoverageArea(gap.openArea)} without full-depth batt coverage.`;
}

export function saunaWallCoverageText(review: WallCoverageReview) {
  return (
    review.depthMismatch ??
    (review.gaps.length
      ? review.gaps.map(wallGapText).join(" ")
      : "The modeled open wall bays have full-depth batt coverage.")
  );
}

export function saunaWallGuideLines(project: Project) {
  return saunaWallCoverage(project).map((review) =>
    [
      `${review.title} · ${saunaWallCoverageText(review)}`,
      ...(review.unseatedPartIds.length
        ? [
            `Check the depth, position and orientation of ${review.unseatedPartIds.map((id) => partLabel(project, id)).join(", ")}.`,
          ]
        : []),
    ].join(" "),
  );
}
