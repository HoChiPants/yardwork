import { configuredLidTravel, lidWeightPose } from "./lidMotion";
import { motionSetup, saveMotionPlan, saveMotionTestScenario } from "./mechanismMotion";
import { motionTestNameLength, type MotionPlan } from "./motionPlanSchema";
import type { Project } from "./model";

export type SeatLidTestStart = { sectionId: string; companionSectionId?: string };

export function attachedLidMotion(project: Project, sectionId: string) {
  return project.motionPlans?.find(({ mechanism }) => mechanism.kind === "hinge" && mechanism.seatLid?.sectionId === sectionId);
}

function saveSeatLidMotion(project: Project, sectionId: string, travel: number) {
  const section = project.sections.find(({ id }) => id === sectionId);
  const closed = lidWeightPose(project, sectionId);
  const old = attachedLidMotion(project, sectionId);
  if (project.motionPlans?.some(({ id, memberIds }) => id !== old?.id && memberIds.includes(closed.piece.id)))
    throw Error("This lid already has another movement. Use that movement in a test or remove it before connecting the lid hinge.");
  return saveMotionPlan({ ...project, guideFingerprint: null }, {
    label: old?.label ?? `${section!.name} lid`,
    memberIds: [closed.piece.id],
    mechanism: {
      kind: "hinge", pivot: closed.pivot, axis: closed.axis, travel,
      seatLid: { sectionId, ...(closed.mechanism && { hingePlanId: closed.mechanism.planId }) },
    },
  }, old?.id);
}

export function saveSeatLidTest(project: Project, sectionId: string, travel: number, companionSectionId?: string) {
  const main = saveSeatLidMotion(project, sectionId, travel);
  if (!companionSectionId) return { ...main, scenario: undefined };
  if (companionSectionId === sectionId) throw Error("Choose a different second lid.");
  const existing = attachedLidMotion(project, companionSectionId);
  if (existing) motionSetup(main.project, existing);
  const companion = existing ? { project: main.project, plan: existing }
    : saveSeatLidMotion(main.project, companionSectionId, configuredLidTravel(main.project, companionSectionId));
  const suffix = companion.plan.label.replace(/ lid$/, "");
  const trial = saveMotionTestScenario(companion.project, main.plan.id,
    `Both lids · ${suffix}`.slice(0, motionTestNameLength),
    { linkedId: companion.plan.id, held: [] });
  return { ...trial, plan: trial.project.motionPlans!.find(({ id }) => id === main.plan.id)! };
}

export function removeSeatLidMotion(project: Project, plan: MotionPlan) {
  if (plan.mechanism.kind !== "hinge" || !plan.mechanism.seatLid)
    throw Error("Choose a movement linked to a storage lid.");
  return { ...project, guideFingerprint: null,
    motionPlans: project.motionPlans?.filter(({ id }) => id !== plan.id) };
}
