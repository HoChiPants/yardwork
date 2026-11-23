import { attachmentGeometryFingerprint } from "./attachments";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { material, type Piece, type Project, type V3 } from "./model";
import { ensurePartLabels } from "./partLabels";
import {
  sillGasketMeasurementsSchema, sillGasketPlansSchema,
  type SillGasketMeasurements, type SillGasketPlan,
} from "./sillGasketSchema";
import { sillGasketCuttingTools, sillGasketPiercingNote, sillGasketRollLength, sillGaskets } from "./sillGasketReference";
import { rotate } from "./spatial";
import { stockAxes } from "./stockAxes";
import { packRuns } from "./stockRunPacking";
import { addSupply } from "./supplies";
import { openingAxes, pieceThroughOpenings } from "./throughOpenings";

const fitTolerance = 0.001;

export function sillPlateFootprint(piece: Piece) {
  const stock = material(piece.material);
  if (piece.offcut || !stock.wood || stock.stockKind !== "linear" || piece.cutPlanes.length)
    return null;
  const { length, width, thickness } = stockAxes(piece, piece.cutStock?.size ?? piece.size);
  const direction = (axis: number) => rotate([0, 1, 2].map((i) => Number(i === axis)) as V3, piece.rotation);
  const across = direction(width), along = direction(length), up = direction(thickness);
  if (Math.abs(across[1]) > 1e-6 || Math.abs(along[1]) > 1e-6 || Math.abs(up[1]) < 1 - 1e-6)
    return null;
  return {
    length: piece.size[length], width: piece.size[width],
    bottom: piece.position[1] - piece.size[thickness] / 2,
    across, along, widthAxis: width, lengthAxis: length, boreAxis: thickness,
  };
}

function signature(piece: Piece) {
  return JSON.stringify([attachmentGeometryFingerprint(piece), piece.position, piece.rotation]);
}

export function reviewSillGasket(piece: Piece | undefined, plan: SillGasketPlan) {
  const footprint = piece && sillPlateFootprint(piece);
  const issues: string[] = [];
  if (!piece || !footprint)
    return { issues: ["The selected horizontal wood sill is unavailable."], length: null, product: undefined, outline: undefined, marks: [] };
  const { measured } = plan;
  if (plan.signature !== signature(piece))
    issues.push("The sill changed. Remeasure the support under this footprint.");
  if (Math.abs(measured.top - footprint.bottom) > fitTolerance)
    issues.push(`The seated sill underside is at ${formatPreciseInches(footprint.bottom)}. Check the entered foundation elevation.`);
  if (measured.supportLength + fitTolerance < footprint.length)
    issues.push("The measured continuous bearing length is shorter than the sill.");

  const availableWidth = measured.supportWidth - 2 * Math.abs(measured.centerOffset);
  const coversPlate = availableWidth + fitTolerance >= footprint.width;
  if (!coversPlate)
    issues.push("The measured foundation edges do not cover the full plate width.");
  const product = sillGaskets.find(({ width }) => width + fitTolerance >= footprint.width);
  if (!product) issues.push("Choose a gasket system that covers the full sill width.");
  else if (coversPlate && availableWidth + fitTolerance < product.width)
    issues.push("The full-width roll extends beyond the measured support. Review the edge detail.");
  const length = footprint.length + measured.allowance;
  if (length > sillGasketRollLength)
    issues.push("This strip exceeds one 50 ft roll. Review the joint layout.");

  const point = (along: number, across: number): V3 => [
    piece.position[0] + along * footprint.along[0] + across * footprint.across[0],
    footprint.bottom,
    piece.position[2] + along * footprint.along[2] + across * footprint.across[2],
  ];
  const half = footprint.length / 2, edge = (product?.width ?? footprint.width) / 2;
  const marks = [];
  for (const opening of pieceThroughOpenings(piece)) {
    if (!("diameter" in opening) || opening.axis !== footprint.boreAxis || opening.source) {
      issues.push("The sill has a through-cut outside the bolt-hole detail. Review how to seal that opening on site.");
      continue;
    }
    const axes = openingAxes(opening.axis);
    const along = opening.center[axes[0] === footprint.lengthAxis ? 0 : 1];
    const across = opening.center[axes[0] === footprint.widthAxis ? 0 : 1];
    const radius = opening.diameter / 2;
    if (Math.abs(along) + radius >= half - fitTolerance ||
        Math.abs(across) + radius >= footprint.width / 2 - fitTolerance) {
      issues.push("A round opening reaches the edge of the sill. Review the gasket at this opening.");
      continue;
    }
    marks.push({
      fromStart: half + along, fromEdge: edge + across, diameter: opening.diameter,
      center: point(along, across),
      ring: Array.from({ length: 33 }, (_, index) => {
        const angle = index * Math.PI * 2 / 32;
        return point(along + radius * Math.cos(angle), across + radius * Math.sin(angle));
      }),
    });
  }
  return {
    issues: [...new Set(issues)], length, product,
    outline: [point(-half, -edge), point(half, -edge), point(half, edge), point(-half, edge), point(-half, -edge)],
    marks: marks.sort((a, b) => a.fromStart - b.fromStart || a.fromEdge - b.fromEdge),
  };
}

