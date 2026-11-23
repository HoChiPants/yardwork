import { Euler, Matrix4, Vector3 } from "three";
import { cabinetBackingInputSchema, type CabinetBackingInput, type CabinetBackingPlan, type CabinetScrewMeasurements } from "./cabinetBackingSchema";
import { cabinetScrewGuideLines, reviewCabinetScrewReach } from "./cabinetScrewReach";
import { inspectCutStock } from "./cutStock";
import { bom } from "./engine";
import { fittedPartMotionConflicts } from "./fittedPartMotion";
import { formatPreciseInches } from "./measurement";
import { framingStockDimensions, material, part, projectSchema, uid, type Piece, type Project, type V3 } from "./model";
import { assignOffcutToPart, boardBlankAtLength, fittingBoardOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";
import { planBoardCutGroups } from "./recordStockCutLayout";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";

export const cabinetBackingTitle = "Wall cabinet backing";
export const cabinetBackingReference = "https://www.ikea.com/us/en/files/pdf/da/86/da86abe2/enhet_kitchen_install_guide_apr_2023.pdf#page=4";
export const cabinetBackingScope = "Before closing the wall, confirm the cabinet maker’s mounting locations, the delivered framing, concealed services, and the specified attachment of blocking and cabinets. These measurements check fit and mark locations in the model.";
const epsilon = 1e-6;
const basis: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const stockTurn = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(
  new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0),
));
const stockRotation: V3 = [stockTurn.x, stockTurn.y, stockTurn.z];
const plus = (a: V3, b: V3) => a.map((n, i) => n + b[i]) as V3;
const minus = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
const same = (a: V3, b: V3) => a.every((n, i) => Math.abs(n - b[i]) <= epsilon);

export const cabinetBackingWalls = (project: Project) => project.sections.filter(({ generator, rotation }) =>
  generator?.type === "wall" && same(rotate(basis[1], rotation), basis[1]));

