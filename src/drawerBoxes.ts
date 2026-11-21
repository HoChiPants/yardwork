import { drawerSlideProducts, drawerSlideReference, type DrawerSlideProductId } from "./drawerSlideReference";
import { rectangularDrawerPanelBounds, reviewDrawerSlide } from "./drawerSlides";
import { pureBondCasework } from "./homeDepotCaseworkReference";
import { formatPreciseInches } from "./measurement";
import { material, part, step, type MaterialId, type Piece, type Project, type V3 } from "./model";
import { reviewMotion, saveMotionPlan } from "./mechanismMotion";
import { createSection } from "./sections";
import { rotate } from "./spatial";

const epsilon = 1e-7;
const up: V3 = [0, 1, 0];
const basis: V3[] = [[1, 0, 0], up, [0, 0, 1]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const drawerBoxStock = [pureBondCasework.materialId, "plywood"] as const;
export const defaultDrawerSideGap = 33 / 64;
export const drawerMemberSetback = 1 / 8;

function panelNormal(piece: Piece) {
  if (piece.offcut) return null;
  const thickness = Math.min(...piece.size);
  const index = piece.size.indexOf(thickness);
  if (piece.size.some((size, i) => i !== index && size <= thickness + epsilon)) return null;
  const normal = rotate(basis[index], piece.rotation);
  if (Math.abs(normal[1]) > epsilon || !basis.some((axis) =>
    Math.abs(dot(rotate(axis, piece.rotation), up)) >= 1 - epsilon))
    return null;
  return normal;
}

export function drawerCabinetPanels(project: Project) {
  const moving = new Set(project.motionPlans?.flatMap(({ memberIds }) => memberIds));
  return project.pieces.filter((piece) => {
    const stock = material(piece.material);
    return stock.wood && stock.stockKind === "sheet" && !moving.has(piece.id) && !!panelNormal(piece) &&
      !piece.cutPlanes.length && !piece.roundOpenings?.length && !piece.rectangularOpenings?.length;
  });
}

export function drawerBoxOpening(
  project: Project,
  panelIds: readonly [string, string],
  reverse = false,
) {
  const [leftId, rightId] = reverse ? [panelIds[1], panelIds[0]] : panelIds;
  const panels = drawerCabinetPanels(project);
  const left = panels.find(({ id }) => id === leftId);
  const right = panels.find(({ id }) => id === rightId);
  if (!left || !right || left === right)
    throw Error("Choose two different fixed, upright wood panels for the cabinet sides.");
  const normal = panelNormal(left)!;
  const offset = right.position.map((n, i) => n - left.position[i]) as V3;
  const rightAxis = dot(normal, offset) >= 0 ? normal : normal.map((n) => -n) as V3;
  const frontAxis: V3 = [-rightAxis[2], 0, rightAxis[0]];
  const frame = [rightAxis, up, frontAxis];
  const a = rectangularDrawerPanelBounds(left, frame);
  const b = rectangularDrawerPanelBounds(right, frame);
  if (!a || !b || Math.abs(dot(rightAxis, panelNormal(right)!)) < 1 - epsilon)
    throw Error("Use two parallel panel faces facing into the same cabinet opening.");
  const width = b[0].min - a[0].max;
  const bottom = Math.max(a[1].min, b[1].min);
  const top = Math.min(a[1].max, b[1].max);
  const back = Math.max(a[2].min, b[2].min);
  const front = Math.min(a[2].max, b[2].max);
  if (width <= epsilon || top - bottom <= epsilon || front - back <= epsilon)
    throw Error("The cabinet sides need a clear gap and overlapping height and depth.");
  return {
    panelIds: [leftId, rightId] as [string, string],
    rightAxis, frontAxis,
    center: (a[0].max + b[0].min) / 2,
    width, bottom, top, back, front,
  };
}

type Opening = ReturnType<typeof drawerBoxOpening>;
export function drawerBoxSlideChoices(opening: Opening, frontInset: number, rearGap: number, faceThickness: number) {
  const depth = opening.front - opening.back - frontInset - rearGap - faceThickness;
  return {
    depth,
    available: drawerSlideProducts.filter((slide) => slide.closedLength + drawerMemberSetback <= depth + epsilon),
  };
}

export type DrawerBoxInput = {
  panelIds: [string, string];
  reverse: boolean;
  label: string;
  stockId: MaterialId;
  bottomOffset: number;
  height: number;
  sideGap: number;
  frontInset: number;
  rearGap: number;
  finishFront: boolean;
  reveal: number;
  depth: number;
  slideId: DrawerSlideProductId;
};

export function previewDrawerBox(project: Project, input: DrawerBoxInput) {
  const {
    panelIds, reverse, stockId, bottomOffset, height, depth, sideGap,
    frontInset, rearGap, finishFront, reveal, slideId,
  } = input;
  const label = input.label.trim() || "Drawer box";
  const opening = drawerBoxOpening(project, panelIds, reverse);
  const reference = drawerSlideReference(slideId);
  if (!reference) throw Error("Choose a cataloged drawer slide pair.");
  if (!drawerBoxStock.some((id) => id === stockId)) throw Error("Choose a drawer plywood stock.");
  if (![bottomOffset, height, depth, sideGap, frontInset, rearGap, reveal].every(Number.isFinite) ||
      bottomOffset < 0 || frontInset < 0 || rearGap < 0 || reveal < 0)
    throw Error("Enter the drawer dimensions and clearances as positive measurements.");
  if (sideGap < reference.minSideGap || sideGap > reference.maxSideGap)
    throw Error("Enter 0.500 to 0.531 in of side space on each side for this slide pair.");
  const t = Math.min(...material(stockId).size);
  if (height - t < reference.height - epsilon)
    throw Error(`Allow ${formatPreciseInches(reference.height)} of vertical mounting space above the drawer bottom.`);
  const width = opening.width - 2 * sideGap;
  if (width > reference.maxDrawerWidth + epsilon)
    throw Error(`This slide reference covers drawer boxes up to ${reference.maxDrawerWidth} in wide. Check the chosen opening or use another documented slide setup.`);
  if (width <= 2 * t + epsilon) throw Error("The opening is too narrow for these drawer walls and slide gaps.");
  const choices = drawerBoxSlideChoices(opening, frontInset, rearGap, finishFront ? t : 0);
  if (depth > choices.depth + epsilon)
    throw Error(`This cabinet leaves ${formatPreciseInches(choices.depth)} of box depth at the entered front and rear clearances.`);
  if (depth < reference.closedLength + drawerMemberSetback - epsilon)
    throw Error("The box needs room for the closed rail and its ⅛ in front setback.");
  const low = opening.bottom + bottomOffset;
  if (low + height > opening.top + epsilon)
    throw Error("The drawer exceeds the selected cabinet panels' common height at this elevation.");
  if (finishFront && opening.width <= 2 * reveal + epsilon)
    throw Error("The two finished-front reveals leave no panel width.");

  const cabinetFront = opening.front - frontInset;
  const boxFront = cabinetFront - (finishFront ? t : 0);
  const boxBack = boxFront - depth;
  const midZ = (boxFront + boxBack) / 2;
  const midY = low + (height + t) / 2;
  const inner = width - 2 * t;
  const stepTitle = `${label} · Cut and fit`;
  const notes = [
    "Dry-fit the five panels square with the front and back between the sides and the bottom under the walls.",
    `Confirm the ${formatPreciseInches(sideGap)} side gap on each side against the delivered slides. Check mounting faces, screw length and bottom attachment before drilling.`,
    ...(finishFront ? [`Fit the finished front after the drawer is on its slides. Check the ${formatPreciseInches(reveal)} side reveals in the actual opening.`] : []),
    "Check the installed rail positions, drawer load, and opening and closing clearance with the handle and surrounding trim.",
  ].join(" ");
  const buildStep = step(stepTitle, notes);
  const rotation: V3 = [0, Math.atan2(opening.frontAxis[0], opening.frontAxis[2]), 0];
  const position = (x: number, y: number, z: number) => [
    x * opening.rightAxis[0] + z * opening.frontAxis[0],
    y,
    x * opening.rightAxis[2] + z * opening.frontAxis[2],
  ] as V3;
  const add = (role: string, size: V3, x: number, y: number, z: number, grain: 0 | 2) => ({
    ...part(`${label} · ${role}`, stockId, size, position(x, y, z), buildStep.id, label, rotation),
    stockLengthAxis: grain,
  });
  const boxLeft = add("left side", [t, height - t, depth], opening.center - (width - t) / 2, midY, midZ, 2);
  const boxRight = add("right side", [t, height - t, depth], opening.center + (width - t) / 2, midY, midZ, 2);
  const pieces = [
    boxLeft, boxRight,
    add("box front", [inner, height - t, t], opening.center, midY, boxFront - t / 2, 0),
    add("box back", [inner, height - t, t], opening.center, midY, boxBack + t / 2, 0),
    add("bottom", [width, t, depth], opening.center, low + t / 2, midZ, 2),
    ...(finishFront ? [add("finished front", [opening.width - 2 * reveal, height, t],
      opening.center, low + height / 2, cabinetFront - t / 2, 0)] : []),
  ];
  const memberIds = pieces.map(({ id }) => id);
  const section = createSection({
    ...project, pieces: [...project.pieces, ...pieces], steps: [...project.steps, buildStep], guideFingerprint: null,
  }, memberIds, label);
  const candidate = saveMotionPlan(section.project, {
    label,
    memberIds,
    mechanism: {
      kind: "slide", axis: opening.frontAxis, travel: reference.travel,
      drawerSlide: {
        productId: slideId, cabinetLeft: opening.panelIds[0], drawerLeft: boxLeft.id,
        drawerRight: boxRight.id, cabinetRight: opening.panelIds[1],
      },
    },
  });
  const fit = reviewDrawerSlide(candidate.project, candidate.plan);
  if (!fit?.ready) throw Error(fit?.rows.find(({ matches }) => !matches)?.detail ?? "The selected slide does not fit this box.");
  const review = reviewMotion(candidate.project, candidate.plan);
  return {
    ...candidate, width, height, depth, pieces, reference, review,
    closed: review.preview(0),
  };
}
