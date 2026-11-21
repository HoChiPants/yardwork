import { floorBaseConnections } from "./floorBaseConnections";
import { material, type Piece, type Project, type Section, type V3 } from "./model";
import { formatStockLength } from "./measurement";
import { partLabel } from "./partLabels";
import { packRectangles, type RectangleCut, type StockPlan } from "./packing";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";
import { foamSheetCutOrder } from "./stockCutSequence";
import { pieceThroughOpenings } from "./throughOpenings";
import {
  rimAirSealInputSchema, rimAirSealPlansSchema,
  type RimAirSealInput, type RimAirSealPlan, type RimSide,
} from "./rimAirSealSchema";
import { rimFoam } from "./rimAirSealReference";

const epsilon = 1e-6;
const localInches = (value: number) => Math.round(value * 1e6) / 1e6;
const delta = (a: V3, b: V3) => a.map((value, axis) => value - b[axis]) as V3;
const bayKey = (left: string, right: string) => left + "/" + right;
const sideName = (side: RimSide) => side === "back" ? "Back" : "Front";
export const rimMeasurementsTolerance = 0.25;
export const rimAirSealKey = ({ sectionId, side }: Pick<RimAirSealInput, "sectionId" | "side">) => sectionId + "/" + side;
const sameLabel = (label: string) => label.trim().toLowerCase();

type Bay = {
  id: string;
  label: string;
  left: string;
  right: string;
  x: number;
  top: number;
  bottom: number;
  width: number;
  stock: [Piece["material"], Piece["material"]];
  issue?: string;
};
type RimFrame = {
  section?: Section;
  rim?: Piece;
  inside?: number;
  bays: Bay[];
  issue?: string;
};

function rectangularMember(piece: Piece, sectionInverse: V3) {
  if (!material(piece.material).wood || piece.cutPlanes.length || pieceThroughOpenings(piece).length)
    return false;
  return ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]).every((axis, i) =>
    Math.abs(rotate(rotate(axis, piece.rotation), sectionInverse)[i]) >= 1 - epsilon);
}

export function rimAirSealFrame(project: Project, sectionId: string, side: RimSide): RimFrame {
  const section = project.sections.find(({ id }) => id === sectionId);
  if (!section || section.generator?.type !== "foundation")
    return { bays: [], issue: "Choose a modeled floor base." };
  if (rotate([0, 1, 0], section.rotation)[1] < 1 - epsilon)
    return { section, bays: [], issue: "Level the floor base before planning this rim." };
  const review = floorBaseConnections({ ...project, sections: [section] }, [])[0];
  const rows = review.rows.filter((row) => row.side === side);
  const rim = rows[0]?.rim;
  const inverse = inverseRotation(section.rotation);
  if (!rim || !rectangularMember(rim, inverse))
    return { section, bays: [], issue: "Restore an aligned rectangular rim before planning these bays." };
  const local = (member: Piece) => rotate(delta(member.position, section.origin), inverse).map(localInches) as V3;
  const [rimX, rimY, rimZ] = local(rim);
  const rimLeft = localInches(rimX - rim.size[0] / 2);
  const rimRight = localInches(rimX + rim.size[0] / 2);
  const inside = localInches(rimZ + (side === "back" ? 1 : -1) * rim.size[2] / 2);
  const joists = rows.map(({ joist, fullFace }) => ({
    joist,
    position: local(joist),
    contact: fullFace && rectangularMember(joist, inverse),
  })).sort((a, b) => a.position[0] - b.position[0]);
  if (joists.length < 2)
    return { section, rim, inside, bays: [], issue: "Two identifiable joists must bound a bay." };
  const bays = joists.slice(1).map((right, index): Bay => {
    const left = joists[index];
    const a = localInches(left.position[0] + left.joist.size[0] / 2);
    const b = localInches(right.position[0] - right.joist.size[0] / 2);
    const top = localInches(Math.min(rimY + rim.size[1] / 2,
      left.position[1] + left.joist.size[1] / 2, right.position[1] + right.joist.size[1] / 2));
    const bottom = localInches(Math.max(rimY - rim.size[1] / 2,
      left.position[1] - left.joist.size[1] / 2, right.position[1] - right.joist.size[1] / 2));
    const issue = !left.contact || !right.contact ? "Check both joist ends for full, aligned contact with the rim." :
      a < rimLeft - epsilon || b > rimRight + epsilon || b - a <= epsilon || top - bottom <= epsilon
        ? "These members leave no clear rectangular bay against the rim." : undefined;
    return {
      id: bayKey(left.joist.id, right.joist.id), label: `Bay ${index + 1}`,
      left: left.joist.id, right: right.joist.id,
      x: localInches((a + b) / 2), top, bottom, width: localInches(b - a),
      stock: [left.joist.material, right.joist.material], issue,
    };
  });
  return { section, rim, inside, bays,
    issue: review.joists !== review.expected ? "A joist is missing or extra. Review the floor layout before sizing inserts." : undefined };
}

