import { formatPreciseInches } from "./measurement";
import { material, sectionParts, type Piece, type Project, type V3 } from "./model";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap } from "./solidCollision";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { openingHalfSpans, pieceThroughOpenings } from "./throughOpenings";
import type { RoundOpening } from "./throughOpeningSchema";
import {
  nailShield, pexPipes, pexStockLength, pipePlanningCover, pipeProtectionBaseline,
  studBoreFace, studBoreRatio,
} from "./wallWaterReference";
import type { WaterRun, WaterRunInput } from "./wallWaterSchema";
import { waterFittingPorts } from "./waterFittingSchema";
import { waterSupportForPipe, waterSupportProducts, waterSupportReference } from "./waterSupportReference";

const tolerance = 1e-6;
const closeVector = (a: V3, b: V3) => a.every((v, index) => Math.abs(v - b[index]) < tolerance);
const axes: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const equalRotation = (a: V3, b: V3) => axes.every((axis) => closeVector(rotate(axis, a), rotate(axis, b)));
const dim = formatPreciseInches;
const close = (a: number, b: number) => Math.abs(a - b) < tolerance;
const ends = (start: number, end: number, min: number, max: number) => start < max - tolerance && end > min + tolerance;
const commonStud = /^wall-stud-\d+$|^window-wall-stud-\d+$/;
export const waterRunStageKey = "water-rough-in";
type Placement = Pick<Piece, "material" | "position" | "rotation" | "size">;

export function ownsWaterBore(opening: RoundOpening, id: string) {
  return opening.source && "waterRunId" in opening.source && opening.source.waterRunId === id;
}

export function clearWaterBores(piece: Piece, id?: string) {
  const before = piece.roundOpenings;
  if (!before?.length) return piece;
  const after = before.filter((hole) => !(hole.source && "waterRunId" in hole.source &&
    (id === undefined || hole.source.waterRunId === id)));
  if (before.length === after.length) return piece;
  const { roundOpenings, ...rest } = piece;
  return after.length ? { ...rest, roundOpenings: after } : rest;
}

export function waterRunMembers(run: WaterRun) {
  return [run.pipeId, ...run.shields.map(({ id }) => id), ...(run.isolators ?? []).map(({ id }) => id)];
}

export function waterRunFits(a: Piece, b: Pick<Piece, "material" | "position" | "rotation" | "size">) {
  return a.material === b.material && !a.offcut && !a.cutPlanes.length &&
    closeVector(a.size, b.size) && closeVector(a.position, b.position) && equalRotation(a.rotation, b.rotation);
}

