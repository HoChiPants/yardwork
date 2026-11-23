import type { Project, Section } from "./model";
import { waterRunMembers } from "./wallWater";

/** Include mounted sections and plumbing owned by the selected sections. */
export function movingSections(project: Project, selected: readonly Section[]) {
  const sections = new Set(selected.map(({ id }) => id));
  const pieceIds = new Set(selected.flatMap(({ pieceIds }) => pieceIds));
  for (const lining of project.sections) {
    const host = lining.wallDrywall?.wallId ?? lining.doorCasing?.wallId;
    if (!host || !sections.has(host)) continue;
    sections.add(lining.id);
    for (const id of lining.pieceIds) pieceIds.add(id);
  }
  for (const doors of project.sections) {
    if (!doors.cabinetDoors?.frameIds.every((id) => pieceIds.has(id))) continue;
    sections.add(doors.id);
    for (const id of doors.pieceIds) pieceIds.add(id);
  }
  const drawers = (project.motionPlans ?? []).flatMap(({ mechanism, memberIds }) => {
    if (mechanism.kind !== "slide" || !mechanism.drawerSlide) return [];
    const { cabinetLeft, cabinetRight } = mechanism.drawerSlide;
    return pieceIds.has(cabinetLeft) && pieceIds.has(cabinetRight) ? [new Set(memberIds)] : [];
  });
  if (drawers.length) {
    for (const section of project.sections) {
      if (sections.has(section.id) || section.recipe !== null || section.generator !== null) continue;
      if (!drawers.some((members) => section.pieceIds.length === members.size &&
          section.pieceIds.every((id) => members.has(id)))) continue;
      sections.add(section.id);
      for (const id of section.pieceIds) pieceIds.add(id);
    }
  }
  const runs = (project.waterRuns ?? []).filter(({ sectionId }) => sections.has(sectionId));
  const runIds = new Set(runs.map(({ id }) => id));
  for (const run of runs) for (const id of waterRunMembers(run)) pieceIds.add(id);
  for (const stop of project.waterStops ?? []) if (runIds.has(stop.port.runId)) pieceIds.add(stop.pieceId);
  return { sections, pieceIds };
}

export function motionsUsingParts(project: Project, ids: ReadonlySet<string>) {
  if (!ids.size) return [];
  return (project.motionPlans ?? []).filter(({ mechanism, memberIds }) => {
    const slide = mechanism.kind === "slide" ? mechanism.drawerSlide : undefined;
    return memberIds.some((id) => ids.has(id)) ||
      (!!slide && (ids.has(slide.cabinetLeft) || ids.has(slide.cabinetRight)));
  });
}
