import { doorCasingInstallation, flatCasing } from "./doorCasingReference";
import { interiorDoor } from "./doorWall";
import { clipBox, solidBounds } from "./cutProfiles";
import { bounds } from "./engine";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches } from "./measurement";
import { motionReviewTravel, runMotionTest } from "./mechanismMotion";
import { part, projectSchema, step, uid, type Piece, type Project, type Section, type V3 } from "./model";
import { pieceOverlap } from "./solidCollision";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { wallDrywallFit } from "./wallDrywall";

type Side = "front" | "back";
const epsilon = 1e-6;
const fitTolerance = 0.125;
const up: V3 = [0, 1, 0];
const right: V3 = [1, 0, 0];
const depth: V3 = [0, 0, 1];
const sub = (a: V3, b: V3) => a.map((value, i) => value - b[i]) as V3;
const add = (a: V3, b: V3) => a.map((value, i) => value + b[i]) as V3;
const same = (a: V3, b: V3) => a.every((value, i) => Math.abs(value - b[i]) < epsilon);
const members = (project: Project, section: Section) => {
  const ids = new Set(section.pieceIds);
  return project.pieces.filter(({ id, offcut }) => !offcut && ids.has(id));
};

function casingFrame(project: Project, wall: Section, side: Side) {
  if (!wall.generator?.doorUnit || !same(rotate(up, wall.rotation), up))
    throw Error("Choose an upright wall with a fitted interior door.");
  const inverse = inverseRotation(wall.rotation);
  const frame = members(project, wall);
  const local = (piece: Piece) => rotate(sub(piece.position, wall.origin), inverse);
  function jamb(role: string) {
    const piece = frame.find(({ designRole }) => designRole === role);
    if (!piece || piece.cutPlanes.length || piece.rectangularOpenings?.length || piece.roundOpenings?.length ||
        ![right, up].every((axis) => same(rotate(rotate(axis, piece.rotation), inverse), axis)))
      throw Error("Check the fitted jambs. This layout needs three square jambs aligned to the wall.");
    const center = local(piece);
    return { piece, center, half: piece.size.map((v) => v / 2) as V3 };
  }
  const left = jamb("door-jamb-left"), rightJamb = jamb("door-jamb-right"), head = jamb("door-jamb-head");
  const innerLeft = left.center[0] + left.half[0];
  const innerRight = rightJamb.center[0] - rightJamb.half[0];
  const innerTop = head.center[1] - head.half[1];
  const floor = left.center[1] - left.half[1];
  if (innerLeft >= innerRight || innerTop <= floor ||
      Math.abs(rightJamb.center[1] - rightJamb.half[1] - floor) > fitTolerance ||
      Math.abs(head.center[0] - head.half[0] - innerLeft) > fitTolerance ||
      Math.abs(head.center[0] + head.half[0] - innerRight) > fitTolerance ||
      [left, rightJamb].some(({ center, half }) => Math.abs(center[1] + half[1] - head.center[1] - head.half[1]) > fitTolerance))
    throw Error("Check the measured jamb opening and square the frame before laying out mitered casing.");
  const sign = side === "front" ? 1 : -1;
  const jambDepths = [left, rightJamb, head].map(({ center, half }) => sign * center[2] + half[2]);
  const jambFace = Math.max(...jambDepths);
  const drywall = project.sections.find(({ wallDrywall }) => wallDrywall?.wallId === wall.id && wallDrywall.side === side);
  const lining = drywall && wallDrywallFit(project, drywall);
  if (lining && !lining.current) throw Error("Recheck the fitted drywall on this face before planning its casing.");
  const plasterFace = lining && Math.max(...lining.parts.map((piece) =>
    sign * local(piece)[2] + piece.size.reduce((sum, length, axis) => {
      const basis: V3 = [0, 0, 0];
      basis[axis] = 1;
      return sum + Math.abs(rotate(rotate(basis, piece.rotation), inverse)[2]) * length / 2;
    }, 0)));
  const face = Math.max(jambFace, plasterFace ?? jambFace);
  if (face - Math.min(...jambDepths, plasterFace ?? jambFace) > fitTolerance + epsilon)
    throw Error("The jambs and wall face are more than ⅛ in out of plane. Check jamb extensions, shims or the finished thickness before laying out flat casing.");
  const faceLeft = sign > 0 ? innerLeft : -innerRight;
  const faceRight = sign > 0 ? innerRight : -innerLeft;
  const facing = composeRotation(wall.rotation, [0, sign > 0 ? 0 : Math.PI, 0]);
  const jambs = [left, rightJamb, head].map(({ piece, center }) => [piece.id, piece.size, center]);
  return { faceLeft, faceRight, innerTop, floor, face, wallGap: lining ? face - plasterFace! : undefined,
    drywall: lining?.parts ?? [],
    jambGap: face - Math.min(...jambDepths), backing: Math.min(left.piece.size[0], rightJamb.piece.size[0], head.piece.size[1]),
    facing, frame: [...frame, ...(lining?.parts ?? [])], jambs };
}

