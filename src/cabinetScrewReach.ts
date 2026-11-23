import { cabinetScrewMeasurements, type CabinetBackingPlan, type CabinetScrewMeasurements } from "./cabinetBackingSchema";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Project, Section, V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap, solidSegmentRanges } from "./solidCollision";
import { rotate } from "./spatial";

type ScrewMark = { offset: number; receiver: string; point: V3; woodDepth: number; edge: number };
type MountingRow = { wall: Section; marks: ScrewMark[] };
const epsilon = 0.00001;
const measure = (n: number) => Number(n.toFixed(5));
const along = (origin: V3, direction: V3, distance: number) =>
  origin.map((n, axis) => n + direction[axis] * distance) as V3;
const dot = (a: V3, b: V3) => a.reduce((sum, n, axis) => sum + n * b[axis], 0);

export const cabinetScrewScope = "Measure from the seated head to the tip and from the head seat to the wood. Include the bracket or rail, shims and finish in that stack. Use the specified depth and any tip exclusion from your mounting instructions. The check follows a straight drive normal to the wall in the saved model. Confirm approved hardware, spacing, thread engagement and concealed services at the site.";
export const cabinetScrewReference = "https://www.ikea.com/us/en/files/pdf/da/86/da86abe2/enhet_kitchen_install_guide_apr_2023.pdf#page=8";

export function reviewCabinetScrewReach(
  project: Project, plan: CabinetBackingPlan, layout: MountingRow,
  input: CabinetScrewMeasurements, savedFinish?: NonNullable<CabinetBackingPlan["fastening"]>["finishAtMarks"],
) {
  const measurements = cabinetScrewMeasurements.parse(input);
  const { seatedLength, stack, diameter, minimumDepth, excludedTip } = measurements;
  const inward = rotate([0, 0, plan.input.face === "front" ? -1 : 1], layout.wall.rotation);
  const outward = inward.map((n) => -n) as V3;
  const drywallIds = new Set(project.sections.flatMap(({ wallDrywall, pieceIds }) =>
    wallDrywall?.wallId === plan.input.wallId && wallDrywall.side === plan.input.face ? pieceIds : []));
  const parts = project.pieces.filter(({ offcut }) => !offcut).map((piece) => {
    const solid = prepareCollisionSolid(piece);
    return { id: piece.id, name: piece.name, solid: solid ?? prepareCollisionBox(piece.size, piece.position, piece.rotation),
      envelope: !solid || solid.kind === "envelope" };
  });
  const finish = parts.filter(({ id }) => drywallIds.has(id));
  const reach = measure(seatedLength - stack);
  const locations = layout.marks.map(({ offset, receiver, point, woodDepth, edge }, index) => {
    const issues: string[] = [];
    const finishLayers = finish.flatMap(({ id, solid }) => {
      const startProjection = dot(point, outward);
      const far = Math.max(...solid.vertices.map((vertex) => dot(vertex, outward) - startProjection));
      if (far <= epsilon) return [];
      return solidSegmentRanges(solid, point, along(point, outward, far)).flatMap(([a, b]) => {
        const from = measure(a * far), to = measure(b * far);
        return to > from + epsilon ? [{ id, from, to }] : [];
      });
    }).sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id));
    const modeledFinish = Math.max(0, ...finishLayers.map(({ to }) => to));
    const finishStale = !!savedFinish && JSON.stringify(savedFinish[index]) !== JSON.stringify(finishLayers);
    const countedDepth = measure(Math.max(0, Math.min(woodDepth, reach - excludedTip)));
    const reserve = measure(woodDepth - Math.max(0, reach));
    if (finishStale) issues.push("The modeled finish changed. Remeasure the head-seat-to-wood stack and review it again.");
    if (finish.length && !finishLayers.length) issues.push("The mounting point has a gap in the modeled drywall. Check the finish at the actual mark.");
    if (modeledFinish > stack + epsilon)
      issues.push(`Modeled drywall reaches ${formatPreciseInches(modeledFinish)} from wood, beyond the entered stack.`);
    if (edge < diameter / 2 - epsilon) issues.push("The entered shank extends past the nearest modeled wood edge.");
    if (!finishStale) {
      if (reach <= epsilon) issues.push("The seated screw does not reach wood.");
      else if (countedDepth < minimumDepth - epsilon)
        issues.push(`Depth after tip allowance falls short of the entered ${formatPreciseInches(minimumDepth)} minimum.`);
      if (reserve < -epsilon) issues.push(`The tip projects ${formatPreciseInches(-reserve)} beyond the receiving wood.`);
      if (reach > epsilon) {
        const corridor = prepareCollisionBox([diameter, diameter, reach], along(point, inward, reach / 2), layout.wall.rotation);
        for (const { id, name, solid, envelope } of parts) {
          if (id !== receiver && solidOverlap(corridor, solid, epsilon))
            issues.push(`${partLabel(project, id)} · ${name} ${envelope ? "has a modeled envelope in" : "intersects"} the screw path.`);
        }
      }
    }
    return { offset, receiver, woodDepth, countedDepth, reserve, modeledFinish, finishLayers, issues, finishStale };
  });
  const minLength = measure(stack + minimumDepth + excludedTip);
  const maxLength = measure(stack + Math.min(...locations.map(({ woodDepth }) => woodDepth)));
  return { measurements, locations, minLength, maxLength, finishAtMarks: locations.map(({ finishLayers }) => finishLayers) };
}

