import { casingSwing } from "./doorCasing";
import { doorFloorStopMaterial, everbiltFloorStop, floorStopLayoutReference } from "./doorFloorStopReference";
import { floorStopMeasurementsSchema, type FloorStopMeasurements } from "./doorFloorStopSchema";
import { doorwayLeafRole } from "./doorWall";
import { bounds } from "./engine";
import { formatPreciseInches } from "./measurement";
import { part, projectSchema, uid, type Piece, type Project, type Section, type V3 } from "./model";
import { removeSection } from "./sections";
import { pieceOverlap } from "./solidCollision";
import { inverseRotation, rotate } from "./spatial";

const axisUp: V3 = [0, 1, 0];
const delta = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const point = (piece: Piece, local: V3): V3 => {
  const offset = rotate(local, piece.rotation);
  return [piece.position[0] + offset[0], piece.position[1] + offset[1], piece.position[2] + offset[2]];
};
const tolerance = 0.01;
const marginDegrees = 0.25;
export const floorStopAngle = (value: number) => `${Number(value.toFixed(1))}°`;

function floorStopFrame(project: Project, wallId: string) {
  const wall = project.sections.find(({ id }) => id === wallId);
  const unit = wall?.generator?.doorUnit;
  const leaf = wall && project.pieces.find(({ id, designRole, offcut }) =>
    wall.pieceIds.includes(id) && designRole === doorwayLeafRole && !offcut);
  if (!wall || !unit || !leaf || delta(rotate(axisUp, leaf.rotation), axisUp).some((value) => Math.abs(value) > 1e-6))
    throw Error("Choose an upright fitted interior door and review its hinge.");
  return { wall, unit, leaf };
}

function withoutStop(project: Project, section?: Section): Project {
  if (!section) return project;
  const ids = new Set(section.pieceIds);
  return { ...project, pieces: project.pieces.filter(({ id }) => !ids.has(id)),
    sections: project.sections.filter(({ id }) => id !== section.id) };
}

export function floorStopStartingAngle(project: Project, wallId: string, saved?: Section) {
  const before = casingSwing(withoutStop(project, saved), wallId, { useSavedSetup: false });
  if (!before?.limit || before.limit.travel < 6) return;
  const latest = Math.floor((before.limit.travel - 1) * 2) / 2;
  return { baseline: before.limit.travel, target: Math.max(5, latest - 2) };
}

function stopPosition(project: Project, wallId: string, input: FloorStopMeasurements) {
  const { leaf, unit, wall } = floorStopFrame(project, wallId);
  const before = casingSwing(project, wallId, { useSavedSetup: false });
  if (!before?.review || !before.limit)
    throw Error(before?.error ?? "Review the fitted door swing before placing a floor stop.");
  if (input.target > before.limit.travel - marginDegrees)
    throw Error(`The current sweep reaches ${floorStopAngle(before.limit.travel)}. Choose an earlier target with room before that limit.`);
  if (input.latchInset + input.width / 2 > leaf.size[0] / 2 ||
      input.latchInset < input.width / 2 - tolerance)
    throw Error("Keep the measured stop footprint under the latch half of the open leaf. Adjust the distance in from the latch edge.");
  if (input.height < unit.floorGap + 0.0625)
    throw Error("The stop needs to project above the bottom of the door. Measure the actual floor gap and bumper height.");

  const latchSign = unit.hingeSide === "left" ? 1 : -1;
  const localStation: V3 = [latchSign * (leaf.size[0] / 2 - input.latchInset), 0, 0];
  const posed = before.review.preview(input.target).pieces.find(({ id }) => id === leaf.id)!;
  const earlier = before.review.preview(input.target - 0.1).pieces.find(({ id }) => id === leaf.id)!;
  const advance = delta(point(posed, localStation), point(earlier, localStation));
  const front = rotate([0, 0, 1], posed.rotation);
  const facing = advance[0] * front[0] + advance[2] * front[2] > 0 ? 1 : -1;
  // Place the bumper face just ahead of the leaf. The sweep determines contact against the actual stop piece.
  const approach = Math.min(1 / 16, input.depth / 4);
  const center = point(posed, [localStation[0], 0, facing * ((leaf.size[2] + input.depth) / 2 - approach)]);
  center[1] = leaf.position[1] - leaf.size[1] / 2 - unit.floorGap + input.height / 2;
  return { wall, unit, leaf, before, center, rotation: posed.rotation };
}

