import { defaultDrawerSideGap, drawerBoxOpening, drawerBoxSlideChoices, drawerBoxStock, previewDrawerBox } from "./drawerBoxes";
import { drawerSlideDemand } from "./drawerSlides";
import { bounds } from "./engine";
import { furnitureMeasurements, namedMeasurement, normalizeIdeaText } from "./ideaEdits";
import { formatPreciseInches } from "./measurement";
import { reviewMotion } from "./mechanismMotion";
import { isHardware, material, type Project, type V3 } from "./model";
import type { PlanModule } from "./planSchema";
import { previewIdeaPlan } from "./planning";
import { gapToSiteFace, siteClearanceFacesByPart, siteClearanceTolerance, worldClearanceShape } from "./siteClearance";
import { pieceOverlap } from "./solidCollision";
import { addSupply } from "./supplies";

export const maxCabinetDrawers = 4;
export const maxCabinetBays = 3;
export const defaultCabinetDrawerHeight = 4;
export const defaultCabinetDrawerGap = 0.25;
type DrawerCabinetDimensions = { width: number; depth: number; height: number };
type CabinetStock = (typeof drawerBoxStock)[number];
type DrawerCabinetInput = DrawerCabinetDimensions & {
  bayCount: number;
  drawerHeights: readonly number[];
  drawerGap: number;
  position: V3;
  stock: CabinetStock;
  barPull: boolean;
};
export type DrawerCabinetRequest = {
  dimensions: DrawerCabinetDimensions;
  bayCount: number;
  drawerHeights: number[];
  assumed: string[];
  barPull: boolean;
  issue?: string;
};

const heightLabels = "high|height|tall";
const unsupportedLayout = "Choose one to four drawers stacked in a framed cabinet. Enter one height for all drawers or list their heights from top to bottom.";

