import { dryerDuctRunLength, reviewDryerDuctLayout } from "./dryerDuctLayout";
import { floorRegisterReviews } from "./floorRegister";
import { formatStockLength } from "./measurement";
import { projectSchema, uid, type Project } from "./model";
import { partLabel } from "./partLabels";
import { ductLengthTolerance as tolerance, fitRoundDuctOffcut } from "./roundDuctEndFit";
import { requiredRoundDuctEnds, roundDuctMatingInstruction, roundDuctMatingSchedule, roundDuctRequiredTips } from "./roundDuctMating";
import { roundDuctSealNote, roundDuctStock } from "./roundDuctReference";
import { roundDuctInputSchema, roundDuctRecoveryKey, roundDuctSlotKey, type RoundDuctEnds, type RoundDuctInput, type RoundDuctOffcut } from "./roundDuctSchema";
import { ductRunSignature, reviewRoundDuctStock } from "./roundDuctStock";
import { prepareCollisionBox, solidOverlap } from "./solidCollision";

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
  return {
    ...project,
    roundDuctRuns: project.roundDuctRuns?.filter((record) => record.id !== id),
    ...(project.roundDuctOffcuts && { roundDuctOffcuts: project.roundDuctOffcuts.map((offcut) =>
      offcut.assignment?.runId === id ? withoutDuctReservation(offcut) : offcut) }),
    guideFingerprint: null,
  };
}

export const roundDuctReviews = (project: Project) => (project.roundDuctRuns ?? []).map((record) => ({
  ...record, ...previewRoundDuct(project, record.input, record.id),
}));

export function roundDuctTakeoff(project: Project) {
  const reviews = roundDuctReviews(project);
  const records = project.roundDuctOffcuts ?? [];
  const stock = reviewRoundDuctStock(reviews, records);
  const pending = new Set(records.flatMap(({ id, assignment }) =>
    assignment && stock.stale.has(id) ? [roundDuctSlotKey(assignment.runId, assignment.index)] : []));
  const requiredTips = roundDuctRequiredTips(project.roundDuctElbows ?? []);
  const endSchedules = new Map<string, ReturnType<typeof roundDuctMatingSchedule>>();
  const targets = reviews.flatMap((run) => {
    if (run.issues.length) return [];
    const signature = ductRunSignature(run.input);
    const cuts = run.cuts ?? [];
    const [startEnd, finishEnd] = requiredRoundDuctEnds(requiredTips, run.id);
    if (startEnd || finishEnd) endSchedules.set(run.id, roundDuctMatingSchedule(run, stock, [startEnd, finishEnd]));
    return cuts.map((cut, index) => ({
      run, cut, index, signature, key: roundDuctSlotKey(run.id, index), revisionKey: roundDuctRecoveryKey(run.id, index, signature),
      requiredEnds: [
        index === 0 ? startEnd : undefined,
        index === cuts.length - 1 ? finishEnd : undefined,
      ] as const,
    }));
  }).filter(({ key }) => !stock.credits.has(key) && !stock.assigned.has(key) && !pending.has(key));
  const usedTails = new Set(records.flatMap(({ source }) =>
    source ? [roundDuctRecoveryKey(source.runId, source.index, source.signature)] : []));
  const tails = targets.filter(({ cut, revisionKey }) => cut.tail > tolerance && !usedTails.has(revisionKey));
  return { reviews, ...stock, targets, tails, endSchedules };
}

function withDuctOffcuts(project: Project, records: RoundDuctOffcut[]): Project {
  return projectSchema.parse({ ...project, roundDuctOffcuts: records, guideFingerprint: null });
}

export function addRoundDuctOffcut(project: Project, input: { label: string; length: number; ends: RoundDuctEnds; tailKey?: string }) {
  const { label, length, ends, tailKey } = input;
  const tail = tailKey ? roundDuctTakeoff(project).tails.find(({ revisionKey }) => revisionKey === tailKey) : undefined;
  if (tailKey && !tail) throw Error("This planned duct tail changed or was already recorded. Recheck the cut list.");
  const maxLength = tail ? tail.run.input.stockLength - tail.cut.length : roundDuctStock.length;
  if (!Number.isFinite(length) || length <= 0 || length > maxLength + tolerance)
    throw Error("The usable length must fit within the original pipe after the recorded cut.");
  const source = tail && { runId: tail.run.id, index: tail.index, signature: tail.signature,
    cutLength: tail.cut.length, stockLength: tail.run.input.stockLength, name: tail.run.input.name };
  const name = label.trim() || (source ? `${source.name} · Pipe ${source.index + 1} tail` : "Measured round duct offcut");
  return withDuctOffcuts(project, [...(project.roundDuctOffcuts ?? []), {
    id: uid(), label: name.slice(0, 100), length: Math.min(length, maxLength), ends,
    ...(source && { source }),
  }]);
}

