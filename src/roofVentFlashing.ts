import { Vector3 } from "three";
import { formatStockLength } from "./measurement";
import { uid, type Project, type V3 } from "./model";
import { oateyRoofVentBoot, twoInchPvcVent } from "./roofVentFlashingReference";
import {
  roofVentFlashingInputSchema, roofVentFlashingsSchema, roofVentMeasurementSchema,
  type RoofVentFlashingInput, type RoofVentMeasurements,
} from "./roofVentFlashingSchema";
import { reviewShingleRoofPlane } from "./shingleRoof";
import { stockAxes } from "./stockAxes";
import { partLabel } from "./partLabels";

const epsilon = 1e-6;
const diameterAllowance = 1 / 32;
const vector = (point: V3) => new Vector3(...point);

export type { RoofVentMeasurements } from "./roofVentFlashingSchema";

type RoofVentReview = {
  issue?: string;
  geometry?: {
    pitch: number;
    center: V3;
    flange: V3[];
    layout: V3[];
    openingWidth: number;
    openingLength: number;
    openingShift: number;
  };
};

function contains(face: Vector3[], normal: Vector3, point: Vector3) {
  const sides = face.map((start, i) => face[(i + 1) % face.length].clone().sub(start)
    .normalize().cross(point.clone().sub(start)).dot(normal));
  return sides.every((side) => side >= -epsilon) || sides.every((side) => side <= epsilon);
}

export function reviewRoofVentFlashing(project: Pick<Project, "pieces" | "projectCode">, input: RoofVentMeasurements): RoofVentReview {
  if (!roofVentMeasurementSchema.safeParse(input).success)
    return { issue: "Enter the pipe position, its actual outside diameter, planned clearance and the measured distances to the flange edges." };
  const { panelId, across, downhill, outsideDiameter, radialClearance, flangeLeft, flangeUphill } = input;
  const base = oateyRoofVentBoot.base;
  // The dimensional check distinguishes 2 in nominal PVC from an actual 2 in tube.
  // Seating the delivered boot remains a field check.
  if (Math.abs(outsideDiameter - twoInchPvcVent.outsideDiameter) > diameterAllowance + epsilon) {
    return { issue: "The measured outside diameter differs from the reviewed 2 in nominal PVC vent. Check the pipe and the delivered collar." };
  }
  const code = project.projectCode;
  const plane = code?.trades.includes("roofing") && code.shingleRoof?.planes.find(({ basis }) =>
    basis.kind === "panel" && basis.pieceId === panelId);
  const panel = project.pieces.find(({ id }) => id === panelId);
  if (!plane || !panel) return { issue: "Choose a retained deck panel in the roofing review." };
  const { pitch, faces } = reviewShingleRoofPlane(project, plane);
  if (pitch === null || faces.length !== 1)
    return { issue: "Choose an unbroken upper deck face for the flashing and opening layout." };
  if (pitch < 2 - epsilon || pitch > oateyRoofVentBoot.maxPitch + epsilon)
    return { issue: "Choose an asphalt-shingle roof within the reviewed 2:12 to 12:12 pitch range." };

  const face = faces[0].points.map(vector);
  const origin = face.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(face.length);
  const up = vector(faces[0].normal).normalize();
  const downslope = new Vector3(0, -1, 0).addScaledVector(up, up.y).normalize();
  const crossSlope = downslope.clone().cross(up);
  const center = origin.addScaledVector(crossSlope, across).addScaledVector(downslope, downhill);
  const rectangle = (left: number, right: number, top: number, bottom: number) =>
    [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) =>
      center.clone().addScaledVector(crossSlope, x).addScaledVector(downslope, y));
  const flange = rectangle(-flangeLeft, base - flangeLeft, -flangeUphill, base - flangeUphill);
  const radius = outsideDiameter / 2 + radialClearance;
  const slopeRadius = radius / up.y;
  const thickness = panel.size[stockAxes(panel, panel.cutStock?.size ?? panel.size).thickness];
  // A vertical tube crosses the lower plane farther downhill when projected
  // onto the upper face. This envelope covers a cut normal to the sheet.
  const lowerShift = thickness * pitch / 12;
  const downhillReach = slopeRadius + lowerShift;
  const layout = rectangle(-radius, radius, -slopeRadius, downhillReach);
  const geometry = {
    pitch, center: center.toArray() as V3,
    flange: flange.map((point) => point.toArray() as V3),
    layout: layout.map((point) => point.toArray() as V3),
    openingWidth: 2 * radius, openingLength: slopeRadius + downhillReach, openingShift: lowerShift / 2,
  };
  if (flange.some((point) => !contains(face, up, point)))
    return { geometry, issue: "The modeled flange crosses the retained deck edge. Review the penetration location and backing." };
  if (flangeLeft <= radius + epsilon || base - flangeLeft <= radius + epsilon ||
    flangeUphill <= slopeRadius + epsilon || base - flangeUphill <= downhillReach + epsilon)
    return { geometry, issue: "The opening envelope reaches beyond the measured flange cover. Check the pipe position and delivered boot." };
  return { geometry };
}