export function drawerCabinetRequest(prompt: string): DrawerCabinetRequest | null {
  const text = normalizeIdeaText(prompt).trim();
  const pull = /(?: and| with) (?:(?:a|matching) )?(?:bar |cabinet )?(?:pulls?|handles?)$/.exec(text);
  const layout = pull ? text.slice(0, pull.index) : text;
  const match = /^(?<cabinet>.*?\bcabinet\b.*?)\s+with\s+(?<drawer>.*\bdrawers?\b.*)$/.exec(layout)?.groups;
  const named = /^(?<prefix>.*?)\b(?<count>\d+)[ -]drawer\s+(?<body>(?:base )?cabinet\b.*)$/.exec(layout)?.groups;
  if (!match && !named) return null;
  const cabinet = match?.cabinet ?? `${named!.prefix}${named!.body}`;
  if (/\b(?:existing|current|this|my|the) (?:base )?cabinet\b/.test(cabinet) || /\badd .+\bdrawers?\b.+\bto\b/.test(cabinet)) return null;
  const drawerClause = match?.drawer ?? "";
  const bayPrefix = /^(\d+)\s+(?:bays?|cabinets?)\s+and\s+/.exec(drawerClause);
  const perBay = /\s+(?:per (?:bay|cabinet)|in each (?:bay|cabinet))(?=\s|,|$)/;
  const bayCount = Number(bayPrefix?.[1] ?? 1);
  const validBays = Number.isInteger(bayCount) && bayCount >= 1 && bayCount <= maxCabinetBays;
  const drawerSpec = drawerClause.slice(bayPrefix?.[0].length ?? 0).replace(perBay, "");
  const assumed: string[] = [];
  const dimensions = { width: 18 * (validBays ? bayCount : 1), depth: 24, height: 34 };
  let drawerHeights: number[] = [];
  let issue: string | undefined;
  try {
    const { width, depth, height } = furnitureMeasurements(cabinet);
    const spec = /^(?:(?<count>\d+)\s+(?!(?:feet|foot|ft|inches|inch|in)\b|[′'″"]|\d+\/)|(?:a single|single|a)\s+)?(?<before>.*?)\b(?<noun>drawers?)\b(?<after>.*)$/.exec(drawerSpec)?.groups;
    const count = Number(named?.count ?? spec?.count ?? (spec?.noun === "drawer" ? 1 : NaN));
    const qualifier = spec && `${spec.before} ${spec.after}`.trim()
      .replace(/\s+/g, " ").replace(/^,\s*/, "").replace(/^stacked(?:\s+|$)/, "");
    const each = !!qualifier && /(?:^each\b|\beach$)/.test(qualifier);
    const details = qualifier?.replace(/^each(?:\s+|$)/, "").replace(/\s+(?:each|from top to bottom)$/, "");
    if (!validBays || (!bayPrefix && (/\bcabinet run\b/.test(cabinet) || perBay.test(drawerClause))) ||
        (bayCount > 1 && !perBay.test(drawerClause))) {
      issue = "For a cabinet run, give the total width and specify the bay count and drawers per bay, such as two bays and two drawers per bay.";
    } else if (!Number.isInteger(count) || count < 1 || count > maxCabinetDrawers ||
        /\b(?:doors?|shel(?:f|ves)|frameless|double|multiple)\b/.test(cabinet)) {
      issue = unsupportedLayout;
    } else if (!details) {
      drawerHeights = Array<number>(count).fill(defaultCabinetDrawerHeight);
      assumed.push(count === 1 ? "drawer height" : "drawer heights");
    } else {
      const list = details.replace(/\s+(?:high|tall)$/, "").split(/,\s*(?:and\s+)?|\s+and\s+/).map((item) => item.trim());
      if (count > 1 && !each && list.length > 1) {
        const values = list.map((item) => {
          const measured = namedMeasurement(`${item} high`, heightLabels);
          return measured?.raw === `${item} high` ? measured.inches : null;
        });
        if (list.length === count && values.every((value) => value != null)) drawerHeights = values;
        else issue = unsupportedLayout;
      } else {
        const common = namedMeasurement(details, heightLabels);
        if (!common || common.raw.trim() !== details) issue = unsupportedLayout;
        else if (common.inches === null) issue = "Include feet or inches for drawer height.";
        else drawerHeights = Array<number>(count).fill(common.inches);
      }
    }
    if (/(?<=\d)\s*[x×]\s*(?=\d)/.test(cabinet) || (!width && !depth && !height && /\d/.test(cabinet))) {
      issue = "Name each cabinet measurement to confirm its direction, such as 18 in wide, 24 in deep and 34 in tall.";
    }
    for (const [key, fact] of Object.entries({ width, depth, height }) as
      [keyof DrawerCabinetDimensions, ReturnType<typeof namedMeasurement>][]) {
      if (fact?.inches != null) dimensions[key] = fact.inches;
      else {
        const label = `cabinet ${key}`;
        assumed.push(label);
        if (fact) issue = `Include feet or inches for the ${label}.`;
      }
    }
  } catch (error) {
    issue = error instanceof Error ? error.message : "Check the cabinet dimensions.";
  }
  return { dimensions, bayCount, drawerHeights, assumed, barPull: !!pull, issue };
}

export function previewDrawerCabinet(project: Project, input: DrawerCabinetInput) {
  const { width, depth, height, bayCount, drawerHeights, drawerGap, stock, position, barPull } = input;
  if (!Number.isInteger(bayCount) || bayCount < 1 || bayCount > maxCabinetBays) {
    throw Error("Choose one to three cabinet bays.");
  }
  if (!drawerHeights.length || drawerHeights.length > maxCabinetDrawers ||
      drawerHeights.some((height) => !Number.isFinite(height) || height <= 0)) {
    throw Error("Enter a positive height for each of one to four drawers.");
  }
  if (drawerHeights.length > 1 && (!Number.isFinite(drawerGap) || drawerGap < 1 / 16 || drawerGap > 2)) {
    throw Error("Choose a gap from 1/16 to 2 inches between drawer fronts.");
  }
  const bayWidth = width / bayCount;
  const modules = Array.from({ length: bayCount }, (_, index): PlanModule => ({
    kind: "cabinet", name: bayCount === 1 ? "Drawer cabinet" : `Drawer cabinet · bay ${index + 1}`,
    width: bayWidth, depth, height,
    position: [position[0] - width / 2 + (index + 0.5) * bayWidth, position[1], position[2]], yaw: 0,
    frameMaterial: "stud", panelMaterial: stock, backHeight: 0, levels: 1,
    storage: false, openingLid: false, lidOpen: false,
  }));
  const cabinet = previewIdeaPlan(project, {
    title: bayCount === 1 ? "Framed cabinet with drawers" : "Cabinet run with fitted drawers",
    summary: bayCount === 1
      ? "A framed cabinet with plywood sides, back and top and fitted inset drawers below the top rails."
      : `${bayCount} equal-width adjacent cabinets with ${drawerHeights.length} inset drawers per bay.`,
    assumptions: [], questions: [], suggestions: [], structures: [],
    modules,
  });
  if (!cabinet.workZoneFits) throw Error("The cabinet extends outside the work zone. Adjust its dimensions or placement.");
  const body = cabinet.project.pieces.slice(project.pieces.length);
  const obstacles = project.pieces.filter((piece) => !piece.offcut && !isHardware(piece.material))
    .map((piece) => ({ piece, box: bounds(piece) }));
  const faces = siteClearanceFacesByPart(cabinet.project);
  for (const piece of body) {
    const box = bounds(piece);
    const obstacle = obstacles.find((other) => box.min.every((low, axis) =>
      Math.min(box.max[axis], other.box.max[axis]) - Math.max(low, other.box.min[axis]) > 0.01) &&
      pieceOverlap(piece, other.piece) !== false);
    if (obstacle) throw Error(`The cabinet overlaps ${obstacle.piece.name}. Adjust its placement.`);
    for (const face of faces.get(piece.id) ?? []) {
      const gap = gapToSiteFace(worldClearanceShape(piece), face);
      if (gap !== null && gap < face.minimum - siteClearanceTolerance) {
        throw Error(`The cabinet conflicts with ${face.label}. Adjust its placement.`);
      }
    }
  }
  const partById = new Map(body.map((piece) => [piece.id, piece]));
  const cabinetSteps = new Set<string>();
  const openings = cabinet.project.sections.slice(project.sections.length).map((section) => {
    const members = section.pieceIds.map((id) => partById.get(id));
    const left = members.find((piece) => piece?.designRole === "left-infill");
    const right = members.find((piece) => piece?.designRole === "right-infill");
    if (!left || !right) throw Error("Each cabinet bay needs two side panels.");
    cabinetSteps.add(left.stepId);
    return drawerBoxOpening(cabinet.project, [left.id, right.id]);
  });
  const opening = openings[0];
  const thickness = Math.min(...material(stock).size);
  const frontInset = 0;
  const rearGap = thickness + 0.125;
  const choices = drawerBoxSlideChoices(opening, frontInset, rearGap, thickness);
  const slide = choices.available.at(-1);
  if (!slide) throw Error("The cabinet is too shallow for the available slides. Increase the depth.");
  const boxWidth = opening.width - defaultDrawerSideGap * 2;
  if (boxWidth > slide.maxDrawerWidth + 1e-7) {
    throw Error(`Each drawer box would be ${formatPreciseInches(boxWidth)} wide. These slides support up to ${slide.maxDrawerWidth} in. Choose more bays or reduce the total width.`);
  }
  const railGap = 0.25;
  const gap = drawerHeights.length > 1 ? drawerGap : 0;
  const stackHeight = drawerHeights.reduce((sum, height) => sum + height, 0) + (drawerHeights.length - 1) * gap;
  if (stackHeight + railGap > opening.top - opening.bottom) {
    throw Error("The drawer heights and gaps exceed the cabinet opening. Reduce the stack height or raise the cabinet top.");
  }
  let candidate = cabinet.project;
  const usedLabels = new Set([
    ...candidate.sections.map(({ name }) => name.toLowerCase()),
    ...(candidate.motionPlans ?? []).map(({ label }) => label.toLowerCase()),
  ]);
  const drawers = openings.flatMap((bay, bayIndex) => {
    let top = bay.top - railGap;
    return drawerHeights.map((height, index) => {
      const baseLabel = bayCount > 1 ? `Bay ${bayIndex + 1} · Drawer ${index + 1}`
        : drawerHeights.length === 1 ? "Cabinet drawer" : `Cabinet drawer ${index + 1}`;
      let label = baseLabel;
      for (let suffix = 2; usedLabels.has(label.toLowerCase()); suffix++) label = `${baseLabel} (${suffix})`;
      usedLabels.add(label.toLowerCase());
      const drawer = previewDrawerBox(candidate, {
        panelIds: bay.panelIds, reverse: false, label, stockId: stock,
        bottomOffset: Math.max(0, top - bay.bottom - height), height, frontInset, rearGap,
        sideGap: defaultDrawerSideGap, finishFront: true, reveal: 0.125,
        depth: Math.min(slide.travel, choices.depth), slideId: slide.productId, barPull,
      });
      candidate = drawer.project;
      top -= height + gap;
      return { plan: drawer.plan, width: drawer.width, depth: drawer.depth, height, pullScrewReview: drawer.pullScrewReview };
    });
  });
  const productId = slide.productId;
  const addedPairs = drawerSlideDemand(candidate, productId).missing - drawerSlideDemand(project, productId).missing;
  if (addedPairs > 0) candidate = addSupply(candidate, productId, addedPairs, "Cabinet drawer slide pairs",
    "Confirm the delivered slides and mounting screw fit before drilling.");
  const mountNote = "Level and square the cabinet, then secure the cabinet frame to suitable structural backing before loading the drawers. Confirm rails, front gaps and fastener reach using the delivered hardware.";
  const runNote = bayCount > 1 ? " Align adjacent cabinet faces and verify their connection and anchoring for the installation." : "";
  candidate = {
    ...candidate,
    steps: candidate.steps.map((step) => cabinetSteps.has(step.id) ? { ...step, notes: mountNote + runNote } : step),
  };
  const reviewed = drawers.map((drawer) => {
    const review = reviewMotion(candidate, drawer.plan);
    const closed = review.preview(0);
    if (closed.interferenceIds.length || closed.outsideZoneFaces.length || closed.siteFaceHits.length) {
      throw Error(`${drawer.plan.label} conflicts with surrounding parts or a clearance limit when closed. Adjust the cabinet's placement or size.`);
    }
    return { ...drawer, review, closed };
  });
  return { project: candidate, drawers: reviewed, reference: slide };
}