/** Compare one measured straight run with actual panel members and nearby retained shapes. */
export function measureWaterRun(project: Project, input: WaterRunInput, run?: WaterRun) {
  const wall = project.sections.find(({ id }) => id === input.sectionId);
  const command = wall?.generator;
  if (!wall || command?.type !== "wall") throw Error("Choose a generated interior nonbearing wall panel.");
  if (!closeVector(rotate([0, 1, 0], wall.rotation), [0, 1, 0])) throw Error("Restore the wall upright before planning a horizontal pipe.");
  const spec = pexPipes[input.materialId];
  const { isolator } = input;
  const bore = isolator ? waterSupportReference.bore : input.bore;
  const length = input.end - input.start;
  if (length <= tolerance) throw Error("Enter increasing endpoints from the wall’s left end.");
  if (length > pexStockLength + tolerance) throw Error("This straight run exceeds one 10 ft stick. Plan separately measured runs and fittings.");
  if (bore <= spec.outside + spec.tolerance + tolerance)
    throw Error(`The bore needs clearance around the actual ${dim(spec.outside)} pipe and its manufacturing tolerance.`);
  const left = -command.width / 2, x0 = left + input.start, x1 = left + input.end;
  const radius = bore / 2;
  const position: V3 = [(x0 + x1) / 2, input.height, input.depth];
  const { doorOpening: door, windowOpening: window } = command;
  if (door && ends(x0, x1, (door.offset ?? 0) - door.width / 2, (door.offset ?? 0) + door.width / 2) &&
      ends(input.height - radius, input.height + radius, door.floor ?? 0, (door.floor ?? 0) + door.height))
    throw Error("This route crosses the rough doorway. Move its endpoints or height.");
  if (window && ends(x0, x1, (window.offset ?? 0) - window.width / 2, (window.offset ?? 0) + window.width / 2) &&
      ends(input.height - radius, input.height + radius, window.sill, window.sill + window.height))
    throw Error("This route crosses the rough window opening. Move its endpoints or height.");

  const toWorld = (point: V3) => rotate(point, wall.rotation).map((n, i) => n + wall.origin[i]) as V3;
  const reversed = inverseRotation(wall.rotation);
  const toLocal = (point: V3) => rotate(point.map((n, i) => n - wall.origin[i]) as V3, reversed);
  const pipe = {
    material: input.materialId,
    position: toWorld(position),
    rotation: composeRotation(wall.rotation, [0, 0, -Math.PI / 2]),
    size: [spec.outside, length, spec.outside] as V3,
  };
  const envelope = prepareCollisionBox(pipe.size, pipe.position, pipe.rotation);
  const members = new Set(wall.pieceIds), owned = new Set(run ? waterRunMembers(run) : []);
  const attached = new Set((project.waterFittings ?? []).filter((fitting) =>
    run && waterFittingPorts(fitting).some(({ runId }) => runId === run.id)).map(({ pieceId }) => pieceId));
  for (const stop of project.waterStops ?? []) if (stop.port.runId === run?.id) attached.add(stop.pieceId);
  if (project.workZone) {
    const { width, height, depth } = project.workZone;
    const extents = [[-width / 2, width / 2], [0, height], [-depth / 2, depth / 2]];
    if (extents.some(([lo, hi], i) => envelope.bounds.min[i] < lo - tolerance || envelope.bounds.max[i] > hi + tolerance))
      throw Error("The modeled pipe crosses the work-zone boundary.");
  }
  const legacy = !command.wallStock && !door && !window
    ? sectionParts(command, project.steps[0].id, wall.name, wall.origin, wall.rotation).slice(2) : [];
  const studs: { piece: Piece; x: number; opening: RoundOpening; yMark: number; backMark: number;
    nearEdge: number; covers: { front: number; back: number } }[] = [];
  const shields: { studId: string; face: "front" | "back"; placement: Placement }[] = [];
  const supports: { studId: string; distance: number; placement: Placement }[] = [];
  const solids: { piece: Piece; solid: ReturnType<typeof prepareCollisionBox> }[] = [];
  for (const piece of project.pieces) {
    if (piece.offcut || owned.has(piece.id)) continue;
    const [x, y, z] = toLocal(piece.position);
    const range = Math.hypot(...piece.size) / 2;
    const fromRoute = Math.hypot(Math.max(0, x0 - x, x - x1),
      Math.max(0, Math.abs(input.height - y) - Math.max(radius, nailShield.length / 2)),
      Math.max(0, Math.abs(input.depth - z) - Math.max(radius, pipePlanningCover + spec.outside / 2 + nailShield.thickness)));
    if (fromRoute > range + tolerance) continue;
    const isStud = members.has(piece.id) && material(piece.material).wood &&
      (commonStud.test(piece.designRole ?? "") || (!piece.designRole && legacy.some((expected) => waterRunFits(piece, expected))));
    if (!isStud || !equalRotation(piece.rotation, wall.rotation)) {
      const rough = prepareCollisionBox(piece.size, piece.position, piece.rotation);
      const isNearPipe = !attached.has(piece.id) && solidOverlap(envelope, rough, 0);
      const solid = isNearPipe ? prepareCollisionSolid(piece) ?? rough : rough;
      if (isNearPipe && solidOverlap(envelope, solid, 0))
        throw Error(`The pipe envelope hits ${piece.name}. Move the run away from this part.`);
      solids.push({ piece, solid });
      continue;
    }
    const dx = piece.size[0] / 2, dy = piece.size[1] / 2, dz = piece.size[2] / 2;
    const yMark = input.height - y, zMark = input.depth - z;
    if (!ends(x0, x1, x - dx, x + dx) || Math.abs(yMark) >= dy + radius - tolerance ||
        Math.abs(zMark) >= dz + radius - tolerance) {
      solids.push({ piece, solid: prepareCollisionBox(piece.size, piece.position, piece.rotation) });
      continue;
    }
    if (x0 > x - dx + tolerance || x1 < x + dx - tolerance)
      throw Error(`An endpoint stops inside ${piece.name}. Put both endpoints clear of the framing.`);
    if (piece.cutPlanes.length || !close(piece.size[0], nailShield.width) ||
        Math.abs(yMark) + radius > dy - tolerance)
      throw Error(`${piece.name} is cut, resized, or too close to the bore end. Choose an uninterrupted ordinary stud.`);
    const limit = piece.size[2] * studBoreRatio;
    const face = dz - Math.abs(zMark) - radius;
    if (bore > limit + tolerance) throw Error(`${piece.name} limits this bore to ${dim(limit)} (60% of actual stud depth).`);
    if (face < studBoreFace - tolerance) throw Error(`${piece.name} leaves ${dim(face)} from bore edge to stud face. Enter a layout with at least 5/8 in.`);
    const openings = pieceThroughOpenings(run ? clearWaterBores(piece, run.id) : piece);
    if (openings.length >= 6) throw Error(`${piece.name} already has six modeled openings.`);
    for (const opening of openings) {
      if (opening.axis !== 0) throw Error(`${piece.name} already has a cut on a different axis.`);
      const [ry, rz] = openingHalfSpans(opening);
      const gapY = Math.abs(yMark - opening.center[0]), gapZ = Math.abs(zMark - opening.center[1]);
      const edgeNotch = Math.abs(opening.center[1]) + rz >= dz - tolerance ||
        Math.abs(opening.center[0]) + ry >= dy - tolerance;
      if (edgeNotch && gapY < radius + ry + tolerance)
        throw Error(`The bore shares a cross section with a notch in ${piece.name}.`);
      const intersects = "spans" in opening
        ? Math.hypot(Math.max(0, gapY - ry), Math.max(0, gapZ - rz)) <= radius + tolerance
        : Math.hypot(gapY, gapZ) <= radius + ry + tolerance;
      if (intersects) throw Error(`The bore touches or overlaps an existing opening in ${piece.name}.`);
    }
    const opening: RoundOpening = { axis: 0, diameter: bore, center: [yMark, zMark] };
    const covers = { front: dz - zMark - (spec.outside + spec.tolerance) / 2, back: dz + zMark - (spec.outside + spec.tolerance) / 2 };
    for (const side of ["front", "back"] as const) {
      if (covers[side] >= pipePlanningCover - tolerance) continue;
      if (bore > nailShield.length + tolerance || Math.abs(yMark) + nailShield.length / 2 > dy + tolerance)
        throw Error(`The shield at ${piece.name} would overhang the stud or miss part of the bore.`);
      const sign = side === "front" ? 1 : -1;
      shields.push({ studId: piece.id, face: side, placement: {
        material: nailShield.id,
        position: toWorld([x, input.height, z + sign * (dz + nailShield.thickness / 2)]),
        rotation: wall.rotation,
        size: [nailShield.width, nailShield.length, nailShield.thickness],
      } });
    }
    if (isolator) {
      const { flangeHeight, flangeWidth, depth } = waterSupportReference;
      const sign = isolator.face === "start" ? -1 : 1;
      const studFace = x + sign * dx;
      const outerFace = studFace + sign * isolator.flange;
      if (outerFace < x0 - tolerance || outerFace > x1 + tolerance)
        throw Error(`The pipe stops short of the isolator flange at ${piece.name}.`);
      if (Math.abs(yMark) + flangeHeight / 2 > dy + tolerance || Math.abs(zMark) + flangeWidth / 2 > dz + tolerance ||
          depth - isolator.flange > 2 * dx + tolerance)
        throw Error(`The isolator needs a clear flange seat and sleeve depth at ${piece.name}.`);
      supports.push({ studId: piece.id, distance: studFace - x0, placement: {
        material: waterSupportForPipe(input.materialId),
        position: toWorld([studFace + sign * isolator.flange / 2, input.height, input.depth]),
        rotation: composeRotation(wall.rotation, [0, sign === -1 ? 0 : Math.PI, 0]),
        size: [isolator.flange, flangeHeight, flangeWidth],
      } });
    }
    studs.push({ piece, x, opening, yMark: yMark + dy, backMark: zMark + dz, nearEdge: face, covers });
    solids.push({ piece, solid: prepareCollisionBox(piece.size, piece.position, piece.rotation) });
  }
  if (!studs.length) throw Error("This route must cross at least one ordinary stud.");
  studs.sort((a, b) => a.x - b.x);
  if (studs.some((row, i) => i > 0 && row.x - studs[i - 1].x < (row.piece.size[0] + studs[i - 1].piece.size[0]) / 2 - tolerance))
    throw Error("The route crosses overlapping studs. Correct the framing before laying out bores.");
  for (const { placement, studId } of shields) {
    const shield = prepareCollisionBox(placement.size, placement.position, placement.rotation);
    const blocker = solids.find(({ piece, solid }) => piece.id !== studId && solidOverlap(shield, solid));
    if (blocker) throw Error(`A shield hits ${blocker.piece.name}. Move the route or review the open stud face for installation.`);
  }
  for (const { placement, studId } of supports) {
    const flange = prepareCollisionBox(placement.size, placement.position, placement.rotation);
    const blocker = solids.find(({ piece, solid }) => piece.id !== studId && solidOverlap(flange, solid) &&
      solidOverlap(flange, prepareCollisionSolid(piece) ?? solid));
    if (blocker) throw Error(`An isolator flange hits ${blocker.piece.name}. Choose a clear stud face or move the route.`);
    if (project.workZone) {
      const { width, height, depth } = project.workZone;
      const extents = [[-width / 2, width / 2], [0, height], [-depth / 2, depth / 2]];
      if (extents.some(([lo, hi], i) => flange.bounds.min[i] < lo - tolerance || flange.bounds.max[i] > hi + tolerance))
        throw Error("An isolator flange crosses the work-zone boundary.");
    }
  }
  return { wall, length, pipe, studs, shields, supports };
}

