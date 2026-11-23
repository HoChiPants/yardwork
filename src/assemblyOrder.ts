import { assemblyOrderRules } from "./assemblyStages";
import type { Project, Step } from "./model";
import { waterRunStageKey } from "./wallWater";
import { waterFittingStageKey } from "./waterFittings";
import { waterStopStageKey } from "./waterStops";
import { subfloorReviews } from "./subfloor";
import { subfloorAdhesiveReviews } from "./subfloorAdhesive";
import { subfloorFasteningReviews } from "./subfloorFastening";
import { subfloorJoistReviews } from "./subfloorJoists";
import { bottomPlateSealReviews } from "./bottomPlateSeal";
import { drywallPlateSealReviews } from "./topPlateSeal";
import { sinkDrainStageKey } from "./sinkDrain";
import { waterFittingPorts } from "./waterFittingSchema";
import { pipeAirSealCoveringSections } from "./pipeAirSeal";
import { waterPressureReviewStep, waterRoughInLinings } from "./waterPressure";
import { windowFlashingPhaseKinds, windowFlashingSchedule } from "./windowFlashingGuide";

type NumberedStep = { step: Step; number: number };
type ReviewKind = Exclude<NonNullable<Step["generated"]>["kind"], "assembly-stage">;

export type AssemblyOrderFinding = {
  current: NumberedStep;
  prerequisites: NumberedStep[];
};

