import { Euler, Matrix4, Vector3 } from "three";
import { reviewDryerDuctLayout } from "./dryerDuctLayout";
import { floorRegisterReviews } from "./floorRegister";
import { projectSchema, uid, type Project, type V3 } from "./model";
import { formatStockLength } from "./measurement";
import { partLabel } from "./partLabels";
import { roundDuctTakeoff } from "./roundDuct";
import { ductTipKey, requiredElbowPipeEnd, roundDuctElbowInputSchema, type RoundDuctElbowInput, type RoundDuctTip } from "./roundDuctElbowSchema";
import { requiredRoundDuctEnds, roundDuctMatingSchedule, roundDuctRequiredTips } from "./roundDuctMating";
import { roundDuctElbowStock } from "./roundDuctReference";
import { roundDuctSlotKey } from "./roundDuctSchema";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";

const fitTolerance = 0.125;
const angleTolerance = Math.sin(Math.PI / 720);
type Runs = NonNullable<Project["roundDuctRuns"]>;

function elbowGeometry(runs: Runs, input: RoundDuctElbowInput) {
  function locate({ runId, tip }: RoundDuctTip, setback: number) {
    const run = runs.find(({ id }) => id === runId);
    if (!run) return null;
    const point = new Vector3(...run.input[tip]);
    const direction = point.clone().sub(new Vector3(...run.input[tip === "start" ? "end" : "start"])).normalize();
    return { point, direction, corner: point.clone().addScaledVector(direction, setback), run };
  }
  const first = locate(input.first, input.firstSetback);
  const second = locate(input.second, input.secondSetback);
  if (!first || !second || first.run.id === second.run.id) return { first, second, issues: ["Choose ends from two different saved duct runs."] };
  const x = first.direction;
  const y = second.direction;
  const dot = x.dot(y);
  if (!x.lengthSq() || !y.lengthSq() || Math.abs(dot) > angleTolerance)
    return { first, second, issues: ["The pipe axes must meet at a right angle for this measured elbow."] };
  const cornerGap = first.corner.distanceTo(second.corner);
  if (cornerGap > fitTolerance) return { first, second,
    issues: [`The two measured setbacks miss the same turn by ${formatStockLength(cornerGap)}. Recheck setbacks, alignment and end choice.`],
  };
  const corner = first.corner.clone().lerp(second.corner, 0.5);
  const normal = x.clone().cross(y).normalize();
  const secondAxis = normal.clone().cross(x).normalize();
  const half = input.envelopeWidth / 2;
  const center = corner.clone().addScaledVector(x, (half - input.firstSetback) / 2)
    .addScaledVector(secondAxis, (half - input.secondSetback) / 2);
  const rotation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, secondAxis, normal));
  const approaches = reviewDryerDuctLayout({ pieces: [] }, {
    envelopeWidth: 6, runs: [first.run.input, second.run.input],
  });
  const geometry = {
    center: center.toArray(),
    rotation: [rotation.x, rotation.y, rotation.z] as V3,
    size: [input.firstSetback + half, input.secondSetback + half, input.envelopeWidth] as V3,
    points: [first.point.toArray(), corner.toArray(), second.point.toArray()],
    cornerGap,
    approaches,
  };
  return { first, second, geometry, issues: [] as string[] };
}