export type RimSealCut = RectangleCut & {
  opening: { width: number; height: number };
  perimeter: number;
  outline: V3[];
};
type RimSealRow = {
  name: string;
  rimId?: string;
  signature?: string;
  issues: string[];
  cuts: RimSealCut[];
};

function blockingPart(project: Project, cavitySize: V3, position: V3, rotation: V3, edges: string[]) {
  const radius = Math.hypot(...cavitySize) / 2;
  const cavity = prepareCollisionBox(cavitySize, position, rotation);
  return project.pieces.find((piece) => {
    if (piece.offcut || edges.includes(piece.id) ||
        Math.hypot(...delta(piece.position, position)) > radius + Math.hypot(...piece.size) / 2) return false;
    const part = prepareCollisionSolid(piece) ?? prepareCollisionBox(piece.size, piece.position, piece.rotation);
    return solidOverlap(cavity, part, 0.001);
  });
}

function checkMeasurement(bay: Bay, width: number, height: number, input: RimAirSealInput) {
  if (bay.issue) return bay.issue;
  if (width > bay.width + epsilon || width < bay.width - rimMeasurementsTolerance - epsilon)
    return `Measured width must match the modeled ${formatStockLength(bay.width)} opening within ¼ in without exceeding it. Adjust the framing if needed.`;
  if (input.topInset + height > bay.top - bay.bottom + epsilon)
    return "The measured opening extends beyond the shared joist and rim height. Review the opening height and top offset.";
  if (width <= 2 * input.gap + epsilon || height <= 2 * input.gap + epsilon)
    return "The edge allowance leaves no foam blank.";
  return undefined;
}

