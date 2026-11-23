import { Vector3 } from "three";
import type { WoodFace } from "./connectionContacts";
import { glazingBackingGaps, prepareGlazingBacking } from "./glazingBacking";
import { formatStockLength } from "./measurement";
import { material, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import type { ShingleRoofPlane } from "./shingleRoofSchema";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { pieceThroughOpenings } from "./throughOpenings";

export const roofDeckSpacingReference = {
  target: 0.125,
  fastenerInset: 0.375,
  title: "APA Rated Sheathing roof installation · N335",
  url: "https://www.apawood.org/guides-tools-training/technical-document-library/builder-tips/proper-installation-of-apa-rated-sheathing-for-roof-applications/",
  scope: "APA recommends a ⅛ in installation gap between adjacent panel edges and ends unless the panel manufacturer specifies a different detail. Confirm the delivered panel instructions and required edge support.",
  backingScope: "The framing check follows the APA ⅜ in fastener inset on both sides of the joint. Locate panel ends over framing. Confirm whether the span rating and framing layout call for clips or blocking along panel edges.",
  endScope: "Confirm the panel stamp and strength axis before laying the sheets. Dry-fit the panel ends over framing and verify bearing width and fastener attachment before fastening.",
};

const tolerance = 1e-6;
// A larger opening is outside this neighboring-edge search, not a spacing allowance.
const jointSearchDistance = 1;
type DeckPlane = { plane: ShingleRoofPlane; pieceId: string | null; faces: readonly WoodFace[] };

export type RoofDeckJoint = {
  id: string;
  pieceIds: [string, string];
  gap: number;
  length: number;
  state: "match" | "tight" | "wide" | "overlap";
  line: [V3, V3];
  edges: [[V3, V3], [V3, V3]];
  backing?: { pieceId: string; gaps: ReturnType<typeof glazingBackingGaps> }[];
};

type RoofDeckEnd = {
  id: string;
  pieceId: string;
  end: number;
  assumedAxis: boolean;
  length: number;
  edge: [V3, V3];
  bearingGaps: ReturnType<typeof glazingBackingGaps>;
  fastenerGaps: ReturnType<typeof glazingBackingGaps>;
};

function deckEdges(face: WoodFace) {
  const normal = new Vector3(...face.normal);
  const points = face.points.map((point) => new Vector3(...point));
  const center = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length);
  return points.map((start, index) => {
    const end = points[(index + 1) % points.length];
    const tangent = end.clone().sub(start).normalize();
    const outward = new Vector3().crossVectors(tangent, normal);
    if (outward.dot(center.clone().sub(start)) > 0) outward.negate();
    return { start, end, tangent, outward };
  });
}

export function reviewRoofDeckSpacing(project: Pick<Project, "pieces" | "motionPlans">, planes: readonly DeckPlane[]) {
  const modeled = planes.filter(({ plane }) => plane.basis.kind === "panel" && plane.basis.pieceId);
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const skipped: string[] = [];
  const ambiguousEnds: string[] = [];
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  const panels = modeled.flatMap(({ plane, pieceId, faces }) => {
    const piece = pieceId ? pieces.get(pieceId) : undefined;
    const [face] = faces;
    if (!piece || faces.length !== 1 || face.points.length !== 4 || piece.cutPlanes.length || pieceThroughOpenings(piece).length) {
      skipped.push(plane.label);
      return [];
    }
    const reference = piece.cutStock?.size ?? piece.size;
    const { thickness, width, length } = stockAxes(piece, reference);
    const assumedAxis = !piece.cutStock?.sourceAxes && piece.stockLengthAxis == null;
    const direction: V3 = [0, 0, 0];
    direction[length] = 1;
    const ambiguous = assumedAxis && Math.abs(reference[width] - reference[length]) <= tolerance;
    if (ambiguous) ambiguousEnds.push(piece.id);
    return [{ id: piece.id, normal: new Vector3(...face.normal), edges: deckEdges(face),
      thickness: piece.size[thickness], stockLength: piece.size[length], assumedAxis,
      axis: ambiguous ? null : new Vector3(...rotate(direction, piece.rotation)),
      minimumSide: Math.min(piece.size[width], piece.size[length]) }];
  });
  const joints: RoofDeckJoint[] = [];
  const inset = roofDeckSpacingReference.fastenerInset;
  let framing: ReturnType<typeof prepareGlazingBacking> | undefined;
  function backingGaps(panel: typeof panels[number], line: [V3, V3]) {
    framing ??= prepareGlazingBacking(project.pieces.filter((piece) => material(piece.material).stockKind === "linear" &&
      !moving.has(piece.id) && piece.designRole !== "seat-lid"));
    const contact = line.map((point) => new Vector3(...point)
      .addScaledVector(panel.normal, -panel.thickness).toArray()) as [V3, V3];
    return glazingBackingGaps(framing, contact, line, panel.normal.toArray(), { distance: tolerance, normal: tolerance });
  }
  const ends: RoofDeckEnd[] = panels.flatMap((panel) => {
    const { axis } = panel;
    if (!axis || panel.stockLength <= inset) return [];
    const endEdges = panel.edges.filter(({ outward }) => Math.abs(outward.dot(axis)) >= 1 - tolerance)
      .sort((a, b) => a.outward.dot(axis) - b.outward.dot(axis));
    return endEdges.map(({ start, end, outward }, index) => {
      const edge: [V3, V3] = [start.toArray(), end.toArray()];
      const line = [start, end].map((point) => point.clone().addScaledVector(outward, -inset).toArray()) as [V3, V3];
      return { id: `roof-deck-end-${panel.id}-${index + 1}`, pieceId: panel.id, end: index + 1,
        assumedAxis: panel.assumedAxis, length: start.distanceTo(end), edge,
        bearingGaps: backingGaps(panel, edge), fastenerGaps: backingGaps(panel, line) };
    });
  });
  for (const [panelIndex, first] of panels.entries()) {
    for (const second of panels.slice(panelIndex + 1)) {
      if (first.normal.distanceTo(second.normal) > tolerance ||
        Math.abs(first.normal.dot(second.edges[0].start.clone().sub(first.edges[0].start))) > tolerance) continue;
      for (const [i, a] of first.edges.entries()) {
        for (const [j, b] of second.edges.entries()) {
          if (a.outward.clone().add(b.outward).length() > tolerance) continue;
          const gap = b.start.clone().sub(a.start).dot(a.outward);
          if (Math.abs(gap) > jointSearchDistance + tolerance) continue;
          const bFrom = b.start.clone().sub(a.start).dot(a.tangent);
          const bTo = b.end.clone().sub(a.start).dot(a.tangent);
          const from = Math.max(0, Math.min(bFrom, bTo));
          const to = Math.min(a.start.distanceTo(a.end), Math.max(bFrom, bTo));
          if (to - from <= tolerance) continue;
          const line = (offset: number): [V3, V3] => [from, to].map((position) =>
            a.start.clone().addScaledVector(a.tangent, position).addScaledVector(a.outward, offset).toArray(),
          ) as [V3, V3];
          const difference = gap - roofDeckSpacingReference.target;
          let backing: RoofDeckJoint["backing"];
          if (gap >= -tolerance && first.minimumSide > inset && second.minimumSide > inset) {
            backing = ([[first, -inset], [second, gap + inset]] as const)
              .map(([panel, offset]) => ({ pieceId: panel.id, gaps: backingGaps(panel, line(offset)) }));
          }
          joints.push({
            id: `roof-deck-joint-${first.id}-${i}-${second.id}-${j}`,
            pieceIds: [first.id, second.id], gap, length: to - from,
            state: gap < -tolerance ? "overlap" : difference < -tolerance ? "tight" : difference > tolerance ? "wide" : "match",
            line: line(gap / 2), edges: [line(0), line(gap)], backing,
          });
        }
      }
    }
  }
  return { modeled: modeled.length, skipped, joints, ends, ambiguousEnds };
}

