import { Vector3 } from "three";
import { formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import { partLabel } from "./partLabels";
import { reviewShingleRoofPlane } from "./shingleRoof";
import { packRuns } from "./stockRunPacking";
import { weatherWatch } from "./roofValleyReference";
import {
  roofValleyInputSchema, roofValleysSchema, valleyKey,
  type RoofValley, type RoofValleyInput,
} from "./roofValleySchema";

const epsilon = 1e-6;
const deckJointAllowance = 0.125;
const measuredAllowance = 0.5;
const asPoint = (point: Vector3) => point.toArray() as V3;
const rounded = (value: number) => Math.round(value * 1e5) / 1e5;
const asSignaturePoint = (point: V3) => point.map(rounded);
const countLabels = (label: string) => label.trim().toLowerCase();

type Edge = { start: Vector3; end: Vector3; axis: Vector3; inward: Vector3 };
type Segment = { panels: readonly [string, string]; start: Vector3; end: Vector3; axis: Vector3 };
export type ModeledValley = {
  id: string;
  panels: string[];
  start: V3;
  end: V3;
  length: number;
  issue?: string;
  signature: string;
};

/** Only edges where the deck rises into the panel can drain toward a valley. */
function drainingEdges(outline: V3[]): Edge[] {
  const points = outline.map((point) => new Vector3(...point));
  const center = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length);
  return points.flatMap((start, index) => {
    const end = points[(index + 1) % points.length];
    if (start.distanceToSquared(end) <= epsilon * epsilon) return [];
    const axis = end.clone().sub(start).normalize();
    const inward = center.clone().sub(start);
    inward.addScaledVector(axis, -inward.dot(axis)).normalize();
    return inward.y > epsilon ? [{ start, end, axis, inward }] : [];
  });
}

function onLine(point: Vector3, origin: Vector3, axis: Vector3) {
  const difference = point.clone().sub(origin);
  return difference.addScaledVector(axis, -difference.dot(axis)).length() <= deckJointAllowance + epsilon;
}

function matchingEdge(first: Edge, second: Edge, panels: Segment["panels"]): Segment | null {
  const axis = first.axis.clone();
  if (axis.y < 0) axis.negate();
  if (axis.y <= epsilon || Math.abs(axis.dot(second.axis)) < 1 - epsilon) return null;
  const side = (edge: Edge) => axis.x * edge.inward.z - axis.z * edge.inward.x;
  if (side(first) * side(second) >= -epsilon) return null;
  if (![second.start, second.end].every((point) => onLine(point, first.start, axis))) return null;
  const project = (point: Vector3) => point.clone().sub(first.start).dot(axis);
  const [a, b] = [0, project(first.end)].sort((x, y) => x - y);
  const [c, d] = [project(second.start), project(second.end)].sort((x, y) => x - y);
  const low = Math.max(a, c), high = Math.min(b, d);
  if (high - low <= deckJointAllowance) return null;
  const gap = second.start.clone().sub(first.start);
  gap.addScaledVector(axis, -gap.dot(axis)).multiplyScalar(0.5);
  return { panels, axis,
    start: first.start.clone().addScaledVector(axis, low).add(gap),
    end: first.start.clone().addScaledVector(axis, high).add(gap),
  };
}

function collectValleys(segments: Segment[]): ModeledValley[] {
  const groups: Segment[][] = [];
  for (const segment of segments) {
    const line = groups.find(([first]) => segment.axis.dot(first.axis) > 1 - epsilon &&
      [segment.start, segment.end].every((point) => onLine(point, first.start, first.axis)));
    if (line) line.push(segment);
    else groups.push([segment]);
  }
  return groups.map((group) => {
    const [{ start: origin, axis }] = group;
    const locate = (point: Vector3) => point.clone().sub(origin).dot(axis);
    const ordered = group.map((segment) => ({ segment, from: locate(segment.start), to: locate(segment.end) }))
      .sort((first, second) => first.from - second.from);
    const [first] = ordered;
    let end = first;
    let issue: string | undefined;
    for (const next of ordered.slice(1)) {
      const gap = next.from - end.to;
      if (gap > deckJointAllowance + epsilon)
        issue ??= "Collinear deck portions have a gap. Review the modeled continuity before lining this valley.";
      if (gap < -deckJointAllowance - epsilon)
        issue ??= "Deck edges overlap along the same valley. Review duplicate or overlapping panels.";
      if (next.to > end.to) end = next;
    }
    const panels = [...new Set(ordered.flatMap(({ segment }) => segment.panels))].sort();
    const start = asPoint(first.segment.start);
    const finish = asPoint(end.segment.end);
    const signature = JSON.stringify(ordered.map(({ segment }) => [
      [...segment.panels].sort(), asSignaturePoint(asPoint(segment.start)), asSignaturePoint(asPoint(segment.end)),
    ]));
    return { id: valleyKey(panels), panels, start, end: finish, length: end.to - first.from, issue, signature };
  });
}