/** Compare the saved step numbers using template stages and the actual parts named by hardware plans. */
export function reviewAssemblyOrder(project: Project): AssemblyOrderFinding[] {
  const activeStepsByMember = new Map(
    project.pieces.filter(({ offcut }) => !offcut).map(({ id, stepId }) => [id, stepId]),
  );
  const byOwner = new Map<string, Map<string, NumberedStep>>();
  const stageByMember = new Map<string, NumberedStep>();
  const reviewSteps = new Map<string, NumberedStep>();
  const numberedSteps = new Map<string, NumberedStep>();
  const reviewKey = (kind: ReviewKind, planId: string) => `${kind}/${planId}`;
  project.steps.forEach((step, index) => {
    const numbered = { step, number: index + 1 };
    numberedSteps.set(step.id, numbered);
    const stage = step.generated;
    if (!stage) return;
    if (stage.kind !== "assembly-stage") {
      reviewSteps.set(reviewKey(stage.kind, stage.planId), numbered);
      return;
    }
    const members = stage.memberIds.filter((id) => activeStepsByMember.get(id) === step.id);
    if (!members.length) return;
    for (const id of members) stageByMember.set(id, numbered);
    const stages = byOwner.get(stage.planId) ?? new Map<string, NumberedStep>();
    stages.set(stage.stageKey, numbered);
    byOwner.set(stage.planId, stages);
  });

  const conflicts = new Map<NumberedStep, Set<NumberedStep>>();
  function requireBefore(first?: NumberedStep, second?: NumberedStep) {
    if (!first || !second || first.number <= second.number) return;
    const prerequisites = conflicts.get(second) ?? new Set<NumberedStep>();
    prerequisites.add(first);
    conflicts.set(second, prerequisites);
  }
  for (const { entries } of project.ideaBindings) {
    for (const entry of entries) {
      const stages = byOwner.get(entry.id);
      if (!stages) continue;
      for (const { key, after } of assemblyOrderRules(entry)) {
        for (const priorKey of after) requireBefore(stages.get(priorKey), stages.get(key));
      }
    }
  }
  const roomWalls = new Map<string, { walls: number; panelsByWall: Map<number, { panel: number; step: NumberedStep }[]> }>();
  for (const section of project.sections) {
    const frame = section.roomFraming;
    const step = byOwner.get(section.id)?.get("section");
    if (!frame || !step) continue;
    const room = roomWalls.get(frame.id) ?? { walls: frame.walls, panelsByWall: new Map() };
    const panels = room.panelsByWall.get(frame.wall) ?? [];
    panels.push({ panel: frame.panel, step });
    room.panelsByWall.set(frame.wall, panels);
    roomWalls.set(frame.id, room);
  }
  for (const { walls, panelsByWall } of roomWalls.values()) {
    for (const panels of panelsByWall.values()) panels.sort((a, b) => a.panel - b.panel);
    for (const [wall, panels] of panelsByWall) {
      for (let index = 1; index < panels.length; index++) requireBefore(panels[index - 1].step, panels[index].step);
      if (wall % 2 !== 0) continue;
      requireBefore(panelsByWall.get(wall - 1)?.at(-1)?.step, panels[0]?.step);
      requireBefore(panelsByWall.get(wall % walls + 1)?.at(-1)?.step, panels[0]?.step);
    }
  }
  for (const { id, generator } of project.sections) {
    if (!generator?.doorUnit) continue;
    const stages = byOwner.get(id);
    requireBefore(stages?.get("section"), stages?.get("fit-door"));
  }
  for (const { id, cabinetDoors } of project.sections) {
    if (!cabinetDoors) continue;
    const stage = byOwner.get(id)?.get("fit-cabinet-doors");
    for (const frameId of cabinetDoors.frameIds) requireBefore(stageByMember.get(frameId), stage);
  }
  for (const plan of project.cabinetBacking ?? []) {
    const backing = byOwner.get(plan.id)?.get("cabinet-backing");
    if (!backing) continue;
    for (const { first, second } of plan.blocks) {
      requireBefore(stageByMember.get(first), backing);
      requireBefore(stageByMember.get(second), backing);
    }
    for (const { pieceIds, wallDrywall } of project.sections) {
      if (wallDrywall?.wallId !== plan.input.wallId) continue;
      for (const id of pieceIds) requireBefore(backing, stageByMember.get(id));
    }
  }
  for (const run of project.waterRuns ?? [])
    requireBefore(byOwner.get(run.sectionId)?.get("section"), byOwner.get(run.id)?.get(waterRunStageKey));
  for (const fitting of project.waterFittings ?? []) {
    const installed = byOwner.get(fitting.id)?.get(waterFittingStageKey);
    for (const { runId } of waterFittingPorts(fitting))
      requireBefore(byOwner.get(runId)?.get(waterRunStageKey), installed);
  }

  function reviewBeforeJoining(kind: ReviewKind, planId: string, a: string, b: string) {
    const first = stageByMember.get(a), second = stageByMember.get(b);
    if (!first || !second) return;
    const jointStage = first.number >= second.number ? first : second;
    requireBefore(reviewSteps.get(reviewKey(kind, planId)), jointStage);
  }
  for (const plan of project.fastenerPlans)
    reviewBeforeJoining("wood-fastener-preparation", plan.id, plan.head.pieceId, plan.receiver.pieceId);
  for (const plan of project.connectorPlans)
    reviewBeforeJoining("connector-preparation", plan.id, plan.base.pieceId, plan.post.pieceId);
  for (const plan of project.attachmentPlans) {
    const review = reviewSteps.get(reviewKey("shelf-pin-preparation", plan.id));
    if (!review) continue;
    for (const point of plan.points)
      if (stageByMember.has(point.mount.pieceId))
        requireBefore(review, stageByMember.get(point.shelf.pieceId));
  }
  for (const plan of project.lidHingePlans) {
    const moving = stageByMember.get(plan.moving.pieceId);
    const fixed = stageByMember.get(plan.fixed.pieceId);
    const review = reviewSteps.get(reviewKey("lid-hinge-preparation", plan.id));
    if (!moving || !fixed || !review) continue;
    const movingStage = moving.step.generated, fixedStage = fixed.step.generated;
    if (movingStage?.kind === "assembly-stage" && fixedStage?.kind === "assembly-stage" &&
        movingStage.stageKey === "seat-lid-back" && fixedStage.stageKey === "shell" &&
        movingStage.planId === fixedStage.planId)
      requireBefore(fixed, review);
    requireBefore(review, moving);
  }
  const finish = reviewSteps.get(reviewKey("project-finish", project.id));
  const pressureStep = waterPressureReviewStep(project);
  const waterReview = pressureStep && numberedSteps.get(pressureStep.id);
  if (waterReview) {
    for (const run of project.waterRuns ?? [])
      requireBefore(byOwner.get(run.id)?.get(waterRunStageKey), waterReview);
    for (const fitting of project.waterFittings ?? [])
      requireBefore(byOwner.get(fitting.id)?.get(waterFittingStageKey), waterReview);
    for (const { pieceIds } of waterRoughInLinings(project)) {
      for (const id of pieceIds) {
        const stepId = activeStepsByMember.get(id);
        if (stepId) requireBefore(waterReview, numberedSteps.get(stepId));
      }
    }
    requireBefore(waterReview, finish);
    for (const stop of project.waterStops ?? []) {
      const fixture = byOwner.get(stop.id)?.get(waterStopStageKey);
      requireBefore(waterReview, fixture);
      requireBefore(fixture, finish);
    }
  }
  for (const drain of project.sinkDrains ?? [])
    requireBefore(byOwner.get(drain.id)?.get(sinkDrainStageKey), finish);
  for (const { panelId, layout } of subfloorReviews(project)) {
    const check = reviewSteps.get(reviewKey("subfloor-support-review", panelId));
    for (const id of [panelId, ...(layout?.supportIds ?? []), ...(layout?.joints.map(({ otherId }) => otherId) ?? [])])
      requireBefore(stageByMember.get(id), check);
    if (layout?.joints.length)
      for (const id of layout.supportIds) requireBefore(stageByMember.get(id), stageByMember.get(panelId));
    requireBefore(check, finish);
  }
  for (const { panelId, layout } of subfloorAdhesiveReviews(project)) {
    for (const { supportId } of layout?.runs ?? [])
      requireBefore(stageByMember.get(supportId), stageByMember.get(panelId));
  }
  for (const { panelId, groups } of subfloorFasteningReviews(project)) {
    for (const { id } of groups) requireBefore(stageByMember.get(id), stageByMember.get(panelId));
  }
  for (const { panelId, rows } of subfloorJoistReviews(project)) {
    for (const { id, supportIds } of rows) {
      for (const supportId of supportIds) requireBefore(stageByMember.get(supportId), stageByMember.get(id));
      requireBefore(stageByMember.get(id), stageByMember.get(panelId));
    }
  }
  const plateToSubfloorSteps = new Map<string, NumberedStep>();
  for (const { record, layout } of bottomPlateSealReviews(project)) {
    const seal = reviewSteps.get(reviewKey("bottom-plate-air-seal", record.id));
    if (seal) plateToSubfloorSteps.set(`${record.plateId}/${record.side}`, seal);
    requireBefore(stageByMember.get(record.plateId), seal);
    const supportIds = new Set(layout?.runs.flatMap(({ panelId }) => panelId ? [panelId] : []));
    for (const id of supportIds) {
      requireBefore(stageByMember.get(id), seal);
      requireBefore(reviewSteps.get(reviewKey("subfloor-support-review", id)), seal);
    }
    requireBefore(seal, finish);
  }
  for (const { record, layout, face } of drywallPlateSealReviews(project)) {
    const seal = reviewSteps.get(reviewKey(face === "bottom" ? "drywall-bottom-plate-air-seal" : "top-plate-air-seal", record.id));
    if (face === "bottom") requireBefore(plateToSubfloorSteps.get(`${record.plateId}/${record.side}`), seal);
    requireBefore(stageByMember.get(record.plateId), seal);
    const panels = new Set(layout?.runs.flatMap(({ panelId }) => panelId ? [panelId] : []));
    for (const id of panels) requireBefore(seal, stageByMember.get(id));
    requireBefore(seal, finish);
  }
  for (const { id, partId } of project.pipeAirSeals ?? []) {
    const seal = reviewSteps.get(reviewKey("pipe-air-seal", id));
    requireBefore(stageByMember.get(partId), seal);
    for (const { pieceIds } of pipeAirSealCoveringSections(project, partId))
      for (const coverId of pieceIds) requireBefore(seal, stageByMember.get(coverId));
    requireBefore(seal, finish);
  }
  for (const { plan, memberIds, covers } of windowFlashingSchedule(project)) {
    const [pan, exterior, interior] = windowFlashingPhaseKinds.map((kind) => reviewSteps.get(reviewKey(kind, plan.members.sill)));
    for (const id of memberIds) requireBefore(numberedSteps.get(activeStepsByMember.get(id) ?? ""), pan);
    requireBefore(pan, exterior);
    requireBefore(exterior, interior);
    for (const { pieceIds } of covers)
      for (const id of pieceIds) requireBefore(interior, numberedSteps.get(activeStepsByMember.get(id) ?? ""));
    requireBefore(interior, finish);
  }
  for (const plan of project.restraintPlans) {
    if (plan.receiver && stageByMember.has(plan.receiver.pieceId))
      requireBefore(reviewSteps.get(reviewKey("restraint-preparation", plan.id)), finish);
  }

  return [...conflicts].map(([current, prerequisites]) => ({
    current,
    prerequisites: [...prerequisites].sort((a, b) => a.number - b.number),
  })).sort((a, b) => a.current.number - b.current.number);
}

export function describeAssemblyOrder({ prerequisites }: AssemblyOrderFinding) {
  return `Review moving this step after ${prerequisites
    .map(({ step, number }) => `step ${number} (${step.title})`)
    .join(" and ")}.`;
}
