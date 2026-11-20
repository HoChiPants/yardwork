import { Vector3 } from "three";
import { bindingHash } from "./ideaBindingState";
import {
  sunliteProfileStockLimit,
  type SunliteProfileId,
} from "./sunliteProfileSchema";
import { clipBox } from "./cutProfiles";
import type { Piece, Project, V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import {
  referenceOffersForProduct,
  findRetailerProduct,
} from "./retailerCatalog";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import {
  openingAxes,
  openingHalfSpans,
  pieceThroughOpenings,
} from "./throughOpenings";
import { addSupply } from "./supplies";
import { formatPreciseInches } from "./measurement";
import { sunliteTapeProductId, sunliteTapeRollLength } from "./sunliteTapeSchema";
import { packRuns } from "./stockRunPacking";

const tolerance = 0.001;
const directionTolerance = 1e-7;
const profileStockLength = sunliteProfileStockLimit;
type Run = { label: string; length: number };
export type SunliteEdgeRun = Run & { id: string; fingerprint: string; points: [V3, V3] };
type ProfileRun = SunliteEdgeRun;
export type SunliteProfileRun = ProfileRun & { productId: SunliteProfileId };
type Side = {
  id: string;
  fingerprint: string;
  label: string;
  pieceId: string;
  a: Vector3;
  b: Vector3;
  along: Vector3;
  outward: Vector3;
};
type PanelEdges = {
  label: string;
  upper: ProfileRun[];
  lower: ProfileRun[];
  sides: Side[];
  issue?: string;
};
type Seam = ProfileRun & {
  sides: [Side, Side];
  pieceIds: [string, string];
  full: boolean;
  partial: boolean;
  overlapPoints: [V3, V3];
  issue: string | null;
};
const axis = (i: number) => new Vector3().setComponent(i, 1);
const inches = (value: number) =>
  formatPreciseInches(Math.round(value * 1000) / 1000);

export function sunliteHasPerimeterOpening(piece: Piece) {
  const { thickness } = stockAxes(piece);
  return pieceThroughOpenings(piece).some((opening) => {
    if (opening.axis !== thickness) return true;
    const half = openingHalfSpans(opening);
    return openingAxes(thickness).some(
      (axis, i) =>
        Math.abs(opening.center[i]) + half[i] >=
        piece.size[axis] / 2 - directionTolerance,
    );
  });
}

function panelEdges(piece: Piece, label: string): PanelEdges {
  const result: PanelEdges = { label, upper: [], lower: [], sides: [] };
  if (piece.stockLengthAxis == null)
    return {
      ...result,
      issue: "Set the stock length axis to the actual flute direction.",
    };
  const { length, width, thickness } = stockAxes(piece);
  if (sunliteHasPerimeterOpening(piece))
    return {
      ...result,
      issue:
        "A through-cut changes the panel perimeter. Measure the retained edge and confirm how to finish the cut.",
    };
  if (Math.abs(piece.size[thickness] - 8 / 25.4) > tolerance)
    return {
      ...result,
      issue:
        "Review the modeled thickness and flute direction against 8 mm stock.",
    };
  const worldDirection = (v: Vector3) =>
    new Vector3(...rotate(v.toArray() as V3, piece.rotation));
  const flute = worldDirection(axis(length));
  if (Math.abs(flute.y) < directionTolerance)
    return {
      ...result,
      issue:
        "The flutes are level. Establish the upper and lower drainage ends.",
    };
  const world = (v: Vector3) =>
    worldDirection(v).add(new Vector3(...piece.position));
  const solid = clipBox(piece.size, piece.cutPlanes);
  for (const [index, face] of solid.faces.entries()) {
    const ring = face.indices.map((i) => new Vector3(...solid.vertices[i]));
    const points = ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const depthA = a.getComponent(thickness),
        depthB = b.getComponent(thickness);
      if (Math.abs(depthA) < directionTolerance) return [a];
      if (depthA * depthB < 0)
        return [a.clone().lerp(b, depthA / (depthA - depthB))];
      return [];
    });
    if (points.length < 2) continue;
    const a = points[0];
    const b = points.reduce((far, point) =>
      point.distanceToSquared(a) > far.distanceToSquared(a) ? point : far,
    );
    const span = a.distanceTo(b);
    if (span <= tolerance) continue;
    const id = `${piece.id}/${index}`;
    const aWorld = world(a),
      bWorld = world(b);
    const edgePoints: [V3, V3] = [aWorld.toArray(), bWorld.toArray()];
    const fingerprint = bindingHash({
      endpoints: edgePoints,
      normal: worldDirection(new Vector3(...face.normal)).toArray(),
      stockLengthAxis: length,
    });
    const planeAlongFlutes = face.normal[length];
    if (Math.abs(planeAlongFlutes) > directionTolerance) {
      const upper = planeAlongFlutes * flute.y > 0;
      (upper ? result.upper : result.lower).push({
        id,
        fingerprint,
        points: edgePoints,
        label: `${label} ${upper ? "upper" : "lower"} edge ${index + 1}`,
        length: span,
      });
    } else if (Math.abs(face.normal[width]) > directionTolerance) {
      result.sides.push({
        id,
        fingerprint,
        label,
        pieceId: piece.id,
        a: aWorld,
        b: bWorld,
        along: flute,
        outward: worldDirection(axis(width)).multiplyScalar(
          Math.sign(face.normal[width]),
        ),
      });
    }
  }
  if (!result.upper.length || !result.lower.length)
    return {
      label,
      upper: [],
      lower: [],
      sides: [],
      issue: "Both fluted ends could not be identified on the retained shape.",
    };
  return result;
}