export function reserveRoundDuctOffcut(project: Project, id: string, key: string, ends: RoundDuctEnds) {
  const records = project.roundDuctOffcuts ?? [];
  const offcut = records.find((record) => record.id === id);
  if (!offcut || offcut.retired || offcut.assignment) throw Error("Choose an available duct offcut.");
  const takeoff = roundDuctTakeoff(project);
  const target = takeoff.targets.find(({ revisionKey }) => revisionKey === key);
  if (!target) throw Error("Choose an available pipe section from a clear duct run.");
  if (target.requiredEnds.some((form, index) => form && form !== ends[index]))
    throw Error("This reserved cut must use the mating end entered by the saved elbow.");
  if (!fitRoundDuctOffcut(offcut, target.cut.length, ends, target.run.input.cutLoss))
    throw Error("This offcut does not match the required length and mating ends with the entered cutting loss.");
  const assignment = { runId: target.run.id, index: target.index, signature: target.signature, ends };
  const reserved = withDuctOffcuts(project, records.map((record) => record.id === id ? { ...record, assignment } : record));
  const issue = takeoff.endSchedules.has(target.run.id)
    ? roundDuctTakeoff(reserved).endSchedules.get(target.run.id)?.issue : undefined;
  if (issue) throw Error(issue);
  return reserved;
}

function withoutDuctReservation(offcut: RoundDuctOffcut) {
  const { assignment: _assignment, ...free } = offcut;
  return free;
}

export function releaseRoundDuctOffcut(project: Project, id: string) {
  return withDuctOffcuts(project, (project.roundDuctOffcuts ?? []).map((offcut) => offcut.id === id ? withoutDuctReservation(offcut) : offcut));
}

export function recordRoundDuctOffcutUse(project: Project, id: string, measured?: { length: number; label: string }) {
  const records = project.roundDuctOffcuts ?? [];
  const offcut = records.find((record) => record.id === id);
  const assignment = offcut?.assignment;
  if (!offcut || !assignment) throw Error("Choose a reserved duct offcut.");
  const { assigned, reviews, endSchedules } = roundDuctTakeoff(project);
  const fit = assigned.get(roundDuctSlotKey(assignment.runId, assignment.index));
  const run = reviews.find((review) => review.id === assignment.runId);
  const cut = run?.cuts?.[assignment.index];
  if (fit?.offcut.id !== id || !run || !cut)
    throw Error("Recheck the receiving cut and mating ends before recording use.");
  const issue = endSchedules.get(run.id)?.issue;
  if (issue) throw Error(issue);
  const remnant = fit.fit.remnant;
  if (measured && (!remnant || !Number.isFinite(measured.length) || measured.length <= 0 ||
      measured.length > remnant.length + tolerance))
    throw Error("The measured remnant must fit within the unused stock after cutting loss.");
  const next: RoundDuctOffcut[] = records.map((record) => record.id === id ? {
    ...withoutDuctReservation(record), retired: true,
    used: { ...assignment, name: run.input.name, cutLength: cut.length, cutLoss: run.input.cutLoss },
  } : record);
  if (measured && remnant) next.push({
    id: uid(), label: (measured.label.trim() || `Trim from ${offcut.label}`).slice(0, 100),
    length: Math.min(measured.length, remnant.length), ends: remnant.ends, trimmedFrom: id,
  });
  return withDuctOffcuts(project, next);
}

export function removeRoundDuctOffcut(project: Project, id: string) {
  if (project.roundDuctOffcuts?.find((offcut) => offcut.id === id)?.assignment)
    throw Error("Release the reservation before removing this offcut from stock.");
  return withDuctOffcuts(project, (project.roundDuctOffcuts ?? []).flatMap((offcut) => {
    if (offcut.id !== id) return [offcut];
    return offcut.source || offcut.trimmedFrom || offcut.used
      ? [{ ...withoutDuctReservation(offcut), retired: true as const }] : [];
  }));
}

export const availableRoundDuctOffcuts = (project: Project) => (project.roundDuctOffcuts ?? [])
  .filter(({ retired, assignment }) => !retired && !assignment);

