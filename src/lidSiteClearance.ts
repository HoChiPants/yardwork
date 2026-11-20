import type { Piece, Project, V3 } from "./model";
import { formatPreciseInches } from "./measurement";
import {
  clearanceAxis,
  gapToSiteFace,
  worldClearanceShape,
} from "./siteClearance";
import type { SiteClearance } from "./siteClearanceSchema";

type SiteMotion = {
  plane: SiteClearance;
  status: "met" | "short" | "needs-review" | "outside-height";
  gap: number | null;
  angle: number | null;
};
export type LidSiteMotion = SiteMotion;

const radiansPerDegree = Math.PI / 180;
const tolerance = 1e-7;

export function lidSiteFaces(project: Project, sectionId: string) {
  if (!project.siteClearances?.length) return [];
  const owner = project.ideaBindings.find((binding) =>
    binding.entries.some((entry) =>
      entry.sections.some((mapping) => mapping.sectionId === sectionId),
    ),
  );
  return project.siteClearances.filter(
    (plane) => plane.bindingId === null || plane.bindingId === owner?.id,
  );
}

/** Opening uses negative rotation around the resolved world-space hinge axis. */
export function sweepLidSiteFaces(
  closed: Piece,
  pivot: V3,
  axis: V3,
  openingDegrees: number,
  planes: readonly SiteClearance[],
): LidSiteMotion[] {
  if (!planes.length) return [];
  const shape = worldClearanceShape(closed);
  const end = openingDegrees * radiansPerDegree;
  const coefficients = shape.vertices.map((point) => {
    const [x, y, z] = point.map((value, i) => value - pivot[i]);
    const [u, v, w] = axis;
    const parallel = u * x + v * y + w * z;
    const center = axis.map((j, i) => pivot[i] + j * parallel) as V3;
    const cosine = [x - u * parallel, y - v * parallel, z - w * parallel] as V3;
    const sine = [w * y - v * z, u * z - w * x, v * x - u * y] as V3;
    return { center, cosine, sine };
  });
  const radius = Math.max(
    ...coefficients.map(({ cosine }) => Math.hypot(...cosine)),
  );
  const at = (theta: number) => {
    const c = Math.cos(theta),
      s = Math.sin(theta);
    return {
      faces: shape.faces,
      vertices: coefficients.map(
        ({ center, cosine, sine }) =>
          center.map((value, i) => value + cosine[i] * c + sine[i] * s) as V3,
      ),
    };
  };
  return planes.map((plane) => {
    let closest = Infinity,
      closestTheta = 0;
    const visit = (gap: number | null, theta: number) => {
      if (gap !== null && gap < closest) {
        closest = gap;
        closestTheta = theta;
      }
    };
    if (plane.top === null) {
      const i = clearanceAxis(plane.side);
      const sign = plane.side.startsWith("+") ? 1 : -1;
      // A rotating vertex projects to a sinusoid. Its interior stationary
      // angles and the sweep endpoints suffice for the whole retained solid.
      for (const { center, cosine, sine } of coefficients) {
        const turning = Math.atan2(sine[i], cosine[i]);
        const angles = [0, end, turning, turning + Math.PI, turning - Math.PI];
        for (const theta of angles) {
          if (theta < 0 || theta > end) continue;
          visit(
            sign *
              (plane.coordinate -
                center[i] -
                cosine[i] * Math.cos(theta) -
                sine[i] * Math.sin(theta)),
            theta,
          );
        }
      }
      return {
        plane,
        status: closest < plane.minimum - tolerance ? "short" : "met",
        gap: closest,
        angle: closestTheta / radiansPerDegree,
      };
    }
    visit(gapToSiteFace(at(0), plane), 0);
    visit(gapToSiteFace(at(end), plane), end);
    const intervals: [number, number][] = [[0, end]];
    let uncertain = false,
      leavesWithBand = false;
    for (let checks = 0; intervals.length && checks < 512; checks++) {
      const [start, finish] = intervals.pop()!;
      const mid = (start + finish) / 2,
        midShape = at(mid);
      visit(gapToSiteFace(midShape, plane), mid);
      // This bounds displacement in every axis anywhere in the interval.
      // Enlarge the height band by that amount before using the midpoint as
      // a lower bound on gap. If certification runs out, keep it unresolved.
      const movement = 2 * radius * Math.sin((finish - start) / 4);
      const lowerGap = gapToSiteFace(midShape, plane, movement + tolerance);
      if (lowerGap === null) continue;
      if (lowerGap - movement >= plane.minimum + tolerance) {
        leavesWithBand = true;
        continue;
      }
      if (closest < plane.minimum - tolerance) break;
      if (finish - start <= radiansPerDegree / 64) {
        uncertain = true;
        continue;
      }
      intervals.push([mid, finish], [start, mid]);
    }
    const status =
      closest < plane.minimum - tolerance
        ? "short"
        : uncertain || intervals.length
          ? "needs-review"
          : !Number.isFinite(closest) && !leavesWithBand
            ? "outside-height"
            : "met";
    return {
      plane,
      status,
      gap: Number.isFinite(closest) ? closest : null,
      angle: Number.isFinite(closest) ? closestTheta / radiansPerDegree : null,
    };
  });
}

export const lidSiteAngle = (angle: number) => `${Number(angle.toFixed(2))}°`;

export function lidSiteMotionText(result: LidSiteMotion) {
  const { plane, status, angle, gap } = result;
  if (status === "outside-height")
    return "The lid stays above or below the measured height band.";
  if (status === "needs-review")
    return "The check could not resolve a close pass within this height band.";
  if (
    gap === null ||
    angle === null ||
    (status === "met" && plane.top !== null)
  )
    return `The lid keeps at least the requested ${formatPreciseInches(plane.minimum)} gap in the measured height band.`;
  const description = plane.top === null ? "Tightest gap" : "Checked pose";
  const resultText =
    gap < -tolerance
      ? `${formatPreciseInches(-gap)} past the face`
      : `${formatPreciseInches(Math.max(0, gap))} gap`;
  const shortfall =
    status === "short"
      ? `, short by ${formatPreciseInches(plane.minimum - gap)}`
      : "";
  return `${description} at ${lidSiteAngle(angle)}: ${resultText}, minimum ${formatPreciseInches(plane.minimum)}${shortfall}.`;
}