export function reviewWaterRun(project: Project, run: WaterRun) {
  try {
    const measured = measureWaterRun(project, run, run);
    const pipe = project.pieces.find(({ id }) => id === run.pipeId);
    const edited = !pipe || !waterRunFits(pipe, measured.pipe) || measured.studs.length !== run.studs.length ||
      measured.supports.length !== (run.isolators?.length ?? 0) || measured.supports.some(({ studId, placement }) => {
        const id = run.isolators?.find((row) => row.studId === studId)?.id;
        const support = project.pieces.find((piece) => piece.id === id);
        return !support || !waterRunFits(support, placement);
      }) ||
      measured.shields.length !== run.shields.length || measured.studs.some(({ piece, opening }) => {
        const saved = piece.roundOpenings?.filter((candidate) => ownsWaterBore(candidate, run.id));
        return !run.studs.includes(piece.id) || saved?.length !== 1 || saved[0].axis !== 0 ||
          !close(saved[0].diameter, opening.diameter) || !saved[0].center.every((value, i) => close(value, opening.center[i]));
      }) || measured.shields.some(({ placement, studId, face }) => {
        const id = run.shields.find((row) => row.studId === studId && row.face === face)?.id;
        const shield = project.pieces.find((piece) => piece.id === id);
        return !shield || !waterRunFits(shield, placement);
      });
    if (edited) return { problem: "The pipe, bores, shielding or isolators changed. Reopen this run to check its layout again." };
    return { measured };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : "The pipe route needs review." };
  }
}