export function saveSillGasket(project: Project, partId: string, measured: SillGasketMeasurements) {
  const piece = project.pieces.find(({ id }) => id === partId);
  if (!piece || !sillPlateFootprint(piece)) throw Error("Choose a horizontal rectangular wood sill plate.");
  const row = { partId, signature: signature(piece), measured: sillGasketMeasurementsSchema.parse(measured) };
  return { ...project, sillGaskets: sillGasketPlansSchema.parse([
    ...(project.sillGaskets ?? []).filter((plan) => plan.partId !== partId), row,
  ]) };
}

export function removeSillGasket(project: Project, partId: string): Project {
  const next = (project.sillGaskets ?? []).filter((plan) => plan.partId !== partId);
  if (next.length) return { ...project, sillGaskets: next };
  const { sillGaskets: _removed, ...rest } = project;
  return rest;
}

export function reviewSillGaskets(project: Project) {
  const plans = project.sillGaskets ?? [];
  if (!plans.length) return { rows: [], groups: [] };
  const pieces = new Map(project.pieces.map((piece) => [piece.id, piece]));
  const labels = new Map(ensurePartLabels(project).partLabels.map(({ partId, label }) => [partId, label]));
  const rows = plans.map((plan) => {
    const piece = pieces.get(plan.partId);
    const step = project.steps.findIndex(({ id }) => id === piece?.stepId) + 1;
    return {
      plan, step, title: `${labels.get(plan.partId) ?? "Part"} · ${piece?.name ?? "Removed sill"}`,
      ...reviewSillGasket(piece, plan),
    };
  });
  const groups = sillGaskets.flatMap((product) => {
    const cuts = rows.flatMap(({ title, plan, step, length, issues, product: choice }) =>
      !issues.length && length !== null && choice?.id === product.id
        ? [{ title, partId: plan.partId, step, length }] : []);
    if (!cuts.length) return [];
    const rolls = packRuns(cuts, sillGasketRollLength).bins;
    const selected = project.supplies.filter((row) => row.productId === product.id)
      .reduce((total, row) => total + row.quantity, 0);
    return [{ product, rolls, selected }];
  });
  return { rows, groups };
}

export function addMissingSillGasketRolls(project: Project) {
  return reviewSillGaskets(project).groups.reduce((next, group) => {
    const missing = group.rolls.length - group.selected;
    return missing > 0
      ? addSupply(next, group.product.id, missing, "Measured sill gasket runs", "See the sill gasket cut plan in the build guide.")
      : next;
  }, project);
}

export function sillGasketGuideLines(review: ReturnType<typeof reviewSillGaskets>) {
  return [
    ...review.rows.flatMap(({ title, step, plan, length, issues, marks }) => [[
      title,
      step ? `Before step ${step}` : "",
      `${plan.measured.substrate} · top ${formatPreciseInches(plan.measured.top)} · ${formatStockLength(plan.measured.supportLength)} continuous support · ${formatPreciseInches(plan.measured.supportWidth)} wide · center offset ${formatPreciseInches(plan.measured.centerOffset)}`,
      issues.length ? `Needs review. ${issues.join(" ")}` : `Cut ${formatStockLength(length!)} including ${formatPreciseInches(plan.measured.allowance)} for overlaps and trimming.`,
    ].filter(Boolean).join(" · "), ...(!issues.length && marks.length ? [
      `${title} · ${sillGasketPiercingNote}`,
      ...marks.map((mark, index) => `${title} · Bore ${index + 1} · ${sillGasketMarkText(mark)}`),
    ] : [])]),
    ...(review.groups.length ? [sillGasketCuttingTools] : []),
    ...review.groups.flatMap(({ product, rolls }) => rolls.map(({ runs, left }, i) =>
      `${formatPreciseInches(product.width)} gasket · Roll ${i + 1} · ${runs.map(({ title, length }) => `${title}, ${formatStockLength(length)}`).join(" · ")} · ${formatStockLength(left)} remaining.`)),
  ];
}

export function sillGasketMarkText({ fromStart, fromEdge, diameter }: {
  fromStart: number; fromEdge: number; diameter: number;
}) {
  return `${formatStockLength(fromStart)} along from Start · ${formatPreciseInches(fromEdge)} from the marked edge · wood bore Ø ${formatPreciseInches(diameter)}`;
}
