import { concreteAnchor } from "./concreteAnchorReference";
import {
  anchorLayoutText,
  anchorMarkText,
  reviewGreenhouseAnchors,
} from "./greenhouseAnchors";
import { retainedWoodFaces } from "./connectionContacts";
import { greenhouseBaseEntries } from "./greenhouseBaseConnections";
import type { GreenhouseFoundation } from "./greenhouseFoundationSchema";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { material, type Piece, type Project } from "./model";
import { partLabel } from "./partLabels";

const epsilon = 1e-6;
const railNames = {
  front: "Front rail",
  back: "Back rail",
  left: "Left rail",
  right: "Right rail",
} as const;
type Rail = keyof typeof railNames;
type Base = ReturnType<typeof greenhouseBaseEntries>[number];

export const greenhouseFoundationScope =
  "Compare the base rails with a measured, level rectangular foundation. Verify bearing capacity, anchorage and site loads separately.";

const length = formatPreciseInches;
const difference = (value: number) => (Math.abs(value) <= epsilon ? 0 : value);

export function greenhouseFoundationEdges({
  width,
  depth,
  centerX,
  centerZ,
}: GreenhouseFoundation) {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    back: centerZ - depth / 2,
    front: centerZ + depth / 2,
  };
}

function railGeometry(piece: Piece | undefined) {
  if (!piece || !material(piece.material).wood) return null;
  try {
    const faces = retainedWoodFaces(piece);
    const points = faces.flatMap(({ points }) => points);
    if (!points.length) return null;
    const bottom = Math.min(...points.map(([, y]) => y));
    return {
      bottom,
      level: faces.some(
        ({ normal, points }) =>
          normal[1] < 0 &&
          points.length >= 3 &&
          points.every(([, y]) => Math.abs(y - bottom) <= epsilon),
      ),
      left: Math.min(...points.map(([x]) => x)),
      right: Math.max(...points.map(([x]) => x)),
      back: Math.min(...points.map(([, , z]) => z)),
      front: Math.max(...points.map(([, , z]) => z)),
    };
  } catch {
    return null;
  }
}

export function foundationFromBase(base: Base): GreenhouseFoundation | null {
  const rails = [...base.rails.values()].flatMap((piece) => {
    const geometry = railGeometry(piece);
    return geometry ? [geometry] : [];
  });
  if (!rails.length) return null;
  const left = Math.min(...rails.map((rail) => rail.left));
  const right = Math.max(...rails.map((rail) => rail.right));
  const back = Math.min(...rails.map((rail) => rail.back));
  const front = Math.max(...rails.map((rail) => rail.front));
  return {
    entryId: base.entryId,
    width: right - left,
    depth: front - back,
    centerX: (left + right) / 2,
    centerZ: (back + front) / 2,
    topY: Math.min(...rails.map((rail) => rail.bottom)),
  };
}

function reviewRail(
  role: Rail,
  piece: Piece | undefined,
  edges: ReturnType<typeof greenhouseFoundationEdges>,
) {
  const geometry = railGeometry(piece);
  const label = railNames[role];
  const pieceId = piece?.id;
  if (!geometry) return { label, pieceId, geometry, fits: false } as const;
  const margins = {
    left: difference(geometry.left - edges.left),
    right: difference(edges.right - geometry.right),
    back: difference(geometry.back - edges.back),
    front: difference(edges.front - geometry.front),
  };
  return { label, pieceId, geometry, margins } as const;
}

export function reviewGreenhouseFoundation(
  site: GreenhouseFoundation,
  base: Base | undefined,
) {
  const edges = greenhouseFoundationEdges(site);
  const rails = (Object.keys(railNames) as Rail[]).map((role) => {
    const rail = reviewRail(role, base?.rails.get(role), edges);
    if (!rail.geometry) return rail;
    const elevation = difference(rail.geometry.bottom - site.topY);
    const overhang = Object.entries(rail.margins).filter(
      ([, margin]) => margin < 0,
    );
    const fits =
      rail.geometry.level && elevation === 0 && overhang.length === 0;
    return { ...rail, elevation, overhang, fits };
  });
  return {
    site,
    edges,
    anchors: reviewGreenhouseAnchors(site, base),
    rails,
    title: base?.title ?? "Missing greenhouse design",
    fitCount: rails.filter(({ fits }) => fits).length,
  };
}
type Review = ReturnType<typeof reviewGreenhouseFoundation>;

export function greenhouseFoundationReviews(project: Project) {
  if (!project.greenhouseFoundations?.length) return [];
  const bases = new Map(
    greenhouseBaseEntries(project).map((base) => [base.entryId, base]),
  );
  return project.greenhouseFoundations.map((site) =>
    reviewGreenhouseFoundation(site, bases.get(site.entryId)),
  );
}

export function greenhouseAnchorPurchase(project: Project) {
  const required = greenhouseFoundationReviews(project).reduce(
    (sum, { anchors }) => {
      const rows = anchors?.rows ?? [];
      return rows.every(({ issues }) => !issues.length)
        ? sum + rows.length
        : sum;
    },
    0,
  );
  const selected = project.supplies
    .filter(({ productId }) => productId === concreteAnchor.productId)
    .reduce((sum, { quantity }) => sum + quantity, 0);
  return { required, selected, missing: Math.max(0, required - selected) };
}

export function greenhouseFoundationSummary({ site, fitCount }: Review) {
  return `${formatStockLength(site.width)} wide × ${formatStockLength(site.depth)} deep · center X ${length(site.centerX)}, Z ${length(site.centerZ)} · top Y ${length(site.topY)}. ${fitCount} of 4 rails fit the footprint and sit at its top elevation.`;
}

export function greenhouseFoundationRailText(
  project: Project,
  rail: Review["rails"][number],
) {
  const label = `${rail.label}${rail.pieceId ? ` · ${partLabel(project, rail.pieceId)}` : ""}`;
  if (!rail.geometry) return `${label} · Retained rail geometry unavailable.`;
  const edge = rail.overhang.length
    ? rail.overhang
        .map(([side, margin]) => `${side} overhang ${length(-margin)}`)
        .join(", ")
    : `within all edges (left ${length(rail.margins.left)}, right ${length(rail.margins.right)}, back ${length(rail.margins.back)}, front ${length(rail.margins.front)})`;
  const height =
    rail.elevation === 0
      ? "at top elevation"
      : `${length(Math.abs(rail.elevation))} ${rail.elevation > 0 ? "above" : "below"} top`;
  return `${label} · ${edge} · ${height}${rail.geometry.level ? "" : " · no level underside at the lowest point"}.`;
}

export function greenhouseFoundationGuide(project: Project) {
  return greenhouseFoundationReviews(project).map((review) => ({
    entryId: review.site.entryId,
    title: review.title,
    summary: greenhouseFoundationSummary(review),
    rails: review.rails.map((rail) =>
      greenhouseFoundationRailText(project, rail),
    ),
    anchors: review.anchors
      ? {
          detail: anchorLayoutText(review.anchors.layout, review.anchors.bore),
          marks: review.anchors.rows.map((row) => anchorMarkText(project, row)),
        }
      : null,
  }));
}
