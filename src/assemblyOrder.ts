import { assemblyOrderRules } from "./assemblyStages";
import type { Project, Step } from "./model";
import { waterRunStageKey } from "./wallWater";
import { waterFittingStageKey } from "./waterFittings";
import { waterFittingPorts } from "./waterFittingSchema";

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
  const reviewKey = (kind: ReviewKind, planId: string) => `${kind}/${planId}`;
  project.steps.forEach((step, index) => {
    const stage = step.generated;
    if (!stage) return;
    const numbered = { step, number: index + 1 };
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
