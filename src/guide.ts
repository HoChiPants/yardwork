import { subfloorJointLine, subfloorReviews } from "./subfloor";
import { subfloorAdhesiveReviews } from "./subfloorAdhesive";
import { subfloorAdhesiveInstallation, subfloorNailSchedules } from "./subfloorReference";
import { subfloorFasteningReviews } from "./subfloorFastening";
import { subfloorJoistReviews } from "./subfloorJoists";
import { bottomPlateSealReviews } from "./bottomPlateSeal";
import { topPlateSealReviews } from "./topPlateSeal";
import {
  projectSchema,
  step,
  type Piece,
  type Project,
  type Step,
} from "./model";
import { attachmentPreparationNotes } from "./attachmentGuide";
import { restraintPreparationNotes } from "./restraintGuide";
import { attachmentReviews } from "./attachments";
import { restraintReviews } from "./restraints";
import { ensurePartLabels, partLabel } from "./partLabels";
import { assemblyStages, type AssemblyStage } from "./assemblyStages";
import { fastenerReviews } from "./fastenings";
import { fastenerPreparationNotes } from "./fastenerGuide";
import type { FastenerPlan } from "./fasteningSchema";
import { fastenerPhysicalIntent } from "./fastenerIntent";
import { lidHingeReviews, type HingeReview } from "./hinges";
import { hingePreparationNotes } from "./hingeGuide";
import { reviewHingeStock, sourceFingerprint } from "./hingeStock";
import type { LidHingePlan } from "./hingeSchema";
import { connectorReviews, type ConnectorReview } from "./connectors";
import { connectorPreparationNotes } from "./connectorGuide";
import { connectorPhysicalIntent } from "./connectorIntent";
import { waterPressureGuideStep } from "./waterPressure";
import { waterRunStageKey } from "./wallWater";
import { waterFittingStageKey } from "./waterFittings";

/** Only active physical hinge inputs. Labels, counters, provenance dates and old receipts are metadata. */
function hingeDesign(plan: LidHingePlan) {
  const ref = ({ pieceId, geometryFingerprint, baselinePose }: LidHingePlan["moving"]) => ({ pieceId, geometryFingerprint, baselinePose });
  const dimensions = (m: LidHingePlan["locations"][number]["measurements"]) => ({ surfaceToTipDepth: m.surfaceToTipDepth, pilotDiameter: m.pilotDiameter, pilotDepth: m.pilotDepth });
  return {
    id: plan.id, sectionId: plan.sectionId, productId: plan.productId, evidenceRevision: plan.evidenceRevision,
    moving: ref(plan.moving), fixed: ref(plan.fixed), closedPose: plan.closedPose,
    axis: { movingA: plan.axis.movingA, movingB: plan.axis.movingB, fixedA: plan.axis.fixedA, fixedB: plan.axis.fixedB },
    stockAllocation: plan.stockAllocation,
    hardware: { description: plan.hardware.description, drive: plan.hardware.drive, suppliedCount: plan.hardware.suppliedCount, included: plan.hardware.included, leafThickness: plan.hardware.leafThickness },
    locations: plan.locations.map((location) => ({ id: location.id, leaf: location.leaf, entranceLocal: location.entranceLocal, driveLocal: location.driveLocal, measurements: dimensions(location.measurements) })),
    selectedForMotion: plan.selectedForMotion,
  };
}
function hingeReviewInputs(project: Project, review: HingeReview) {
  const issue = (entry: HingeReview["issues"][number]) => ({ code: entry.code, severity: entry.severity, pieceIds: [...(entry.pieceIds ?? [])].sort() });
  const related = new Set([...review.issues, ...review.locations.flatMap((location) => location.issues)].flatMap((entry) => entry.pieceIds ?? []));
  return {
    plan: hingeDesign(review.plan), state: review.state, issues: review.issues.map(issue), resolvedAxis: review.resolvedAxis,
    locations: review.locations.map((location) => ({ id: location.location.id, state: location.state, issues: location.issues.map(issue), entranceWorld: location.entranceWorld, tipWorld: location.tipWorld, pilotTipWorld: location.pilotTipWorld, availableDepth: location.availableDepth })),
    relatedParts: project.pieces.filter((piece) => related.has(piece.id)).map(physical),
  };
}
function hingeStockInputs(project: Project) {
  return project.hingeStockSources.map((source) => {
    const review = reviewHingeStock(source);
    return { id: source.id, physicalFingerprint: sourceFingerprint(source), state: review.state, issues: review.issues.map(({ code, severity, cutIds }) => ({ code, severity, cutIds })) };
  });
}
function rimFoamGuideScope(project: Project) {
  const plans = project.rimAirSeals?.filter(({ input }) => input.poolOffcutIds?.length);
  const records = project.rimFoamCutRecords;
  const ids = new Set(plans?.flatMap(({ input }) => input.poolOffcutIds ?? []));
  return {
    ...(plans?.length ? {
      rimFoamPlans: plans,
      rimFoamOffcuts: (project.rimFoamOffcuts ?? []).filter(({ id }) => ids.has(id)),
    } : {}),
    ...(records?.length ? { rimFoamCutRecords: records } : {}),
  };
}
function preparationScope(project: Project) {
  return {
    ...(project.siteClearances?.length ? { siteClearances: project.siteClearances } : {}),
    ...(project.greenhouseFoundations?.length ? { greenhouseFoundations: project.greenhouseFoundations } : {}),
    ...(project.rodFitPlans?.length ? { rodFitPlans: project.rodFitPlans } : {}),
    ...(project.tubeCutPlans?.length ? { tubeCutPlans: project.tubeCutPlans } : {}),
    ...(project.woodKerfs ? { woodKerfs: project.woodKerfs } : {}),
    ...(project.motionPlans?.length ? { motionPlans: project.motionPlans } : {}),
    ...(project.drawerSlideMounts?.length ? { drawerSlideMounts: project.drawerSlideMounts } : {}),
    ...(project.greenhouseDoorSeals?.length ? { greenhouseDoorSeals: project.greenhouseDoorSeals } : {}),
    ...(project.openingFlashings?.length ? { openingFlashings: project.openingFlashings } : {}),
    ...(project.lidWeightPlans?.length ? { lidWeightPlans: project.lidWeightPlans } : {}),
    ...(project.lidStayFits?.length ? { lidStayFits: project.lidStayFits } : {}),
    ...(project.projectCode ? { projectCode: project.projectCode } : {}),
    ...(project.waterRuns?.length ? { waterRuns: project.waterRuns } : {}),
    ...(project.waterFittings?.length ? { waterFittings: project.waterFittings } : {}),
    ...(project.waterStops?.length ? { waterStops: project.waterStops } : {}),
    ...(project.sinkDrains?.length ? { sinkDrains: project.sinkDrains } : {}),
    ...(project.subfloorChecks?.length ? { subfloorChecks: project.subfloorChecks } : {}),
    ...(project.subfloorAdhesivePlans?.length ? { subfloorAdhesivePlans: project.subfloorAdhesivePlans } : {}),
    ...(project.subfloorNailPlans?.length ? { subfloorNailPlans: project.subfloorNailPlans } : {}),
    ...(project.subfloorJoistPlans?.length ? { subfloorJoistPlans: project.subfloorJoistPlans } : {}),
    ...(project.bottomPlateSeals?.length ? { bottomPlateSeals: project.bottomPlateSeals } : {}),
    ...(project.topPlateSeals?.length ? { topPlateSeals: project.topPlateSeals } : {}),
    ...(project.rimAirSeals?.length ? { rimAirSeals: project.rimAirSeals } : {}),
    ...rimFoamGuideScope(project),
    ...(project.roofValleys?.length ? { roofValleys: project.roofValleys } : {}),
    ...(project.roofVentFlashings?.length ? { roofVentFlashings: project.roofVentFlashings } : {}),
    ...(project.floorRegisterPlans?.length ? { floorRegisterPlans: project.floorRegisterPlans } : {}),
    ...(project.waterPressureTests?.length ? { waterPressureTests: project.waterPressureTests } : {}),
    ...(project.greenhouseLatchPlans?.length ? { greenhouseLatchPlans: project.greenhouseLatchPlans } : {}),
    ...(project.caseworkTipUpPlans?.length ? { caseworkTipUpPlans: project.caseworkTipUpPlans } : {}),
    ...(project.saunaBenchTravelPlans?.length ? { saunaBenchTravelPlans: project.saunaBenchTravelPlans } : {}),
    ...(project.saunaHeaterPlans?.length ? { saunaHeaterPlans: project.saunaHeaterPlans } : {}),
    ...(project.saunaVentilationPlans?.length ? { saunaVentilationPlans: project.saunaVentilationPlans } : {}),
    ...(project.sunliteProfilePlan ? { sunliteProfilePlan: project.sunliteProfilePlan } : {}),
    ...(project.sunliteTapeCuts ? { sunliteTapeCuts: project.sunliteTapeCuts } : {}),
    ...(project.edgeBanding ? { edgeBanding: project.edgeBanding } : {}),
    ...(project.sunliteThermal ? { sunliteThermal: project.sunliteThermal } : {}),
    ...(project.sunliteMounts?.length ? { sunliteMounts: project.sunliteMounts } : {}),
    workZone: project.workZone, pieces: project.pieces.map(physical), supplies: project.supplies,
    inventory: project.inventory, supplyInventory: project.supplyInventory, tools: project.toolSelections,
    ...(project.hingeStockSources.length ? { hingeStockSources: hingeStockInputs(project) } : {}),
  };
}

