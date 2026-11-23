import { drawerBalanceInputSchema, type DrawerBalanceInput, type DrawerBalancePlan } from "./drawerBalanceSchema";
import { bindingHash } from "./ideaBindingState";
import { motionSetup, reviewMotionPath, type MotionPreview } from "./mechanismMotion";
import { formatPreciseInches } from "./measurement";
import { projectSchema, type Piece, type Project } from "./model";

export const drawerBalanceTitle = "Drawer balance";
export const drawerBalanceReference = "https://www.cpsc.gov/FAQ/Clothing-Storage-Units";
export const drawerBalancePhysics = "https://openstax.org/books/university-physics-volume-1/pages/12-1-conditions-for-static-equilibrium";
export const drawerBalanceScope = "This estimate covers forward balance from gravity on a level, unanchored base. Review anchoring, floor conditions, interlocks, and applicable physical stability testing separately.";
const epsilon = 1e-5;

export function drawerBalanceCabinets(project: Project) {
  const drawers = (project.motionPlans ?? []).filter(({ mechanism }) => mechanism.kind === "slide" && mechanism.drawerSlide);
  return project.sections.flatMap((section) => {
    const members = new Set(section.pieceIds);
    const plans = drawers.filter(({ mechanism }) => mechanism.kind === "slide" && mechanism.drawerSlide &&
      members.has(mechanism.drawerSlide.cabinetLeft) && members.has(mechanism.drawerSlide.cabinetRight));
    return plans.length ? [{ section, plans }] : [];
  });
}

function geometryForBalance(project: Project, input: DrawerBalanceInput) {
  const cabinet = drawerBalanceCabinets(project).find(({ section }) => section.id === input.sectionId);
  if (!cabinet) throw Error("Choose a cabinet section that contains both mounts of at least one saved drawer slide.");
  const planned = new Map(cabinet.plans.map((plan) => [plan.id, plan]));
  if (planned.size !== input.drawers.length || input.drawers.some(({ motionId }) => !planned.has(motionId)))
    throw Error("Enter the loaded weight and extension of each drawer in the current cabinet.");
  const seen = new Set<string>(cabinet.section.pieceIds);
  const pieces = new Map(project.pieces.filter(({ offcut }) => !offcut).map((piece) => [piece.id, piece]));
  const rows = input.drawers.map((row) => {
    const plan = planned.get(row.motionId)!;
    const { mechanism } = motionSetup(project, plan);
    if (mechanism.kind !== "slide" || Math.abs(mechanism.axis[1]) > epsilon)
      throw Error("Use level drawer slides for this forward balance comparison.");
    if (row.extension > mechanism.travel + epsilon)
      throw Error(`${plan.label} is limited to ${formatPreciseInches(mechanism.travel)}. Enter an extension within its saved travel.`);
    const parts = plan.memberIds.map((id) => {
      const piece = pieces.get(id);
      if (!piece || seen.has(id)) throw Error("Each drawer needs its own moving parts outside the fixed cabinet section.");
      seen.add(id);
      return piece;
    });
    const { weight, extension } = row;
    return { plan, mechanism, parts, weight, extension, moment: weight * extension };
  });
  const axis = rows[0].mechanism.axis;
  if (rows.some(({ mechanism }) => mechanism.axis.some((n, i) => Math.abs(n - axis[i]) > epsilon)))
    throw Error("Choose drawers that all open toward the same cabinet front.");
  const fixed = cabinet.section.pieceIds.map((id) => pieces.get(id));
  if (fixed.some((piece) => !piece)) throw Error("Restore the fixed cabinet parts before checking drawer balance.");
  const physical = (piece: Piece | undefined) => piece && [
    piece.id, piece.material, piece.size, piece.position, piece.rotation, piece.cutPlanes,
    piece.roundOpenings, piece.rectangularOpenings,
  ];
  const geometryKey = bindingHash([
    fixed.map(physical),
    rows.map(({ plan, mechanism, parts }) => [plan.id, mechanism, parts.map(physical)]),
    project.edgeBanding?.filter(({ pieceId }) => seen.has(pieceId)),
  ]);
  return { cabinet, rows, geometryKey };
}

export function drawerBalanceText(setback: number) {
  if (Math.abs(setback) < epsilon) return "At the front support line";
  return `${formatPreciseInches(Math.abs(setback))} ${setback < 0 ? "past" : "behind"} the front support line`;
}

