import { casingSwing } from "./doorCasing";
import { doorHardwareRole, doorHardwareRoles, georgianPassage } from "./doorHardwareReference";
import { doorHardwareSchema } from "./doorHardwareSchema";
import { doorwayLeafRole } from "./doorWall";
import { formatPreciseInches } from "./measurement";
import { projectSchema, sectionParts, syncDoorwayMotion, type Project, type Section } from "./model";

export function doorHardwareParts(project: Project, section: Section) {
  const ids = new Set(section.pieceIds);
  return project.pieces.filter(({ id, designRole, offcut }) => ids.has(id) && !offcut && doorHardwareRole(designRole));
}

export function previewDoorHardware(project: Project, wallId: string, fields: unknown | null) {
  const section = project.sections.find(({ id }) => id === wallId);
  const command = section?.generator;
  if (!section || !command?.doorUnit) throw Error("Fit the interior door and hinge before reviewing hardware.");
  const old = doorHardwareParts(project, section);
  const oldIds = new Set(old.map(({ id }) => id));
  const leaf = project.pieces.find(({ id, designRole, offcut }) =>
    !offcut && designRole === doorwayLeafRole && section.pieceIds.includes(id));
  if (!leaf) throw Error("The fitted door leaf is missing. Review the doorway first.");
  const { hardware: _previous, ...bareDoor } = command.doorUnit;
  const hardware = fields === null ? undefined : doorHardwareSchema.parse(fields);
  const nextCommand = { ...command, doorUnit: { ...bareDoor, ...(hardware && { hardware }) } };
  const parts = sectionParts(nextCommand, leaf.stepId, section.name, section.origin, section.rotation)
    .filter(({ designRole }) => doorHardwareRole(designRole))
    .map((piece) => ({ ...piece, id: old.find(({ designRole }) => designRole === piece.designRole)?.id ?? piece.id }));
  const removed = new Set(old.filter(({ id }) => !parts.some((piece) => piece.id === id)).map(({ id }) => id));
  const next = { ...section, generator: nextCommand, pieceIds: [
    ...section.pieceIds.filter((id) => !oldIds.has(id)), ...parts.map(({ id }) => id),
  ] };
  const candidate = projectSchema.parse(syncDoorwayMotion({ ...project,
    pieces: [...project.pieces.filter(({ id }) => !oldIds.has(id)), ...parts],
    joints: project.joints.filter(({ a, b }) => !removed.has(a) && !removed.has(b)),
    sections: project.sections.map((row) => row.id === wallId ? next : row),
    guideFingerprint: null,
  }, wallId));
  const swing = casingSwing(candidate, wallId, { useSavedSetup: false });
  if (!swing?.review) throw Error(swing?.error ?? "Review the fitted hinge and door before checking hardware.");
  return { project: candidate, wall: next, parts, swing };
}

export function georgianPassageTakeoff(project: Project) {
  const doors = project.sections.filter(({ generator }) => generator?.doorUnit?.hardware?.purchase === georgianPassage.id);
  const complete = doors.filter((section) => {
    const parts = doorHardwareParts(project, section);
    return doorHardwareRoles.every((role) => parts.some(({ designRole }) => designRole === role));
  });
  return { required: complete.length, review: doors.length - complete.length };
}

export function doorHardwareGuide(section: Section) {
  const hardware = section.generator?.doorUnit?.hardware;
  if (!hardware) return "";
  const inches = formatPreciseInches;
  const choice = hardware.purchase === georgianPassage.id ? georgianPassage.name : `Measured door ${hardware.grip}`;
  return [
    `${choice} · ${inches(hardware.backset)} backset from the latch edge · bore center ${inches(hardware.centerHeight)} up from the bottom of the leaf.`,
    ...(["front", "back"] as const).map((face) => {
      const { width, height, projection } = hardware[face];
      return `${face === "front" ? "Front" : "Back"} clearance · ${inches(width)} wide × ${inches(height)} high, projecting ${inches(projection)} from the leaf.`;
    }),
    "Verify the existing bore and actual trim profile before fastening. Open and close the fitted door with its installed stop, casing and nearby obstructions in place.",
    ...(hardware.purchase === georgianPassage.id ? [
      `Confirm the ${inches(georgianPassage.bore)} cross bore and use the supplied template for the edge bore and strike. Schlage door preparation · ${georgianPassage.preparation}`,
    ] : []),
  ].join("\n");
}
