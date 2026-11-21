import { bounds, bom, validate } from "./engine";
import { moduleSchema, recipeParts } from "./planning";
import {
  projectSchema,
  commandSchema,
  applyCommand,
  material,
  sectionParts,
  step,
  syncDoorwayMotion,
  uid,
  type Command,
  type SectionCommand,
  type Piece,
  type Project,
  type Section,
  type V3,
} from "./model";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { planOffcutReuse } from "./offcutReusePlan";
import { persistLidPose, transformRecordedLidMotion } from "./lidMotion";
import {
  copyBoundFurniture,
  forgetBoundSection,
  reconcileIdeaBindings,
  refreshBoundRecipe,
  syncBoundLid,
  updateBoundSectionPose,
} from "./ideaBindingState";
/** UI mutations remove membership for deleted parts and keep reusable offcuts loose. Imports remain strict. */
export function reconcileSections(p: Project): Project {
  const active = new Set(p.pieces.filter((a) => !a.offcut).map((a) => a.id));
  return reconcileIdeaBindings({
    ...p,
    ...(p.shelfSagPlans && { shelfSagPlans: p.shelfSagPlans.filter(({ pieceId }) => active.has(pieceId)) }),
    sections: p.sections
      .map((s) => ({
        ...s,
        pieceIds: s.pieceIds.filter((id) => active.has(id)),
      }))
      .filter((s) => s.pieceIds.length > 0),
  });
}
export function transformSection(
  p: Project,
  id: string,
  origin: V3,
  rotation: V3,
): Project {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("This section is no longer in the project.");
  const translating = rotation.every(
    (value, axis) => value === section.rotation[axis],
  );
  const delta: V3 = translating
    ? [0, 0, 0]
    : composeRotation(rotation, inverseRotation(section.rotation));
  const translation = origin.map((value, axis) => value - section.origin[axis]);
  const movePoint = (point: V3): V3 => {
    if (translating)
      return point.map((value, axis) => value + translation[axis]) as V3;
    const relative = point.map(
      (value, axis) => value - section.origin[axis],
    ) as V3;
    return rotate(relative, delta).map(
      (value, axis) => value + origin[axis],
    ) as V3;
  };
  const ids = new Set(section.pieceIds);
  const next = {
    ...p,
    pieces: p.pieces.map((a) => {
      if (!ids.has(a.id)) return a;
      return {
        ...a,
        position: movePoint(a.position),
        rotation: translating ? a.rotation : composeRotation(delta, a.rotation),
      };
    }),
    sections: p.sections.map((s) =>
      s.id === id
        ? {
            ...s,
            origin,
            rotation,
            ...(s.recordedLidMotion
              ? {
                  recordedLidMotion: transformRecordedLidMotion(
                    s.recordedLidMotion,
                    movePoint,
                    delta,
                  ),
                }
              : {}),
            recipe: s.recipe
              ? { ...s.recipe, position: origin, yaw: normalYaw(rotation[1]) }
              : null,
          }
        : s,
    ),
  };
  return projectSchema.parse(updateBoundSectionPose(next, id));
}
export function removeSection(p: Project, id: string): Project {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("Choose a section first.");
  const ids = new Set(section.pieceIds);
  return projectSchema.parse(
    syncDoorwayMotion(forgetBoundSection(
      {
        ...p,
        pieces: p.pieces.filter((a) => !ids.has(a.id)),
        joints: p.joints.filter((j) => !ids.has(j.a) && !ids.has(j.b)),
        sections: p.sections.filter((s) => s.id !== id),
      },
      id,
    ), id),
  );
}
export function duplicateSection(
  p: Project,
  id: string,
): { project: Project; sectionId: string } {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("Choose a section first.");
  if (section.recordedLidMotion) throw Error("Close the measured lid before duplicating its section. Select actual members for a new hinge plan afterward.");
  const members = new Set(section.pieceIds),
    ids = new Map(section.pieceIds.map((id) => [id, uid()]));
  let n = 2;
  while (p.sections.some((s) => s.name === `${section.name.slice(0, 70)} ${n}`))
    n++;
  const name = `${section.name.slice(0, 70)} ${n}`,
    newStep = step(
      `Assemble ${name}`,
      "Section copy. Verify placement and specify connections to the rest of the project.",
    );
  const offset: V3 = [12, 0, 12],
    pieces = p.pieces
      .filter((a) => members.has(a.id))
      .map((a) => ({
        ...structuredClone(a),
        cutStock: null,
        id: ids.get(a.id)!,
        assembly: name,
        stepId: newStep.id,
        position: a.position.map((v, i) => v + offset[i]) as V3,
      }));
  const clone: Section = {
    ...structuredClone(section),
    id: uid(),
    name,
    pieceIds: pieces.map((a) => a.id),
    origin: section.origin.map((v, i) => v + offset[i]) as V3,
    recipe: section.recipe
      ? {
          ...section.recipe,
          name,
          position: section.origin.map((v, i) => v + offset[i]) as V3,
          yaw: normalYaw(section.rotation[1]),
        }
      : null,
  };
  delete clone.roomFraming;
  if (clone.floorHangerPlan) {
    const ends = clone.floorHangerPlan.ends.flatMap(({ rimId, joistId }) => {
      const rim = ids.get(rimId), joist = ids.get(joistId);
      return rim && joist ? [{ rimId: rim, joistId: joist }] : [];
    });
    if (ends.length) clone.floorHangerPlan = { ...clone.floorHangerPlan, ends };
    else delete clone.floorHangerPlan;
  }
  const joints = p.joints
    .filter((j) => members.has(j.a) && members.has(j.b))
    .map((j) => ({
      ...j,
      id: uid(),
      a: ids.get(j.a)!,
      b: ids.get(j.b)!,
      stepId: newStep.id,
    }));
  const project = projectSchema.parse(
    syncDoorwayMotion(copyBoundFurniture(
      {
        ...p,
        steps: [...p.steps, newStep],
        pieces: [...p.pieces, ...pieces],
        sections: [...p.sections, clone],
        joints: [...p.joints, ...joints],
      },
      id,
      clone.id,
    ), clone.id),
  );
  return { project, sectionId: clone.id };
}
export function createSection(
  p: Project,
  pieceIds: string[],
  name: string,
): { project: Project; sectionId: string } {
  if (!pieceIds.length) throw Error("Choose at least one part.");
  const used = new Set(p.sections.flatMap((s) => s.pieceIds));
  const ids = new Set(pieceIds),
    members = p.pieces.filter((a) => ids.has(a.id));
  if (
    members.length !== ids.size ||
    members.some((a) => a.offcut || used.has(a.id))
  )
    throw Error("Sections can only contain existing, ungrouped build parts.");
  const boxes = members.map(bounds);
  const origin = [0, 1, 2].map(
    (i) =>
      (Math.min(...boxes.map((b) => b.min[i])) +
        Math.max(...boxes.map((b) => b.max[i]))) /
      2,
  ) as V3;
  const section: Section = {
    id: uid(),
    name: name.trim() || "My section",
    pieceIds: [...ids],
    origin,
    rotation: [0, 0, 0],
    generator: null,
    recipe: null,
  };
  return {
    project: projectSchema.parse({ ...p, sections: [...p.sections, section] }),
    sectionId: section.id,
  };
}
function sameGeometry(a: Piece, b: Piece) {
  return (
    a.material === b.material &&
    a.size.every((v, i) => Math.abs(v - b.size[i]) < 0.001) &&
    a.position.every((v, i) => Math.abs(v - b.position[i]) < 0.001) &&
    rotate([1, 0, 0], a.rotation).every(
      (v, i) => Math.abs(v - rotate([1, 0, 0], b.rotation)[i]) < 0.001,
    ) &&
    rotate([0, 1, 0], a.rotation).every(
      (v, i) => Math.abs(v - rotate([0, 1, 0], b.rotation)[i]) < 0.001,
    )
  );
}
export function sectionModified(p: Project, s: Section) {
  if (s.recipe) return recipeModified(p, s);
  if (!s.generator) return false;
  const members = p.pieces.filter((a) => s.pieceIds.includes(a.id));
  if (!members.length) return true;
  const expected = sectionParts(
    s.generator,
    members[0].stepId,
    s.name,
    s.origin,
    s.rotation,
  );
  const unmatched = [...members];
  for (const a of expected) {
    const i = unmatched.findIndex((b) => sameGeometry(a, b));
    if (i < 0) return true;
    unmatched.splice(i, 1);
  }
  return unmatched.length > 0;
}
export function sectionContext(s: Section) {
  if (!s.generator) return undefined;
  return {
    sectionId: s.id,
    name: s.name,
    command: commandSchema.parse(s.generator),
    pieceCount: s.pieceIds.length,
  };
}
export function sectionSummary(command: Command) {
  return command.type === "wall"
    ? `${command.width} × ${command.height} in wall · ${command.spacing} in spacing${command.windowOpening
      ? ` · ${command.windowOpening.width} × ${command.windowOpening.height} in rough window` : command.doorOpening
      ? ` · ${command.doorOpening.width} × ${command.doorOpening.height} in rough doorway` : ""}`
    : `${command.width} × ${command.depth} in base · ${command.spacing} in spacing`;
}