function geometrySignature(geometry: NonNullable<RoofVentReview["geometry"]>) {
  return JSON.stringify([...geometry.flange, ...geometry.layout].map((point) =>
    point.map((value) => Number(value.toFixed(5)))));
}

function flangeOverlap(a: RoofVentMeasurements, b: RoofVentMeasurements) {
  if (a.panelId !== b.panelId) return false;
  return Math.abs((a.across - a.flangeLeft) - (b.across - b.flangeLeft)) < oateyRoofVentBoot.base - epsilon &&
    Math.abs((a.downhill - a.flangeUphill) - (b.downhill - b.flangeUphill)) < oateyRoofVentBoot.base - epsilon;
}

export function roofVentFlashingReviews(project: Project) {
  const plans = project.roofVentFlashings ?? [];
  return plans.map((plan) => {
    const { label: _label, fieldConfirmed: _confirmed, ...measurements } = plan.input;
    const review = reviewRoofVentFlashing(project, measurements);
    const issue = review.issue ??
      (review.geometry && geometrySignature(review.geometry) !== plan.signature
        ? "The roof or flashing layout changed. Recheck the field position and flange seating."
        : plans.some((other) => other.id !== plan.id && flangeOverlap(other.input, plan.input))
          ? "The flashing footprint overlaps another saved vent flashing." : undefined);
    return { ...review, plan, issue };
  });
}

export function roofVentFlashingCount(project: Project) {
  const reviews = roofVentFlashingReviews(project);
  return reviews.some(({ issue }) => !!issue) ? null : reviews.length;
}

export function saveRoofVentFlashing(project: Project, unverified: RoofVentFlashingInput, id: string = uid()): Project {
  const { label, fieldConfirmed, ...measurements } = roofVentFlashingInputSchema.parse(unverified);
  const review = reviewRoofVentFlashing(project, measurements);
  if (review.issue || !review.geometry) throw Error(review.issue ?? "Review the flashing fit.");
  const entries = (project.roofVentFlashings ?? []).filter((plan) => plan.id !== id);
  if (entries.some(({ input }) => flangeOverlap(input, measurements)))
    throw Error("The flashing footprint overlaps another saved vent flashing.");
  const next = { id, input: { ...measurements, label, fieldConfirmed }, signature: geometrySignature(review.geometry) };
  return { ...project, roofVentFlashings: roofVentFlashingsSchema.parse([...entries, next]) };
}

export function removeRoofVentFlashing(project: Project, id: string): Project {
  const remaining = (project.roofVentFlashings ?? []).filter((plan) => plan.id !== id);
  if (remaining.length) return { ...project, roofVentFlashings: remaining };
  const { roofVentFlashings: _removed, ...rest } = project;
  return rest;
}

export function roofVentFlashingGuideLines(project: Project) {
  return roofVentFlashingReviews(project).flatMap(({ plan: { input }, issue, geometry }) => {
    const name = `${input.label} · roof deck ${partLabel(project, input.panelId)}`;
    if (issue || !geometry) return [`${name}. Needs review. ${issue ?? "Review the measured penetration."}`];
    return [
      `${name}. Mark the pipe center and check the site template against the ${formatStockLength(geometry.openingWidth)} across × ${formatStockLength(geometry.openingLength)} downslope opening envelope.`,
      `Center the envelope ${formatStockLength(geometry.openingShift)} downhill from the point where the pipe crosses the upper deck face. The offset allows for a vertical pipe crossing the full sheet thickness.`,
      `Dry-fit Oatey ${oateyRoofVentBoot.model} to the actual pipe and deck. Integrate the upper flange under the uphill courses and drain the lower flange over the downhill shingles. Follow the manufacturer’s fastening and seating instructions.`,
    ];
  });
}