export function checkRimAirSeal(project: Project, input: RimAirSealInput, frame = rimAirSealFrame(project, input.sectionId, input.side)): RimSealRow {
  const { section, rim, inside, bays } = frame;
  const name = `${section?.name ?? "Removed floor base"} · ${sideName(input.side)} rim`;
  if (!section || !rim || inside === undefined || frame.issue)
    return { name, rimId: rim?.id, cuts: [], issues: [frame.issue ?? "Restore the modeled rim framing."] };
  const issues: string[] = [];
  const cuts: RimSealCut[] = [];
  const signatures = [];
  const entries = new Map(bays.map((bay) => [bay.id, bay]));
  const world = (point: V3) => rotate(point, section.rotation).map((v, axis) => v + section.origin[axis]) as V3;
  const front = input.side === "back" ? 1 : -1;
  const face = inside + front * rimFoam.thickness;
  for (const measured of input.bays) {
    const bay = entries.get(bayKey(measured.left, measured.right));
    if (!bay) {
      issues.push("A selected bay no longer has the same neighboring joists. Remeasure after reviewing the layout.");
      continue;
    }
    const problem = checkMeasurement(bay, measured.width, measured.height, input);
    if (problem) {
      issues.push(`${bay.label}. ${problem}`);
      continue;
    }
    const top = bay.top - input.topInset;
    const bottom = top - measured.height;
    const center = world([bay.x, (top + bottom) / 2, (inside + face) / 2]);
    const obstacle = blockingPart(project, [bay.width, measured.height, rimFoam.thickness],
      center, section.rotation, [rim.id, bay.left, bay.right]);
    if (obstacle) {
      issues.push(`${bay.label}. ${partLabel(project, obstacle.id)} · ${obstacle.name} blocks the seated foam or its edge seal.`);
      continue;
    }
    const width = localInches(measured.width - 2 * input.gap);
    const height = localInches(measured.height - 2 * input.gap);
    const left = bay.x - width / 2, right = bay.x + width / 2;
    const low = bottom + input.gap, high = top - input.gap;
    const cut = {
      id: `${rimAirSealKey(input)}/${bay.id}`,
      name: `${name} · ${bay.label} (${partLabel(project, bay.left)}–${partLabel(project, bay.right)})`,
      width, length: height, opening: { width: measured.width, height: measured.height },
      perimeter: 2 * (measured.width + measured.height),
      outline: ([
        [left, low, face], [right, low, face], [right, high, face], [left, high, face], [left, low, face],
      ] as V3[]).map(world),
    };
    cuts.push(cut);
    signatures.push([bay.id, bay.stock, bay.x, bay.width, bay.top, bay.bottom]);
  }
  const signature = JSON.stringify([rim.id, rim.material, inside, signatures]);
  return { name, rimId: rim.id, signature, issues, cuts };
}

type FoamSheet = {
  label: string;
  kerf: number;
  stock: StockPlan;
  order: ReturnType<typeof foamSheetCutOrder>;
};
type ReviewedRimSeal = RimSealRow & { plan: RimAirSealPlan };

function splitFoamStock(cuts: RimSealCut[], width: number, length: number, kerf: number) {
  return packRectangles(cuts, width, length, { kerf, checkEdgeCuts: true });
}

function createSheet(label: string, stock: StockPlan, kerf: number, names: Map<string, string>): FoamSheet {
  return { label, kerf, stock, order: foamSheetCutOrder(stock, kerf, (id) => names.get(id) ?? id) };
}

function foamCuts(rows: ReviewedRimSeal[]) {
  const sheets: FoamSheet[] = [];
  const scraps: FoamSheet[] = [];
  const gaps: { cut: RimSealCut; issue: string }[] = [];
  const unusedOffcuts: string[] = [];
  const newStock = new Map<number, RimSealCut[]>();
  const names = new Map(rows.flatMap(({ cuts }) => cuts.map(({ id, name }) => [id, name])));
  for (const row of rows) {
    if (row.issues.length) continue;
    const { kerf, offcut } = row.plan.input;
    let remaining = row.cuts;
    if (offcut) {
      const { plans } = splitFoamStock(remaining, offcut.width, offcut.length, kerf);
      const candidate = plans[0] && createSheet(`Offcut ${offcut.label}`, plans[0], kerf, names);
      if (candidate && !candidate.order.review) {
        scraps.push(candidate);
        const used = new Set(candidate.stock.placements.map(({ id }) => id));
        remaining = remaining.filter(({ id }) => !used.has(id));
      } else unusedOffcuts.push(offcut.label);
    }
    if (remaining.length) newStock.set(kerf, [...(newStock.get(kerf) ?? []), ...remaining]);
  }
  for (const [kerf, cuts] of newStock) {
    const { plans } = splitFoamStock(cuts, rimFoam.width, rimFoam.length, kerf);
    const usable = new Set<string>();
    for (const stock of plans) {
      const sheet = createSheet(`New sheet ${sheets.length + 1}`, stock, kerf, names);
      if (sheet.order.review) continue;
      sheets.push(sheet);
      for (const { id } of sheet.stock.placements) usable.add(id);
    }
    for (const cut of cuts) if (!usable.has(cut.id)) gaps.push({
      cut, issue: "This blank needs a different sheet layout, board size or cutting allowance.",
    });
  }
  return { sheets, scraps, gaps, unusedOffcuts };
}

