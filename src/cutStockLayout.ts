import { inspectCutStock, pieceCutKerf, KERF } from "./engine";
import { material, type MaterialId, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { stockAxes } from "./stockAxes";
import { formatPreciseInches } from "./measurement";
import { cutSourceRegion } from "./cutSourceAxes";
import { cutSourceVertices } from "./cutStock";
import { convexHull, type Point2 } from "./cutDiagram";

export type CutStockRegion = {
  id: string;
  label: string;
  name: string;
  offcut: boolean;
  offset: V3;
  size: V3;
  /** Across the original stock width, then along its original length; inches. */
  x: number;
  y: number;
  width: number;
  length: number;
  hasProfile: boolean;
};
export type CutStockGap = {
  x: number;
  y: number;
  width: number;
  length: number;
};
export type CutStockInspection = ReturnType<typeof inspectCutStock>;
export type CutStockLayoutModel = {
  sourceId: string;
  state:
    | "planar"
    | "profile-review"
    | "layer-review"
    | "table-review"
    | "invalid"
    | "missing";
  materialId: MaterialId | null;
  sourceSize: V3 | null;
  axes: { length: 0 | 1 | 2; width: 0 | 1 | 2; thickness: 0 | 1 | 2 } | null;
  width: number | null;
  length: number | null;
  thickness: number | null;
  regions: CutStockRegion[];
  gaps: CutStockGap[];
  gapsComplete: boolean;
  profiles?: {
    face: "width" | "thickness";
    across: number;
    regions: { id: string; points: Point2[] }[];
  }[];
  modeledKerf: number;
  measuredTubeKerf?: number;
  issues: string[];
};

// Bound both SVG complexity and complement work before constructing a diagram.
export const CUT_STOCK_LAYOUT_LIMITS = {
  regions: 128,
  gridCells: 16384,
  gaps: 1024,
} as const;

function planarGaps(
  regions: CutStockRegion[],
  width: number,
  length: number,
): CutStockGap[] | null {
  if (regions.length > CUT_STOCK_LAYOUT_LIMITS.regions) return null;
  const clamp = (value: number, maximum: number) =>
    Math.max(0, Math.min(maximum, value));
  const xs = [
    ...new Set([
      0,
      width,
      ...regions.flatMap((r) => [
        clamp(r.x, width),
        clamp(r.x + r.width, width),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      0,
      length,
      ...regions.flatMap((r) => [
        clamp(r.y, length),
        clamp(r.y + r.length, length),
      ]),
    ]),
  ].sort((a, b) => a - b);
  if ((xs.length - 1) * (ys.length - 1) > CUT_STOCK_LAYOUT_LIMITS.gridCells)
    return null;
  const gaps: CutStockGap[] = [];
  let previous = new Map<string, CutStockGap>();
  for (let row = 0; row + 1 < ys.length; row++) {
    const bottom = ys[row],
      top = ys[row + 1];
    const occupied = regions
      .filter((r) => r.y < top && r.y + r.length > bottom)
      .map(
        (r) =>
          [clamp(r.x, width), clamp(r.x + r.width, width)] as [number, number],
      )
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const intervals: [number, number][] = [];
    let cursor = 0;
    for (const [start, end] of occupied) {
      if (start > cursor) intervals.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (cursor < width) intervals.push([cursor, width]);
    const next = new Map<string, CutStockGap>();
    for (const [start, end] of intervals) {
      const key = JSON.stringify([start, end]),
        existing = previous.get(key);
      if (existing && existing.y + existing.length === bottom) {
        existing.length = top - existing.y;
        next.set(key, existing);
      } else {
        const gap = {
          x: start,
          y: bottom,
          width: end - start,
          length: top - bottom,
        };
        gaps.push(gap);
        next.set(key, gap);
      }
      if (gaps.length > CUT_STOCK_LAYOUT_LIMITS.gaps) return null;
    }
    previous = next;
  }
  return gaps;
}

/** Human-readable source coordinates; no packing or manufacturing sequence is inferred. */
export function cutStockLayoutMarkdown(
  project: Project,
  sourceId: string,
  inspection?: CutStockInspection,
): string {
  const layout = cutStockLayout(project, sourceId, inspection),
    inch = formatPreciseInches;
  const text = (value: string) =>
    value
      .replace(/\r?\n/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\|/g, "\\|");
  const lines = [
    `### Recorded cut source${layout.materialId ? ` · ${text(material(layout.materialId).name)}` : ""}`,
    "",
  ];
  const onHand = project.onHandCutSources?.includes(sourceId);
  if (layout.state === "invalid" || layout.state === "missing")
    return [
      ...lines,
      "**Source layout unavailable.**",
      ...layout.issues.map(text),
      ...(onHand ? ["The on-hand credit is paused until the cut source passes review."] : []),
    ].join("\n\n");
  const axes = layout.axes!,
    axis = (index: number) => ["X", "Y", "Z"][index];
  lines.push(
    `Source blank: ${inch(layout.length!)} long × ${inch(layout.width!)} wide × ${inch(layout.thickness!)} thick.`,
    ...(onHand ? ["Marked on hand."] : []),
    `Source-local length ${axis(axes.length)}, width ${axis(axes.width)}, thickness ${axis(axes.thickness)}. Starts are from the original blank's low edges, independent of assembly pose.`,
    "",
    ...layout.issues.map(text),
    "| Part | Saved state | Name | Source-local XYZ start | Rectangular blank XYZ size | Profile |",
    "| --- | --- | --- | --- | --- | --- |",
    ...layout.regions.map(
      (region) =>
        `| ${region.label} | ${region.offcut ? "Recorded offcut" : "Kept part"} | ${text(region.name)} | ${region.offset.map(inch).join(", ")} | ${region.size.map(inch).join(" × ")} | ${region.hasProfile ? "Profiled retained shape" : "Rectangular blank"} |`,
    ),
  );
  if (
    layout.state !== "profile-review" &&
    layout.regions.some((region) => region.hasProfile)
  )
    lines.push(
      "",
      "Profiled parts reserve rectangular blanks here. Removed profile corners are not added to unretained regions. Inspect the actual part's cut profile for its retained shape.",
    );
  if (layout.state === "planar") {
    lines.push(
      "",
      "Modeled gaps / unretained stock:",
      "",
      ...(layout.gaps.length
        ? [
            "| Across-width start | Along-length start | Width | Length |",
            "| --- | --- | --- | --- |",
            ...layout.gaps.map(
              (gap) =>
                `| ${inch(gap.x)} | ${inch(gap.y)} | ${inch(gap.width)} | ${inch(gap.length)} |`,
            ),
          ]
        : ["No unclaimed rectangular blank region remains."]),
      "",
      layout.measuredTubeKerf !== undefined
        ? `Recorded tube cutting loss: ${inch(layout.measuredTubeKerf)} per cut, entered by the user.`
        : layout.modeledKerf === 0
        ? "The layout uses a zero-kerf knife cut. Verify the actual trim and site fit."
        : `The model uses a ${inch(layout.modeledKerf)} saw allowance. A saved gap does not prove a saw kerf, cut order or manufacturing allowance.`,
    );
  }
  return lines.join("\n");
}

/** Read-only saved blank reservations, never a recovered saw sequence or new packing plan. */
export function cutStockLayout(
  project: Project,
  sourceId: string,
  inspection?: CutStockInspection,
): CutStockLayoutModel {
  const result: CutStockLayoutModel = {
    sourceId,
    state: "missing",
    materialId: null,
    sourceSize: null,
    axes: null,
    width: null,
    length: null,
    thickness: null,
    regions: [],
    gaps: [],
    gapsComplete: false,
    modeledKerf: KERF,
    issues: [],
  };
  const saved = project.pieces.filter(
    (piece) => piece.cutStock?.id === sourceId,
  );
  if (!saved.length)
    return {
      ...result,
      issues: ["No saved parts or offcuts refer to this cut source."],
    };
  try {
    const cached = inspection?.groups.get(sourceId);
    const checked =
      cached?.length === saved.length &&
      cached.every((piece, index) => piece === saved[index])
        ? inspection!
        : inspectCutStock(project);
    const invalid = checked.invalid.find(
      (source) => source.sourceId === sourceId,
    );
    if (!checked.valid.has(sourceId))
      return {
        ...result,
        state: "invalid",
        issues: [
          invalid?.detail ??
            "The saved cut-source regions could not be validated.",
        ],
      };
    const first = saved[0],
      size = cutSourceRegion(first).sourceSize;
    if (
      ![
        ...size,
        ...saved.flatMap((piece) => [...piece.size, ...piece.cutStock!.offset]),
      ].every(Number.isFinite) ||
      size.some((value) => value <= 0) ||
      saved.some((piece) => piece.size.some((value) => value <= 0))
    )
      return {
        ...result,
        state: "invalid",
        issues: [
          "Saved cut-source coordinates and dimensions must be finite and positive.",
        ],
      };
    const axes = first.cutStock!.sourceAxes
      ? ({ thickness: 0, width: 1, length: 2 } as const)
      : stockAxes(first, size);
    result.materialId = first.material;
    result.modeledKerf = pieceCutKerf(first);
    if (first.cutStock!.tubeKerf !== undefined)
      result.measuredTubeKerf = first.cutStock!.tubeKerf;
    result.sourceSize = [...size];
    result.axes = axes;
    result.width = size[axes.width];
    result.length = size[axes.length];
    result.thickness = size[axes.thickness];
    result.regions = saved
      .map((piece) => {
        const { offset, size } = cutSourceRegion(piece);
        return {
          id: piece.id,
          label: partLabel(project, piece.id),
          name: piece.name,
          offcut: piece.offcut,
          offset,
          size,
          x: offset[axes.width],
          y: offset[axes.length],
          width: size[axes.width],
          length: size[axes.length],
          hasProfile: piece.cutPlanes.length > 0,
        };
      })
      .sort(
        (a, b) =>
          a.y - b.y ||
          a.x - b.x ||
          a.offset[axes.thickness] - b.offset[axes.thickness] ||
          a.id.localeCompare(b.id),
      );
    const fullThickness = result.regions.every(
      (region) =>
        region.offset[axes.thickness] === 0 &&
        region.size[axes.thickness] === size[axes.thickness],
    );
    if (!fullThickness)
      return {
        ...result,
        state: "layer-review",
        issues: [
          "The recorded regions divide or offset stock thickness. A single flattened layout would hide layers; review the exact source-local coordinates below.",
        ],
      };
    if (
      result.regions.some((region, index) =>
        result.regions
          .slice(0, index)
          .some(
            (other) =>
              Math.min(region.x + region.width, other.x + other.width) >
                Math.max(region.x, other.x) + 0.000001 &&
              Math.min(region.y + region.length, other.y + other.length) >
                Math.max(region.y, other.y) + 0.000001,
          ),
      )
    ) {
      if (result.regions.length > CUT_STOCK_LAYOUT_LIMITS.regions)
        return {
          ...result,
          state: "table-review",
          issues: [
            "This source has more pieces than the profile diagram can show. Use the recorded coordinates and individual cut profiles.",
          ],
        };
      const solids = saved.map((piece) => ({
        id: piece.id,
        points: cutSourceVertices(piece),
      }));
      return {
        ...result,
        state: "profile-review",
        issues: [
          "The rectangular extents overlap. The retained solids leave the modeled saw gap in three dimensions. Use the face and edge views in Yardwork to locate the shaped edges.",
        ],
        profiles: (["width", "thickness"] as const).map((face) => ({
          face,
          across: size[axes[face]],
          regions: solids.map(({ id, points }) => ({
            id,
            points: convexHull(
              points.map((point) => [point[axes.length], point[axes[face]]]),
            ),
          })),
        })),
      };
    }
    const gaps = planarGaps(result.regions, result.width, result.length);
    if (!gaps)
      return {
        ...result,
        state: "table-review",
        issues: [
          "This saved source exceeds the bounded diagram detail. Its region coordinates remain available below; no flattened diagram or gap total is asserted.",
        ],
      };
    return { ...result, state: "planar", gaps, gapsComplete: true };
  } catch (error) {
    return {
      ...result,
      state: "invalid",
      regions: [],
      gaps: [],
      gapsComplete: false,
      issues: [
        error instanceof Error
          ? error.message
          : "The saved cut source could not be inspected.",
      ],
    };
  }
}