function assessStop(project: Project, wallId: string, piece: Piece, layout: ReturnType<typeof stopPosition>) {
  const swing = casingSwing(project, wallId, { useSavedSetup: false });
  const box = bounds(piece);
  const zone = project.workZone;
  const outside = zone && (box.min[0] < -zone.width / 2 - tolerance || box.max[0] > zone.width / 2 + tolerance ||
    box.min[1] < -tolerance || box.max[1] > zone.height + tolerance ||
    box.min[2] < -zone.depth / 2 - tolerance || box.max[2] > zone.depth / 2 + tolerance);
  const conflict = project.pieces.find((other) => {
    if (other.id === piece.id || other.offcut) return false;
    const adjacent = bounds(other);
    return !box.min.some((min, axis) => box.max[axis] <= adjacent.min[axis] + tolerance || adjacent.max[axis] <= min + tolerance) &&
      pieceOverlap(piece, other, tolerance) !== false;
  });
  const { limit, stop } = swing ?? {};
  const current = ![...delta(piece.position, layout.center), ...[0, 1, 2].flatMap((axis) => {
    const basis: V3 = [0, 0, 0];
    basis[axis] = 1;
    return delta(rotate(basis, piece.rotation), rotate(basis, layout.rotation));
  })].some((value) => Math.abs(value) > tolerance);
  const beforeLimit = layout.before.limit!.travel;
  const confirmed = limit && stop && !limit.uncertain && !!limit.travel &&
    stop.interferenceIds.length === 2 && stop.interferenceIds.includes(piece.id) &&
    stop.interferenceIds.includes(layout.leaf.id) && !stop.siteFaceHits.length && !stop.outsideZoneFaces.length &&
    beforeLimit - limit.travel >= marginDegrees;
  const issue = !current ? "The doorway or stop has moved. Preview its floor position again."
    : outside ? "The stop footprint extends outside the work zone."
    : conflict ? `The stop overlaps ${conflict.name} with the door closed.`
    : swing?.review?.unresolvedIds.length ? "Some geometry could not be checked. Review the modeled obstructions before placing the stop."
    : !confirmed ? `The sweep could not confirm the leaf meets this stop first${stop?.obstacleNames.length ? ` (contact near ${floorStopAngle(limit!.travel)} with ${stop.obstacleNames.join(", ")})` : ""}. Try an earlier angle or change the measured position.`
    : undefined;
  const obstacle = layout.before.stop?.obstacleNames.join(", ");
  const limitingPart = layout.before.stop?.interferenceIds.flatMap((id) => {
    const member = project.pieces.find((part) => part.id === id);
    return member?.designRole?.startsWith("door-hardware-") ? [member.name] : [];
  }).join(", ");
  const baseline = `Without the stop, the modeled swing reaches ${floorStopAngle(beforeLimit)}${obstacle ? ` before ${limitingPart ? `${limitingPart} contact with ` : "contact with "}${obstacle}` : ""}.`;
  const result = issue ?? `The door leaf meets the floor stop first near ${floorStopAngle(limit!.travel)}.`;
  const latch = point(layout.leaf, [layout.unit.hingeSide === "left" ? layout.leaf.size[0] / 2 : -layout.leaf.size[0] / 2, 0, 0]);
  const local = rotate(delta(piece.position, latch), inverseRotation(layout.leaf.rotation));
  const length = (value: number) => formatPreciseInches(Math.round(Math.abs(value) * 32) / 32);
  const marks = `From the center of the closed latch edge projected onto the floor, mark the stop footprint center about ${length(local[0])} ${local[0] < 0 ? "left" : "right"} along the doorway and ${length(local[2])} toward the ${local[2] < 0 ? "back" : "front"} face. Left and right follow the wall’s front elevation.`;
  return { piece, swing, issue, baseline, result, marks, priorContacts: layout.before.stop?.interferenceIds ?? [] };
}