export function previewDrawerBalance(project: Project, raw: DrawerBalanceInput, savedKey?: string) {
  const input = drawerBalanceInputSchema.parse(raw);
  const { cabinet, rows, geometryKey } = geometryForBalance(project, input);
  if (savedKey && savedKey !== geometryKey)
    throw Error("The cabinet or drawer geometry changed. Recheck the weights, contact line and selected extensions.");
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (weight >= input.loadedWeight)
    throw Error("The loaded cabinet weight must include the fixed cabinet and all the loaded drawers.");
  const moment = rows.reduce((sum, row) => sum + row.moment, 0);
  const largest = rows.reduce((first, row) => row.moment > first.moment ? row : first);
  const closed = input.closedSetback;
  const combined = closed - moment / input.loadedWeight;
  const single = closed - largest.moment / input.loadedWeight;
  const opening = rows.filter(({ extension }) => extension > 0);
  const [first, ...others] = opening;
  const path = first && reviewMotionPath(project, first.parts, { ...first.mechanism, travel: first.extension }, {
    additionalMotions: others.map(({ parts, mechanism, extension }) => ({ parts, mechanism: { ...mechanism, travel: extension } })),
    measuredSite: true,
  });
  const limit = path?.playbackLimit(0, first.extension);
  const fraction = limit && first ? limit.travel / first.extension : 1;
  const reached = closed - moment / input.loadedWeight * fraction;
  const crossing = closed <= epsilon ? 0 : combined <= epsilon && moment > 0 ? Math.min(1, closed * input.loadedWeight / moment) : undefined;
  function previewAt(progress: number): MotionPreview | undefined {
    if (!path || !limit) return;
    const travel = first.extension * Math.min(fraction, Math.max(0, progress));
    const atLimit = progress >= fraction;
    return {
      ...path.preview(travel, atLimit ? limit.inspectAt : undefined, atLimit ? limit.siteFaceId : undefined),
      label: `${cabinet.section.name} · drawer positions`,
    };
  }
  const pose = previewAt(1);
  const where = pose ? [...pose.obstacleNames, ...pose.siteFaceNames, ...pose.outsideZoneFaces] : [];
  const travelMessage = limit?.inspectAt !== undefined
    ? `Modeled travel stops at ${Number((fraction * 100).toFixed(1))}% of the requested opening${where.length ? ` · ${where.join(", ")}` : ""}.`
    : path?.unresolvedIds.length ? "Review other modeled parts with incomplete collision geometry." : undefined;
  return { input, cabinet, rows, geometryKey, closed, single, largest, combined, reached, crossing, pose, travelMessage,
    fraction, previewAt, balanceAt: (progress: number) => closed - moment / input.loadedWeight * Math.min(fraction, Math.max(0, progress)) };
}

export function saveDrawerBalance(project: Project, report: ReturnType<typeof previewDrawerBalance>) {
  const { input, geometryKey } = report;
  previewDrawerBalance(project, input, geometryKey);
  const drawerBalancePlans: DrawerBalancePlan[] = [
    ...(project.drawerBalancePlans ?? []).filter((plan) => plan.input.sectionId !== input.sectionId),
    { input, geometryKey },
  ];
  return projectSchema.parse({ ...project, drawerBalancePlans, guideFingerprint: null });
}

export function drawerBalanceGuideLines(project: Project) {
  return (project.drawerBalancePlans ?? []).flatMap(({ input, geometryKey }) => {
    const name = project.sections.find(({ id }) => id === input.sectionId)?.name ?? "Cabinet";
    try {
      const report = previewDrawerBalance(project, input, geometryKey);
      return [
        `${name} · ${input.loadedWeight} lb loaded cabinet. All drawers closed · ${drawerBalanceText(report.closed)}.`,
        ...report.rows.map(({ plan, weight, extension }) => `${plan.label} · ${weight} lb loaded · ${formatPreciseInches(extension)} extension.`),
        `Largest individual shift · ${report.largest.plan.label} · ${drawerBalanceText(report.single)}.`,
        `At requested drawer positions · ${drawerBalanceText(report.combined)}.`,
        ...(report.travelMessage ? [report.travelMessage, `At the last checked pose · ${drawerBalanceText(report.reached)}.`] : []),
      ];
    } catch (cause) {
      return [`${name} · ${cause instanceof Error ? cause.message : "Review the saved balance estimate."}`];
    }
  });
}