export function modeledRoofValleys(project: Project) {
  const roof = project.projectCode?.trades.includes("roofing") && project.projectCode.shingleRoof;
  if (!roof) return [];
  const decking = roof.planes.flatMap((plane) => {
    if (plane.basis.kind !== "panel") return [];
    const result = reviewShingleRoofPlane(project, plane);
    if (!result.pieceId || result.pitch === null || result.pitch < 2 - epsilon || result.faces.length !== 1)
      return [];
    return [{ id: result.pieceId, edges: drainingEdges(result.faces[0].points) }];
  }).sort((first, second) => first.id.localeCompare(second.id));
  return collectValleys(decking.flatMap((first, index) =>
    decking.slice(index + 1).flatMap((second) =>
      first.edges.flatMap((a) => second.edges.flatMap((b) => {
        const segment = matchingEdge(a, b, [first.id, second.id]);
        return segment ? [segment] : [];
      })))));
}

type Strip = { id: string; name: string; length: number; from: number; cover: number };
type ValleyRow = { plan: RoofValley; valley?: ModeledValley; issue?: string; strips: Strip[] };

function reviewFit(candidate: ModeledValley | undefined, input: RoofValleyInput) {
  if (!candidate) return "The roof panels no longer form the saved sloped valley. Review the retained roof deck.";
  if (candidate.issue) return candidate.issue;
  if (Math.abs(input.length - candidate.length) > measuredAllowance + epsilon)
    return `The measured run differs from the modeled ${formatStockLength(candidate.length)} centerline by over ½ in. Verify both endpoints and update the model.`;
  return undefined;
}

function balancedStripLengths(total: number, count: number) {
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => each + Number(index < total % count));
}

function cutStrips(input: RoofValleyInput): Strip[] {
  const coverage = input.length + input.peakExtra;
  // Use sixteenths so marking and splitting never round coverage down.
  const lap = Math.ceil(input.lap * 16 - epsilon);
  const coverageTicks = Math.ceil(coverage * 16 - epsilon);
  const maximum = weatherWatch.maxCut * 16;
  const minimum = weatherWatch.minCut * 16;
  const count = Math.max(1, Math.ceil((coverageTicks - lap) / (maximum - lap)));
  const total = coverageTicks + (count - 1) * lap;
  let lengths = balancedStripLengths(total, count);
  if (input.offcut && count > 1) {
    const available = Math.floor(input.offcut.length * 16 + epsilon);
    // Find how many whole strips the measured scrap could supply while
    // leaving the rest between the same minimum and maximum handling lengths.
    for (let fromScrap = count - 1; fromScrap > 0; fromScrap--) {
      const fromRoll = count - fromScrap;
      const needed = Math.max(fromScrap * minimum, total - fromRoll * maximum);
      if (needed > available) continue;
      const shortest = lengths.slice(-fromScrap).reduce((sum, length) => sum + length, 0);
      if (shortest > available) {
        const credit = Math.min(available, fromScrap * maximum, total - fromRoll * minimum);
        lengths = [...balancedStripLengths(credit, fromScrap), ...balancedStripLengths(total - credit, fromRoll)];
      }
      break;
    }
  }
  let offset = 0;
  return lengths.map((amount, index) => {
    const strip = {
      id: valleyKey(input.panels) + "/" + index,
      name: `${input.label} · strip ${index + 1}`,
      from: offset / 16,
      length: Math.max(minimum, amount) / 16,
      cover: amount / 16,
    };
    offset += amount - lap;
    return strip;
  });
}

