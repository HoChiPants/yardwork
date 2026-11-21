import { reviewSubfloorAdhesive } from "./subfloorAdhesive";
import { subfloorReviews, type SubfloorReview } from "./subfloor";
import { type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionSolid, solidContainsSegment } from "./solidCollision";
import { stockAxes } from "./stockAxes";
import { subfloorNails, subfloorNailSchedules } from "./subfloorReference";
import { subfloorNailPlansSchema, type SubfloorNailPlan } from "./subfloorSchema";
import { isPressureTreated } from "./treatedWood";

export type SubfloorNailSchedule = SubfloorNailPlan["schedule"];

export function reviewSubfloorFastening(project: Project, panel: SubfloorReview, schedule: SubfloorNailSchedule) {
  const { panelId, layout } = panel;
  const nail = subfloorNailSchedules[schedule];
  const saved = project.subfloorNailPlans?.find((plan) => plan.panelId === panelId);
  const marks = layout?.nails.length ?? 0;
  const pending = { panelId, schedule, saved, marks, ready: false, current: false, signature: "",
    groups: [] as { id: string; count: number }[], problemMarks: [] as number[] };
  if (!layout || !marks) return { ...pending, problem: "Resolve the sheet’s support findings to estimate its fasteners." };

  const ids = new Set([panelId, ...layout.supportIds]);
  if (project.motionPlans?.some(({ memberIds }) => memberIds.some((id) => ids.has(id))))
    return { ...pending, problem: "The sheet or a support moves in a saved motion. Review a fixed floor assembly before fastening." };
  if (schedule === "common-8d") {
    if (layout.bearingStrips.some(({ support }) => isPressureTreated(support.material)))
      return { ...pending, problem: "Choose a compatible fastener for the treated framing. This bright common nail is for dry, untreated wood." };
    const adhesive = reviewSubfloorAdhesive(project, panel);
    if (adhesive.saved && !adhesive.planCurrent)
      return { ...pending, problem: "Review the changed adhesive plan before using the glue-nailed common-nail option." };
  }

  const members = [...new Map(layout.bearingStrips.map(({ support }) => [support.id, support])).values()]
    .map((piece) => ({ piece, solid: prepareCollisionSolid(piece) }));
  const thickness = layout.piece.size[stockAxes(layout.piece).thickness];
  const faceTop = layout.piece.position[1] + thickness / 2;
  const radius = nail.shank / 2;
  const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
  const paths = layout.nails.map(([x, , z]) => {
    const receiver = members.filter(({ solid }) => solid &&
      solid.bounds.min[0] <= x + radius && solid.bounds.max[0] >= x - radius &&
      solid.bounds.min[2] <= z + radius && solid.bounds.max[2] >= z - radius &&
      offsets.every(([dx, dz]) => {
        const entry: V3 = [x + dx, faceTop - thickness, z + dz];
        const tip: V3 = [x + dx, faceTop - nail.length, z + dz];
        return solidContainsSegment(solid, entry, tip);
      }));
    return receiver.length === 1 ? { x, z, piece: receiver[0].piece } : null;
  });
  const clear = paths.filter((row) => row !== null);
  if (clear.length !== marks) {
    const count = marks - clear.length;
    return { ...pending, problemMarks: paths.flatMap((row, index) => row ? [] : [index]),
      problem: `${count} of ${marks} marks need one unbroken wood path to the nail tip. Review thin blocking, holes or overlapping framing.` };
  }
  const grouped = new Map<string, number>();
  for (const { piece } of clear) grouped.set(piece.id, (grouped.get(piece.id) ?? 0) + 1);
  const inputs = JSON.stringify([schedule, nail, faceTop, thickness, clear.map(({ x, z, piece }) =>
    [x.toFixed(5), z.toFixed(5), piece.id, piece.material])]);
  let hash = 2166136261;
  for (let index = 0; index < inputs.length; index++)
    hash = Math.imul(hash ^ inputs.charCodeAt(index), 16777619);
  const signature = `fastening-${(hash >>> 0).toString(16)}`;
  const current = saved?.schedule === schedule && saved.signature === signature;
  const problem = saved?.schedule === schedule && !current ? "The nail paths changed. Review and save the updated fastening plan." : undefined;
  return { ...pending, ready: true, current, signature, problem,
    groups: [...grouped].map(([id, count]) => ({ id, count })) };
}

export type SubfloorFasteningReview = ReturnType<typeof reviewSubfloorFastening>;

export function subfloorFasteningReviews(project: Project) {
  const plans = project.subfloorNailPlans ?? [];
  return subfloorReviews(project, plans.map(({ panelId }) => panelId))
    .map((review, index) => reviewSubfloorFastening(project, review, plans[index].schedule));
}

export function saveSubfloorFastening(project: Project, panelId: string, plan: Omit<SubfloorNailPlan, "panelId"> | null): Project {
  const plans = (project.subfloorNailPlans ?? []).filter((row) => row.panelId !== panelId);
  if (plan) {
    const review = reviewSubfloorFastening(project, subfloorReviews(project, [panelId])[0], plan.schedule);
    if (!review.ready || review.signature !== plan.signature)
      throw Error("The nail paths changed. Review the fastening plan again before saving.");
    plans.push({ panelId, ...plan });
  }
  return { ...project, subfloorNailPlans: subfloorNailPlansSchema.parse(plans), guideFingerprint: null };
}

export function subfloorCommonNailTakeoff(project: Project, reviews = subfloorFasteningReviews(project)) {
  const common = reviews.filter(({ schedule }) => schedule === "common-8d");
  if (!common.length) return null;
  if (common.some(({ current }) => !current)) return { marks: null, required: null };
  const marks = common.reduce((sum, row) => sum + row.marks, 0);
  return { marks, required: Math.ceil(marks / subfloorNails.estimatedBoxCount) };
}

export function subfloorFasteningReport(project: Project) {
  const reviews = subfloorFasteningReviews(project);
  if (!reviews.length) return [];
  const boxes = subfloorCommonNailTakeoff(project, reviews);
  return [
    "Use the delivered panel’s approved fastening schedule. Check nail finish, framing, service locations and driving depth in the field. The recorded paths screen retained wood along each modeled nail.",
    ...reviews.flatMap(({ panelId, schedule, marks, groups, problem }) => [
      `${partLabel(project, panelId)} · ${problem ?? `${marks} × ${subfloorNailSchedules[schedule].label}`}`,
      ...(!problem ? groups.map(({ id, count }) => `${partLabel(project, id)} · ${count} nail locations`) : []),
    ]),
    ...(boxes ? [boxes.required === null ? "Review changed panels to finish the 8C1 box estimate."
      : `${boxes.marks} nails total · estimated ${boxes.required} × 1-lb ${boxes.required === 1 ? "box" : "boxes"}. Grip-Rite lists about ${subfloorNails.estimatedBoxCount} nails per box. Check the actual count.`] : []),
  ];
}
