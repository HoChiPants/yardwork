import { drywallScrews, drywallScrewScope, drywallScrewTool, isDrywall } from "./drywallReference";
import { bounds } from "./engine";
import { formatPreciseInches } from "./measurement";
import { material, type Piece, type Project, type Section, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionSolid, solidContainsSegment, solidSegmentRanges } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";
import { isPressureTreated } from "./treatedWood";
import { drywallFaceCutBounds, wallDrywallFit } from "./wallDrywall";

type Span = [number, number];
type Area = [Span, Span];
type Mark = { x: number; y: number; supportId: string; clear: boolean };
type SheetReview = { sheet: Piece; cuts: Area[]; marks: Mark[]; backingIssue?: string };
const epsilon = 1e-6;
const edge = drywallScrews.edge;
const clearance = 0.125;
const woodInset = clearance + 0.001;
const unit: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const within = (value: number, [a, b]: Span) => value >= a - epsilon && value <= b + epsilon;
const pad = ([a, b]: Span, amount: number): Span => [a - amount, b + amount];
const middle = ([a, b]: Span) => (a + b) / 2;
const intersect = ([a, b]: Span, [c, d]: Span): Span => [Math.max(a, c), Math.min(b, d)];
const valid = ([a, b]: Span) => b >= a - epsilon;
const clamp = (value: number, [a, b]: Span) => Math.min(b, Math.max(a, value));

function subtract(runs: Span[], hole: Span) {
  return runs.flatMap<Span>(([a, b]) => {
    if (hole[1] <= a + epsilon || hole[0] >= b - epsilon) return [[a, b]];
    return [
      ...(a < hole[0] - epsilon ? [[a, hole[0]] as Span] : []),
      ...(b > hole[1] + epsilon ? [[hole[1], b] as Span] : []),
    ];
  });
}

function woodFace(sheet: Piece, piece: Piece, inverse: V3) {
  const [x, y, z] = rotate(piece.position.map((value, i) => value - sheet.position[i]) as V3, inverse);
  const half = [0, 0, 0];
  for (const [i, axis] of unit.entries()) {
    const vector = rotate(rotate(axis, piece.rotation), inverse);
    const j = vector.findIndex((value) => Math.abs(value) >= 1 - epsilon);
    if (j < 0) return null;
    half[j] = piece.size[i] / 2;
  }
  if (Math.abs(y + half[1] + sheet.size[1] / 2) > epsilon) return null;
  const [width, , height] = sheet.size;
  const area: Area = [[width / 2 + x - half[0], width / 2 + x + half[0]], [height / 2 - z - half[2], height / 2 - z + half[2]]];
  if (area[0][1] <= 0 || area[0][0] >= width || area[1][1] <= 0 || area[1][0] >= height) return null;
  return { piece, area, direction: half[0] > half[2] ? 0 as const : 1 as const };
}

function backingIssue(width: number, height: number, cuts: Area[], faces: Area[]) {
  const stops = [...new Set([0, height, ...[...cuts, ...faces].flatMap(([, span]) =>
    span.map((y) => clamp(y, [0, height])),
  )])].sort((a, b) => a - b);
  for (let i = 1; i < stops.length; i++) {
    if (stops[i] - stops[i - 1] < epsilon) continue;
    const y = (stops[i] + stops[i - 1]) / 2;
    const spans = cuts.filter(([, vertical]) => within(y, vertical))
      .reduce((runs, [horizontal]) => subtract(runs, horizontal), [[0, width]] as Span[]);
    const wood = faces.filter(([, vertical]) => within(y, vertical)).map(([horizontal]) => horizontal);
    for (const [left, right] of spans) {
      if (right - left < 2 * edge - epsilon) return `Narrow sheet strip near ${formatPreciseInches(y)} from its bottom needs backing review.`;
      const unsupportedEnds = [left + edge, right - edge].filter((x) => !wood.some((span) => within(x, span)));
      if (unsupportedEnds.length)
        return `Missing edge backing near ${formatPreciseInches(unsupportedEnds[0])} from left and ${formatPreciseInches(y)} from bottom.`;
      const gaps = wood.reduce((runs, span) => subtract(runs, span), [[left, right]] as Span[]);
      const gap = gaps.find(([a, b]) => b - a > drywallScrews.framingSpacing - 1.5 + epsilon);
      if (gap) return `A ${formatPreciseInches(gap[1] - gap[0])} gap in framing starts ${formatPreciseInches(gap[0])} from left, ${formatPreciseInches(y)} from bottom.`;
    }
  }
}