/** Match nominal flute-side edges in one plane. Lengths and backing remain field-fit decisions. */
function sideSeams(sides: Side[]) {
  const seams: Seam[] = [];
  const uses = new Map<Side, number>();
  for (const [i, a] of sides.entries()) {
    const length = a.a.distanceTo(a.b);
    const along = a.b.clone().sub(a.a).divideScalar(length);
    for (let j = i + 1; j < sides.length; j++) {
      const b = sides[j];
      if (
        a.pieceId === b.pieceId ||
        Math.abs(a.along.dot(b.along)) < 1 - directionTolerance ||
        a.outward.dot(b.outward) > -1 + directionTolerance
      )
        continue;
      const start = b.a.clone().sub(a.a),
        end = b.b.clone().sub(a.a);
      const low = Math.min(start.dot(along), end.dot(along));
      const high = Math.max(start.dot(along), end.dot(along));
      const overlap = Math.min(length, high) - Math.max(0, low);
      if (
        overlap <= tolerance ||
        start.clone().cross(along).length() > tolerance ||
        end.clone().cross(along).length() > tolerance
      )
        continue;
      const full =
        Math.abs(low) <= tolerance && Math.abs(high - length) <= tolerance;
      const ordered = [a, b].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      seams.push({
        id: ordered.map((side) => side.id).join("+"),
        fingerprint: bindingHash(ordered.map((side) => side.fingerprint)),
        points: [ordered[0].a.toArray(), ordered[0].b.toArray()],
        overlapPoints: [
          a.a.clone().addScaledVector(along, Math.max(0, low)).toArray(),
          a.a.clone().addScaledVector(along, Math.min(length, high)).toArray(),
        ],
        label: `${a.label} / ${b.label} seam`,
        length: overlap,
        full,
        partial: !full,
        sides: [a, b],
        pieceIds: [a.pieceId, b.pieceId],
        issue: full ? null : "Partial overlap. Review the transition.",
      });
      for (const side of [a, b]) uses.set(side, (uses.get(side) ?? 0) + 1);
    }
  }
  return seams.map(({ sides, ...seam }) =>
    seam.full && sides.some((side) => uses.get(side)! > 1)
      ? {
          ...seam,
          full: false,
          issue: "More than one panel meets this edge. Review the join.",
        }
      : seam,
  );
}

export const sunliteEstimateScope =
  "Planning estimate from the panel center planes. Verify engagement, expansion, cut allowance, backing, ridge and eave transitions, and the final drainage detail before ordering.";
export const sunliteInstructions =
  "https://www.palram.com/us/product/sunlite-diy/";

export function sunliteTakeoff(project: Project) {
  const glazing = project.pieces.filter(
    (p) => p.material === "sunlite-8mm" && !p.offcut,
  );
  if (!glazing.length) return null;
  const labels = new Map(
    ensurePartLabels(project).partLabels.map((row) => [row.partId, row.label]),
  );
  const panels = glazing.map((p) => panelEdges(p, labels.get(p.id)!));
  const upper = panels.flatMap((p) => p.upper),
    lower = panels.flatMap((p) => p.lower);
  const seams = sideSeams(panels.flatMap((p) => p.sides));
  const fullSeams = seams.filter((seam) => seam.full);
  const profileRuns: SunliteProfileRun[] = [
    ...fullSeams.map(({ id, label, length, fingerprint, points }) => ({
      id,
      label,
      length,
      fingerprint,
      points,
      productId: "sunlite-96714" as const,
    })),
    ...[...upper, ...lower].map((run) => ({
      ...run,
      productId: "sunlite-96715" as const,
    })),
  ];
  const upperTape = packRuns(upper, sunliteTapeRollLength);
  const lowerTape = packRuns(lower, sunliteTapeRollLength);
  const tapePlanStarted = !!project.sunliteTapeCuts?.length;
  const uChannel = packRuns([...upper, ...lower], profileStockLength);
  const snapCap = packRuns(fullSeams, profileStockLength);
  const total = (runs: Run[]) => runs.reduce((sum, r) => sum + r.length, 0);
  const quantities = [
    {
      id: "sunlite-96714",
      label: "96714 snap-cap assemblies",
      packs: snapCap.bins.length,
    },
    {
      id: "sunlite-96715",
      label: "96715 U-channel sticks",
      packs: uChannel.bins.length,
    },
    ...(!tapePlanStarted ? [{
      id: sunliteTapeProductId,
      label: "92763 top/bottom tape kits",
      packs: Math.max(upperTape.bins.length, lowerTape.bins.length),
    }] : []),
  ].map((row) => {
    const product = findRetailerProduct(row.id)!;
    const offer = referenceOffersForProduct(product).find(
      (listing) => listing.retailer === project.retailer,
    );
    const selected = project.supplies.reduce(
      (sum, s) => sum + (s.productId === row.id ? s.quantity : 0),
      0,
    );
    return {
      ...row,
      offer,
      selected,
      missing: Math.max(0, row.packs - selected),
    };
  });
  return {
    panels,
    seams,
    profileRuns,
    upperInches: total(upper),
    lowerInches: total(lower),
    fullSeams: fullSeams.length,
    seamInches: total(fullSeams),
    unresolvedSeams: seams.filter((seam) => !seam.full),
    upperTape,
    lowerTape,
    uChannel,
    snapCap,
    quantities,
    tapePlanStarted,
  };
}
export type SunliteTakeoff = NonNullable<ReturnType<typeof sunliteTakeoff>>;