export function previewFloorStop(project: Project, wallId: string, fields: FloorStopMeasurements) {
  const input = floorStopMeasurementsSchema.parse(fields);
  const old = project.sections.find(({ doorFloorStop }) => doorFloorStop?.wallId === wallId);
  const source = withoutStop(project, old);
  const layout = stopPosition(source, wallId, input);
  const name = `${layout.wall.name.slice(0, 61)} floor stop`;
  const geometry = part(name, doorFloorStopMaterial, [input.width, input.height, input.depth], layout.center,
    layout.leaf.stepId, name, layout.rotation);
  const previousId = old?.pieceIds[0];
  const piece = previousId ? { ...geometry, id: previousId } : geometry;
  const section: Section = { id: old?.id ?? uid(), name, pieceIds: [piece.id], origin: piece.position, rotation: piece.rotation,
    generator: null, recipe: null, doorFloorStop: { wallId, ...input } };
  const candidate = projectSchema.parse({ ...source, pieces: [...source.pieces, piece],
    sections: [...source.sections, section], guideFingerprint: null });
  return { project: candidate, section, wall: layout.wall, ...assessStop(candidate, wallId, piece, layout) };
}

export function removeFloorStop(project: Project, sectionId: string) {
  return { ...removeSection(project, sectionId), guideFingerprint: null };
}

export function reviewFloorStop(project: Project, section: Section) {
  const record = section.doorFloorStop;
  if (!record) return { issue: "The floor stop measurements are missing." };
  if (project.sections.some(({ id, doorFloorStop }) => id !== section.id && doorFloorStop?.wallId === record.wallId))
    return { issue: "More than one fitted stop is linked to this doorway. Remove the extra stop and review the sweep again." };
  const piece = project.pieces.find(({ id, material, offcut }) =>
    id === section.pieceIds[0] && material === doorFloorStopMaterial && !offcut);
  if (section.pieceIds.length !== 1 || !piece ||
      delta(piece.size, [record.width, record.height, record.depth]).some((value) => Math.abs(value) > tolerance) ||
      piece.cutPlanes.length || piece.rectangularOpenings?.length || piece.roundOpenings?.length)
    return { issue: "The stop geometry has changed. Preview the original measurements again." };
  try {
    const layout = stopPosition(withoutStop(project, section), record.wallId, record);
    return assessStop(project, record.wallId, piece, layout);
  } catch (cause) {
    return { issue: cause instanceof Error ? cause.message : "Review the fitted doorway and stop." };
  }
}

export function floorStopGuide(project: Project, section: Section) {
  const review = reviewFloorStop(project, section);
  if (review.issue || !("marks" in review)) return `Review the floor stop before fastening. ${review.issue ?? ""}`.trim();
  const exact = section.doorFloorStop?.purchase === everbiltFloorStop.id;
  return [
    review.baseline, review.result, review.marks,
    "With the finished floor, door and trim in place, hold the actual stop at the mark and swing the door by hand. Confirm its bumper meets the leaf before the hardware reaches nearby surfaces. Verify substrate, concealed services and the walking path before fixing it with the selected stop’s instructions.",
    `Example floor layout procedure (Ives 438) · ${floorStopLayoutReference}`,
    ...(exact ? [`Selected stop · ${everbiltFloorStop.name} · ${everbiltFloorStop.listing}`] : []),
  ].join("\n");
}

export function floorStopTakeoff(project: Project) {
  const selected = project.sections.filter(({ doorFloorStop }) => doorFloorStop?.purchase === everbiltFloorStop.id);
  const required = selected.filter((section) => !reviewFloorStop(project, section).issue).length;
  return { required, review: selected.length - required };
}
