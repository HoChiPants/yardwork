import { dryerDuctRunLength, reviewDryerDuctLayout } from "./dryerDuctLayout";
import { floorRegisterReviews } from "./floorRegister";
import { formatStockLength } from "./measurement";
import { projectSchema, uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { roundDuctSealNote, roundDuctStock } from "./roundDuctReference";
import { roundDuctInputSchema, type RoundDuctInput } from "./roundDuctSchema";
import { prepareCollisionBox, solidOverlap } from "./solidCollision";

const tolerance = 1e-7;
const maxStockUnits = 128;

function runEnvelope(input: RoundDuctInput) {
  return { envelopeWidth: input.envelopeWidth, runs: [{ start: input.start, end: input.end }] };
}

function previewCuts(input: RoundDuctInput, span: number) {
  const { stockLength, startEngagement, endEngagement, jointOverlap, cutLoss } = input;
  const lapFree = stockLength - jointOverlap;
  if (lapFree <= tolerance || cutLoss >= stockLength) throw Error("The pipe overlap and cutting loss must each fit within one stock piece.");
  const required = span + startEngagement + endEngagement;
  const count = Math.max(1, Math.ceil((required - jointOverlap - tolerance) / lapFree));
  if (count > maxStockUnits) throw Error("Split the layout into shorter measured straight runs.");
  if (count > 1 && jointOverlap <= tolerance) throw Error("Enter the measured pipe-to-pipe overlap for this multi-piece run.");
  const total = required + (count - 1) * jointOverlap;
  const coveredEnds = Array.from({ length: count }, (_, i) =>
    (i === 0 ? startEngagement : jointOverlap) + (i === count - 1 ? endEngagement : jointOverlap));
  if (coveredEnds.some((value) => value >= stockLength - tolerance)) throw Error("A stock section needs exposed length beyond its two engaged ends.");
  const lengths = Array.from({ length: count }, (_, i) => i === count - 1 ? total - i * stockLength : stockLength);
  const last = count - 1;
  if (last > 0 && lengths[last] <= coveredEnds[last] + tolerance) {
    const shared = (lengths[last - 1] + lengths[last] - coveredEnds[last - 1] - coveredEnds[last]) / 2;
    if (shared <= tolerance || coveredEnds[last] + shared > stockLength) throw Error("Review the collar engagements and move the last pipe joint.");
    lengths[last] = coveredEnds[last] + shared;
    lengths[last - 1] = coveredEnds[last - 1] + shared;
  }
  return lengths.map((length) => ({ length,
    whole: Math.abs(length - stockLength) <= tolerance,
    tail: Math.max(0, stockLength - length - cutLoss),
  }));
}

export function previewRoundDuct(project: Project, values: RoundDuctInput, editingId?: string) {
  const parsed = roundDuctInputSchema.safeParse(values);
  if (!parsed.success) return { issues: ["Enter both collar tips, a clearance envelope and the measured stock and joint allowances."] };
  const input = parsed.data;
  const span = dryerDuctRunLength(input);
  if (span <= tolerance) return { issues: ["Choose two different collar tips."] };
  const [geometry] = reviewDryerDuctLayout(project, runEnvelope(input));
  const issues: string[] = [];
  if (geometry.hits.length) issues.push(`Envelope crosses ${geometry.hits.map(({ id, name }) => `${partLabel(project, id)} · ${name}`).join(", ")}.`);
  if (geometry.unreviewed.length) issues.push("Review unresolved modeled shapes along this route.");
  const box = prepareCollisionBox(geometry.size, geometry.center, geometry.rotation);
  for (const { layout } of floorRegisterReviews(project)) {
    if (!layout) continue;
    const { envelope, panel } = layout;
    if (solidOverlap(box, prepareCollisionBox(envelope.size, envelope.position, envelope.rotation), tolerance))
      issues.push(`Envelope crosses the register boot at ${partLabel(project, panel.id)}.`);
  }
  const others = (project.roundDuctRuns ?? []).filter(({ id, input: other }) => id !== editingId && dryerDuctRunLength(other) > tolerance);
  for (const { input: other } of others) {
    const [envelope] = reviewDryerDuctLayout({ pieces: [] }, runEnvelope(other));
    if (solidOverlap(box, prepareCollisionBox(envelope.size, envelope.center, envelope.rotation), tolerance))
      issues.push(`Envelope crosses the saved run “${other.name}”.`);
  }
  try {
    const cuts = previewCuts(input, span);
    return { geometry, issues, cuts, jointCount: cuts.length + 1 };
  } catch (problem) {
    return { geometry, issues: [...issues, problem instanceof Error ? problem.message : "Review the pipe lengths."] };
  }
}

export function saveRoundDuct(project: Project, input: RoundDuctInput, id?: string): Project {
  const records = project.roundDuctRuns ?? [];
  if (id && !records.some((record) => record.id === id)) throw Error("This saved run changed. Reopen it.");
  const preview = previewRoundDuct(project, input, id);
  if (preview.issues.length || !preview.cuts) throw Error(preview.issues[0] ?? "Preview the measured run first.");
  return projectSchema.parse({ ...project,
    roundDuctRuns: [...records.filter((record) => record.id !== id), { id: id ?? uid(), input }],
    guideFingerprint: null,
  });
}

export function removeRoundDuct(project: Project, id: string): Project {
  return { ...project, roundDuctRuns: project.roundDuctRuns?.filter((record) => record.id !== id), guideFingerprint: null };
}

export const roundDuctReviews = (project: Project) => (project.roundDuctRuns ?? []).map((record) => ({
  ...record, ...previewRoundDuct(project, record.input, record.id),
}));

export function roundDuctPurchaseCount(project: Project) {
  const reviews = roundDuctReviews(project);
  return reviews.some(({ issues }) => issues.length) ? null : reviews.reduce((total, { cuts }) => total + (cuts?.length ?? 0), 0);
}

export function roundDuctGuideLines(project: Project) {
  return roundDuctReviews(project).flatMap(({ input, geometry, issues, cuts, jointCount }) => {
    const name = input.name.replace(/[\r\n]+/g, " ");
    if (issues.length || !geometry || !cuts) return [`${name} · Recheck the run. ${issues.join(" ")}`];
    const point = (value: typeof input.start) => value.map(formatStockLength).join(" / ");
    return [
      `${name} · ${formatStockLength(geometry.length)} between collar tips. X/Y/Z ${point(input.start)} to ${point(input.end)}.`,
      `Stock · ${cuts.length} × ${roundDuctStock.model}. Cut lengths include collar engagement and ${formatStockLength(input.jointOverlap)} at each internal joint.`,
      ...cuts.map(({ length, whole, tail }, index) => `Pipe ${index + 1} · ${whole ? "Keep whole" : "Cut to"} ${formatStockLength(length)}.${tail > tolerance ? ` Estimated tail ${formatStockLength(tail)}. Keep an intact piece for a crimp or sealant trial.` : ""}`),
      `Seal ${jointCount} round joints, including the two collars. ${roundDuctSealNote}`,
    ];
  });
}