export type CabinetScrewReview = ReturnType<typeof reviewCabinetScrewReach>;

export function cabinetScrewDepthSummary({ locations, minLength, maxLength, measurements }: CabinetScrewReview) {
  if (locations.some(({ finishStale }) => finishStale)) return "Remeasure the stack before using the screw length comparison.";
  if (locations.some(({ modeledFinish }) => modeledFinish > measurements.stack + epsilon))
    return "Check the measured stack at each marked point before comparing screw lengths.";
  if (minLength > maxLength + epsilon)
    return "The shallowest receiver cannot provide the entered depth without the tip projecting behind it. Review deeper backing or mounting points over studs.";
  return minLength === maxLength
    ? `Depth alone leaves ${formatStockLength(minLength)} seated length with no spare wood behind the shallowest tip.`
    : `Depth alone allows ${formatStockLength(minLength)} to ${formatStockLength(maxLength)} seated length across this row. Check the path and the specified hardware separately.`;
}

export function cabinetScrewLocationText(project: Project, row: CabinetScrewReview["locations"][number]) {
  const { offset, receiver, woodDepth, countedDepth, reserve, issues, finishStale } = row;
  const mark = `${formatPreciseInches(offset)} from wall start · ${partLabel(project, receiver)}`;
  if (finishStale) return `${mark}. ${issues.join(" ")}`;
  const remaining = reserve >= 0 ? ` ${formatPreciseInches(reserve)} wood remains behind the tip.` : "";
  return `${mark}. ${formatPreciseInches(countedDepth)} counted depth in ${formatPreciseInches(woodDepth)} wood.${remaining} ${issues.join(" ") || "The entered depth and path clear the modeled check."}`;
}

export function cabinetScrewGuideLines(project: Project, review: CabinetScrewReview) {
  const { seatedLength, stack, diameter, minimumDepth, excludedTip } = review.measurements;
  return [
    `Cabinet screw check. ${formatStockLength(seatedLength)} seated length, ${formatPreciseInches(diameter)} shank, ${formatPreciseInches(stack)} head-seat-to-wood stack, ${formatPreciseInches(minimumDepth)} minimum depth, and ${formatPreciseInches(excludedTip)} excluded tip.`,
    cabinetScrewDepthSummary(review),
    ...review.locations.map((location) => cabinetScrewLocationText(project, location)),
    cabinetScrewScope,
  ];
}