function buildSheetMarks(project: Project, sheet: Piece, frame: Piece[]): SheetReview {
  const inverse = inverseRotation(sheet.rotation);
  const [width, thickness, height] = sheet.size;
  const cuts = drywallFaceCutBounds(sheet);
  const surface: Area = [[edge, width - edge], [edge, height - edge]];
  const faces = frame.flatMap((piece) => {
    if (!material(piece.material).wood || isPressureTreated(piece.material)) return [];
    return woodFace(sheet, piece, inverse) ?? [];
  });
  const panel = bounds(sheet);
  const solids = project.pieces.flatMap((piece) => {
    if (piece.id === sheet.id || piece.offcut) return [];
    const box = bounds(piece);
    if (box.min.some((value, i) => value > panel.max[i] + drywallScrews.length ||
      box.max[i] < panel.min[i] - drywallScrews.length)) return [];
    return [{ piece, box, solid: prepareCollisionSolid(piece) }];
  });
  const solidById = new Map(solids.map(({ piece, solid }) => [piece.id, solid]));
  const world = (x: number, y: number, depth: number) =>
    rotate([x - width / 2, depth, height / 2 - y], sheet.rotation)
      .map((value, i) => value + sheet.position[i]) as V3;
  const clearPath = (x: number, y: number, supportId: string) => {
    const solid = solidById.get(supportId);
    if (!solid) return false;
    return [[0, 0], [clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]].every(([dx, dy]) => {
      const head = world(x + dx, y + dy, thickness / 2);
      const entry = world(x + dx, y + dy, -thickness / 2);
      const tip = world(x + dx, y + dy, thickness / 2 - drywallScrews.length);
      return solidContainsSegment(solid, entry, tip) && !solids.some(({ piece, box, solid: other }) => {
        if (piece.id === supportId ||
          box.min.some((min, i) => Math.max(head[i], tip[i]) < min - epsilon || Math.min(head[i], tip[i]) > box.max[i] + epsilon)) return false;
        return !other || solidSegmentRanges(other, head, tip).some(([a, b]) => b - a > epsilon);
      });
    });
  };
  const marks: Mark[] = [];
  for (const { piece, area, direction } of faces) {
    const across = direction === 0 ? 1 : 0;
    const run = intersect(surface[direction], pad(area[direction], -woodInset));
    const room = intersect(surface[across], pad(area[across], -woodInset));
    if (!valid(run) || !valid(room)) continue;
    const line = clamp(middle(area[across]), room);
    const intervals = cuts.filter((cut) => within(line, pad(cut[across], edge - epsilon)))
      .reduce((runs, cut) => subtract(runs, pad(cut[direction], edge)), [run]);
    for (const [from, to] of intervals) {
      const spaces = Math.max(0, Math.ceil((to - from - epsilon) / drywallScrews.spacing));
      for (let i = 0; i <= spaces; i++) {
        const along = spaces ? from + (to - from) * i / spaces : (from + to) / 2;
        const [x, y] = direction === 0 ? [along, line] : [line, along];
        marks.push({ x, y, supportId: piece.id, clear: clearPath(x, y, piece.id) });
      }
    }
  }
  return { sheet, cuts, marks, backingIssue: backingIssue(width, height, cuts, faces.map(({ area }) => area)) };
}

