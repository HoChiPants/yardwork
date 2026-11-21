import { greenhouseDoorGeometry, greenhouseDoorReview } from "./greenhouseDoors";
import { greenhouseDoorStopRoles } from "./greenhouseDoorReference";
import { greenhouseDoorStopReview } from "./greenhouseDoorStops";
import { doorSeal } from "./greenhouseDoorSealReference";
import { greenhouseDoorSealSchema, type GreenhouseDoorSeal } from "./greenhouseDoorSealSchema";
import { bindingHash } from "./ideaBindingState";
import { motionSetup, reviewMotionPath, type MotionPreview } from "./mechanismMotion";
import { formatPreciseInches as inches } from "./measurement";
import { material, part, type Piece, type Project, type V3 } from "./model";
import type { MotionPlan } from "./motionPlanSchema";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";
import { pieceThroughOpenings } from "./throughOpenings";

const epsilon = 1e-6;
const roles = ["head", "left", "right"] as const;
type Role = typeof roles[number];
const nameOf = { head: "Head", left: "Left jamb", right: "Right jamb" };
type Span = [number, number];
type SealRow = {
  role: Role;
  name: string;
  length: number;
  gap: number;
  overlap: number;
  mount: string;
  moves: boolean;
  issues: string[];
};
export const doorSealInstallScope =
  "Use a clean, dry mounting surface, fit the strips without stacking them at corners and dry-fit the delivered seal. Check closing force, the latch and sill drainage on the actual door.";
export const doorSealMotionScope =
  "The travel check uses a rigid ⅛ in envelope for the seal at its minimum listed gap. It screens for modeled pinch points throughout the saved swing.";

function rectangularWood(piece: Piece, openingRotation: V3) {
  const inverse = inverseRotation(openingRotation);
  return material(piece.material).wood && !piece.cutPlanes.length && !pieceThroughOpenings(piece).length &&
    ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as V3[]).every((axis) =>
      rotate(rotate(axis, piece.rotation), inverse).some((component) => Math.abs(component) > 1 - epsilon));
}

function continuousCover(spans: Span[], start: number, end: number) {
  let coveredTo = start;
  for (const [a, b] of spans.sort(([a], [b]) => a - b)) {
    if (a > coveredTo + epsilon) break;
    coveredTo = Math.max(coveredTo, b);
    if (coveredTo >= end - epsilon) return true;
  }
  return false;
}