function fastenerDesign(plan: FastenerPlan) {
  return fastenerPhysicalIntent(plan);
}
function fastenerReviewInputs(project: Project, review: ReturnType<typeof fastenerReviews>[number]) {
  const related = new Set([...review.issues, ...review.locations.flatMap((location) => location.issues)].flatMap((issue) => issue.pieceIds ?? []));
  return {
    ...review,
    plan: fastenerDesign(review.plan),
    relatedParts: project.pieces.filter((piece) => related.has(piece.id)).map(physical),
  };
}
function connectorReviewInputs(project: Project, review: ConnectorReview) {
  const issue = (row: ConnectorReview["issues"][number]) => ({ code: row.code, severity: row.severity, pieceIds: [...(row.pieceIds ?? [])].sort() });
  const related = new Set([review.plan.base.pieceId, review.plan.post.pieceId,
    ...[...review.issues, ...review.entries.flatMap((entry) => entry.issues)].flatMap((row) => row.pieceIds ?? [])]);
  return {
    plan: connectorPhysicalIntent(review.plan), state: review.state, sourceCurrent: review.sourceCurrent,
    activeConnectorCount: review.activeConnectorCount, scheduledFastenerCount: review.scheduledFastenerCount,
    issues: review.issues.map(issue),
    entries: review.entries.map((row) => ({ id: row.entry.id, state: row.state, measurementsCurrent:row.measurementsCurrent, issues: row.issues.map(issue), entranceWorld: row.entranceWorld, tipWorld: row.tipWorld, pilotTipWorld: row.pilotTipWorld, availableWoodDepth: row.availableWoodDepth })),
    relatedParts: project.pieces.filter((piece) => related.has(piece.id)).map(physical),
  };
}