export function addEstimatedSunlitePurchases(project: Project) {
  const estimate = sunliteTakeoff(project);
  let next = project;
  for (const row of estimate?.quantities ?? []) {
    if (!row.offer || !row.missing) continue;
    next = addSupply(
      next,
      row.id,
      row.missing,
      "SUNLITE panel layout",
      sunliteEstimateScope,
    );
  }
  return next;
}

export function sunliteEstimateLines(estimate: SunliteTakeoff) {
  const {
    panels,
    upperInches,
    lowerInches,
    fullSeams,
    seamInches,
    unresolvedSeams,
    snapCap,
    uChannel,
    upperTape,
    lowerTape,
    quantities,
    tapePlanStarted,
  } = estimate;
  const findings = [
    `${panels.length} panels · ${fullSeams} full shared flute-side seams · ${inches(seamInches)} of snap-cap runs.`,
    tapePlanStarted
      ? "Check Glazing tape cut plan for tape lengths and kit quantities."
      : `Upper nonvented tape ${inches(upperInches)} (${upperTape.bins.length} rolls) · lower vented tape ${inches(lowerInches)} (${lowerTape.bins.length} rolls).`,
    ...quantities.map(
      (row) =>
        `${row.label} · estimate ${row.packs} · selected ${row.selected}${!row.offer && row.packs ? " · no reviewed listing for this retailer" : ""}.`,
    ),
  ];
  const review = [
    ...panels.flatMap((p) => (p.issue ? [`${p.label} · ${p.issue}`] : [])),
    ...unresolvedSeams.map(
      (run) => `${run.label} · ${inches(run.length)}. ${run.issue}`,
    ),
    ...[
      ...snapCap.oversized,
      ...uChannel.oversized,
      ...upperTape.oversized,
      ...lowerTape.oversized,
    ].map(
      (run) =>
        `${run.label} · ${inches(run.length)} exceeds a single stock unit · review the run.`,
    ),
  ];
  const allocations = [
    ...snapCap.bins.map((bin, i) => ({
      label: `Snap-cap assembly ${i + 1}`,
      runs: bin.runs,
    })),
    ...uChannel.bins.map((bin, i) => ({
      label: `U-channel stick ${i + 1}`,
      runs: bin.runs,
    })),
  ].map(
    (bin) =>
      `${bin.label} · ${bin.runs.map((run) => `${run.label} × ${inches(run.length)}`).join(", ")}`,
  );
  return { findings, review, allocations };
}

export function sunliteGuideMarkdown(project: Project) {
  const estimate = sunliteTakeoff(project);
  if (!estimate) return "";
  const { findings, review, allocations } = sunliteEstimateLines(estimate);
  return [
    "",
    "",
    "## SUNLITE panel accessory estimate",
    "",
    sunliteEstimateScope,
    "Nominal stock allocation uses full lengths. Add allowances for trim, cutting and tape overlap as measured.",
    "",
    `[Palram SUNLITE installation resources](${sunliteInstructions})`,
    "",
    ...findings.map((line) => `- ${line}`),
    ...estimate.quantities.flatMap(({ label, offer, packs }) =>
      offer && packs ? [`- [${label} · ${offer.seller}](${offer.url})`] : [],
    ),
    ...(review.length
      ? [
          "",
          "### Edges and seams to review",
          "",
          ...review.map((line) => `- ${line}`),
        ]
      : []),
    ...(allocations.length
      ? [
          "",
          "### Nominal profile cuts",
          "",
          ...allocations.map((line) => `- ${line}`),
        ]
      : []),
  ].join("\n");
}