export function reviewWallDrywallScrews(project: Project, section: Section) {
  const { current, parts, frame } = wallDrywallFit(project, section);
  const supported = parts.length > 0 && parts.every((sheet) => isDrywall(sheet.material) &&
    sheet.size[1] === 0.5 && !sheet.cutPlanes.length && !sheet.roundOpenings?.length &&
    !sheet.rectangularOpenings?.some(({ axis }) => axis !== 1));
  const sheets = current && supported ? parts.map((sheet) => buildSheetMarks(project, sheet, frame)) : [];
  const total = sheets.reduce((sum, { marks }) => sum + marks.length, 0);
  const blocked = sheets.reduce((sum, { marks }) => sum + marks.filter(({ clear }) => !clear).length, 0);
  const problem = !current ? "The wall or fitted sheets changed. Recheck the finish layout before estimating screws."
    : !supported ? "Use a compatible fastening schedule for these modified sheets."
    : sheets.some(({ backingIssue }) => backingIssue) ? "Review missing edge backing or wide framing gaps before estimating screws."
    : blocked ? `${blocked} ${blocked === 1 ? "mark needs" : "marks need"} a clear path to retained wood. Check framing, hardware and services.`
    : !total ? "No supported screw locations were found." : undefined;
  return { section, sheets, total, blocked, problem };
}

export type WallDrywallScrewReview = ReturnType<typeof reviewWallDrywallScrews>;

export function drywallScrewReviews(project: Project) {
  return project.sections.filter(({ wallDrywall }) => wallDrywall)
    .map((section) => reviewWallDrywallScrews(project, section));
}

export function drywallScrewTakeoff(project: Project, reviews = drywallScrewReviews(project)) {
  if (!reviews.length) return null;
  if (reviews.some(({ problem }) => problem)) return { marks: null, required: null };
  const marks = reviews.reduce((sum, review) => sum + review.total, 0);
  return { marks, required: Math.ceil(marks / drywallScrews.estimatedBoxCount) };
}

export function drywallScrewRows(marks: Mark[]) {
  const columns = new Map<number, Mark[]>();
  for (const mark of marks) {
    const x = Number(mark.x.toFixed(5));
    columns.set(x, [...(columns.get(x) ?? []), mark]);
  }
  return [...columns.entries()].sort(([a], [b]) => a - b).map(([x, group]) => ({
    x, marks: group.sort((a, b) => a.y - b.y),
  }));
}

export function drywallScrewReport(project: Project) {
  const reviews = drywallScrewReviews(project);
  const takeoff = drywallScrewTakeoff(project, reviews);
  if (!takeoff) return [];
  const inches = formatPreciseInches;
  return [
    drywallScrewScope,
    `Use a ${drywallScrewTool}. Plan marks at least ⅜ in from sheet edges and up to 16 in apart on the same framing run.`,
    ...reviews.flatMap(({ section, sheets, total, problem }) => [
      `${section.name} · ${problem ?? `${total} planned screws`}`,
      ...sheets.flatMap(({ sheet, marks, backingIssue }) => [
        `${partLabel(project, sheet.id)} · ${sheet.name} · ${marks.length} marks measured from the installed face’s left and bottom.`,
        ...(backingIssue ? [backingIssue] : []),
        ...drywallScrewRows(marks).map(({ x, marks }) =>
          `At ${inches(x)} from left, mark ${marks.map(({ y, clear }) => inches(y) + (clear ? "" : " (check path)")).join(", ")} from bottom.`),
      ]),
    ]),
    takeoff.required === null ? "Resolve the marked reviews to finish the drywall screw purchase quantity."
      : `${takeoff.marks} screws total · estimated ${takeoff.required} × 1-lb ${takeoff.required === 1 ? "box" : "boxes"}. Retailer lists about ${drywallScrews.estimatedBoxCount} per box and Grip-Rite lists ${drywallScrews.manufacturerBoxCount}. The estimate uses the lower count. Check the delivered box.`,
  ];
}
