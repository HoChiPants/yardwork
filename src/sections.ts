import { bounds, bom, validate } from "./engine";
import {
  projectSchema,
  applyCommand,
  sectionParts,
  step,
  uid,
  type Command,
  type Piece,
  type Project,
  type Section,
  type V3,
} from "./model";
import { composeRotation, inverseRotation, rotate } from "./spatial";
/** UI mutations remove membership for deleted parts and keep reusable offcuts loose. Imports remain strict. */
export function reconcileSections(p: Project): Project {
  const active = new Set(p.pieces.filter((a) => !a.offcut).map((a) => a.id));
  return {
    ...p,
    sections: p.sections
      .map((s) => ({
        ...s,
        pieceIds: s.pieceIds.filter((id) => active.has(id)),
      }))
      .filter((s) => s.pieceIds.length > 0),
  };
}
export function transformSection(
  p: Project,
  id: string,
  origin: V3,
  rotation: V3,
): Project {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("This section is no longer in the project.");
  const delta = composeRotation(rotation, inverseRotation(section.rotation)),
    ids = new Set(section.pieceIds);
  const next = {
    ...p,
    pieces: p.pieces.map((a) => {
      if (!ids.has(a.id)) return a;
      const offset = rotate(
        a.position.map((v, i) => v - section.origin[i]) as V3,
        delta,
      );
      return {
        ...a,
        position: offset.map((v, i) => v + origin[i]) as V3,
        rotation: composeRotation(delta, a.rotation),
      };
    }),
    sections: p.sections.map((s) =>
      s.id === id ? { ...s, origin, rotation } : s,
    ),
  };
  return projectSchema.parse(next);
}
export function removeSection(p: Project, id: string): Project {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("Choose a section first.");
  const ids = new Set(section.pieceIds);
  return {
    ...p,
    pieces: p.pieces.filter((a) => !ids.has(a.id)),
    joints: p.joints.filter((j) => !ids.has(j.a) && !ids.has(j.b)),
    sections: p.sections.filter((s) => s.id !== id),
  };
}
export function duplicateSection(
  p: Project,
  id: string,
): { project: Project; sectionId: string } {
  const section = p.sections.find((s) => s.id === id);
  if (!section) throw Error("Choose a section first.");
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
  };
  const joints = p.joints
    .filter((j) => members.has(j.a) && members.has(j.b))
    .map((j) => ({
      ...j,
      id: uid(),
      a: ids.get(j.a)!,
      b: ids.get(j.b)!,
      stepId: newStep.id,
    }));
  const project = projectSchema.parse({
    ...p,
    steps: [...p.steps, newStep],
    pieces: [...p.pieces, ...pieces],
    sections: [...p.sections, clone],
    joints: [...p.joints, ...joints],
  });
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
    command: s.generator,
    pieceCount: s.pieceIds.length,
  };
}
export function sectionSummary(command: Command) {
  return command.type === "wall"
    ? `${command.width} × ${command.height} in wall · ${command.spacing} in spacing`
    : `${command.width} × ${command.depth} in base · ${command.spacing} in spacing`;
}

export function previewSectionCommand(
  project: Project,
  command: Command,
  targetId?: string,
) {
  const candidate = projectSchema.parse(
    applyCommand(project, command, targetId),
  );
  const oldIds = new Set(project.pieces.map((a) => a.id)),
    newIds = new Set(candidate.pieces.map((a) => a.id));
  const rows = bom(candidate);
  return {
    added: candidate.pieces.filter((a) => !oldIds.has(a.id)).length,
    removed: project.pieces.filter((a) => !newIds.has(a.id)).length,
    removedConnections: project.joints.length - candidate.joints.length,
    costBefore: bom(project).reduce((n, r) => n + r.total, 0),
    costAfter: rows.reduce((n, r) => n + r.total, 0),
    incompleteEstimate: rows.some((r) => r.oversize > 0),
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
  for (let axis = 0; axis < 3; axis++) {
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