/** Change detector for a user checklist, never an engineering or security proof. */
function fingerprint(prefix: string, value: unknown) {
  const serialized = JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++)
    hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
  return `${prefix}-${(hash >>> 0).toString(16)}`;
}
const physical = (p: Piece) => ({
  id: p.id,
  name: p.name,
  material: p.material,
  size: p.size,
  position: p.position,
  rotation: p.rotation,
  assembly: p.assembly,
  offcut: p.offcut,
  cutStock: p.cutStock ?? null,
  cutPlanes: p.cutPlanes ?? [],
  ...(p.roundOpenings?.length ? { roundOpenings: p.roundOpenings } : {}),
  ...(p.rectangularOpenings?.length ? { rectangularOpenings: p.rectangularOpenings } : {}),
  stockLengthAxis: p.stockLengthAxis ?? null,
  designRole: p.designRole ?? null,
  ...(p.foilReturns ? { foilReturns: p.foilReturns } : {}),
});
const connection = (j: Project["joints"][number]) => ({
  id: j.id,
  a: j.a,
  b: j.b,
  kind: j.kind,
  material: j.material ?? null,
  length: j.length,
  quantity: j.quantity,
});
function bindingDesign(project: Project) {
  return project.ideaBindings.map((b) => ({
    id: b.id,
    title: b.title,
    summary: b.summary,
    assumptions: b.assumptions,
    questions: b.questions,
    suggestions: b.suggestions,
    entries: b.entries.map((e) => ({
      id: e.id,
      spec: e.spec,
      pose: e.pose,
      sections: e.sections.map((s) => ({
        role: s.role,
        sectionId: s.sectionId,
      })),
    })),
  }));
}
function designInputs(project: Project) {
  return {
    ...rimFoamGuideScope(project),
    pieces: project.pieces.map(physical),
    joints: project.joints.map(connection),
    sections: project.sections.map((s) => ({ ...s, recipe: s.recipe ?? null })),
    bindings: bindingDesign(project),
    ...(project.pieces.some((piece) => piece.guidePlacement)
      ? { guidePlacements: project.pieces.filter((piece) => piece.guidePlacement).map((piece) => ({ pieceId: piece.id, placement: piece.guidePlacement })) }
      : {}),
    workZone: project.workZone,
    ...(project.siteClearances?.length ? { siteClearances: project.siteClearances } : {}),
    ...(project.greenhouseFoundations?.length ? { greenhouseFoundations: project.greenhouseFoundations } : {}),
    ...(project.motionPlans?.length ? { motionPlans: project.motionPlans } : {}),
    ...(project.drawerSlideMounts?.length ? { drawerSlideMounts: project.drawerSlideMounts } : {}),
    ...(project.greenhouseDoorSeals?.length ? { greenhouseDoorSeals: project.greenhouseDoorSeals } : {}),
    ...(project.openingFlashings?.length ? { openingFlashings: project.openingFlashings } : {}),
    ...(project.projectCode ? { projectCode: project.projectCode } : {}),
    ...(project.waterPressureTests?.length ? { waterPressureTests: project.waterPressureTests } : {}),
    ...(project.greenhouseLatchPlans?.length ? { greenhouseLatchPlans: project.greenhouseLatchPlans } : {}),
    ...(project.caseworkTipUpPlans?.length ? { caseworkTipUpPlans: project.caseworkTipUpPlans } : {}),
    ...(project.saunaBenchTravelPlans?.length ? { saunaBenchTravelPlans: project.saunaBenchTravelPlans } : {}),
    ...(project.saunaHeaterPlans?.length ? { saunaHeaterPlans: project.saunaHeaterPlans } : {}),
    ...(project.saunaVentilationPlans?.length ? { saunaVentilationPlans: project.saunaVentilationPlans } : {}),
    ...(project.sunliteProfilePlan ? { sunliteProfilePlan: project.sunliteProfilePlan } : {}),
    ...(project.sunliteTapeCuts ? { sunliteTapeCuts: project.sunliteTapeCuts } : {}),
    ...(project.edgeBanding ? { edgeBanding: project.edgeBanding } : {}),
    ...(project.sunliteThermal ? { sunliteThermal: project.sunliteThermal } : {}),
    ...(project.sunliteMounts?.length ? { sunliteMounts: project.sunliteMounts } : {}),
    ...(project.tubeCutPlans?.length ? { tubeCutPlans: project.tubeCutPlans } : {}),
    ...(project.plannedCutSources?.length ? { plannedCutSources: project.plannedCutSources.map(({ sourceId }) => sourceId) } : {}),
    ...(project.woodKerfs ? { woodKerfs: project.woodKerfs } : {}),
    partLabels: project.partLabels,
    attachmentPlans: project.attachmentPlans,
    restraintPlans: project.restraintPlans,
    ...(project.fastenerPlans.length ? { fastenerPlans: project.fastenerPlans.map(fastenerDesign) } : {}),
    ...(project.lidHingePlans.length ? { lidHingePlans: project.lidHingePlans.map(hingeDesign) } : {}),
    ...(project.hingeStockSources.length ? { hingeStockSources: project.hingeStockSources.map((source) => ({ id: source.id, physicalFingerprint: sourceFingerprint(source) })) } : {}),
    ...(project.connectorPlans.length ? { connectorPlans: project.connectorPlans.map(connectorPhysicalIntent) } : {}),
    ...(project.bearingDecisions?.length ? { bearingDecisions: project.bearingDecisions } : {}),
    ...(project.woodJointDecisions?.length ? { woodJointDecisions: project.woodJointDecisions } : {}),
    tools: project.toolSelections,
    supplies: project.supplies,
    inventory: project.inventory,
    supplyInventory: project.supplyInventory,
    retailer: project.retailer,
    zip: project.zip,
    store: project.store,
  };
}
/** Physical inputs and assignment changes stale the guide; notes and check marks do not. */
export function designFingerprint(project: Project) {
  return fingerprint("design-v3", {
    design: designInputs(project),
    parts: project.pieces.map((p) => ({ id: p.id, stepId: p.stepId })),
    joints: project.joints.map((j) => ({ id: j.id, stepId: j.stepId })),
  });
}
export function guideIsCurrent(project: Project) {
  if (project.guideFingerprint !== designFingerprint(project)) return false;
  if (project.waterRuns?.length && !project.steps.some((step) => step.generated?.kind === "water-pressure-review"))
    return false;
  // Source facts and time-based measurement eligibility can change without editing project bytes.
  // Compare the same derived preparation scope used by generation, preserving older physical hashes.
  if (project.fastenerPlans.length) {
    const reviews = new Map(fastenerReviews(project).map((review) => [review.plan.id, review]));
    for (const plan of project.fastenerPlans) {
      const review = reviews.get(plan.id)!,
        preparation = project.steps.find((step) => step.generated?.kind === "wood-fastener-preparation" && step.generated.planId === plan.id);
      if (preparation?.generated?.fingerprint !== fingerprint("phase-v1", fastenerReviewInputs(project, review))) return false;
    }
  }
  if (project.lidHingePlans.length) {
    for (const review of lidHingeReviews(project)) {
      const preparation = project.steps.find((step) => step.generated?.kind === "lid-hinge-preparation" && step.generated.planId === review.plan.id);
      if (preparation?.generated?.fingerprint !== fingerprint("phase-v1", hingeReviewInputs(project, review))) return false;
    }
  }
  if (project.connectorPlans.length) {
    for (const review of connectorReviews(project)) {
      const preparation = project.steps.find((entry) => entry.generated?.kind === "connector-preparation" && entry.generated.planId === review.plan.id);
      if (preparation?.generated?.fingerprint !== fingerprint("phase-v1", connectorReviewInputs(project, review))) return false;
    }
  }
  if (project.hingeStockSources.length) {
    const preparation = project.steps.find((step) => step.generated?.kind === "project-preparation");
    if (preparation?.generated?.fingerprint !== fingerprint("phase-v1", preparationScope(project))) return false;
  }
  const actual = new Map(
      project.pieces.filter((p) => !p.offcut).map((p) => [p.id, p]),
    ),
    stages = new Map(
      project.steps.flatMap((s) =>
        s.generated?.kind === "assembly-stage"
          ? [[s.id, new Set(s.generated.memberIds)] as const]
          : [],
      ),
    );
  for (const [stepId, ids] of stages)
    for (const id of ids) if (actual.get(id)?.stepId !== stepId) return false;
  return [...actual.values()].every((p) => stages.get(p.stepId)?.has(p.id));
}
const legacyAssemblyNotes = (count: number) =>
  `Identify and dry-fit the ${count} listed part(s). Check orientation, square, level and contact with supporting parts. Review the connection schedule; unspecified joints still need a fastening design. Temporary support or clamps may be needed. This sequence is inferred from assembly groups and bottom elevations; confirm access and construction order.`;