export function previewSectionCommand(
  project: Project,
  command: SectionCommand,
  targetId?: string,
  reuseOpeningOffcuts = false,
) {
  const planned = projectSchema.parse(
    applyCommand(project, command, targetId),
  );
  const oldIds = new Set(project.pieces.map((a) => a.id)),
    generatedIds = new Set(planned.pieces.filter(({ id }) => !oldIds.has(id)).map(({ id }) => id));
  const wall = (command.windowOpening || command.doorOpening) &&
    (targetId ? planned.sections.find(({ id }) => id === targetId) : planned.sections.at(-1));
  const offcuts = wall && reuseOpeningOffcuts
    ? planOffcutReuse(planned, undefined, generatedIds) : null;
  const candidate = offcuts?.project ?? planned;
  const newIds = new Set(candidate.pieces.map((a) => a.id));
  const rows = bom(candidate);
  const beforeRows = bom(project);
  const added = candidate.pieces.filter(({ id, offcut }) => !oldIds.has(id) && !offcut);
  const wallCuts = wall ? bom({
    ...candidate, pieces: candidate.pieces.filter(({ id, cutStock, material: idOfStock }) => wall.pieceIds.includes(id) && !cutStock && material(idOfStock).wood), joints: [],
  }) : [];
  return {
    added: added.length,
    removed: project.pieces.filter((a) => !newIds.has(a.id)).length,
    removedConnections: project.joints.length - candidate.joints.length,
    costBefore: beforeRows.reduce((n, r) => n + r.total, 0),
    costAfter: rows.reduce((n, r) => n + r.total, 0),
    incompleteEstimate: [...beforeRows, ...rows].some((r) => r.oversize > 0 || r.unpriced),
    basePurchase: command.type === "foundation"
      ? bom({ ...candidate, pieces: added, joints: [] }).map(({ id, quantity, oversize }) => ({ id, quantity, oversize }))
      : [],
    wallCuts, offcuts, candidate,
    findings: validate(candidate).filter((f) => f.severity !== "info"),
  };
}
/** Nearby face snapping for assembly placement, using world bounds and excluding its own members. */
export function snapSectionOrigin(
  project: Project,
  id: string,
  origin: V3,
  rotation: V3,
  tolerance = 0.8,
  axes: readonly number[] = [0, 1, 2],
): V3 {
  const candidate = transformSection(project, id, origin, rotation),
    section = candidate.sections.find((s) => s.id === id)!;
  const ids = new Set(section.pieceIds),
    members = candidate.pieces.filter((p) => ids.has(p.id)),
    others = project.pieces
      .filter((p) => !ids.has(p.id) && !p.offcut)
      .map(bounds);
  const boxes = members.map(bounds),
    box = {
      min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))),
      max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))),
    };
  const snapped = [...origin] as V3;
  for (const axis of axes) {
    let best = tolerance,
      offset = 0;
    for (const other of others) {
      if (
        ![0, 1, 2]
          .filter((i) => i !== axis)
          .every(
            (i) =>
              Math.min(box.max[i], other.max[i]) -
                Math.max(box.min[i], other.min[i]) >
              0,
          )
      )
        continue;
      for (const delta of [
        other.max[axis] - box.min[axis],
        other.min[axis] - box.max[axis],
      ])
        if (Math.abs(delta) < best) {
          best = Math.abs(delta);
          offset = delta;
        }
    }
    snapped[axis] += offset;
    box.min[axis] += offset;
    box.max[axis] += offset;
  }
  return snapped;
}