function layoutKey(wall: Section, geometry: ReturnType<typeof casingFrame>, parts: Piece[]) {
  const inverse = inverseRotation(wall.rotation);
  return bindingHash([geometry.jambs, geometry.face, geometry.wallGap, parts.slice().sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, material, position, rotation, size, cutPlanes, rectangularOpenings, roundOpenings }) =>
      [id, material, rotate(sub(position, wall.origin), inverse), [right, up, depth].map((axis) =>
        rotate(rotate(axis, rotation), inverse)), size, cutPlanes, rectangularOpenings, roundOpenings])]);
}

export function casingSwing(project: Project, wallId: string, { useSavedSetup = true } = {}) {
  const plan = project.motionPlans?.find(({ mechanism }) => mechanism.kind === "hinge" && mechanism.doorway?.sectionId === wallId);
  if (!plan) return;
  const tested = runMotionTest(project, plan, useSavedSetup ? plan.testSetup : undefined);
  const review = tested.review;
  const limit = review?.playbackLimit(0, motionReviewTravel(review));
  const stop = limit?.inspectAt === undefined ? undefined : review?.preview(limit.travel, limit.inspectAt, limit.siteFaceId);
  return { plan, review, limit, stop, error: tested.error };
}

export function doorCasingLengths(piece: Piece) {
  const solid = clipBox(piece.size, piece.cutPlanes);
  const { min, max } = solidBounds(solid);
  const lengths = [min[0], max[0]].map((x) => {
    const edge = solid.vertices.filter((v) => Math.abs(v[0] - x) <= epsilon).map((v) => v[2]);
    return Math.max(...edge) - Math.min(...edge);
  });
  return { long: Math.max(...lengths), short: Math.min(...lengths) };
}

export function previewDoorCasing(project: Project, options: { wallId: string; side: Side; reveal: number; bottomGap: number }) {
  const wall = project.sections.find(({ id }) => id === options.wallId);
  if (!wall) throw Error("Choose the wall with the fitted door.");
  if (project.sections.some(({ doorCasing }) => doorCasing?.wallId === wall.id && doorCasing.side === options.side))
    throw Error("There is already a casing section on this face. Select it in Sections to inspect or remove it.");
  const geometry = casingFrame(project, wall, options.side);
  const { reveal, bottomGap } = options;
  if (!Number.isFinite(reveal) || reveal < 0 || reveal > 1 || reveal >= geometry.backing - 1 / 8)
    throw Error("Set a jamb reveal that leaves at least ⅛ in of overlap onto each modeled jamb.");
  if (!Number.isFinite(bottomGap) || bottomGap < 0 || bottomGap > 2)
    throw Error("Set the casing gap above the finished floor from 0 to 2 in.");

  const [width, thickness, stockLength] = flatCasing.size;
  const l = geometry.faceLeft - reveal, r = geometry.faceRight + reveal;
  const y0 = geometry.floor + bottomGap, y1 = geometry.innerTop + reveal;
  const legLength = y1 + width - y0, headLength = r - l + 2 * width;
  if (legLength > stockLength + epsilon || headLength > stockLength + epsilon)
    throw Error("A casing piece exceeds the selected 8 ft stock. Choose a measured longer casing detail.");
  if (legLength <= width || headLength <= 2 * width) throw Error("The fitted opening is too small for this casing.");

  const name = `Casing · ${options.side} · ${wall.name}`.slice(0, 80);
  const task = step("Fit mitered door casing");
  const faceTurn = geometry.facing;
  const legs: V3 = [Math.PI / 2, 0, 0];
  const lintel = composeRotation([0, 0, Math.PI / 2], legs);
  type Cut = [normal: V3, constant: number];
  const boardAt = (label: string, role: string, length: number, x: number, y: number, turn: V3, cuts: Cut[]) => {
    const center: V3 = [x, y, geometry.face + thickness / 2];
    const board = part(label, flatCasing.id, [width, thickness, length], add(wall.origin, rotate(center, faceTurn)),
      task.id, name, composeRotation(faceTurn, turn));
    board.designRole = role;
    board.stockLengthAxis = 2;
    const inverse = inverseRotation(turn);
    board.cutPlanes = cuts.map(([normal, constant]) => {
      const length = Math.hypot(...normal);
      return { normal: rotate(normal.map((n) => n / length) as V3, inverse),
        constant: (constant - normal.reduce((sum, n, i) => sum + n * center[i], 0)) / length };
    });
    return board;
  };
  const parts = [
    boardAt("Casing left leg", "casing-left", legLength, l - width / 2, y0 + legLength / 2, legs, [[[1, 1, 0], y1 + l]]),
    boardAt("Casing right leg", "casing-right", legLength, r + width / 2, y0 + legLength / 2, legs, [[[-1, 1, 0], y1 - r]]),
    boardAt("Casing head", "casing-head", headLength, (l + r) / 2, y1 + width / 2, lintel,
      [[[-1, -1, 0], -y1 - l], [[1, -1, 0], -y1 + r]]),
  ];
  for (const trim of parts) {
    const box = bounds(trim);
    const zone = project.workZone;
    if (zone && (box.min[0] < -zone.width / 2 - 0.01 || box.max[0] > zone.width / 2 + 0.01 ||
      box.min[1] < -0.01 || box.max[1] > zone.height + 0.01 ||
      box.min[2] < -zone.depth / 2 - 0.01 || box.max[2] > zone.depth / 2 + 0.01))
      throw Error("The casing extends outside the work zone. Check room for the trim thickness and miters.");
    const conflict = project.pieces.find((other) => {
      if (other.offcut) return false;
      const adjacent = bounds(other);
      return !box.min.some((min, axis) => box.max[axis] <= adjacent.min[axis] + 0.01 || adjacent.max[axis] <= min + 0.01) &&
        pieceOverlap(trim, other) !== false;
    });
    if (conflict) throw Error(`${trim.name} intersects ${conflict.name}. Check the door reveal and nearby finish.`);
  }
  const section: Section = { id: uid(), name, pieceIds: parts.map(({ id }) => id), origin: wall.origin, rotation: wall.rotation,
    generator: null, recipe: null, doorCasing: { wallId: wall.id, side: options.side, reveal, layoutKey: layoutKey(wall, geometry, parts) } };
  const candidate = projectSchema.parse({ ...project, pieces: [...project.pieces, ...parts], steps: [...project.steps, task],
    sections: [...project.sections, section] });
  return { project: candidate, section, parts, geometry, before: casingSwing(project, wall.id), swing: casingSwing(candidate, wall.id) };
}

