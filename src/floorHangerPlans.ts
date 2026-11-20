import { connectionCoverage, type ConnectionIntent } from "./connectionCoverage";
import { floorBaseConnections, type FloorBaseJoint } from "./floorBaseConnections";
import { floorHangerFasteners, floorHangers, type floorHangerProductIds } from "./floorHangerReference";
import { floorHangerPlanSchema, type FloorHangerPlan } from "./floorHangerSchema";
import type { Piece, Project, V3 } from "./model";
import { formatStockLength } from "./measurement";
import { partLabel } from "./partLabels";
import { inverseRotation, rotate } from "./spatial";

export type FloorHangerId = (typeof floorHangerProductIds)[number];
type BaseReview = ReturnType<typeof floorBaseConnections>[number];
const tolerance = 1e-6;

export function floorHangerEndKey({ rimId, joistId }: FloorHangerPlan["ends"][number]) {
  return `${rimId}/${joistId}`;
}

function coordinateAlongRim(piece: Piece, rim: Piece) {
  const offset = piece.position.map((value, axis) => value - rim.position[axis]) as V3;
  return rotate(offset, inverseRotation(rim.rotation))[0];
}

export function floorHangerFit(base: BaseReview, joint: FloorBaseJoint, productId: FloorHangerId, reach: number) {
  const { joist, rim, fullFace, room, plans } = joint;
  const specification = floorHangers[productId];
  if (!rim || !fullFace) return "Align the full joist end with its rim.";
  if (plans.some(({ state }) => state !== "stale" && state !== "conflict"))
    return "Review the fastening plan already on this pair.";
  if (Math.abs(joist.size[0] - 1.5) > tolerance ||
      Math.abs(rim.size[2] - 1.5) > tolerance ||
      !specification.depths.some((depth) => Math.abs(joist.size[1] - depth) <= tolerance))
    return `Check the member dimensions for ${specification.model}.`;
  if (room === null) return "Check cut profiles and flange backing in the field.";
  if (room + tolerance < reach) return "Measured flange reach exceeds the rim-end room.";
  const position = coordinateAlongRim(joist, rim);
  for (const neighbor of base.rows) {
    if (neighbor.rim?.id !== rim.id || neighbor.joist.id === joist.id) continue;
    const distance = Math.abs(coordinateAlongRim(neighbor.joist, rim) - position);
    const rimAxis = rotate([1, 0, 0], rim.rotation);
    const across = rotate(rimAxis, inverseRotation(neighbor.joist.rotation));
    const projectedHalf = neighbor.joist.size.reduce((extent, size, axis) => extent + size * Math.abs(across[axis]) / 2, 0);
    if (distance + tolerance < joist.size[0] / 2 + projectedHalf + reach * 2)
      return "Check clearance between adjacent joists and hangers.";
  }
  return null;
}

function reviewFloorHangerPlan(base: BaseReview | undefined, plan: FloorHangerPlan) {
  return plan.ends.map((end) => {
    const joint = base?.rows.find(({ rim, joist }) => rim?.id === end.rimId && joist.id === end.joistId);
    const issue = joint && base ? floorHangerFit(base, joint, plan.productId, plan.flangeReach) : "The saved joist or rim changed.";
    return { end, joint, issue };
  });
}

export function saveFloorHangerPlan(project: Project, sectionId: string, input: FloorHangerPlan | null) {
  if (project.retailer !== "home-depot") throw Error("Choose Home Depot for this hanger plan.");
  const section = project.sections.find(({ id }) => id === sectionId);
  if (section?.generator?.type !== "foundation") throw Error("Choose a generated floor base.");
  const plan = input && floorHangerPlanSchema.parse(input);
  if (plan) {
    const base = floorBaseConnections(project, connectionCoverage(project).intents).find(({ id }) => id === sectionId);
    const failed = reviewFloorHangerPlan(base, plan).find(({ issue }) => issue);
    if (failed?.issue) throw Error(failed.issue);
  }
  return {
    ...project,
    sections: project.sections.map((current) => {
      if (current.id !== sectionId) return current;
      if (plan) return { ...current, floorHangerPlan: plan };
      const { floorHangerPlan: _removed, ...remaining } = current;
      return remaining;
    }),
  };
}

export function floorHangerPlanReviews(project: Project, intents?: readonly ConnectionIntent[]) {
  const planned = project.sections.filter(({ floorHangerPlan }) => floorHangerPlan);
  if (!planned.length) return [];
  const bases = floorBaseConnections(project, intents ?? connectionCoverage(project).intents);
  return planned.map((section) => {
    const plan = section.floorHangerPlan!;
    return { section, plan, rows: reviewFloorHangerPlan(bases.find(({ id }) => id === section.id), plan) };
  });
}

export function floorHangerPurchases(project: Project) {
  const quantities = new Map<string, { units: number; pack: number }>();
  const include = (productId: string, units: number, pack: number) =>
    quantities.set(productId, { units: (quantities.get(productId)?.units ?? 0) + units, pack });
  for (const { plan, rows } of floorHangerPlanReviews(project)) {
    const count = rows.filter(({ issue }) => !issue).length;
    if (!count) continue;
    const hanger = floorHangers[plan.productId];
    include(plan.productId, count, 1);
    include(floorHangerFasteners.rim.id, count * hanger.rimScrews, floorHangerFasteners.rim.pack);
    include(floorHangerFasteners.joist.id, count * hanger.joistScrews, floorHangerFasteners.joist.pack);
  }
  return [...quantities].map(([productId, { units, pack }]) => ({ productId, units, required: Math.ceil(units / pack) }));
}

export function floorHangerGuideLines(project: Project, intents: readonly ConnectionIntent[]) {
  return floorHangerPlanReviews(project, intents).flatMap(({ section, plan, rows }) => {
    const hanger = floorHangers[plan.productId];
    const count = rows.filter(({ issue }) => !issue).length;
    return [
      `${section.name} · ${hanger.model} · ${count} of ${rows.length} saved ends match · measured flange reach ${formatStockLength(plan.flangeReach)}.`,
      `${count * hanger.rimScrews} SD9112 rim screws and ${count * hanger.joistScrews} SD9212 joist screws in the current estimate. Review the driver and ¼ in hex accessory.`,
      ...rows.map(({ end, issue, joint }) => {
        if (!joint) return "Saved end requires review because a member changed.";
        return `${partLabel(project, end.joistId)} to ${partLabel(project, end.rimId)} · ${issue ?? "Modeled contact and flange clearance match."}`;
      }),
    ];
  });
}
