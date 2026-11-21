import {
  blank,
  projectSchema,
  uid,
  type Project,
  type Piece,
  type V3,
} from "./model";
import { ideaPlanSchema, type IdeaPlan } from "./planSchema";
import { generateIdeaEntry, type GeneratedEntry } from "./ideaGeometry";
import { composeRotation, inverseRotation, rotate } from "./spatial";
import { bounds, bom, validate, projectPricingCoverage } from "./engine";
import { reconcileNarrative } from "./ideaNarrative";
import { supplyRows } from "./supplies";
import {
  stableValue,
  currentBindingFingerprint,
  entryPartIds,
  reconcileIdeaBindings,
} from "./ideaBindingState";
import type { BoundSpec, IdeaBinding, IdeaEntry } from "./ideaBindingSchema";
import type { StructureIdea } from "./recipeSchemas";
import type { StructureResult } from "./structures";
import { persistLidPose, siteFaceLidShortfall, transformRecordedLidMotion } from "./lidMotion";
import { clearanceAxis, reviewSiteClearance } from "./siteClearance";
import { prepareCollisionSolid, solidOverlap } from "./solidCollision";
export type IdeaRevisionOptions = {
  entryIds?: string[];
  allowRebuild?: boolean;
};
export type IdeaImpact = {
  replacedParts: number;
  newParts: number;
  removedConnections: number;
  affectedConnections: number;
  affectedFastenerPlans: number;
  affectedHingePlans: number;
  manualEdits: number;
  missingRoles: number;
  offcuts: number;
  changedEntries: number;
  addedEntries: number;
  removedEntries: number;
  changed: boolean;
  manualPartIds: string[];
  missingRoleNames: string[];
  affectedConnectionIds: string[];
  affectedFastenerPlanIds: string[];
  affectedHingePlanIds: string[];
  retainedOffcutIds: string[];
};
function binding(project: Project, id: string) {
  const found = project.ideaBindings.find((b) => b.id === id);
  if (!found) throw Error("This saved idea is no longer in the project.");
  return found;
}
function selection(b: IdeaBinding, entryIds?: string[]) {
  const ids = entryIds
    ? new Set(entryIds)
    : new Set(b.entries.map((e) => e.id));
  if (!ids.size || [...ids].some((id) => !b.entries.some((e) => e.id === id)))
    throw Error("Choose an existing saved idea entry.");
  return b.entries.filter((e) => ids.has(e.id));
}
const yaw = (r: V3) =>
  (((((r[1] * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
function withIdentity(entry: IdeaEntry): IdeaEntry {
  const spec: BoundSpec =
    entry.spec.type === "furniture"
      ? {
          type: "furniture",
          recipe: {
            ...entry.spec.recipe,
            entryId: entry.id,
            position: [...entry.pose.origin],
            yaw: yaw(entry.pose.rotation),
          },
        }
      : {
          type: "structure",
          structure: {
            ...entry.spec.structure,
            entryId: entry.id,
            parameters: {
              ...entry.spec.structure.parameters,
              origin: [...entry.pose.origin],
              yaw: yaw(entry.pose.rotation),
            },
          } as StructureIdea,
        };
  return { ...entry, spec };
}
export function bindingPlan(
  project: Project,
  id: string,
  entryIds?: string[],
): IdeaPlan {
  const b = binding(project, id),
    entries = selection(b, entryIds).map(withIdentity);
  return reconcileNarrative(
    ideaPlanSchema.parse({
      title: b.title,
      summary: b.summary,
      assumptions: b.assumptions,
      questions: b.questions,
      suggestions: b.suggestions,
      modules: entries.flatMap((e) =>
        e.spec.type === "furniture" ? [e.spec.recipe] : [],
      ),
      structures: entries.flatMap((e) =>
        e.spec.type === "structure" ? [e.spec.structure] : [],
      ),
    }),
  );
}
function token(project: Project, b: IdeaBinding) {
  return `${b.id}:${b.revision}:${currentBindingFingerprint(project, b)}`;
}
export function bindingToken(project: Project, id: string) {
  return token(project, binding(project, id));
}
function signature(piece: Piece, pose: IdeaEntry["pose"]) {
  const inv = inverseRotation(pose.rotation);
  return stableValue({
    material: piece.material,
    size: piece.size,
    position: rotate(
      piece.position.map((v, i) => v - pose.origin[i]) as V3,
      inv,
    ),
    rotation: composeRotation(inv, piece.rotation),
    cutPlanes: piece.cutPlanes,
    stockLengthAxis: piece.stockLengthAxis,
    ...(piece.foilReturns ? { foilReturns: piece.foilReturns } : {}),
    cutStock: piece.cutStock,
    offcut: piece.offcut,
  });
}
function expectedEntry(entry: IdeaEntry) {
  return generateIdeaEntry(blank(), entry.spec, entry.pose);
}
function inspectEntry(project: Project, entry: IdeaEntry) {
  const expected = expectedEntry(entry),
    actualIds = entryPartIds(project, entry),
    manualPartIds: string[] = [],
    missingRoleNames: string[] = [];
  let manualEdits = 0;
  const roles = new Set([
    ...expected.sections.map((m) => m.role),
    ...entry.sections
      .filter((m) => project.sections.some((s) => s.id === m.sectionId))
      .map((m) => m.role),
  ]);
  for (const role of roles) {
    const em = expected.sections.find((m) => m.role === role),
      expectedSection = expected.project.sections.find(
        (s) => s.id === em?.sectionId,
      ),
      mapping = entry.sections.find((m) => m.role === role),
      actualSection = project.sections.find((s) => s.id === mapping?.sectionId);
    if (expectedSection && !actualSection) missingRoleNames.push(role);
    const want = expected.project.pieces.filter((p) =>
        expectedSection?.pieceIds.includes(p.id),
      ),
      actual = project.pieces.filter((p) =>
        actualSection?.pieceIds.includes(p.id),
      ),
      counts = new Map<string, number>();
    for (const p of want) {
      const key = signature(p, entry.pose);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let unmatched = 0;
    for (const p of actual) {
      const key = signature(p, entry.pose),
        count = counts.get(key) ?? 0;
      if (count) counts.set(key, count - 1);
      else {
        unmatched++;
        manualPartIds.push(p.id);
      }
    }
    manualEdits += Math.max(
      unmatched,
      [...counts.values()].reduce((n, c) => n + c, 0),
    );
  }
  const sources = new Set(
      project.pieces
        .filter((p) => actualIds.has(p.id) && p.cutStock)
        .map((p) => p.cutStock!.id),
    ),
    offcuts = project.pieces.filter(
      (p) => p.offcut && p.cutStock && sources.has(p.cutStock.id),
    );
  return { manualEdits, manualPartIds, missingRoleNames, actualIds, offcuts };
}
export function bindingReview(
  project: Project,
  id: string,
  entryIds?: string[],
) {
  const b = binding(project, id),
    entries = selection(b, entryIds),
    reviews = entries.map((e) => inspectEntry(project, e)),
    ids = new Set(reviews.flatMap((r) => [...r.actualIds])),
    joints = project.joints.filter((j) => ids.has(j.a) || ids.has(j.b)),
    offcuts = [...new Set(reviews.flatMap((r) => r.offcuts.map((p) => p.id)))];
  return {
    token: token(project, b),
    manualEdits: reviews.reduce((n, r) => n + r.manualEdits, 0),
    manualPartIds: reviews.flatMap((r) => r.manualPartIds),
    missingRoles: reviews.reduce((n, r) => n + r.missingRoleNames.length, 0),
    missingRoleNames: reviews.flatMap((r) => r.missingRoleNames),
    affectedConnections: joints.length,
    affectedConnectionIds: joints.map((j) => j.id),
    offcuts: offcuts.length,
    retainedOffcutIds: offcuts,
  };
}
function poseFromSpec(spec: BoundSpec, old?: IdeaEntry): IdeaEntry["pose"] {
  const origin =
      spec.type === "furniture"
        ? spec.recipe.position
        : spec.structure.parameters.origin,
    degrees =
      spec.type === "furniture"
        ? spec.recipe.yaw
        : spec.structure.parameters.yaw;
  return {
    origin: [...origin],
    rotation: old
      ? [
          old.pose.rotation[0],
          Math.abs(degrees - yaw(old.pose.rotation)) < 0.00001
            ? old.pose.rotation[1]
            : (degrees * Math.PI) / 180,
          old.pose.rotation[2],
        ]
      : [0, (degrees * Math.PI) / 180, 0],
  };
}
function geometrySpec(spec: BoundSpec) {
  if (spec.type === "furniture") {
    const {
      entryId: _id,
      name: _name,
      position: _p,
      yaw: _y,
      lidOpen: _lid,
      ...rest
    } = spec.recipe;
    return { type: spec.type, recipe: rest };
  }
  const { entryId: _id, ...structure } = spec.structure,
    { origin: _o, yaw: _y, ...parameters } = structure.parameters;
  return { type: spec.type, structure: { ...structure, parameters } };
}
function rigidEntry(
  project: Project,
  entry: IdeaEntry,
  pose: IdeaEntry["pose"],
): Project {
  const ids = entryPartIds(project, entry),
    sections = new Set(entry.sections.map((m) => m.sectionId)),
    delta = composeRotation(
      pose.rotation,
      inverseRotation(entry.pose.rotation),
    ),
    point = (p: V3) =>
      rotate(p.map((v, i) => v - entry.pose.origin[i]) as V3, delta).map(
        (v, i) => v + pose.origin[i],
      ) as V3;
  return {
    ...project,
    pieces: project.pieces.map((p) =>
      ids.has(p.id)
        ? {
            ...p,
            position: point(p.position),
            rotation: composeRotation(delta, p.rotation),
          }
        : p,
    ),
    sections: project.sections.map((s) =>
      sections.has(s.id)
        ? {
            ...s,
            origin: point(s.origin),
            rotation: composeRotation(delta, s.rotation),
            ...(s.recordedLidMotion ? { recordedLidMotion: transformRecordedLidMotion(s.recordedLidMotion, point, delta) } : {}),
            recipe: s.recipe
              ? {
                  ...s.recipe,
                  position: point(s.origin),
                  yaw: yaw(composeRotation(delta, s.rotation)),
                }
              : null,
          }
        : s,
    ),
  };
}
function lidEntry(project: Project, old: IdeaEntry, next: IdeaEntry): Project {
  const measuredSection = old.sections.map((mapping) => project.sections.find((s) => s.id === mapping.sectionId))
    .find((s) => s && (s.recordedLidMotion || project.lidHingePlans.some((plan) => plan.sectionId === s.id && plan.selectedForMotion)));
  if (measuredSection && next.spec.type === "furniture")
    return persistLidPose(project, measuredSection.id, next.spec.recipe.lidOpen);
  const a = expectedEntry(old),
    b = expectedEntry({ ...next, pose: old.pose }),
    oldLid = a.project.pieces.find((p) => p.name.endsWith("seat lid")),
    newLid = b.project.pieces.find((p) => p.name.endsWith("seat lid")),
    ids = entryPartIds(project, old),
    actual = project.pieces.find(
      (p) => ids.has(p.id) && p.name.endsWith("seat lid"),
    );
  if (!oldLid || !newLid || !actual)
    throw Error(
      "The saved lid was removed or renamed. Keep the custom design or request a dimensional rebuild.",
    );
  const delta = composeRotation(
      newLid.rotation,
      inverseRotation(oldLid.rotation),
    ),
    offset = rotate(
      actual.position.map((n, i) => n - oldLid.position[i]) as V3,
      delta,
    );
  return {
    ...project,
    pieces: project.pieces.map((p) =>
      p.id === actual.id
        ? {
            ...p,
            position: newLid.position.map((n, i) => n + offset[i]) as V3,
            rotation: composeRotation(delta, p.rotation),
          }
        : p,
    ),
  };
}
function reviewBlock(plan: IdeaPlan, entries: IdeaEntry[]) {
  return [
    entries
      .map((e) => e.generatedNotes)
      .filter(Boolean)
      .join("\n\n"),
    `Planning review — ${plan.title}`,
    plan.summary,
    ...plan.assumptions.map((a) => `Assumption: ${a}`),
    ...plan.questions.map((q) => `Open question: ${q}`),
    ...plan.suggestions.map((s) => `Review: ${s}`),
  ]
    .filter(Boolean)
    .join("\n");
}
function roleMappings(generated: GeneratedEntry) {
  return generated.sections.map((m) => ({
    ...m,
    stepId: generated.project.pieces.find((p) =>
      generated.project.sections
        .find((s) => s.id === m.sectionId)
        ?.pieceIds.includes(p.id),
    )?.stepId,
  }));
}
export function applyNewIdea(project: Project, raw: IdeaPlan): Project {
  const plan = reconcileNarrative(ideaPlanSchema.parse(raw));
  if (plan.pendingPlacement?.length)
    throw Error("Resolve or set aside the remaining placement requests before applying.");
  if (!plan.modules.length && !plan.structures.length)
    throw Error("Answer the planning questions before adding parts.");
  let next = structuredClone(project);
  const entries: IdeaEntry[] = [];
  for (const source of [
    ...plan.modules.map(
      (recipe) => ({ type: "furniture", recipe }) as BoundSpec,
    ),
    ...plan.structures.map(
      (structure) => ({ type: "structure", structure }) as BoundSpec,
    ),
  ]) {
    const id = uid();
    let spec = structuredClone(source);
    if (spec.type === "furniture") {
      let name = spec.recipe.name,
        n = 2;
      while (next.sections.some((s) => s.name === name))
        name = `${spec.recipe.name.slice(0, 65)} ${n++}`;
      spec.recipe = { ...spec.recipe, entryId: id, name };
    } else spec.structure = { ...spec.structure, entryId: id };
    const pose = poseFromSpec(spec),
      generated = generateIdeaEntry(next, spec, pose);
    next = generated.project;
    entries.push({
      id,
      spec,
      pose,
      sections: roleMappings(generated),
      generatedNotes: generated.notes,
    });
  }
  const block = [
    `Planning review — ${plan.title}`,
    plan.summary,
    ...plan.assumptions.map((a) => `Assumption: ${a}`),
    ...plan.questions.map((q) => `Open question: ${q}`),
    ...plan.suggestions.map((s) => `Review: ${s}`),
  ].join("\n");
  next.notes = [next.notes, block].filter(Boolean).join("\n\n");
  if (next.notes.length > 10000)
    throw Error(
      "The planning assumptions do not fit in project notes. Shorten existing notes or the proposal before applying so design information is retained.",
    );
  const addedNotes = next.notes.startsWith(project.notes)
      ? next.notes.slice(project.notes.length).replace(/^\s*\n\n/, "")
      : "",
    b: IdeaBinding = {
      version: 1,
      id: uid(),
      revision: 1,
      currentFingerprint: "",
      title: plan.title,
      summary: plan.summary,
      assumptions: plan.assumptions,
      questions: plan.questions,
      suggestions: plan.suggestions,
      entries,
      generatedNotes: entries
        .map((e) => e.generatedNotes)
        .filter(Boolean)
        .join("\n\n"),
      reviewBlock: addedNotes,
    };
  return projectSchema.parse(
    reconcileIdeaBindings({
      ...next,
      ideaBindings: [...next.ideaBindings, b],
      guideFingerprint: null,
    }),
  );
}
export function bindStructureStudy(
  project: Project,
  idea: StructureIdea,
  result: StructureResult,
  title: string,
  summary: string,
): Project {
  const id = uid(),
    spec: BoundSpec = {
      type: "structure",
      structure: { ...idea, entryId: id },
    },
    pose = poseFromSpec(spec),
    sections = result.addedSectionIds.map((sectionId) => {
      const section = project.sections.find((s) => s.id === sectionId)!;
      return {
        role:
          Object.entries(result.geometryRoles).find(([, ids]) =>
            section.pieceIds.every((id) => ids.includes(id)),
          )?.[0] ?? section.name,
        sectionId,
        stepId: project.pieces.find((p) => section.pieceIds.includes(p.id))
          ?.stepId,
      };
    }),
    entry: IdeaEntry = {
      id,
      spec,
      pose,
      sections,
      generatedNotes: project.notes,
    },
    b: IdeaBinding = {
      version: 1,
      id: uid(),
      revision: 1,
      currentFingerprint: "",
      title,
      summary,
      assumptions: [],
      questions: [],
      suggestions: [],
      entries: [entry],
      generatedNotes: project.notes,
      reviewBlock: project.notes,
    };
  return projectSchema.parse(
    reconcileIdeaBindings({
      ...project,
      ideaBindings: [...project.ideaBindings, b],
    }),
  );
}
export function candidateIdeaPreview(
  project: Project,
  affectedIds?: Set<string>,
) {
  const parts = project.pieces.filter(
      (p) => !p.offcut && (!affectedIds || affectedIds.has(p.id)),
    ),
    boxes = parts.map(bounds),
    min = [0, 1, 2].map((i) =>
      boxes.length ? Math.min(...boxes.map((b) => b.min[i])) : 0,
    ) as V3,
    max = [0, 1, 2].map((i) =>
      boxes.length ? Math.max(...boxes.map((b) => b.max[i])) : 0,
    ) as V3,
    zone = project.workZone,
    rows = bom(project),
    supplies = supplyRows(project),
    pricing = projectPricingCoverage(project, rows, supplies);
  return {
    project,
    pricing,
    addedParts: parts.length,
    min,
    max,
    workZoneFits:
      !zone ||
      (min[0] >= -zone.width / 2 - 0.001 &&
        max[0] <= zone.width / 2 + 0.001 &&
        min[2] >= -zone.depth / 2 - 0.001 &&
        max[2] <= zone.depth / 2 + 0.001 &&
        min[1] >= -0.001 &&
        max[1] <= zone.height + 0.001),
    cost:
      rows.reduce((n, r) => n + r.total, 0) +
      supplies.reduce((n, r) => n + (r.total ?? 0), 0),
    incompleteEstimate: pricing.status === "partial",
    findings: validate(project).filter((f) => f.severity !== "info"),
  };
}
export function previewIdeaRevision(
  project: Project,
  id: string,
  raw: IdeaPlan,
  expectedToken: string,
  options: IdeaRevisionOptions = {},
) {
  const b = binding(project, id);
  if (token(project, b) !== expectedToken)
    throw Error(
      "This saved idea changed while the proposal was being prepared. Reopen its latest version before applying.",
    );
  const selected = selection(b, options.entryIds),
    managed = new Set(selected.map((e) => e.id)),
    plan = reconcileNarrative(ideaPlanSchema.parse(raw));
  if (!plan.modules.length && !plan.structures.length)
    throw Error(
      "The revision has no geometry. Keep the current saved idea while answering the planning questions.",
    );
  const incoming = new Map<string, IdeaEntry>(),
    newEntries: IdeaEntry[] = [];
  for (const spec of [
    ...plan.modules.map(
      (recipe) => ({ type: "furniture", recipe }) as BoundSpec,
    ),
    ...plan.structures.map(
      (structure) => ({ type: "structure", structure }) as BoundSpec,
    ),
  ]) {
    const eid =
        spec.type === "furniture"
          ? spec.recipe.entryId
          : spec.structure.entryId,
      old = eid ? b.entries.find((e) => e.id === eid) : undefined;
    if (eid && (!old || !managed.has(eid)))
      throw Error(
        "The revision references an entry outside its selected saved idea.",
      );
    if (eid && incoming.has(eid))
      throw Error(
        "The revision repeats an existing entry identity. Repartition it with fresh entry identities.",
      );
    const pose = poseFromSpec(spec, old);
    if (old && Math.abs(old.pose.rotation[1] - pose.rotation[1]) > 1e-8 &&
      [old.pose.rotation[0], old.pose.rotation[2]].some((angle) => Math.abs(angle) > 1e-8))
      throw Error("This assembly is tilted. Use the 3D Rotate tool to adjust its full orientation.");
    const entry: IdeaEntry = {
      id: eid ?? uid(),
      spec,
      pose,
      sections: old?.sections ?? [],
      generatedNotes: old?.generatedNotes ?? "",
    };
    if (old) incoming.set(old.id, withIdentity(entry));
    else newEntries.push(withIdentity(entry));
  }
  let next = structuredClone(project);
  const destructive: IdeaEntry[] = [],
    updated = new Map<string, IdeaEntry>(),
    impact: IdeaImpact = {
      replacedParts: 0,
      newParts: 0,
      removedConnections: 0,
      affectedConnections: 0,
      affectedFastenerPlans: 0,
      affectedHingePlans: 0,
      manualEdits: 0,
      missingRoles: 0,
      offcuts: 0,
      changedEntries: 0,
      addedEntries: newEntries.length,
      removedEntries: 0,
      changed: false,
      manualPartIds: [],
      missingRoleNames: [],
      affectedConnectionIds: [],
      affectedFastenerPlanIds: [],
      affectedHingePlanIds: [],
      retainedOffcutIds: [],
    };
  for (const old of selected) {
    const fresh = incoming.get(old.id);
    if (!fresh) {
      destructive.push(old);
      impact.removedEntries++;
      continue;
    }
    if (
      stableValue(geometrySpec(old.spec)) !==
      stableValue(geometrySpec(fresh.spec))
    ) {
      destructive.push(old);
      updated.set(old.id, fresh);
      continue;
    }
    const lid =
        old.spec.type === "furniture" &&
        fresh.spec.type === "furniture" &&
        old.spec.recipe.lidOpen !== fresh.spec.recipe.lidOpen,
      pose = stableValue(old.pose) !== stableValue(fresh.pose);
    if (lid) next = lidEntry(next, old, fresh);
    if (pose) next = rigidEntry(next, old, fresh.pose);
    if (lid || pose) {
      impact.changedEntries++;
      impact.changed = true;
      next.sections = next.sections.map((s) =>
        old.sections.some((m) => m.sectionId === s.id) &&
        fresh.spec.type === "furniture"
          ? {
              ...s,
              recipe: {
                ...fresh.spec.recipe,
                position: [...fresh.pose.origin],
                yaw: yaw(fresh.pose.rotation),
              },
            }
          : s,
      );
      updated.set(old.id, fresh);
    }
  }
  const removedIds = new Set<string>(),
    archiveIds = new Set<string>(),
    retained = new Set<string>();
  for (const old of destructive) {
    if (old.sections.some((mapping) => project.sections.some((s) => s.id === mapping.sectionId && s.recordedLidMotion)))
      throw Error("Close the measured lid before rebuilding or removing that saved idea section.");
    const review = inspectEntry(project, old);
    impact.manualEdits += review.manualEdits;
    impact.missingRoles += review.missingRoleNames.length;
    impact.manualPartIds.push(...review.manualPartIds);
    impact.missingRoleNames.push(...review.missingRoleNames);
    for (const p of review.offcuts) retained.add(p.id);
    for (const pid of review.actualIds) removedIds.add(pid);
    for (const pid of review.manualPartIds) archiveIds.add(pid);
    for (const p of project.pieces)
      if (review.actualIds.has(p.id) && p.cutStock) archiveIds.add(p.id);
    impact.changedEntries++;
  }
  impact.replacedParts = removedIds.size;
  impact.affectedConnectionIds = project.joints
    .filter((j) => removedIds.has(j.a) || removedIds.has(j.b))
    .map((j) => j.id);
  impact.removedConnections = impact.affectedConnections =
    impact.affectedConnectionIds.length;
  impact.affectedFastenerPlanIds = project.fastenerPlans
    .filter((plan) => plan.locations.length > 0 && (removedIds.has(plan.head.pieceId) || removedIds.has(plan.receiver.pieceId)))
    .map((plan) => plan.id);
  impact.affectedFastenerPlans = impact.affectedFastenerPlanIds.length;
  impact.affectedHingePlanIds = project.lidHingePlans.filter((plan) => removedIds.has(plan.moving.pieceId) || removedIds.has(plan.fixed.pieceId)).map((plan) => plan.id);
  impact.affectedHingePlans = impact.affectedHingePlanIds.length;
  for (const pid of archiveIds) retained.add(pid);
  impact.retainedOffcutIds = [...retained];
  impact.offcuts = retained.size;
  const removedSections = new Set(
    destructive.flatMap((e) => e.sections.map((m) => m.sectionId)),
  );
  next = {
    ...next,
    pieces: next.pieces
      .filter((p) => !removedIds.has(p.id) || archiveIds.has(p.id))
      .map((p) => (archiveIds.has(p.id) ? { ...p, offcut: true } : p)),
    sections: next.sections.filter((s) => !removedSections.has(s.id)),
    joints: next.joints.filter(
      (j) => !removedIds.has(j.a) && !removedIds.has(j.b),
    ),
  };
  const generate = (entry: IdeaEntry, old?: IdeaEntry) => {
    const g = generateIdeaEntry(blank(), entry.spec, entry.pose),
      idMap = new Map<string, string>(),
      stepMap = new Map<string, string>();
    for (const mapping of g.sections) {
      const oldMap = old?.sections.find((m) => m.role === mapping.role),
        oldSection = project.sections.find((s) => s.id === oldMap?.sectionId),
        newSection = g.project.sections.find(
          (s) => s.id === mapping.sectionId,
        )!,
        newStep = g.project.pieces.find((p) =>
          newSection.pieceIds.includes(p.id),
        )!.stepId,
        oldStep = oldSection
          ? project.pieces.find((p) => oldSection.pieceIds.includes(p.id))
              ?.stepId
          : oldMap?.stepId;
      idMap.set(mapping.sectionId, oldMap?.sectionId ?? mapping.sectionId);
      if (oldStep && project.steps.some((s) => s.id === oldStep))
        stepMap.set(newStep, oldStep);
    }
    const generatedIds = new Set(
        g.sections.flatMap(
          (m) => g.project.sections.find((s) => s.id === m.sectionId)!.pieceIds,
        ),
      ),
      pieces = g.project.pieces
        .filter((p) => generatedIds.has(p.id))
        .map((p) => ({ ...p, stepId: stepMap.get(p.stepId) ?? p.stepId })),
      usedSteps = new Set(pieces.map((p) => p.stepId));
    next.pieces.push(...pieces);
    impact.newParts += pieces.length;
    next.steps.push(
      ...g.project.steps.filter(
        (s) => usedSteps.has(s.id) && !next.steps.some((x) => x.id === s.id),
      ),
    );
    const mappings = g.sections.map((m) => ({
      role: m.role,
      sectionId: idMap.get(m.sectionId)!,
      stepId: pieces.find((p) =>
        g.project.sections
          .find((s) => s.id === m.sectionId)!
          .pieceIds.includes(p.id),
      )!.stepId,
    }));
    next.sections.push(
      ...g.project.sections
        .filter((s) => idMap.has(s.id))
        .map((s) => {
          const surviving = project.sections.find(
            (old) => old.id === idMap.get(s.id),
          );
          return {
            ...s,
            id: idMap.get(s.id)!,
            name: surviving?.name ?? s.name,
          };
        }),
    );
    const allMappings = [
      ...(old?.sections ?? []).filter(
        (m) => !mappings.some((n) => n.role === m.role),
      ),
      ...mappings,
    ];
    return { ...entry, sections: allMappings, generatedNotes: g.notes };
  };
  for (const old of destructive) {
    const fresh = updated.get(old.id);
    if (fresh) updated.set(old.id, generate(fresh, old));
  }
  const added = newEntries.map((e) => generate(e));
  const changed = impact.changedEntries > 0 || added.length > 0;
  impact.changed = changed;
  if (changed) {
    const entries = [
        ...b.entries.flatMap((old) =>
          managed.has(old.id)
            ? incoming.has(old.id)
              ? [updated.get(old.id) ?? old]
              : []
            : [old],
        ),
        ...added,
      ],
      finalPlan = reconcileNarrative({
        ...plan,
        modules: entries.flatMap((e) =>
          e.spec.type === "furniture" ? [e.spec.recipe] : [],
        ),
        structures: entries.flatMap((e) =>
          e.spec.type === "structure" ? [e.spec.structure] : [],
        ),
      }),
      block = reviewBlock(finalPlan, entries);
    if (block.length > 10000)
      throw Error(
        "Current saved-idea review requirements exceed the supported notes limit.",
      );
    if (b.reviewBlock && next.notes.includes(b.reviewBlock))
      next.notes = next.notes.replace(b.reviewBlock, block);
    const fresh: IdeaBinding = {
      ...b,
      revision: b.revision + 1,
      title: finalPlan.title,
      summary: finalPlan.summary,
      assumptions: finalPlan.assumptions,
      questions: finalPlan.questions,
      suggestions: finalPlan.suggestions,
      entries,
      generatedNotes: entries
        .map((e) => e.generatedNotes)
        .filter(Boolean)
        .join("\n\n"),
      reviewBlock:
        b.reviewBlock && project.notes.includes(b.reviewBlock) ? block : "",
      currentFingerprint: "",
    };
    next.ideaBindings = next.ideaBindings.map((old) =>
      old.id === id ? fresh : old,
    );
    next.guideFingerprint = null;
    next = reconcileIdeaBindings(next);
  }
  const sectionOrder = new Map(
    project.sections.map((section, index) => [section.id, index]),
  );
  next.sections.sort(
    (a, b) =>
      (sectionOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (sectionOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const affectedEntryIds = new Set([...managed, ...added.map((e) => e.id)]);
  const parsed = projectSchema.parse(next),
    affected = new Set(
      parsed.ideaBindings
        .find((x) => x.id === id)
        ?.entries.filter((e) => affectedEntryIds.has(e.id))
        .flatMap((e) => [...entryPartIds(parsed, e)]) ?? [],
    ),
    requiresRebuild =
      impact.manualEdits > 0 ||
      impact.missingRoles > 0 ||
      impact.removedConnections > 0 ||
      impact.affectedFastenerPlans > 0 ||
      impact.affectedHingePlans > 0 ||
      archiveIds.size > 0;
  return {
    ...candidateIdeaPreview(parsed, affected),
    impact,
    token: expectedToken,
    requiresRebuild,
    clearanceConflicts: worsenedSiteClearances(project, parsed, id),
  };
}
/** Satisfy the recorded minimum by translating the full saved design once. */
export function fitDesignToSiteClearance(project: Project, clearanceId: string, includeLidTravel = false): Project {
  const plane = project.siteClearances?.find((item) => item.id === clearanceId);
  if (!plane) throw Error("Choose a saved site clearance.");
  if (plane.bindingId === null) throw Error("Choose a clearance assigned to one saved design to move it.");
  const design = binding(project, plane.bindingId);
  const review = reviewSiteClearance(project, plane);
  const requiredOffset = includeLidTravel
    ? Math.max(review.shortfall, siteFaceLidShortfall(project, plane).shortfall)
    : review.shortfall;
  if (requiredOffset <= 1e-7) return project;
  const offset = plane.side.startsWith("+") ? -requiredOffset : requiredOffset;
  const axis = clearanceAxis(plane.side);
  const moved = new Set(design.entries.flatMap((entry) => [...entryPartIds(project, entry)]));
  let next = project;
  const entries = design.entries.map((entry) => {
    const origin: V3 = [...entry.pose.origin];
    origin[axis] += offset;
    const pose = { ...entry.pose, origin };
    next = rigidEntry(next, entry, pose);
    return withIdentity({ ...entry, pose });
  });
  const zone = project.workZone;
  const fixedSolids = next.pieces
    .filter((piece) => !piece.offcut && !moved.has(piece.id))
    .map(prepareCollisionSolid);
  for (const piece of next.pieces) {
    if (!moved.has(piece.id) || piece.offcut) continue;
    if (zone) {
      const { min, max } = bounds(piece);
      if (min[0] < -zone.width / 2 - .001 || max[0] > zone.width / 2 + .001 ||
          min[2] < -zone.depth / 2 - .001 || max[2] > zone.depth / 2 + .001 ||
          min[1] < -.001 || max[1] > zone.height + .001)
        throw Error("That move puts the design outside your work zone.");
    }
    const solid = prepareCollisionSolid(piece);
    if (solid && fixedSolids.some((other) => other && solidOverlap(solid, other)))
      throw Error("That move overlaps wood outside the selected design. Clear the space before moving.");
  }
  const result = projectSchema.parse(reconcileIdeaBindings({
    ...next,
    ideaBindings: next.ideaBindings.map((item) => item.id === design.id ? { ...design, entries } : item),
  }));
  if (worsenedSiteClearances(project, result, design.id).length)
    throw Error("That move would reduce another recorded clearance below its minimum.");
  const resulting = reviewSiteClearance(result, plane);
  if (resulting.status !== "met" && resulting.status !== "outside-height")
    throw Error("The resulting gap could not be verified.");
  if (includeLidTravel) {
    if (siteFaceLidShortfall(result, plane).shortfall > 1e-7)
      throw Error("The resulting lid clearance could not be verified.");
    for (const other of project.siteClearances ?? []) {
      if (other.id === plane.id || (other.bindingId !== null && other.bindingId !== plane.bindingId) || other.top !== null) continue;
      const checked = other.bindingId === null ? { ...other, bindingId: design.id } : other;
      if (siteFaceLidShortfall(result, checked).shortfall > siteFaceLidShortfall(project, checked).shortfall + 1e-7)
        throw Error("That move would worsen the lid clearance at another recorded wall.");
    }
  }
  return result;
}

function worsenedSiteClearances(before: Project, after: Project, bindingId: string) {
  return (after.siteClearances ?? []).filter((plane) => {
    if (plane.bindingId !== null && plane.bindingId !== bindingId) return false;
    const checked = plane.bindingId === null ? { ...plane, bindingId } : plane;
    const previous = reviewSiteClearance(before, checked);
    const current = reviewSiteClearance(after, checked);
    return (current.status === "missing" && previous.status !== "missing") ||
      current.shortfall > previous.shortfall + 1e-7;
  });
}

export function applyIdeaRevision(
  project: Project,
  id: string,
  plan: IdeaPlan,
  expectedToken: string,
  options: IdeaRevisionOptions = {},
) {
  if (plan.pendingPlacement?.length)
    throw Error("Resolve or set aside the remaining placement requests before applying.");
  const preview = previewIdeaRevision(
    project,
    id,
    plan,
    expectedToken,
    options,
  );
  return acceptIdeaRevisionPreview(preview, options.allowRebuild);
}

/** Accept the same candidate shown in the workspace, with its original part IDs. */
export function acceptIdeaRevisionPreview(
  preview: ReturnType<typeof previewIdeaRevision>,
  allowRebuild = false,
) {
  if (preview.clearanceConflicts.length)
    throw Error("This revision reduces a measured site clearance below its minimum.");
  if (preview.requiresRebuild && !allowRebuild)
    throw Error(
      "This revision replaces custom edits, recorded stock or connections. Review the impact and explicitly allow the rebuild before applying.",
    );
  return preview.project;
}
export function detachIdeaBinding(
  project: Project,
  id: string,
  entryIds?: string[],
) {
  const b = binding(project, id),
    ids = new Set(selection(b, entryIds).map((e) => e.id)),
    entries = b.entries.filter((e) => !ids.has(e.id));
  return projectSchema.parse({
    ...project,
    ideaBindings: entries.length
      ? project.ideaBindings.map((x) =>
          x.id === id
            ? {
                ...x,
                entries,
                revision: x.revision + 1,
                currentFingerprint: "",
              }
            : x,
        )
      : project.ideaBindings.filter((x) => x.id !== id),
  });
}
export function adoptLegacyRecipe(
  project: Project,
  sectionId: string,
): Project {
  if (
    project.ideaBindings.some((b) =>
      b.entries.some((e) => e.sections.some((m) => m.sectionId === sectionId)),
    )
  )
    throw Error("This section is already part of a saved idea.");
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section?.recipe)
    throw Error("Choose a legacy furniture recipe section to adopt.");
  const id = uid(),
    entry: IdeaEntry = {
      id,
      spec: { type: "furniture", recipe: { ...section.recipe, entryId: id } },
      pose: { origin: [...section.origin], rotation: [...section.rotation] },
      sections: [
        {
          role: "body",
          sectionId,
          stepId: project.pieces.find((p) => section.pieceIds.includes(p.id))
            ?.stepId,
        },
      ],
      generatedNotes: "",
    };
  const b: IdeaBinding = {
    version: 1,
    id: uid(),
    revision: 1,
    currentFingerprint: "",
    title: section.name,
    summary:
      "Adopted existing furniture recipe; geometry and source records are unchanged.",
    assumptions: [],
    questions: [],
    suggestions: [],
    entries: [entry],
    generatedNotes: "",
    reviewBlock: "",
  };
  return projectSchema.parse(
    reconcileIdeaBindings({
      ...project,
      ideaBindings: [...project.ideaBindings, b],
    }),
  );
}
