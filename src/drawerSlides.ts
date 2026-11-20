import { accuride3732 as reference } from "./drawerSlideReference";
import { formatPreciseInches as inches } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import {
  drawerSideLabels,
  type DrawerSlideSetup,
  type MotionPlan,
} from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import { rotate } from "./spatial";
import { addSupply } from "./supplies";

const epsilon = 1e-7;
const keys = Object.keys(drawerSideLabels) as Array<
  keyof typeof drawerSideLabels
>;
const basis: V3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rectangularBounds(part: Piece, frame: V3[]) {
  const stock = material(part.material);
  if (!stock.wood || stock.stockKind !== "sheet" || part.cutPlanes?.length || part.roundOpenings?.length || part.rectangularOpenings?.length)
    return null;
  const directions = basis.map((axis) => rotate(axis, part.rotation));
  if (
    directions.some(
      (direction) =>
        !frame.some((axis) => Math.abs(dot(direction, axis)) >= 1 - epsilon),
    )
  )
    return null;

  return frame.map((axis) => {
    const center = dot(part.position, axis);
    const half = directions.reduce(
      (span, direction, index) =>
        span + (Math.abs(dot(direction, axis)) * part.size[index]) / 2,
      0,
    );
    return { min: center - half, max: center + half };
  });
}

type FitRow = { label: string; detail: string; matches: boolean };
type DrawerSlideReview = {
  setup: DrawerSlideSetup;
  rows: FitRow[];
  ready: boolean;
};

/** Compare selected flat mounting panels in the drawer's closed position. */
export function reviewDrawerSlide(
  project: Project,
  plan: MotionPlan,
): DrawerSlideReview | null {
  const mechanism = plan.mechanism;
  if (mechanism.kind !== "slide" || !mechanism.drawerSlide) return null;
  const setup = mechanism.drawerSlide;
  const rows: FitRow[] = [];
  const add = (label: string, detail: string, matches: boolean) =>
    rows.push({ label, detail, matches });
  const finish = () => ({
    setup,
    rows,
    ready: rows.every((row) => row.matches),
  });
  const parts = new Map(
    project.pieces
      .filter((piece) => !piece.offcut)
      .map((piece) => [piece.id, piece]),
  );
  const members = new Set(plan.memberIds);
  const travelOk = mechanism.travel <= reference.travel + epsilon;
  add(
    "Extension",
    `Modeled ${inches(mechanism.travel)}. Documented travel ${inches(reference.travel)}.`,
    travelOk,
  );
  for (const key of keys) {
    const id = setup[key];
    const moving = key.startsWith("drawer");
    if (!parts.has(id) || members.has(id) !== moving)
      add(
        drawerSideLabels[key],
        moving
          ? "Choose an active panel that moves with the drawer."
          : "Choose a fixed cabinet panel.",
        false,
      );
  }
  if (rows.length > 1) return finish();
  const anchor = parts.get(plan.memberIds[0]);
  if (!anchor || plan.memberIds.some((id) => !parts.has(id))) {
    add(
      "Moving parts",
      "Replace missing moving parts before reviewing the slide fit.",
      false,
    );
    return finish();
  }
  const axis = rotate(mechanism.axis, anchor.rotation);
  if (Math.abs(axis[1]) > epsilon) {
    add(
      "Slide direction",
      "Set a horizontal direction toward the cabinet opening.",
      false,
    );
    return finish();
  }
  const [x, , z] = axis;
  const frame: V3[] = [
    [z, 0, -x],
    [0, 1, 0],
    [x, 0, z],
  ];
  const panels = keys.map((key) => {
    const projected = rectangularBounds(parts.get(setup[key])!, frame);
    if (
      !projected ||
      projected[0].max - projected[0].min >=
        projected[1].max - projected[1].min ||
      projected[0].max - projected[0].min >= projected[2].max - projected[2].min
    ) {
      add(
        drawerSideLabels[key],
        `${partLabel(project, setup[key])} needs a flat vertical wood panel aligned with the slide direction.`,
        false,
      );
      return null;
    }
    return projected;
  });
  const [cabinetLeft, drawerLeft, drawerRight, cabinetRight] = panels;
  if (!cabinetLeft || !drawerLeft || !drawerRight || !cabinetRight)
    return finish();
  const panelName = (key: keyof typeof drawerSideLabels) =>
    partLabel(project, setup[key]);
  const sideGap = (
    side: string,
    gap: number,
    left: keyof typeof drawerSideLabels,
    right: keyof typeof drawerSideLabels,
  ) => {
    add(
      `${side} side gap`,
      `${panelName(left)} to ${panelName(right)} · ${inches(gap)}. Required range ${inches(reference.minSideGap)} to ${inches(reference.maxSideGap)}.`,
      gap >= reference.minSideGap - epsilon &&
        gap <= reference.maxSideGap + epsilon,
    );
  };
  sideGap(
    "Left",
    drawerLeft[0].min - cabinetLeft[0].max,
    "cabinetLeft",
    "drawerLeft",
  );
  sideGap(
    "Right",
    cabinetRight[0].min - drawerRight[0].max,
    "drawerRight",
    "cabinetRight",
  );

  const width = drawerRight[0].max - drawerLeft[0].min;
  const drawerSidesSeparate = drawerLeft[0].max <= drawerRight[0].min + epsilon;
  add(
    "Drawer box width",
    `${inches(width)}. Documented maximum ${inches(reference.maxDrawerWidth)}.`,
    drawerSidesSeparate && width <= reference.maxDrawerWidth + epsilon,
  );

  const shared = (index: number) => {
    const faces = [cabinetLeft, drawerLeft, drawerRight, cabinetRight].map(
      (panel) => panel[index],
    );
    return Math.max(
      0,
      Math.min(...faces.map((face) => face.max)) -
        Math.max(...faces.map((face) => face.min)),
    );
  };
  const height = shared(1);
  const depth = shared(2);
  add(
    "Shared mounting height",
    `${inches(height)} of common panel height. Rail height ${inches(reference.height)}.`,
    height >= reference.height - epsilon,
  );
  add(
    "Shared mounting run",
    `${inches(depth)} of common front-to-back panel span. Closed rail length ${inches(reference.closedLength)}.`,
    depth >= reference.closedLength - epsilon,
  );
  return finish();
}

export function drawerSlideDemand(project: Project) {
  const available = new Set<string>();
  for (const plan of project.motionPlans ?? []) {
    const review = reviewDrawerSlide(project, plan);
    if (!review?.ready) continue;
    // A saved alternative for the same drawer sides uses the same pair.
    available.add(
      [review.setup.drawerLeft, review.setup.drawerRight].sort().join("/"),
    );
  }
  const selected = project.supplies
    .filter((row) => row.productId === reference.productId)
    .reduce((total, row) => total + row.quantity, 0);
  return {
    needed: available.size,
    selected,
    missing: Math.max(0, available.size - selected),
  };
}

export function addMissingDrawerSlides(project: Project) {
  const { missing } = drawerSlideDemand(project);
  return missing
    ? addSupply(
        project,
        reference.productId,
        missing,
        "Drawer slide pairs for modeled openings",
        "Confirm delivered slides, fastener fit and actual mounting surfaces before installation.",
      )
    : project;
}