export function previewRoundDuctElbow(project: Project, values: RoundDuctElbowInput, id?: string, stock = roundDuctTakeoff(project)) {
  const parsed = roundDuctElbowInputSchema.safeParse(values);
  if (!parsed.success) return { issues: ["Choose the pipe ends, measured setbacks, clearance width and elbow crimp."] };
  const input = parsed.data;
  const runs = project.roundDuctRuns ?? [];
  const { geometry, first, second, issues } = elbowGeometry(runs, input);
  if (!geometry || !first || !second) return { issues };
  const endLabels = [first.run.input.name, second.run.input.name];
  const required = [requiredElbowPipeEnd(input, "first"), requiredElbowPipeEnd(input, "second")];
  const proposedTips = roundDuctRequiredTips([...(project.roundDuctElbows ?? []).filter((elbow) => elbow.id !== id), { input }]);
  const tips = [input.first, input.second];
  for (const [index, tip] of tips.entries()) {
    const review = stock.reviews.find(({ id }) => id === tip.runId);
    if (review?.issues.length || !review?.cuts?.length) {
      issues.push(`Review the straight route at ${endLabels[index]}.`);
      continue;
    }
    const slot = roundDuctSlotKey(tip.runId, tip.tip === "start" ? 0 : review.cuts.length - 1);
    const fitted = stock.assigned.get(slot) ?? stock.completedUses.get(slot);
    const recordedEnd = (fitted?.offcut.assignment ?? fitted?.offcut.used)?.ends[tip.tip === "start" ? 0 : 1];
    if (recordedEnd && recordedEnd !== required[index]) issues.push(
      `${endLabels[index]} needs a ${required[index]} pipe end at the elbow. Review the duct offcut in the Cut pool.`,
    );
    else {
      const { issue } = roundDuctMatingSchedule(review, stock, requiredRoundDuctEnds(proposedTips, tip.runId));
      if (issue) issues.push(`${endLabels[index]} · ${issue}`);
    }
  }
  const box = prepareCollisionBox(geometry.size, geometry.center, geometry.rotation);
  const zone = project.workZone;
  if (zone && (box.bounds.min[0] < -zone.width / 2 - 1e-7 || box.bounds.max[0] > zone.width / 2 + 1e-7 ||
      box.bounds.min[2] < -zone.depth / 2 - 1e-7 || box.bounds.max[2] > zone.depth / 2 + 1e-7 ||
      box.bounds.min[1] < -1e-7 || box.bounds.max[1] > zone.height + 1e-7))
    issues.push("The elbow clearance extends outside the work zone.");
  for (const piece of project.pieces) {
    if (piece.offcut) continue;
    try {
      const shape = prepareCollisionSolid(piece) ?? prepareCollisionBox(piece.size, piece.position, piece.rotation);
      if (solidOverlap(box, shape, 1e-7)) issues.push(`Elbow clearance crosses ${partLabel(project, piece.id)} · ${piece.name}.`);
    } catch {
      issues.push(`Review the unresolved shape of ${partLabel(project, piece.id)} before fitting the elbow.`);
    }
  }
  for (const { layout } of floorRegisterReviews(project)) {
    if (layout && solidOverlap(box, prepareCollisionBox(layout.envelope.size, layout.envelope.position, layout.envelope.rotation), 1e-7))
      issues.push(`Elbow clearance crosses the register boot at ${partLabel(project, layout.panel.id)}.`);
  }
  const joined = new Set(tips.map(({ runId }) => runId));
  for (const run of runs) {
    if (joined.has(run.id)) continue;
    const [pipe] = reviewDryerDuctLayout({ pieces: [] }, { runs: [run.input], envelopeWidth: run.input.envelopeWidth });
    if (pipe.length && solidOverlap(box, prepareCollisionBox(pipe.size, pipe.center, pipe.rotation), 1e-7))
      issues.push(`Elbow clearance crosses the saved run “${run.input.name}”.`);
  }
  const keys = new Set(tips.map(ductTipKey));
  for (const other of project.roundDuctElbows ?? []) {
    if (other.id === id) continue;
    if ([other.input.first, other.input.second].some((tip) => keys.has(ductTipKey(tip)))) {
      issues.push("A saved elbow already uses one of these pipe tips.");
      continue;
    }
    const otherGeometry = elbowGeometry(runs, other.input).geometry;
    if (otherGeometry && solidOverlap(box, prepareCollisionBox(otherGeometry.size, otherGeometry.center, otherGeometry.rotation), 1e-7))
      issues.push("The modeled clearance crosses another saved elbow.");
  }
  return { geometry, endLabels, required, issues };
}

export function saveRoundDuctElbow(project: Project, input: RoundDuctElbowInput, id?: string) {
  const previous = project.roundDuctElbows ?? [];
  if (id && !previous.some((item) => item.id === id)) throw Error("The elbow changed. Reopen it for review.");
  const review = previewRoundDuctElbow(project, input, id);
  if (review.issues.length || !review.geometry) throw Error(review.issues[0] ?? "Check both elbow ends.");
  return projectSchema.parse({ ...project, guideFingerprint: null,
    roundDuctElbows: [...previous.filter((item) => item.id !== id), { id: id ?? uid(), input }],
  });
}

export function roundDuctElbowReviews(project: Project) {
  if (!project.roundDuctElbows?.length) return [];
  const stock = roundDuctTakeoff(project);
  return project.roundDuctElbows.map(({ id, input }) => ({ id, input, ...previewRoundDuctElbow(project, input, id, stock) }));
}

export function roundDuctElbowCount(project: Project) {
  const reviews = roundDuctElbowReviews(project);
  return reviews.some(({ issues }) => issues.length) ? null : reviews.length;
}

export function roundDuctElbowGuideLines(project: Project) {
  const clean = (name: string) => name.replace(/[\r\n]+/g, " ");
  return roundDuctElbowReviews(project).map(({ input, endLabels, required, issues }) => {
    if (issues.length || !endLabels || !required) return `Review measured 90° elbow. ${issues.join(" ")}`;
    return `${roundDuctElbowStock.model} · ${clean(endLabels[0])} (${input.first.tip}) needs a ${required[0]} pipe end. ${clean(endLabels[1])} (${input.second.tip}) needs a ${required[1]} pipe end. Setbacks ${formatStockLength(input.firstSetback)} / ${formatStockLength(input.secondSetback)}. Support the elbow and seal its seams and both connections.`;
  });
}
