import { formatPreciseInches, formatStockLength } from "./measurement";
import { projectSchema, type Project, type V3 } from "./model";
import { roundDuctTakeoff } from "./roundDuct";
import { roundDuctElbowReviews } from "./roundDuctElbow";
import { ductLengthTolerance } from "./roundDuctEndFit";
import { roundDuctMastic, roundDuctSealNote } from "./roundDuctReference";
import { roundDuctSealInputSchema, type RoundDuctSealInput } from "./roundDuctSealSchema";
import { ductRunSignature } from "./roundDuctStock";

function layoutSignature(project: Project) {
  return JSON.stringify([
    [...(project.roundDuctRuns ?? [])].sort((a,b) => a.id.localeCompare(b.id))
      .map(({id,input}) => [id, ductRunSignature(input)]),
    [...(project.roundDuctElbows ?? [])].sort((a,b) => a.id.localeCompare(b.id))
      .map(({id,input}) => [id,input]),
  ]);
}

function coincidentTips(points: V3[]) {
  return points.some((point, index) => points.slice(0,index).some((previous) =>
    Math.hypot(...point.map((value, axis) => value - previous[axis])) <= ductLengthTolerance));
}

export function previewRoundDuctSeal(project: Project, values: RoundDuctSealInput) {
  const parsed = roundDuctSealInputSchema.safeParse(values);
  if (!parsed.success) return { issue: "Enter the joint circumference, measured seam lengths and usable coverage per tube." };
  const input = parsed.data;
  const stock = roundDuctTakeoff(project);
  const { reviews, stale, endSchedules } = stock;
  if (!reviews.length) return { issue: "Save at least one straight round metal duct run." };
  if (reviews.some(({ issues }) => issues.length) || stale.size || [...endSchedules.values()].some(({ issue }) => issue)
      || roundDuctElbowReviews(project).some(({ issues }) => issues.length))
    return { issue: "Resolve saved duct route, elbow and cut reviews before measuring the seams." };
  if (coincidentTips(reviews.flatMap(({ input }) => [input.start, input.end])))
    return { issue: "Two saved tips share a point. Resolve the shared joint before estimating sealant." };
  const longitudinal = reviews.reduce((total, { cuts }) =>
    total + (cuts ?? []).reduce((runTotal, cut) => runTotal + cut.length, 0), 0);
  const joints = reviews.reduce((total, run) => total + (run.jointCount ?? 0), 0);
  const jointSeams = joints * input.jointCircumference;
  const total = longitudinal + jointSeams + input.fittingSeams;
  if (input.reinforcedSeams > total + ductLengthTolerance)
    return { issue: "The measured mesh length exceeds all recorded duct seams." };
  const tubes = Math.max(1, Math.ceil((total - ductLengthTolerance) / input.coveragePerTube));
  return { layout: layoutSignature(project), input, joints, longitudinal, jointSeams, total, tubes };
}

export function saveRoundDuctSeal(project: Project, input: RoundDuctSealInput) {
  const plan = previewRoundDuctSeal(project, input);
  if (!plan.layout || plan.issue) throw Error(plan.issue ?? "Check the duct sealing plan first.");
  return projectSchema.parse({ ...project, guideFingerprint: null, roundDuctSeal: { input, layout: plan.layout } });
}

export function reviewRoundDuctSeal(project: Project) {
  const saved = project.roundDuctSeal;
  if (!saved) return null;
  const plan = previewRoundDuctSeal(project, saved.input);
  if (plan.issue || saved.layout === plan.layout) return plan;
  return { issue: "Duct geometry changed. Remeasure fitting seams and confirm trial coverage before ordering." };
}

export function roundDuctSealGuidance(project: Project) {
  const estimate = reviewRoundDuctSeal(project);
  if (!estimate) return [];
  if (estimate.issue || !estimate.input) return [estimate.issue ?? "Review the saved duct sealing measurements."];
  const { input, joints, longitudinal, total, jointSeams, tubes } = estimate;
  return [
    `${formatStockLength(longitudinal)} of pipe seams, ${joints} round joints at ${formatStockLength(input.jointCircumference)} each, and ${formatStockLength(input.fittingSeams)} of measured fitting or other seams.`,
    `Joint seams add ${formatStockLength(jointSeams)}. Total seam length is ${formatStockLength(total)}. At ${formatStockLength(input.coveragePerTube)} per tube, allow ${tubes} × ${roundDuctMastic.model}.`,
    ...(input.reinforcedSeams ? [`Measure and fit ${formatPreciseInches(input.reinforcedSeams)} of compatible mesh on the recorded wider seams.`] : []),
    roundDuctSealNote,
  ];
}