function doorSealLayout(project: Project, plan: MotionPlan) {
  const mechanism = plan.mechanism;
  if (mechanism.kind !== "hinge" || !mechanism.greenhouseDoor)
    throw Error("Choose a saved greenhouse door swing.");
  const { entryId, side } = mechanism.greenhouseDoor;
  const doorReview = greenhouseDoorReview(project, plan);
  if (doorReview?.warning) throw Error(doorReview.warning);
  const stopsReview = greenhouseDoorStopReview(project, plan);
  if (!stopsReview.length) throw Error("Fit the two jamb stops and head stop before checking a weatherseal.");
  if (stopsReview.some(({ warning }) => warning))
    throw Error("Resolve the fitted door stop backing and clearance findings first.");
  const geometry = greenhouseDoorGeometry(project, entryId);
  const { opening, leafMembers } = geometry;
  const backs = leafMembers.map((piece) => ({
    piece, ...geometry.localBounds(piece),
  }));
  if (!leafMembers.every((piece) => rectangularWood(piece, opening.rotation)))
    throw Error("The weatherseal requires flat rectangular wood along the three mounting runs. Check shaped or drilled faces in the field.");
  const pieces = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const floor = Math.min(...backs.map(({ min }) => min[1]));
  const rails: Piece[] = [];
  let headBottom = geometry.top;
  const stations: { bounds: [V3, V3]; stopId: string; contactIds: string[] }[] = [];
  const rows = roles.map((role): SealRow => {
    const name = nameOf[role];
    const stop = opening.pieceIds.map((id) => pieces.get(id)).find((piece) =>
      piece?.designRole === greenhouseDoorStopRoles[role]);
    if (!stop || !rectangularWood(stop, opening.rotation))
      throw Error(`Restore the flat rectangular ${name.toLowerCase()} stop before checking its seal.`);
    const { min, max } = geometry.localBounds(stop);
    const head = role === "head";
    const along = head ? 0 : 1;
    const cross = head ? 1 : 0;
    const edge = head ? geometry.top : role === "left" ? geometry.left : geometry.right;
    const wood = backs.filter((row) =>
      Math.abs((role === "left" ? row.min[cross] : row.max[cross]) - edge) <= epsilon)
      .sort((a, b) => (b.max[along] - b.min[along]) - (a.max[along] - a.min[along]))[0];
    if (!wood) throw Error(`No backing wood found along the ${name.toLowerCase()}.`);
    const low = Math.max(min[cross], wood.min[cross]);
    const high = Math.min(max[cross], wood.max[cross]);
    const overlap = Math.max(0, high - low);
    const crossCenter = (low + high) / 2;
    const band = [crossCenter - doorSeal.width / 2, crossCenter + doorSeal.width / 2] as const;
    if (head) headBottom = band[0];
    const start = Math.max(min[along], head ? geometry.left : floor);
    const end = Math.min(max[along], head ? geometry.right : headBottom);
    const length = Math.max(0, end - start);
    const gap = wood.min[2] - max[2];
    const moves = !head && role !== side;
    const mount = moves ? `${partLabel(project, wood.piece.id)} · inside of latch-side door stile`
      : `${partLabel(project, stop.id)} · ${name.toLowerCase()} stop`;
    const contact = backs.filter((row) =>
      row.min[cross] <= band[0] + epsilon && row.max[cross] >= band[1] - epsilon &&
      Math.abs(row.min[2] - wood.min[2]) <= epsilon && row.max[along] > start && row.min[along] < end);
    const issues = [
      ...(gap < doorSeal.minGap - epsilon ? [`Gap below ⅛ in. Increase the stop setback by at least ${inches(doorSeal.minGap - gap)}.`] : []),
      ...(gap > doorSeal.thickness + epsilon ? [`Gap above ¼ in. Bring the stop ${inches(gap - doorSeal.thickness)} closer or choose a thicker seal.`] : []),
      ...(overlap + epsilon < doorSeal.width ? ["Less than 5/16 in of common mounting width. Use a narrower profile or revise the stop."] : []),
      ...(length <= epsilon || !continuousCover(contact.map((row) => [row.min[along], row.max[along]]), start, end)
        ? ["The strip does not have continuous wood at the closed door."] : []),
      ...(length > doorSeal.stripLength + epsilon ? ["The run exceeds one continuous 8 ft 6 in strip. Review another product."] : []),
    ];
    if (!issues.length) {
      const center: V3 = [0, 0, moves ? wood.min[2] - doorSeal.minGap / 2 : max[2] + doorSeal.minGap / 2];
      const size: V3 = [0, 0, doorSeal.minGap];
      center[along] = (start + end) / 2;
      center[cross] = crossCenter;
      size[along] = length;
      size[cross] = doorSeal.width;
      const world = rotate(center, opening.rotation).map((n, index) => n + opening.origin[index]) as V3;
      rails.push(part(`${name} weatherseal`, "stud", size, world, stop.stepId, "", opening.rotation));
      stations.push({
        bounds: [[start, band[0], max[2]], [end, band[1], wood.min[2]]],
        stopId: stop.id,
        contactIds: contact.map(({ piece }) => piece.id).sort(),
      });
    }
    return { role, name, length, gap, overlap, mount, moves, issues };
  });
  const layoutKey = bindingHash({
    stations,
    members: plan.memberIds,
    motion: { side, pivot: mechanism.pivot, axis: mechanism.axis, travel: mechanism.travel, path: mechanism.hingePath },
  });
  return { rows, layoutKey, entryId, rails };
}

type DoorSealCheck = {
  rows: SealRow[];
  detail: string;
  ready: boolean;
  layoutKey: string | null;
  entryId: string | null;
  preview?: () => MotionPreview;
};

export function checkGreenhouseDoorSeal(project: Project, plan: MotionPlan): DoorSealCheck {
  try {
    const { rows, layoutKey, entryId, rails } = doorSealLayout(project, plan);
    if (rows.some(({ issues }) => issues.length))
      return { rows, layoutKey, entryId, ready: false, detail: "Resolve the closed gap, backing and strip lengths before saving the seal." };
    const fixed = rails.filter((_rail, index) => !rows[index].moves);
    const moving = rails.filter((_rail, index) => rows[index].moves);
    const sealIds = new Set(rails.map(({ id }) => id));
    const members = new Set(plan.memberIds);
    const path = reviewMotionPath(
      { ...project, pieces: [...project.pieces, ...fixed] },
      [...project.pieces.filter(({ id }) => members.has(id)), ...moving],
      motionSetup(project, plan).mechanism,
    );
    const hit = path.hits.find(({ movingId, obstacleId }) => sealIds.has(movingId) || sealIds.has(obstacleId));
    const preview = (): MotionPreview => {
      const current = path.preview(hit?.inspectAt ?? 0, hit?.inspectAt);
      return {
        ...current,
        label: "Weatherseal clearance",
        draftGeometry: true,
        obstaclePieces: [...fixed, ...current.pieces.filter(({ id }) => sealIds.has(id))],
      };
    };
    if (hit) {
      const names = [...rails, ...project.pieces];
      const tape = names.find(({ id }) => id === (sealIds.has(hit.movingId) ? hit.movingId : hit.obstacleId))!.name;
      const other = names.find(({ id }) => id === (sealIds.has(hit.movingId) ? hit.obstacleId : hit.movingId))!.name;
      return {
        rows, layoutKey, entryId, ready: false, preview,
        detail: `${tape} ${hit.kind === "uncertain" ? "may contact" : "meets"} ${other} near ${Number(hit.first.toFixed(2))}°. Review the pivot or strip position.`,
      };
    }
    return {
      rows, layoutKey, entryId, ready: true, preview,
      detail: "All three runs fit the modeled closed gap and clear the minimum-gap sweep.",
    };
  } catch (cause) {
    return { rows: [], layoutKey: null, entryId: null, ready: false,
      detail: cause instanceof Error ? cause.message : "Review the fitted door and stops." };
  }
}