export function roofDeckEndTitle(project: Project, { pieceId, end }: RoofDeckEnd) {
  return `Roof deck end · ${partLabel(project, pieceId)} · end ${end}`;
}

export function roofDeckEndDetail({ length, bearingGaps, fastenerGaps, assumedAxis }: RoofDeckEnd) {
  const gapLength = (gaps: RoofDeckEnd["bearingGaps"]) => formatStockLength(gaps.reduce((sum, gap) => sum + gap.length, 0));
  const bearing = bearingGaps.length
    ? `${gapLength(bearingGaps)} of ${formatStockLength(length)} at the end edge lacks modeled bearing.`
    : "Modeled framing reaches the full end edge.";
  const fasteners = fastenerGaps.length
    ? `${gapLength(fastenerGaps)} lacks framing along the ⅜ in fastener line.`
    : "Modeled framing reaches the full ⅜ in fastener line.";
  const axis = assumedAxis ? " End direction follows the longer stock dimension. Confirm the panel stamp." : "";
  return `${bearing} ${fasteners}${axis}`;
}

export function roofDeckJointLabel(joint: RoofDeckJoint) {
  if (joint.state === "overlap") return `${formatStockLength(-joint.gap)} overlap`;
  if (Math.abs(joint.gap) <= tolerance) return "Butted edges · 0 in gap";
  return `${formatStockLength(joint.gap)} gap`;
}

export function roofDeckJointDetail(joint: RoofDeckJoint) {
  const difference = Math.abs(joint.gap - roofDeckSpacingReference.target);
  const compare = joint.state === "match" ? "Matches the APA ⅛ in installation reference."
    : `${formatStockLength(difference)} ${joint.state === "wide" ? "above" : "below"} the APA ⅛ in installation reference.`;
  return `${roofDeckJointLabel(joint)} along ${formatStockLength(joint.length)}. ${compare}`;
}

export function roofDeckJointName(project: Project, joint: RoofDeckJoint) {
  return joint.pieceIds.map((id) => partLabel(project, id)).join(" and ");
}

export function roofDeckBackingDetail(project: Project, joint: RoofDeckJoint) {
  if (!joint.backing) return "Review panel placement before checking framing along this joint.";
  const missing = joint.backing.flatMap(({ pieceId, gaps }) => gaps.length ? [
    `${partLabel(project, pieceId)} has ${formatStockLength(gaps.reduce((sum, gap) => sum + gap.length, 0))} of ${formatStockLength(joint.length)} without modeled framing under its fastener line.`,
  ] : []);
  return missing.length ? missing.join(" ") : "Modeled framing reaches both fastener lines along this joint.";
}

export function roofDeckSpacingLimits(review: ReturnType<typeof reviewRoofDeckSpacing>) {
  return [
    ...(review.skipped.length ? [`Confirm spacing in the field for ${review.skipped.join(", ")}. The model check uses rectangular panels without cutouts.`] : []),
    ...(!review.joints.length ? [review.modeled < 2
      ? "Choose another modeled deck panel to compare a joint."
      : "No facing joints were detected within 1 in on the same plane. Check roof breaks and other joints in the field."] : []),
  ];
}