function frameLayout(project: Project, input: CabinetBackingInput, saved?: CabinetBackingPlan) {
  const wall = cabinetBackingWalls(project).find(({ id }) => id === input.wallId);
  const command = wall?.generator;
  if (!wall || !command) throw Error("Choose an upright framed wall.");
  const { height, offsets, face, stock } = input;
  const width = command.width;
  if (height >= command.height - epsilon || offsets.some((x) => x >= width - epsilon))
    throw Error("Enter mounting points inside the measured wall width and height.");
  const edges = -width / 2;
  const depth = framingStockDimensions(command.windowOpening?.stock ?? command.wallStock ?? "stud").depth;
  const sign = face === "front" ? 1 : -1;
  const plane = sign * depth / 2;
  const [, , boardHeight] = material(stock).size;
  const halfHeight = boardHeight / 2;
  const inverse = inverseRotation(wall.rotation);
  const members = new Set(wall.pieceIds);
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  const studs = project.pieces.flatMap((piece) => {
    if (!members.has(piece.id) || piece.offcut || moving.has(piece.id) ||
      !material(piece.material).wood || material(piece.material).stockKind !== "linear" ||
      material(piece.material).shape || piece.cutPlanes.length || pieceThroughOpenings(piece).length ||
      !basis.every((dir) => same(rotate(rotate(dir, piece.rotation), inverse), dir)) ||
      Math.abs(piece.size[0] - 1.5) > epsilon || piece.size[1] <= piece.size[2]) return [];
    const [x, y, z] = rotate(minus(piece.position, wall.origin), inverse);
    const [w, h, d] = piece.size;
    if (Math.abs(z + sign * d / 2 - plane) > epsilon || d < 1.5 - epsilon) return [];
    return [{ piece, left: x - w / 2, right: x + w / 2, low: y - h / 2, high: y + h / 2 }];
  }).sort((a, b) => a.left - b.left);
  const openings = [
    ...(command.doorOpening ? [{ ...command.doorOpening, bottom: command.doorOpening.floor ?? 0 }] : []),
    ...(command.windowOpening ? [{ ...command.windowOpening, bottom: command.windowOpening.sill }] : []),
  ].map(({ width, height, offset, bottom }) => ({ left: (offset ?? 0) - width / 2,
    right: (offset ?? 0) + width / 2, low: bottom, high: bottom + height }));
  const intersectsOpening = (left: number, right: number, low: number, high: number) => openings.some((hole) =>
    left < hole.right - epsilon && right > hole.left + epsilon && low < hole.high - epsilon && high > hole.low + epsilon);
  const rotation = composeRotation(wall.rotation, stockRotation);
  const savedBlocks = new Map(saved?.blocks.map((row) => [row.id, row]));
  const prepared = project.pieces.filter(({ offcut }) => !offcut).map((piece) => {
    const solid = prepareCollisionSolid(piece);
    return { piece, solid: solid ?? prepareCollisionBox(piece.size, piece.position, piece.rotation), envelope: !solid || solid.kind === "envelope" };
  });
  const blocks = new Map<string, { block: Piece; first: string; second: string }>();
  const marks = offsets.map((offset) => {
    const x = offset + edges;
    const point = plus(wall.origin, rotate([x, height, plane], wall.rotation));
    const markName = formatPreciseInches(offset);
    const fail = (message: string) => { throw Error(`At ${markName} from the wall’s start: ${message}`); };
    if (intersectsOpening(x, x, height, height)) fail("This mark lands in a framed opening.");
    const atHeight = studs.filter(({ low, high }) => height > low + epsilon && height < high - epsilon);
    const stud = atHeight.find(({ left, right }) => x > left + epsilon && x < right - epsilon);
    if (stud) return { offset, receiver: stud.piece.id, kind: "stud" as const, point, woodDepth: stud.piece.size[2],
      edge: Math.min(x - stud.left, stud.right - x, height - stud.low, stud.high - height) };
    if (atHeight.some(({ left, right }) => Math.abs(x - left) <= epsilon || Math.abs(x - right) <= epsilon))
      fail("The mounting point is on a stud edge. Check the cabinet’s allowed positions and enter the measured offset.");
    const first = atHeight.filter(({ right }) => right < x - epsilon).at(-1);
    const second = atHeight.find(({ left }) => left > x + epsilon);
    if (!first || !second) throw Error(`At ${markName} from the wall’s start: no pair of flush wood studs brackets this mounting point.`);
    const left = first.right, right = second.left;
    if (intersectsOpening(left, right, height - halfHeight, height + halfHeight))
      fail("The backing would cross a framed opening. Move the mounting row or use the manufacturer’s alternate attachment detail.");
    if ([first, second].some(({ low, high }) => height - halfHeight < low - epsilon || height + halfHeight > high + epsilon))
      fail("The full backing height does not fit against both stud faces.");
    const key = `${first.piece.id}:${second.piece.id}`;
    const length = Number((right - left).toFixed(7));
    let row = blocks.get(key);
    if (!row) {
      const blank = boardBlankAtLength(stock, length);
      if (!blank || length > Math.max(...material(stock).size) + epsilon) throw Error("This stud bay is too wide for the selected blocking stock.");
      const position = plus(wall.origin, rotate([(left + right) / 2, height, plane - sign * blank.size[0] / 2], wall.rotation));
      const recorded = saved?.blocks.find((candidate) => candidate.first === first.piece.id && candidate.second === second.piece.id);
      const block = { ...part("Cabinet backing", stock, blank.size, position, first.piece.stepId, wall.name, rotation),
        stockLengthAxis: blank.stockLengthAxis, ...(recorded && { id: recorded.id }) };
      if (saved) {
        const actual = prepared.find(({ piece }) => piece.id === block.id)?.piece;
        if (!actual || !members.has(actual.id) || moving.has(actual.id) || actual.material !== stock ||
          !same(actual.size, block.size) || !same(actual.position, position) ||
          !basis.every((dir) => same(rotate(dir, actual.rotation), rotate(dir, rotation))) ||
          actual.cutPlanes.length || pieceThroughOpenings(actual).length) fail("A saved backing block moved, changed, or is missing. Review the wall before using these marks.");
      }
      const solid = prepareCollisionBox(block.size, block.position, block.rotation);
      const obstruction = prepared.find((item) => item.piece.id !== block.id && solidOverlap(solid, item.solid, epsilon));
      if (obstruction) fail(`${partLabel(project, obstruction.piece.id)} · ${obstruction.piece.name} ${obstruction.envelope ? "may obstruct" : "obstructs"} this block.`);
      const zone = project.workZone;
      const { min, max } = solid.bounds;
      if (min[1] < -epsilon || (zone && (max[1] > zone.height + epsilon ||
        min[0] < -zone.width / 2 - epsilon || max[0] > zone.width / 2 + epsilon ||
        min[2] < -zone.depth / 2 - epsilon || max[2] > zone.depth / 2 + epsilon))) fail("The backing lies outside the floor or work zone.");
      row = { block, first: first.piece.id, second: second.piece.id };
      blocks.set(key, row);
    }
    return { offset, receiver: row.block.id, kind: "block" as const, point, woodDepth: row.block.size[0],
      edge: Math.min(x - left, right - x, halfHeight) };
  });
  if (saved && (marks.some(({ receiver }, i) => receiver !== saved.receivers[i]) ||
    blocks.size !== savedBlocks.size)) throw Error("The wall changed where the saved mounting points land. Review the current stud and backing locations.");
  return { wall, marks, blocks: [...blocks.values()], elevation: {
    width, height: command.height, rowHeight: height,
    studs: studs.map(({ piece, ...rect }) => ({ id: piece.id, ...rect })), openings,
    blocks: [...blocks.values()].map(({ block }) => {
      const [center] = rotate(minus(block.position, wall.origin), inverse);
      return { id: block.id, left: center - block.size[1] / 2, right: center + block.size[1] / 2,
        low: height - halfHeight, high: height + halfHeight };
    }),
  } };
}

