import { inspectCutStock } from "./cutStock";
import { flatCasing } from "./doorCasingReference";
import { finishedPanel, measuredBandingByPanel } from "./edgeBanding";
import { formatPreciseInches } from "./measurement";
import { material, part, projectSchema, type Piece, type Project, type V3 } from "./model";
import { assignOffcutToPart, fittingOffcuts } from "./offcutAssignment";
import { ensurePartLabels, partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { rotate } from "./spatial";
import { orientedStockSize, stockAxes } from "./stockAxes";
import { scribeFillerInputSchema, type ScribeFillerInput, type ScribeFillerRecord } from "./scribeFillerSchema";

export const scribeFillerTitle = "Cabinet scribe fillers";
export const scribeInstallation = "https://cardellcabinetry.s3.amazonaws.com/Literature/2212_CAR_InstallationGuide_1014850420.pdf#page=27";
export const scribeScope = "Dry-fit the cabinet plumb and level. Transfer the actual wall contour to the wide blank before cutting and check the chosen cabinet attachment.";
export const scribeStockNames = { [flatCasing.id]: "1 × 3 select pine", "hd-pine-1x4": "1 × 4 common pine" };
const EPS = 1e-7;
const midpointTolerance = 1 / 16;

export function scribeSidePanels(project: Project) {
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  return project.pieces.filter((piece) => {
    const stock = material(piece.material);
    const up = rotate([0, 1, 0], piece.rotation);
    return !piece.offcut && !moving.has(piece.id) && stock.wood && stock.stockKind === "sheet" &&
      !piece.cutPlanes.length && !piece.rectangularOpenings?.length && !piece.roundOpenings?.length &&
      stockAxes(piece, piece.cutStock?.size ?? piece.size).thickness === 0 && up[1] >= 1 - EPS;
  });
}

function fillerWidths(input: ScribeFillerInput) {
  const midShift = (input.bottom + input.top) / 2 - input.middle;
  if (Math.abs(midShift) > midpointTolerance + EPS)
    throw Error("The middle reading differs by more than 1/16 in from a straight taper. Trace the actual wall contour before cutting.");
  const inset = input.wallGap + Math.max(0, midShift);
  const bottom = input.bottom - inset, top = input.top - inset;
  if (bottom <= EPS || top <= EPS) throw Error("The selected wall gap leaves no filler at one end.");
  return { bottom, top, inset };
}

function shapeFiller(panel: Piece, input: ScribeFillerInput, blankWidth: number, thickness: number) {
  const { bottom, top } = fillerWidths(input);
  const side = input.side === "left" ? -1 : 1, front = input.front === "front" ? 1 : -1;
  const local: V3 = [
    side * (panel.size[0] + blankWidth) / 2,
    input.start + (input.height - panel.size[1]) / 2,
    front * ((panel.size[2] - thickness) / 2 - input.setback),
  ];
  const position = rotate(local, panel.rotation).map((value, i) => value + panel.position[i]) as V3;
  const slope = (top - bottom) / input.height;
  const norm = Math.hypot(1, slope);
  const cutPlanes = Math.min(bottom, top) + EPS >= blankWidth ? [] : [{
    normal: [side / norm, -slope / norm, 0] as V3,
    constant: (bottom + top - blankWidth) / (2 * norm),
  }];
  return { position, cutPlanes, rotation: panel.rotation, size: [blankWidth, input.height, thickness] as V3 };
}

export function previewScribeFiller(project: Project, raw: ScribeFillerInput, reuse: boolean) {
  const input = scribeFillerInputSchema.parse(raw);
  const original = scribeSidePanels(project).find(({ id }) => id === input.panelId);
  if (!original) throw Error("Choose a stationary, upright rectangular cabinet side with its thickness along local X.");
  const profiles = measuredBandingByPanel(project);
  const panel = finishedPanel(original, profiles);
  const widths = fillerWidths(input);
  const [thickness, stockWidth, stockHeight] = [...material(input.stock).size].sort((a, b) => a - b);
  if (input.start + input.height > panel.size[1] + EPS || input.height > stockHeight + EPS)
    throw Error("The filler length and starting mark need to fit the cabinet side and selected board.");
  if (input.setback + thickness > panel.size[2] + EPS)
    throw Error("The setback leaves too little cabinet depth for this filler.");
  const required = Math.max(widths.bottom, widths.top);
  if (required > stockWidth + EPS) throw Error("Choose wider stock for the measured gap.");

  const ids = new Set(project.pieces.map(({ id }) => id));
  const available = (project.scribeFillers ?? []).filter(({ partId }) => ids.has(partId));
  const touching = available.some(({ input: prior }) => prior.panelId === input.panelId && prior.side === input.side &&
    prior.front === input.front && Math.min(prior.start + prior.height, input.start + input.height) - Math.max(prior.start, input.start) > EPS);
  if (touching) throw Error("A scribe filler is already fitted along this part of the cabinet side.");

  const section = project.sections.find(({ pieceIds }) => pieceIds.includes(panel.id));
  const base = part("Cabinet wall filler", input.stock, [stockWidth, input.height, thickness], [0, 0, 0],
    panel.stepId, section?.name ?? panel.assembly);
  base.stockLengthAxis = 1;
  const mayFit = reuse ? new Set(project.pieces.flatMap((piece) => {
    if (!piece.offcut || piece.material !== input.stock) return [];
    const [, width] = orientedStockSize(piece);
    return width + EPS >= required ? [width] : [];
  })) : new Set<number>();
  const inspection = mayFit.size ? inspectCutStock(project) : undefined;
  const options = inspection ? [...mayFit].flatMap((width) => {
    const size: V3 = [width, input.height, thickness];
    return fittingOffcuts(project, { ...base, size }, inspection)
      .filter(({ available }) => Math.abs(available[1] - width) < EPS);
  }).sort((a, b) => Number(b.onHand) - Number(a.onHand) ||
    a.available[1] * a.available[2] - b.available[1] * b.available[2]) : [];
  const match = options[0];
  const filler = { ...base, ...shapeFiller(panel, input, match?.available[1] ?? stockWidth, thickness) };
  const shape = prepareCollisionSolid(filler);
  if (!shape) throw Error("The current marks do not leave a usable filler.");
  const zone = project.workZone;
  if (shape.vertices.some(([x, y, z]) => y < -EPS || (zone && (
    Math.abs(x) > zone.width / 2 + EPS || Math.abs(z) > zone.depth / 2 + EPS || y > zone.height + EPS
  )))) throw Error("The modeled filler extends outside the work zone.");
  for (const raw of project.pieces) {
    if (raw.offcut || raw.id === panel.id) continue;
    const other = finishedPanel(raw, profiles);
    const solid = prepareCollisionSolid(other);
    if (solidOverlap(shape, solid ?? prepareCollisionBox(other.size, other.position, other.rotation), EPS))
      throw Error(`Check ${partLabel(project, raw.id)} · ${raw.name}. It intersects the filler in the saved pose.`);
  }
  const draft = ensurePartLabels({ ...project, pieces: [...project.pieces, filler] });
  const withStock = match ? assignOffcutToPart(draft, filler.id, match.piece.id) : draft;
  const measuredPanel = { size: panel.size, position: panel.position, rotation: panel.rotation };
  const candidate = projectSchema.parse({
    ...withStock, guideFingerprint: null,
    sections: withStock.sections.map((row) => row.id === section?.id ? { ...row, pieceIds: [...row.pieceIds, filler.id] } : row),
    scribeFillers: [...available, { input, measuredPanel, partId: filler.id }],
  });
  return { source: project, project: candidate, filler, panel, input, widths, match };
}

export function scribeFillerMarks(record: Pick<ScribeFillerRecord, "input">) {
  const { bottom, top } = fillerWidths(record.input);
  return `Mark ${formatPreciseInches(bottom)} at the bottom and ${formatPreciseInches(top)} at the top from the straight cabinet edge.`;
}

function numberFieldsEqual(a: V3, b: V3) {
  return a.every((n, i) => Math.abs(n - b[i]) < 1e-6);
}

export function scribeFillerReviews(project: Project) {
  if (!project.scribeFillers?.length) return [];
  const panels = new Map(scribeSidePanels(project).map((piece) => [piece.id, piece]));
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const banding = measuredBandingByPanel(project);
  return project.scribeFillers.flatMap<{ record: ScribeFillerRecord; label: string; issue?: string }>((record) => {
    const filler = pieces.get(record.partId);
    if (!filler || filler.offcut) return [];
    const raw = panels.get(record.input.panelId);
    const panel = raw && finishedPanel(raw, banding);
    const label = `${partLabel(project, filler.id)} · Filler beside ${partLabel(project, record.input.panelId)}`;
    const { measuredPanel } = record;
    if (!panel || !numberFieldsEqual(panel.size, measuredPanel.size) || !numberFieldsEqual(panel.position, measuredPanel.position) ||
        !numberFieldsEqual(panel.rotation, measuredPanel.rotation))
      return [{ record, label, issue: "The cabinet side has changed since measurement. Recheck all three wall gaps." }];
    try {
      const { bottom, top } = fillerWidths(record.input);
      const expected = shapeFiller(panel, record.input, filler.size[0], 0.75);
      if (filler.material !== record.input.stock || !numberFieldsEqual(expected.size, filler.size) ||
          !numberFieldsEqual(expected.position, filler.position) || !numberFieldsEqual(expected.rotation, filler.rotation) ||
          filler.size[0] + EPS < Math.max(bottom, top) ||
          JSON.stringify(expected.cutPlanes) !== JSON.stringify(filler.cutPlanes))
        return [{ record, label, issue: "The filler has changed. Verify its cut marks and measured fit." }];
      return [{ record, label, issue: undefined }];
    } catch {
      return [{ record, label, issue: "Review the current filler and wall measurements." }];
    }
  });
}

export function scribeFillerGuideLines(project: Project) {
  return scribeFillerReviews(project).map(({ record, label, issue }) => {
    if (issue) return `${label}. ${issue}`;
    const { input } = record;
    return `${label}. ${formatPreciseInches(input.height)} blank starting ${formatPreciseInches(input.start)} above the cabinet bottom. ${scribeFillerMarks(record)} Cut the wall edge and dry-fit.`;
  });
}
