import { reviewConnectionContact } from "./connectionContacts";
import type { Piece, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";
import { estimateTrimSealant } from "./trimSealantTakeoff";
import { trimBackerRodLength, trimBackerRodMinRecess, trimBackerRods } from "./trimBackerRodReference";
import { trimSealant } from "./trimSealantReference";
import type { TrimSeamInput, TrimSeamOpenSpan } from "./woodJointDecisionSchema";

type TrimSeamEdge = {
  id: string;
  points: [V3, V3];
  localStart: V3;
  length: number;
  label: string;
};

export type TrimSeamMarker = {
  points: [V3, V3];
  label: string;
  segments: { points: [V3, V3]; open: boolean }[];
};

export function modeledTrimSeamEdges(first: Piece, second: Piece) {
  // An opening can split a retained face into separate patches with artificial boundaries.
  if (pieceThroughOpenings(first).length || pieceThroughOpenings(second).length) return null;
  const { gap, outline } = reviewConnectionContact(first, second, trimSealant.screenWidth);
  if (!outline || gap === null) return null;
  const inverse = inverseRotation(first.rotation);
  const local = (point: V3) => rotate(point.map((n, i) => n - first.position[i]) as V3, inverse)
    .map((n) => Number(n.toFixed(5))) as V3;
  const edges = new Map<string, Omit<TrimSeamEdge, "label">>();
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const length = Number(Math.hypot(...a.map((n, j) => n - b[j])).toFixed(6));
    if (length <= 0.00001) continue;
    const localA = local(a), localB = local(b);
    const keyA = JSON.stringify(localA), keyB = JSON.stringify(localB);
    // Use the same local endpoint order as the saved edge IDs, even after rotation.
    const forward = keyA < keyB;
    const id = forward ? `${keyA}/${keyB}` : `${keyB}/${keyA}`;
    edges.set(id, { id, points: forward ? [a, b] : [b, a], localStart: forward ? localA : localB, length });
  }
  return {
    gap,
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)).map((edge, i) => ({
      ...edge, label: `Edge ${i + 1}`,
    })),
  };
}

export function trimSeamEdgeRuns(edge: TrimSeamEdge, spans: TrimSeamOpenSpan[]) {
  const openSpans = spans.filter(({ edgeId }) => edgeId === edge.id).sort((a, b) => a.start - b.start);
  const sealedSpans: { start: number; end: number; length: number }[] = [];
  let sealedFrom = 0;
  for (const { start, end } of openSpans) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < sealedFrom || end <= start || end > edge.length)
      throw Error(`${edge.label}: keep-open ranges must be inside the edge, with increasing ends and no overlap.`);
    if (start > sealedFrom) sealedSpans.push({ start: sealedFrom, end: start, length: start - sealedFrom });
    sealedFrom = end;
  }
  if (sealedFrom < edge.length)
    sealedSpans.push({ start: sealedFrom, end: edge.length, length: edge.length - sealedFrom });
  return { openSpans, sealedSpans };
}

export function trimSeamMarker(edge: TrimSeamEdge, label: string, spans: TrimSeamOpenSpan[]): TrimSeamMarker {
  const { openSpans, sealedSpans } = trimSeamEdgeRuns(edge, spans);
  const [a, b] = edge.points;
  const at = (offset: number) => a.map((n, i) => n + (b[i] - n) * (offset / edge.length)) as V3;
  return {
    label, points: edge.points,
    segments: [
      ...sealedSpans.map(({ start, end }) => ({ points: [at(start), at(end)] as [V3, V3], open: false })),
      ...openSpans.map(({ start, end }) => ({ points: [at(start), at(end)] as [V3, V3], open: true })),
    ],
  };
}

export function estimateModeledTrimSeam(
  shape: NonNullable<ReturnType<typeof modeledTrimSeamEdges>>,
  plan: TrimSeamInput,
) {
  if (plan.gapWidth < shape.gap - 1e-7)
    throw Error("The measured width is smaller than the modeled gap. Recheck the gap or update the model.");
  const chosenEdges = shape.edges.filter(({ id }) => plan.edgeIds.includes(id));
  if (!chosenEdges.length || chosenEdges.length !== plan.edgeIds.length)
    throw Error("Select current exposed edges of this joint.");
  const openSpans = plan.openSpans ?? [];
  if (openSpans.some(({ edgeId }) => !plan.edgeIds.includes(edgeId)))
    throw Error("Set keep-open ranges on selected edges only.");
  const edges = chosenEdges.map((edge) => ({ ...edge, ...trimSeamEdgeRuns(edge, openSpans) }));
  const lengths = edges.flatMap(({ sealedSpans }) => sealedSpans.map(({ length }) => length));
  if (!lengths.length) throw Error("Leave at least one section to seal.");
  const lengthInches = lengths.reduce((total, length) => total + length, 0);
  const backerRod = trimBackerRods.find(({ id }) => id === plan.backerRodId);
  if (backerRod) {
    if (plan.gapWidth >= backerRod.diameter)
      throw Error("Choose backer rod slightly wider than the widest measured opening.");
    if (plan.gapDepth < trimBackerRodMinRecess)
      throw Error("Leave at least 1/4 in above the fitted rod for sealant.");
    if (lengths.some((length) => length > trimBackerRodLength + 1e-7))
      throw Error("A continuous backing run exceeds the 20 ft roll. Review a longer product or a documented joint with the installer.");
  }
  return { ...estimateTrimSealant({ ...plan, lengthInches }), edges, lengthInches, backerRod };
}