export function waterRunGuide(project: Project, run: WaterRun) {
  const { measured, problem } = reviewWaterRun(project, run);
  if (!measured) return [`${run.name} · Review before boring. ${problem}`];
  const pipe = pexPipes[run.materialId];
  return [
    `${run.name} in ${measured.wall.name} · Cut ${dim(measured.length)} from SharkBite ${pipe.model} using a PEX cutter. Verify fitting insertion and final cut length at both ends.`,
    ...measured.studs.map(({ piece, opening, yMark, backMark, nearEdge, covers }) => {
      const support = measured.supports.find(({ studId }) => studId === piece.id);
      const sides = measured.shields.filter(({ studId }) => studId === piece.id).map(({ face }) => face);
      const closeToFace = Math.min(...Object.values(covers)) < pipeProtectionBaseline - tolerance;
      return `${piece.name} · Ø ${dim(opening.diameter)} through the stud’s 1½ in thickness. Center ${dim(yMark)} above the stud’s lower end and ${dim(backMark)} from its back face. Remaining bore-to-face wood ${dim(nearEdge)}.${sides.length ? ` NS1 shield on ${sides.join(" and ")}; ${closeToFace ? "pipe cover below 1¼ in" : "included under the 1½ in planning margin"}.` : ""}${
        support ? ` Seat the HoldRite flange on the face toward the run’s ${run.isolator!.face}, with the nail ears aligned up and down the stud.` : ""}`;
    }),
    ...waterSupportGuideLines(measured),
    "Verify the wall function, hidden services, shield coverage, pipe supports, fitting system and local requirements before closing the wall.",
  ];
}