export function saveGreenhouseDoorSeal(project: Project, motionId: string) {
  const plan = project.motionPlans?.find(({ id }) => id === motionId);
  const check = plan && checkGreenhouseDoorSeal(project, plan);
  if (!check?.ready) throw Error(check?.detail ?? "Choose a saved greenhouse door swing.");
  const saved = greenhouseDoorSealSchema.parse({ motionId, entryId: check.entryId, layoutKey: check.layoutKey });
  const keep = (project.greenhouseDoorSeals ?? []).filter(({ entryId }) => entryId !== saved.entryId);
  if (keep.length >= 50) throw Error("This project has 50 saved door weatherseals.");
  return { ...project, greenhouseDoorSeals: [...keep, saved], guideFingerprint: null };
}

export function removeGreenhouseDoorSeal(project: Project, entryId: string) {
  return { ...project, greenhouseDoorSeals: project.greenhouseDoorSeals?.filter((seal) => seal.entryId !== entryId),
    guideFingerprint: null };
}

export function reviewGreenhouseDoorSeal(project: Project, saved: GreenhouseDoorSeal): DoorSealCheck & { label: string } {
  const plan = project.motionPlans?.find(({ id }) => id === saved.motionId);
  if (!plan) return { label: "Door weatherseal", ready: false, rows: [], entryId: saved.entryId, layoutKey: null,
    detail: "Choose the current swing for this door weatherseal." };
  const check = checkGreenhouseDoorSeal(project, plan);
  if (check.ready && (check.entryId !== saved.entryId || check.layoutKey !== saved.layoutKey))
    return { ...check, label: plan.label, ready: false, detail: "The seal layout or swing changed. Review and save the updated runs." };
  return { ...check, label: plan.label };
}

type Cut = { name: string; length: number };
export function packDoorWeathersealCuts(cuts: readonly Cut[]) {
  const strips: { remaining: number; cuts: Cut[] }[] = [];
  for (const cut of [...cuts].sort((a, b) => b.length - a.length)) {
    if (!Number.isFinite(cut.length) || cut.length <= 0 || cut.length > doorSeal.stripLength + epsilon)
      throw Error("Each weatherseal run must fit one continuous 8 ft 6 in strip.");
    const match = strips.filter(({ remaining }) => remaining >= cut.length - epsilon)
      .sort((a, b) => a.remaining - b.remaining)[0];
    if (match) {
      match.cuts.push(cut);
      match.remaining = Math.max(0, match.remaining - cut.length);
    } else {
      strips.push({ remaining: Math.max(0, doorSeal.stripLength - cut.length), cuts: [cut] });
    }
  }
  const packs = Math.ceil(strips.length / doorSeal.stripCount);
  if (strips.length % doorSeal.stripCount)
    strips.push({ remaining: doorSeal.stripLength, cuts: [] });
  return { packs, strips };
}

export function greenhouseDoorSealTakeoff(project: Project) {
  const reviews = (project.greenhouseDoorSeals ?? []).map((plan) => reviewGreenhouseDoorSeal(project, plan));
  const cuts = reviews.filter(({ ready }) => ready).flatMap(({ label, rows }) =>
    rows.map(({ name, length }) => ({ name: `${label} · ${name}`, length })));
  const takeoff = packDoorWeathersealCuts(cuts);
  return { ...takeoff, required: reviews.every(({ ready }) => ready) ? takeoff.packs : null, reviews };
}

export function greenhouseDoorSealGuideLines(project: Project) {
  const { reviews, strips } = greenhouseDoorSealTakeoff(project);
  if (!reviews.length) return [];
  return [
    ...reviews.flatMap(({ label, ready, rows, detail }) => [label, detail, ...(ready ? rows.map((row) =>
      `${row.name} · Cut ${inches(row.length)} · ${row.mount} · ${inches(row.gap)} modeled closed gap.`) : [])]),
    ...(strips.length ? [`${doorSeal.name} · two 8 ft 6 in strips per package.`,
      ...strips.map((strip, index) =>
        `Package ${Math.floor(index / doorSeal.stripCount) + 1}, strip ${index % doorSeal.stripCount + 1} · ${strip.cuts.length ?
          strip.cuts.map(({ name, length }) => `${name} ${inches(length)}`).join(" + ") + ` · Keep ${inches(strip.remaining)}.`
          : "Keep this full strip."}`)] : []),
    doorSealMotionScope,
    doorSealInstallScope,
  ];
}