export function roundDuctPurchaseCount(project: Project) {
  const { reviews, stale, targets, endSchedules } = roundDuctTakeoff(project);
  return reviews.some(({ issues }) => issues.length) || stale.size || [...endSchedules.values()].some(({ issue }) => issue)
    ? null : targets.length;
}

export function roundDuctGuideLines(project: Project) {
  const { reviews, stale, credits, completedUses, assigned, targets, endSchedules } = roundDuctTakeoff(project);
  const clean = (label: string) => label.replace(/[\r\n]+/g, " ");
  const records = project.roundDuctOffcuts ?? [];
  const routes = reviews.flatMap(({ id, input, geometry, issues, cuts, jointCount }) => {
    const name = clean(input.name);
    if (issues.length || !geometry || !cuts) return [`${name} · Recheck the run. ${issues.join(" ")}`];
    const schedule = endSchedules.get(id);
    if (schedule?.issue) return [`${name} · Recheck the cut list. ${schedule.issue}`];
    const point = (value: typeof input.start) => value.map(formatStockLength).join(" / ");
    return [
      `${name} · ${formatStockLength(geometry.length)} between collar tips. X/Y/Z ${point(input.start)} to ${point(input.end)}.`,
      `Stock · ${stale.size ? "Recheck reserved offcuts before buying." : `${targets.filter(({ run }) => run.id === id).length} × ${roundDuctStock.model} to buy.`} Cut lengths include collar engagement and ${formatStockLength(input.jointOverlap)} at each internal joint.`,
      ...cuts.map(({ length, whole, tail }, index) => {
        const key = roundDuctSlotKey(id, index);
        const reservation = assigned.get(key);
        const completed = completedUses.get(key);
        const recorded = `Pipe ${index + 1} ·`;
        const mating = schedule?.cuts[index];
        const finish = mating ? ` ${roundDuctMatingInstruction(mating)}` : "";
        if (completed) {
          const { offcut, fit } = completed;
          return `${recorded} Already supplied by measured offcut ${clean(offcut.label)} at ${formatStockLength(length)}.${fit.reversed ? " Reversed its recorded ends." : ""}${fit.trim ? ` Trimmed at the ${fit.trim} of the installed section.` : ""}${finish}`;
        }
        if (credits.has(key)) return `${recorded} Already cut to ${formatStockLength(length)}. Its measured tail is in the Cut pool history.${finish}`;
        if (reservation) {
          const { offcut, fit } = reservation;
          return `${recorded} Use measured offcut ${clean(offcut.label)} at ${formatStockLength(length)}.${fit.reversed ? " Reverse its recorded ends." : ""}${fit.trim ? ` Trim at the ${fit.trim} of the installed section.` : ""}${fit.remnant ? ` Estimated remnant ${formatStockLength(fit.remnant.length)} with ${fit.remnant.ends.join(" / ")} ends. Measure it after trimming.` : ""}${finish}`;
        }
        const needsReview = records.find((offcut) => offcut.assignment?.runId === id &&
          offcut.assignment.index === index && stale.has(offcut.id));
        if (needsReview) return `${recorded} Recheck reserved offcut ${clean(needsReview.label)}.`;
        return `${recorded} ${whole ? "Keep whole" : "Cut to"} ${formatStockLength(length)}.${finish}${tail > tolerance ? ` Estimated tail ${formatStockLength(tail)}. Keep an intact piece for a crimp or sealant trial.` : ""}`;
      }),
      `Seal ${jointCount} round joints, including the two collars. ${roundDuctSealNote}`,
    ];
  });
  const inventory = records.map((offcut) => {
    const parent = records.find(({ id }) => id === offcut.trimmedFrom);
    const from = offcut.source ? ` Recovered from ${clean(offcut.source.name)} · Pipe ${offcut.source.index + 1}.` :
      parent ? ` Trimmed from ${clean(parent.label)}.` : "";
    const status = offcut.used ? `Used for ${clean(offcut.used.name)} · Pipe ${offcut.used.index + 1}.` :
      offcut.retired ? "Retired from available stock." : stale.has(offcut.id) ? "Review reservation." :
      offcut.assignment ? "Reserved for a pipe section." : "Available in the Cut pool.";
    return `Cut pool · ${clean(offcut.label)} · ${formatStockLength(offcut.length)} · ${offcut.ends.join(" / ")} ends.${from} ${status}`;
  });
  return [...routes, ...inventory];
}