export function previewCabinetBacking(source: Project, rawInput: CabinetBackingInput, reuse: boolean) {
  const input = cabinetBackingInputSchema.parse(rawInput);
  const { wall, marks, blocks, elevation } = frameLayout(source, input);
  let project = ensurePartLabels({
    ...source, pieces: [...source.pieces, ...blocks.map(({ block }) => block)],
    sections: source.sections.map((section) => section.id === wall.id
      ? { ...section, pieceIds: [...section.pieceIds, ...blocks.map(({ block }) => block.id)] } : section),
  });
  const reuseCuts = new Map<string, { label: string; lengths: string[]; pending: boolean }>();
  if (reuse) {
    for (const { block } of [...blocks].sort((a, b) => b.block.size[1] - a.block.size[1])) {
      const [match] = fittingBoardOffcuts(project, [input.stock], block.size[1], inspectCutStock(project))
        .filter(({ operations }) => operations.every(({ kind }) => kind === "crosscut"));
      if (!match) continue;
      reuseCuts.set(block.id, { label: partLabel(project, match.piece.id),
        lengths: match.operations.map(({ text }) => text), pending: match.sourceCutPending });
      project = { ...project, pieces: project.pieces.map((piece) => piece.id === block.id
        ? { ...piece, stockLengthAxis: match.stockLengthAxis } : piece) };
      project = assignOffcutToPart(project, block.id, match.piece.id);
    }
  }
  const fresh = blocks.filter(({ block }) => !reuseCuts.has(block.id));
  const cutList = fresh.length
    ? bom({ ...project, pieces: fresh.map(({ block }) => block) }).find(({ id }) => id === input.stock)
    : undefined;
  if (cutList?.oversizedParts.length) throw Error("The new blocks need a stock and blade setup that can make each crosscut.");
  const groups = cutList?.bins.map(({ cuts }) => cuts.map(({ id }) => id)) ?? [];
  if (groups.length) project = planBoardCutGroups(project, groups);
  const plan: CabinetBackingPlan = {
    id: uid(), input, receivers: marks.map(({ receiver }) => receiver),
    blocks: blocks.map(({ block, first, second }) => ({ id: block.id, first, second })),
  };
  project = projectSchema.parse({ ...project, cabinetBacking: [...(project.cabinetBacking ?? []), plan], guideFingerprint: null });
  const prior = new Set(source.pieces.map(({ id }) => id));
  return { source, project, plan, marks, blocks, elevation, reuseCuts, boards: groups.length,
    offcuts: project.pieces.filter(({ id, offcut }) => offcut && !prior.has(id)),
    motion: [...new Set(blocks.flatMap(({ block }) => fittedPartMotionConflicts(project, block.id)))],
  };
}

export function cabinetBackingReviews(project: Project) {
  return (project.cabinetBacking ?? []).map((plan) => {
    try {
      const layout = frameLayout(project, plan.input, plan);
      const fastening = plan.fastening
        ? reviewCabinetScrewReach(project, plan, layout, plan.fastening.measurements, plan.fastening.finishAtMarks) : null;
      return { plan, layout, fastening, issue: null };
    } catch (cause) {
      return { plan, layout: null, fastening: null, issue: cause instanceof Error ? cause.message : "The backing measurements changed." };
    }
  });
}

export function previewCabinetScrewCheck(source: Project, planId: string, input: CabinetScrewMeasurements) {
  const plan = source.cabinetBacking?.find(({ id }) => id === planId);
  if (!plan) throw Error("This mounting row is missing. Choose a saved row.");
  const layout = frameLayout(source, plan.input, plan);
  const review = reviewCabinetScrewReach(source, plan, layout, input);
  const { measurements, finishAtMarks } = review;
  const project = projectSchema.parse({ ...source, guideFingerprint: null, cabinetBacking: source.cabinetBacking?.map((row) =>
    row.id === planId ? { ...row, fastening: { measurements, finishAtMarks } } : row) });
  return { source, project, review };
}

export function cabinetBackingGuideLines(project: Project) {
  return cabinetBackingReviews(project).flatMap(({ plan, layout, fastening, issue }) => {
    const wall = project.sections.find(({ id }) => id === plan.input.wallId);
    const title = `${wall?.name ?? "Wall"} · ${plan.input.face} face`;
    if (!layout) return [`${title}. Review this backing plan. ${issue}`];
    return [
      `${title}. Mark the row ${formatPreciseInches(plan.input.height)} above the wall base. Measure each offset from the wall’s local start, on either face.`,
      ...layout.marks.map(({ offset, receiver, kind, edge }) =>
        `${formatPreciseInches(offset)} from start → ${partLabel(project, receiver)} (${kind === "stud" ? "existing stud" : "added backing"}). Nearest modeled face edge ${formatPreciseInches(edge)} from the mark.`),
      ...layout.blocks.map(({ block, first, second }) =>
        `${partLabel(project, block.id)} · square-cut to ${formatPreciseInches(block.size[1])}. Fit flush between ${partLabel(project, first)} and ${partLabel(project, second)} before hanging drywall.`),
      ...(fastening ? cabinetScrewGuideLines(project, fastening) : []),
    ];
  });
}