const legacyStudyNote =
  "Dimensional design study. Resolve material qualification, all intended attachments, support and installation details before building.";
const preparationInstruction =
  "Review the shopping list and actual stock dimensions. Label parts, allow for the ⅛ in saw kerf, and dry-fit before fastening. Recorded cuts and retained offcuts appear in this guide.";
const finishNotes =
  "Check every intended joint, bracing, anchorage, edges and clearances. Resolve outstanding planning findings and verify loads, materials and connection details before use. Unspecified hardware is not inferred as installed.";
function customInstructions(old: Step) {
  let note = old.notes;
  if (old.generated && note.includes(old.generated.notes))
    note = note.split(old.generated.notes).join("\n");
  else {
    const match = note.match(
      /Identify and dry-fit the (\d+) listed part\(s\)\./,
    );
    if (match)
      note = note.split(legacyAssemblyNotes(Number(match[1]))).join("\n");
    if (
      note.trim() === legacyStudyNote ||
      note.trim() ===
        "Establish the site, dimensions, and constraints before placing parts."
    )
      return "";
    if (
      note.includes(preparationInstruction) &&
      /^(Confirm the available space:|Measure the available space)/.test(note)
    )
      note = note.slice(
        note.indexOf(preparationInstruction) + preparationInstruction.length,
      );
    if (note.includes(finishNotes)) note = note.split(finishNotes).join("\n");
  }
  return note
    .trim()
    .replace(/^Existing instructions to review:\n/, "")
    .trim();
}
function combinedNotes(generated: string, custom: string) {
  const notes =
    generated +
    (custom ? `\n\nExisting instructions to review:\n${custom}` : "");
  if (notes.length > 5000 || generated.length > 4500)
    throw Error(
      "These guide instructions exceed the note limit. Move long custom instructions to a separate step before regenerating; the existing guide is retained.",
    );
  return notes;
}
function stageScope(project: Project, stage: AssemblyStage, fastenerReviewCache: ReturnType<typeof fastenerReviews>, hingeReviewCache: HingeReview[], connectorReviewCache: ConnectorReview[]) {
  const entry = project.ideaBindings
      .flatMap((b) => b.entries)
      .find((e) => e.id === stage.ownerId),
    section = project.sections.find((s) => s.id === stage.ownerId),
    contextIds = new Set(
      entry
        ? entry.sections.flatMap(
            (ref) =>
              project.sections.find((s) => s.id === ref.sectionId)?.pieceIds ??
              [],
          )
        : (section?.pieceIds ?? stage.memberIds),
    );
  // Explicit workflow placement does not reparent a part; its actual geometry still
  // belongs to this task's review scope, including loose and cross-owner members.
  for (const id of stage.memberIds) contextIds.add(id);
  const joints = project.joints.filter(
      (j) => contextIds.has(j.a) || contextIds.has(j.b),
    );
  for (const joint of joints) {
    contextIds.add(joint.a);
    contextIds.add(joint.b);
  }
  const fasteners = project.fastenerPlans.filter(
    (plan) => contextIds.has(plan.head.pieceId) || contextIds.has(plan.receiver.pieceId),
  );
  for (const plan of fasteners) {
    contextIds.add(plan.head.pieceId);
    contextIds.add(plan.receiver.pieceId);
  }
  const fastenerIds = new Set(fasteners.map((plan) => plan.id));
  const relatedReviews = fastenerReviewCache.filter((review) => fastenerIds.has(review.plan.id));
  for (const review of relatedReviews)
    for (const id of [...review.issues, ...review.locations.flatMap((location) => location.issues)].flatMap((issue) => issue.pieceIds ?? []))
      contextIds.add(id);
  const relatedHinges = hingeReviewCache.filter((review) => contextIds.has(review.plan.moving.pieceId) || contextIds.has(review.plan.fixed.pieceId));
  const relatedConnectors = connectorReviewCache.filter((review) => contextIds.has(review.plan.base.pieceId) || contextIds.has(review.plan.post.pieceId));
  for (const review of relatedConnectors) {
    contextIds.add(review.plan.base.pieceId);
    contextIds.add(review.plan.post.pieceId);
    for (const id of [...review.issues, ...review.entries.flatMap((entry) => entry.issues)].flatMap((issue) => issue.pieceIds ?? [])) contextIds.add(id);
  }
  return {
    key: stage.key,
    title: stage.title,
    notes: stage.notes,
    members: [...stage.memberIds].sort(),
    entry: entry
      ? {
          spec: entry.spec,
          pose: entry.pose,
          sections: entry.sections.map((s) => ({
            role: s.role,
            sectionId: s.sectionId,
          })),
        }
      : null,
    section: section
      ? {
          id: section.id,
          name: section.name,
          recipe: section.recipe,
          generator: section.generator,
        }
      : null,
    pieces: project.pieces
      .filter((p) => contextIds.has(p.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(physical),
    joints: [...joints]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(connection),
    labels: project.partLabels
      .filter((row) => contextIds.has(row.partId))
      .sort((a, b) => a.partId.localeCompare(b.partId)),
    pins: project.attachmentPlans.filter((plan) =>
      plan.points.some(
        (point) =>
          contextIds.has(point.shelf.pieceId) ||
          contextIds.has(point.mount.pieceId),
      ),
    ),
    restraints: project.restraintPlans.filter(
      (plan) =>
        plan.entryId === stage.ownerId ||
        (plan.receiver && contextIds.has(plan.receiver.pieceId)),
    ),
    ...(fasteners.length ? { fasteners: relatedReviews.map((review) => fastenerReviewInputs(project, review)) } : {}),
    ...(relatedHinges.length ? { hinges: relatedHinges.map((review) => hingeReviewInputs(project, review)) } : {}),
    ...(relatedConnectors.length ? { connectors: relatedConnectors.map((review) => connectorReviewInputs(project, review)) } : {}),
  };
}


/** Keep deliberate saved order; insert new phases near their next canonical survivor. */
function preserveStepOrder(previous: readonly Step[], canonical: readonly Step[]): Step[] {
  // An initial/legacy setup list is not evidence of a previously generated task order.
  if (!previous.some((phase) => phase.generated)) return [...canonical];
  const current = new Map(canonical.map((phase) => [phase.id, phase])),
    surviving = previous.flatMap((phase) => current.get(phase.id) ?? []),
    oldIds = new Set(surviving.map((phase) => phase.id));
  if (!surviving.length) return [...canonical];
  const result = [...surviving];
  let pending: Step[] = [], previousAnchor: string | null = null;
  for (const phase of canonical) {
    if (!oldIds.has(phase.id)) {
      pending.push(phase);
      continue;
    }
    if (pending.length) {
      result.splice(result.findIndex((entry) => entry.id === phase.id), 0, ...pending);
      pending = [];
    }
    previousAnchor = phase.id;
  }
  if (pending.length) {
    const index = previousAnchor === null ? result.length : result.findIndex((phase) => phase.id === previousAnchor) + 1;
    result.splice(index, 0, ...pending);
  }
  return result;
}

/** Semantic stages use declared design roles; legacy geometry is never rebuilt or guessed. */
export function generateBuildGuide(input: Project): Project {
  const project = ensurePartLabels(input),
    fastenerReviewCache = fastenerReviews(project),
    hingeReviewCache = lidHingeReviews(project),
    connectorReviewCache = connectorReviews(project),
    stages = assemblyStages(project),
    steps: Step[] = [],
    usedOld = new Set<string>(),
    stableSteps = new Set<string>(),
    pieceSteps = new Map<string, string>(),
    historyRemap = new Map<string, string>(),
    oldById = new Map(project.steps.map((s) => [s.id, s]));
  const topPlateReviews = topPlateSealReviews(project);
  const drywallIds = new Set(topPlateReviews.flatMap(({ layout }) =>
    layout?.runs.flatMap(({ panelId }) => panelId ? [panelId] : []) ?? [],
  ));
  type Meta = NonNullable<Step["generated"]>;
  function addPhase(
    title: string,
    notes: string,
    meta:
      | Omit<
          Extract<Meta, { kind: "assembly-stage" }>,
          "notes" | "fingerprint" | "title"
        >
      | { kind: Exclude<Meta["kind"], "assembly-stage">; planId: string },
    scope: unknown,
    legacy?: Step,
  ) {
    const liveOwners = new Set([
      ...project.sections.map((s) => s.id),
      ...project.ideaBindings.flatMap((b) => b.entries.map((e) => e.id)),
    ]);
    const exact = project.steps.find(
      (s) =>
        s.generated?.kind === meta.kind &&
        s.generated.planId === meta.planId &&
        (meta.kind !== "assembly-stage" ||
          (s.generated.kind === "assembly-stage" &&
            s.generated.stageKey === meta.stageKey)),
    );
    const candidates = project.steps.filter((s) => {
      if (s.generated?.kind !== meta.kind) return false;
      if (meta.kind === "project-preparation" || meta.kind === "project-finish")
        return true;
      return (
        meta.kind === "assembly-stage" &&
        s.generated.kind === "assembly-stage" &&
        !liveOwners.has(s.generated.planId) &&
        s.generated.stageKey === meta.stageKey &&
        s.generated.memberIds.length === meta.memberIds.length &&
        meta.memberIds.every(
          (id) =>
            s.generated?.kind === "assembly-stage" &&
            s.generated.memberIds.includes(id),
        )
      );
    });
    const old =
        exact ??
        (candidates.length === 1 ? candidates[0] : undefined) ??
        legacy,
      hash = fingerprint("phase-v1", scope),
      custom = old ? customInstructions(old) : "",
      next = step(
        old?.generated &&
          (!old.generated.title || old.title !== old.generated.title)
          ? old.title
          : title,
        combinedNotes(notes, custom),
      );
    if (old) {
      next.id = old.id;
      usedOld.add(old.id);
    }
    next.complete =
      !!old?.complete &&
      old.generated?.fingerprint === hash &&
      old.generated.notes === notes;
    next.generated = { ...meta, notes, fingerprint: hash, title } as Meta;
    steps.push(next);
    stableSteps.add(next.id);
    return next;
  }
  const previousPreparation = project.steps.find(
    (s) =>
      !s.generated &&
      ((s.title === "Prepare the space and cut list" &&
        s.notes.includes(preparationInstruction)) ||
        (s.title === "Lay out your project" &&
          s.notes ===
            "Establish the site, dimensions, and constraints before placing parts.")),
  );
  const preparationNotes = [
      project.workZone
        ? `Confirm the available space: ${project.workZone.width} × ${project.workZone.depth} × ${project.workZone.height} in (width × depth × height).`
        : "Measure the available space and check clearances before cutting.",
      ...(project.siteClearances?.length ? ["Confirm the measured site faces and minimum gaps in the clearance schedule before cutting."] : []),
      ...(project.greenhouseFoundations?.length ? ["Confirm the greenhouse foundation measurements and resolve base-rail fit findings before cutting."] : []),
      ...(project.greenhouseFoundations?.some(({ anchors }) => anchors?.locations.length) ? ["Review the specified anchor detail, drill marks and tool access before assembling the greenhouse walls."] : []),
      ...(project.sunliteMounts?.some(({ holes }) => holes.length) ? ["Check the SUNLITE drill schedule against the final cut panels, backing and site mounting detail."] : []),
      ...(project.edgeBanding?.length ? ["Dry-fit the labeled panels and review the panel edge-banding cut order before fastening."] : []),
      project.tubeCutPlans?.length || project.woodKerfs || project.pieces.some((part) => part.cutStock?.tubeKerf !== undefined || part.cutStock?.woodKerf !== undefined)
        ? preparationInstruction.replace("allow for the ⅛ in saw kerf", "check the cutting loss for each stock unit")
        : preparationInstruction,
      ...(project.hingeStockSources.length ? ["For metal hinge cuts, use the entered physical source length and metal-specific kerf; the wood saw-kerf allowance does not apply."] : []),
    ].join("\n"),
    preparation = addPhase(
      "Prepare the space and cut list",
      preparationNotes,
      { kind: "project-preparation", planId: project.id },
      preparationScope(project),
      previousPreparation,
    );
  for (const review of attachmentReviews(project))
    addPhase(
      `Review shelf-pin drilling: ${review.plan.name}`.slice(0, 120),
      attachmentPreparationNotes(project, review.plan.id),
      { kind: "shelf-pin-preparation", planId: review.plan.id },
      review,
    );
  for (const review of restraintReviews(project))
    addPhase(
      `Review furniture restraint: ${review.plan.name}`.slice(0, 120),
      restraintPreparationNotes(project, review.plan.id),
      { kind: "restraint-preparation", planId: review.plan.id },
      review,
    );
  for (const review of fastenerReviewCache)
    addPhase(
      `Review wood-fastener locations: ${review.plan.name.replace(/[\r\n\t]+/g, " ")}`.slice(0, 120),
      fastenerPreparationNotes(project, review.plan.id, review),
      { kind: "wood-fastener-preparation", planId: review.plan.id },
      fastenerReviewInputs(project, review),
    );
  for (const review of connectorReviewCache)
    addPhase(`Review A21Z connector ${review.plan.label}: ${review.plan.name.replace(/[\r\n\t]+/g, " ")}`.slice(0, 120),
      connectorPreparationNotes(project, review.plan.id, review),
      { kind: "connector-preparation", planId: review.plan.id }, connectorReviewInputs(project, review));
  const assemblyStart = steps.length;
  const addedHinges = new Set<string>();
  const lastWaterStage = stages.filter(({ key }) => key === waterRunStageKey || key === waterFittingStageKey).at(-1);
  function addWaterPhase() {
    addPhase("Review water test before concealment", waterPressureGuideStep,
      { kind: "water-pressure-review", planId: project.id },
      { lines: project.waterRuns?.map(({ id }) => id), fittings: project.waterFittings?.map(({ id }) => id) });
  }
  const addHingePhase = (review: HingeReview) => {
    addPhase(`Review lid hinge ${review.plan.label}: ${review.plan.name.replace(/[\r\n\t]+/g, " ")}`.slice(0, 120),
      hingePreparationNotes(project, review.plan.id, review),
      { kind: "lid-hinge-preparation", planId: review.plan.id }, hingeReviewInputs(project, review));
    addedHinges.add(review.plan.id);
  };
  const adhesiveByPanel = new Map(subfloorAdhesiveReviews(project).map((review) => [review.panelId, review]));
  const fasteningByPanel = new Map(subfloorFasteningReviews(project).map((review) => [review.panelId, review]));
  const joistsById = new Map(subfloorJoistReviews(project).flatMap(({ rows }) => rows.map((row) => [row.id, row] as const)));
  for (const original of stages) {
    const stage = drywallIds.size
      ? { ...original, memberIds: original.memberIds.filter((id) => !drywallIds.has(id)) }
      : original;
    if (!stage.memberIds.length) continue;
    // Typed storage stages place shell/frame before the actual lid. Legacy
    // combined stages retain an explicit dry-fit instruction in the hinge phase.
    for (const review of hingeReviewCache)
      if (!addedHinges.has(review.plan.id) && stage.memberIds.includes(review.plan.moving.pieceId)) addHingePhase(review);
    const adhesive = stage.memberIds.flatMap((id) => {
      const review = adhesiveByPanel.get(id);
      return review ? [review] : [];
    });
    const fastening = stage.memberIds.flatMap((id) => {
      const review = fasteningByPanel.get(id);
      return review ? [review] : [];
    });
    const adhesiveNotes = adhesive.flatMap(({ panelId, problem }) =>
      problem ? [`${partLabel(project, panelId)} · ${problem}`] : []);
    const activeBeads = adhesive.filter(({ planCurrent }) => planCurrent);
    if (activeBeads.length) adhesiveNotes.push(
      `Subfloor adhesive for ${activeBeads.map(({ panelId }) => partLabel(project, panelId)).join(", ")}. ${subfloorAdhesiveInstallation}`,
    );
    const fasteningNotes = fastening.map(({ panelId, schedule, marks, problem }) => problem
      ? `${partLabel(project, panelId)} · ${problem}`
      : `Fasten ${partLabel(project, panelId)} after checking its installed joists and blocking. Use the ${marks} reviewed ${subfloorNailSchedules[schedule].label} locations.`);
    const joists = stage.memberIds.flatMap((id) => {
      const joist = joistsById.get(id);
      return joist ? [joist] : [];
    });
    const joistNotes = joists.length
      ? [`Confirm the receiving supports and end bearing for ${joists.map(({ id }) => partLabel(project, id)).join(", ")} before covering the framing. Resolve the findings in the joist bearing and span schedule.`]
      : [];
    const scope = stageScope(project, stage, fastenerReviewCache, hingeReviewCache, connectorReviewCache);
    const phase = addPhase(
      stage.title,
      [stage.notes, ...joistNotes, ...adhesiveNotes, ...fasteningNotes].join(" "),
      {
        kind: "assembly-stage",
        planId: stage.ownerId,
        stageKey: stage.key,
        memberIds: stage.memberIds,
      },
      adhesive.length || fastening.length || joists.length ? {
        stage: scope,
        adhesive: adhesive.map(({ panelId, planCurrent, layout }) => ({ panelId, planCurrent, contact: layout?.signature })),
        ...(fastening.length ? { fastening: fastening.map(({ panelId, current, signature }) => ({ panelId, current, signature })) } : {}),
        ...(joists.length ? { joists: joists.map(({ id, clear, ends, issue, limit }) => ({ id, clear, ends, issue, limit })) } : {}),
      } : scope,
    );
    for (const id of stage.memberIds) {
      if (pieceSteps.has(id))
        throw Error("The assembly guide assigned a part more than once.");
      pieceSteps.set(id, phase.id);
    }
    if (original === lastWaterStage) addWaterPhase();
  }
  for (const review of hingeReviewCache)
    if (!addedHinges.has(review.plan.id)) addHingePhase(review);
  if (!lastWaterStage && project.waterRuns?.length) addWaterPhase();
  for (const review of topPlateReviews) {
    addPhase(`Air-seal ${review.title}`.slice(0, 120),
      review.problem || "Apply the bead on the marked plate face. Keep it continuous as you hang the adjoining drywall.",
      { kind: "top-plate-air-seal", planId: review.record.id }, { plan: review.record, layout: review.layout?.signature });
  }
  if (drywallIds.size) {
    const memberIds = [...drywallIds];
    const phase = addPhase("Hang drywall at the top plates",
      "Check that the marked beads are intact as the panels are fitted. Verify panel orientation, supported seams and fastening in the field.",
      { kind: "assembly-stage", planId: project.id, stageKey: "drywall-after-top-plate-sealing", memberIds },
      memberIds);
    for (const id of drywallIds) pieceSteps.set(id, phase.id);
  }
  const active = project.pieces.filter((p) => !p.offcut);
  if (
    pieceSteps.size !== active.length ||
    active.some((p) => !pieceSteps.has(p.id))
  )
    throw Error(
      "The assembly guide must cover every active part exactly once.",
    );
  for (const { panelId, layout, problem } of subfloorReviews(project)) {
    const name = layout?.piece.name ?? "subfloor panel";
    const joints = layout?.joints.map((joint) => subfloorJointLine(project, joint)) ?? [];
    const support = problem || layout?.issues.join(" ") || "Confirm the delivered panel stamp, joint gaps and framing. Review the modeled bearing and fastening layout in the subfloor schedule before covering the deck.";
    addPhase(`Check ${name} support before covering`.slice(0, 120),
      joints.length ? `${support} Dry-fit the adjacent panels and check the marked joints before fastening. See the subfloor schedule for the measured gaps.` : support,
      { kind: "subfloor-support-review", planId: panelId },
      { problem, issues: layout?.issues, nails: layout?.nails, supports: layout?.supportIds, ...(joints.length && { joints }) });
  }
  for (const review of bottomPlateSealReviews(project)) {
    addPhase(`Air-seal ${review.title}`.slice(0, 120),
      review.problem || "Prepare the marked plate and subfloor and run the recorded bead before covering the seam. Review every interruption and adjoining air-barrier transition in the build guide.",
      { kind: "bottom-plate-air-seal", planId: review.record.id }, { plan: review.record, layout: review.layout?.signature });
  }
  const previousFinish = project.steps.find(
    (s) =>
      !s.generated &&
      s.title === "Review connections and finish" &&
      s.notes.includes(finishNotes),
  );
  const finish = addPhase(
    "Review connections and finish",
    finishNotes,
    { kind: "project-finish", planId: project.id },
    {
      design: designInputs(project),
      inventory: project.inventory,
      supplyInventory: project.supplyInventory,
    },
    previousFinish,
  );
  // Preserve standalone step order around known phase identities; shared notes remain once.
  const baseOrder = new Map(steps.map((s, i) => [s.id, i])),
    targetsByOld = new Map<string, string[]>();
  for (const old of project.steps)
    targetsByOld.set(
      old.id,
      [
        ...new Set(
          project.pieces
            .filter((p) => !p.offcut && p.stepId === old.id)
            .flatMap((p) => pieceSteps.get(p.id) ?? []),
        ),
      ].sort((a, b) => baseOrder.get(a)! - baseOrder.get(b)!),
    );
  const historical: { step: Step; anchor: string; after: boolean }[] = [];
  function neighboringAnchor(
    index: number,
    direction: 1 | -1,
  ): string | undefined {
    for (
      let i = index + direction;
      i >= 0 && i < project.steps.length;
      i += direction
    ) {
      const old = project.steps[i];
      if (baseOrder.has(old.id)) return old.id;
      const targets = targetsByOld.get(old.id) ?? [];
      if (targets.length) return direction === -1 ? targets.at(-1) : targets[0];
    }
    return undefined;
  }
  for (const [index, old] of project.steps.entries()) {
    if (usedOld.has(old.id)) continue;
    const custom = customInstructions(old),
      hasHistory = project.history.some((h) => h.stepId === old.id),
      targets = targetsByOld.get(old.id) ?? [];
    if (!custom && !hasHistory) continue;
    if (!old.generated && !custom && targets.length === 1) {
      historyRemap.set(old.id, targets[0]);
      continue;
    }
    const retainedTitle =
      old.generated && old.generated.title && old.title === old.generated.title
        ? `Review retained instructions: ${old.title}`.slice(0, 120)
        : old.title;
    const retained = step(
      retainedTitle,
      custom ||
        "Recorded operation history from an earlier phase. Review against the current assembly stages.",
    );
    retained.id = old.id;
    retained.complete = guideIsCurrent(project) && old.complete;
    const previous = neighboringAnchor(index, -1),
      next = neighboringAnchor(index, 1),
      anchor =
        targets[0] ?? previous ?? next ?? steps[assemblyStart]?.id ?? finish.id,
      after = targets.length === 0 && !!previous;
    historical.push({ step: retained, anchor, after });
    stableSteps.add(retained.id);
  }
  const afterCursor = new Map<string, string>();
  for (const item of historical) {
    const anchor = item.after
        ? (afterCursor.get(item.anchor) ?? item.anchor)
        : item.anchor,
      index = steps.findIndex((s) => s.id === anchor);
    steps.splice(
      index < 0 ? steps.length : index + (item.after ? 1 : 0),
      0,
      item.step,
    );
    if (item.after) afterCursor.set(item.anchor, item.step.id);
  }
  const orderedSteps = preserveStepOrder(project.steps, steps);
  steps.splice(0, steps.length, ...orderedSteps);
  if (steps.length > 500)
    throw Error(
      "This guide exceeds 500 phases. Group related parts or consolidate retained instructions before regenerating; the existing guide is retained.",
    );
  const order = new Map(steps.map((s, i) => [s.id, i]));
  const next: Project = {
    ...project,
    steps,
    pieces: project.pieces.map((p) => ({
      ...p,
      stepId:
        pieceSteps.get(p.id) ??
        (stableSteps.has(p.stepId) ? p.stepId : preparation.id),
    })),
    joints: project.joints.map((j) => {
      if (!pieceSteps.has(j.a) || !pieceSteps.has(j.b))
        return { ...j, stepId: finish.id };
      const a = pieceSteps.get(j.a) ?? preparation.id,
        b = pieceSteps.get(j.b) ?? preparation.id;
      return {
        ...j,
        stepId: (order.get(a) ?? 0) > (order.get(b) ?? 0) ? a : b,
      };
    }),
    history: project.history.map((h) => ({
      ...h,
      stepId:
        historyRemap.get(h.stepId) ??
        (stableSteps.has(h.stepId)
          ? h.stepId
          : oldById.has(h.stepId)
            ? preparation.id
            : finish.id),
    })),
    guideFingerprint: null,
  };
  next.guideFingerprint = designFingerprint(next);
  return projectSchema.parse(next);
}

/** A concise connection schedule; absence of holes/engagement remains explicit. */
export function guideConnections(project: Project, stepId: string) {
  return project.joints
    .filter((j) => j.stepId === stepId)
    .map((j) => ({
      ...j,
      aLabel: partLabel(project, j.a),
      bLabel: partLabel(project, j.b),
      aName: project.pieces.find((p) => p.id === j.a)?.name ?? "Missing part",
      bName: project.pieces.find((p) => p.id === j.b)?.name ?? "Missing part",
    }));
}
