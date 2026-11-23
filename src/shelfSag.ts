import { formatPreciseInches, formatStockLength } from "./measurement";
import type { Project, V3 } from "./model";
import type { PanelBearingReview } from "./panelBearing";
import { partLabel } from "./partLabels";
import { shelfSagPlansSchema, type ShelfSagPlan } from "./shelfSagSchema";
import { inverseRotation, rotate } from "./spatial";
import { stockAxes } from "./stockAxes";

export const beamSource =
  "https://www.purdue.edu/freeform/me323/wp-content/uploads/sites/2/2023/10/ME-323-Craig-Superposition-Tables33.pdf";
export const stiffnessSource =
  "https://www.apawood.org/guides-tools-training/technical-document-library/technical-guides/panel-design-specification/";
export const shelfSagScope =
  "Compares immediate bending under evenly spread weight, treating each bay as a simple span. Review concentrated loads, long-term sag, shear, joints and support strength separately.";
const tolerance = 1e-7;
const axes = [0, 1, 2] as const;

export function shelfSagGeometry(row: PanelBearingReview) {
  const { piece } = row;
  if (
    row.role !== "shelf" ||
    row.checkedPins ||
    piece.cutPlanes?.length ||
    piece.roundOpenings?.length ||
    piece.rectangularOpenings?.length
  )
    return null;
  const stock = stockAxes(piece, piece.cutStock?.size ?? piece.size);
  const inverse = inverseRotation(piece.rotation);
  const local = (point: V3) =>
    rotate(point.map((n, i) => n - piece.position[i]) as V3, inverse);
  const inPlane = axes.filter((axis) => axis !== stock.thickness);
  for (const across of inPlane) {
    const along = inPlane.find((axis) => across !== axis)!;
    const depth = piece.size[across];
    const width = piece.size[along];
    const strips = row.contacts
      .flatMap(({ outline, area }) => {
        const points = outline.map(local);
        const low = Math.min(...points.map((p) => p[along]));
        const high = Math.max(...points.map((p) => p[along]));
        const crossesDepth =
          Math.min(...points.map((p) => p[across])) <= -depth / 2 + tolerance &&
          Math.max(...points.map((p) => p[across])) >= depth / 2 - tolerance;
        return crossesDepth &&
          Math.abs(area - (high - low) * depth) <= tolerance * Math.max(1, area)
          ? [{ low, high, center: (low + high) / 2 }]
          : [];
      })
      .sort((a, b) => a.low - b.low);
    if (
      strips.length < 2 ||
      strips.length !== row.contacts.length ||
      strips[0].low > -width / 2 + tolerance ||
      strips.at(-1)!.high < width / 2 - tolerance ||
      strips.some(
        (strip, i) => i > 0 && strip.low <= strips[i - 1].high + tolerance,
      )
    )
      continue;
    const spans = strips.slice(1).map((strip, index) => ({
      start: strips[index].center,
      end: strip.center,
      length: strip.center - strips[index].center,
      clearStart: strips[index].high,
      clearEnd: strip.low,
    }));
    const longest = spans.reduce((a, b) => (a.length >= b.length ? a : b));
    const world = (value: number) => {
      const point: V3 = [0, 0, 0];
      point[along] = value;
      point[stock.thickness] = -piece.size[stock.thickness] / 2;
      return rotate(point, piece.rotation).map(
        (n, i) => n + piece.position[i],
      ) as V3;
    };
    return {
      identity: {
        pieceId: piece.id,
        material: piece.material,
        thickness: piece.size[stock.thickness],
        spanAxis: along,
        stockLengthAxis: stock.length,
      },
      width,
      depth,
      spans,
      longest,
      line: [world(longest.start), world(longest.end)] as [V3, V3],
    };
  }
  return null;
}