export function doorCasingGuide(project: Project, section: Section, parts: Piece[]) {
  const record = section.doorCasing!;
  let current = false;
  try {
    casingFit(project, section, parts);
    current = true;
  } catch {
    // A changed jamb or wall finish leaves the existing cuts available for review.
  }
  return [
    ...(current ? [] : ["The jamb, face or trim geometry changed. Check the recorded cuts and reveal against the current wall."]),
    `Mark a ${formatPreciseInches(record.reveal)} reveal around the fitted jamb. Dry-fit the head and legs before fastening. Each leg has a square floor end and a 45° top miter. The head has two opposing 45° miters.`,
    ...parts.map((piece) => {
      const { long, short } = doorCasingLengths(piece);
      return `${piece.name} · long point ${formatPreciseInches(long)}, short point ${formatPreciseInches(short)}.`;
    }),
    "Confirm the finished floor, fit at both miters, backing and trim fasteners. Keep sound square offcuts for a short head or another trim detail. Fit the handle and stops, then test the full door swing on site.",
    ...(project.sections.find(({ id }) => id === record.wallId)?.generator?.doorUnit?.purchase === interiorDoor.materialId
      ? ["Check the casing supplied with the split-jamb door before ordering separate trim. Use these cuts for a measured replacement."] : []),
    `Installation guide · ${doorCasingInstallation}`,
  ].join("\n");
}

export function casingFit(project: Project, section: Section, parts = members(project, section)) {
  const record = section.doorCasing;
  const wall = project.sections.find(({ id }) => id === record?.wallId);
  if (!record || !wall) throw Error("Choose fitted casing with its original doorway.");
  const geometry = casingFrame(project, wall, record.side);
  if (layoutKey(wall, geometry, parts) !== record.layoutKey)
    throw Error("The jamb, wall finish or casing changed. Review the fit before marking seams.");
  return { geometry, parts };
}

export function widerCasingReveal(project: Project, draft: ReturnType<typeof previewDoorCasing>, bottomGap: number) {
  const { reveal, wallId, side } = draft.section.doorCasing!;
  const baseline = draft.before?.limit?.travel;
  const limit = draft.swing?.limit;
  if (baseline === undefined || !limit || baseline - limit.travel < 0.1 ||
      !draft.parts.some(({ id }) => draft.swing?.stop?.interferenceIds.includes(id))) return undefined;
  const last = Math.min(1, draft.geometry.backing - 0.125);
  for (let next = (Math.floor(reveal * 16) + 1) / 16; next < last - epsilon; next += 1 / 16) {
    try {
      const trial = previewDoorCasing(project, { wallId, side, reveal: next, bottomGap });
      if (trial.swing?.limit && trial.swing.limit.travel >= baseline - 0.01 && !trial.swing.limit.uncertain && !trial.swing.stop)
        return { reveal: next, draft: trial };
    } catch {
      // A larger reveal can intersect other trim or run outside the work zone.
    }
  }
}
