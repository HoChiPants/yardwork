import { countertopSealInput, type CountertopSealInput, type CountertopSealSpan } from "./countertopSealSchema";
import { countertopSealant } from "./countertopSealReference";
import { isDrywall } from "./drywallReference";
import { bindingHash } from "./ideaBindingState";
import { formatPreciseInches, formatStockLength } from "./measurement";
import { material, projectSchema, type Piece, type Project, type V3 } from "./model";
import { partLabel } from "./partLabels";
import { prepareCollisionBox, prepareCollisionSolid, solidOverlap, solidSegmentRanges } from "./solidCollision";
import { rotate } from "./spatial";
import { maxSupplyQuantity } from "./supplySchema";
import { trimBackerRodMinRecess, trimBackerRods } from "./trimBackerRodReference";
import type { BackerRodRun } from "./trimBackerRodOffcuts";
import type { TrimSeamMarker } from "./trimSeamGeometry";

const tolerance = 0.00001;
const sample = 0.001;
const up: V3 = [0, 1, 0];
type Axis = 0 | 1 | 2;
const unit = (i: Axis): V3 => i === 0 ? [1, 0, 0] : i === 1 ? up : [0, 0, 1];
const dot = (a: V3, b: V3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const difference = (a: V3, b: V3) => a.map((n, i) => n - b[i]) as V3;
const along = (p: V3, v: V3, d: number) => p.map((n, i) => n + v[i] * d) as V3;
const direction = (piece: Piece, axis: Axis) => rotate(unit(axis), piece.rotation);
const brief = (value: number) => Number(value.toFixed(5));
const flatStock = (piece: Piece) => {
  const stock = material(piece.material);
  return !piece.offcut && stock.stockKind === "sheet" && !stock.shape && (stock.wood || isDrywall(piece.material));
};

export const countertopOptions = (project: Project) => project.pieces.filter((piece) =>
  flatStock(piece) && material(piece.material).wood && dot(direction(piece, 1), up) > 1 - tolerance &&
  piece.size[1] < Math.min(piece.size[0], piece.size[2]));
export const countertopWallOptions = (project: Project) => project.pieces.filter((piece) => {
  const axis = piece.size.indexOf(Math.min(...piece.size)) as Axis;
  return flatStock(piece) && Math.abs(dot(direction(piece, axis), up)) < tolerance;
});

function countertopEdge(top: Piece, edge: CountertopSealInput["edge"]) {
  const depthAxis = edge.endsWith("Z") ? 2 : 0, runAxis = depthAxis === 2 ? 0 : 2;
  const axis = direction(top, runAxis);
  const outward = along([0, 0, 0], direction(top, depthAxis), edge[0] === "-" ? -1 : 1);
  const length = top.size[runAxis];
  const origin = along(along(along(top.position, up, top.size[1] / 2), outward, top.size[depthAxis] / 2), axis, -length / 2);
  const at = (offset: number, height = 0, across = 0) => along(along(along(origin, axis, offset), up, height), outward, across);
  return { depthAxis, runAxis, length, at, outward };
}

export function countertopEdgeMarker(top: Piece, edge: CountertopSealInput["edge"]): TrimSeamMarker {
  const { length, at } = countertopEdge(top, edge);
  const points: [V3, V3] = [at(0), at(length)];
  return { label: "Countertop edge start", points, segments: [{ points, open: true }] };
}

function readWidth(span: CountertopSealSpan) {
  if (span.kind === "leave-open") return undefined;
  if (span.kind === "corner") {
    if (span.width > 3 / 8) throw Error("Review a backed joint or another detail for this wider opening.");
    if (span.width > countertopSealant.cornerBead && span.coverage === undefined)
      throw Error("Enter cartridge coverage from a trial bead for a gap wider than the 3/16 in reference bead.");
    return { width: span.width, depth: 1 / 8, reach: 1 / 8, coverage: span.coverage ?? countertopSealant.cornerCoverageFeet, rod: undefined };
  }
  const rod = trimBackerRods.find(({ id }) => id === span.rodId)!;
  const depth = span.width / 2;
  if (span.width > 5 / 8 || depth < trimBackerRodMinRecess)
    throw Error("This backed detail uses the 2:1 bead shape and the rod’s 1/4 in minimum recess. Review the backing detail for this joint width.");
  if (rod.diameter <= span.width) throw Error("Choose a rod slightly larger than the widest measured opening in this run.");
  if (span.cavityDepth < depth + rod.diameter - tolerance)
    throw Error("The entered cavity is too shallow for the planned bead and the uncompressed rod envelope.");
  if (!span.dryFit) throw Error("Dry-fit the backing at the marks before saving this run.");
  return { width: span.width, depth, reach: depth + rod.diameter, coverage: span.coverage, rod };
}

function covers(solid: NonNullable<ReturnType<typeof prepareCollisionSolid>>, start: V3, end: V3) {
  let reached = 0;
  for (const [a, b] of solidSegmentRanges(solid, start, end)) {
    if (a - reached > tolerance) return false;
    reached = Math.max(reached, b);
  }
  return reached >= 1 - tolerance;
}

export function previewCountertopSeal(project: Project, input: unknown) {
  const plan = countertopSealInput.parse(input);
  const top = countertopOptions(project).find(({ id }) => id === plan.topId);
  const wall = countertopWallOptions(project).find(({ id }) => id === plan.wallId);
  if (!top || !wall) throw Error("Choose a level wood worktop and a vertical finished wall panel.");
  if (project.motionPlans?.some(({ memberIds }) => memberIds.some((id) => id === top.id || id === wall.id)))
    throw Error("Choose a fixed worktop and wall finish for this seal.");
  const topSolid = prepareCollisionSolid(top), wallSolid = prepareCollisionSolid(wall);
  if (!topSolid || !wallSolid) throw Error("Both retained surfaces need measurable geometry.");
  const thicknessAxis = wall.size.indexOf(Math.min(...wall.size)) as Axis;
  const { depthAxis, runAxis, length, at, outward } = countertopEdge(top, plan.edge);
  const wallAxis = direction(wall, thicknessAxis);
  const faceSign = dot(wallAxis, outward) > 0 ? -1 : 1;
  const normal = along([0, 0, 0], wallAxis, faceSign);
  const facing = dot(normal, outward);
  if (facing > -Math.cos(Math.PI / 12))
    throw Error("Choose a wall face nearly parallel to this worktop edge.");
  const face = along(wall.position, normal, wall.size[thicknessAxis] / 2);
  const gap = (point: V3) => dot(difference(face, point), normal) / facing;
  const wallAt = (offset: number, height: number) => {
    const point = at(offset, height);
    return along(along(point, outward, gap(point)), normal, -sample);
  };
  const sorted = [...plan.spans].sort((a, b) => a.start - b.start);
  if (sorted.some(({ start, end }, i) => end > length + tolerance || (i > 0 && start < sorted[i - 1].end - tolerance)))
    throw Error("Keep the marked runs inside the selected edge and make them non-overlapping.");
  const registered = new Set([top.id, wall.id]);
  const blockers = project.pieces.filter(({ id, offcut }) => !offcut && !registered.has(id)).map((piece) => {
    const solid = prepareCollisionSolid(piece);
    return { piece, solid: solid ?? prepareCollisionBox(piece.size, piece.position, piece.rotation) };
  });

  const rows = sorted.map((span) => {
    const { start, end } = span;
    const gapValues = [gap(at(start)), gap(at(end))];
    const min = brief(Math.min(...gapValues)), max = brief(Math.max(...gapValues));
    let issue: string | undefined;
    let spec: ReturnType<typeof readWidth>;
    try {
      spec = readWidth(span);
      if (spec) {
        if (min < -tolerance) throw Error("The modeled wall face crosses into the worktop. Fix the overlap.");
        if (max > spec.width + tolerance) throw Error("The measured opening is narrower than the modeled gap. Recheck the wall face and measurements.");
        const isCorner = span.kind === "corner";
        const backedHeights = [-sample, -spec.depth, -spec.reach / 2, -spec.reach + sample];
        const topHeights = isCorner ? [-sample] : backedHeights;
        const wallHeights = isCorner ? [sample, spec.depth] : backedHeights;
        if (topHeights.some((height) => !covers(topSolid, at(start, height, -sample), at(end, height, -sample))))
          throw Error("The modeled worktop edge is interrupted or too shallow for this detail.");
        if (wallHeights.some((height) => !covers(wallSolid, wallAt(start, height), wallAt(end, height))))
          throw Error("The finished wall face does not reach across this run. Mark the break or fit the missing surface.");
        const crossRoom = Math.max(max, spec.width, sample);
        const low = isCorner ? 0 : -spec.reach, high = isCorner ? spec.depth : sample;
        const extents: V3 = [0, high - low, 0];
        extents[runAxis] = end - start;
        extents[depthAxis] = crossRoom;
        const volume = prepareCollisionBox(extents, at((start + end) / 2, (low + high) / 2, crossRoom / 2), top.rotation);
        const hit = blockers.find(({ solid }) => solidOverlap(volume, solid, tolerance));
        if (hit) throw Error(`The bead or backing bounds meet ${partLabel(project, hit.piece.id)} · ${hit.piece.name}. Mark the covered section separately.`);
      }
    } catch (cause) {
      issue = cause instanceof Error ? cause.message : "Review the marked run.";
    }
    return { span, min, max, spec, issue,
      use: !issue && spec ? (end - start) / (12 * spec.coverage) : 0 };
  });
  const marker: TrimSeamMarker = {
    label: "Countertop seal", points: [at(0), at(length)],
    segments: rows.map(({ span, issue }) => ({
      points: [at(span.start), at(span.end)], open: span.kind === "leave-open", ...(issue ? { cover: "blocked" as const } : {}),
    })),
  };
  const plannedLength = rows.filter(({ span, issue }) => !issue && span.kind !== "leave-open")
    .reduce((sum, { span }) => sum + span.end - span.start, 0);
  const issues = rows.filter(({ issue }) => issue);
  const use = rows.reduce((sum, row) => sum + row.use, 0);
  const unmarked = Math.max(0, length - rows.reduce((sum, { span }) => sum + span.end - span.start, 0));
  const signature = bindingHash([length, top.size[1], top.material, wall.material,
    rows.map(({ span, min, max }) => [span.start, span.end, span.kind, min, max])]);
  return { plan, rows, use, length, unmarked, plannedLength, signature, marker, issues, top, wall };
}

export function saveCountertopSeal(project: Project, input: unknown) {
  const checked = previewCountertopSeal(project, input);
  if (checked.issues.length || !checked.plannedLength) throw Error("Resolve the marked runs before saving a bead estimate.");
  const { plan, signature } = checked;
  return projectSchema.parse({ ...project, guideFingerprint: null, countertopSeals: [
    ...(project.countertopSeals ?? []).filter(({ id }) => id !== plan.id), { ...plan, signature },
  ] });
}

export function reviewCountertopSeals(project: Project) {
  return (project.countertopSeals ?? []).map(({ signature, ...plan }) => {
    try {
      const preview = previewCountertopSeal(project, plan);
      if (preview.issues.length || signature !== preview.signature)
        throw Error(preview.issues[0]?.issue ?? "The modeled seam changed. Measure and review the saved marks again.");
      return { plan, preview, issue: null };
    } catch (cause) {
      return { plan, preview: null, issue: cause instanceof Error ? cause.message : "Review the saved countertop seal." };
    }
  });
}

export function countertopBackerRuns(project: Project) {
  return reviewCountertopSeals(project).flatMap(({ plan, preview }) => preview?.rows.flatMap(({ span, spec }) => {
    if (!spec?.rod || span.kind !== "backed") return [];
    const { start, end } = span;
    const title = `Countertop ${partLabel(project, plan.topId)} · ${plan.edge}`;
    const run: BackerRodRun = { start, end, length: end - start, kind: "countertop", title,
      key: JSON.stringify(["countertop", plan.id, spec.rod.id, preview.signature, span.width, span.cavityDepth, start, end]),
    };
    return [{ ...run, productId: spec.rod.id }];
  }) ?? []);
}

export function countertopSealPurchase(project: Project) {
  const rows = reviewCountertopSeals(project);
  const sessions = new Map<string, { name: string; use: number; length: number }>();
  for (const { plan, preview } of rows) {
    if (!preview) continue;
    const key = plan.session.toLowerCase();
    const row = sessions.get(key) ?? { name: plan.session, use: 0, length: 0 };
    row.use += preview.use;
    row.length += preview.plannedLength;
    sessions.set(key, row);
  }
  const batches = [...sessions.values()].map((session) => ({
    ...session, cartridges: Math.max(1, Math.ceil(session.use - 1e-10)),
  }));
  const count = batches.reduce((sum, { cartridges }) => sum + cartridges, 0);
  return {
    count: count && count <= maxSupplyQuantity ? count : null, batches,
    needsReview: rows.filter(({ issue }) => issue).length,
    selected: project.supplies.filter(({ productId }) => productId === countertopSealant.id).reduce((sum, row) => sum + row.quantity, 0),
  };
}

export function countertopSealRunText(row: ReturnType<typeof previewCountertopSeal>["rows"][number]) {
  const { span, spec, min, max, issue } = row;
  const label = `${formatStockLength(span.start)} to ${formatStockLength(span.end)}`;
  if (span.kind === "leave-open") return `${label} · Leave open for the separate detail.`;
  const modeled = `modeled gap ${formatPreciseInches(min)} to ${formatPreciseInches(max)}`;
  if (issue || !spec) return `${label} · ${modeled}. ${issue}`;
  const coverage = span.coverage === undefined ? "GE 3/16 in bead coverage" : `${span.coverage} ft per cartridge from a trial`;
  const method = spec.rod ? `dry-fit ${spec.rod.name}, with ${formatPreciseInches(spec.depth)} from the surface to the top of the rod` : "tool a corner bead";
  return `${label} · ${method} · ${modeled} · ${coverage}.`;
}

export function countertopSealGuideLines(project: Project) {
  const plans = reviewCountertopSeals(project);
  if (!plans.length) return [];
  return [
    ...plans.flatMap(({ plan, preview, issue }) => [
      `${partLabel(project, plan.topId)} · ${plan.edge} worktop edge facing ${partLabel(project, plan.wallId)} · ${plan.session}. ${issue ?? "Mark from the indicated start of the edge."}`,
      ...(preview?.rows.map(countertopSealRunText) ?? []),
      ...(preview && preview.unmarked > tolerance ? [`${formatStockLength(preview.unmarked)} along this edge remains unmarked.`] : []),
    ]),
    ...countertopSealPurchase(project).batches.map(({ name, cartridges, length }) =>
      `${name} · ${formatStockLength(length)} to seal · ${cartridges} clear kitchen-and-bath ${cartridges === 1 ? "cartridge" : "cartridges"}.`),
  ];
}