export function saveShelfSagPlan(
  project: Project,
  pieceId: string,
  plan: ShelfSagPlan | null,
) {
  if (
    plan &&
    (plan.pieceId !== pieceId ||
      !project.pieces.some((piece) => !piece.offcut && piece.id === pieceId))
  )
    throw Error("Select the retained shelf before saving its sag estimate.");
  const plans = (project.shelfSagPlans ?? []).filter(
    (previous) => previous.pieceId !== pieceId,
  );
  return {
    ...project,
    shelfSagPlans: shelfSagPlansSchema.parse(plan ? [...plans, plan] : plans),
  };
}

type ShelfSagResult =
  | { reason: string }
  | {
      geometry: NonNullable<ReturnType<typeof shelfSagGeometry>>;
      deflection: number;
      targetSpan: number;
      midpointScenario: number;
      withinTarget: boolean;
    };

export function reviewShelfSag(
  row: PanelBearingReview,
  plan: ShelfSagPlan,
): ShelfSagResult {
  const geometry = shelfSagGeometry(row);
  if (!geometry)
    return {
      reason:
        "Use a rectangular shelf without holes or bevels. It needs continuous supports across its depth, flush at both ends. Shelf pins and intermittent blocks need a different model.",
    };
  const identity = geometry.identity;
  if (
    identity.thickness !== plan.thickness ||
    identity.material !== plan.material ||
    identity.spanAxis !== plan.spanAxis ||
    identity.stockLengthAxis !== plan.stockLengthAxis
  )
    return {
      reason:
        "The material, thickness or orientation changed. Confirm stiffness data for the current sheet and span direction before running the estimate.",
    };

  const loadPerInch = plan.weight / geometry.width;
  const ei = (plan.stiffness * geometry.depth) / 12;
  const span = geometry.longest.length;
  const deflection = (5 * loadPerInch * span ** 4) / (384 * ei);
  const targetSpan = ((384 * ei * plan.target) / (5 * loadPerInch)) ** 0.25;
  if (
    !Number.isFinite(deflection) ||
    !Number.isFinite(targetSpan) ||
    deflection > span / 20
  )
    return {
      reason:
        "These inputs exceed the small-deflection range used by this model. Review the load, units and material data.",
    };
  return {
    geometry,
    deflection,
    targetSpan,
    midpointScenario: deflection / 16,
    withinTarget: deflection <= plan.target + tolerance,
  };
}

export function shelfSagSummary(
  result: ReturnType<typeof reviewShelfSag>,
  target: number,
) {
  if ("reason" in result) return result.reason;
  const { geometry, deflection, targetSpan, withinTarget, midpointScenario } =
    result;
  const longest = formatStockLength(geometry.longest.length);
  const value =
    deflection < 0.00001 ? "<0.00001 in" : formatPreciseInches(deflection);
  const comparison = `Estimated immediate sag ${value} across the ${longest} longest support span. ${withinTarget ? "Within" : "Exceeds"} the ${formatPreciseInches(target)} target.`;
  return withinTarget
    ? comparison
    : `${comparison} At the same load per inch, compare support spacing of about ${formatStockLength(targetSpan)} or less. Splitting the longest bay in half gives about ${formatPreciseInches(midpointScenario)} per half in this model.`;
}

export function shelfSagGuideLines(
  project: Project,
  rows: readonly PanelBearingReview[],
) {
  const byId = new Map(rows.map((row) => [row.piece.id, row]));
  return (project.shelfSagPlans ?? []).map((plan) => {
    const row = byId.get(plan.pieceId);
    const label = row
      ? `${partLabel(project, plan.pieceId)} · ${row.piece.name}`
      : partLabel(project, plan.pieceId);
    return `${label} · ${row ? shelfSagSummary(reviewShelfSag(row, plan), plan.target) : "Reopen the shelf geometry before using the saved estimate."} Entered ${plan.weight} lb including the shelf, EI ${plan.stiffness} lbf·in² per ft, stiffness reference · ${plan.basis}.`;
  });
}
