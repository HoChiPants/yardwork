import { reviewConnectionContact } from "./connectionContacts";
import type { Piece, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";
import { estimateTrimSealant } from "./trimSealantTakeoff";
import type { TrimSeamInput } from "./woodJointDecisionSchema";

export function modeledTrimSeamEdges(first: Piece, second: Piece) {
  // An opening can split a retained face into separate patches with artificial boundaries.
  if (pieceThroughOpenings(first).length || pieceThroughOpenings(second).length) return null;
  const { gap, outline } = reviewConnectionContact(first, second);
  if (!outline || gap === null) return null;
  const inverse = inverseRotation(first.rotation);
  const key = (point: V3) => JSON.stringify(
    rotate(point.map((n, i) => n - first.position[i]) as V3, inverse)
      .map((n) => Number(n.toFixed(5))),
  );
  const edges = new Map<string, { id: string; points: [V3, V3]; length: number }>();
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const length = Number(Math.hypot(...a.map((n, j) => n - b[j])).toFixed(6));
    if (length <= 0.00001) continue;
    const id = [key(a), key(b)].sort().join("/");
    edges.set(id, { id, points: [a, b], length });
  }
  return {
    gap,
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)).map((edge, i) => ({
      ...edge, label: `Edge ${i + 1}`,
    })),
  };
}

export function estimateModeledTrimSeam(
  shape: NonNullable<ReturnType<typeof modeledTrimSeamEdges>>,
  plan: TrimSeamInput,
) {
  if (plan.gapWidth < shape.gap - 1e-7)
    throw Error("The measured width is smaller than the modeled gap. Recheck the gap or update the model.");
  const edges = shape.edges.filter(({ id }) => plan.edgeIds.includes(id));
  if (!edges.length || edges.length !== plan.edgeIds.length)
    throw Error("Select current exposed edges of this joint.");
  const lengthInches = edges.reduce((total, edge) => total + edge.length, 0);
  return { ...estimateTrimSealant({ ...plan, lengthInches }), edges, lengthInches };
}