function normalYaw(radians: number) {
  return (((((radians * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
}
/** Compare against deterministic recipe geometry, so stock-size edits are never mistaken for a dimensional rebuild. */
export function recipeModified(project: Project, section: Section) {
  if (!section.recipe) return false;
  const members = project.pieces.filter((p) => section.pieceIds.includes(p.id));
  if (!members.length) return true;
  let expected: Piece[];
  try {
    expected = recipeParts(
      section.recipe,
      members[0].stepId,
      section.name,
      section.origin,
      section.rotation,
    );
  } catch {
    return true;
  }
  const unmatched = [...members];
  for (const piece of expected) {
    const index = unmatched.findIndex((other) => sameGeometry(piece, other));
    if (index < 0) return true;
    unmatched.splice(index, 1);
  }
  return unmatched.length > 0;
}
export function resizeRecipeSection(
  project: Project,
  id: string,
  dimensions: { width: number; depth: number; height: number },
) {
  const section = project.sections.find((s) => s.id === id);
  if (!section?.recipe) throw Error("Choose a recipe section to resize.");
  if (section.recordedLidMotion) throw Error("Close the measured lid before rebuilding its section.");
  const oldIds = new Set(section.pieceIds),
    members = project.pieces.filter((p) => oldIds.has(p.id));
  if (!members.length) throw Error("This section has no parts to rebuild.");
  const recipe = moduleSchema.parse({
    ...section.recipe,
    ...dimensions,
    name: section.name,
    position: section.origin,
    yaw: normalYaw(section.rotation[1]),
  });
  const pieces = recipeParts(
    recipe,
    members[0].stepId,
    section.name,
    section.origin,
    section.rotation,
  );
  return projectSchema.parse(
    refreshBoundRecipe(
      {
        ...project,
        pieces: [...project.pieces.filter((p) => !oldIds.has(p.id)), ...pieces],
        joints: project.joints.filter(
          (j) => !oldIds.has(j.a) && !oldIds.has(j.b),
        ),
        sections: project.sections.map((s) =>
          s.id === id ? { ...s, recipe, pieceIds: pieces.map((p) => p.id) } : s,
        ),
        guideFingerprint: null,
      },
      id,
    ),
  );
}
export function previewRecipeResize(
  project: Project,
  id: string,
  dimensions: { width: number; depth: number; height: number },
) {
  const section = project.sections.find((s) => s.id === id);
  if (!section?.recipe) throw Error("Choose a recipe section to resize.");
  const candidate = resizeRecipeSection(project, id, dimensions),
    changed = candidate.sections.find((s) => s.id === id)!,
    rows = bom(candidate);
  return {
    project: candidate,
    replacedParts: section.pieceIds.length,
    newParts: changed.pieceIds.length,
    removedConnections: project.joints.length - candidate.joints.length,
    manualEdits: recipeModified(project, section),
    incompleteEstimate: rows.some((r) => r.oversize > 0),
    findings: validate(candidate).filter((f) => f.severity !== "info"),
  };
}
/** Persist a provisional or explicitly selected measured pose, preserving the exact axis required to close. */
export function setSectionLidOpen(project: Project, id: string, open: boolean) {
  const next = persistLidPose(project, id, open);
  return next === project ? project : projectSchema.parse(syncBoundLid(next, id));
}