export function reviewRoofValleys(project: Project, modeled = project.roofValleys?.length ? modeledRoofValleys(project) : []) {
  const candidates = new Map(modeled.map((row) => [row.id, row]));
  const labels = new Map<string, number>();
  for (const { input: { offcut } } of project.roofValleys ?? []) {
    if (offcut) labels.set(countLabels(offcut.label), (labels.get(countLabels(offcut.label)) ?? 0) + 1);
  }
  const rows: ValleyRow[] = (project.roofValleys ?? []).map((plan) => {
    const { input } = plan;
    const valley = candidates.get(valleyKey(input.panels));
    const issue = reviewFit(valley, input) ??
      (valley?.signature !== plan.signature ? "The retained valley edges changed. Recheck the seam and enter the measured length again." :
        input.offcut && (labels.get(countLabels(input.offcut.label)) ?? 0) > 1 ? "This measured offcut is assigned to two valleys." : undefined);
    return { plan, valley, issue, strips: issue ? [] : cutStrips(input) };
  });
  const scraps: { label: string; strips: Strip[]; left: number }[] = [];
  const unused: string[] = [];
  const cuts = rows.flatMap(({ plan: { input }, strips }) => {
    if (!input.offcut || !strips.length) return strips;
    let left = input.offcut.length;
    const taken: Strip[] = [];
    const outstanding = [...strips].sort((a, b) => a.length - b.length).filter((strip) => {
      if (strip.length > left + epsilon) return true;
      taken.push(strip);
      left -= strip.length;
      return false;
    });
    if (taken.length) scraps.push({ label: input.offcut.label, strips: taken, left: Math.max(0, left) });
    else unused.push(input.offcut.label);
    return outstanding;
  });
  const { bins: rolls } = packRuns(cuts, weatherWatch.length);
  return { rows, rolls, scraps, unused, needsReview: rows.some(({ issue }) => !!issue) };
}

export function saveRoofValley(project: Project, measurements: RoofValleyInput) {
  const input = roofValleyInputSchema.parse(measurements);
  const key = valleyKey(input.panels);
  const modeled = modeledRoofValleys(project);
  const valley = modeled.find(({ id }) => id === key);
  const issue = reviewFit(valley, input);
  if (!valley || issue) throw Error(issue ?? "Review the modeled valley.");
  const next = {
    ...project,
    roofValleys: roofValleysSchema.parse([
      ...(project.roofValleys ?? []).filter((item) => valleyKey(item.input.panels) !== key),
      { input, signature: valley.signature },
    ]),
  };
  const saved = reviewRoofValleys(next, modeled).rows.find(({ plan }) => valleyKey(plan.input.panels) === key);
  if (saved?.issue) throw Error(saved.issue);
  return next;
}

export function removeRoofValley(project: Project, key: string) {
  const remaining = (project.roofValleys ?? []).filter(({ input }) => valleyKey(input.panels) !== key);
  if (remaining.length) return { ...project, roofValleys: remaining };
  const { roofValleys: _removed, ...rest } = project;
  return rest;
}

export function roofValleyGuideLines(project: Project, review = reviewRoofValleys(project)) {
  if (!review.rows.length) return [];
  return [
    ...review.rows.flatMap(({ plan: { input }, valley, issue, strips }) => [
      `${input.label} · ${formatStockLength(input.length)} measured centerline · extend ${formatStockLength(input.peakExtra)} past the peak · at least ${formatStockLength(input.lap)} end lap.`,
      ...(issue ? [`Needs review. ${issue}`] : [
        `Related roof deck ${valley?.panels.map((id) => partLabel(project, id)).join(", ")}. Center the full-width liner on sound dry decking, beginning flush at the eave drip edge and working uphill beneath the roof covering. Follow GAF’s application instructions for bonding the laps.`,
        ...strips.map(({ name, length, from, cover }) =>
          `${name} · cut ${formatStockLength(length)}, start ${formatStockLength(from)} up from the eave${length > cover ? `. Trim to ${formatStockLength(cover)} for the measured finish` : ""}.`),
      ]),
    ]),
    ...review.scraps.map(({ label, strips, left }) =>
      `Offcut ${label} · ${strips.map(({ name, length }) => `${name} ${formatStockLength(length)}`).join(" + ")}. ${formatStockLength(left)} left with intact backing.`),
    ...review.rolls.map(({ runs, left }, index) =>
      `New roll ${index + 1} · ${runs.map(({ name, length }) => `${name} ${formatStockLength(length)}`).join(" + ")}. ${formatStockLength(left)} left. Keep clean full-width remnants with the release film attached.`),
    ...review.unused.map((label) => `Keep offcut ${label} for another run. It cannot fill a scheduled strip here.`),
  ];
}