export function reviewRimAirSeals(project: Project) {
  const plans = project.rimAirSeals ?? [];
  const labels = new Map<string, number>();
  for (const { input: { offcut } } of plans) {
    if (offcut) labels.set(sameLabel(offcut.label), (labels.get(sameLabel(offcut.label)) ?? 0) + 1);
  }
  const rows: ReviewedRimSeal[] = plans.map((plan) => {
    const row = checkRimAirSeal(project, plan.input);
    if (!row.issues.length && row.signature !== plan.frame)
      row.issues.push("The modeled opening moved or changed. Remeasure before cutting or ordering stock.");
    const { offcut } = plan.input;
    if (offcut && (labels.get(sameLabel(offcut.label)) ?? 0) > 1)
      row.issues.push(`Offcut ${offcut.label} is assigned twice. Use a different measured offcut.`);
    return { ...row, plan };
  });
  const first = foamCuts(rows);
  if (!first.gaps.length) return { rows, ...first, needsReview: rows.some(({ issues }) => issues.length > 0) };
  const unavailable = new Map(first.gaps.map(({ cut, issue }) => [cut.id, issue]));
  for (const row of rows) {
    for (const cut of row.cuts) {
      const issue = unavailable.get(cut.id);
      if (issue) row.issues.push(`${cut.name}. ${issue}`);
    }
  }
  return { rows, ...foamCuts(rows), needsReview: true };
}

export function saveRimAirSeal(project: Project, measurements: RimAirSealInput) {
  const input = rimAirSealInputSchema.parse(measurements);
  const row = checkRimAirSeal(project, input);
  if (row.issues.length || !row.signature) throw Error(row.issues[0] ?? "Review the actual bay openings first.");
  const key = rimAirSealKey(input);
  const plans = rimAirSealPlansSchema.parse([
    ...(project.rimAirSeals ?? []).filter((plan) => rimAirSealKey(plan.input) !== key),
    { input, frame: row.signature },
  ]);
  const candidate = { ...project, rimAirSeals: plans };
  const result = reviewRimAirSeals(candidate);
  const saved = result.rows.find(({ plan }) => rimAirSealKey(plan.input) === key)!;
  if (saved.issues.length) throw Error(saved.issues[0]);
  return candidate;
}

export function removeRimAirSeal(project: Project, input: Pick<RimAirSealInput, "sectionId" | "side">) {
  const key = rimAirSealKey(input);
  const plans = (project.rimAirSeals ?? []).filter((plan) => rimAirSealKey(plan.input) !== key);
  if (plans.length) return { ...project, rimAirSeals: plans };
  const { rimAirSeals: _removed, ...remaining } = project;
  return remaining;
}

export const foamBlankSize = (width: number, height: number) => `${formatStockLength(width)} × ${formatStockLength(height)}`;

export function rimAirSealGuideLines(review: ReturnType<typeof reviewRimAirSeals>) {
  if (!review.rows.length) return [];
  return [
    ...review.rows.flatMap(({ name, plan, issues, cuts }) => [
      `${name} · ${formatStockLength(plan.input.gap)} clearance at each edge.`,
      ...issues.map((issue) => `Needs review. ${issue}`),
      ...(!issues.length ? cuts.map((cut) => `${cut.name} · cut ${foamBlankSize(cut.width, cut.length)}. Dry-fit and seal the four edges (${formatStockLength(cut.perimeter)} measured perimeter).`) : []),
    ]),
    ...[...review.scraps, ...review.sheets].flatMap(({ label, stock, order, kerf }) => [
      `${label} · ${foamBlankSize(stock.width, stock.length)} · ${formatStockLength(kerf)} measured cutting loss.`,
      ...order.steps.filter(Boolean).map((text, index) => `${index + 1}. ${text}`),
      ...order.remnants.map((size) => `Keep reusable foam ${size} if the edges remain sound. Measure and label it after cutting.`),
    ]),
    ...review.unusedOffcuts.map((label) => `Keep offcut ${label} for a different cut. This plan uses new stock instead.`),
  ];
}
