import { drywallJointTape, drywallJointTapeScope, isDrywall } from "./drywallReference";
import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Project, Section, V3 } from "./model";
import { inverseRotation, rotate } from "./spatial";
import { drywallFaceCutBounds, wallDrywallFit } from "./wallDrywall";

type Span = [number, number];
type FaceRect = [Span, Span];
type SheetFace = { area: FaceRect; cutouts: FaceRect[] };
type Joint = { axis: 0 | 1; position: number; start: number; end: number };
type TapeCut = { section: Section; joint: Joint; length: number };
const tolerance = 0.001;
const edges = [0, 1] as const;

function sharedEdges(first: SheetFace, second: SheetFace) {
  return edges.flatMap((axis): Joint[] => {
    const along = axis === 0 ? 1 : 0;
    const [a, b] = first.area[axis], [c, d] = second.area[axis];
    const position = Math.abs(b - c) < tolerance ? b : Math.abs(d - a) < tolerance ? a : null;
    if (position === null) return [];
    const shared: Span = [
      Math.max(first.area[along][0], second.area[along][0]),
      Math.min(first.area[along][1], second.area[along][1]),
    ];
    if (shared[1] - shared[0] < tolerance) return [];
    const cutouts = [...first.cutouts, ...second.cutouts].filter((cut) =>
      cut[axis][0] <= position + tolerance && cut[axis][1] >= position - tolerance);
    const spans = cutouts.reduce<Span[]>((runs, cut) => {
      const [low, high] = cut[along];
      return runs.flatMap(([start, end]): Span[] => {
        if (high <= start + tolerance || low >= end - tolerance) return [[start, end]];
        return [
          ...(low > start + tolerance ? [[start, low] as Span] : []),
          ...(high < end - tolerance ? [[high, end] as Span] : []),
        ];
      });
    }, [shared]);
    return spans.map(([start, end]) => ({ axis, position, start, end }));
  });
}

export function reviewWallDrywallJoints(project: Project, section: Section) {
  const { current, parts } = wallDrywallFit(project, section);
  const first = parts[0];
  const problem = !current ? "The wall or fitted sheets changed. Review the layout before estimating tape."
    : !first || parts.some((sheet) => !isDrywall(sheet.material) || sheet.size[1] !== 0.5 ||
      sheet.cutPlanes.length || sheet.roundOpenings?.length ||
      sheet.rectangularOpenings?.some(({ axis }) => axis !== 1))
      ? "Check joints on modified sheets in the field." : undefined;
  const sheets: SheetFace[] = [], joints: Joint[] = [];
  if (problem) return { section, sheets, joints, length: 0, width: 0, height: 0, problem };

  const inverse = inverseRotation(first.rotation);
  const locations = parts.map((sheet) => {
    const delta = sheet.position.map((value, i) => value - first.position[i]) as V3;
    const [x, , z] = rotate(delta, inverse);
    return { sheet, left: x - sheet.size[0] / 2, bottom: -z - sheet.size[2] / 2 };
  });
  const left = Math.min(...locations.map((location) => location.left));
  const bottom = Math.min(...locations.map((location) => location.bottom));
  for (const location of locations) {
    const { sheet } = location;
    const x = location.left - left, y = location.bottom - bottom;
    const move = ([[a, b], [c, d]]: FaceRect): FaceRect =>
      [[coordinates(x + a), coordinates(x + b)], [coordinates(y + c), coordinates(y + d)]];
    sheets.push({ area: move([[0, sheet.size[0]], [0, sheet.size[2]]]), cutouts: drywallFaceCutBounds(sheet).map(move) });
  }
  const edgesByPosition = sheets.flatMap((sheet, i) =>
    sheets.slice(i + 1).flatMap((other) => sharedEdges(sheet, other))
  ).sort((a, b) => a.axis - b.axis || a.position - b.position || a.start - b.start);
  for (const edge of edgesByPosition) {
    const last = joints.at(-1);
    if (last && last.axis === edge.axis && Math.abs(last.position - edge.position) < tolerance &&
        edge.start <= last.end + tolerance) {
      last.end = Math.max(last.end, edge.end);
    } else {
      joints.push(edge);
    }
  }
  return { section, sheets, joints, problem,
    width: Math.max(...sheets.map(({ area }) => area[0][1])),
    height: Math.max(...sheets.map(({ area }) => area[1][1])),
    length: joints.reduce((sum, { start, end }) => sum + end - start, 0),
  };
}

function coordinates(value: number) {
  return Number(value.toFixed(6));
}

export function drywallJointMark({ axis, position, start, end }: Joint) {
  const inches = formatPreciseInches;
  return axis === 0
    ? "Vertical at " + inches(position) + " from left · " + inches(start) + " to " + inches(end) + " above bottom"
    : "Horizontal at " + inches(position) + " above bottom · " + inches(start) + " to " + inches(end) + " from left";
}

export function drywallJointTapeTakeoff(project: Project) {
  const reviews = project.sections.filter(({ wallDrywall }) => wallDrywall)
    .map((section) => reviewWallDrywallJoints(project, section));
  if (!reviews.length) return null;
  if (reviews.some(({ problem }) => problem)) return { reviews, required: null, length: null, rolls: [] };
  const cuts = reviews.flatMap(({ section, joints }) => joints.map((joint) =>
    ({ section, joint, length: joint.end - joint.start })));
  const rolls: { cuts: TapeCut[]; remaining: number }[] = [];
  for (const cut of cuts.sort((a, b) => b.length - a.length)) {
    let roll = rolls.find(({ remaining }) => remaining >= cut.length - tolerance);
    if (!roll) {
      roll = { cuts: [], remaining: drywallJointTape.length };
      rolls.push(roll);
    }
    roll.cuts.push(cut);
    roll.remaining = Math.max(0, roll.remaining - cut.length);
  }
  return { reviews, required: rolls.length, length: cuts.reduce((sum, cut) => sum + cut.length, 0), rolls };
}

export function drywallJointTapeReport(project: Project) {
  const takeoff = drywallJointTapeTakeoff(project);
  if (!takeoff) return [];
  return [
    drywallJointTapeScope,
    "Measure from the left and bottom of the installed drywall on the listed face.",
    ...takeoff.reviews.flatMap(({ section, joints, length, problem }) => [
      section.name + " · " + (problem ?? formatStockLength(length) + " of flat joints"),
      ...(takeoff.required === null ? joints.map((joint) =>
        drywallJointMark(joint) + " · tape " + formatStockLength(joint.end - joint.start)) : []),
    ]),
    ...takeoff.rolls.flatMap(({ cuts, remaining }, i) => [
      "250 ft roll " + (i + 1) + " · " + formatStockLength(remaining) + " left after net cuts",
      ...cuts.map(({ section, joint, length }) => section.name + " · " + drywallJointMark(joint) + " · " + formatStockLength(length)),
    ]),
    ...(takeoff.required === null ? ["Review changed layouts before counting tape rolls."] : []),
  ];
}
