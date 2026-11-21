import { inspectCutStock, setCutSourceOnHand } from "./cutStock";
import { cutSourceRegion } from "./cutSourceAxes";
import { bindingHash } from "./ideaBindingState";
import { material, part, projectSchema, uid, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels, partLabel } from "./partLabels";

export function cutPlanFingerprint(pieces: readonly Piece[]) {
  return bindingHash([...pieces].sort((a, b) => a.id.localeCompare(b.id)).map((piece) => {
    const { size, sourceSize, offset } = cutSourceRegion(piece);
    return {
      id: piece.id,
      name: piece.name,
      material: piece.material,
      size,
      sourceSize,
      offset,
      woodKerf: piece.cutStock?.woodKerf,
      offcut: piece.offcut,
      cutPlanes: piece.cutPlanes,
      roundOpenings: piece.roundOpenings,
      rectangularOpenings: piece.rectangularOpenings,
      ...(!piece.offcut ? { stockLengthAxis: piece.stockLengthAxis, sourceAxes: piece.cutStock?.sourceAxes } : {}),
    };
  }));
}

export function cutPlanCanRelease(
  plan: NonNullable<Project["plannedCutSources"]>[number],
  pieces: readonly Piece[] | undefined,
) {
  return !!pieces?.length && plan.fingerprint === cutPlanFingerprint(pieces);
}

export function untouchedPlannedCutSources(project: Project) {
  const sources = new Map<string, readonly Piece[]>();
  if (!project.plannedCutSources?.length) return sources;
  const { groups, valid } = inspectCutStock(project);
  for (const plan of project.plannedCutSources) {
    const group = groups.get(plan.sourceId);
    if (group && valid.has(plan.sourceId) && cutPlanCanRelease(plan, group))
      sources.set(plan.sourceId, group);
  }
  return sources;
}

function keepOtherCutPlans(project: Project, sourceIds: ReadonlySet<string>): Project {
  const { plannedCutSources, ...rest } = project;
  const remaining = plannedCutSources?.filter(({ sourceId }) => !sourceIds.has(sourceId));
  return {
    ...rest,
    ...(remaining?.length ? { plannedCutSources: remaining } : {}),
    guideFingerprint: null,
  };
}

export function completePlannedCutSource(project: Project, sourceId: string) {
  if (!project.plannedCutSources?.some((plan) => plan.sourceId === sourceId))
    throw Error("This stock source has no pending cut plan.");
  const owned = setCutSourceOnHand(project, sourceId, true);
  return projectSchema.parse(keepOtherCutPlans(owned, new Set([sourceId])));
}

export function releasePlannedCutSources(project: Project, sourceIds: readonly string[]) {
  const selected = new Set(sourceIds);
  const plans = (project.plannedCutSources ?? []).filter(({ sourceId }) => selected.has(sourceId));
  if (!selected.size || plans.length !== selected.size)
    throw Error("Choose a current plan for stock you have not cut.");
  const { groups, valid } = inspectCutStock(project);
  const historyIds = new Set(plans.flatMap((plan) => plan.historyIds));
  const at = new Date().toISOString();
  const restored: Piece[] = [];
  const history = plans.map((plan) => {
    const pieces = groups.get(plan.sourceId);
    if (!pieces?.length || !valid.has(plan.sourceId) || !cutPlanCanRelease(plan, pieces))
      throw Error("This planned stock has changed. Release any dependent offcut assignments before trying again.");
    const anchor = pieces.find(({ offcut }) => !offcut) ?? pieces[0];
    const owned = project.onHandCutSources?.includes(plan.sourceId);
    const stock = material(anchor.material);
    if (owned) {
      const [thickness, width, length] = cutSourceRegion(anchor).sourceSize;
      const size: V3 = [width, thickness, length];
      restored.push({
        ...part(`Offcut · Uncut ${stock.name}`.slice(0, 120), stock.id, size, [0, thickness / 2, 0], anchor.stepId, ""),
        offcut: true,
        stockLengthAxis: 2,
        cutStock: {
          id: plan.sourceId,
          sourceAxes: [1, 0, 2],
          size,
          offset: [0, 0, 0],
          ...(anchor.cutStock?.woodKerf === undefined ? {} : { woodKerf: anchor.cutStock.woodKerf }),
        },
      });
    }
    return {
      id: uid(), at, stepId: anchor.stepId,
      message: `Released uncut stock plan starting with ${partLabel(project, anchor.id)}. ${owned
        ? "The full blank is available in the Cut pool." : "The project can repack the uncut parts."}`,
    };
  });
  const next = projectSchema.parse(ensurePartLabels({
    ...keepOtherCutPlans(project, selected),
    pieces: [...project.pieces.flatMap((piece) => {
      if (!piece.cutStock || !selected.has(piece.cutStock.id)) return [piece];
      return piece.offcut ? [] : [{ ...piece, cutStock: null }];
    }), ...restored],
    history: [...project.history.filter(({ id }) => !historyIds.has(id)), ...history].slice(-5000),
  }));
  return { project: next, restored };
}