export function waterSupportSpans(layout: Pick<ReturnType<typeof measureWaterRun>, "length" | "supports">) {
  const { supports, length } = layout;
  const gaps = supports.slice(1).map((next, index) => ({
    from: supports[index].studId, to: next.studId, length: next.distance - supports[index].distance,
  }));
  return {
    gaps,
    longest: Math.max(0, ...gaps.map((gap) => gap.length)),
    over: gaps.filter((gap) => gap.length > waterSupportReference.maximumSpan + tolerance),
    tails: supports.length ? [supports[0].distance, length - supports.at(-1)!.distance] as const : undefined,
  };
}

function waterSupportGuideLines(layout: ReturnType<typeof measureWaterRun>) {
  if (!layout.supports.length) return [];
  const { tails, longest, over } = waterSupportSpans(layout);
  const model = waterSupportProducts[waterSupportForPipe(layout.pipe.material)].model;
  return [
    `${layout.supports.length} HoldRite ${model} isolators · ${waterSupportReference.nailsPerSupport * layout.supports.length} flange nails specified. Confirm the delivered hardware and fasteners before threading the pipe.`,
    ...(layout.supports.length > 1 ? [`Longest span between modeled supports · ${dim(longest)}${over.length ? ` · Review ${over.length} above 32 in` : ""}.`] : []),
    `End reaches from the nearest isolator · Start ${dim(tails![0])} · End ${dim(tails![1])}. Review the actual support at fixtures and connections.`,
  ];
}

export function removeWaterRun(project: Project, run: WaterRun, keepPipe = false, keepFittings = false): Project {
  const ids = new Set(waterRunMembers(run));
  const attached = new Set(keepFittings ? [] : (project.waterFittings ?? [])
    .filter((fitting) => waterFittingPorts(fitting).some(({ runId }) => runId === run.id)).map(({ pieceId }) => pieceId));
  const stops = new Set(keepFittings ? [] : (project.waterStops ?? [])
    .filter(({ port }) => port.runId === run.id).map(({ pieceId }) => pieceId));
  for (const id of [...attached, ...stops]) ids.add(id);
  const runs = project.waterRuns?.filter(({ id }) => id !== run.id);
  const pieces = project.pieces.flatMap((piece) => {
    if (!ids.has(piece.id)) return clearWaterBores(piece, run.id);
    if (piece.id === run.pipeId && keepPipe) return piece;
    if (piece.id !== run.pipeId || !piece.cutStock) return [];
    const { guidePlacement, designRole, ...loose } = piece;
    return { ...loose, name: `Offcut · ${piece.name}`.slice(0, 120), offcut: true, assembly: "" };
  });
  return {
    ...project, waterRuns: runs, pieces,
    ...(attached.size && { waterFittings: project.waterFittings?.filter(({ pieceId }) => !attached.has(pieceId)) }),
    ...(stops.size && { waterStops: project.waterStops?.filter(({ pieceId }) => !stops.has(pieceId)) }),
    joints: project.joints.filter(({ a, b }) => !ids.has(a) && !ids.has(b)),
    guideFingerprint: null,
  };
}
